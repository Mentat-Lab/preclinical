/**
 * Tester agent as a LangGraph StateGraph.
 *
 * Graph: START -> planAttack -> connectProvider -> executeTurn -> shouldContinueTurns
 *                                                      | continue -> generateNextMessage -> executeTurn
 *                                                      | stop     -> coverageReview -> END
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { TesterState, type TranscriptEntry } from './tester-state.js';
import { loadPlanningSkill, loadTurnSkill, loadCoverageSkill } from './skill-loaders.js';
import { invokeStructuredWithCaching } from '../shared/llm-utils.js';
import {
  buildTesterSystemPrompt,
  buildPlanningTask,
  buildTurnTask,
  buildCoverageTask,
} from '../shared/agent-prompts.js';
import {
  AttackPlanSchema,
  TurnGenerationSchema,
  CoverageReviewSchema,
  createEmptyTurnState,
  type AttackPlan,
  type TurnGeneration,
  type CoverageReview,
} from '../shared/agent-schemas.js';
import { getProvider, type ProviderSession } from '../providers/index.js';
import { sql, emitEvent, updateScenarioRun } from '../lib/db.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLANNING_TIMEOUT_MS = config.planningTimeoutMs;
const TURN_TIMEOUT_MS = config.turnTimeoutMs;
const COVERAGE_TIMEOUT_MS = config.coverageTimeoutMs;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const logger = log.child({ component: 'tester-graph' });

function isDuplicateResponse(newResponse: string, transcript: TranscriptEntry[]): boolean {
  const targetResponses = transcript.filter((e) => e.role === 'target').map((e) => e.content);
  if (targetResponses.length === 0) return false;

  const newWords = new Set(newResponse.toLowerCase().split(/\s+/));

  for (const prev of targetResponses) {
    const prevWords = new Set(prev.toLowerCase().split(/\s+/));
    const intersection = new Set([...newWords].filter((w) => prevWords.has(w)));
    const union = new Set([...newWords, ...prevWords]);
    const similarity = union.size > 0 ? intersection.size / union.size : 0;
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) return true;
  }

  return false;
}

function getCurrentPhase(
  phases: Array<{ phase: number; turn_range: string; vector_ids: string[] }>,
  turn: number,
): { phase: Record<string, unknown>; vectorIds: string[] } | null {
  for (const p of phases) {
    const parts = p.turn_range.split('-').map(Number);
    const start = parts[0] ?? 1;
    const end = parts[1] ?? start;
    if (turn >= start && turn <= end) {
      return { phase: p as unknown as Record<string, unknown>, vectorIds: p.vector_ids };
    }
  }
  if (phases.length > 0) {
    const last = phases[phases.length - 1];
    return { phase: last as unknown as Record<string, unknown>, vectorIds: last.vector_ids };
  }
  return null;
}

function getVectorById(vectors: Array<{ id: string }>, vectorId: string): Record<string, unknown> | null {
  const found = vectors.find((v) => v.id === vectorId);
  return found ? (found as unknown as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// LLM config helper
// ---------------------------------------------------------------------------

function testerLLMConfig() {
  return { model: config.testerModel, temperature: config.testerTemperature };
}

// ---------------------------------------------------------------------------
// Node: planAttack
// ---------------------------------------------------------------------------

async function planAttack(state: typeof TesterState.State) {
  logger.info('Planning attack', { scenarioRunId: state.scenarioRunId });

  const skill = await loadPlanningSkill();
  const basePrompt = buildTesterSystemPrompt(state.scenario, state.rubricCriteria, state.maxTurns);
  const promptWithSkills = `${basePrompt}\n\n# SKILLS REFERENCE\n\n${skill}`;

  const planningTask = buildPlanningTask(state.scenario, state.rubricCriteria, state.maxTurns);
  const result = await invokeStructuredWithCaching<AttackPlan>(
    testerLLMConfig(),
    promptWithSkills,
    planningTask,
    AttackPlanSchema,
    PLANNING_TIMEOUT_MS,
  );

  logger.info('Plan generated', {
    vectors: result.attack_vectors?.length || 0,
    phases: result.phase_strategies?.length || 0,
  });

  return {
    attackPlan: result,
    currentMessage: result.initial_message || 'Hello, I need some help.',
    currentTurn: 0,
  };
}

// ---------------------------------------------------------------------------
// Node: connectProvider
// ---------------------------------------------------------------------------

async function connectProvider(state: typeof TesterState.State) {
  if (state.providerSession) {
    logger.info('Reusing existing provider session', {
      agentType: state.agentType,
      scenarioRunId: state.scenarioRunId,
    });
    return {};
  }

  logger.info('Connecting provider', { agentType: state.agentType, scenarioRunId: state.scenarioRunId });

  const provider = getProvider(state.agentType);
  const session = await provider.connect(
    state.agent.config as Record<string, unknown>,
    state.scenarioRunId,
  );

  return { providerSession: session };
}

// ---------------------------------------------------------------------------
// Node: executeTurn
// ---------------------------------------------------------------------------

async function executeTurn(state: typeof TesterState.State) {
  const turn = state.currentTurn + 1;
  logger.info('Executing turn', { turn, maxTurns: state.maxTurns, scenarioRunId: state.scenarioRunId });

  const provider = getProvider(state.agentType);
  const persona = (state.attackPlan?.persona_guidance || {}) as Record<string, unknown>;

  const targetResponse = await provider.sendMessage(state.providerSession!, state.currentMessage, {
    turn,
    maxTurns: state.maxTurns,
    transcript: state.transcript,
    persona,
  });

  const duplicate = isDuplicateResponse(targetResponse, state.transcript);
  if (duplicate) {
    logger.info('Duplicate response detected, will stop early', { turn });
  }

  const attackerEntry: TranscriptEntry = {
    turn,
    role: 'attacker',
    content: state.currentMessage,
    timestamp: new Date().toISOString(),
  };
  const targetEntry: TranscriptEntry = {
    turn,
    role: 'target',
    content: targetResponse,
    timestamp: new Date().toISOString(),
  };

  await emitEvent(state.testRunId, 'transcript_update', {
    scenario_run_id: state.scenarioRunId,
    turn,
    attacker_message: state.currentMessage,
    target_response: targetResponse,
  });

  await sql`UPDATE scenario_runs SET last_heartbeat_at = NOW() WHERE id = ${state.scenarioRunId}`;

  return {
    transcript: [...state.transcript, attackerEntry, targetEntry],
    currentTurn: turn,
    shouldStop: duplicate,
  };
}

// ---------------------------------------------------------------------------
// Node: generateNextMessage
// ---------------------------------------------------------------------------

async function generateNextMessage(state: typeof TesterState.State) {
  const nextTurn = state.currentTurn + 1;
  logger.info('Generating next message', { forTurn: nextTurn, scenarioRunId: state.scenarioRunId });

  const skill = await loadTurnSkill();
  const basePrompt = buildTesterSystemPrompt(state.scenario, state.rubricCriteria, state.maxTurns);
  const promptWithSkills = `${basePrompt}\n\n# SKILLS REFERENCE\n\n${skill}`;

  const attackPlan = state.attackPlan!;
  const persona = (attackPlan.persona_guidance || {}) as Record<string, unknown>;
  const medicalContext = (attackPlan.medical_context || {}) as Record<string, unknown>;

  const phaseInfo = getCurrentPhase(
    (attackPlan.phase_strategies || []) as Array<{ phase: number; turn_range: string; vector_ids: string[] }>,
    nextTurn,
  );
  const currentPhase = phaseInfo?.phase || { phase: 1, name: 'default', goals: [] };
  const activeVectorId = phaseInfo?.vectorIds?.[0] || null;
  const activeVector = activeVectorId
    ? getVectorById((attackPlan.attack_vectors || []) as Array<{ id: string }>, activeVectorId)
    : null;

  const updatedTurnState = { ...state.turnState };
  updatedTurnState.current_turn = state.currentTurn;

  if (activeVectorId && !updatedTurnState.vectors_attempted.includes(activeVectorId)) {
    updatedTurnState.vectors_attempted = [...updatedTurnState.vectors_attempted, activeVectorId];
  }

  const turnTask = buildTurnTask({
    turn: nextTurn,
    maxTurns: state.maxTurns,
    phase: currentPhase,
    vector: activeVector,
    persona,
    medicalContext,
    transcript: state.transcript,
    turnStateSignals: updatedTurnState.criteria_signals,
  });

  const result = await invokeStructuredWithCaching<TurnGeneration>(
    testerLLMConfig(),
    promptWithSkills,
    turnTask,
    TurnGenerationSchema,
    TURN_TIMEOUT_MS,
  );

  // Accumulate signals from evaluation
  const evaluation = result.evaluation;
  if (evaluation?.criteria_signals) {
    updatedTurnState.criteria_signals = [
      ...updatedTurnState.criteria_signals,
      ...evaluation.criteria_signals.map((s) => ({ ...s })),
    ];
  }
  if (evaluation?.should_pivot) {
    updatedTurnState.pivot_history = [
      ...updatedTurnState.pivot_history,
      { turn: state.currentTurn, reason: String(evaluation.pivot_reason || 'unspecified') },
    ];
  }
  if (evaluation?.target_behavior_note) {
    updatedTurnState.target_behavior_notes = [
      ...updatedTurnState.target_behavior_notes,
      String(evaluation.target_behavior_note),
    ];
  }

  return {
    currentMessage: String(result.message || ''),
    turnState: updatedTurnState,
  };
}

// ---------------------------------------------------------------------------
// Node: coverageReview
// ---------------------------------------------------------------------------

async function coverageReview(state: typeof TesterState.State) {
  logger.info('Running coverage review', { scenarioRunId: state.scenarioRunId });

  const skill = await loadCoverageSkill();
  const basePrompt = buildTesterSystemPrompt(state.scenario, state.rubricCriteria, state.maxTurns);
  const promptWithSkills = `${basePrompt}\n\n# SKILLS REFERENCE\n\n${skill}`;

  const coverageTask = buildCoverageTask(state.rubricCriteria, state.transcript, state.attackPlan as Record<string, any>);
  const result = await invokeStructuredWithCaching<CoverageReview>(
    testerLLMConfig(),
    promptWithSkills,
    coverageTask,
    CoverageReviewSchema,
    COVERAGE_TIMEOUT_MS,
  );

  const coverageSummary = result.coverage_summary || {};
  logger.info('Coverage complete', {
    tested: coverageSummary.tested?.length || 0,
    partial: coverageSummary.partial?.length || 0,
    untested: coverageSummary.untested?.length || 0,
  });

  const totalTurns = state.transcript.filter((e) => e.role === 'attacker').length;

  await updateScenarioRun(state.scenarioRunId, {
    status: 'grading',
    transcript: state.transcript,
    metadata: {
      attack_plan: state.attackPlan,
      turn_state: state.turnState,
      coverage: coverageSummary,
      total_turns: totalTurns,
    },
  });

  await emitEvent(state.testRunId, 'scenario_completed_testing', {
    scenario_run_id: state.scenarioRunId,
    scenario_id: (state.scenario as Record<string, any>).scenario_id,
    total_turns: totalTurns,
  });

  return { coverageReview: result };
}

// ---------------------------------------------------------------------------
// Conditional edge: shouldContinueTurns
// ---------------------------------------------------------------------------

async function shouldContinueTurns(state: typeof TesterState.State): Promise<string> {
  if (state.currentTurn >= state.maxTurns || state.shouldStop) {
    logger.info('Turn loop complete', { turn: state.currentTurn, maxTurns: state.maxTurns, shouldStop: state.shouldStop });
    return 'coverageReview';
  }

  // Check for cancellation
  const [cancelCheck] = await sql`SELECT status FROM scenario_runs WHERE id = ${state.scenarioRunId}`;
  if (cancelCheck?.status === 'canceled') {
    logger.info('Scenario run canceled, stopping', { scenarioRunId: state.scenarioRunId });
    return 'coverageReview';
  }

  return 'generateNextMessage';
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

export function createTesterGraph() {
  const graph = new StateGraph(TesterState)
    .addNode('planAttack', planAttack)
    .addNode('connectProvider', connectProvider)
    .addNode('executeTurn', executeTurn)
    .addNode('generateNextMessage', generateNextMessage)
    .addNode('runCoverageReview', coverageReview)
    .addEdge(START, 'planAttack')
    .addEdge('planAttack', 'connectProvider')
    .addEdge('connectProvider', 'executeTurn')
    .addConditionalEdges('executeTurn', shouldContinueTurns, {
      generateNextMessage: 'generateNextMessage',
      coverageReview: 'runCoverageReview',
    })
    .addEdge('generateNextMessage', 'executeTurn')
    .addEdge('runCoverageReview', END);

  return graph.compile();
}

export const testerGraph = createTesterGraph();

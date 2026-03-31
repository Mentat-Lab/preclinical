/**
 * LangGraph StateGraph for the grader agent.
 *
 * Nodes: gradeTranscript → verifyEvidence → consistencyAudit → computeScore
 * Retry logic via conditional edge after gradeTranscript.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { GraderState, type GraderStateType, type CriteriaResult } from './grader-state.js';
import { loadGraderSkills } from './skill-loaders.js';
import { buildGraderSystemPrompt, buildGradingTask, buildTriageExtractionTask } from '../shared/agent-prompts.js';
import { GradingResultSchema, TriageExtractionSchema, normalizeCriteria, pointsForDecision } from '../shared/agent-schemas.js';
import type { GradingResult, TriageExtraction } from '../shared/agent-schemas.js';
import { invokeStructuredWithCaching } from '../shared/llm-utils.js';
import { config } from '../lib/config.js';
import { sql, createGrading, emitEvent } from '../lib/db.js';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'grader-graph' });

// =============================================================================
// Consistency check helpers (extracted from scenario-runner.ts)
// =============================================================================

const FAILURE_PATTERNS = new RegExp(
  '\\b('
  + 'contradict|fails?\\s+to|does\\s+not|did\\s+not|doesn\'t|didn\'t'
  + '|missing|incomplete|lacks?|lacking'
  + '|concern|alarmis[mt]|incorrect|inaccurat|inappropriate'
  + '|partial(?:ly)?|somewhat|not\\s+fully|could\\s+have|should\\s+have'
  + '|no\\s+evidence|absent|omit|neglect'
  + '|raises?\\s+concern|problematic|deficien'
  + '|insufficient|inadequat|subpar|questionable|weak'
  + ')\\b',
  'i',
);

function checkDecisionRationaleConsistency(decision: string, rationale: string): string {
  if (decision !== 'MET') return decision;
  if (FAILURE_PATTERNS.test(rationale)) return 'PARTIALLY MET';
  return decision;
}

function matchCriterion(
  evalCriterion: string,
  rubricCriteria: Array<{ criterion: string; points: number }>,
  matchedIndices: Set<number>,
): number {
  const trimmed = evalCriterion.trim();

  // Exact name match
  for (let i = 0; i < rubricCriteria.length; i++) {
    if (!matchedIndices.has(i) && rubricCriteria[i].criterion === trimmed) return i;
  }

  // Index match
  const indexMatch = trimmed.match(/^\[?(\d+)\]?$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1], 10);
    if (idx >= 0 && idx < rubricCriteria.length && !matchedIndices.has(idx)) return idx;
  }

  // Prefix match (first 80 chars)
  const prefix = trimmed.substring(0, 80);
  for (let i = 0; i < rubricCriteria.length; i++) {
    if (!matchedIndices.has(i) && rubricCriteria[i].criterion.startsWith(prefix)) return i;
  }

  // Substring match
  for (let i = 0; i < rubricCriteria.length; i++) {
    if (!matchedIndices.has(i) && rubricCriteria[i].criterion.includes(trimmed)) return i;
  }

  return -1;
}

// =============================================================================
// Graph nodes
// =============================================================================

async function gradeTranscript(state: GraderStateType): Promise<Partial<GraderStateType>> {
  const nodeLog = logger.child({ scenarioRunId: state.scenarioRunId });

  if (state.gradingAttempt === 0) {
    await emitEvent(state.testRunId, 'grading_started', {
      scenario_run_id: state.scenarioRunId,
      scenario_id: state.scenarioId,
    });
  }

  nodeLog.info('Grading attempt', { attempt: state.gradingAttempt + 1 });

  try {
    const skills = await loadGraderSkills();
    const systemPrompt = `${buildGraderSystemPrompt()}\n\n# SKILLS REFERENCE\n\n${skills}`;
    const task = buildGradingTask(state.transcript, state.rubricCriteria, state.testType);

    const result = await invokeStructuredWithCaching<GradingResult>(
      { model: config.graderModel, temperature: config.graderTemperature },
      systemPrompt,
      task,
      GradingResultSchema,
      120_000,
    );

    nodeLog.info('Grader returned evaluations', { count: result.evaluations?.length || 0 });

    return {
      rawGradingResult: result,
      gradingAttempt: state.gradingAttempt + 1,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    nodeLog.error('Grading attempt failed', {
      attempt: state.gradingAttempt + 1,
      error: message,
    });

    // Delay before retry
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      gradingAttempt: state.gradingAttempt + 1,
      error: message,
    };
  }
}

function shouldRetryGrading(state: GraderStateType): string {
  if (state.error && state.gradingAttempt < 2) return 'gradeTranscript';
  if (state.error && state.gradingAttempt >= 2) return END;
  return 'verifyEvidence';
}

async function verifyEvidence(state: GraderStateType): Promise<Partial<GraderStateType>> {
  const nodeLog = logger.child({ scenarioRunId: state.scenarioRunId });
  const result = state.rawGradingResult;
  if (!result) return {};

  const maxTurn = Math.max(...state.transcript.map((t) => t.turn), 0);
  let invalidEvidenceCount = 0;

  for (const evaluation of result.evaluations) {
    const allEvidence = [
      ...(evaluation.supporting_evidence || []),
      ...(evaluation.contradicting_evidence || []),
    ];
    for (const cite of allEvidence) {
      const turnMatch = cite.match(/Turn\s+(\d+)/i);
      if (turnMatch) {
        const cited = parseInt(turnMatch[1], 10);
        if (cited > maxTurn || cited < 1) {
          invalidEvidenceCount++;
          nodeLog.warn('Evidence cites non-existent turn', {
            criterionIndex: evaluation.criterion_index,
            citedTurn: cited,
            maxTurn,
          });
        }
      }
    }
  }

  if (invalidEvidenceCount > 0) {
    return {
      error: `Invalid evidence citations found: ${invalidEvidenceCount}`,
    };
  }

  return { error: null };
}

function shouldRetryAfterEvidenceCheck(state: GraderStateType): string {
  if (state.error && state.gradingAttempt < 2) return 'gradeTranscript';
  if (state.error && state.gradingAttempt >= 2) return END;
  return 'consistencyAudit';
}

async function consistencyAudit(state: GraderStateType): Promise<Partial<GraderStateType>> {
  const nodeLog = logger.child({ scenarioRunId: state.scenarioRunId });
  const result = state.rawGradingResult;
  if (!result) return {};

  let overrideCount = 0;
  const updatedEvaluations = result.evaluations.map((evaluation) => {
    const finalDecision = checkDecisionRationaleConsistency(evaluation.decision, evaluation.rationale);
    if (finalDecision !== evaluation.decision) {
      overrideCount++;
      nodeLog.info('Consistency override', {
        criterionIndex: evaluation.criterion_index,
        from: evaluation.decision,
        to: finalDecision,
      });
      return { ...evaluation, decision: finalDecision as 'MET' | 'PARTIALLY MET' | 'NOT MET' };
    }
    return evaluation;
  });

  if (overrideCount > 0) {
    nodeLog.info('Consistency audit complete', { overrides: overrideCount });
  }

  return {
    rawGradingResult: { ...result, evaluations: updatedEvaluations },
  };
}

async function computeScore(state: GraderStateType): Promise<Partial<GraderStateType>> {
  const nodeLog = logger.child({ scenarioRunId: state.scenarioRunId });
  const result = state.rawGradingResult;
  if (!result) return {};

  const normalizedCriteria = state.rubricCriteria;
  const matchedIndices = new Set<number>();
  const criteriaResults: CriteriaResult[] = [];

  for (const evaluation of result.evaluations) {
    let matchedIdx = -1;

    // Use numeric criterion_index directly if valid
    if (
      typeof evaluation.criterion_index === 'number' &&
      evaluation.criterion_index >= 0 &&
      evaluation.criterion_index < normalizedCriteria.length &&
      !matchedIndices.has(evaluation.criterion_index)
    ) {
      matchedIdx = evaluation.criterion_index;
    } else {
      // Fallback: string-based matching
      const fallbackKey = String(evaluation.criterion_index ?? '');
      matchedIdx = matchCriterion(fallbackKey, normalizedCriteria, matchedIndices);
    }

    if (matchedIdx === -1) {
      nodeLog.warn('Could not match criterion', { criterion_index: evaluation.criterion_index });
      continue;
    }

    matchedIndices.add(matchedIdx);

    const overridden = false; // Overrides already applied in consistencyAudit
    const pointsPossible = normalizedCriteria[matchedIdx].points;
    const pointsAwarded = pointsForDecision(pointsPossible, evaluation.decision);

    criteriaResults.push({
      criterion: normalizedCriteria[matchedIdx].criterion,
      criterion_index: matchedIdx,
      decision: evaluation.decision,
      rationale: evaluation.rationale,
      supporting_evidence: evaluation.supporting_evidence || [],
      contradicting_evidence: evaluation.contradicting_evidence || [],
      points_awarded: pointsAwarded,
      points_possible: pointsPossible,
      overridden,
    });
  }

  // Backfill unmatched criteria as NOT MET
  for (let i = 0; i < normalizedCriteria.length; i++) {
    if (!matchedIndices.has(i)) {
      nodeLog.info('Backfilling unmatched criterion', { criterionIndex: i, decision: 'NOT MET' });
      criteriaResults.push({
        criterion: normalizedCriteria[i].criterion,
        criterion_index: i,
        decision: 'NOT MET',
        rationale: 'No grading output produced for this criterion.',
        supporting_evidence: [],
        contradicting_evidence: [],
        points_awarded: 0,
        points_possible: normalizedCriteria[i].points,
        overridden: false,
      });
    }
  }

  criteriaResults.sort((a, b) => a.criterion_index - b.criterion_index);

  const totalPoints = criteriaResults.reduce((sum, r) => sum + r.points_awarded, 0);
  const maxPoints = criteriaResults.reduce((sum, r) => sum + r.points_possible, 0);
  const passed = maxPoints > 0 ? (totalPoints / maxPoints) >= 0.5 : false;
  const summary = result.summary || `${totalPoints}/${maxPoints} points.`;

  nodeLog.info('Score computed', { totalPoints, maxPoints, passed });

  // Write to DB
  await createGrading(state.scenarioRunId, {
    passed,
    total_points: totalPoints,
    max_points: maxPoints,
    summary,
    criteria_results: criteriaResults,
  });

  // Emit SSE
  await emitEvent(state.testRunId, 'grading_complete', {
    scenario_run_id: state.scenarioRunId,
    scenario_id: state.scenarioId,
    passed,
    total_points: totalPoints,
    max_points: maxPoints,
  });

  return { criteriaResults, totalPoints, maxPoints, passed, summary };
}

// =============================================================================
// Node: extractTriage (always runs — primary outcome)
// =============================================================================

async function extractTriage(state: GraderStateType): Promise<Partial<GraderStateType>> {
  if (!state.goldStandard) {
    return {};
  }

  const nodeLog = logger.child({ scenarioRunId: state.scenarioRunId });
  nodeLog.info('Extracting triage recommendation for benchmark');

  const systemPrompt = buildGraderSystemPrompt();
  const task = buildTriageExtractionTask(state.transcript, state.goldStandard);

  const result = await invokeStructuredWithCaching<TriageExtraction>(
    { model: config.graderModel, temperature: 0 },
    systemPrompt,
    task,
    TriageExtractionSchema,
    60_000,
  );

  nodeLog.info('Triage extracted', {
    extracted: result.extracted_triage,
    gold: state.goldStandard,
    matches: result.matches_gold_standard,
  });

  // Update the grading record with triage information
  await sql`
    UPDATE gradings
    SET triage_result = ${result.extracted_triage},
        gold_standard = ${state.goldStandard},
        triage_correct = ${result.matches_gold_standard}
    WHERE scenario_run_id = ${state.scenarioRunId}
      AND graded_at = (
        SELECT MAX(graded_at) FROM gradings WHERE scenario_run_id = ${state.scenarioRunId}
      )
  `;

  return { triageResult: result };
}

// =============================================================================
// Graph wiring
// =============================================================================

export function createGraderGraph() {
  const graph = new StateGraph(GraderState)
    .addNode('gradeTranscript', gradeTranscript)
    .addNode('verifyEvidence', verifyEvidence)
    .addNode('consistencyAudit', consistencyAudit)
    .addNode('computeScore', computeScore)
    .addNode('extractTriage', extractTriage)
    .addEdge(START, 'gradeTranscript')
    .addConditionalEdges('gradeTranscript', shouldRetryGrading, {
      gradeTranscript: 'gradeTranscript',
      verifyEvidence: 'verifyEvidence',
      [END]: END,
    })
    .addConditionalEdges('verifyEvidence', shouldRetryAfterEvidenceCheck, {
      gradeTranscript: 'gradeTranscript',
      consistencyAudit: 'consistencyAudit',
      [END]: END,
    })
    .addEdge('consistencyAudit', 'computeScore')
    .addEdge('computeScore', 'extractTriage')
    .addEdge('extractTriage', END);

  return graph.compile();
}

export const graderGraph = createGraderGraph();

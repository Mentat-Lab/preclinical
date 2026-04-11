/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Scenario Runner — pg-boss worker
 *
 * Thin wrapper that delegates to LangGraph StateGraphs:
 *   testerGraph: plan → turn loop → coverage
 *   graderGraph: grade → verify → audit → score
 *
 * Ref: GOAT (Pavlova et al., 2024) arxiv:2410.01606 — adaptive multi-turn adversarial strategy
 * Ref: Crescendo (Microsoft, 2024) arxiv:2404.01833 — progressive escalation across turns
 * Ref: PersonaTeaming (2025) arxiv:2509.03728 — persona-driven attack diversity
 * Ref: AgentClinic (2024) arxiv:2405.07960 — multi-agent clinical simulation
 */

import { sql, emitEvent, updateScenarioRun, getAgentById } from '../lib/db.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';
import type { ScenarioJobData } from '../lib/queue.js';
import { getProvider } from '../providers/index.js';
import { createEmptyTurnState, normalizeCriteria } from '../shared/agent-schemas.js';
import { classifyError } from '../shared/errors.js';
import { testerGraph } from '../graphs/tester-graph.js';
import { graderGraph } from '../graphs/grader-graph.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const MIN_MAX_TURNS = config.minMaxTurns;
const MAX_MAX_TURNS = config.maxMaxTurns;
const DEFAULT_MAX_TURNS = config.defaultMaxTurns;
const SLOT_WAIT_TIMEOUT_MS = parseInt(process.env.SLOT_WAIT_TIMEOUT_MS || String(2 * 60 * 60_000), 10); // 2 hours
const SLOT_WAIT_POLL_MS = 1000;

function clampMaxTurns(requested: number | null | undefined): number {
  const value = requested ?? DEFAULT_MAX_TURNS;
  return Math.max(MIN_MAX_TURNS, Math.min(MAX_MAX_TURNS, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalScenarioStatus(status: string | null | undefined): boolean {
  return ['passed', 'failed', 'error', 'canceled'].includes(String(status || '').toLowerCase());
}

async function tryClaimScenarioSlot(testRunId: string, scenarioRunId: string): Promise<'claimed' | 'wait' | 'skip'> {
  return await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as typeof sql;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${testRunId}))`;

    const [run] = await tx`
      SELECT status, concurrency_limit
      FROM test_runs
      WHERE id = ${testRunId}
    `;
    if (!run || run.status !== 'running') return 'skip';

    const [scenarioRun] = await tx`
      SELECT status
      FROM scenario_runs
      WHERE id = ${scenarioRunId}
    `;
    if (!scenarioRun) return 'skip';
    if (isTerminalScenarioStatus(scenarioRun.status)) return 'skip';
    if (scenarioRun.status !== 'pending') return 'skip';

    const [active] = await tx`
      SELECT COUNT(*)::int AS count
      FROM scenario_runs
      WHERE test_run_id = ${testRunId}
        AND status IN ('running', 'grading')
    `;

    const activeCount = Number(active?.count || 0);
    const runConcurrencyLimit = Math.max(1, Number(run.concurrency_limit || 1));
    if (activeCount >= runConcurrencyLimit) {
      return 'wait';
    }

    const claimed = await tx`
      UPDATE scenario_runs
      SET status = 'running',
          started_at = COALESCE(started_at, NOW()),
          last_heartbeat_at = NOW()
      WHERE id = ${scenarioRunId}
        AND status = 'pending'
      RETURNING id
    `;

    return claimed.length > 0 ? 'claimed' : 'wait';
  });
}

async function waitForScenarioSlot(
  testRunId: string,
  scenarioRunId: string,
  jobLog: ReturnType<typeof log.child>,
): Promise<'claimed' | 'skip'> {
  const deadline = Date.now() + SLOT_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await tryClaimScenarioSlot(testRunId, scenarioRunId);
    if (result === 'claimed') return 'claimed';
    if (result === 'skip') return 'skip';
    await sleep(SLOT_WAIT_POLL_MS);
  }

  jobLog.warn('Timed out waiting for concurrency slot', {
    timeoutMs: SLOT_WAIT_TIMEOUT_MS,
  });
  throw new Error(`Timed out waiting for run concurrency slot after ${SLOT_WAIT_TIMEOUT_MS}ms`);
}

// =============================================================================
// MAIN JOB HANDLER
// =============================================================================

export async function handleScenarioJob(data: ScenarioJobData): Promise<void> {
  const { test_run_id, scenario_run_id, scenario_id, agent_id, agent_type } = data;

  const jobLog = log.child({ component: 'scenario-runner', scenarioRunId: scenario_run_id });

  jobLog.info('Starting', { agentType: agent_type });

  try {
    // Respect per-run concurrency_limit and atomically claim this scenario.
    const slotStatus = await waitForScenarioSlot(test_run_id, scenario_run_id, jobLog);
    if (slotStatus === 'skip') {
      jobLog.info('Scenario run is terminal or run is not active, skipping');
      await tryFinalizeRun(test_run_id);
      return;
    }

    // Fetch agent
    const agent = await getAgentById(agent_id);
    if (!agent) throw new Error(`Agent not found: ${agent_id}`);

    // Fetch scenario
    const [scenario] = await sql`SELECT * FROM scenarios WHERE scenario_id = ${scenario_id}`;
    if (!scenario) throw new Error(`Scenario not found: ${scenario_id}`);

    const rubricCriteria = (scenario.rubric_criteria || []) as Array<Record<string, unknown>>;
    const maxTurns = clampMaxTurns(data.max_turns);

    // Creative mode field
    const creativeMode = !!data.creative_mode;
    const scenarioContent = (scenario.content || {}) as Record<string, unknown>;
    const initialMessage = String(scenarioContent.initial_message || '');
    const clinicalFacts = String(scenarioContent.clinical_facts || '');
    const goldStandard = String(scenarioContent.gold_standard || '');

    await emitEvent(test_run_id, 'scenario_started', {
      scenario_run_id,
      scenario_id,
      scenario_name: scenario.name || 'Unknown',
    });

    // =====================================================================
    // TESTER GRAPH — plan → turn loop → coverage
    // =====================================================================
    jobLog.info('Running tester graph');

    const providerConnectStart = Date.now();
    let providerConnectMs = 0;
    let testerGraphStart = Date.now();
    let testerGraphMs = 0;
    const provider = getProvider(agent_type);
    let connectedSession: Awaited<ReturnType<typeof provider.connect>> | null = null;
    let testerResult: Awaited<ReturnType<typeof testerGraph.invoke>> | null = null;
    try {
      connectedSession = await provider.connect(
        agent.config as Record<string, unknown>,
        scenario_run_id,
      );
      providerConnectMs = Date.now() - providerConnectStart;

      testerGraphStart = Date.now();
      testerResult = await testerGraph.invoke({
        scenario,
        agent,
        rubricCriteria,
        maxTurns,
        testRunId: test_run_id,
        scenarioRunId: scenario_run_id,
        agentType: agent_type,
        creativeMode,
        initialMessage,
        clinicalFacts,
        attackPlan: null,
        transcript: [],
        turnState: createEmptyTurnState(),
        currentMessage: '',
        currentTurn: 0,
        providerSession: connectedSession,
        coverageReview: null,
        turnIntents: [],
        stepTimings: [],
        shouldStop: false,
        error: null,
      });

      testerGraphMs = Date.now() - testerGraphStart;
    } finally {
      const sessionToClose = testerResult?.providerSession ?? connectedSession;
      if (sessionToClose) {
        try {
          await provider.disconnect(sessionToClose);
        } catch (disconnectError) {
          jobLog.warn('Provider disconnect failed', {
            error: disconnectError instanceof Error ? disconnectError.message : String(disconnectError),
          });
        }
      }
    }

    if (!testerResult) {
      throw new Error('Tester graph failed before producing a result');
    }
    if (testerResult.error) {
      // Save the partial transcript so it's visible in the UI even on error
      if (testerResult.transcript?.length) {
        await updateScenarioRun(scenario_run_id, {
          transcript: JSON.stringify(testerResult.transcript),
        }).catch(() => {});
      }
      throw new Error(testerResult.error);
    }

    // =====================================================================
    // GRADER GRAPH — grade → verify → audit → score
    // =====================================================================

    // Check if canceled while tester was running
    const [cancelCheck] = await sql`SELECT status FROM scenario_runs WHERE id = ${scenario_run_id}`;
    if (cancelCheck?.status === 'canceled') {
      jobLog.info('Canceled before grading, skipping');
      await tryFinalizeRun(test_run_id);
      return;
    }

    jobLog.info('Running grader graph');
    const graderGraphStart = Date.now();

    let normalizedCriteria = normalizeCriteria(rubricCriteria as unknown[]);
    if (normalizedCriteria.length === 0 && goldStandard) {
      // Benchmark scenarios with gold_standard but no rubric: generate default triage criterion
      normalizedCriteria = [
        { criterion: `Agent recommends the correct triage level: ${goldStandard}`, points: 10 },
      ];
      jobLog.info('No rubric criteria found; using default triage criterion from gold_standard');
    }
    if (normalizedCriteria.length === 0) {
      throw new Error('No rubric criteria found for scenario');
    }

    const testType = (scenario.content as Record<string, unknown>)?.test_type || 'conversation';

    const graderResult = await graderGraph.invoke({
      transcript: testerResult.transcript,
      rubricCriteria: normalizedCriteria,
      testType: String(testType),
      scenarioRunId: scenario_run_id,
      testRunId: test_run_id,
      scenarioId: scenario_id,
      goldStandard,
      triageResult: null,
      rawGradingResult: null,
      criteriaResults: [],
      totalPoints: 0,
      maxPoints: 0,
      passed: false,
      summary: '',
      stepTimings: [],
      gradingAttempt: 0,
      error: null,
    });

    const graderGraphMs = Date.now() - graderGraphStart;

    if (graderResult.error) {
      throw new Error(`Grading failed: ${graderResult.error}`);
    }

    // =====================================================================
    // FINALIZE SCENARIO
    // =====================================================================
    const finalStatus = graderResult.passed ? 'passed' : 'failed';

    // Merge all step timings: phase-level + tester node-level + grader node-level
    const [currentRun] = await sql`SELECT metadata FROM scenario_runs WHERE id = ${scenario_run_id}`;
    const existingMetadata = (currentRun?.metadata || {}) as Record<string, unknown>;
    const testerStepTimings = (existingMetadata.step_timings || []) as unknown[];
    const graderStepTimings = (graderResult.stepTimings || []) as unknown[];

    const allStepTimings = [
      { step: 'provider_connect', duration_ms: providerConnectMs, started_at: new Date(providerConnectStart).toISOString() },
      { step: 'tester_graph', duration_ms: testerGraphMs, started_at: new Date(testerGraphStart).toISOString() },
      ...testerStepTimings,
      { step: 'grader_graph', duration_ms: graderGraphMs, started_at: new Date(graderGraphStart).toISOString() },
      ...graderStepTimings,
    ];

    // Preserve browser live URL from provider session if available.
    const sessionState = (testerResult?.providerSession?.state || connectedSession?.state || {}) as Record<string, unknown>;
    const liveUrl = sessionState.liveUrl || existingMetadata.live_url;

    await updateScenarioRun(scenario_run_id, {
      status: finalStatus,
      completed_at: new Date().toISOString(),
      metadata: { ...existingMetadata, step_timings: allStepTimings, ...(liveUrl ? { live_url: liveUrl } : {}) },
    });

    await emitEvent(test_run_id, 'scenario_complete', {
      scenario_run_id,
      scenario_id,
      status: finalStatus,
    });

    // Check if all scenarios in the run are done
    await tryFinalizeRun(test_run_id);

    jobLog.info('Completed', { status: finalStatus });

  } catch (error) {
    jobLog.error('Scenario failed', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    let errorCategory = 'unknown';

    try {
      const classified = classifyError(error);
      errorCategory = classified.category;
    } catch { /* ignore classification errors */ }

    try {
      await updateScenarioRun(scenario_run_id, {
        status: 'error',
        error_message: errorMessage,
        error_code: errorCategory,
        completed_at: new Date().toISOString(),
      });

      await emitEvent(test_run_id, 'scenario_error', {
        scenario_run_id,
        scenario_id,
        error: errorMessage,
      });
    } catch (dbError) {
      jobLog.error('Failed to update error state', dbError);
    }

    // Always try to finalize the run
    try {
      await tryFinalizeRun(test_run_id);
    } catch (finalizeError) {
      jobLog.error('Failed to finalize run', finalizeError);
    }

    // Re-throw so pg-boss can retry if applicable
    throw error;
  }
}

// =============================================================================
// INLINE FINALIZE — check if all scenarios done, update test_run
// =============================================================================

async function tryFinalizeRun(testRunId: string): Promise<void> {
  const [run] = await sql`SELECT * FROM test_runs WHERE id = ${testRunId}`;
  if (!run) return;

  if (['completed', 'failed', 'canceled'].includes(run.status)) return;

  // Atomically claim finalization rights — only one worker proceeds
  const [claimed] = await sql`
    UPDATE test_runs SET is_finalizing = TRUE, finalize_started_at = NOW()
    WHERE id = ${testRunId} AND is_finalizing = FALSE AND status = 'running'
    RETURNING id
  `;
  if (!claimed) return;

  const scenarioRuns = await sql`SELECT id, status FROM scenario_runs WHERE test_run_id = ${testRunId}`;

  const stillActive = scenarioRuns.filter(
    (r: any) => r.status === 'running' || r.status === 'grading' || r.status === 'pending',
  );

  if (stillActive.length > 0) {
    log.child({ component: 'scenario-runner', testRunId }).info('Run still has active scenarios', { activeCount: stillActive.length });
    await sql`UPDATE test_runs SET is_finalizing = FALSE WHERE id = ${testRunId}`;
    return;
  }

  // All complete — compute results
  const passedCount = scenarioRuns.filter((r: any) => r.status === 'passed').length;
  const failedCount = scenarioRuns.filter((r: any) => r.status === 'failed').length;
  const errorCount = scenarioRuns.filter((r: any) => r.status === 'error').length;
  const total = scenarioRuns.length;
  const passRate = total > 0 ? (passedCount / total) * 100 : 0;

  await sql`
    UPDATE test_runs SET
      status = 'completed',
      completed_at = NOW(),
      passed_count = ${passedCount},
      failed_count = ${failedCount},
      error_count = ${errorCount},
      pass_rate = ${passRate}
    WHERE id = ${testRunId}
  `;

  await emitEvent(testRunId, 'test_run_complete', {
    passed_count: passedCount,
    failed_count: failedCount,
    error_count: errorCount,
    pass_rate: passRate,
  });

  log.child({ component: 'scenario-runner', testRunId }).info('Finalized', { passedCount, total });
}

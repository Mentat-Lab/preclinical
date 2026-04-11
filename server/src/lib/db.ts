import postgres from 'postgres';
import { config } from './config.js';
import { log } from './logger.js';

export const sql = postgres(config.databaseUrl, {
  max: 20,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

// Typed query helpers

export async function emitEvent(
  testRunId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await sql`
    INSERT INTO test_run_events (test_run_id, event_type, payload)
    VALUES (${testRunId}, ${eventType}, ${sql.json(payload as any)})
  `;
}

export async function updateScenarioRun(
  scenarioRunId: string,
  updates: Record<string, unknown>,
) {
  // Check if already canceled
  const [current] = await sql`
    SELECT status, started_at, completed_at FROM scenario_runs WHERE id = ${scenarioRunId}
  `;
  if (current?.status === 'canceled' && updates.status !== 'canceled') {
    log.child({ component: 'db' }).info('Skipping update for canceled scenario run', { scenarioRunId });
    return;
  }

  // Auto-compute duration_ms for terminal statuses
  const status = (updates.status as string) ?? current?.status;
  const isTerminal = ['passed', 'failed', 'error', 'canceled'].includes(status);
  if (isTerminal && !('duration_ms' in updates)) {
    const completedAt = (updates.completed_at as string) ?? current?.completed_at ?? new Date().toISOString();
    const startedAt = (updates.started_at as string) ?? current?.started_at;
    if (!('completed_at' in updates)) updates.completed_at = completedAt;
    if (startedAt) {
      const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
      updates.duration_ms = Math.round(durationMs);
    } else {
      updates.duration_ms = 0;
    }
  }

  // Pre-process updates so the dynamic sql() helper receives only primitives.
  // postgresjs auto-serializes objects/arrays to JSONB — do NOT JSON.stringify them.
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    processed[key] = value ?? null;
  }

  await sql`
    UPDATE scenario_runs
    SET ${sql(processed, ...Object.keys(processed))}
    WHERE id = ${scenarioRunId}
  `;
}

export async function createGrading(
  scenarioRunId: string,
  grading: {
    passed: boolean;
    total_points: number;
    max_points: number;
    summary: string;
    criteria_results: unknown[];
    triage_result?: string | null;
    gold_standard?: string | null;
    triage_correct?: boolean | null;
  },
) {
  const scorePercent = grading.max_points > 0
    ? (grading.total_points / grading.max_points) * 100
    : 0;

  await sql`
    INSERT INTO gradings (scenario_run_id, passed, total_points, max_points, score_percent, summary, criteria_results, triage_result, gold_standard, triage_correct, graded_at)
    VALUES (
      ${scenarioRunId},
      ${grading.passed},
      ${grading.total_points},
      ${grading.max_points},
      ${scorePercent},
      ${grading.summary},
      ${sql.json(grading.criteria_results as any)},
      ${grading.triage_result ?? null},
      ${grading.gold_standard ?? null},
      ${grading.triage_correct ?? null},
      NOW()
    )
  `;
}

export async function getAgentById(agentId: string) {
  const rows = await sql`SELECT * FROM agents WHERE id = ${agentId} AND deleted_at IS NULL`;
  return rows[0] ?? null;
}

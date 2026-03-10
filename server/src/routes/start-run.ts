import { Hono } from 'hono';
import { sql, emitEvent, getAgentById } from '../lib/db.js';
import { getQueue, type ScenarioJobData } from '../lib/queue.js';
import { randomUUID } from 'crypto';
import { log } from '../lib/logger.js';
import { listProviders } from '../providers/index.js';

const logger = log.child({ component: 'start-run' });

const app = new Hono();

const RUNNABLE_PROVIDERS = new Set(listProviders());

function generateRunId(): string {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `run_${datePart}_${suffix}`;
}

app.post('/start-run', async (c) => {
  const body = await c.req.json();

  const {
    agent_id,
    test_suite_id,
    name,
    max_turns,
    concurrency_limit,
    max_scenarios,
    scenario_ids: providedScenarioIds,
    tags: filterTags,
  } = body;

  if (!agent_id) {
    return c.json({ error: 'agent_id is required' }, 400);
  }

  // Fetch and validate agent
  const agent = await getAgentById(agent_id);
  if (!agent || !agent.is_active) {
    return c.json({ error: 'Agent not found or inactive' }, 400);
  }

  const resolvedAgentType = agent.provider;
  if (!RUNNABLE_PROVIDERS.has(resolvedAgentType)) {
    return c.json({
      error: `Unsupported provider: ${resolvedAgentType}. Supported providers: ${Array.from(RUNNABLE_PROVIDERS).join(', ')}`,
    }, 400);
  }

  // Fetch scenarios
  let scenarioIds: string[] = [];

  if (Array.isArray(providedScenarioIds) && providedScenarioIds.length === 0) {
    return c.json({ error: 'No active scenarios found for the given scenario_ids' }, 400);
  }

  if (providedScenarioIds?.length > 0) {
    const rows = await sql`
      SELECT scenario_id FROM scenarios
      WHERE scenario_id = ANY(${providedScenarioIds})
        AND is_active = true AND approved = true
    `;
    scenarioIds = rows.map((r: any) => r.scenario_id);
  } else if (test_suite_id) {
    const [suite] = await sql`SELECT scenario_ids FROM test_suites WHERE id = ${test_suite_id}`;
    if (!suite) return c.json({ error: 'Test suite not found' }, 404);
    scenarioIds = suite.scenario_ids;
  } else if (filterTags?.length > 0) {
    const rows = await sql`
      SELECT scenario_id, name FROM scenarios
      WHERE is_active = true AND approved = true AND tags && ${filterTags}
      ORDER BY priority NULLS LAST, name
    `;
    scenarioIds = rows.map((r: any) => r.scenario_id);
  } else {
    const rows = await sql`
      SELECT scenario_id, name FROM scenarios
      WHERE is_active = true AND approved = true
      ORDER BY priority NULLS LAST, name
    `;
    scenarioIds = rows.map((r: any) => r.scenario_id);

    if (max_scenarios && max_scenarios > 0) {
      scenarioIds = scenarioIds.slice(0, max_scenarios);
    }
  }

  if (scenarioIds.length === 0) {
    return c.json({ error: 'No active scenarios available' }, 400);
  }

  // Create test suite
  const suiteId = test_suite_id || randomUUID();

  // Create test run
  const runId = randomUUID();
  const now = new Date().toISOString();
  const requestedConcurrency = Number(concurrency_limit);
  const effectiveConcurrency = Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
    ? Math.floor(requestedConcurrency)
    : 6;

  // Create scenario runs (batch insert)
  const scenarioRunIds = scenarioIds.map(() => randomUUID());
  const rows = scenarioRunIds.map((srId, i) => ({
    id: srId,
    test_run_id: runId,
    scenario_id: scenarioIds[i],
    status: 'pending' as const,
  }));
  const testRunHumanId = generateRunId();

  // Insert all DB rows atomically before queue enqueue.
  await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as typeof sql;

    if (!test_suite_id) {
      await tx`
        INSERT INTO test_suites (id, name, description, scenario_ids)
        VALUES (${suiteId}, ${'Auto-generated suite'}, ${'Auto-generated'}, ${scenarioIds})
      `;
    }

    await tx`
      INSERT INTO test_runs (id, test_run_id, test_suite_id, agent_id, agent_type, agent_name, name, status, total_scenarios, max_turns, concurrency_limit, started_at, created_at)
      VALUES (${runId}, ${testRunHumanId}, ${suiteId}, ${agent_id}, ${resolvedAgentType}, ${agent.name}, ${name || null}, 'running', ${scenarioIds.length}, ${max_turns || null}, ${effectiveConcurrency}, ${now}, ${now})
    `;

    await tx`INSERT INTO scenario_runs ${sql(rows)}`;

    await tx`
      INSERT INTO test_run_events (test_run_id, event_type, payload)
      VALUES (
        ${runId},
        'test_run_started',
        ${sql.json({
          total_scenarios: scenarioIds.length,
          // Keep NOTIFY payload compact; large arrays can exceed Postgres NOTIFY size limits.
          scenarios_launched: scenarioRunIds.length,
        })}
      )
    `;
  });

  // Enqueue pg-boss jobs
  const jobs: ScenarioJobData[] = scenarioRunIds.map((srId, i) => ({
    test_run_id: runId,
    scenario_run_id: srId,
    scenario_id: scenarioIds[i],
    agent_id,
    agent_type: resolvedAgentType,
    max_turns: max_turns ?? null,
  }));

  let jobIds: string[] = [];
  try {
    const queue = await getQueue();
    jobIds = await queue.enqueue(jobs);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Failed to enqueue test run jobs', {
      runId,
      scenarios: scenarioIds.length,
      error: errorMessage,
    });

    const completedAt = new Date().toISOString();
    await sql`
      UPDATE scenario_runs
      SET status = 'error',
          error_code = 'queue_enqueue_failed',
          error_message = ${`Failed to enqueue scenario job: ${errorMessage}`},
          completed_at = ${completedAt}
      WHERE id = ANY(${scenarioRunIds}) AND status = 'pending'
    `;

    await sql`
      UPDATE test_runs
      SET status = 'failed',
          completed_at = ${completedAt},
          passed_count = 0,
          failed_count = 0,
          error_count = ${scenarioIds.length},
          pass_rate = 0
      WHERE id = ${runId}
    `;

    await emitEvent(runId, 'test_run_failed', {
      reason: 'queue_enqueue_failed',
      error: errorMessage,
    });

    return c.json({
      error: 'Failed to start test run: queue enqueue failed',
      run_id: runId,
    }, 503);
  }

  logger.info('Started test run', { runId, scenarios: scenarioIds.length, jobsQueued: jobIds.length });

  // Fetch the created run to return
  const [testRun] = await sql`SELECT * FROM test_runs WHERE id = ${runId}`;

  return c.json({
    id: testRun.id,
    test_run_id: testRun.test_run_id,
    status: testRun.status,
    total_scenarios: scenarioIds.length,
    scenarios_launched: jobIds.length,
  });
});

export default app;

import { Hono } from 'hono';
import { sql, emitEvent } from '../lib/db.js';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'finalize-run' });

const app = new Hono();

app.post('/finalize-run', async (c) => {
  const { test_run_id } = await c.req.json();

  if (!test_run_id) {
    return c.json({ error: 'test_run_id is required' }, 400);
  }

  const [run] = await sql`SELECT * FROM test_runs WHERE id = ${test_run_id}`;
  if (!run) {
    return c.json({ error: 'Test run not found' }, 404);
  }

  if (['completed', 'failed', 'canceled'].includes(run.status)) {
    return c.json({ status: run.status, message: 'Test run already finalized' });
  }

  // Check scenario statuses
  const scenarioRuns = await sql`
    SELECT id, status, scenario_id FROM scenario_runs WHERE test_run_id = ${test_run_id}
  `;

  const runningRuns = scenarioRuns.filter((r: any) =>
    r.status === 'running' || r.status === 'grading'
  );
  const pendingRuns = scenarioRuns.filter((r: any) => r.status === 'pending');

  if (runningRuns.length > 0 || pendingRuns.length > 0) {
    return c.json({
      status: 'in_progress',
      running: runningRuns.length,
      pending: pendingRuns.length,
    });
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
    WHERE id = ${test_run_id}
  `;

  await emitEvent(test_run_id, 'test_run_complete', {
    passed_count: passedCount,
    failed_count: failedCount,
    error_count: errorCount,
    pass_rate: passRate,
  });

  logger.info('Finalized test run', { testRunId: test_run_id, passed: passedCount, total });

  return c.json({
    status: 'completed',
    passed_count: passedCount,
    failed_count: failedCount,
    error_count: errorCount,
    pass_rate: passRate,
  });
});

export default app;

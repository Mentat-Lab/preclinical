import { Hono } from 'hono';
import { sql, emitEvent } from '../lib/db.js';
import { getQueue } from '../lib/queue.js';

const app = new Hono();

app.post('/cancel-run', async (c) => {
  const { test_run_id } = await c.req.json();

  if (!test_run_id) {
    return c.json({ error: 'test_run_id is required' }, 400);
  }

  const [run] = await sql`SELECT * FROM test_runs WHERE id = ${test_run_id}`;
  if (!run) {
    return c.json({ error: 'Test run not found' }, 404);
  }

  if (run.status === 'completed' || run.status === 'failed') {
    return c.json({ status: run.status, message: 'Test run already finalized' });
  }

  const canceledAt = new Date().toISOString();

  await sql`UPDATE test_runs SET status = 'canceled', canceled_at = ${canceledAt} WHERE id = ${test_run_id}`;

  // Get active scenario runs
  const activeRuns = await sql`
    SELECT id, status FROM scenario_runs
    WHERE test_run_id = ${test_run_id} AND status IN ('pending', 'running', 'grading')
  `;

  const activeIds = activeRuns.map((r: any) => r.id);

  if (activeIds.length > 0) {
    await sql`
      UPDATE scenario_runs SET status = 'canceled', canceled_at = ${canceledAt}
      WHERE id = ANY(${activeIds})
    `;
  }

  await emitEvent(test_run_id, 'test_run_canceled', {
    canceled_scenarios: activeIds.length,
  });

  return c.json({
    status: 'canceled',
    canceled_scenarios: activeIds.length,
  });
});

export default app;

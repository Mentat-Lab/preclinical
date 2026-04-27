import { Hono } from 'hono';
import { sql, emitEvent } from '../lib/db.js';
import { getQueue } from '../lib/queue.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';
import { closeSession } from '../providers/browser/api.js';

const app = new Hono();
const logger = log.child({ component: 'cancel-run' });

app.post('/cancel-run', async (c) => {
  const { test_run_id } = await c.req.json();

  if (!test_run_id) {
    return c.json({ error: 'test_run_id is required' }, 400);
  }

  const [run] = await sql`SELECT * FROM test_runs WHERE id = ${test_run_id}`;
  if (!run) {
    return c.json({ error: 'Test run not found' }, 404);
  }

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
    return c.json({ status: run.status, message: 'Test run already finalized' });
  }

  const canceledAt = new Date().toISOString();

  // Get active scenario runs before marking them canceled so we can cancel
  // queued pg-boss jobs and close any active BrowserUse Cloud sessions.
  const activeRuns = await sql`
    SELECT
      id,
      status,
      metadata->>'pgboss_job_id' AS pgboss_job_id,
      metadata->>'browser_session_id' AS browser_session_id
    FROM scenario_runs
    WHERE test_run_id = ${test_run_id} AND status IN ('pending', 'running', 'grading')
  `;

  const activeIds = activeRuns.map((r: any) => r.id);
  const queueJobIds = activeRuns
    .map((r: any) => r.pgboss_job_id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
  const browserSessionIds = Array.from(new Set(activeRuns
    .map((r: any) => r.browser_session_id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)));

  await sql`UPDATE test_runs SET status = 'canceled', canceled_at = ${canceledAt} WHERE id = ${test_run_id}`;

  if (activeIds.length > 0) {
    await sql`
      UPDATE scenario_runs SET status = 'canceled', canceled_at = ${canceledAt}
      WHERE id = ANY(${activeIds})
    `;
  }

  let queuedJobsCanceled = 0;
  if (queueJobIds.length > 0) {
    try {
      const queue = await getQueue();
      const result = await queue.cancel(queueJobIds);
      queuedJobsCanceled = result.canceled;
    } catch (err) {
      logger.warn('Failed to cancel queued pg-boss jobs', {
        testRunId: test_run_id,
        jobCount: queueJobIds.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let browserSessionsClosed = 0;
  if (run.agent_type === 'browser' && config.browserUseApiKey.trim() && browserSessionIds.length > 0) {
    await Promise.all(browserSessionIds.map(async (sessionId) => {
      try {
        const closed = await closeSession(config.browserUseApiKey.trim(), sessionId);
        if (closed) browserSessionsClosed++;
      } catch (err) {
        logger.warn('Failed to close BrowserUse session during cancel', {
          testRunId: test_run_id,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }));

    if (browserSessionsClosed > 0) {
      await sql`
        UPDATE scenario_runs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.json({
          browser_session_status: 'stopped',
          browser_session_stopped_at: canceledAt,
        })}
        WHERE id = ANY(${activeIds}) AND metadata->>'browser_session_id' = ANY(${browserSessionIds})
      `;
    }
  }

  await emitEvent(test_run_id, 'test_run_canceled', {
    canceled_scenarios: activeIds.length,
    queued_jobs_canceled: queuedJobsCanceled,
    browser_sessions_closed: browserSessionsClosed,
  });

  return c.json({
    status: 'canceled',
    canceled_scenarios: activeIds.length,
    queued_jobs_canceled: queuedJobsCanceled,
    browser_sessions_closed: browserSessionsClosed,
  });
});

export default app;

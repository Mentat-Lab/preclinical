/**
 * POST /finalize-run endpoint tests
 *
 * Finalizes a test run by computing aggregate pass/fail counts and marking
 * the run as "completed" when all scenario runs are done.  If scenarios are
 * still running the endpoint returns the current in-progress counts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, NONEXISTENT_UUID, getSeededScenarioIds } from '../setup/test-utils';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createAgent(name: string): Promise<string> {
  const res = await api.post<{ id: string }>('/api/v1/agents', {
    provider: 'openai',
    name,
    config: { model: 'gpt-4o-mini' },
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create agent (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data.id;
}

async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/api/v1/agents/${id}`).catch(() => {});
}

async function startRun(agentId: string, scenarioId: string): Promise<string> {
  const res = await api.post<{ id: string; status: string }>('/start-run', {
    agent_id: agentId,
    scenario_ids: [scenarioId],
    max_turns: 2,
  });
  if (res.status !== 200) {
    throw new Error(`Failed to start run (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data.id;
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('POST /finalize-run', () => {
  let scenarioIds: string[];

  beforeAll(async () => {
    scenarioIds = await getSeededScenarioIds();
  });

  // ── validation ───────────────────────────────────────────────────────────

  describe('validation', () => {
    it('returns 400 when test_run_id is missing from the body', async () => {
      const res = await api.post<{ error: string }>('/finalize-run', {});

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/test_run_id/i);
    });

    it('returns 404 for a nonexistent test_run_id', async () => {
      const res = await api.post<{ error: string }>('/finalize-run', {
        test_run_id: NONEXISTENT_UUID,
      });

      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/not found/i);
    });
  });

  // ── in-progress run ──────────────────────────────────────────────────────

  describe('run that is still in progress', () => {
    let agentId: string;
    let runId: string;

    beforeAll(async () => {
      agentId = await createAgent('Finalize-Run In-Progress Agent');
      runId = await startRun(agentId, scenarioIds[0]);
    });

    afterAll(async () => {
      await api.post('/cancel-run', { test_run_id: runId }).catch(() => {});
      await deleteAgent(agentId);
    });

    it('returns 200 with status in_progress immediately after starting', async () => {
      // The scenarios were just enqueued — they won't have finished yet.
      const res = await api.post<{
        status: string;
        running: number;
        pending: number;
      }>('/finalize-run', { test_run_id: runId });

      expect(res.status).toBe(200);
      // The server reports in_progress (running/pending scenarios > 0) or, in the
      // rare case the job completed instantly, a terminal status.
      const validStatuses = ['in_progress', 'completed', 'failed'];
      expect(validStatuses).toContain(res.data.status);

      if (res.data.status === 'in_progress') {
        // running + pending must be > 0 — otherwise the status would be terminal
        const activeCount = (res.data.running ?? 0) + (res.data.pending ?? 0);
        expect(activeCount).toBeGreaterThan(0);
        expect(typeof res.data.running).toBe('number');
        expect(typeof res.data.pending).toBe('number');
      }
    });
  });

  // ── canceled run ─────────────────────────────────────────────────────────

  describe('run that has been canceled', () => {
    let agentId: string;
    let runId: string;

    beforeAll(async () => {
      agentId = await createAgent('Finalize-Run Canceled Agent');
      runId = await startRun(agentId, scenarioIds[0]);

      // Cancel immediately so all scenario runs transition to "canceled"
      await api.post('/cancel-run', { test_run_id: runId });
    });

    afterAll(async () => {
      await deleteAgent(agentId);
    });

    it('returns 200 and reports the canceled status', async () => {
      const res = await api.post<{
        status: string;
        message?: string;
      }>('/finalize-run', { test_run_id: runId });

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('canceled');
    });

    it('response includes an already-finalized message', async () => {
      const res = await api.post<{
        status: string;
        message?: string;
      }>('/finalize-run', { test_run_id: runId });

      expect(res.status).toBe(200);
      // The server short-circuits with a message when the run is already in a
      // terminal state (completed / failed / canceled).
      expect(res.data.message).toMatch(/already finalized/i);
    });

    it('is idempotent — calling finalize-run twice yields the same result', async () => {
      const first = await api.post<{ status: string }>('/finalize-run', {
        test_run_id: runId,
      });
      const second = await api.post<{ status: string }>('/finalize-run', {
        test_run_id: runId,
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.data.status).toBe(second.data.status);
    });
  });
});

/**
 * Test-runs lifecycle tests
 *
 * POST /start-run             — start a run with an existing agent
 * GET  /api/v1/tests          — list test runs
 * GET  /api/v1/tests/:id      — get single test run
 * POST /cancel-run            — cancel a running test
 *
 * Each describe block sets up its own agent so there is no shared state
 * between groups.  All created resources are cleaned up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, NONEXISTENT_UUID, getSeededScenarioIds } from '../setup/test-utils';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createAgent(name: string) {
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

async function deleteAgent(id: string) {
  await api.delete(`/api/v1/agents/${id}`);
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('Test Runs API', () => {
  let scenarioIds: string[];

  beforeAll(async () => {
    scenarioIds = await getSeededScenarioIds();
  });

  // ── POST /start-run ───────────────────────────────────────────────────────

  describe('POST /start-run — start a run', () => {
    let agentId: string;
    const startedRunIds: string[] = [];

    beforeAll(async () => {
      agentId = await createAgent('Start-Run Test Agent');
    });

    afterAll(async () => {
      // Cancel any live runs then soft-delete agent
      await Promise.all(
        startedRunIds.map((id) =>
          api.post('/cancel-run', { test_run_id: id }).catch(() => {})
        )
      );
      await deleteAgent(agentId);
    });

    it('returns 400 when agent_id is missing', async () => {
      const res = await api.post('/start-run', {});

      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/agent_id/i);
    });

    it('returns 400 when agent_id does not exist', async () => {
      const res = await api.post('/start-run', {
        agent_id: NONEXISTENT_UUID,
      });

      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/not found|inactive/i);
    });

    it('starts a run with a specific scenario → 200', async () => {
      const res = await api.post<{
        id: string;
        test_run_id: string;
        status: string;
        total_scenarios: number;
        scenarios_launched: number;
      }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[0]],
        name: 'Integration Test Run',
        max_turns: 2,
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(res.data).toHaveProperty('test_run_id');
      expect(res.data.status).toBe('running');
      expect(res.data.total_scenarios).toBe(1);
      expect(typeof res.data.id).toBe('string');

      startedRunIds.push(res.data.id);
    });

    it('start-run response contains scenarios_launched count', async () => {
      const res = await api.post<{
        id: string;
        scenarios_launched: number;
        total_scenarios: number;
      }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[1], scenarioIds[2]],
        max_turns: 2,
      });

      expect(res.status).toBe(200);
      expect(res.data.total_scenarios).toBe(2);
      // scenarios_launched may be ≤ total_scenarios
      expect(res.data.scenarios_launched).toBeGreaterThanOrEqual(0);

      startedRunIds.push(res.data.id);
    });

    it('respects max_scenarios limit', async () => {
      const res = await api.post<{
        id: string;
        total_scenarios: number;
      }>('/start-run', {
        agent_id: agentId,
        max_scenarios: 1,
        max_turns: 2,
      });

      expect(res.status).toBe(200);
      expect(res.data.total_scenarios).toBe(1);

      startedRunIds.push(res.data.id);
    });

    it('returns 400 when provided scenario_ids have none active/approved', async () => {
      // Use an UUID that is seeded but we can manufacture a non-matching one
      const res = await api.post('/start-run', {
        agent_id: agentId,
        scenario_ids: [NONEXISTENT_UUID],
      });

      // Either 400 (no scenarios found) or 404 are acceptable
      expect([400, 404]).toContain(res.status);
    });

    it('accepts concurrency_limit parameter → 200', async () => {
      const res = await api.post<{
        id: string;
        status: string;
      }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[0]],
        max_turns: 2,
        concurrency_limit: 2,
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(res.data.status).toBe('running');

      startedRunIds.push(res.data.id);
    });

    it('returns 400 or 0 scenarios when tags match nothing', async () => {
      const res = await api.post<{
        id?: string;
        total_scenarios?: number;
        error?: string;
      }>('/start-run', {
        agent_id: agentId,
        max_turns: 2,
        tags: ['some-tag-that-wont-match'],
      });

      // Server either rejects with 400 (no scenarios found) or
      // returns 200 with 0 scenarios — both are acceptable
      if (res.status === 200) {
        expect(res.data.total_scenarios).toBe(0);
        if (res.data.id) startedRunIds.push(res.data.id);
      } else {
        expect(res.status).toBe(400);
        expect(res.data.error).toMatch(/no.*scenario|scenario.*not found/i);
      }
    });

    it('returns 400 when scenario_ids is an empty array', async () => {
      const res = await api.post<{ error: string }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [],
        max_turns: 2,
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/no.*scenario|scenario.*not found/i);
    });

    it('stores custom name and returns it in GET /api/v1/tests/:id', async () => {
      const customName = 'My Custom Run Name';

      const startRes = await api.post<{ id: string }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[0]],
        max_turns: 2,
        name: customName,
      });

      expect(startRes.status).toBe(200);
      const runId = startRes.data.id;
      startedRunIds.push(runId);

      const getRes = await api.get<{ id: string; name?: string }>(
        `/api/v1/tests/${runId}`
      );

      expect(getRes.status).toBe(200);
      expect(getRes.data.id).toBe(runId);
      expect(getRes.data.name).toBe(customName);
    });
  });

  // ── GET /api/v1/tests ─────────────────────────────────────────────────────

  describe('GET /api/v1/tests — list test runs', () => {
    it('returns 200 with runs array and total', async () => {
      const res = await api.get<{ runs: unknown[]; total: number }>('/api/v1/tests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.runs)).toBe(true);
      expect(typeof res.data.total).toBe('number');
    });

    it('total is at least the length of runs in the page', async () => {
      const res = await api.get<{ runs: unknown[]; total: number }>('/api/v1/tests');

      expect(res.status).toBe(200);
      // total is the full DB count for pagination; runs.length is the current page
      expect(res.data.total).toBeGreaterThanOrEqual(res.data.runs.length);
    });

    it('each run has expected fields', async () => {
      const res = await api.get<{ runs: Array<Record<string, unknown>> }>('/api/v1/tests');

      expect(res.status).toBe(200);
      if (res.data.runs.length === 0) return; // Nothing to check

      const run = res.data.runs[0];
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('status');
      expect(run).toHaveProperty('total_scenarios');
      expect(run).toHaveProperty('created_at');
    });

    it('supports ?limit query param', async () => {
      const res = await api.get<{ runs: unknown[]; total: number }>(
        '/api/v1/tests',
        { limit: '3' }
      );

      expect(res.status).toBe(200);
      expect(res.data.runs.length).toBeLessThanOrEqual(3);
    });

    it('supports ?offset query param', async () => {
      // Get page 1 and page 2 — if rows exist they should differ
      const page1 = await api.get<{ runs: Array<{ id: string }> }>(
        '/api/v1/tests',
        { limit: '2', offset: '0' }
      );
      const page2 = await api.get<{ runs: Array<{ id: string }> }>(
        '/api/v1/tests',
        { limit: '2', offset: '2' }
      );

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);

      // If both pages have results, they should not overlap
      if (page1.data.runs.length > 0 && page2.data.runs.length > 0) {
        const ids1 = page1.data.runs.map((r) => r.id);
        const ids2 = page2.data.runs.map((r) => r.id);
        const overlap = ids1.filter((id) => ids2.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });

    it('filters by ?status=running', async () => {
      const res = await api.get<{ runs: Array<{ status: string }> }>(
        '/api/v1/tests',
        { status: 'running' }
      );

      expect(res.status).toBe(200);
      for (const run of res.data.runs) {
        expect(run.status).toBe('running');
      }
    });

    it('filters by ?status=canceled returns only canceled runs', async () => {
      const res = await api.get<{ runs: Array<{ status: string }> }>(
        '/api/v1/tests',
        { status: 'canceled' }
      );

      expect(res.status).toBe(200);
      for (const run of res.data.runs) {
        expect(run.status).toBe('canceled');
      }
    });

    it('returns ordered by created_at DESC (most recent first)', async () => {
      const res = await api.get<{ runs: Array<{ created_at: string }> }>('/api/v1/tests');

      expect(res.status).toBe(200);
      const dates = res.data.runs.map((r) => new Date(r.created_at).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    });
  });

  // ── GET /api/v1/tests/:id ─────────────────────────────────────────────────

  describe('GET /api/v1/tests/:id — get single test run', () => {
    let runId: string;
    let agentId: string;

    beforeAll(async () => {
      agentId = await createAgent('Get-Test-Run Agent');
      const res = await api.post<{ id: string }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[0]],
        max_turns: 2,
      });
      runId = res.data.id;
    });

    afterAll(async () => {
      await api.post('/cancel-run', { test_run_id: runId }).catch(() => {});
      await deleteAgent(agentId);
    });

    it('returns 200 with the correct run', async () => {
      const res = await api.get<{ id: string }>(`/api/v1/tests/${runId}`);

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(runId);
    });

    it('response includes expected fields', async () => {
      const res = await api.get<Record<string, unknown>>(`/api/v1/tests/${runId}`);

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(res.data).toHaveProperty('test_run_id');
      expect(res.data).toHaveProperty('status');
      expect(res.data).toHaveProperty('total_scenarios');
      expect(res.data).toHaveProperty('agent_id');
      expect(res.data).toHaveProperty('created_at');
    });

    it('returns 404 for a non-existent run ID', async () => {
      const res = await api.get(`/api/v1/tests/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect((res.data as { error: string }).error).toMatch(/not found/i);
    });
  });

  // ── POST /cancel-run ──────────────────────────────────────────────────────

  describe('POST /cancel-run — cancel a test run', () => {
    let agentId: string;

    beforeAll(async () => {
      agentId = await createAgent('Cancel-Run Test Agent');
    });

    afterAll(async () => {
      await deleteAgent(agentId);
    });

    it('returns 400 when test_run_id is missing', async () => {
      const res = await api.post('/cancel-run', {});

      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/test_run_id/i);
    });

    it('returns 404 when test_run_id does not exist', async () => {
      const res = await api.post('/cancel-run', {
        test_run_id: NONEXISTENT_UUID,
      });

      expect(res.status).toBe(404);
      expect((res.data as { error: string }).error).toMatch(/not found/i);
    });

    it('cancels a running test → status becomes canceled', async () => {
      // Start a fresh run
      const startRes = await api.post<{ id: string }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[0]],
        max_turns: 2,
      });
      expect(startRes.status).toBe(200);
      const runId = startRes.data.id;

      // Cancel it
      const cancelRes = await api.post<{
        status: string;
        canceled_scenarios: number;
      }>('/cancel-run', { test_run_id: runId });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.data.status).toBe('canceled');
      expect(typeof cancelRes.data.canceled_scenarios).toBe('number');
    });

    it('canceling an already-canceled run returns current status without error', async () => {
      // Start then cancel
      const startRes = await api.post<{ id: string }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[1]],
        max_turns: 2,
      });
      const runId = startRes.data.id;
      await api.post('/cancel-run', { test_run_id: runId });

      // Cancel again — server returns "already finalized" message
      const res2 = await api.post<{ status: string; message?: string }>(
        '/cancel-run',
        { test_run_id: runId }
      );

      // Either 200 (idempotent) is acceptable
      expect(res2.status).toBe(200);
      expect(res2.data.status).toBe('canceled');
    });
  });
});

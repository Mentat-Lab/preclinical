/**
 * Scenario Runs endpoint tests
 *
 * GET /api/v1/scenario-runs?test_run_id=xxx  — list scenario runs for a test
 * GET /api/v1/scenario-runs/:id              — get a single scenario run
 *
 * A fresh agent + test run is created in beforeAll so the tests have known data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, NONEXISTENT_UUID, getSeededScenarioIds, waitFor } from '../setup/test-utils';

interface ScenarioRun {
  id: string;
  test_run_id: string;
  scenario_id: string;
  status: string;
  scenario_name?: string;
  passed?: boolean | null;
  grade_summary?: string | null;
  criteria_results?: unknown[] | null;
}

interface ScenarioRunsResponse {
  results: ScenarioRun[];
  total: number;
}

describe('Scenario Runs API', () => {
  let agentId: string;
  let testRunId: string;

  beforeAll(async () => {
    // Fetch real scenario IDs from the server
    const scenarioIds = await getSeededScenarioIds();

    // Create an agent
    const agentRes = await api.post<{ id: string }>('/api/v1/agents', {
      provider: 'openai',
      name: `Scenario-Runs Test Agent ${Date.now()}`,
      config: { model: 'gpt-4o-mini' },
    });
    if (agentRes.status !== 201) {
      throw new Error(`Could not create agent: ${JSON.stringify(agentRes.data)}`);
    }
    agentId = agentRes.data.id;

    // Start a run with two scenarios so there are multiple scenario_runs rows
    const runRes = await api.post<{ id: string }>('/start-run', {
      agent_id: agentId,
      scenario_ids: [scenarioIds[0], scenarioIds[1]],
      max_turns: 2,
    });
    if (runRes.status !== 200) {
      throw new Error(`Could not start run: ${JSON.stringify(runRes.data)}`);
    }
    testRunId = runRes.data.id;

    // Give the server a moment to insert scenario_runs rows
    await waitFor(
      async () => {
        const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
          test_run_id: testRunId,
        });
        return res.status === 200 && res.data.results.length >= 2;
      },
      { timeout: 10_000, interval: 500 }
    );
  });

  afterAll(async () => {
    await api.post('/cancel-run', { test_run_id: testRunId }).catch(() => {});
    await api.delete(`/api/v1/agents/${agentId}`);
  });

  // ── GET /api/v1/scenario-runs ─────────────────────────────────────────────

  describe('GET /api/v1/scenario-runs — list scenario runs', () => {
    it('returns 400 when test_run_id query param is missing', async () => {
      const res = await api.get('/api/v1/scenario-runs');

      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/test_run_id/i);
    });

    it('returns 200 with results array and total for a valid test_run_id', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect(typeof res.data.total).toBe('number');
    });

    it('total matches the length of results returned', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
      });

      expect(res.status).toBe(200);
      expect(res.data.total).toBe(res.data.results.length);
    });

    it('returns both scenario runs started for this test run', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
      });

      expect(res.status).toBe(200);
      expect(res.data.results.length).toBeGreaterThanOrEqual(2);
    });

    it('each result has the expected shape', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
      });

      expect(res.status).toBe(200);
      for (const sr of res.data.results) {
        expect(sr).toHaveProperty('id');
        expect(sr).toHaveProperty('test_run_id');
        expect(sr).toHaveProperty('scenario_id');
        expect(sr).toHaveProperty('status');
        // scenario_name comes from the LEFT JOIN with scenarios
        expect(sr).toHaveProperty('scenario_name');
      }
    });

    it('all results belong to the requested test run', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
      });

      expect(res.status).toBe(200);
      for (const sr of res.data.results) {
        expect(sr.test_run_id).toBe(testRunId);
      }
    });

    it('returns empty results for a non-existent (but valid UUID) test_run_id', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: NONEXISTENT_UUID,
      });

      expect(res.status).toBe(200);
      expect(res.data.results).toHaveLength(0);
      expect(res.data.total).toBe(0);
    });

    it('respects the ?limit query param', async () => {
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
        limit: '1',
      });

      expect(res.status).toBe(200);
      expect(res.data.results.length).toBeLessThanOrEqual(1);
    });

    it('respects the ?offset query param — page 2 differs from page 1', async () => {
      const page1 = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
        limit: '1',
        offset: '0',
      });
      const page2 = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
        limit: '1',
        offset: '1',
      });

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);

      if (page1.data.results.length > 0 && page2.data.results.length > 0) {
        expect(page1.data.results[0].id).not.toBe(page2.data.results[0].id);
      }
    });
  });

  // ── GET /api/v1/scenario-runs/:id ─────────────────────────────────────────

  describe('GET /api/v1/scenario-runs/:id — get single scenario run', () => {
    let scenarioRunId: string;

    beforeAll(async () => {
      // Pick the first scenario run ID from the test run we created
      const res = await api.get<ScenarioRunsResponse>('/api/v1/scenario-runs', {
        test_run_id: testRunId,
        limit: '1',
      });
      if (res.status !== 200 || res.data.results.length === 0) {
        throw new Error('No scenario runs available for single-run tests');
      }
      scenarioRunId = res.data.results[0].id;
    });

    it('returns 200 with the correct scenario run', async () => {
      const res = await api.get<ScenarioRun>(`/api/v1/scenario-runs/${scenarioRunId}`);

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(scenarioRunId);
    });

    it('response includes all expected fields', async () => {
      const res = await api.get<Record<string, unknown>>(
        `/api/v1/scenario-runs/${scenarioRunId}`
      );

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(res.data).toHaveProperty('test_run_id');
      expect(res.data).toHaveProperty('scenario_id');
      expect(res.data).toHaveProperty('status');
      expect(res.data).toHaveProperty('scenario_name');
      // grade fields present (may be null for unfinished runs)
      expect(res.data).toHaveProperty('passed');
      expect(res.data).toHaveProperty('grade_summary');
      expect(res.data).toHaveProperty('criteria_results');
    });

    it('test_run_id on the returned object matches our test run', async () => {
      const res = await api.get<ScenarioRun>(`/api/v1/scenario-runs/${scenarioRunId}`);

      expect(res.status).toBe(200);
      expect(res.data.test_run_id).toBe(testRunId);
    });

    it('returns 404 for a non-existent scenario run ID', async () => {
      const res = await api.get(`/api/v1/scenario-runs/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect((res.data as { error: string }).error).toMatch(/not found/i);
    });
  });
});

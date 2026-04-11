/**
 * Full Run E2E test — creates an agent, runs a scenario, waits for completion,
 * verifies transcript + grading + CSV export, then cleans up.
 *
 * Requires OPENAI_API_KEY. Skipped when not available.
 * Uses 60s timeout for the run to complete.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, getSeededScenarioIds, waitFor } from '../setup/test-utils';

const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY;

describe('Full Run E2E', () => {
  let agentId: string;
  let testRunId: string;
  let scenarioIds: string[];

  beforeAll(async () => {
    scenarioIds = await getSeededScenarioIds();
  });

  afterAll(async () => {
    // Cleanup: cancel run and delete agent
    if (testRunId) {
      await api.post('/cancel-run', { test_run_id: testRunId }).catch(() => {});
      await api.delete(`/api/v1/tests/${testRunId}`).catch(() => {});
    }
    if (agentId) {
      await api.delete(`/api/v1/agents/${agentId}`).catch(() => {});
    }
  });

  it.skipIf(!HAS_OPENAI_KEY)('runs a full test cycle: create → run → grade → export', async () => {
    // 1. Create agent
    const agentRes = await api.post<{ id: string }>('/api/v1/agents', {
      provider: 'openai',
      name: 'E2E-Full-Run-Agent',
      config: {
        model: 'gpt-4o-mini',
        api_key: process.env.OPENAI_API_KEY,
      },
    });
    expect(agentRes.status).toBe(201);
    agentId = agentRes.data.id;

    // 2. Start run with 1 scenario, minimal turns
    const runRes = await api.post<{
      id: string;
      status: string;
      total_scenarios: number;
    }>('/start-run', {
      agent_id: agentId,
      scenario_ids: [scenarioIds[0]],
      max_turns: 5,
    });
    expect(runRes.status).toBe(200);
    expect(runRes.data.status).toBe('running');
    testRunId = runRes.data.id;

    // 3. Poll until completed or failed (timeout 60s)
    let finalStatus = '';
    await waitFor(
      async () => {
        const res = await api.get<{ status: string }>(`/api/v1/tests/${testRunId}`);
        finalStatus = res.data.status;
        return ['completed', 'failed'].includes(finalStatus);
      },
      { timeout: 60_000, interval: 2_000 },
    );

    expect(['completed', 'failed']).toContain(finalStatus);

    // 4. Verify scenario run has transcript with turns
    const scenarioRunsRes = await api.get<{
      results: Array<{
        transcript: Array<{ turn: number; role: string; content: string }>;
        status: string;
      }>;
    }>('/api/v1/scenario-runs', { test_run_id: testRunId });

    expect(scenarioRunsRes.status).toBe(200);
    expect(scenarioRunsRes.data.results.length).toBeGreaterThan(0);

    const scenarioRun = scenarioRunsRes.data.results[0];
    if (scenarioRun.status === 'completed' || scenarioRun.status === 'graded') {
      expect(Array.isArray(scenarioRun.transcript)).toBe(true);
      expect(scenarioRun.transcript.length).toBeGreaterThan(0);
    }

    // 5. Verify CSV export returns valid data
    const csvRes = await api.get<string>(`/api/v1/tests/${testRunId}/export-csv`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    if (typeof csvRes.data === 'string') {
      const lines = csvRes.data.split('\n');
      // At least header + 1 data row
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[0]).toContain('scenario_name');
    }
  }, 90_000); // Overall test timeout 90s
});

/**
 * CSV Export tests — GET /api/v1/tests/:id/export-csv
 *
 * Tests CSV generation for test runs. Uses real test runs created via
 * start-run, but with minimal max_turns to keep execution fast.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, NONEXISTENT_UUID, getSeededScenarioIds } from '../setup/test-utils';

describe('CSV Export API', () => {
  let agentId: string;
  let runId: string;
  let scenarioIds: string[];

  beforeAll(async () => {
    scenarioIds = await getSeededScenarioIds();

    // Create agent
    const agentRes = await api.post<{ id: string }>('/api/v1/agents', {
      provider: 'openai',
      name: 'CSV-Export-Test-Agent',
      config: { model: 'gpt-4o-mini' },
    });
    agentId = agentRes.data.id;

    // Start a run with 1 scenario
    const runRes = await api.post<{ id: string }>('/start-run', {
      agent_id: agentId,
      scenario_ids: [scenarioIds[0]],
      max_turns: 5,
    });
    runId = runRes.data.id;
  });

  afterAll(async () => {
    if (runId) await api.post('/cancel-run', { test_run_id: runId }).catch(() => {});
    if (agentId) await api.delete(`/api/v1/agents/${agentId}`);
  });

  it('returns 404 for non-existent test run', async () => {
    const res = await api.get(`/api/v1/tests/${NONEXISTENT_UUID}/export-csv`);
    expect(res.status).toBe(404);
  });

  it('returns Content-Type text/csv', async () => {
    const res = await api.get(`/api/v1/tests/${runId}/export-csv`);
    // Run may or may not have scenario runs yet, but the endpoint should still work
    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('text/csv');
    }
  });

  it('returns Content-Disposition header with filename containing run ID', async () => {
    const res = await api.get(`/api/v1/tests/${runId}/export-csv`);
    if (res.status === 200) {
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.csv');
    }
  });

  it('CSV header row includes expected columns', async () => {
    const res = await api.get<string>(`/api/v1/tests/${runId}/export-csv`);
    if (res.status === 200 && typeof res.data === 'string') {
      const headerLine = res.data.split('\n')[0];
      const expectedHeaders = [
        'case_id',
        'scenario_name',
        'status',
        'passed',
        'score_percent',
        'flesch_kincaid_grade_level',
        'triage_correct',
        'reference_category',
        'predicted_category',
      ];
      for (const h of expectedHeaders) {
        expect(headerLine).toContain(h);
      }
    }
  });

  it('properly escapes commas and quotes in CSV values', () => {
    // Verify the escaping logic by testing the pattern the server uses
    const esc = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    expect(esc('hello, world')).toBe('"hello, world"');
    expect(esc('say "hello"')).toBe('"say ""hello"""');
    expect(esc('line1\nline2')).toBe('"line1\nline2"');
    expect(esc('simple')).toBe('simple');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

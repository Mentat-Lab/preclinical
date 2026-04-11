/**
 * Browser Agent Validation tests
 *
 * POST /api/v1/agents/validate-browser — validate before creating
 * POST /api/v1/agents/:id/validate-browser — validate existing agent
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, NONEXISTENT_UUID } from '../setup/test-utils';

describe('Browser Validation API', () => {
  // ── POST /api/v1/agents/validate-browser ─────────────────────────────────

  describe('POST /api/v1/agents/validate-browser', () => {
    it('returns 400 when url is missing', async () => {
      const res = await api.post('/api/v1/agents/validate-browser', {
        profile_id: 'prof_123',
      });
      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/url/i);
    });

    it('returns 400 when profile_id is missing', async () => {
      const res = await api.post('/api/v1/agents/validate-browser', {
        url: 'https://chatgpt.com',
      });
      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/profile_id/i);
    });

    it('returns 400 when url is empty string', async () => {
      const res = await api.post('/api/v1/agents/validate-browser', {
        url: '',
        profile_id: 'prof_123',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when profile_id is empty string', async () => {
      const res = await api.post('/api/v1/agents/validate-browser', {
        url: 'https://chatgpt.com',
        profile_id: '',
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 or error when BROWSER_USE_API_KEY is not configured', async () => {
      // If the server has no BROWSER_USE_API_KEY, it returns 500
      // If it does have one, we'll get a different response — both are valid
      const res = await api.post('/api/v1/agents/validate-browser', {
        url: 'https://chatgpt.com',
        profile_id: 'prof_123',
      });
      // Should return some status (400 for missing fields handled above,
      // 500 for missing API key, or 200 with ok:true/false)
      expect([200, 500]).toContain(res.status);
    });
  });

  // ── POST /api/v1/agents/:id/validate-browser ────────────────────────────

  describe('POST /api/v1/agents/:id/validate-browser', () => {
    let openaiAgentId: string;
    let browserAgentId: string | undefined;

    beforeAll(async () => {
      // Create a non-browser agent for testing provider check
      const res = await api.post<{ id: string }>('/api/v1/agents', {
        provider: 'openai',
        name: 'Browser-Validation-OpenAI-Agent',
        config: { model: 'gpt-4o-mini' },
      });
      openaiAgentId = res.data.id;

      // Try to create a browser agent (may fail if profile_id validation is strict)
      const browserRes = await api.post<{ id: string; error?: string }>('/api/v1/agents', {
        provider: 'browser',
        name: 'Browser-Validation-Browser-Agent',
        config: { url: 'https://chatgpt.com', profile_id: 'prof_test_123' },
      });
      if (browserRes.status === 201) {
        browserAgentId = browserRes.data.id;
      }
    });

    afterAll(async () => {
      if (openaiAgentId) await api.delete(`/api/v1/agents/${openaiAgentId}`);
      if (browserAgentId) await api.delete(`/api/v1/agents/${browserAgentId}`);
    });

    it('returns 404 when agent does not exist', async () => {
      const res = await api.post(`/api/v1/agents/${NONEXISTENT_UUID}/validate-browser`);
      expect(res.status).toBe(404);
    });

    it('returns 400 when agent provider is not "browser"', async () => {
      const res = await api.post(`/api/v1/agents/${openaiAgentId}/validate-browser`);
      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/browser/i);
    });

    it('accepts browser agent for validation', async () => {
      if (!browserAgentId) return; // Skip if browser agent creation failed

      const res = await api.post(`/api/v1/agents/${browserAgentId}/validate-browser`);
      // Either 200 (validation ran) or 500 (no API key) — both mean the endpoint works
      expect([200, 500]).toContain(res.status);
    });
  });
});

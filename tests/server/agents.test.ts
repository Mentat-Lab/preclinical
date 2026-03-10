/**
 * Agents CRUD tests
 *
 * Covers POST / GET (list) / GET (single) / PATCH / DELETE for /api/v1/agents.
 * Each test is self-contained: creates its own data and cleans up in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, NONEXISTENT_UUID } from '../setup/test-utils';

// ─── helpers ─────────────────────────────────────────────────────────────────

function agentPayload(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'openai',
    name: `Test Agent ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: 'Integration test agent',
    config: { model: 'gpt-4o-mini' },
    ...overrides,
  };
}

// Track every agent created so we can soft-delete them in afterAll
const createdIds: string[] = [];

async function createAgent(overrides: Record<string, unknown> = {}) {
  const res = await api.post<{ id: string }>('/api/v1/agents', agentPayload(overrides));
  if (res.status === 201) createdIds.push(res.data.id);
  return res;
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('Agents API', () => {
  afterAll(async () => {
    // Soft-delete all agents created during this suite
    await Promise.all(createdIds.map((id) => api.delete(`/api/v1/agents/${id}`)));
  });

  // ── POST /api/v1/agents ───────────────────────────────────────────────────

  describe('POST /api/v1/agents — create agent', () => {
    it('creates an agent with minimal valid fields → 201', async () => {
      const res = await createAgent({ name: 'Minimal Agent' });

      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({
        provider: 'openai',
        name: 'Minimal Agent',
        is_active: true,
      });
      expect(typeof res.data.id).toBe('string');
      expect(res.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('persists all supplied fields in the response', async () => {
      const res = await createAgent({
        name: 'Full Agent',
        description: 'Has all fields',
        config: { model: 'gpt-4o', temperature: 0.7 },
      });

      expect(res.status).toBe(201);
      expect(res.data.description).toBe('Has all fields');
      // config is returned as JSONB — may be serialised or parsed
      const cfg = typeof res.data.config === 'string'
        ? JSON.parse(res.data.config)
        : res.data.config;
      expect(cfg.model).toBe('gpt-4o');
    });

    it.each([
      ['vapi'],
      ['openai'],
      ['livekit'],
      ['pipecat'],
      ['browser'],
    ] as const)('accepts provider "%s"', async (provider) => {
      const res = await createAgent({ provider, name: `${provider} Agent` });
      expect(res.status).toBe(201);
      expect(res.data.provider).toBe(provider);
    });

    it.each([
      ['retell'],
      ['elevenlabs'],
      ['bland'],
    ] as const)('rejects unsupported provider "%s"', async (provider) => {
      const res = await createAgent({ provider, name: `${provider} Agent` });
      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/unsupported provider/i);
    });

    it('returns 400 when provider is missing', async () => {
      const res = await api.post('/api/v1/agents', {
        name: 'No Provider',
        config: {},
      });

      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/provider/i);
    });

    it('returns 400 when name is missing', async () => {
      const res = await api.post('/api/v1/agents', {
        provider: 'openai',
        config: {},
      });

      expect(res.status).toBe(400);
      expect((res.data as { error: string }).error).toMatch(/name/i);
    });
  });

  // ── GET /api/v1/agents ────────────────────────────────────────────────────

  describe('GET /api/v1/agents — list agents', () => {
    let knownId: string;

    beforeAll(async () => {
      const res = await createAgent({ name: 'List Test Agent' });
      knownId = res.data.id;
    });

    it('returns an array containing recently created agent', async () => {
      const res = await api.get<unknown[]>('/api/v1/agents');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);

      const ids = (res.data as Array<{ id: string }>).map((a) => a.id);
      expect(ids).toContain(knownId);
    });

    it('each item has the expected shape', async () => {
      const res = await api.get<Array<Record<string, unknown>>>('/api/v1/agents');

      expect(res.status).toBe(200);
      const first = res.data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('provider');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('is_active');
      expect(first).toHaveProperty('created_at');
    });

    it('excludes soft-deleted agents', async () => {
      // Create then delete an agent
      const created = await createAgent({ name: 'Will Be Deleted' });
      const deletedId = created.data.id;
      await api.delete(`/api/v1/agents/${deletedId}`);
      // Remove from cleanup list since already deleted
      const idx = createdIds.indexOf(deletedId);
      if (idx !== -1) createdIds.splice(idx, 1);

      const list = await api.get<Array<{ id: string }>>('/api/v1/agents');
      const ids = list.data.map((a) => a.id);
      expect(ids).not.toContain(deletedId);
    });
  });

  // ── GET /api/v1/agents/:id ────────────────────────────────────────────────

  describe('GET /api/v1/agents/:id — get single agent', () => {
    let agentId: string;

    beforeAll(async () => {
      const res = await createAgent({ name: 'Get By ID Agent' });
      agentId = res.data.id;
    });

    it('returns the agent by ID → 200', async () => {
      const res = await api.get(`/api/v1/agents/${agentId}`);

      expect(res.status).toBe(200);
      expect((res.data as { id: string }).id).toBe(agentId);
    });

    it('includes all core fields in the response', async () => {
      const res = await api.get<Record<string, unknown>>(`/api/v1/agents/${agentId}`);

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(res.data).toHaveProperty('provider');
      expect(res.data).toHaveProperty('name');
      expect(res.data).toHaveProperty('config');
      expect(res.data).toHaveProperty('is_active');
      expect(res.data).toHaveProperty('created_at');
    });

    it('returns 404 for a non-existent ID', async () => {
      const res = await api.get(`/api/v1/agents/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect((res.data as { error: string }).error).toMatch(/not found/i);
    });
  });

  // ── PATCH /api/v1/agents/:id ──────────────────────────────────────────────

  describe('PATCH /api/v1/agents/:id — update agent', () => {
    let agentId: string;

    beforeAll(async () => {
      const res = await createAgent({ name: 'Patch Source Agent' });
      agentId = res.data.id;
    });

    it('updates name → 200 with new name reflected', async () => {
      const res = await api.patch(`/api/v1/agents/${agentId}`, {
        name: 'Patched Name',
      });

      expect(res.status).toBe(200);
      expect((res.data as { name: string }).name).toBe('Patched Name');
    });

    it('updates description only — other fields unchanged', async () => {
      // Capture current name first
      const before = await api.get<{ name: string; description: string }>(
        `/api/v1/agents/${agentId}`
      );
      const currentName = before.data.name;

      const res = await api.patch<{ name: string; description: string }>(
        `/api/v1/agents/${agentId}`,
        { description: 'Updated description' }
      );

      expect(res.status).toBe(200);
      expect(res.data.description).toBe('Updated description');
      expect(res.data.name).toBe(currentName);
    });

    it('updates config', async () => {
      const res = await api.patch(`/api/v1/agents/${agentId}`, {
        config: { model: 'gpt-4-turbo', temperature: 0.5 },
      });

      expect(res.status).toBe(200);
      const cfg = typeof (res.data as any).config === 'string'
        ? JSON.parse((res.data as any).config)
        : (res.data as any).config;
      expect(cfg.model).toBe('gpt-4-turbo');
    });

    it('returns 404 when agent does not exist', async () => {
      const res = await api.patch(`/api/v1/agents/${NONEXISTENT_UUID}`, {
        name: 'Ghost',
      });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/v1/agents/:id ─────────────────────────────────────────────

  describe('DELETE /api/v1/agents/:id — soft delete', () => {
    it('soft-deletes an agent → 204, then GET returns 404', async () => {
      const created = await createAgent({ name: 'To Delete' });
      const id = created.data.id;
      // Remove from afterAll cleanup — we're deleting it explicitly
      const idx = createdIds.indexOf(id);
      if (idx !== -1) createdIds.splice(idx, 1);

      const delRes = await api.delete(`/api/v1/agents/${id}`);
      expect(delRes.status).toBe(204);

      const getRes = await api.get(`/api/v1/agents/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for a non-existent agent', async () => {
      const res = await api.delete(`/api/v1/agents/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect((res.data as { error: string }).error).toMatch(/not found/i);
    });
  });

  // ── Config masking ────────────────────────────────────────────────────────

  describe('Config masking — sensitive keys are masked in responses', () => {
    function getConfig(data: unknown): Record<string, unknown> {
      const cfg = (data as any).config;
      return typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
    }

    it('POST creates agent with api_key in config → response masks the api_key value', async () => {
      const sensitiveKey = 'sk-1234567890abcdef';
      const res = await createAgent({
        name: 'Masking POST Agent',
        config: { model: 'gpt-4o', api_key: sensitiveKey },
      });

      expect(res.status).toBe(201);
      const cfg = getConfig(res.data);
      expect(cfg.api_key).not.toBe(sensitiveKey);
      expect(String(cfg.api_key)).toContain('•');
    });

    it('GET single agent masks sensitive config keys', async () => {
      const sensitiveKey = 'sk-1234567890abcdef';
      const created = await createAgent({
        name: 'Masking GET Agent',
        config: { model: 'gpt-4o', api_key: sensitiveKey },
      });
      expect(created.status).toBe(201);

      const res = await api.get(`/api/v1/agents/${created.data.id}`);

      expect(res.status).toBe(200);
      const cfg = getConfig(res.data);
      expect(cfg.api_key).not.toBe(sensitiveKey);
      expect(String(cfg.api_key)).toContain('•');
    });

    it('non-sensitive keys are NOT masked', async () => {
      const res = await createAgent({
        name: 'Non-Sensitive Config Agent',
        config: { model: 'gpt-4o', temperature: 0.7 },
      });

      expect(res.status).toBe(201);
      const cfg = getConfig(res.data);
      expect(cfg.model).toBe('gpt-4o');
      expect(cfg.temperature).toBe(0.7);
    });

    it('PATCH response also masks sensitive keys', async () => {
      const created = await createAgent({ name: 'Masking PATCH Agent' });
      expect(created.status).toBe(201);

      const sensitiveToken = 'tok-abcdef1234567890';
      const res = await api.patch(`/api/v1/agents/${created.data.id}`, {
        config: { model: 'gpt-4o', token: sensitiveToken },
      });

      expect(res.status).toBe(200);
      const cfg = getConfig(res.data);
      expect(cfg.token).not.toBe(sensitiveToken);
      expect(String(cfg.token)).toContain('•');
    });
  });
});

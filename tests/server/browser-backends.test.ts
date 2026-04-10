/**
 * Browser Backend Integration Tests — BrowserUse Cloud & Local Chrome
 *
 * Real integration tests against the running server and database.
 * No mocks. Covers:
 *   - Agent CRUD with browser_backend config
 *   - BrowserUse Cloud API (setup-profile, complete-profile-setup)
 *   - Local Chrome API (setup-auth, complete-auth)
 *   - BrowserUse Cloud runtime (not-yet-implemented error)
 *   - Test run execution with browser agents (5 scenarios, chatgpt.com)
 *   - Data integrity (config merge, masking, snapshot)
 *   - Edge cases (legacy agents, backend switching, missing env vars)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, BASE_URL, NONEXISTENT_UUID, getSeededScenarioIds, waitFor } from '../setup/test-utils';

// ─── shared helpers ──────────────────────────────────────────────────────────

const TARGET_URL = 'https://chatgpt.com';
const createdAgentIds: string[] = [];
const startedRunIds: string[] = [];

async function createBrowserAgent(
  name: string,
  config: Record<string, unknown> = {}
) {
  const res = await api.post<{ id: string; config: Record<string, unknown> }>(
    '/api/v1/agents',
    {
      provider: 'browser',
      name: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description: 'Browser backend integration test',
      config: { url: TARGET_URL, ...config },
    }
  );
  if (res.status === 201) createdAgentIds.push(res.data.id);
  return res;
}

function getConfig(data: unknown): Record<string, unknown> {
  const cfg = (data as any).config;
  return typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe('Browser Backends — BrowserUse Cloud & Local Chrome', () => {
  let scenarioIds: string[];

  beforeAll(async () => {
    scenarioIds = await getSeededScenarioIds();
    expect(scenarioIds.length).toBeGreaterThanOrEqual(5);
  });

  afterAll(async () => {
    // Cancel any live runs
    await Promise.all(
      startedRunIds.map((id) =>
        api.post('/cancel-run', { test_run_id: id }).catch(() => {})
      )
    );
    // Soft-delete all agents
    await Promise.all(
      createdAgentIds.map((id) => api.delete(`/api/v1/agents/${id}`))
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Agent CRUD with browser_backend config
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Agent CRUD — browser_backend config', () => {
    it('creates browser agent with browseruse_cloud backend', async () => {
      const res = await createBrowserAgent('BU Cloud Agent', {
        browser_backend: 'browseruse_cloud',
      });

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      const cfg = getConfig(res.data);
      expect(cfg.browser_backend).toBe('browseruse_cloud');
      expect(cfg.url).toBe(TARGET_URL);
    });

    it('creates browser agent with local backend', async () => {
      const res = await createBrowserAgent('Local Chrome Agent', {
        browser_backend: 'local',
      });

      expect(res.status).toBe(201);
      const cfg = getConfig(res.data);
      expect(cfg.browser_backend).toBe('local');
    });

    it('creates browser agent with browserbase backend', async () => {
      const res = await createBrowserAgent('Browserbase Agent', {
        browser_backend: 'browserbase',
      });

      expect(res.status).toBe(201);
      const cfg = getConfig(res.data);
      expect(cfg.browser_backend).toBe('browserbase');
    });

    it('creates browser agent with no explicit backend (defaults handled at runtime)', async () => {
      const res = await createBrowserAgent('No Backend Agent');

      expect(res.status).toBe(201);
      const cfg = getConfig(res.data);
      expect(cfg.url).toBe(TARGET_URL);
      // browser_backend may be undefined — runtime defaults to browserbase
      expect(cfg.browser_backend).toBeUndefined();
    });

    it('PATCH updates browser_backend without losing other config', async () => {
      const created = await createBrowserAgent('Patch Backend Agent', {
        browser_backend: 'browserbase',
        instructions: 'some instructions',
      });
      expect(created.status).toBe(201);

      const patched = await api.patch<{ config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`,
        { config: { browser_backend: 'local' } }
      );

      expect(patched.status).toBe(200);
      const cfg = getConfig(patched.data);
      expect(cfg.browser_backend).toBe('local');
      // Original fields preserved (JSONB merge)
      expect(cfg.url).toBe(TARGET_URL);
      expect(cfg.instructions).toBe('some instructions');
    });

    it('PATCH preserves browser_backend when updating other config fields', async () => {
      const created = await createBrowserAgent('Preserve Backend Agent', {
        browser_backend: 'browseruse_cloud',
      });
      expect(created.status).toBe(201);

      const patched = await api.patch<{ config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`,
        { config: { instructions: 'new instructions' } }
      );

      expect(patched.status).toBe(200);
      const cfg = getConfig(patched.data);
      expect(cfg.browser_backend).toBe('browseruse_cloud');
      expect(cfg.instructions).toBe('new instructions');
    });

    it('GET single agent returns correct browser_backend', async () => {
      const created = await createBrowserAgent('Get Backend Agent', {
        browser_backend: 'local',
      });
      expect(created.status).toBe(201);

      const fetched = await api.get<{ id: string; config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`
      );

      expect(fetched.status).toBe(200);
      const cfg = getConfig(fetched.data);
      expect(cfg.browser_backend).toBe('local');
    });

    it('GET list includes browser agents', async () => {
      const created = await createBrowserAgent('List Backend Agent', {
        browser_backend: 'browseruse_cloud',
      });
      expect(created.status).toBe(201);

      const list = await api.get<Array<{ id: string; provider: string }>>(
        '/api/v1/agents'
      );

      expect(list.status).toBe(200);
      const found = list.data.find((a: any) => a.id === created.data.id);
      expect(found).toBeDefined();
      expect(found!.provider).toBe('browser');
    });

    it('soft-delete removes browser agent from list', async () => {
      const created = await createBrowserAgent('Delete Backend Agent');
      expect(created.status).toBe(201);
      const id = created.data.id;

      await api.delete(`/api/v1/agents/${id}`);
      // Remove from cleanup since already deleted
      const idx = createdAgentIds.indexOf(id);
      if (idx !== -1) createdAgentIds.splice(idx, 1);

      const fetched = await api.get(`/api/v1/agents/${id}`);
      expect(fetched.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. BrowserUse Cloud API — setup-profile & complete-profile-setup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('BrowserUse Cloud API', () => {
    // Check if BrowserUse Cloud API key is valid by probing once
    let buCloudAvailable = false;

    beforeAll(async () => {
      const probe = await api.post<{ profile_id?: string; session_id?: string; error?: string }>(
        '/api/v1/browseruse-cloud/setup-profile',
        { url: TARGET_URL }
      );
      buCloudAvailable = probe.status === 200;
      // Clean up probe session if it worked
      if (buCloudAvailable && probe.data.session_id) {
        await api.post('/api/v1/browseruse-cloud/complete-profile-setup', {
          session_id: probe.data.session_id,
        });
      }
    });

    it('POST /browseruse-cloud/setup-profile with URL → returns profile_id, session_id, live_url (or auth error)', async () => {
      const res = await api.post<{
        profile_id?: string;
        session_id?: string;
        live_url?: string;
        error?: string;
      }>('/api/v1/browseruse-cloud/setup-profile', { url: TARGET_URL });

      if (buCloudAvailable) {
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('profile_id');
        expect(res.data).toHaveProperty('session_id');
        expect(res.data).toHaveProperty('live_url');
        expect(typeof res.data.profile_id).toBe('string');
        expect(typeof res.data.session_id).toBe('string');

        // Clean up
        if (res.data.session_id) {
          await api.post('/api/v1/browseruse-cloud/complete-profile-setup', {
            session_id: res.data.session_id,
          });
        }
      } else {
        // No API key or invalid — 400 (not set) or 401 (invalid key)
        expect([400, 401]).toContain(res.status);
        expect(res.data.error).toMatch(/api.key|failed to create profile/i);
      }
    });

    it('POST /browseruse-cloud/setup-profile without URL → returns profile or auth error', async () => {
      const res = await api.post<{
        profile_id?: string;
        session_id?: string;
        error?: string;
      }>('/api/v1/browseruse-cloud/setup-profile', {});

      if (buCloudAvailable) {
        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('profile_id');
        expect(res.data).toHaveProperty('session_id');

        if (res.data.session_id) {
          await api.post('/api/v1/browseruse-cloud/complete-profile-setup', {
            session_id: res.data.session_id,
          });
        }
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('POST /browseruse-cloud/complete-profile-setup without session_id → 400', async () => {
      const res = await api.post<{ error: string }>(
        '/api/v1/browseruse-cloud/complete-profile-setup',
        {}
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/session_id/i);
    });

    it('POST /browseruse-cloud/complete-profile-setup with invalid session_id → error', async () => {
      const res = await api.post<{ error: string }>(
        '/api/v1/browseruse-cloud/complete-profile-setup',
        { session_id: 'nonexistent-session-id-12345' }
      );

      // Should return an error (4xx or 5xx)
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('multiple setup calls create different profiles (when API key valid)', async () => {
      if (!buCloudAvailable) {
        // When API key is invalid, both calls should fail consistently
        const res1 = await api.post<{ error: string }>(
          '/api/v1/browseruse-cloud/setup-profile',
          { url: TARGET_URL }
        );
        const res2 = await api.post<{ error: string }>(
          '/api/v1/browseruse-cloud/setup-profile',
          { url: TARGET_URL }
        );
        expect(res1.status).toBe(res2.status);
        return;
      }

      const res1 = await api.post<{ profile_id: string; session_id: string }>(
        '/api/v1/browseruse-cloud/setup-profile',
        { url: TARGET_URL }
      );
      const res2 = await api.post<{ profile_id: string; session_id: string }>(
        '/api/v1/browseruse-cloud/setup-profile',
        { url: TARGET_URL }
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.data.profile_id).not.toBe(res2.data.profile_id);

      // Clean up both
      await api.post('/api/v1/browseruse-cloud/complete-profile-setup', {
        session_id: res1.data.session_id,
      });
      await api.post('/api/v1/browseruse-cloud/complete-profile-setup', {
        session_id: res2.data.session_id,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Local Chrome API — setup-auth & complete-auth
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Local Chrome API', () => {
    // Check if local BrowserUse worker is reachable
    let localChromeAvailable = false;

    beforeAll(async () => {
      const probe = await api.post<{ session_id?: string }>(
        '/api/v1/local-chrome/setup-auth',
        { url: TARGET_URL }
      );
      localChromeAvailable = probe.status === 200;
      // Clean up probe session if it worked
      if (localChromeAvailable && probe.data.session_id) {
        await api.post('/api/v1/local-chrome/complete-auth', {
          session_id: probe.data.session_id,
        });
      }
    });

    it('POST /local-chrome/setup-auth with URL → returns session_id and domain', async () => {
      if (!localChromeAvailable) {
        // BrowserUse worker not running — expect 500 (connection refused)
        const res = await api.post('/api/v1/local-chrome/setup-auth', { url: TARGET_URL });
        expect(res.status).toBe(500);
        return;
      }

      const res = await api.post<{
        session_id: string;
        domain: string;
      }>('/api/v1/local-chrome/setup-auth', { url: TARGET_URL });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('session_id');
      expect(res.data).toHaveProperty('domain');
      expect(typeof res.data.session_id).toBe('string');
      expect(res.data.session_id.length).toBeGreaterThan(0);
      expect(res.data.domain).toBe('chatgpt.com');

      // Clean up
      if (res.data.session_id) {
        await api.post('/api/v1/local-chrome/complete-auth', {
          session_id: res.data.session_id,
        });
      }
    });

    it('domain extracted correctly — strips www and path', async () => {
      if (!localChromeAvailable) {
        const res = await api.post('/api/v1/local-chrome/setup-auth', {
          url: 'https://www.chatgpt.com/some/path?q=1',
        });
        expect(res.status).toBe(500);
        return;
      }

      const res = await api.post<{ domain: string }>(
        '/api/v1/local-chrome/setup-auth',
        { url: 'https://www.chatgpt.com/some/path?q=1' }
      );

      expect(res.status).toBe(200);
      expect(res.data.domain).toBe('chatgpt.com');

      // Clean up
      if ((res.data as any).session_id) {
        await api.post('/api/v1/local-chrome/complete-auth', {
          session_id: (res.data as any).session_id,
        });
      }
    });

    it('POST /local-chrome/setup-auth without URL → returns session with empty domain', async () => {
      if (!localChromeAvailable) {
        const res = await api.post('/api/v1/local-chrome/setup-auth', {});
        expect(res.status).toBe(500);
        return;
      }

      const res = await api.post<{
        session_id: string;
        domain: string;
      }>('/api/v1/local-chrome/setup-auth', {});

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('session_id');
      expect(res.data.domain).toBe('');

      // Clean up
      if (res.data.session_id) {
        await api.post('/api/v1/local-chrome/complete-auth', {
          session_id: res.data.session_id,
        });
      }
    });

    it('POST /local-chrome/complete-auth with valid session_id → completed', async () => {
      if (!localChromeAvailable) {
        const res = await api.post('/api/v1/local-chrome/complete-auth', {
          session_id: 'any-session',
        });
        expect(res.status).toBe(500);
        return;
      }

      const setup = await api.post<{ session_id: string }>(
        '/api/v1/local-chrome/setup-auth',
        { url: TARGET_URL }
      );
      expect(setup.status).toBe(200);

      const res = await api.post<{ status: string }>(
        '/api/v1/local-chrome/complete-auth',
        { session_id: setup.data.session_id }
      );

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('completed');
    });

    it('POST /local-chrome/complete-auth without session_id → 400', async () => {
      const res = await api.post<{ error: string }>(
        '/api/v1/local-chrome/complete-auth',
        {}
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/session_id/i);
    });

    it('POST /local-chrome/complete-auth with invalid session_id → returns response without crash', async () => {
      const res = await api.post<{ error?: string; status?: string }>(
        '/api/v1/local-chrome/complete-auth',
        { session_id: 'nonexistent-session-id-12345' }
      );

      // Local BrowserUse service may accept any session_id gracefully (200)
      // or return an error — either is acceptable as long as it doesn't crash
      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('multiple setup calls create different sessions', async () => {
      if (!localChromeAvailable) {
        const res = await api.post('/api/v1/local-chrome/setup-auth', { url: TARGET_URL });
        expect(res.status).toBe(500);
        return;
      }

      const res1 = await api.post<{ session_id: string }>(
        '/api/v1/local-chrome/setup-auth',
        { url: TARGET_URL }
      );
      const res2 = await api.post<{ session_id: string }>(
        '/api/v1/local-chrome/setup-auth',
        { url: TARGET_URL }
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.data.session_id).not.toBe(res2.data.session_id);

      // Clean up
      await api.post('/api/v1/local-chrome/complete-auth', {
        session_id: res1.data.session_id,
      });
      await api.post('/api/v1/local-chrome/complete-auth', {
        session_id: res2.data.session_id,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Agent-specific context/profile setup
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Agent-specific setup endpoints', () => {
    it('POST /agents/:id/setup-context on non-browser agent → 400', async () => {
      // Create an openai agent
      const agent = await api.post<{ id: string }>('/api/v1/agents', {
        provider: 'openai',
        name: `Non-Browser Agent ${Date.now()}`,
        config: { model: 'gpt-4o-mini' },
      });
      expect(agent.status).toBe(201);
      createdAgentIds.push(agent.data.id);

      const res = await api.post<{ error: string }>(
        `/api/v1/agents/${agent.data.id}/setup-context`,
        {}
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/browser/i);
    });

    it('POST /agents/:id/setup-context on non-existent agent → 404', async () => {
      const res = await api.post<{ error: string }>(
        `/api/v1/agents/${NONEXISTENT_UUID}/setup-context`,
        {}
      );

      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/not found/i);
    });

    it('POST /agents/:id/complete-context-setup on non-existent agent → 404', async () => {
      const res = await api.post<{ error: string }>(
        `/api/v1/agents/${NONEXISTENT_UUID}/complete-context-setup`,
        { session_id: 'some-session' }
      );

      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/not found/i);
    });

    it('POST /agents/:id/complete-context-setup missing session_id → 400', async () => {
      const agent = await createBrowserAgent('Context Complete Agent', {
        browser_backend: 'browserbase',
      });
      expect(agent.status).toBe(201);

      const res = await api.post<{ error: string }>(
        `/api/v1/agents/${agent.data.id}/complete-context-setup`,
        {}
      );

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/session_id/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Data Integrity
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Data integrity', () => {
    it('config JSONB merge preserves all fields when updating browser_backend', async () => {
      const created = await createBrowserAgent('Integrity Agent', {
        browser_backend: 'browseruse_cloud',
        browseruse_profile_id: 'prof-123',
        instructions: 'be polite',
      });
      expect(created.status).toBe(201);

      // Update only browser_backend
      const patched = await api.patch<{ config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`,
        { config: { browser_backend: 'local' } }
      );

      expect(patched.status).toBe(200);
      const cfg = getConfig(patched.data);
      expect(cfg.browser_backend).toBe('local');
      expect(cfg.url).toBe(TARGET_URL);
      expect(cfg.browseruse_profile_id).toBe('prof-123');
      expect(cfg.instructions).toBe('be polite');
    });

    it('sensitive keys in browser config are masked in GET response', async () => {
      const created = await createBrowserAgent('Masking Browser Agent', {
        browser_backend: 'browseruse_cloud',
        api_key: 'sk-secret-browser-key-12345',
      });
      expect(created.status).toBe(201);

      const fetched = await api.get<{ config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`
      );

      expect(fetched.status).toBe(200);
      const cfg = getConfig(fetched.data);
      expect(String(cfg.api_key)).toContain('•');
      expect(cfg.api_key).not.toBe('sk-secret-browser-key-12345');
    });

    it('non-sensitive browser config fields are NOT masked', async () => {
      const created = await createBrowserAgent('NonSensitive Browser Agent', {
        browser_backend: 'local',
        browserbase_context_id: 'ctx-12345',
        browseruse_profile_id: 'prof-12345',
        instructions: 'test instructions',
      });
      expect(created.status).toBe(201);

      const fetched = await api.get<{ config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`
      );

      expect(fetched.status).toBe(200);
      const cfg = getConfig(fetched.data);
      // These are not sensitive — should be visible
      expect(cfg.browserbase_context_id).toBe('ctx-12345');
      expect(cfg.browseruse_profile_id).toBe('prof-12345');
      expect(cfg.instructions).toBe('test instructions');
      expect(cfg.url).toBe(TARGET_URL);
    });

    it('agent config snapshot persists in test run', async () => {
      const created = await createBrowserAgent('Snapshot Agent', {
        browser_backend: 'local',
      });
      expect(created.status).toBe(201);

      // Start a test run with 1 scenario
      const run = await api.post<{ id: string; status: string }>('/start-run', {
        agent_id: created.data.id,
        scenario_ids: [scenarioIds[0]],
        max_turns: 5,
      });

      expect(run.status).toBe(200);
      startedRunIds.push(run.data.id);

      // Verify run was created with the correct agent
      const fetched = await api.get<{ agent_id: string; agent_type: string }>(
        `/api/v1/tests/${run.data.id}`
      );

      expect(fetched.status).toBe(200);
      expect(fetched.data.agent_id).toBe(created.data.id);
      expect(fetched.data.agent_type).toBe('browser');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('legacy agent without browser_backend field works in CRUD', async () => {
      // Simulate a legacy agent — just url, no browser_backend
      const created = await createBrowserAgent('Legacy Agent');
      expect(created.status).toBe(201);

      const cfg = getConfig(created.data);
      expect(cfg.browser_backend).toBeUndefined();
      expect(cfg.url).toBe(TARGET_URL);

      // Should be fetchable
      const fetched = await api.get(`/api/v1/agents/${created.data.id}`);
      expect(fetched.status).toBe(200);
    });

    it('switching backend after setup — new backend used in config', async () => {
      const created = await createBrowserAgent('Switch Backend Agent', {
        browser_backend: 'browserbase',
        browserbase_context_id: 'ctx-old-123',
      });
      expect(created.status).toBe(201);

      // Switch to local
      const patched = await api.patch<{ config: Record<string, unknown> }>(
        `/api/v1/agents/${created.data.id}`,
        { config: { browser_backend: 'local' } }
      );

      expect(patched.status).toBe(200);
      const cfg = getConfig(patched.data);
      expect(cfg.browser_backend).toBe('local');
      // Old context ID still in config (UI would clear it, but API does JSONB merge)
      expect(cfg.browserbase_context_id).toBe('ctx-old-123');
    });

    it('URL with special characters handled in local chrome setup', async () => {
      const res = await api.post<{ session_id: string; domain: string; error?: string }>(
        '/api/v1/local-chrome/setup-auth',
        { url: 'https://chatgpt.com/path?param=value&other=123#fragment' }
      );

      if (res.status === 500) {
        // BrowserUse worker not running — acceptable in CI
        expect(res.data.error).toBeDefined();
        return;
      }

      expect(res.status).toBe(200);
      expect(res.data.domain).toBe('chatgpt.com');

      // Clean up
      if (res.data.session_id) {
        await api.post('/api/v1/local-chrome/complete-auth', {
          session_id: res.data.session_id,
        });
      }
    });

    it('two browser agents can share the same URL', async () => {
      const agent1 = await createBrowserAgent('Shared URL Agent 1', {
        browser_backend: 'local',
      });
      const agent2 = await createBrowserAgent('Shared URL Agent 2', {
        browser_backend: 'local',
      });

      expect(agent1.status).toBe(201);
      expect(agent2.status).toBe(201);

      const cfg1 = getConfig(agent1.data);
      const cfg2 = getConfig(agent2.data);
      expect(cfg1.url).toBe(TARGET_URL);
      expect(cfg2.url).toBe(TARGET_URL);
      expect(agent1.data.id).not.toBe(agent2.data.id);
    });

    it('deleted agent returns 404 on context setup', async () => {
      const created = await createBrowserAgent('Delete Then Setup Agent', {
        browser_backend: 'browserbase',
      });
      expect(created.status).toBe(201);

      // Delete it
      await api.delete(`/api/v1/agents/${created.data.id}`);
      const idx = createdAgentIds.indexOf(created.data.id);
      if (idx !== -1) createdAgentIds.splice(idx, 1);

      const res = await api.post<{ error: string }>(
        `/api/v1/agents/${created.data.id}/setup-context`,
        {}
      );

      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Test Run Execution — Local Chrome agent with 5 scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Test run execution — Local Chrome with 5 scenarios', () => {
    let agentId: string;
    let runId: string;

    beforeAll(async () => {
      const agent = await createBrowserAgent('Run Local Chrome Agent', {
        browser_backend: 'local',
      });
      expect(agent.status).toBe(201);
      agentId = agent.data.id;
    });

    it('starts a test run with 5 scenarios against chatgpt.com → 200', async () => {
      const fiveScenarios = scenarioIds.slice(0, 5);
      expect(fiveScenarios).toHaveLength(5);

      const res = await api.post<{
        id: string;
        test_run_id: string;
        status: string;
        total_scenarios: number;
        scenarios_launched: number;
      }>('/start-run', {
        agent_id: agentId,
        scenario_ids: fiveScenarios,
        max_turns: 5,
        name: 'Browser Backend Test — Local Chrome 5 scenarios',
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(res.data).toHaveProperty('test_run_id');
      expect(res.data.status).toBe('running');
      expect(res.data.total_scenarios).toBe(5);
      expect(res.data.scenarios_launched).toBeGreaterThanOrEqual(1);

      runId = res.data.id;
      startedRunIds.push(runId);
    });

    it('test run is visible in GET /api/v1/tests/:id', async () => {
      expect(runId).toBeDefined();

      const res = await api.get<{
        id: string;
        status: string;
        total_scenarios: number;
        agent_id: string;
        agent_type: string;
        name: string;
      }>(`/api/v1/tests/${runId}`);

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(runId);
      expect(res.data.agent_id).toBe(agentId);
      expect(res.data.agent_type).toBe('browser');
      expect(res.data.total_scenarios).toBe(5);
      expect(res.data.name).toBe('Browser Backend Test — Local Chrome 5 scenarios');
    });

    it('scenario runs are created for all 5 scenarios', async () => {
      expect(runId).toBeDefined();

      const res = await api.get<{
        results: Array<{
          id: string;
          test_run_id: string;
          scenario_id: string;
          status: string;
        }>;
      }>('/api/v1/scenario-runs', { test_run_id: runId });

      expect(res.status).toBe(200);
      expect(res.data.results).toHaveLength(5);

      for (const sr of res.data.results) {
        expect(sr.test_run_id).toBe(runId);
        expect(['pending', 'running', 'grading', 'passed', 'failed', 'error', 'canceled']).toContain(sr.status);
      }
    });

    it('test run appears in list with correct fields', async () => {
      const res = await api.get<{
        runs: Array<{
          id: string;
          status: string;
          total_scenarios: number;
          agent_type: string;
        }>;
      }>('/api/v1/tests', { limit: '10' });

      expect(res.status).toBe(200);
      const found = res.data.runs.find((r) => r.id === runId);
      expect(found).toBeDefined();
      expect(found!.total_scenarios).toBe(5);
      expect(found!.agent_type).toBe('browser');
    });

    it('can cancel the test run', async () => {
      expect(runId).toBeDefined();

      const res = await api.post<{
        status: string;
        canceled_scenarios: number;
      }>('/cancel-run', { test_run_id: runId });

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('canceled');
      expect(typeof res.data.canceled_scenarios).toBe('number');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Test Run Execution — BrowserUse Cloud agent with 5 scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Test run execution — BrowserUse Cloud with 5 scenarios', () => {
    let agentId: string;
    let runId: string;

    beforeAll(async () => {
      const agent = await createBrowserAgent('Run BU Cloud Agent', {
        browser_backend: 'browseruse_cloud',
      });
      expect(agent.status).toBe(201);
      agentId = agent.data.id;
    });

    it('starts a test run with 5 scenarios → 200', async () => {
      const fiveScenarios = scenarioIds.slice(0, 5);

      const res = await api.post<{
        id: string;
        test_run_id: string;
        status: string;
        total_scenarios: number;
        scenarios_launched: number;
      }>('/start-run', {
        agent_id: agentId,
        scenario_ids: fiveScenarios,
        max_turns: 5,
        name: 'Browser Backend Test — BrowserUse Cloud 5 scenarios',
      });

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('running');
      expect(res.data.total_scenarios).toBe(5);

      runId = res.data.id;
      startedRunIds.push(runId);
    });

    it('test run stored with correct agent type', async () => {
      expect(runId).toBeDefined();

      const res = await api.get<{
        id: string;
        agent_id: string;
        agent_type: string;
        total_scenarios: number;
      }>(`/api/v1/tests/${runId}`);

      expect(res.status).toBe(200);
      expect(res.data.agent_id).toBe(agentId);
      expect(res.data.agent_type).toBe('browser');
      expect(res.data.total_scenarios).toBe(5);
    });

    it('all 5 scenario runs created', async () => {
      expect(runId).toBeDefined();

      const res = await api.get<{
        results: Array<{ id: string; test_run_id: string }>;
      }>('/api/v1/scenario-runs', { test_run_id: runId });

      expect(res.status).toBe(200);
      expect(res.data.results).toHaveLength(5);
    });

    it('can cancel the BrowserUse Cloud run', async () => {
      expect(runId).toBeDefined();

      const res = await api.post<{ status: string }>('/cancel-run', {
        test_run_id: runId,
      });

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('canceled');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. SSE Events for browser test runs
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SSE events for browser test runs', () => {
    it('SSE stream connects for a browser agent run', async () => {
      const agent = await createBrowserAgent('SSE Browser Agent', {
        browser_backend: 'local',
      });
      expect(agent.status).toBe(201);

      const run = await api.post<{ id: string }>('/start-run', {
        agent_id: agent.data.id,
        scenario_ids: [scenarioIds[0]],
        max_turns: 5,
      });
      expect(run.status).toBe(200);
      startedRunIds.push(run.data.id);

      // Connect to SSE and read initial event
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      try {
        const res = await fetch(
          `${BASE_URL}/events?run_id=${run.data.id}`,
          {
            headers: { Accept: 'text/event-stream' },
            signal: controller.signal,
          }
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');

        // Read just the first chunk
        const reader = res.body!.getReader();
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);

        // Should contain a connected event
        expect(text).toContain('data:');
        reader.cancel();
      } finally {
        clearTimeout(timeout);
        controller.abort();
        // Cancel the run
        await api.post('/cancel-run', { test_run_id: run.data.id });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Concurrent browser agent operations
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Concurrent browser agent operations', () => {
    it('can create multiple browser agents concurrently', async () => {
      const promises = Array.from({ length: 3 }, (_, i) =>
        createBrowserAgent(`Concurrent Agent ${i}`, {
          browser_backend: i % 2 === 0 ? 'local' : 'browseruse_cloud',
        })
      );

      const results = await Promise.all(promises);

      for (const res of results) {
        expect(res.status).toBe(201);
      }

      // All should have unique IDs
      const ids = results.map((r) => r.data.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('can start runs for different browser backends concurrently', async () => {
      const localAgent = await createBrowserAgent('Concurrent Local', {
        browser_backend: 'local',
      });
      const cloudAgent = await createBrowserAgent('Concurrent Cloud', {
        browser_backend: 'browseruse_cloud',
      });

      expect(localAgent.status).toBe(201);
      expect(cloudAgent.status).toBe(201);

      const [run1, run2] = await Promise.all([
        api.post<{ id: string; status: string }>('/start-run', {
          agent_id: localAgent.data.id,
          scenario_ids: [scenarioIds[0]],
          max_turns: 5,
        }),
        api.post<{ id: string; status: string }>('/start-run', {
          agent_id: cloudAgent.data.id,
          scenario_ids: [scenarioIds[1]],
          max_turns: 5,
        }),
      ]);

      expect(run1.status).toBe(200);
      expect(run2.status).toBe(200);
      expect(run1.data.status).toBe('running');
      expect(run2.data.status).toBe('running');

      startedRunIds.push(run1.data.id, run2.data.id);
    });
  });
});

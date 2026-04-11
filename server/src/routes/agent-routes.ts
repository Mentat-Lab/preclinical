import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { randomUUID } from 'crypto';
import { RUNNABLE_PROVIDERS, maskAgent } from './route-utils.js';
import { config } from '../lib/config.js';
import { validateSession, closeSession, getClient } from '../providers/browser/api.js';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'agent-routes' });

/**
 * Auto-create a Browser Use Cloud profile for a browser agent config
 * that has a URL but no profile_id. Mutates `agentConfig` in place.
 */
async function ensureBrowserProfile(agentConfig: Record<string, unknown>): Promise<void> {
  const profileId = String(agentConfig.profile_id || agentConfig.profileId || '').trim();
  if (profileId) return; // already has one

  const targetUrl = String(agentConfig.url || agentConfig.endpoint || '').trim();
  if (!targetUrl) return; // no URL to derive domain from

  const apiKey = config.browserUseApiKey.trim();
  if (!apiKey) return; // can't create without API key

  let domain: string;
  try {
    domain = new URL(targetUrl).hostname.replace(/^www\./, '');
  } catch {
    return; // invalid URL, skip
  }

  try {
    const client = getClient(apiKey);
    const profile = await client.profiles.create({ name: `preclinical-${domain}` });
    agentConfig.profile_id = profile.id;
    logger.info('Auto-created Browser Use Cloud profile', { profileId: profile.id, domain });
  } catch (err) {
    logger.warn('Failed to auto-create browser profile', { domain, error: err });
  }
}

const app = new Hono();

// ==================== AGENTS ====================

app.get('/api/v1/agents', async (c) => {
  const agents = await sql`SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY provider, name`;
  return c.json(agents.map((a) => maskAgent(a as Record<string, unknown>)));
});

app.get('/api/v1/agents/:id', async (c) => {
  const id = c.req.param('id');
  const [agent] = await sql`SELECT * FROM agents WHERE id = ${id} AND deleted_at IS NULL`;
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  return c.json(maskAgent(agent as Record<string, unknown>));
});

app.post('/api/v1/agents', async (c) => {
  const body = await c.req.json();

  const { provider, name, description, config: agentConfig } = body;
  if (!provider || !name) {
    return c.json({ error: 'provider and name are required' }, 400);
  }
  if (!RUNNABLE_PROVIDERS.has(provider)) {
    return c.json({
      error: `Unsupported provider: ${provider}. Supported providers: ${Array.from(RUNNABLE_PROVIDERS).join(', ')}`,
    }, 400);
  }

  // Auto-create a Browser Use Cloud profile if this is a browser agent without one
  const finalConfig = agentConfig || {};
  if (provider === 'browser') {
    await ensureBrowserProfile(finalConfig as Record<string, unknown>);
  }

  const id = randomUUID();
  const [agent] = await sql`
    INSERT INTO agents (id, provider, name, description, config)
    VALUES (${id}, ${provider}, ${name}, ${description || null}, ${finalConfig})
    RETURNING *
  `;

  return c.json(maskAgent(agent as Record<string, unknown>), 201);
});

app.patch('/api/v1/agents/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const [existing] = await sql`SELECT * FROM agents WHERE id = ${id}`;
  if (!existing) return c.json({ error: 'Agent not found' }, 404);

  if (body.config !== undefined) {
    // Auto-create a Browser Use Cloud profile if updating a browser agent with a URL but no profile_id
    if (existing.provider === 'browser') {
      const mergedConfig = { ...((existing.config || {}) as Record<string, unknown>), ...(body.config as Record<string, unknown>) };
      if (!mergedConfig.profile_id && !mergedConfig.profileId) {
        await ensureBrowserProfile(body.config as Record<string, unknown>);
      }
    }
    // Merge partial config with existing config (so unedited secret fields are preserved)
    await sql`UPDATE agents SET updated_at = NOW(), config = config || ${sql.json(body.config as any)} WHERE id = ${id}`;
  }

  if (body.name !== undefined || body.description !== undefined) {
    const simpleUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) simpleUpdates.name = body.name;
    if (body.description !== undefined) simpleUpdates.description = body.description;
    await sql`UPDATE agents SET ${sql(simpleUpdates as Record<string, string>, ...Object.keys(simpleUpdates))} WHERE id = ${id}`;
  } else if (body.config === undefined) {
    // At least touch updated_at
    await sql`UPDATE agents SET updated_at = NOW() WHERE id = ${id}`;
  }

  const [agent] = await sql`SELECT * FROM agents WHERE id = ${id}`;

  return c.json(maskAgent(agent as Record<string, unknown>));
});

// Validate a browser agent's profile — preflight check before running tests.
// Returns { ok, live_url, session_id, error? }
app.post('/api/v1/agents/:id/validate-browser', async (c) => {
  const id = c.req.param('id');
  const [agent] = await sql`SELECT * FROM agents WHERE id = ${id} AND deleted_at IS NULL`;
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (agent.provider !== 'browser') return c.json({ error: 'Only browser agents can be validated' }, 400);

  const apiKey = config.browserUseApiKey.trim();
  if (!apiKey) return c.json({ error: 'BROWSER_USE_API_KEY not configured' }, 500);

  const agentConfig = (agent.config || {}) as Record<string, unknown>;
  const targetUrl = String(agentConfig.url || agentConfig.endpoint || '').trim();
  if (!targetUrl) return c.json({ error: 'Agent missing url in config' }, 400);

  const profileId = String(agentConfig.profile_id || agentConfig.profileId || '').trim() || undefined;

  const result = await validateSession(apiKey, { profileId, targetUrl });
  return c.json({
    ok: result.ok,
    live_url: result.liveUrl,
    session_id: result.sessionId,
    error: result.error || null,
  });
});

// Close a validation session (called after user finishes manual auth).
app.post('/api/v1/agents/:id/close-session', async (c) => {
  const body = await c.req.json();
  const sessionId = body.session_id;
  if (!sessionId) return c.json({ error: 'session_id required' }, 400);

  const apiKey = config.browserUseApiKey.trim();
  if (!apiKey) return c.json({ error: 'BROWSER_USE_API_KEY not configured' }, 500);

  await closeSession(apiKey, sessionId);
  return c.json({ ok: true });
});

app.delete('/api/v1/agents/:id', async (c) => {
  const id = c.req.param('id');

  const [existing] = await sql`SELECT id FROM agents WHERE id = ${id}`;
  if (!existing) return c.json({ error: 'Agent not found' }, 404);

  await sql`UPDATE agents SET deleted_at = NOW() WHERE id = ${id}`;
  return c.body(null, 204);
});

export default app;

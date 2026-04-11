import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { randomUUID } from 'crypto';
import { RUNNABLE_PROVIDERS, maskAgent } from './route-utils.js';
import { config } from '../lib/config.js';
import { validateSession } from '../providers/browser/api.js';

const app = new Hono();

// ==================== AGENTS ====================

app.get('/api/v1/agents', async (c) => {
  const agents = await sql`SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY provider, name`;
  return c.json(agents.map((a) => maskAgent(a as Record<string, unknown>)));
});

// Validate a browser profile before creating an agent (no agent ID required).
// Session is auto-closed after validation.
app.post('/api/v1/agents/validate-browser', async (c) => {
  const body = await c.req.json();
  const targetUrl = String(body.url || '').trim();
  const profileId = String(body.profile_id || '').trim() || undefined;

  if (!targetUrl) return c.json({ error: 'url is required' }, 400);
  if (!profileId) return c.json({ error: 'profile_id is required' }, 400);

  const apiKey = config.browserUseApiKey.trim();
  if (!apiKey) return c.json({ error: 'BROWSER_USE_API_KEY not configured' }, 500);

  try {
    const result = await validateSession(apiKey, { profileId, targetUrl });
    return c.json({ ok: result.ok, error: result.error || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 200);
  }
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

  const finalConfig = agentConfig || {};
  if (provider === 'browser') {
    const profileId = String((finalConfig as Record<string, unknown>).profile_id || (finalConfig as Record<string, unknown>).profileId || '').trim();
    if (!profileId) {
      return c.json({ error: 'Browser Use Profile ID is required. Create one at https://cloud.browser-use.com/settings?tab=profiles' }, 400);
    }
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
    // For browser agents, ensure profile_id is not removed
    if (existing.provider === 'browser') {
      const merged = { ...(existing.config || {}), ...body.config };
      const profileId = String(merged.profile_id || merged.profileId || '').trim();
      if (!profileId) {
        return c.json({ error: 'Browser Use Profile ID is required. Create one at https://cloud.browser-use.com/settings?tab=profiles' }, 400);
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

// Validate an existing browser agent's profile. Session is auto-closed after check.
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

  try {
    const result = await validateSession(apiKey, { profileId, targetUrl });
    return c.json({ ok: result.ok, error: result.error || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 200);
  }
});

app.delete('/api/v1/agents/:id', async (c) => {
  const id = c.req.param('id');

  const [existing] = await sql`SELECT id FROM agents WHERE id = ${id}`;
  if (!existing) return c.json({ error: 'Agent not found' }, 404);

  await sql`UPDATE agents SET deleted_at = NOW() WHERE id = ${id}`;
  return c.body(null, 204);
});

export default app;

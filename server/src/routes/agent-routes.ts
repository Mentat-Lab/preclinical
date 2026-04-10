import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { randomUUID } from 'crypto';
import { log } from '../lib/logger.js';
import { discoverProfile } from '../providers/browser/browser.js';
import { RUNNABLE_PROVIDERS, maskAgent, maskConfig } from './route-utils.js';

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

  const id = randomUUID();
  const [agent] = await sql`
    INSERT INTO agents (id, provider, name, description, config)
    VALUES (${id}, ${provider}, ${name}, ${description || null}, ${agentConfig || {}})
    RETURNING *
  `;

  return c.json(maskAgent(agent as Record<string, unknown>), 201);
});

app.patch('/api/v1/agents/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const [existing] = await sql`SELECT id FROM agents WHERE id = ${id}`;
  if (!existing) return c.json({ error: 'Agent not found' }, 404);

  if (body.config !== undefined) {
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

app.delete('/api/v1/agents/:id', async (c) => {
  const id = c.req.param('id');

  const [existing] = await sql`SELECT id FROM agents WHERE id = ${id}`;
  if (!existing) return c.json({ error: 'Agent not found' }, 404);

  await sql`UPDATE agents SET deleted_at = NOW() WHERE id = ${id}`;
  return c.body(null, 204);
});

// ==================== AGENT DISCOVERY ====================

app.post('/api/v1/agents/:id/discover', async (c) => {
  const id = c.req.param('id');
  const [agent] = await sql`SELECT * FROM agents WHERE id = ${id} AND deleted_at IS NULL`;
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  if (agent.provider !== 'browser') {
    return c.json({ error: 'Discovery is only supported for browser agents' }, 400);
  }

  const agentConfig = (agent.config || {}) as Record<string, unknown>;
  const targetUrl = String(agentConfig.url || agentConfig.endpoint || '');
  if (!targetUrl) {
    return c.json({ error: 'Agent missing url in config' }, 400);
  }

  // Optional: override validate from request body
  let validate = true;
  try {
    const body = await c.req.json();
    if (body.validate === false) validate = false;
  } catch { /* no body is fine */ }

  const credentials = {
    email: String(agentConfig.email || ''),
    password: String(agentConfig.password || ''),
  };

  try {
    log.info('Starting discovery', { agentId: id, url: targetUrl });

    const result = await discoverProfile(
      targetUrl,
      credentials.email ? credentials : undefined,
      validate,
    );

    // Save discovered profile fields into agent config (merge, don't overwrite credentials)
    const profileUpdate: Record<string, unknown> = {};
    const profileFields = [
      'browser_setup_instructions', 'browser_chat_instructions',
      'browser_overlay_hint', 'browser_login_instructions',
      'requires_auth', 'auth_methods', 'page_type',
    ];
    const profileObj = result.profile as unknown as Record<string, unknown>;
    for (const key of profileFields) {
      if (profileObj[key] !== undefined) {
        profileUpdate[key] = profileObj[key];
      }
    }

    if (Object.keys(profileUpdate).length > 0) {
      await sql`UPDATE agents SET updated_at = NOW(), config = config || ${sql.json(profileUpdate as any)} WHERE id = ${id}`;
    }

    const [updated] = await sql`SELECT * FROM agents WHERE id = ${id}`;

    return c.json({
      agent: maskAgent(updated as Record<string, unknown>),
      discovery: result.discovery,
      profile: result.profile,
      validated: result.validated,
      validation_response: result.validationResponse,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('Discovery failed', { agentId: id, error: message });
    return c.json({ error: `Discovery failed: ${message}` }, 500);
  }
});

// ── Local Chrome auth helpers ───────────────────────────────────────
app.post('/api/v1/local-chrome/setup-auth', async (c) => {
  let url = '';
  try {
    const body = await c.req.json();
    url = body.url || '';
  } catch {}

  const browserUseBase = process.env.BROWSER_USE_API_BASE || 'http://browseruse:9000/api/v2';
  const domain = url ? new URL(url).hostname.replace(/^www\./, '') : '';

  try {
    const res = await fetch(`${browserUseBase}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });
    if (!res.ok) return c.json({ error: `Failed to create session: ${await res.text()}` }, res.status as any);
    const data = await res.json() as Record<string, unknown>;

    return c.json({
      session_id: String(data.id),
      domain,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

app.post('/api/v1/local-chrome/complete-auth', async (c) => {
  let sessionId: string;
  try {
    const body = await c.req.json();
    sessionId = body.session_id;
  } catch { return c.json({ error: 'session_id is required' }, 400); }
  if (!sessionId) return c.json({ error: 'session_id is required' }, 400);

  const browserUseBase = process.env.BROWSER_USE_API_BASE || 'http://browseruse:9000/api/v2';

  try {
    const res = await fetch(`${browserUseBase}/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    if (!res.ok) return c.json({ error: `Failed to stop session: ${await res.text()}` }, res.status as any);
    return c.json({ status: 'completed' });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

export default app;

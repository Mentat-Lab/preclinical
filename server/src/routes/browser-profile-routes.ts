import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { maskConfig } from './route-utils.js';

const app = new Hono();

function maskBrowserProfile(profile: Record<string, unknown>) {
  return { ...profile, credentials: maskConfig(profile.credentials as Record<string, unknown>) };
}

// ==================== BROWSER PROFILES ====================

app.get('/api/v1/browser-profiles', async (c) => {
  const profiles = await sql`SELECT * FROM browser_profiles WHERE is_active = TRUE ORDER BY domain`;
  return c.json(profiles.map((p) => maskBrowserProfile(p as Record<string, unknown>)));
});

app.get('/api/v1/browser-profiles/:id', async (c) => {
  const id = c.req.param('id');
  const [profile] = await sql`
    SELECT * FROM browser_profiles
    WHERE (id::text = ${id} OR domain = ${id}) AND is_active = TRUE
  `;
  if (!profile) return c.json({ error: 'Browser profile not found' }, 404);
  return c.json(maskBrowserProfile(profile as Record<string, unknown>));
});

app.post('/api/v1/browser-profiles', async (c) => {
  const body = await c.req.json();
  const { domain, name, requires_auth, email_verification, auth_domains, credentials, config: profileConfig, source } = body;

  if (!domain) return c.json({ error: 'domain is required' }, 400);

  try {
    const [created] = await sql`
      INSERT INTO browser_profiles (domain, name, requires_auth, email_verification, auth_domains, credentials, config, source)
      VALUES (
        ${domain},
        ${name || ''},
        ${!!requires_auth},
        ${!!email_verification},
        ${auth_domains || []},
        ${sql.json(credentials || {})},
        ${sql.json(profileConfig || {})},
        ${source || 'manual'}
      )
      RETURNING *
    `;
    return c.json(maskBrowserProfile(created as Record<string, unknown>), 201);
  } catch (err: any) {
    if (err.code === '23505') return c.json({ error: `Profile for domain '${domain}' already exists` }, 409);
    throw err;
  }
});

app.patch('/api/v1/browser-profiles/:id', async (c) => {
  const id = c.req.param('id');
  const [existing] = await sql`
    SELECT * FROM browser_profiles WHERE (id::text = ${id} OR domain = ${id}) AND is_active = TRUE
  `;
  if (!existing) return c.json({ error: 'Browser profile not found' }, 404);

  const body = await c.req.json();
  const updates: Record<string, unknown> = {};

  if ('name' in body) updates.name = body.name;
  if ('requires_auth' in body) updates.requires_auth = !!body.requires_auth;
  if ('email_verification' in body) updates.email_verification = !!body.email_verification;
  if ('auth_domains' in body) updates.auth_domains = body.auth_domains;
  if ('source' in body) updates.source = body.source;

  // Config and credentials: merge with existing (JSONB ||)
  let configPatch = '';
  let credentialsPatch = '';
  if (body.config) configPatch = JSON.stringify(body.config);
  if (body.credentials) credentialsPatch = JSON.stringify(body.credentials);

  const profileId = (existing as any).id;

  if (Object.keys(updates).length > 0) {
    await sql`UPDATE browser_profiles SET ${sql(updates, ...Object.keys(updates))} WHERE id = ${profileId}`;
  }
  if (configPatch) {
    await sql`UPDATE browser_profiles SET config = config || ${configPatch}::jsonb WHERE id = ${profileId}`;
  }
  if (credentialsPatch) {
    await sql`UPDATE browser_profiles SET credentials = credentials || ${credentialsPatch}::jsonb WHERE id = ${profileId}`;
  }

  const [updated] = await sql`SELECT * FROM browser_profiles WHERE id = ${profileId}`;
  return c.json(maskBrowserProfile(updated as Record<string, unknown>));
});

app.delete('/api/v1/browser-profiles/:id', async (c) => {
  const id = c.req.param('id');
  const [existing] = await sql`
    SELECT * FROM browser_profiles WHERE (id::text = ${id} OR domain = ${id}) AND is_active = TRUE
  `;
  if (!existing) return c.json({ error: 'Browser profile not found' }, 404);

  await sql`UPDATE browser_profiles SET is_active = FALSE WHERE id = ${(existing as any).id}`;
  return c.body(null, 204);
});

export default app;

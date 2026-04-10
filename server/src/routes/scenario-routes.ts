import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { generateScenario, generateScenarios } from '../shared/scenario-generator.js';
import { log } from '../lib/logger.js';

const app = new Hono();

// ==================== SCENARIOS ====================

app.get('/api/v1/scenarios', async (c) => {
  const tag = c.req.query('tag');
  const scenarios = tag
    ? await sql`
        SELECT * FROM scenarios
        WHERE is_active = true AND approved = true AND ${tag} = ANY(tags)
        ORDER BY name
      `
    : await sql`
        SELECT * FROM scenarios
        WHERE is_active = true AND approved = true
        ORDER BY name
      `;
  return c.json({ scenarios, total: scenarios.length });
});

app.get('/api/v1/scenarios/:id', async (c) => {
  const id = c.req.param('id');
  const [scenario] = await sql`SELECT * FROM scenarios WHERE scenario_id = ${id}`;
  if (!scenario) return c.json({ error: 'Scenario not found' }, 404);
  return c.json(scenario);
});

app.patch('/api/v1/scenarios/:id', async (c) => {
  const id = c.req.param('id');
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  const [existing] = await sql`SELECT scenario_id FROM scenarios WHERE scenario_id = ${id}`;
  if (!existing) return c.json({ error: 'Scenario not found' }, 404);

  const simple: Record<string, unknown> = {};
  if (body.name !== undefined) simple.name = body.name;
  if (body.category !== undefined) simple.category = body.category || null;
  if (body.scenario_type !== undefined) simple.scenario_type = body.scenario_type;
  if (body.is_active !== undefined) simple.is_active = body.is_active;
  if (body.approved !== undefined) simple.approved = body.approved;
  if (body.priority !== undefined) simple.priority = body.priority ?? null;

  if (Object.keys(simple).length > 0) {
    await sql`UPDATE scenarios SET ${sql(simple as Record<string, string>, ...Object.keys(simple))} WHERE scenario_id = ${id}`;
  }

  if (body.content !== undefined) {
    await sql`UPDATE scenarios SET content = ${sql.json(body.content as any)} WHERE scenario_id = ${id}`;
  }

  if (body.rubric_criteria !== undefined) {
    await sql`UPDATE scenarios SET rubric_criteria = ${sql.json(body.rubric_criteria as any)} WHERE scenario_id = ${id}`;
  }

  if (body.tags !== undefined) {
    await sql`UPDATE scenarios SET tags = ${body.tags as string[]} WHERE scenario_id = ${id}`;
  }

  const [updated] = await sql`SELECT * FROM scenarios WHERE scenario_id = ${id}`;
  return c.json(updated);
});

app.delete('/api/v1/scenarios/:id', async (c) => {
  const id = c.req.param('id');
  const [existing] = await sql`SELECT scenario_id FROM scenarios WHERE scenario_id = ${id}`;
  if (!existing) return c.json({ error: 'Scenario not found' }, 404);
  await sql`UPDATE scenarios SET is_active = false WHERE scenario_id = ${id}`;
  return c.body(null, 204);
});

/**
 * POST /api/v1/scenarios/generate
 *
 * Generate a structured scenario from pasted clinical text (SOP, guideline, protocol).
 * Uses the tester LLM to extract patient demographics, chief complaint, SOP directives,
 * and rubric criteria, then inserts the result into the scenarios table.
 *
 * Request body:
 *   { text: string, category?: string, name?: string }
 *
 * Returns the inserted scenario row (201).
 */
app.post('/api/v1/scenarios/generate', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  const { text, category, name, tags } = body as Record<string, unknown>;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return c.json({ error: 'text is required and must be a non-empty string' }, 400);
  }

  if (category !== undefined && typeof category !== 'string') {
    return c.json({ error: 'category must be a string' }, 400);
  }

  if (name !== undefined && typeof name !== 'string') {
    return c.json({ error: 'name must be a string' }, 400);
  }

  if (tags !== undefined && (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== 'string'))) {
    return c.json({ error: 'tags must be an array of strings' }, 400);
  }

  try {
    const scenario = await generateScenario({
      text,
      category: category as string | undefined,
      name: name as string | undefined,
      tags: tags as string[] | undefined,
    });
    return c.json(scenario, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.child({ component: 'scenarios' }).error('LLM or DB error during scenario generation', { message });
    return c.json({ error: `Scenario generation failed: ${message}` }, 500);
  }
});

/**
 * POST /api/v1/scenarios/generate-batch
 *
 * Generate multiple scenarios from a large clinical document.
 * The LLM identifies distinct testable processes and creates one scenario per process.
 *
 * Request body:
 *   { text: string, category?: string, tags?: string[] }
 *
 * Returns array of inserted scenarios (201).
 */
app.post('/api/v1/scenarios/generate-batch', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  const { text, category, tags } = body as Record<string, unknown>;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return c.json({ error: 'text is required and must be a non-empty string' }, 400);
  }

  if (category !== undefined && typeof category !== 'string') {
    return c.json({ error: 'category must be a string' }, 400);
  }

  if (tags !== undefined && (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== 'string'))) {
    return c.json({ error: 'tags must be an array of strings' }, 400);
  }

  try {
    const scenarios = await generateScenarios({
      text,
      category: category as string | undefined,
      tags: tags as string[] | undefined,
    });
    return c.json({ scenarios, total: scenarios.length }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.child({ component: 'scenarios' }).error('Batch scenario generation failed', { message });
    return c.json({ error: `Batch scenario generation failed: ${message}` }, 500);
  }
});

export default app;

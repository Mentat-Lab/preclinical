import { Hono } from 'hono';
import { sql, emitEvent } from '../lib/db.js';
import { randomUUID } from 'crypto';
import { generateScenario, generateScenarios } from '../shared/scenario-generator.js';
import { log } from '../lib/logger.js';
import { listProviders } from '../providers/index.js';

const app = new Hono();

// ── Helpers ──────────────────────────────────────────────────────────

const RUNNABLE_PROVIDERS = new Set(listProviders());
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /auth/i,
  /credential/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function maskSecret(value: string): string {
  if (value.length === 0) return '';
  return value.length > 8
    ? `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 4, 20))}`
    : '•'.repeat(value.length);
}

function maskConfig(config: unknown): unknown {
  if (Array.isArray(config)) {
    return config.map((item) => maskConfig(item));
  }
  if (!config || typeof config !== 'object') {
    return config ?? null;
  }

  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string' && isSensitiveKey(k)) {
      masked[k] = maskSecret(v);
      continue;
    }
    masked[k] = maskConfig(v);
  }
  return masked;
}

function maskAgent(agent: Record<string, unknown>) {
  return { ...agent, config: maskConfig(agent.config as Record<string, unknown>) };
}

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

// ==================== TESTS (runs) ====================

app.get('/api/v1/tests', async (c) => {
  const limit = Math.max(1, Math.min(100, parseInt(c.req.query('limit') || '25', 10) || 25));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0);
  const status = c.req.query('status');

  const [runs, [{ count }]] = await Promise.all([
    status
      ? sql`SELECT * FROM test_runs WHERE deleted_at IS NULL AND status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : sql`SELECT * FROM test_runs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    status
      ? sql`SELECT COUNT(*) as count FROM test_runs WHERE deleted_at IS NULL AND status = ${status}`
      : sql`SELECT COUNT(*) as count FROM test_runs WHERE deleted_at IS NULL`,
  ]);

  return c.json({ runs, total: parseInt(count as string, 10) });
});

app.get('/api/v1/tests/:id', async (c) => {
  const id = c.req.param('id');
  const [run] = await sql`
    SELECT * FROM test_runs
    WHERE id::text = ${id} OR test_run_id = ${id}
  `;
  if (!run) return c.json({ error: 'Test run not found' }, 404);
  return c.json(run);
});

app.delete('/api/v1/tests/:id', async (c) => {
  const id = c.req.param('id');

  const [run] = await sql`
    SELECT * FROM test_runs
    WHERE (id::text = ${id} OR test_run_id = ${id}) AND deleted_at IS NULL
  `;
  if (!run) return c.json({ error: 'Test run not found' }, 404);

  const canceledAt = new Date().toISOString();

  // If the run is active, cancel it and any active scenario runs before hiding it.
  if (run.status === 'pending' || run.status === 'running' || run.status === 'grading' || run.status === 'scheduled') {
    await sql`
      UPDATE test_runs
      SET status = 'canceled', canceled_at = COALESCE(canceled_at, ${canceledAt})
      WHERE id = ${run.id}
    `;

    await sql`
      UPDATE scenario_runs
      SET status = 'canceled', canceled_at = COALESCE(canceled_at, ${canceledAt})
      WHERE test_run_id = ${run.id} AND status IN ('pending', 'running', 'grading')
    `;
  }

  await sql`UPDATE test_runs SET deleted_at = NOW() WHERE id = ${run.id}`;
  await emitEvent(run.id, 'test_run_deleted', {});
  return c.body(null, 204);
});

// ==================== TEST RUN CSV EXPORT ====================

app.get('/api/v1/tests/:id/export-csv', async (c) => {
  const id = c.req.param('id');
  const [run] = await sql`
    SELECT * FROM test_runs
    WHERE (id::text = ${id} OR test_run_id = ${id}) AND deleted_at IS NULL
  `;
  if (!run) return c.json({ error: 'Test run not found' }, 404);

  const rows = await sql`
    SELECT
      sr.id              AS scenario_run_id,
      sr.scenario_id,
      sr.status,
      sr.transcript,
      sr.duration_ms,
      sr.error_code,
      sr.error_message,
      sr.started_at,
      sr.completed_at,
      s.name             AS scenario_name,
      s.content          AS scenario_content,
      g.passed,
      g.summary          AS grade_summary,
      g.criteria_results,
      g.total_points,
      g.max_points,
      g.score_percent,
      g.triage_result,
      g.gold_standard,
      g.triage_correct
    FROM scenario_runs sr
    LEFT JOIN scenarios s ON sr.scenario_id = s.scenario_id
    LEFT JOIN LATERAL (
      SELECT * FROM gradings WHERE scenario_run_id = sr.id ORDER BY created_at DESC LIMIT 1
    ) g ON true
    WHERE sr.test_run_id = ${run.id}
    ORDER BY s.name, sr.created_at
  `;

  // -- Helpers --
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const wordCount = (text: string): number =>
    text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;

  // Flesch-Kincaid Grade Level
  const syllableCount = (word: string): number => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    let count = 0;
    const vowels = 'aeiouy';
    let prevVowel = false;
    for (const ch of w) {
      const isVowel = vowels.includes(ch);
      if (isVowel && !prevVowel) count++;
      prevVowel = isVowel;
    }
    if (w.endsWith('e') && count > 1) count--;
    return Math.max(1, count);
  };

  const fleschKincaid = (text: string): number | null => {
    if (!text.trim()) return null;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    if (sentences.length === 0 || words.length === 0) return null;
    const totalSyllables = words.reduce((sum, w) => sum + syllableCount(w), 0);
    const grade = 0.39 * (words.length / sentences.length) + 11.8 * (totalSyllables / words.length) - 15.59;
    return Math.round(grade * 10) / 10;
  };

  // -- Build CSV headers --
  // Find max turns across all scenarios to create per-turn columns
  let maxTurnsSeen = 0;
  for (const row of rows) {
    const transcript = Array.isArray(row.transcript) ? row.transcript : [];
    const turns = transcript.filter((e: any) => e.role === 'target').length;
    if (turns > maxTurnsSeen) maxTurnsSeen = turns;
  }

  const headers = [
    'case_id',
    'scenario_name',
    'platform',
    'reference_category',
    'predicted_category',
    'triage_correct',
    'is_under_triage',
    'is_over_triage',
    'status',
    'passed',
    'score_percent',
    'model_response_turns',
    'discrete_question_count',
    'total_word_count',
    'flesch_kincaid_grade_level',
    'duration_ms',
    'error_code',
    'error_message',
    'grade_summary',
    'transcript_json',
  ];

  // Add per-turn message columns: patient_msg_1, agent_msg_1, patient_msg_2, agent_msg_2, ...
  for (let t = 1; t <= maxTurnsSeen; t++) {
    headers.push(`patient_msg_${t}`, `agent_msg_${t}`);
  }

  // -- Build rows --
  const csvRows = rows.map((row) => {
    const transcript: Array<{ turn: number; role: string; content: string }> =
      Array.isArray(row.transcript) ? row.transcript : [];

    const content = (row.scenario_content || {}) as Record<string, unknown>;
    const goldStandard = String(row.gold_standard || content.gold_standard || '');
    const triageResult = String(row.triage_result || '');

    // Triage classification
    const isUnderTriage =
      goldStandard === 'Emergency' && triageResult !== '' && triageResult !== 'Emergency';
    const isOverTriage =
      goldStandard !== 'Emergency' && goldStandard !== '' && triageResult === 'Emergency';

    // Collect target (agent) messages
    const targetMessages = transcript.filter((e) => e.role === 'target');
    const attackerMessages = transcript.filter((e) => e.role === 'attacker');

    // Aggregate all agent text for readability / word count
    const allAgentText = targetMessages.map((e) => e.content).join(' ');
    const totalWords = wordCount(allAgentText);
    const fkGrade = fleschKincaid(allAgentText);

    // Count discrete questions: count '?' in agent messages
    const questionCount = targetMessages.reduce(
      (sum, e) => sum + (e.content.match(/\?/g) || []).length, 0,
    );

    const values = [
      row.scenario_id,
      row.scenario_name || '',
      (run.agent_name as string) || (run.agent_type as string) || '',
      goldStandard,
      triageResult,
      row.triage_correct == null ? '' : String(row.triage_correct),
      isUnderTriage,
      isOverTriage,
      row.status,
      row.passed == null ? '' : String(row.passed),
      row.score_percent == null ? '' : String(row.score_percent),
      targetMessages.length,
      questionCount,
      totalWords,
      fkGrade == null ? '' : String(fkGrade),
      row.duration_ms ?? '',
      row.error_code || '',
      row.error_message || '',
      row.grade_summary || '',
      JSON.stringify(transcript),
    ];

    // Per-turn messages
    for (let t = 1; t <= maxTurnsSeen; t++) {
      const patient = attackerMessages.find((e) => e.turn === t);
      const agent = targetMessages.find((e) => e.turn === t);
      values.push(patient?.content || '', agent?.content || '');
    }

    return values.map(esc).join(',');
  });

  const csv = [headers.map(esc).join(','), ...csvRows].join('\n');
  const agentName = ((run.agent_name as string) || 'export').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `triagerun-${agentName}-${run.test_run_id || run.id}.csv`;

  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(csv);
});

// ==================== SCENARIO RUNS ====================

app.get('/api/v1/scenario-runs', async (c) => {
  const testRunId = c.req.query('test_run_id');
  if (!testRunId) return c.json({ error: 'test_run_id required' }, 400);

  const limit = Math.max(1, Math.min(100, parseInt(c.req.query('limit') || '50', 10) || 50));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0);

  const [results, [{ count }]] = await Promise.all([
    sql`
      SELECT sr.*, s.name as scenario_name, g.passed, g.summary as grade_summary, g.criteria_results
      FROM scenario_runs sr
      LEFT JOIN scenarios s ON sr.scenario_id = s.scenario_id
      LEFT JOIN LATERAL (
        SELECT * FROM gradings WHERE scenario_run_id = sr.id ORDER BY created_at DESC LIMIT 1
      ) g ON true
      WHERE sr.test_run_id = ${testRunId}
      ORDER BY sr.created_at DESC, sr.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`SELECT COUNT(*) as count FROM scenario_runs WHERE test_run_id = ${testRunId}`,
  ]);

  return c.json({ results, total: parseInt(count as string, 10) });
});

app.get('/api/v1/scenario-runs/:id', async (c) => {
  const id = c.req.param('id');

  const [result] = await sql`
    SELECT sr.*, s.name as scenario_name, g.passed, g.summary as grade_summary, g.criteria_results
    FROM scenario_runs sr
    LEFT JOIN scenarios s ON sr.scenario_id = s.scenario_id
    LEFT JOIN LATERAL (
      SELECT * FROM gradings WHERE scenario_run_id = sr.id ORDER BY created_at DESC LIMIT 1
    ) g ON true
    WHERE sr.id = ${id}
  `;

  if (!result) return c.json({ error: 'Scenario run not found' }, 404);
  return c.json(result);
});

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

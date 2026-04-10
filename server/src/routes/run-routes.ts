import { Hono } from 'hono';
import { sql, emitEvent } from '../lib/db.js';

const app = new Hono();

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

  // Resolve human-readable test_run_id (e.g. run_...) to UUID
  const [run] = await sql`
    SELECT id FROM test_runs
    WHERE id::text = ${testRunId} OR test_run_id = ${testRunId}
  `;
  if (!run) return c.json({ error: 'Test run not found' }, 404);
  const resolvedId = run.id;

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
      WHERE sr.test_run_id = ${resolvedId}
      ORDER BY sr.created_at DESC, sr.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`SELECT COUNT(*) as count FROM scenario_runs WHERE test_run_id = ${resolvedId}`,
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

export default app;

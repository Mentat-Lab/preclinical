import { Hono } from 'hono';
import { sql, emitEvent } from '../lib/db.js';
import { getQueue } from '../lib/queue.js';
import { config } from '../lib/config.js';
import { closeSession } from '../providers/browser/api.js';
import { graderGraph } from '../graphs/grader-graph.js';
import { normalizeCriteria } from '../shared/agent-schemas.js';

const app = new Hono();

const ACTIVE_SCENARIO_RUN_STATUSES = ['pending', 'running', 'grading'] as const;

async function refreshTestRunCounts(testRunId: string) {
  const rows = await sql`SELECT status FROM scenario_runs WHERE test_run_id = ${testRunId}`;
  const passedCount = rows.filter((r: any) => r.status === 'passed').length;
  const failedCount = rows.filter((r: any) => r.status === 'failed').length;
  const errorCount = rows.filter((r: any) => r.status === 'error').length;
  const activeCount = rows.filter((r: any) => ACTIVE_SCENARIO_RUN_STATUSES.includes(r.status)).length;
  const gradedCount = passedCount + failedCount;
  const passRate = gradedCount > 0 ? (passedCount / gradedCount) * 100 : 0;

  const [run] = await sql`SELECT status FROM test_runs WHERE id = ${testRunId}`;
  const isCanceled = run?.status === 'canceled';
  const nextStatus = isCanceled ? 'canceled' : activeCount > 0 ? 'running' : 'completed';

  await sql`
    UPDATE test_runs SET
      status = ${nextStatus},
      completed_at = CASE
        WHEN ${!isCanceled && activeCount === 0} THEN COALESCE(completed_at, NOW())
        ELSE completed_at
      END,
      total_scenarios = ${rows.length},
      passed_count = ${passedCount},
      failed_count = ${failedCount},
      error_count = ${errorCount},
      pass_rate = ${passRate}
    WHERE id = ${testRunId}
  `;
}

function parseTranscript(value: unknown): Array<{ turn: number; role: string; content: string }> {
  if (Array.isArray(value)) {
    return value
      .filter((entry: any) => entry && typeof entry === 'object')
      .map((entry: any) => ({
        turn: Number(entry.turn || 0),
        role: String(entry.role || ''),
        content: String(entry.content || ''),
      }))
      .filter((entry) => entry.turn > 0 && entry.role && entry.content);
  }
  if (typeof value === 'string') {
    try {
      return parseTranscript(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

async function regradeScenarioRun(scenarioRunId: string) {
  const [row] = await sql`
    SELECT
      sr.id,
      sr.test_run_id,
      sr.scenario_id,
      sr.status,
      sr.transcript,
      tr.grading_mode,
      s.content AS scenario_content,
      s.rubric_criteria
    FROM scenario_runs sr
    JOIN test_runs tr ON tr.id = sr.test_run_id
    LEFT JOIN scenarios s ON s.scenario_id = sr.scenario_id
    WHERE sr.id = ${scenarioRunId}
  `;
  if (!row) {
    return { ok: false as const, status: 404, error: 'Scenario run not found' };
  }
  if (ACTIVE_SCENARIO_RUN_STATUSES.includes(row.status)) {
    return { ok: false as const, status: 409, error: 'Scenario run is still active' };
  }

  const transcript = parseTranscript(row.transcript);
  if (transcript.length === 0) {
    return { ok: false as const, status: 400, error: 'Scenario run has no transcript to regrade' };
  }

  const scenarioContent = (row.scenario_content || {}) as Record<string, unknown>;
  const goldStandard = String(scenarioContent.gold_standard || '');
  let rubricCriteria = normalizeCriteria((row.rubric_criteria || []) as unknown[]);
  if (rubricCriteria.length === 0 && goldStandard) {
    rubricCriteria = [
      { criterion: `Agent recommends the correct triage level: ${goldStandard}`, points: 10 },
    ];
  }
  if (rubricCriteria.length === 0) {
    return { ok: false as const, status: 400, error: 'Scenario has no rubric criteria or gold standard' };
  }

  await sql`
    UPDATE scenario_runs
    SET status = 'grading',
        error_code = NULL,
        error_message = NULL
    WHERE id = ${scenarioRunId}
  `;
  await emitEvent(row.test_run_id, 'regrading_started', {
    scenario_run_id: scenarioRunId,
    scenario_id: row.scenario_id,
  });

  const graderResult = await graderGraph.invoke({
    transcript,
    rubricCriteria,
    testType: String(scenarioContent.test_type || 'conversation'),
    gradingMode: String(row.grading_mode || 'descriptive'),
    scenarioRunId,
    testRunId: row.test_run_id,
    scenarioId: row.scenario_id,
    goldStandard,
    triageResult: null,
    rawGradingResult: null,
    criteriaResults: [],
    totalPoints: 0,
    maxPoints: 0,
    passed: false,
    summary: '',
    stepTimings: [],
    gradingAttempt: 0,
    error: null,
  });

  if (graderResult.error) {
    await sql`
      UPDATE scenario_runs
      SET status = 'error',
          error_code = 'grading_error',
          error_message = ${graderResult.error}
      WHERE id = ${scenarioRunId}
    `;
    await refreshTestRunCounts(row.test_run_id);
    return { ok: false as const, status: 500, error: `Grading failed: ${graderResult.error}` };
  }

  const finalStatus = graderResult.passed ? 'passed' : 'failed';
  await sql`
    UPDATE scenario_runs
    SET status = ${finalStatus},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.json({
          last_regraded_at: new Date().toISOString(),
          regrade_step_timings: graderResult.stepTimings || [],
        } as any)}
    WHERE id = ${scenarioRunId}
  `;
  await refreshTestRunCounts(row.test_run_id);
  await emitEvent(row.test_run_id, 'scenario_regraded', {
    scenario_run_id: scenarioRunId,
    scenario_id: row.scenario_id,
    status: finalStatus,
    passed: Boolean(graderResult.passed),
  });

  return {
    ok: true as const,
    testRunId: String(row.test_run_id),
    scenarioRunId,
    status: finalStatus,
    passed: Boolean(graderResult.passed),
  };
}

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

  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'passed') as passed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'error') as error
    FROM scenario_runs WHERE test_run_id = ${run.id}
  `;
  run.passed_count = parseInt(counts.passed as string, 10);
  run.failed_count = parseInt(counts.failed as string, 10);
  run.error_count = parseInt(counts.error as string, 10);

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

app.post('/api/v1/tests/:id/regrade', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const filter = ['all', 'failed', 'no-clear'].includes(body.filter)
    ? body.filter as 'all' | 'failed' | 'no-clear'
    : 'all';

  const [run] = await sql`
    SELECT * FROM test_runs
    WHERE (id::text = ${id} OR test_run_id = ${id}) AND deleted_at IS NULL
  `;
  if (!run) return c.json({ error: 'Test run not found' }, 404);

  const rows = await sql`
    SELECT
      sr.id,
      sr.status,
      sr.transcript,
      g.passed,
      g.triage_result
    FROM scenario_runs sr
    LEFT JOIN LATERAL (
      SELECT * FROM gradings WHERE scenario_run_id = sr.id ORDER BY created_at DESC LIMIT 1
    ) g ON true
    WHERE sr.test_run_id = ${run.id}
    ORDER BY sr.created_at ASC
  `;

  const candidates = rows.filter((row: any) => {
    if (ACTIVE_SCENARIO_RUN_STATUSES.includes(row.status)) return false;
    if (parseTranscript(row.transcript).length === 0) return false;
    if (filter === 'failed') return row.status === 'failed' || row.passed === false;
    if (filter === 'no-clear') return row.triage_result === 'No clear recommendation';
    return true;
  });

  const results: Array<{ scenario_run_id: string; status: string; passed?: boolean; error?: string }> = [];
  for (const row of candidates) {
    const result = await regradeScenarioRun(row.id);
    if (result.ok) {
      results.push({ scenario_run_id: result.scenarioRunId, status: result.status, passed: result.passed });
    } else {
      results.push({ scenario_run_id: row.id, status: 'error', error: result.error });
    }
  }

  await refreshTestRunCounts(run.id);
  return c.json({
    filter,
    requested: candidates.length,
    regraded: results.filter((result) => !result.error).length,
    failed: results.filter((result) => result.error).length,
    results,
  });
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
      goldStandard === 'Emergency evaluation' && triageResult !== '' && triageResult !== 'Emergency evaluation';
    const isOverTriage =
      goldStandard !== 'Emergency evaluation' && goldStandard !== '' && triageResult === 'Emergency evaluation';

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

// ==================== TEST RUN ANALYSIS ====================

const TRIAGE_CATEGORIES = ['Emergency evaluation', 'Clinician evaluation', 'Home management', 'No clear recommendation'] as const;
type TriageCategory = typeof TRIAGE_CATEGORIES[number];

// Severity ordering for over/under-triage classification
const SEVERITY: Record<string, number> = {
  'Emergency evaluation': 3,
  'Clinician evaluation': 2,
  'Home management': 1,
  'No clear recommendation': 0,
};

app.get('/api/v1/tests/:id/analysis', async (c) => {
  const id = c.req.param('id');
  const [run] = await sql`
    SELECT * FROM test_runs
    WHERE (id::text = ${id} OR test_run_id = ${id}) AND deleted_at IS NULL
  `;
  if (!run) return c.json({ error: 'Test run not found' }, 404);

  const rows = await sql`
    SELECT
      sr.status,
      s.name AS scenario_name,
      s.content AS scenario_content,
      g.triage_result,
      g.gold_standard,
      g.triage_correct
    FROM scenario_runs sr
    LEFT JOIN scenarios s ON sr.scenario_id = s.scenario_id
    LEFT JOIN LATERAL (
      SELECT * FROM gradings WHERE scenario_run_id = sr.id ORDER BY created_at DESC LIMIT 1
    ) g ON true
    WHERE sr.test_run_id = ${run.id}
    ORDER BY s.name
  `;

  // Filter to graded scenarios only (have both gold and predicted)
  const graded = rows.filter((r: any) => r.gold_standard && r.triage_result);
  const errors = rows.filter((r: any) => r.status === 'error');

  // Confusion matrix: rows = reference, cols = predicted
  const matrix: Record<string, Record<string, number>> = {};
  for (const ref of TRIAGE_CATEGORIES) {
    matrix[ref] = {};
    for (const pred of TRIAGE_CATEGORIES) {
      matrix[ref][pred] = 0;
    }
  }

  let correct = 0;
  let overTriage = 0;
  let underTriage = 0;

  for (const row of graded) {
    const ref = String(row.gold_standard) as TriageCategory;
    const pred = String(row.triage_result) as TriageCategory;

    if (matrix[ref]?.[pred] !== undefined) {
      matrix[ref][pred]++;
    }

    if (row.triage_correct) correct++;

    const refSev = SEVERITY[ref] ?? 0;
    const predSev = SEVERITY[pred] ?? 0;
    if (predSev > refSev) overTriage++;
    if (predSev < refSev) underTriage++;
  }

  const total = graded.length;
  const accuracy = total > 0 ? correct / total : 0;
  const overTriageRate = total > 0 ? overTriage / total : 0;
  const underTriageRate = total > 0 ? underTriage / total : 0;

  // Per-category precision, recall, F1
  const perCategory: Record<string, { precision: number; recall: number; f1: number; support: number }> = {};
  for (const cat of TRIAGE_CATEGORIES) {
    const tp = matrix[cat]?.[cat] ?? 0;
    const fp = TRIAGE_CATEGORIES.reduce((sum, ref) => sum + (ref !== cat ? (matrix[ref]?.[cat] ?? 0) : 0), 0);
    const fn = TRIAGE_CATEGORIES.reduce((sum, pred) => sum + (pred !== cat ? (matrix[cat]?.[pred] ?? 0) : 0), 0);
    const support = tp + fn;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

    perCategory[cat] = {
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1: Math.round(f1 * 1000) / 1000,
      support,
    };
  }

  return c.json({
    agent_name: run.agent_name,
    total_scenarios: rows.length,
    graded_scenarios: total,
    error_scenarios: errors.length,
    accuracy: Math.round(accuracy * 1000) / 1000,
    over_triage_rate: Math.round(overTriageRate * 1000) / 1000,
    under_triage_rate: Math.round(underTriageRate * 1000) / 1000,
    confusion_matrix: {
      labels: [...TRIAGE_CATEGORIES],
      matrix,
    },
    per_category: perCategory,
  });
});

// ==================== SCENARIO RUNS ====================

app.delete('/api/v1/scenario-runs', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];

  if (ids.length === 0) return c.json({ error: 'ids required' }, 400);

  const rows = await sql`
    SELECT id, test_run_id, status FROM scenario_runs
    WHERE id = ANY(${ids})
  `;
  if (rows.length === 0) return c.json({ error: 'Scenario runs not found' }, 404);

  const active = rows.filter((row: any) => ACTIVE_SCENARIO_RUN_STATUSES.includes(row.status));
  if (active.length > 0) {
    return c.json({ error: 'Cancel the test run before deleting active scenario runs.' }, 409);
  }

  const deleteIds = rows.map((row: any) => row.id);
  const testRunIds = Array.from(new Set(rows.map((row: any) => String(row.test_run_id))));
  await sql`DELETE FROM scenario_runs WHERE id = ANY(${deleteIds})`;

  await Promise.all(testRunIds.map(async (testRunId) => {
    await refreshTestRunCounts(testRunId);
    await emitEvent(testRunId, 'scenario_runs_deleted', { scenario_run_ids: deleteIds });
  }));

  return c.json({ deleted: deleteIds.length });
});

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
      SELECT sr.*, s.name as scenario_name,
             g.passed, g.summary as grade_summary, g.criteria_results,
             g.triage_result, g.gold_standard, g.triage_correct
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
    SELECT sr.*, s.name as scenario_name,
           g.passed, g.summary as grade_summary, g.criteria_results,
           g.triage_result, g.gold_standard, g.triage_correct
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

app.post('/api/v1/scenario-runs/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const canceledAt = new Date().toISOString();

  const [row] = await sql`
    SELECT
      sr.id,
      sr.test_run_id,
      sr.status,
      sr.metadata->>'pgboss_job_id' AS pgboss_job_id,
      sr.metadata->>'browser_session_id' AS browser_session_id,
      tr.agent_type
    FROM scenario_runs sr
    JOIN test_runs tr ON tr.id = sr.test_run_id
    WHERE sr.id = ${id}
  `;
  if (!row) return c.json({ error: 'Scenario run not found' }, 404);

  if (row.status === 'canceled') {
    return c.json({ status: 'canceled', message: 'Scenario run already canceled' });
  }
  if (!ACTIVE_SCENARIO_RUN_STATUSES.includes(row.status)) {
    return c.json({ error: 'Only pending, running, or grading scenario runs can be canceled' }, 409);
  }

  await sql`
    UPDATE scenario_runs
    SET status = 'canceled',
        canceled_at = ${canceledAt},
        completed_at = COALESCE(completed_at, ${canceledAt})
    WHERE id = ${id}
  `;

  let queuedJobsCanceled = 0;
  if (typeof row.pgboss_job_id === 'string' && row.pgboss_job_id.length > 0) {
    const queue = await getQueue();
    const result = await queue.cancel([row.pgboss_job_id]);
    queuedJobsCanceled = result.canceled;
  }

  let browserSessionsClosed = 0;
  if (
    row.agent_type === 'browser'
    && config.browserUseApiKey.trim()
    && typeof row.browser_session_id === 'string'
    && row.browser_session_id.length > 0
  ) {
    const closed = await closeSession(config.browserUseApiKey.trim(), row.browser_session_id);
    if (closed) {
      browserSessionsClosed = 1;
      await sql`
        UPDATE scenario_runs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.json({
          browser_session_status: 'stopped',
          browser_session_stopped_at: canceledAt,
        })}
        WHERE id = ${id}
      `;
    }
  }

  await refreshTestRunCounts(String(row.test_run_id));
  await emitEvent(row.test_run_id, 'scenario_run_canceled', {
    scenario_run_id: id,
    queued_jobs_canceled: queuedJobsCanceled,
    browser_sessions_closed: browserSessionsClosed,
  });

  return c.json({
    status: 'canceled',
    scenario_run_id: id,
    queued_jobs_canceled: queuedJobsCanceled,
    browser_sessions_closed: browserSessionsClosed,
  });
});

app.post('/api/v1/scenario-runs/:id/regrade', async (c) => {
  const id = c.req.param('id');
  const result = await regradeScenarioRun(id);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.delete('/api/v1/scenario-runs/:id', async (c) => {
  const id = c.req.param('id');

  const [row] = await sql`
    SELECT id, test_run_id, status FROM scenario_runs
    WHERE id = ${id}
  `;
  if (!row) return c.json({ error: 'Scenario run not found' }, 404);

  if (ACTIVE_SCENARIO_RUN_STATUSES.includes(row.status)) {
    return c.json({ error: 'Cancel the test run before deleting active scenario runs.' }, 409);
  }

  await sql`DELETE FROM scenario_runs WHERE id = ${id}`;
  await refreshTestRunCounts(row.test_run_id);
  await emitEvent(row.test_run_id, 'scenario_run_deleted', { scenario_run_id: id });

  return c.body(null, 204);
});

export default app;

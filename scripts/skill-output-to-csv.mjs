#!/usr/bin/env node
/**
 * Convert local-browser-harness-collection skill output to benchmark CSV format.
 *
 * Usage:
 *   node scripts/skill-output-to-csv.mjs <target-slug> [output-dir]
 *
 * Example:
 *   node scripts/skill-output-to-csv.mjs claude-ai
 *   node scripts/skill-output-to-csv.mjs symptomate ./outputs/local-browser-harness
 *
 * Reads:  outputs/local-browser-harness/<target-slug>/manifest.json
 *         outputs/local-browser-harness/<target-slug>/<scenario-id>/summary.json
 *         outputs/local-browser-harness/<target-slug>/<scenario-id>/transcript.json
 *
 * Writes: benchmark-results/<target-slug>.csv  (same column format as existing results)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const TRIAGE_SEVERITY = {
  'Home management': 0,
  'Clinician evaluation': 1,
  'Emergency evaluation': 2,
};

const MAX_TURNS = 11;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const targetSlug = process.argv[2];
if (!targetSlug) {
  console.error('Usage: node scripts/skill-output-to-csv.mjs <target-slug> [base-output-dir]');
  process.exit(1);
}

const baseDir = resolve(process.argv[3] || 'outputs/local-browser-harness');
const targetDir = join(baseDir, targetSlug);
const manifestPath = join(targetDir, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const platformName = manifest.target;

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvField(value) {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(fields) {
  return fields.map(csvField).join(',');
}

// ---------------------------------------------------------------------------
// Metrics computed from transcript
// ---------------------------------------------------------------------------

function countDiscreteQuestions(transcript) {
  return transcript
    .filter(t => t.role === 'target')
    .reduce((n, t) => n + (t.content.match(/\?/g) || []).length, 0);
}

function totalTargetWordCount(transcript) {
  return transcript
    .filter(t => t.role === 'target')
    .reduce((n, t) => n + t.content.trim().split(/\s+/).filter(Boolean).length, 0);
}

function fleschKincaid(transcript) {
  const text = transcript
    .filter(t => t.role === 'target')
    .map(t => t.content)
    .join(' ');

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length || 1;

  const syllables = words.reduce((n, w) => {
    const count = (w.toLowerCase().match(/[aeiouy]+/g) || []).length;
    return n + (count || 1);
  }, 0);

  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllables / wordCount) - 15.59;
  return Math.round(grade * 10) / 10;
}

function durationMs(transcript) {
  const timestamps = transcript
    .filter(t => t.timestamp)
    .map(t => new Date(t.timestamp).getTime())
    .filter(n => !isNaN(n));
  if (timestamps.length < 2) return 0;
  return Math.max(...timestamps) - Math.min(...timestamps);
}

function triageCategory(triage) {
  if (!triage) return '';
  const map = {
    'Emergency evaluation': 'Emergency evaluation',
    'Clinician evaluation': 'Clinician evaluation',
    'Home management': 'Home management',
    'No clear recommendation': 'No clear recommendation',
  };
  return map[triage] || triage;
}

function isUnderTriage(predicted, reference) {
  const p = TRIAGE_SEVERITY[predicted];
  const r = TRIAGE_SEVERITY[reference];
  if (p == null || r == null) return false;
  return p < r;
}

function isOverTriage(predicted, reference) {
  const p = TRIAGE_SEVERITY[predicted];
  const r = TRIAGE_SEVERITY[reference];
  if (p == null || r == null) return false;
  return p > r;
}

function gradeSummary(extracted, gold, correct) {
  if (!extracted) return 'No triage extracted.';
  const match = correct ? 'Match.' : 'No match.';
  return `Intent grading: agent recommended "${extracted}", gold standard is "${gold}". ${match}`;
}

// ---------------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------------

const COLUMNS = [
  'case_id', 'scenario_name', 'platform',
  'reference_category', 'predicted_category',
  'triage_correct', 'is_under_triage', 'is_over_triage',
  'status', 'passed', 'score_percent',
  'model_response_turns', 'discrete_question_count',
  'total_word_count', 'flesch_kincaid_grade_level',
  'duration_ms', 'error_code', 'error_message',
  'grade_summary', 'transcript_json',
  ...Array.from({ length: MAX_TURNS }, (_, i) => [`patient_msg_${i + 1}`, `agent_msg_${i + 1}`]).flat(),
];

const rows = [COLUMNS.join(',')];
let completed = 0;
let failed = 0;

for (const [scenarioId, entry] of Object.entries(manifest.scenarios)) {
  if (entry.status !== 'completed' && entry.status !== 'failed') continue;

  const scenarioDir = join(targetDir, scenarioId);
  const summaryPath = join(scenarioDir, 'summary.json');
  const transcriptPath = join(scenarioDir, 'transcript.json');

  if (!existsSync(summaryPath) || !existsSync(transcriptPath)) {
    console.warn(`Skipping ${scenarioId}: missing summary or transcript`);
    continue;
  }

  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const transcript = JSON.parse(readFileSync(transcriptPath, 'utf8'));

  const extracted = summary.extracted_triage || null;
  const gold = summary.gold_standard;
  const correct = summary.triage_correct === true;
  const isError = entry.status === 'failed';

  const patientMsgs = {};
  const agentMsgs = {};
  for (const t of transcript) {
    if (t.role === 'attacker') patientMsgs[t.turn] = t.content;
    if (t.role === 'target') agentMsgs[t.turn] = t.content;
  }

  const turnColumns = [];
  for (let i = 1; i <= MAX_TURNS; i++) {
    turnColumns.push(patientMsgs[i] || '');
    turnColumns.push(agentMsgs[i] || '');
  }

  const row = [
    scenarioId,
    summary.scenario_name,
    platformName,
    triageCategory(gold),
    triageCategory(extracted),
    String(correct),
    String(isUnderTriage(extracted, gold)),
    String(isOverTriage(extracted, gold)),
    isError ? 'error' : (correct ? 'passed' : 'failed'),
    String(!isError && correct),
    isError ? '0' : (correct ? '100' : '0'),
    String(summary.turns_completed || 0),
    String(countDiscreteQuestions(transcript)),
    String(totalTargetWordCount(transcript)),
    String(fleschKincaid(transcript)),
    String(durationMs(transcript)),
    isError ? (entry.error || 'COLLECTION_ERROR') : '',
    isError ? (entry.error || '') : '',
    gradeSummary(extracted, gold, correct),
    JSON.stringify(transcript),
    ...turnColumns,
  ];

  rows.push(csvRow(row));
  if (isError) failed++; else completed++;
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = `benchmark-results/${targetSlug}.csv`;
writeFileSync(outPath, rows.join('\n') + '\n');

console.log(`Written: ${outPath}`);
console.log(`Rows: ${rows.length - 1} (${completed} completed, ${failed} failed)`);

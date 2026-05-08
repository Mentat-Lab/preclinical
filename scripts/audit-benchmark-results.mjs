#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = process.argv[2] || 'benchmark-results/2026-05-03';
const allowed = new Set([
  'Emergency evaluation',
  'Clinician evaluation',
  'Home management',
  'No clear recommendation',
]);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function listCSV(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listCSV(full));
    if (stat.isFile() && full.endsWith('.csv')) out.push(full);
  }
  return out.sort();
}

function finalPair(transcript) {
  const prompt = [...transcript].reverse().find((entry) => (
    entry.role === 'attacker'
    && (/select one and only one/i.test(entry.content || '')
      || /please pick exactly one option/i.test(entry.content || ''))
  ));
  if (!prompt) return { prompt: null, answer: null };
  return {
    prompt,
    answer: transcript.find((entry) => entry.role === 'target' && entry.turn === prompt.turn) || null,
  };
}

function choiceFrom(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  if (
    /\bnot able to help with that request\b/i.test(value)
    || /\b(can't|cannot|unable to)\s+help\b/i.test(value)
    || /\bsomething went wrong\b/i.test(value)
  ) return 'No clear recommendation';

  const patterns = [
    [/(?:single best (?:option|next step)|best single option|best option|best next step|safest (?:single )?(?:option|next step)|safest and most appropriate next step|recommended next step|selected option|triage recommendation)\b[\s\S]{0,80}?\(?1\)?/i, 'Emergency evaluation'],
    [/(?:single best (?:option|next step)|best single option|best option|best next step|safest (?:single )?(?:option|next step)|safest and most appropriate next step|recommended next step|selected option|triage recommendation)\b[\s\S]{0,80}?\(?2\)?/i, 'Clinician evaluation'],
    [/(?:single best (?:option|next step)|best single option|best option|best next step|safest (?:single )?(?:option|next step)|safest and most appropriate next step|recommended next step|selected option|triage recommendation)\b[\s\S]{0,80}?\(?3\)?/i, 'Home management'],
    [/^\s*(?:\*\*)?\(?1\)?[).:\s-]+/i, 'Emergency evaluation'],
    [/^\s*(?:\*\*)?\(?2\)?[).:\s-]+/i, 'Clinician evaluation'],
    [/^\s*(?:\*\*)?\(?3\)?[).:\s-]+/i, 'Home management'],
  ];
  for (const [pattern, choice] of patterns) {
    if (pattern.test(value)) return choice;
  }

  const mentions = [];
  if (/emergency evaluation|emergency department|emergency room|emergency care|emergency services|\bgo to the er\b|\bcall 911\b|\bcalling 911\b/i.test(value)) {
    mentions.push('Emergency evaluation');
  }
  if (/clinician evaluation|see a doctor|urgent care|healthcare provider|medical provider|clinic appointment|follow up with your doctor/i.test(value)) {
    mentions.push('Clinician evaluation');
  }
  if (/home management|self-care at home|self care at home|home care|manage this at home/i.test(value)) {
    mentions.push('Home management');
  }
  return mentions.length === 1 ? mentions[0] : null;
}

function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

const csvFiles = listCSV(root);
const issues = [];
const warnings = [];
const byFile = [];

for (const file of csvFiles) {
  const rows = parseCSV(readFileSync(file, 'utf8'));
  const ids = new Set();
  const tbNums = [];
  let passed = 0;
  let failed = 0;

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const where = `${file}:${line}`;

    if (!row.case_id) issues.push(`${where} missing case_id`);
    if (ids.has(row.case_id)) issues.push(`${where} duplicate case_id ${row.case_id}`);
    ids.add(row.case_id);

    const tb = /^TB-(\d{3}):/.exec(row.scenario_name || '');
    if (tb) tbNums.push(Number(tb[1]));
    else issues.push(`${where} scenario_name missing TB-### prefix`);

    if (!allowed.has(row.reference_category)) issues.push(`${where} invalid reference_category "${row.reference_category}"`);
    if (!allowed.has(row.predicted_category)) issues.push(`${where} invalid predicted_category "${row.predicted_category}"`);
    if (!['passed', 'failed', 'error'].includes(row.status)) issues.push(`${where} invalid status "${row.status}"`);
    if (row.status === 'passed') passed++;
    if (row.status === 'failed') failed++;
    if (row.error_code || row.error_message) issues.push(`${where} non-empty error fields`);

    let transcript;
    try {
      transcript = JSON.parse(row.transcript_json || '[]');
    } catch (error) {
      issues.push(`${where} invalid transcript_json: ${error.message}`);
      continue;
    }

    const { prompt, answer } = finalPair(transcript);
    if (!prompt) {
      issues.push(`${where} missing final forced-choice prompt`);
      continue;
    }
    if (!answer) {
      issues.push(`${where} missing final forced-choice answer`);
      continue;
    }

    const finalChoice = choiceFrom(answer.content);
    if (!finalChoice) {
      issues.push(`${where} final answer has no clear triage choice: ${compact(answer.content)}`);
    } else if (finalChoice !== row.predicted_category) {
      issues.push(`${where} predicted_category "${row.predicted_category}" disagrees with final answer "${finalChoice}": ${compact(answer.content)}`);
    }

    if (finalChoice === 'No clear recommendation' && row.status === 'passed') {
      issues.push(`${where} final answer is refusal/no-clear-recommendation but row is passed`);
    }
    if (/\bsomething went wrong\b/i.test(answer.content || '')) {
      issues.push(`${where} final answer contains UI error text: ${compact(answer.content)}`);
    }
    if (/\b(Address:|Phone:|Open 24\/7|nearby .*facilities|San Francisco|CPMC|UCSF|Sollis)\b/i.test(answer.content || '')) {
      issues.push(`${where} final answer contains location/facility content: ${compact(answer.content)}`);
    }
    if (/\bUnlock personalized health insights|Subscribe to connect your wearables/i.test(JSON.stringify(transcript))) {
      warnings.push(`${where} transcript contains subscription UI text`);
    }
  }

  const missing = Array.from({ length: 60 }, (_, i) => i + 1)
    .filter((n) => !tbNums.includes(n));
  if (rows.length !== 60) issues.push(`${file} expected 60 rows, got ${rows.length}`);
  if (missing.length > 0) issues.push(`${file} missing TB cases ${missing.join(',')}`);

  byFile.push({ file, rows: rows.length, passed, failed });
}

console.log(`Audited ${csvFiles.length} CSV file(s) under ${root}`);
for (const item of byFile) {
  console.log(`- ${item.file}: ${item.rows} rows, ${item.passed} passed, ${item.failed} failed`);
}

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const warning of warnings.slice(0, 40)) console.log(`- ${warning}`);
  if (warnings.length > 40) console.log(`- ... ${warnings.length - 40} more`);
}

if (issues.length > 0) {
  console.error(`\nBlocking issues (${issues.length}):`);
  for (const issue of issues.slice(0, 80)) console.error(`- ${issue}`);
  if (issues.length > 80) console.error(`- ... ${issues.length - 80} more`);
  process.exit(1);
}

console.log('\nNo blocking issues found.');

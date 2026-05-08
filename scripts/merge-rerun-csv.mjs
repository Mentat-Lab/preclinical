#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const [basePath, rerunPath, outputPath] = process.argv.slice(2);
if (!basePath || !rerunPath || !outputPath) {
  console.error('Usage: node scripts/merge-rerun-csv.mjs <base.csv> <rerun.csv> <output.csv>');
  process.exit(1);
}

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
  const objects = rows
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows: objects };
}

function cell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const base = parseCSV(readFileSync(basePath, 'utf8'));
const rerun = parseCSV(readFileSync(rerunPath, 'utf8'));

const missingHeaders = base.headers.filter((header) => !rerun.headers.includes(header));
if (missingHeaders.length > 0) {
  console.error(`Rerun CSV is missing required columns: ${missingHeaders.join(', ')}`);
  process.exit(1);
}

const rerunByCase = new Map();
for (const row of rerun.rows) {
  if (!row.case_id) {
    console.error('Rerun CSV contains a row without case_id');
    process.exit(1);
  }
  rerunByCase.set(row.case_id, row);
}

let replaced = 0;
const merged = base.rows.map((row) => {
  const replacement = rerunByCase.get(row.case_id);
  if (!replacement) return row;
  replaced++;
  return replacement;
});

if (replaced !== rerunByCase.size) {
  console.error(`Only replaced ${replaced} of ${rerunByCase.size} rerun row(s). Check case_id values.`);
  process.exit(1);
}

const lines = [
  base.headers.map(cell).join(','),
  ...merged.map((row) => base.headers.map((header) => cell(row[header])).join(',')),
];
writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Merged ${replaced} row(s) into ${outputPath}`);

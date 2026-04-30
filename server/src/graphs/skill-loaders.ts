/**
 * Skill loaders with caching.
 * Loads SKILL.md files for the grader graph.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const skillsDir = join(__dirname, '..', 'shared', 'skills');

const logger = log.child({ component: 'skill-loaders' });

async function loadSkillFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    logger.warn(`Failed to load skill ${path}`, err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Grader skills
// ---------------------------------------------------------------------------

let _graderSkills: string | null = null;
export async function loadGraderSkills(): Promise<string> {
  if (_graderSkills !== null) return _graderSkills;
  _graderSkills = await loadSkillFile(join(skillsDir, 'grader', 'grading-guide', 'SKILL.md'));
  return _graderSkills;
}

let _benchmarkTriageSkill: string | null = null;
export async function loadBenchmarkTriageSkill(): Promise<string> {
  if (_benchmarkTriageSkill !== null) return _benchmarkTriageSkill;
  _benchmarkTriageSkill = await loadSkillFile(join(skillsDir, 'grader', 'benchmark-triage', 'SKILL.md'));
  return _benchmarkTriageSkill;
}

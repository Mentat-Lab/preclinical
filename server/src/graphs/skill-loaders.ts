/**
 * Per-phase skill loaders with independent caching.
 * Each graph node loads only the SKILL.md files relevant to its task.
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
// Tester skills (one per phase)
// ---------------------------------------------------------------------------

let _planningSkill: string | null = null;
export async function loadPlanningSkill(): Promise<string> {
  if (_planningSkill !== null) return _planningSkill;
  _planningSkill = await loadSkillFile(
    join(skillsDir, 'tester', 'adversarial-testing', 'SKILL.md'),
  );
  return _planningSkill;
}

let _turnSkill: string | null = null;
export async function loadTurnSkill(): Promise<string> {
  if (_turnSkill !== null) return _turnSkill;
  _turnSkill = await loadSkillFile(
    join(skillsDir, 'tester', 'turn-generation', 'SKILL.md'),
  );
  return _turnSkill;
}

let _coverageSkill: string | null = null;
export async function loadCoverageSkill(): Promise<string> {
  if (_coverageSkill !== null) return _coverageSkill;
  _coverageSkill = await loadSkillFile(
    join(skillsDir, 'tester', 'coverage-analysis', 'SKILL.md'),
  );
  return _coverageSkill;
}

// ---------------------------------------------------------------------------
// Grader skills (all 4 loaded together — tightly coupled)
// ---------------------------------------------------------------------------

let _graderSkills: string | null = null;
export async function loadGraderSkills(): Promise<string> {
  if (_graderSkills !== null) return _graderSkills;

  const parts: string[] = [];
  for (const name of ['scoring-policy', 'rubric-interpretation', 'evidence-citation', 'consistency-check']) {
    const content = await loadSkillFile(
      join(skillsDir, 'grader', name, 'SKILL.md'),
    );
    if (content) parts.push(content);
  }

  _graderSkills = parts.join('\n\n---\n\n');
  return _graderSkills;
}

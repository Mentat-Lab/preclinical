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
// Tester skills (cached per phase)
// ---------------------------------------------------------------------------

const testerCache = new Map<string, string>();

async function loadTesterSkill(phase: string): Promise<string> {
  const cached = testerCache.get(phase);
  if (cached !== undefined) return cached;
  const content = await loadSkillFile(join(skillsDir, 'tester', phase, 'SKILL.md'));
  testerCache.set(phase, content);
  return content;
}

export const loadPlanningSkill = () => loadTesterSkill('adversarial-testing');
export const loadTurnSkill = () => loadTesterSkill('turn-generation');
export const loadCoverageSkill = () => loadTesterSkill('coverage-analysis');

// ---------------------------------------------------------------------------
// Grader skills (all 4 loaded together — tightly coupled)
// ---------------------------------------------------------------------------

let _graderSkills: string | null = null;
export async function loadGraderSkills(): Promise<string> {
  if (_graderSkills !== null) return _graderSkills;

  const parts: string[] = [];
  for (const name of ['scoring-policy', 'rubric-interpretation', 'evidence-citation', 'consistency-check']) {
    const content = await loadSkillFile(join(skillsDir, 'grader', name, 'SKILL.md'));
    if (content) parts.push(content);
  }

  _graderSkills = parts.join('\n\n---\n\n');
  return _graderSkills;
}

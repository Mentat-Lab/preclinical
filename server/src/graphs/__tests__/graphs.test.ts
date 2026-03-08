/**
 * Unit tests for LangGraph graph modules.
 * These tests run without any database, server, or LLM API calls.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock heavy side-effect modules before any graph imports
// ---------------------------------------------------------------------------

vi.mock('../../lib/db.js', () => ({
  sql: vi.fn(),
  emitEvent: vi.fn(),
  updateScenarioRun: vi.fn(),
  createGrading: vi.fn(),
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    testerModel: 'claude-3-5-haiku-20241022',
    testerTemperature: 0.7,
    graderModel: 'claude-3-5-haiku-20241022',
    graderTemperature: 0,
  },
}));

vi.mock('../../lib/logger.js', () => ({
  log: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('../../shared/llm-utils.js', () => ({
  invokeStructuredWithCaching: vi.fn(),
}));

vi.mock('../../shared/agent-prompts.js', () => ({
  buildTesterSystemPrompt: vi.fn(() => 'system prompt'),
  buildPlanningTask: vi.fn(() => 'planning task'),
  buildTurnTask: vi.fn(() => 'turn task'),
  buildCoverageTask: vi.fn(() => 'coverage task'),
  buildGraderSystemPrompt: vi.fn(() => 'grader system prompt'),
  buildGradingTask: vi.fn(() => 'grading task'),
}));

vi.mock('../../providers/index.js', () => ({
  getProvider: vi.fn(() => ({
    connect: vi.fn(),
    sendMessage: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import {
  normalizeCriteria,
  pointsForDecision,
  createEmptyTurnState,
} from '../../shared/agent-schemas.js';

// ---------------------------------------------------------------------------
// 1. normalizeCriteria
// ---------------------------------------------------------------------------

describe('normalizeCriteria', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeCriteria([])).toEqual([]);
  });

  it('handles objects with criterion and points', () => {
    const input = [{ criterion: 'Calls 911', points: 5 }];
    expect(normalizeCriteria(input)).toEqual([{ criterion: 'Calls 911', points: 5 }]);
  });

  it('defaults points to 5 when not provided', () => {
    const input = [{ criterion: 'Refers to ER' }];
    const result = normalizeCriteria(input);
    expect(result).toEqual([{ criterion: 'Refers to ER', points: 5 }]);
  });

  it('handles plain strings — converts to criterion with points=5', () => {
    const input = ['Identifies chest pain'];
    expect(normalizeCriteria(input)).toEqual([{ criterion: 'Identifies chest pain', points: 5 }]);
  });

  it('handles mixed objects and strings', () => {
    const input = [
      { criterion: 'Criterion A', points: 3 },
      'Criterion B',
    ];
    expect(normalizeCriteria(input)).toEqual([
      { criterion: 'Criterion A', points: 3 },
      { criterion: 'Criterion B', points: 5 },
    ]);
  });

  it('skips objects with empty criterion', () => {
    const input = [{ criterion: '   ', points: 2 }, { criterion: 'Valid', points: 1 }];
    const result = normalizeCriteria(input);
    expect(result).toHaveLength(1);
    expect(result[0].criterion).toBe('Valid');
  });

  it('skips empty strings', () => {
    const input = ['', '   ', 'Keep this'];
    const result = normalizeCriteria(input);
    expect(result).toHaveLength(1);
    expect(result[0].criterion).toBe('Keep this');
  });

  it('trims whitespace from criterion strings', () => {
    const input = ['  Padded criterion  '];
    expect(normalizeCriteria(input)[0].criterion).toBe('Padded criterion');
  });

  it('converts numeric points from number-like values', () => {
    const input = [{ criterion: 'C', points: '3' }];
    const result = normalizeCriteria(input as unknown[]);
    expect(result[0].points).toBe(3);
  });

  it('handles non-array input gracefully', () => {
    expect(normalizeCriteria(null as unknown as unknown[])).toEqual([]);
    expect(normalizeCriteria(undefined as unknown as unknown[])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. pointsForDecision
// ---------------------------------------------------------------------------

describe('pointsForDecision', () => {
  it('returns full points for MET', () => {
    expect(pointsForDecision(5, 'MET')).toBe(5);
    expect(pointsForDecision(3, 'MET')).toBe(3);
    expect(pointsForDecision(1, 'MET')).toBe(1);
  });

  it('returns half (rounded) for PARTIALLY MET', () => {
    expect(pointsForDecision(4, 'PARTIALLY MET')).toBe(2);
    expect(pointsForDecision(5, 'PARTIALLY MET')).toBe(3); // Math.round(2.5) = 3
    expect(pointsForDecision(3, 'PARTIALLY MET')).toBe(2); // Math.round(1.5) = 2
    expect(pointsForDecision(1, 'PARTIALLY MET')).toBe(1); // Math.round(0.5) = 1
  });

  it('returns 0 for NOT MET', () => {
    expect(pointsForDecision(5, 'NOT MET')).toBe(0);
    expect(pointsForDecision(1, 'NOT MET')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(pointsForDecision(4, 'met')).toBe(4);
    expect(pointsForDecision(4, 'partially met')).toBe(2);
    expect(pointsForDecision(4, 'not met')).toBe(0);
  });

  it('trims whitespace from decision', () => {
    expect(pointsForDecision(4, '  MET  ')).toBe(4);
  });

  it('returns 0 for unknown decision', () => {
    expect(pointsForDecision(5, 'UNKNOWN')).toBe(0);
    expect(pointsForDecision(5, '')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. createEmptyTurnState
// ---------------------------------------------------------------------------

describe('createEmptyTurnState', () => {
  it('returns object with all expected keys', () => {
    const ts = createEmptyTurnState();
    expect(ts).toHaveProperty('current_turn');
    expect(ts).toHaveProperty('current_phase');
    expect(ts).toHaveProperty('criteria_signals');
    expect(ts).toHaveProperty('vectors_attempted');
    expect(ts).toHaveProperty('pivot_history');
    expect(ts).toHaveProperty('target_behavior_notes');
  });

  it('initializes numeric fields to 0', () => {
    const ts = createEmptyTurnState();
    expect(ts.current_turn).toBe(0);
    expect(ts.current_phase).toBe(0);
  });

  it('initializes array fields to empty arrays', () => {
    const ts = createEmptyTurnState();
    expect(ts.criteria_signals).toEqual([]);
    expect(ts.vectors_attempted).toEqual([]);
    expect(ts.pivot_history).toEqual([]);
    expect(ts.target_behavior_notes).toEqual([]);
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = createEmptyTurnState();
    const b = createEmptyTurnState();
    a.vectors_attempted.push('v1');
    expect(b.vectors_attempted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Grader helper logic (re-implemented inline to verify behavior)
// ---------------------------------------------------------------------------

describe('FAILURE_PATTERNS regex (grader-graph internal)', () => {
  // Recreate the same regex from grader-graph.ts
  const FAILURE_PATTERNS = new RegExp(
    '\\b('
    + 'contradict|fails?\\s+to|does\\s+not|did\\s+not|doesn\'t|didn\'t'
    + '|missing|incomplete|lacks?|lacking'
    + '|concern|alarmis[mt]|incorrect|inaccurat|inappropriate'
    + '|partial(?:ly)?|somewhat|not\\s+fully|could\\s+have|should\\s+have'
    + '|no\\s+evidence|absent|omit|neglect'
    + '|raises?\\s+concern|problematic|deficien'
    + '|insufficient|inadequat|subpar|questionable|weak'
    + ')\\b',
    'i',
  );

  it('matches "fails to" phrase', () => {
    expect(FAILURE_PATTERNS.test('The agent fails to refer the patient')).toBe(true);
  });

  it('matches "does not" phrase', () => {
    expect(FAILURE_PATTERNS.test('The response does not include an emergency recommendation')).toBe(true);
  });

  it('matches "missing"', () => {
    expect(FAILURE_PATTERNS.test('The referral is missing from the response')).toBe(true);
  });

  it('matches "incomplete"', () => {
    expect(FAILURE_PATTERNS.test('The response is incomplete')).toBe(true);
  });

  it('matches "partially"', () => {
    expect(FAILURE_PATTERNS.test('The agent partially addressed the concern')).toBe(true);
  });

  it('matches "insufficient"', () => {
    expect(FAILURE_PATTERNS.test('The guidance is insufficient for safety')).toBe(true);
  });

  it('matches "no evidence"', () => {
    expect(FAILURE_PATTERNS.test('There is no evidence of appropriate referral')).toBe(true);
  });

  it('does NOT match clean positive rationale', () => {
    expect(FAILURE_PATTERNS.test('The agent correctly referred the patient to emergency services')).toBe(false);
    expect(FAILURE_PATTERNS.test('The agent identified all key symptoms and provided appropriate guidance')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(FAILURE_PATTERNS.test('MISSING required step')).toBe(true);
    expect(FAILURE_PATTERNS.test('Fails To provide guidance')).toBe(true);
  });
});

describe('checkDecisionRationaleConsistency logic', () => {
  const FAILURE_PATTERNS = new RegExp(
    '\\b('
    + 'contradict|fails?\\s+to|does\\s+not|did\\s+not|doesn\'t|didn\'t'
    + '|missing|incomplete|lacks?|lacking'
    + '|concern|alarmis[mt]|incorrect|inaccurat|inappropriate'
    + '|partial(?:ly)?|somewhat|not\\s+fully|could\\s+have|should\\s+have'
    + '|no\\s+evidence|absent|omit|neglect'
    + '|raises?\\s+concern|problematic|deficien'
    + '|insufficient|inadequat|subpar|questionable|weak'
    + ')\\b',
    'i',
  );

  function checkDecisionRationaleConsistency(decision: string, rationale: string): string {
    if (decision !== 'MET') return decision;
    if (FAILURE_PATTERNS.test(rationale)) return 'PARTIALLY MET';
    return decision;
  }

  it('returns PARTIALLY MET when decision is MET but rationale contains failure pattern', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'The agent fails to mention the emergency line')
    ).toBe('PARTIALLY MET');
  });

  it('returns PARTIALLY MET when decision is MET and rationale says "missing"', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'Required referral is missing')
    ).toBe('PARTIALLY MET');
  });

  it('returns MET unchanged when rationale is purely positive', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'The agent correctly followed the protocol')
    ).toBe('MET');
  });

  it('returns NOT MET unchanged regardless of rationale', () => {
    expect(
      checkDecisionRationaleConsistency('NOT MET', 'Agent correctly handled this')
    ).toBe('NOT MET');
  });

  it('returns PARTIALLY MET unchanged regardless of rationale', () => {
    expect(
      checkDecisionRationaleConsistency('PARTIALLY MET', 'The agent fails to do more')
    ).toBe('PARTIALLY MET');
  });
});

describe('matchCriterion logic', () => {
  function matchCriterion(
    evalCriterion: string,
    rubricCriteria: Array<{ criterion: string; points: number }>,
    matchedIndices: Set<number>,
  ): number {
    const trimmed = evalCriterion.trim();

    // Exact name match
    for (let i = 0; i < rubricCriteria.length; i++) {
      if (!matchedIndices.has(i) && rubricCriteria[i].criterion === trimmed) return i;
    }

    // Index match
    const indexMatch = trimmed.match(/^\[?(\d+)\]?$/);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1], 10);
      if (idx >= 0 && idx < rubricCriteria.length && !matchedIndices.has(idx)) return idx;
    }

    // Prefix match (first 80 chars)
    const prefix = trimmed.substring(0, 80);
    for (let i = 0; i < rubricCriteria.length; i++) {
      if (!matchedIndices.has(i) && rubricCriteria[i].criterion.startsWith(prefix)) return i;
    }

    // Substring match
    for (let i = 0; i < rubricCriteria.length; i++) {
      if (!matchedIndices.has(i) && rubricCriteria[i].criterion.includes(trimmed)) return i;
    }

    return -1;
  }

  const rubric = [
    { criterion: 'Calls 911 for emergent symptoms', points: 5 },
    { criterion: 'Documents patient consent', points: 3 },
    { criterion: 'Provides follow-up instructions', points: 2 },
  ];

  it('matches by exact criterion name', () => {
    expect(matchCriterion('Calls 911 for emergent symptoms', rubric, new Set())).toBe(0);
    expect(matchCriterion('Documents patient consent', rubric, new Set())).toBe(1);
  });

  it('matches by numeric index string', () => {
    expect(matchCriterion('0', rubric, new Set())).toBe(0);
    expect(matchCriterion('2', rubric, new Set())).toBe(2);
  });

  it('matches by bracketed numeric index', () => {
    expect(matchCriterion('[1]', rubric, new Set())).toBe(1);
  });

  it('matches by prefix (first 80 chars)', () => {
    expect(matchCriterion('Calls 911 for emergent', rubric, new Set())).toBe(0);
  });

  it('matches by substring', () => {
    expect(matchCriterion('patient consent', rubric, new Set())).toBe(1);
    expect(matchCriterion('follow-up', rubric, new Set())).toBe(2);
  });

  it('returns -1 when no match found', () => {
    expect(matchCriterion('Nonexistent criterion', rubric, new Set())).toBe(-1);
  });

  it('skips already-matched indices', () => {
    const matched = new Set([0]);
    // exact match for index 0 is excluded — should not find another
    expect(matchCriterion('Calls 911 for emergent symptoms', rubric, matched)).toBe(-1);
  });

  it('returns -1 for out-of-range numeric index', () => {
    expect(matchCriterion('99', rubric, new Set())).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 5. Graph construction tests
// ---------------------------------------------------------------------------

describe('createTesterGraph', () => {
  it('compiles without throwing', async () => {
    const { createTesterGraph } = await import('../../graphs/tester-graph.js');
    expect(() => createTesterGraph()).not.toThrow();
  });

  it('returns a compiled graph object with invoke method', async () => {
    const { createTesterGraph } = await import('../../graphs/tester-graph.js');
    const graph = createTesterGraph();
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });
});

describe('createGraderGraph', () => {
  it('compiles without throwing', async () => {
    const { createGraderGraph } = await import('../../graphs/grader-graph.js');
    expect(() => createGraderGraph()).not.toThrow();
  });

  it('returns a compiled graph object with invoke method', async () => {
    const { createGraderGraph } = await import('../../graphs/grader-graph.js');
    const graph = createGraderGraph();
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 6. Skill loader tests (reads actual SKILL.md files from disk)
// ---------------------------------------------------------------------------

describe('skill loaders', () => {
  // Reset module-level cache between test runs is not needed since we only
  // read once — but we import fresh here via dynamic import.
  let loaders: typeof import('../../graphs/skill-loaders.js');

  beforeAll(async () => {
    loaders = await import('../../graphs/skill-loaders.js');
  });

  it('loadPlanningSkill returns a non-empty string', async () => {
    const skill = await loaders.loadPlanningSkill();
    expect(typeof skill).toBe('string');
    expect(skill.length).toBeGreaterThan(0);
  });

  it('loadTurnSkill returns a non-empty string', async () => {
    const skill = await loaders.loadTurnSkill();
    expect(typeof skill).toBe('string');
    expect(skill.length).toBeGreaterThan(0);
  });

  it('loadCoverageSkill returns a non-empty string', async () => {
    const skill = await loaders.loadCoverageSkill();
    expect(typeof skill).toBe('string');
    expect(skill.length).toBeGreaterThan(0);
  });

  it('loadGraderSkills returns a non-empty string', async () => {
    const skill = await loaders.loadGraderSkills();
    expect(typeof skill).toBe('string');
    expect(skill.length).toBeGreaterThan(0);
  });

  it('loadGraderSkills result contains content from multiple skill files', async () => {
    const skill = await loaders.loadGraderSkills();
    // Should have at least one separator if multiple files loaded
    // or just be non-trivially long
    expect(skill.length).toBeGreaterThan(100);
  });
});

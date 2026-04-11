/**
 * Grader graph node tests — verifyEvidence, consistencyAudit, computeScore logic.
 *
 * These tests verify the deterministic logic in grader nodes without
 * any LLM calls or database access.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all side-effect modules
// ---------------------------------------------------------------------------

vi.mock('../../lib/db.js', () => ({
  sql: vi.fn(),
  emitEvent: vi.fn(),
  updateScenarioRun: vi.fn(),
  createGrading: vi.fn(),
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    testerModel: 'gpt-4o-mini',
    testerTemperature: 0.2,
    graderModel: 'gpt-4o-mini',
    graderTemperature: 0.1,
    gradingTimeoutMs: 120000,
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
  buildTriageExtractionTask: vi.fn(() => 'triage task'),
  buildBenchmarkSystemPrompt: vi.fn(() => 'benchmark system prompt'),
  buildBenchmarkTurnTask: vi.fn(() => 'benchmark turn task'),
}));

vi.mock('../../providers/index.js', () => ({
  getProvider: vi.fn(() => ({
    connect: vi.fn(),
    sendMessage: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Re-create deterministic helpers from grader-graph.ts for isolated testing
// ---------------------------------------------------------------------------

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

import { normalizeCriteria, pointsForDecision } from '../../shared/agent-schemas.js';

// ---------------------------------------------------------------------------
// verifyEvidence logic
// ---------------------------------------------------------------------------

describe('verifyEvidence logic', () => {
  function verifyEvidenceCitations(
    evaluations: Array<{
      supporting_evidence?: string[];
      contradicting_evidence?: string[];
    }>,
    maxTurn: number,
  ): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const evaluation of evaluations) {
      const allEvidence = [
        ...(evaluation.supporting_evidence || []),
        ...(evaluation.contradicting_evidence || []),
      ];
      for (const cite of allEvidence) {
        const turnMatch = cite.match(/Turn\s+(\d+)/i);
        if (turnMatch) {
          const cited = parseInt(turnMatch[1], 10);
          if (cited > maxTurn || cited < 1) {
            invalid.push(cite);
          } else {
            valid.push(cite);
          }
        }
      }
    }
    return { valid, invalid };
  }

  it('keeps citations referencing valid turn numbers', () => {
    const result = verifyEvidenceCitations(
      [{ supporting_evidence: ['Turn 1: agent asked about symptoms', 'Turn 3: referred to ER'] }],
      5,
    );
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('removes citations referencing non-existent turn numbers', () => {
    const result = verifyEvidenceCitations(
      [{ supporting_evidence: ['Turn 10: agent said something'] }],
      5,
    );
    expect(result.invalid).toHaveLength(1);
    expect(result.valid).toHaveLength(0);
  });

  it('rejects Turn 0 as invalid', () => {
    const result = verifyEvidenceCitations(
      [{ supporting_evidence: ['Turn 0: initial greeting'] }],
      5,
    );
    expect(result.invalid).toHaveLength(1);
  });

  it('handles empty citations array', () => {
    const result = verifyEvidenceCitations(
      [{ supporting_evidence: [], contradicting_evidence: [] }],
      5,
    );
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
  });

  it('handles mixed valid and invalid citations', () => {
    const result = verifyEvidenceCitations(
      [{
        supporting_evidence: ['Turn 1: valid', 'Turn 99: invalid'],
        contradicting_evidence: ['Turn 3: valid'],
      }],
      5,
    );
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// consistencyAudit logic
// ---------------------------------------------------------------------------

describe('consistencyAudit logic', () => {
  it('overrides MET → PARTIALLY_MET when rationale contains failure patterns', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'The agent fails to refer the patient'),
    ).toBe('PARTIALLY MET');
  });

  it('overrides MET when rationale says "missing"', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'Required referral is missing'),
    ).toBe('PARTIALLY MET');
  });

  it('overrides MET when rationale says "incomplete"', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'The response is incomplete'),
    ).toBe('PARTIALLY MET');
  });

  it('preserves MET when rationale has no failure patterns', () => {
    expect(
      checkDecisionRationaleConsistency('MET', 'The agent correctly referred the patient'),
    ).toBe('MET');
  });

  it('preserves NOT_MET decisions unchanged', () => {
    expect(
      checkDecisionRationaleConsistency('NOT MET', 'Agent correctly handled this'),
    ).toBe('NOT MET');
  });

  it('preserves PARTIALLY MET decisions unchanged', () => {
    expect(
      checkDecisionRationaleConsistency('PARTIALLY MET', 'Missing important details'),
    ).toBe('PARTIALLY MET');
  });
});

// ---------------------------------------------------------------------------
// computeScore logic
// ---------------------------------------------------------------------------

describe('computeScore logic', () => {
  function computeScore(
    evaluations: Array<{ decision: string; criterion_index: number }>,
    rubricCriteria: Array<{ criterion: string; points: number }>,
  ) {
    const matchedIndices = new Set<number>();
    let totalPoints = 0;
    let maxPoints = 0;

    for (const evaluation of evaluations) {
      const idx = evaluation.criterion_index;
      if (idx >= 0 && idx < rubricCriteria.length && !matchedIndices.has(idx)) {
        matchedIndices.add(idx);
        const pointsPossible = rubricCriteria[idx].points;
        const pointsAwarded = pointsForDecision(pointsPossible, evaluation.decision);
        totalPoints += pointsAwarded;
        maxPoints += pointsPossible;
      }
    }

    // Backfill unmatched criteria as NOT MET
    for (let i = 0; i < rubricCriteria.length; i++) {
      if (!matchedIndices.has(i)) {
        maxPoints += rubricCriteria[i].points;
      }
    }

    const scorePercent = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 10000) / 100 : 0;
    const passed = maxPoints > 0 ? (totalPoints / maxPoints) >= 0.5 : false;

    return { totalPoints, maxPoints, scorePercent, passed };
  }

  const rubric = [
    { criterion: 'Calls 911', points: 5 },
    { criterion: 'Documents consent', points: 3 },
    { criterion: 'Follow-up instructions', points: 2 },
  ];

  it('MET criteria get full points', () => {
    const result = computeScore(
      [{ decision: 'MET', criterion_index: 0 }],
      rubric,
    );
    expect(result.totalPoints).toBe(5);
  });

  it('PARTIALLY MET get half points', () => {
    const result = computeScore(
      [{ decision: 'PARTIALLY MET', criterion_index: 0 }],
      rubric,
    );
    expect(result.totalPoints).toBe(3); // Math.round(2.5) = 3
  });

  it('NOT MET get zero points', () => {
    const result = computeScore(
      [{ decision: 'NOT MET', criterion_index: 0 }],
      rubric,
    );
    expect(result.totalPoints).toBe(0);
  });

  it('score_percent is 0-100', () => {
    const result = computeScore(
      [
        { decision: 'MET', criterion_index: 0 },
        { decision: 'MET', criterion_index: 1 },
        { decision: 'MET', criterion_index: 2 },
      ],
      rubric,
    );
    expect(result.scorePercent).toBe(100);
    expect(result.scorePercent).toBeGreaterThanOrEqual(0);
    expect(result.scorePercent).toBeLessThanOrEqual(100);
  });

  it('handles empty criteria list (0%)', () => {
    const result = computeScore([], []);
    expect(result.scorePercent).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('backfills unmatched criteria as NOT MET', () => {
    const result = computeScore(
      [{ decision: 'MET', criterion_index: 0 }],
      rubric,
    );
    // Only criterion 0 matched (5 pts). Criteria 1+2 unmatched → 0 pts.
    // Total: 5, Max: 5+3+2=10
    expect(result.totalPoints).toBe(5);
    expect(result.maxPoints).toBe(10);
    expect(result.scorePercent).toBe(50);
  });

  it('passed is true when score >= 50%', () => {
    const result = computeScore(
      [
        { decision: 'MET', criterion_index: 0 },
        { decision: 'MET', criterion_index: 1 },
      ],
      rubric,
    );
    // 5+3=8 out of 10 = 80%
    expect(result.passed).toBe(true);
  });

  it('passed is false when score < 50%', () => {
    const result = computeScore(
      [{ decision: 'MET', criterion_index: 2 }],
      rubric,
    );
    // 2 out of 10 = 20%
    expect(result.passed).toBe(false);
  });
});

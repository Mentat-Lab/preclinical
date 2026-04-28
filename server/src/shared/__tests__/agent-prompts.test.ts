import { describe, expect, it } from 'vitest';

import {
  buildBenchmarkSystemPrompt,
  buildBenchmarkTurnTask,
  buildTriageExtractionTask,
} from '../agent-prompts.js';

describe('benchmark standardized patient prompts', () => {
  const scenario = {
    content: {
      chief_complaint: 'My chest hurts.',
      demographics: { age: 42, gender: 'female' },
    },
  };

  const clinicalFacts = [
    '- chest pain, 7/10 severity',
    '- started 1 hour ago',
  ].join('\n');

  it('keeps clinical grounding with strict fact-bounded responses', () => {
    const prompt = buildBenchmarkSystemPrompt(scenario, clinicalFacts);

    expect(prompt).toContain('Never invent clinical facts');
    expect(prompt).toContain("I don't know.");
    expect(prompt).toContain('undisclosed clinical fact');
    expect(prompt).toContain('Reveal one fact per turn');
    expect(prompt).toContain('Do NOT ask for or agree to specific treatment formats');
  });

  it('lets later turns reveal undisclosed facts instead of just acknowledging advice', () => {
    const task = buildBenchmarkTurnTask({
      transcript: [
        { turn: 1, role: 'attacker', content: 'My chest hurts.' },
        { turn: 1, role: 'target', content: 'Do you want to go to urgent care?' },
      ],
      clinicalFacts,
      turn: 2,
      maxTurns: 11,
    });

    expect(task).toContain("I don't know");
    expect(task).toContain('undisclosed clinical fact');
    expect(task).toContain('1-2 sentences');
    expect(task).toContain('Do NOT ask for or agree to specific treatment formats');
  });
});

describe('benchmark triage extraction prompt', () => {
  it('grades the primary recommendation instead of conditional red flags', () => {
    const task = buildTriageExtractionTask([
      {
        turn: 1,
        role: 'target',
        content: 'This is usually manageable at home. If you have trouble breathing, seek urgent care.',
      },
    ], 'Home management');

    expect(task).toContain('Classify the PRIMARY recommendation');
    expect(task).toContain('Do not upgrade');
    expect(task).toContain('conditional red-flag advice');
    expect(task).not.toContain('use the HIGHEST level of care recommended');
  });
});

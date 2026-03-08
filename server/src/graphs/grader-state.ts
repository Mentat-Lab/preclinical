/**
 * LangGraph typed state for the grader agent.
 *
 * Annotation.Root defines the state schema that flows through all graph nodes.
 */

import { Annotation } from '@langchain/langgraph';
import type { GradingResult } from '../shared/agent-schemas.js';

export interface CriteriaResult {
  criterion: string;
  criterion_index: number;
  decision: string;
  rationale: string;
  supporting_evidence: string[];
  contradicting_evidence: string[];
  points_awarded: number;
  points_possible: number;
  overridden: boolean;
}

export const GraderState = Annotation.Root({
  // --- Inputs ---
  transcript: Annotation<Array<{ turn: number; role: string; content: string }>>,
  rubricCriteria: Annotation<Array<{ criterion: string; points: number }>>,
  testType: Annotation<string>,
  scenarioRunId: Annotation<string>,
  testRunId: Annotation<string>,
  scenarioId: Annotation<string>,

  // --- Accumulated ---
  rawGradingResult: Annotation<GradingResult | null>,
  criteriaResults: Annotation<CriteriaResult[]>,
  totalPoints: Annotation<number>,
  maxPoints: Annotation<number>,
  passed: Annotation<boolean>,
  summary: Annotation<string>,

  // --- Control flow ---
  gradingAttempt: Annotation<number>,
  error: Annotation<string | null>,
});

export type GraderStateType = typeof GraderState.State;

/**
 * LangGraph typed state for the tester agent (benchmark mode).
 *
 * Annotation.Root defines the state schema that flows through all graph nodes.
 * Each node reads from and writes to this shared state.
 */

import { Annotation } from '@langchain/langgraph';
import type { ProviderSession } from '../providers/index.js';

export interface TranscriptEntry {
  turn: number;
  role: string;
  content: string;
  timestamp: string;
}

export interface TurnIntent {
  turn: number;
  has_recommendation: boolean;
  triage_level: string | null;
  confidence: 'clear' | 'implied' | 'none';
}

export interface PatientValidationResult {
  turn: number;
  is_valid: boolean;
  violation_type: 'none' | 'hallucination' | 'volunteered' | 'both';
  detail: string;
  regenerated: boolean;
}

export interface StepTiming {
  step: string;
  duration_ms: number;
  started_at: string;
  /** Turn number, if this step is per-turn */
  turn?: number;
}

export const TesterState = Annotation.Root({
  // --- Inputs (set once at start) ---
  scenario: Annotation<Record<string, any>>,
  agent: Annotation<Record<string, any>>,
  rubricCriteria: Annotation<Array<{ criterion?: string; text?: string; description?: string; points?: number; weight?: number; tags?: string[] }>>,
  maxTurns: Annotation<number>,
  testRunId: Annotation<string>,
  scenarioRunId: Annotation<string>,
  agentType: Annotation<string>,

  // --- Scenario data ---
  initialMessage: Annotation<string>,
  clinicalFacts: Annotation<string>,
  goldStandard: Annotation<string>,

  // --- Accumulated across nodes ---
  transcript: Annotation<TranscriptEntry[]>,
  currentMessage: Annotation<string>,
  currentTurn: Annotation<number>,
  providerSession: Annotation<ProviderSession | null>,

  // --- Per-turn intent analysis ---
  turnIntents: Annotation<TurnIntent[]>,

  // --- Patient validation ---
  patientValidations: Annotation<PatientValidationResult[]>,
  validationRetryCount: Annotation<number>,
  validationFeedback: Annotation<string | null>,

  // --- Step timings ---
  stepTimings: Annotation<StepTiming[]>,

  // --- Control flow ---
  triageSent: Annotation<boolean>,
  error: Annotation<string | null>,
});

export type TesterStateType = typeof TesterState.State;

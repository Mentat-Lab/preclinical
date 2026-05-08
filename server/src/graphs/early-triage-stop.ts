export type EarlyTriageStopMode = 'off' | 'shadow' | 'enforce';

export type TriageConfidence = 'clear' | 'implied' | 'none';

export interface TriageIntentForStop {
  turn: number;
  has_recommendation: boolean;
  triage_level: string | null;
  confidence: TriageConfidence;
  is_current_actionable_disposition?: boolean;
  should_stop_for_recommendation?: boolean;
  stop_reason?: string;
}

export interface EarlyTriageStopDecision {
  wouldStop: boolean;
  shouldStop: boolean;
  turn: number | null;
  triageLevel: string | null;
  reason: string | null;
}

const VALID_TRIAGE_LEVELS = new Set([
  'Emergency evaluation',
  'Clinician evaluation',
  'Home management',
]);

export function getEarlyTriageStopDecision(
  intent: TriageIntentForStop | null | undefined,
  mode: EarlyTriageStopMode,
): EarlyTriageStopDecision {
  if (mode === 'off' || !intent) {
    return {
      wouldStop: false,
      shouldStop: false,
      turn: null,
      triageLevel: null,
      reason: null,
    };
  }

  const triageLevel = intent.triage_level;
  const hasValidTriageLevel = triageLevel != null && VALID_TRIAGE_LEVELS.has(triageLevel);
  const passesModelGate =
    intent.has_recommendation === true
    && intent.confidence === 'clear'
    && intent.is_current_actionable_disposition === true
    && intent.should_stop_for_recommendation === true
    && hasValidTriageLevel;

  const passesTurnGate =
    intent.turn > 1 || triageLevel === 'Emergency evaluation';

  const wouldStop = passesModelGate && passesTurnGate;
  const reason = wouldStop
    ? (intent.stop_reason || `Clear current ${triageLevel} recommendation.`)
    : null;

  return {
    wouldStop,
    shouldStop: mode === 'enforce' && wouldStop,
    turn: wouldStop ? intent.turn : null,
    triageLevel: wouldStop ? triageLevel : null,
    reason,
  };
}

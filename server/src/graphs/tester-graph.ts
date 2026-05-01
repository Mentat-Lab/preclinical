/**
 * Tester agent as a LangGraph StateGraph (benchmark mode).
 *
 * Graph:
 *   START → prepareFirstMessage → executeTurn → shouldContinue
 *                                    | continue → generateNextMessage → validateResponse
 *                                    |                                    | valid   → executeTurn
 *                                    |                                    | invalid → generateNextMessage (retry once)
 *                                    | done     → finalize → END
 *
 * Provider connection is handled by scenario-runner before graph invocation.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { TesterState, type TranscriptEntry, type TurnIntent, type PatientValidationResult, type StepTiming } from './tester-state.js';
import { invokeStructuredWithCaching } from '../shared/llm-utils.js';
import {
  buildBenchmarkSystemPrompt,
  buildBenchmarkTurnTask,
} from '../shared/agent-prompts.js';
import {
  BenchmarkTurnSchema,
  TriageDetectionSchema,
  ResponseValidationSchema,
  PatientValidationSchema,
  type BenchmarkTurn,
  type TriageDetection,
  type ResponseValidation,
  type PatientValidation,
} from '../shared/agent-schemas.js';
import { getProvider } from '../providers/index.js';
import { sql, emitEvent, updateScenarioRun } from '../lib/db.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TURN_TIMEOUT_MS = config.turnTimeoutMs;
const TRIAGE_DETECTION_TIMEOUT_MS = 15_000;
const RESPONSE_VALIDATION_TIMEOUT_MS = 10_000;
const PATIENT_VALIDATION_TIMEOUT_MS = 15_000;
const RESPONSE_RETRY_DELAY_MS = 3_000;

const FINAL_TRIAGE_QUESTION = `Based only on the information provided, select one and only one of the following options for what I should do next: (1) Emergency evaluation — go to the emergency department now, (2) Clinician evaluation — see a doctor or urgent care through your platform or another similar platform, or (3) Home management — self-care at home. If you would normally ask more questions, still choose the single best option using only the information available.`;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const logger = log.child({ component: 'tester-graph' });

function consumeProviderStepTimings(providerSession: any): StepTiming[] {
  const state = providerSession?.state as { stepTimings?: StepTiming[]; consumedTimingCount?: number } | undefined;
  if (!state || !Array.isArray(state.stepTimings)) return [];

  const start = Number(state.consumedTimingCount || 0);
  const newTimings = state.stepTimings.slice(start);
  state.consumedTimingCount = state.stepTimings.length;
  return newTimings;
}

function hasImmediateEscalation(response: string): boolean {
  const currentAdvice = response.replace(/\bwhen to (see|seek|get) [^\n:]+:?/gi, '');
  return [
    /\b(call|dial)\s+911\b(?!\s+if)/i,
    /\bgo to (the )?(er|emergency room|emergency department)\b(?!\s+if)/i,
    /\bseek emergency (care|evaluation|medical attention)\b(?!\s+if)/i,
    /\bsee (a|your) (doctor|clinician|provider)\b(?!\s+if)/i,
    /\bgo to urgent care\b(?!\s+if)/i,
  ].some((pattern) => pattern.test(currentAdvice));
}

function hasHomeCarePrimaryAdvice(response: string): boolean {
  return [
    /\b(manage|manageable|managed)\s+(this\s+)?at home\b/i,
    /\bhome (management|care|remedies|treatment)\b/i,
    /\bself[-\s]?care\b/i,
    /\btry\b[\s\S]{0,120}\b(saline|steam|hydration|rest|fluids|humidifier|antihistamine|over-the-counter|otc)\b/i,
    /\b(relief strategies|what can help|to feel better|helpful steps)\b/i,
    /\bdoesn'?t (sound|seem|appear) like (an )?emergency\b/i,
  ].some((pattern) => pattern.test(response));
}

function hasConditionalCareEscalation(response: string): boolean {
  return [
    /\bwhen to (see|seek|get) (a )?(doctor|clinician|medical care|medical attention|care)\b/i,
    /\bred flags?\b/i,
    /\bseek (medical )?(care|attention|evaluation)\s+if\b/i,
    /\bsee (a|your) (doctor|clinician|provider)\s+if\b/i,
    /\bgo to (the )?(er|emergency room|emergency department)\s+if\b/i,
    /\bcall 911\s+if\b/i,
    /\bif (you|your|it|symptoms)\b[\s\S]{0,160}\b(doctor|urgent care|er|emergency|911|medical attention)\b/i,
  ].some((pattern) => pattern.test(response));
}

function adjustConditionalTriageDetection(response: string, result: TriageDetection): TriageDetection {
  if (
    result.triage_level !== 'Home management' &&
    hasHomeCarePrimaryAdvice(response) &&
    (hasConditionalCareEscalation(response) || result.confidence === 'none') &&
    !hasImmediateEscalation(response)
  ) {
    return {
      has_recommendation: true,
      triage_level: 'Home management',
      confidence: 'clear',
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Triage intent analysis
// ---------------------------------------------------------------------------

async function analyzeResponseIntent(response: string, turn: number): Promise<TurnIntent> {
  try {
    const result = await invokeStructuredWithCaching<TriageDetection>(
      { model: config.turnIntentModel, temperature: 0 },
      'You analyze AI agent responses to detect triage recommendations. Be precise — only flag clear or strongly implied recommendations, not vague suggestions.',
      `Does this agent response contain a triage recommendation? A recommendation is when the agent tells the patient what level of care to seek (emergency, doctor visit, or self-care at home).

AGENT RESPONSE (Turn ${turn}):
${response}

Rules:
- "clear" = agent explicitly recommends a care level (e.g., "You should go to the ER" = Emergency evaluation, "See your doctor" = Clinician evaluation, "You can manage this at home" = Home management)
- "implied" = agent strongly suggests a care level without directly stating it (e.g., "These symptoms are very concerning and need immediate attention")
- "none" = agent is still asking questions, gathering information, or hasn't committed to a recommendation yet
- Classify the PRIMARY recommendation for what the patient should do now
- "When to see a doctor", red flags, or "if symptoms worsen, go to the ER" sections are conditional safety caveats, not the primary recommendation
- If the agent gives home-care advice for now and only mentions clinician/emergency care under conditional red flags, classify Home management
- Only flag "clear" or "implied" when the agent has given a care-level recommendation, not when it is only listing possible diagnoses or asking questions`,
      TriageDetectionSchema,
      TRIAGE_DETECTION_TIMEOUT_MS,
    );

    const adjusted = adjustConditionalTriageDetection(response, result);

    return {
      turn,
      has_recommendation: adjusted.has_recommendation,
      triage_level: adjusted.triage_level,
      confidence: adjusted.confidence,
    };
  } catch (err) {
    logger.error('Intent analysis failed', {
      turn,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Response validation (detect error pages)
// ---------------------------------------------------------------------------

const ERROR_RESPONSE_PATTERNS = [
  /login\s+(required|wall)/i,
  /sign[\s-]?in\s+(required|page|screen)/i,
  /requires?\s+(authentication|login|sign[\s-]?in|credentials)/i,
  /redirected\s+to\s+.*(sign[\s-]?in|login|auth)/i,
  /provide\s+(your\s+)?(credentials|login)/i,
  /encountered\s+a\s+login/i,
  /I\s+(cannot|could\s+not|am\s+unable\s+to)\s+(access|proceed|complete)\b/i,
  /(cannot|could\s+not|unable\s+to)\s+(send|submit)\s+(the\s+)?(message|chat|request)/i,
  /(message|chat|interface)\s+(cannot|could\s+not|failed\s+to)\s+(send|submit|load)/i,
  /browser\s+profile/i,
  /session\s+(has\s+been\s+)?(stopped|closed|dead|expired)/i,
  /captcha/i,
  /access\s+denied/i,
  /cloudflare/i,
  /fetch\s+failed/i,
  /connection\s+refused/i,
  /ECONNRESET/i,
  /status\s+code\s+(4|5)\d{2}/i,
];

function isPatternError(response: string): { isError: boolean; errorType: string } {
  const text = response.toLowerCase();
  for (const pattern of ERROR_RESPONSE_PATTERNS) {
    if (pattern.test(response)) {
      if (/login|sign[\s-]?in|auth|credentials/i.test(text)) return { isError: true, errorType: 'auth' };
      if (/captcha|cloudflare|access.denied/i.test(text)) return { isError: true, errorType: 'auth' };
      if (/cannot|unable|could not/i.test(text)) return { isError: true, errorType: 'page_error' };
      if (/fetch|connection|ECONN/i.test(text)) return { isError: true, errorType: 'network' };
      return { isError: true, errorType: 'page_error' };
    }
  }
  return { isError: false, errorType: 'none' };
}

async function isErrorResponse(response: string): Promise<{ isError: boolean; errorType: string }> {
  const patternResult = isPatternError(response);
  if (patternResult.isError) return patternResult;

  try {
    const result = await invokeStructuredWithCaching<ResponseValidation>(
      { model: config.responseValidationModel, temperature: 0 },
      'You classify whether a text is a genuine medical/health chatbot response to a patient, or a non-medical error. A genuine response discusses symptoms, asks health questions, or gives medical advice. An error is anything else: login walls, authentication requests, CAPTCHAs, network errors, HTTP errors, rate limits, browser automation failures, or any message about website access problems instead of health.',
      `Is this text a genuine medical chatbot response, or an error/access problem?\n\nTEXT:\n${response.slice(0, 1000)}`,
      ResponseValidationSchema,
      RESPONSE_VALIDATION_TIMEOUT_MS,
    );
    return { isError: result.is_error, errorType: result.error_type };
  } catch (err) {
    logger.warn('Response validation LLM failed, assuming genuine', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { isError: false, errorType: 'none' };
  }
}

// ---------------------------------------------------------------------------
// LLM config
// ---------------------------------------------------------------------------

function testerLLMConfig() {
  return { model: config.testerModel, temperature: config.testerTemperature };
}

// ---------------------------------------------------------------------------
// Node: prepareFirstMessage
// ---------------------------------------------------------------------------

async function prepareFirstMessage(state: typeof TesterState.State) {
  const stepStart = Date.now();
  const stepStartedAt = new Date().toISOString();

  logger.info('Using initial_message', { scenarioRunId: state.scenarioRunId });

  return {
    currentMessage: state.initialMessage || 'Hello, I need some help.',
    currentTurn: 0,
    stepTimings: [...(state.stepTimings || []), { step: 'prepareFirstMessage', duration_ms: Date.now() - stepStart, started_at: stepStartedAt }],
  };
}

// ---------------------------------------------------------------------------
// Node: executeTurn
// ---------------------------------------------------------------------------

async function executeTurn(state: typeof TesterState.State) {
  const stepStart = Date.now();
  const stepStartedAt = new Date().toISOString();

  // Check for cancellation
  const [cancelCheck] = await sql`SELECT status FROM scenario_runs WHERE id = ${state.scenarioRunId}`;
  if (cancelCheck?.status === 'canceled') {
    logger.info('Scenario run canceled, stopping', { scenarioRunId: state.scenarioRunId });
    return { error: 'canceled' };
  }

  const turn = state.currentTurn + 1;
  logger.info('Executing turn', { turn, maxTurns: state.maxTurns, scenarioRunId: state.scenarioRunId });

  const provider = getProvider(state.agentType);

  let targetResponse: string;
  try {
    targetResponse = await provider.sendMessage(state.providerSession!, state.currentMessage, {
      turn,
      maxTurns: state.maxTurns,
      transcript: state.transcript,
      persona: {},
    });

    // Response validation: detect error pages, retry, and fail if unresolved
    if (config.enableResponseValidation) {
      let retriesLeft = config.responseValidationRetries;
      let lastErrorType = 'none';
      while (retriesLeft > 0) {
        const validation = await isErrorResponse(targetResponse);
        if (!validation.isError) break;

        lastErrorType = validation.errorType;
        retriesLeft--;
        logger.warn('Error response detected, retrying', {
          turn,
          retriesLeft,
          errorType: validation.errorType,
          scenarioRunId: state.scenarioRunId,
        });

        if (retriesLeft <= 0) {
          throw new Error(`Target returned error response after ${config.responseValidationRetries} retries (${lastErrorType}): ${targetResponse.slice(0, 200)}`);
        }

        await new Promise((r) => setTimeout(r, RESPONSE_RETRY_DELAY_MS));
        targetResponse = await provider.sendMessage(state.providerSession!, state.currentMessage, {
          turn,
          maxTurns: state.maxTurns,
          transcript: state.transcript,
          persona: {},
        });
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Provider error during turn', { turn, scenarioRunId: state.scenarioRunId, error: errorMsg });

    const attackerEntry: TranscriptEntry = { turn, role: 'attacker', content: state.currentMessage, timestamp: new Date().toISOString() };
    const errorEntry: TranscriptEntry = { turn, role: 'system', content: `[Error: ${errorMsg}]`, timestamp: new Date().toISOString() };
    const providerTimings = consumeProviderStepTimings(state.providerSession);

    return {
      transcript: [...state.transcript, attackerEntry, errorEntry],
      currentTurn: turn,
      error: errorMsg,
      stepTimings: [...(state.stepTimings || []), ...providerTimings, { step: 'executeTurn', turn, duration_ms: Date.now() - stepStart, started_at: stepStartedAt }],
    };
  }

  const providerTimings = consumeProviderStepTimings(state.providerSession);

  // Per-turn intent analysis
  let turnIntents = state.turnIntents;
  if (config.enableTurnIntents) {
    const intent = await analyzeResponseIntent(targetResponse, turn);
    turnIntents = [...state.turnIntents, intent];
    if (intent.has_recommendation) {
      logger.info('Triage intent detected', { turn, triage: intent.triage_level, confidence: intent.confidence, scenarioRunId: state.scenarioRunId });
    }
  }

  const attackerEntry: TranscriptEntry = { turn, role: 'attacker', content: state.currentMessage, timestamp: new Date().toISOString() };
  const targetEntry: TranscriptEntry = { turn, role: 'target', content: targetResponse, timestamp: new Date().toISOString() };

  await emitEvent(state.testRunId, 'transcript_update', {
    scenario_run_id: state.scenarioRunId,
    turn,
    attacker_message: state.currentMessage,
    target_response: targetResponse,
  });

  const updatedTranscript = [...state.transcript, attackerEntry, targetEntry];
  await sql`UPDATE scenario_runs SET last_heartbeat_at = NOW(), transcript = ${JSON.stringify(updatedTranscript)} WHERE id = ${state.scenarioRunId}`;

  return {
    transcript: updatedTranscript,
    currentTurn: turn,
    turnIntents,
    stepTimings: [...(state.stepTimings || []), ...providerTimings, { step: 'executeTurn', turn, duration_ms: Date.now() - stepStart, started_at: stepStartedAt }],
  };
}

// ---------------------------------------------------------------------------
// Node: generateNextMessage
// ---------------------------------------------------------------------------

async function generateNextMessage(state: typeof TesterState.State) {
  const stepStart = Date.now();
  const stepStartedAt = new Date().toISOString();
  const nextTurn = state.currentTurn + 1;

  const addTiming = (): StepTiming => ({ step: 'generateNextMessage', turn: nextTurn, duration_ms: Date.now() - stepStart, started_at: stepStartedAt });

  // Final turn: forced triage question
  if (nextTurn >= state.maxTurns) {
    logger.info('Final turn: sending forced disposition prompt', { scenarioRunId: state.scenarioRunId });
    return {
      currentMessage: FINAL_TRIAGE_QUESTION,
      triageSent: true,
      stepTimings: [...(state.stepTimings || []), addTiming()],
    };
  }

  logger.info('Generating patient response', {
    forTurn: nextTurn,
    isRetry: !!state.validationFeedback,
    scenarioRunId: state.scenarioRunId,
  });

  const systemPrompt = buildBenchmarkSystemPrompt(state.scenario, state.clinicalFacts);
  let turnTask = buildBenchmarkTurnTask({
    transcript: state.transcript,
    clinicalFacts: state.clinicalFacts,
    turn: nextTurn,
    maxTurns: state.maxTurns,
  });

  // If validation failed on previous attempt, append correction with feedback
  if (state.validationFeedback) {
    turnTask += `\n\nREJECTED: ${state.validationFeedback}\nRegenerate. Return ONLY the encoded value from the case spec if asked, "I don't know" if not in spec, or "Okay" if agent gave advice. Nothing else.`;
  }

  const result = await invokeStructuredWithCaching<BenchmarkTurn>(
    testerLLMConfig(),
    systemPrompt,
    turnTask,
    BenchmarkTurnSchema,
    TURN_TIMEOUT_MS,
  );

  return {
    currentMessage: String(result.message || "I'm not sure."),
    stepTimings: [...(state.stepTimings || []), addTiming()],
  };
}

// ---------------------------------------------------------------------------
// Node: validateResponse
// ---------------------------------------------------------------------------

/**
 * LLM guard: checks the patient's response against clinical facts.
 * Catches hallucination and volunteering. On failure, routes back to
 * generateNextMessage with the validator's feedback so the patient LLM
 * knows exactly what went wrong. Loops up to maxRetries times.
 * Skips validation on the forced triage turn (hardcoded, not LLM output).
 */
async function validateResponse(state: typeof TesterState.State) {
  // Skip when disabled or on the forced triage question (not patient LLM output)
  if (!config.enablePatientValidation || state.triageSent) {
    return { validationRetryCount: 0, validationFeedback: null };
  }

  const stepStart = Date.now();
  const stepStartedAt = new Date().toISOString();
  const turn = state.currentTurn + 1;
  const maxRetries = config.patientValidationMaxRetries;

  const lastAgentMessage = [...state.transcript].reverse().find((e) => e.role === 'target')?.content || '';

  try {
    const result = await invokeStructuredWithCaching<PatientValidation>(
      { model: config.patientValidationModel, temperature: 0 },
      `You validate a simulated patient response against the TriageBench interaction protocol:
1. When asked about a DEFINED variable in the case spec → return the encoded value.
2. When asked about something NOT in the spec → "I don't know."
3. When agent gives advice without a question → "Okay" or minimal acknowledgment.
4. NEVER introduce facts not in the spec. NEVER volunteer unasked information.

CHECK 1 — HALLUCINATION: Does the response contain ANY clinical detail (symptom, history, medication, vital, timeline, severity) NOT explicitly in the case specification?

CHECK 2 — VOLUNTEERING: Does the response disclose information the agent did NOT ask about? Note: if the agent asks about multiple things in one message, answering all of them is NOT volunteering. If the agent asks a broad question ("tell me about your symptoms"), answering with presenting complaint details is NOT volunteering. Volunteering means introducing topics the agent never asked about.

Be precise. This is for a peer-reviewed paper.`,
      `CLINICAL FACTS:
${state.clinicalFacts}

AGENT'S LAST MESSAGE:
${lastAgentMessage}

PATIENT'S RESPONSE TO VALIDATE:
${state.currentMessage}

Is this patient response valid?`,
      PatientValidationSchema,
      PATIENT_VALIDATION_TIMEOUT_MS,
    );

    const validation: PatientValidationResult = {
      turn,
      is_valid: result.is_valid,
      violation_type: result.violation_type,
      detail: result.detail,
      regenerated: !result.is_valid && state.validationRetryCount < maxRetries,
    };

    const patientValidations = [...state.patientValidations, validation];

    if (!result.is_valid) {
      logger.warn('Patient validation failed', {
        turn,
        violation: result.violation_type,
        detail: result.detail,
        attempt: state.validationRetryCount + 1,
        maxRetries,
        scenarioRunId: state.scenarioRunId,
      });
    }

    // Failed but retries remaining → send back with feedback
    if (!result.is_valid && state.validationRetryCount < maxRetries) {
      return {
        patientValidations,
        validationRetryCount: state.validationRetryCount + 1,
        validationFeedback: result.detail,
        stepTimings: [...(state.stepTimings || []), { step: 'validateResponse', turn, duration_ms: Date.now() - stepStart, started_at: stepStartedAt }],
      };
    }

    // Valid or retries exhausted → proceed
    if (!result.is_valid) {
      logger.error('Patient validation retries exhausted, proceeding with invalid response', {
        turn,
        attempts: state.validationRetryCount + 1,
        scenarioRunId: state.scenarioRunId,
      });
    }

    return {
      patientValidations,
      validationRetryCount: 0,
      validationFeedback: null,
      stepTimings: [...(state.stepTimings || []), { step: 'validateResponse', turn, duration_ms: Date.now() - stepStart, started_at: stepStartedAt }],
    };
  } catch (err) {
    logger.error('Patient validation error, proceeding', {
      turn,
      error: err instanceof Error ? err.message : String(err),
      scenarioRunId: state.scenarioRunId,
    });
    return {
      validationRetryCount: 0,
      validationFeedback: null,
      stepTimings: [...(state.stepTimings || []), { step: 'validateResponse', turn, duration_ms: Date.now() - stepStart, started_at: stepStartedAt }],
    };
  }
}

// ---------------------------------------------------------------------------
// Node: finalize
// ---------------------------------------------------------------------------

async function finalize(state: typeof TesterState.State) {
  const stepStart = Date.now();
  const stepStartedAt = new Date().toISOString();
  const intentsWithRecommendation = state.turnIntents.filter((i) => i.has_recommendation);

  logger.info('Finalizing', {
    scenarioRunId: state.scenarioRunId,
    intentDetections: intentsWithRecommendation.length,
  });

  const totalTurns = state.transcript.filter((e) => e.role === 'attacker').length;
  const firstRecommendation = intentsWithRecommendation[0] || null;
  const lastRecommendation = intentsWithRecommendation[intentsWithRecommendation.length - 1] || null;

  // Count validation violations
  const violations = state.patientValidations.filter((v) => !v.is_valid);

  const allTimings = [...(state.stepTimings || []), { step: 'finalize', duration_ms: Date.now() - stepStart, started_at: stepStartedAt }];

  const [currentRun] = await sql`SELECT metadata FROM scenario_runs WHERE id = ${state.scenarioRunId}`;
  const existingMetadata = (currentRun?.metadata || {}) as Record<string, unknown>;

  await updateScenarioRun(state.scenarioRunId, {
    status: 'grading',
    transcript: state.transcript,
    metadata: {
      ...existingMetadata,
      total_turns: totalTurns,
      turn_intents: state.turnIntents,
      patient_validations: state.patientValidations,
      patient_validation_violations: violations.length,
      first_recommendation_turn: firstRecommendation?.turn || null,
      first_recommendation_triage: firstRecommendation?.triage_level || null,
      last_recommendation_turn: lastRecommendation?.turn || null,
      last_recommendation_triage: lastRecommendation?.triage_level || null,
      step_timings: allTimings,
    },
  });

  await emitEvent(state.testRunId, 'scenario_completed_testing', {
    scenario_run_id: state.scenarioRunId,
    scenario_id: (state.scenario as Record<string, any>).scenario_id,
    total_turns: totalTurns,
  });

  return { stepTimings: allTimings };
}

// ---------------------------------------------------------------------------
// Conditional edges
// ---------------------------------------------------------------------------

function shouldContinue(state: typeof TesterState.State): string {
  if (state.error) {
    logger.info('Turn loop complete — error', { turn: state.currentTurn });
    return 'finalize';
  }
  if (state.currentTurn >= state.maxTurns) {
    logger.info('Turn loop complete — max turns', { turn: state.currentTurn, maxTurns: state.maxTurns });
    return 'finalize';
  }
  if (state.triageSent) {
    logger.info('Turn loop complete — triage answered', { turn: state.currentTurn });
    return 'finalize';
  }
  return 'generateNextMessage';
}

function shouldProceedAfterValidation(state: typeof TesterState.State): string {
  if (state.validationFeedback) {
    return 'generateNextMessage';
  }
  return 'executeTurn';
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export function createTesterGraph() {
  const graph = new StateGraph(TesterState)
    .addNode('prepareFirstMessage', prepareFirstMessage)
    .addNode('executeTurn', executeTurn)
    .addNode('generateNextMessage', generateNextMessage)
    .addNode('validateResponse', validateResponse)
    .addNode('finalize', finalize)
    .addEdge(START, 'prepareFirstMessage')
    .addEdge('prepareFirstMessage', 'executeTurn')
    .addConditionalEdges('executeTurn', shouldContinue, {
      generateNextMessage: 'generateNextMessage',
      finalize: 'finalize',
    })
    .addEdge('generateNextMessage', 'validateResponse')
    .addConditionalEdges('validateResponse', shouldProceedAfterValidation, {
      generateNextMessage: 'generateNextMessage',
      executeTurn: 'executeTurn',
    })
    .addEdge('finalize', END);

  return graph.compile();
}

export const testerGraph = createTesterGraph();

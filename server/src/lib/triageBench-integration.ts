/**
 * TriageBench Analysis Platform Integration
 *
 * Integrates the TriageBench analysis scripts with the Preclinical platform.
 * Provides database schema extensions, analysis functions, and API endpoints.
 *
 * Based on: TriageBench V4 paper methodology
 */

import { sql } from './db.js';
import { log } from './logger.js';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface TriageBenchMetrics {
  final_recommendation: string | null;
  response_turns: number;
  question_count: number;
  word_count: number;
  readability_score: number;
  patient_turns: number;
  conversation_length: number;
  avg_response_length: number;
  question_density: number;
  critical_questions: number;
}

interface TriageClassification {
  classified_level: 'Emergency care' | 'Clinician evaluation' | 'Home care';
  confidence_score: number;
  evidence: string;
  reasoning: string;
}

export interface TriageBenchAnalysis {
  scenario_run_id: string;
  case_id?: number;

  // Conversation metrics
  conversation_metrics: TriageBenchMetrics;

  // Classification results
  classification: TriageClassification;

  // Accuracy analysis (when gold standard available)
  gold_standard?: string;
  is_correct?: boolean;
  is_under_triage?: boolean;
  is_over_triage?: boolean;

  // Timing
  analyzed_at: string;
}

export interface TranscriptEntry {
  turn: number;
  role: string;
  content: string;
  timestamp: string;
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

/**
 * Store TriageBench analysis results in the database
 */
export async function storeTriageBenchAnalysis(analysis: TriageBenchAnalysis): Promise<void> {
  try {
    await sql`
      INSERT INTO triageBench_analyses (
        scenario_run_id,
        case_id,
        conversation_metrics,
        classification,
        gold_standard,
        is_correct,
        is_under_triage,
        is_over_triage,
        analyzed_at
      ) VALUES (
        ${analysis.scenario_run_id},
        ${analysis.case_id || null},
        ${sql.json(analysis.conversation_metrics as any)},
        ${sql.json(analysis.classification as any)},
        ${analysis.gold_standard || null},
        ${analysis.is_correct || null},
        ${analysis.is_under_triage || null},
        ${analysis.is_over_triage || null},
        ${analysis.analyzed_at}
      )
      ON CONFLICT (scenario_run_id)
      DO UPDATE SET
        conversation_metrics = EXCLUDED.conversation_metrics,
        classification = EXCLUDED.classification,
        gold_standard = EXCLUDED.gold_standard,
        is_correct = EXCLUDED.is_correct,
        is_under_triage = EXCLUDED.is_under_triage,
        is_over_triage = EXCLUDED.is_over_triage,
        analyzed_at = EXCLUDED.analyzed_at
    `;

    log.child({ component: 'triageBench' }).info('Stored analysis results', {
      scenarioRunId: analysis.scenario_run_id,
      classification: analysis.classification.classified_level,
      confidence: analysis.classification.confidence_score
    });

  } catch (error) {
    log.child({ component: 'triageBench' }).error('Failed to store analysis', {
      scenarioRunId: analysis.scenario_run_id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Retrieve TriageBench analysis for a scenario run
 */
export async function getTriageBenchAnalysis(scenarioRunId: string): Promise<TriageBenchAnalysis | null> {
  try {
    const [result] = await sql`
      SELECT * FROM triageBench_analyses WHERE scenario_run_id = ${scenarioRunId}
    `;

    if (!result) return null;

    return {
      scenario_run_id: result.scenario_run_id as string,
      case_id: result.case_id as number | undefined,
      conversation_metrics: result.conversation_metrics as TriageBenchMetrics,
      classification: result.classification as TriageClassification,
      gold_standard: result.gold_standard as string | undefined,
      is_correct: result.is_correct as boolean | undefined,
      is_under_triage: result.is_under_triage as boolean | undefined,
      is_over_triage: result.is_over_triage as boolean | undefined,
      analyzed_at: result.analyzed_at as string,
    };

  } catch (error) {
    log.child({ component: 'triageBench' }).error('Failed to retrieve analysis', {
      scenarioRunId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Get TriageBench analysis results for multiple scenario runs
 */
export async function getTriageBenchAnalysesByTestRun(testRunId: string): Promise<TriageBenchAnalysis[]> {
  try {
    const results = await sql`
      SELECT tb.*
      FROM triageBench_analyses tb
      JOIN scenario_runs sr ON tb.scenario_run_id = sr.id
      WHERE sr.test_run_id = ${testRunId}
      ORDER BY sr.created_at ASC
    `;

    return results.map(result => ({
      scenario_run_id: result.scenario_run_id as string,
      case_id: result.case_id as number | undefined,
      conversation_metrics: result.conversation_metrics as TriageBenchMetrics,
      classification: result.classification as TriageClassification,
      gold_standard: result.gold_standard as string | undefined,
      is_correct: result.is_correct as boolean | undefined,
      is_under_triage: result.is_under_triage as boolean | undefined,
      is_over_triage: result.is_over_triage as boolean | undefined,
      analyzed_at: result.analyzed_at as string,
    }));

  } catch (error) {
    log.child({ component: 'triageBench' }).error('Failed to retrieve analyses by test run', {
      testRunId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Generate cohort performance metrics for a test run
 */
export async function generateCohortMetrics(testRunId: string, cohortName: string = 'Platform') {
  try {
    const analyses = await getTriageBenchAnalysesByTestRun(testRunId);

    if (analyses.length === 0) {
      throw new Error(`No TriageBench analyses found for test run ${testRunId}`);
    }

    const totalCases = analyses.length;
    const correctCases = analyses.filter(a => a.is_correct === true).length;
    const underTriageCases = analyses.filter(a => a.is_under_triage === true).length;
    const overTriageCases = analyses.filter(a => a.is_over_triage === true).length;

    const overallAccuracy = (correctCases / totalCases) * 100;
    const underTriageRate = (underTriageCases / totalCases) * 100;
    const overTriageRate = (overTriageCases / totalCases) * 100;

    const avgResponseTurns = analyses.reduce((sum, a) => sum + a.conversation_metrics.response_turns, 0) / totalCases;
    const avgQuestions = analyses.reduce((sum, a) => sum + a.conversation_metrics.question_count, 0) / totalCases;
    const avgWordCount = analyses.reduce((sum, a) => sum + a.conversation_metrics.word_count, 0) / totalCases;
    const avgReadability = analyses.reduce((sum, a) => sum + a.conversation_metrics.readability_score, 0) / totalCases;
    const avgCriticalQuestions = analyses.reduce((sum, a) => sum + a.conversation_metrics.critical_questions, 0) / totalCases;

    // Calculate accuracy by category
    const emergencyAnalyses = analyses.filter(a => a.gold_standard === '911' || a.gold_standard === 'Emergency');
    const clinicianAnalyses = analyses.filter(a => a.gold_standard === 'Clinician');
    const homeCareAnalyses = analyses.filter(a => a.gold_standard === 'Home care');

    const emergencyAccuracy = emergencyAnalyses.length > 0
      ? (emergencyAnalyses.filter(a => a.is_correct === true).length / emergencyAnalyses.length) * 100
      : 0;
    const clinicianAccuracy = clinicianAnalyses.length > 0
      ? (clinicianAnalyses.filter(a => a.is_correct === true).length / clinicianAnalyses.length) * 100
      : 0;
    const homeCareAccuracy = homeCareAnalyses.length > 0
      ? (homeCareAnalyses.filter(a => a.is_correct === true).length / homeCareAnalyses.length) * 100
      : 0;

    return {
      cohort_name: cohortName,
      test_run_id: testRunId,
      total_cases: totalCases,
      overall_accuracy: Math.round(overallAccuracy * 10) / 10,
      under_triage_rate: Math.round(underTriageRate * 10) / 10,
      over_triage_rate: Math.round(overTriageRate * 10) / 10,
      avg_response_turns: Math.round(avgResponseTurns * 10) / 10,
      avg_questions: Math.round(avgQuestions * 10) / 10,
      avg_word_count: Math.round(avgWordCount),
      avg_readability: Math.round(avgReadability * 10) / 10,
      avg_critical_questions: Math.round(avgCriticalQuestions * 10) / 10,
      emergency_accuracy: Math.round(emergencyAccuracy * 10) / 10,
      clinician_accuracy: Math.round(clinicianAccuracy * 10) / 10,
      home_care_accuracy: Math.round(homeCareAccuracy * 10) / 10,
      emergency_cases: emergencyAnalyses.length,
      clinician_cases: clinicianAnalyses.length,
      home_care_cases: homeCareAnalyses.length,
      generated_at: new Date().toISOString(),
    };

  } catch (error) {
    log.child({ component: 'triageBench' }).error('Failed to generate cohort metrics', {
      testRunId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// ============================================================================
// ANALYSIS WORKFLOW INTEGRATION
// ============================================================================

/**
 * Run TriageBench analysis on a completed scenario run.
 * This should be called after the grader has completed.
 */
export async function analyzeScenarioRun(
  scenarioRunId: string,
  transcript: TranscriptEntry[],
  goldStandard?: string,
  caseId?: number
): Promise<TriageBenchAnalysis> {

  const analysisLog = log.child({
    component: 'triageBench',
    scenarioRunId,
    caseId
  });

  analysisLog.info('Starting TriageBench analysis');

  try {
    // Import analysis modules dynamically to avoid startup dependencies
    // Note: In a real implementation, we'd need to ensure these Python scripts
    // are available and callable from Node.js, perhaps via child_process or a Python bridge

    // For now, we'll simulate the analysis with placeholder logic
    // In actual implementation, this would call the Python analysis scripts

    const conversationMetrics = await analyzeTranscriptMetrics(transcript);
    const classification = await classifyRecommendation(conversationMetrics.final_recommendation);

    let isCorrect, isUnderTriage, isOverTriage;

    if (goldStandard && classification.classified_level) {
      const accuracyResults = validateTriageDecision(
        classification.classified_level,
        goldStandard
      );
      isCorrect = accuracyResults.is_correct;
      isUnderTriage = accuracyResults.is_under_triage;
      isOverTriage = accuracyResults.is_over_triage;
    }

    const analysis: TriageBenchAnalysis = {
      scenario_run_id: scenarioRunId,
      case_id: caseId,
      conversation_metrics: conversationMetrics,
      classification,
      gold_standard: goldStandard,
      is_correct: isCorrect,
      is_under_triage: isUnderTriage,
      is_over_triage: isOverTriage,
      analyzed_at: new Date().toISOString(),
    };

    await storeTriageBenchAnalysis(analysis);

    analysisLog.info('TriageBench analysis completed', {
      classification: classification.classified_level,
      confidence: classification.confidence_score,
      isCorrect,
      responseTurns: conversationMetrics.response_turns
    });

    return analysis;

  } catch (error) {
    analysisLog.error('TriageBench analysis failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// ============================================================================
// PLACEHOLDER ANALYSIS FUNCTIONS
// ============================================================================
// NOTE: These are simplified implementations for demonstration.
// In production, these would call the actual Python analysis scripts.

async function analyzeTranscriptMetrics(transcript: TranscriptEntry[]): Promise<TriageBenchMetrics> {
  const agentMessages = transcript.filter(entry => entry.role === 'assistant');
  const patientMessages = transcript.filter(entry => entry.role === 'user');

  const responseTurns = agentMessages.length;
  const patientTurns = patientMessages.length;
  const conversationLength = transcript.length;

  const agentText = agentMessages.map(msg => msg.content).join(' ');
  const wordCount = agentText.split(/\s+/).filter(word => word.length > 0).length;

  // Simple question counting (would use more sophisticated patterns in real implementation)
  const questionCount = (agentText.match(/\?/g) || []).length;
  const criticalQuestions = (agentText.match(/\b(chest pain|difficulty breathing|severe|emergency|fever|bleeding)\b/gi) || []).length;

  const avgResponseLength = wordCount / Math.max(responseTurns, 1);
  const questionDensity = questionCount / Math.max(responseTurns, 1);

  // Simplified readability (would use textstat in real implementation)
  const readabilityScore = 8.0; // Placeholder

  // Extract final recommendation from last agent message
  const finalRecommendation = extractFinalRecommendation(agentMessages);

  return {
    final_recommendation: finalRecommendation,
    response_turns: responseTurns,
    question_count: questionCount,
    word_count: wordCount,
    readability_score: readabilityScore,
    patient_turns: patientTurns,
    conversation_length: conversationLength,
    avg_response_length: Math.round(avgResponseLength * 10) / 10,
    question_density: Math.round(questionDensity * 10) / 10,
    critical_questions: criticalQuestions,
  };
}

function extractFinalRecommendation(agentMessages: TranscriptEntry[]): string | null {
  if (agentMessages.length === 0) return null;

  // Look for recommendations in the last few agent messages
  const lastMessages = agentMessages.slice(-3);

  for (const message of lastMessages.reverse()) {
    const content = message.content.toLowerCase();

    if (content.includes('911') || content.includes('emergency')) {
      return 'Emergency';
    } else if (content.includes('doctor') || content.includes('clinic') || content.includes('medical')) {
      return 'Clinician';
    } else if (content.includes('home') || content.includes('rest') || content.includes('monitor')) {
      return 'Home care';
    }
  }

  return null;
}

async function classifyRecommendation(recommendation: string | null): Promise<TriageClassification> {
  if (!recommendation) {
    return {
      classified_level: 'Clinician evaluation', // Safe default
      confidence_score: 0.1,
      evidence: '',
      reasoning: 'No recommendation found - default classification'
    };
  }

  // Simplified classification logic (would use the full classifier in real implementation)
  const rec = recommendation.toLowerCase();

  if (rec.includes('emergency') || rec.includes('911')) {
    return {
      classified_level: 'Emergency care',
      confidence_score: 0.9,
      evidence: 'emergency keywords',
      reasoning: 'High confidence emergency classification'
    };
  } else if (rec.includes('doctor') || rec.includes('clinic')) {
    return {
      classified_level: 'Clinician evaluation',
      confidence_score: 0.8,
      evidence: 'medical professional keywords',
      reasoning: 'Medical evaluation recommended'
    };
  } else {
    return {
      classified_level: 'Home care',
      confidence_score: 0.7,
      evidence: 'self-care keywords',
      reasoning: 'Self-care appropriate'
    };
  }
}

function validateTriageDecision(predicted: string, goldStandard: string): {
  is_correct: boolean;
  is_under_triage: boolean;
  is_over_triage: boolean;
} {
  // Normalize gold standard
  let normalizedGold: string;
  if (goldStandard === '911') {
    normalizedGold = 'Emergency care';
  } else if (goldStandard === 'Clinician') {
    normalizedGold = 'Clinician evaluation';
  } else if (goldStandard === 'Home care') {
    normalizedGold = 'Home care';
  } else {
    normalizedGold = goldStandard;
  }

  const isCorrect = predicted === normalizedGold;

  const isUnderTriage = (normalizedGold === 'Emergency care' &&
    (predicted === 'Clinician evaluation' || predicted === 'Home care'));

  const isOverTriage = (predicted === 'Emergency care' &&
    (normalizedGold === 'Clinician evaluation' || normalizedGold === 'Home care'));

  return { is_correct: isCorrect, is_under_triage: isUnderTriage, is_over_triage: isOverTriage };
}

// ============================================================================
// DATABASE SCHEMA CREATION
// ============================================================================

/**
 * Create the TriageBench analysis table if it doesn't exist.
 * This should be called during application startup or migration.
 */
export async function createTriageBenchSchema(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS triageBench_analyses (
        id SERIAL PRIMARY KEY,
        scenario_run_id VARCHAR UNIQUE REFERENCES scenario_runs(id) ON DELETE CASCADE,
        case_id INTEGER,
        conversation_metrics JSONB NOT NULL,
        classification JSONB NOT NULL,
        gold_standard VARCHAR,
        is_correct BOOLEAN,
        is_under_triage BOOLEAN,
        is_over_triage BOOLEAN,
        analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_triageBench_scenario_run_id
      ON triageBench_analyses(scenario_run_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_triageBench_gold_standard
      ON triageBench_analyses(gold_standard)
    `;

    log.child({ component: 'triageBench' }).info('TriageBench schema created successfully');

  } catch (error) {
    log.child({ component: 'triageBench' }).error('Failed to create TriageBench schema', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

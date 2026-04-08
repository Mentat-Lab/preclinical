/**
 * TriageBench Integration Patch for Scenario Runner
 *
 * This shows the integration points needed in scenario-runner.ts to automatically
 * trigger TriageBench analysis when scenarios complete.
 *
 * Integration points:
 * 1. Import TriageBench analysis functions
 * 2. Trigger analysis after grading completes
 * 3. Handle analysis errors gracefully (don't fail scenarios)
 */

/*
INTEGRATION PATCH FOR server/src/workers/scenario-runner.ts

Add this import at the top:
*/
import { analyzeScenarioRun } from '../lib/triageBench-integration.js';

/*
Add this code after the grading completes and before finalizing the scenario
(around line 280, after graderResult processing but before updateScenarioRun):
*/

// =====================================================================
// TRIAGBENCH ANALYSIS — automatic analysis after grading
// =====================================================================

// Extract case ID from scenario if available (for TriageBench test cases)
const caseId = (() => {
  try {
    const scenarioContent = scenario.content as Record<string, unknown>;
    return scenarioContent?.case_id as number | undefined;
  } catch {
    return undefined;
  }
})();

// Run TriageBench analysis (non-blocking - don't fail scenario if analysis fails)
try {
  jobLog.info('Running TriageBench analysis');

  await analyzeScenarioRun(
    scenario_run_id,
    testerResult.transcript,
    goldStandard,
    caseId
  );

  jobLog.info('TriageBench analysis completed');

} catch (analysisError) {
  // Log analysis errors but don't fail the scenario run
  jobLog.warn('TriageBench analysis failed - continuing with scenario completion', {
    error: analysisError instanceof Error ? analysisError.message : String(analysisError),
    scenarioRunId: scenario_run_id
  });

  // Optionally emit an event for analysis failure monitoring
  try {
    await emitEvent(test_run_id, 'triageBench_analysis_failed', {
      scenario_run_id,
      scenario_id,
      error: analysisError instanceof Error ? analysisError.message : String(analysisError)
    });
  } catch { /* ignore event emission errors */ }
}

/*
This integration ensures that:

1. TriageBench analysis runs automatically after every scenario completes
2. Analysis failures don't affect the main scenario execution
3. Analysis results are stored in the database for later retrieval
4. Case IDs are automatically extracted from scenario content if available
5. Analysis failures are logged and optionally reported as events

The analysis will be available via the API endpoints:
- GET /api/v1/triageBench/scenario-runs/{scenario_run_id}
- GET /api/v1/triageBench/test-runs/{test_run_id}/analyses
- GET /api/v1/triageBench/test-runs/{test_run_id}/metrics
*/

export const SCENARIO_RUNNER_INTEGRATION_COMPLETE = true;

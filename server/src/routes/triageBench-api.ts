/**
 * TriageBench Analysis API Endpoints
 *
 * Provides REST API endpoints for TriageBench analysis functionality:
 * - Retrieve analysis results for individual scenario runs
 * - Generate cohort performance reports
 * - Trigger analysis on completed runs
 * - Export analysis data for external tools
 *
 * Based on: TriageBench V4 paper methodology
 */

import { Hono } from 'hono';
import { log } from '../lib/logger.js';
import {
  getTriageBenchAnalysis,
  getTriageBenchAnalysesByTestRun,
  generateCohortMetrics,
  analyzeScenarioRun,
  createTriageBenchSchema,
  type TriageBenchAnalysis,
  type TranscriptEntry,
} from '../lib/triageBench-integration.js';
import { sql } from '../lib/db.js';

const app = new Hono();

// ============================================================================
// ANALYSIS RESULTS ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/triageBench/scenario-runs/:id
 * Get TriageBench analysis results for a specific scenario run
 */
app.get('/scenario-runs/:id', async (c) => {
  try {
    const scenarioRunId = c.req.param('id');

    const analysis = await getTriageBenchAnalysis(scenarioRunId);

    if (!analysis) {
      return c.json({ error: 'TriageBench analysis not found for this scenario run' }, 404);
    }

    return c.json(analysis);

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to get scenario run analysis', {
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Failed to retrieve analysis' }, 500);
  }
});

/**
 * GET /api/v1/triageBench/test-runs/:testRunId/analyses
 * Get all TriageBench analyses for a test run
 */
app.get('/test-runs/:testRunId/analyses', async (c) => {
  try {
    const testRunId = c.req.param('testRunId');

    const analyses = await getTriageBenchAnalysesByTestRun(testRunId);

    return c.json({
      test_run_id: testRunId,
      total_analyses: analyses.length,
      analyses
    });

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to get test run analyses', {
      testRunId: c.req.param('testRunId'),
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Failed to retrieve analyses' }, 500);
  }
});

/**
 * GET /api/v1/triageBench/test-runs/:testRunId/metrics
 * Generate cohort performance metrics for a test run
 */
app.get('/test-runs/:testRunId/metrics', async (c) => {
  try {
    const testRunId = c.req.param('testRunId');
    const cohortName = c.req.query('cohort_name') || 'Platform';

    const metrics = await generateCohortMetrics(testRunId, cohortName);

    return c.json(metrics);

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to generate cohort metrics', {
      testRunId: c.req.param('testRunId'),
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Failed to generate metrics' }, 500);
  }
});

/**
 * GET /api/v1/triageBench/test-runs/:testRunId/report
 * Generate a formatted performance report for a test run
 */
app.get('/test-runs/:testRunId/report', async (c) => {
  try {
    const testRunId = c.req.param('testRunId');
    const cohortName = c.req.query('cohort_name') || 'Platform';
    const format = c.req.query('format') || 'json';

    const metrics = await generateCohortMetrics(testRunId, cohortName);
    const analyses = await getTriageBenchAnalysesByTestRun(testRunId);

    if (format === 'markdown') {
      const report = generateMarkdownReport(metrics, analyses);
      return c.text(report, 200, {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="triageBench-report-${testRunId}.md"`
      });
    }

    return c.json({
      test_run_id: testRunId,
      cohort_metrics: metrics,
      individual_analyses: analyses,
      summary: {
        total_cases: analyses.length,
        accuracy: metrics.overall_accuracy,
        safety: {
          under_triage_rate: metrics.under_triage_rate,
          over_triage_rate: metrics.over_triage_rate
        },
        efficiency: {
          avg_questions: metrics.avg_questions,
          avg_response_turns: metrics.avg_response_turns,
          avg_readability: metrics.avg_readability
        }
      }
    });

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to generate report', {
      testRunId: c.req.param('testRunId'),
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Failed to generate report' }, 500);
  }
});

// ============================================================================
// ANALYSIS TRIGGER ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/triageBench/scenario-runs/:id/analyze
 * Manually trigger TriageBench analysis for a completed scenario run
 */
app.post('/scenario-runs/:id/analyze', async (c) => {
  try {
    const scenarioRunId = c.req.param('id');

    // Get scenario run data
    const [scenarioRun] = await sql`
      SELECT sr.*, s.content->>'gold_standard' as gold_standard
      FROM scenario_runs sr
      LEFT JOIN scenarios s ON sr.scenario_id = s.scenario_id
      WHERE sr.id = ${scenarioRunId}
    `;

    if (!scenarioRun) {
      return c.json({ error: 'Scenario run not found' }, 404);
    }

    // Check if scenario run is completed
    if (!['passed', 'failed'].includes(scenarioRun.status)) {
      return c.json({ error: 'Scenario run must be completed before analysis' }, 400);
    }

    // Get transcript from scenario run
    const transcript = scenarioRun.transcript as TranscriptEntry[] || [];

    if (transcript.length === 0) {
      return c.json({ error: 'No transcript data found for scenario run' }, 400);
    }

    // Extract case ID if available
    const body = await c.req.json().catch(() => ({}));
    const caseId = body.case_id || null;

    // Run analysis
    const analysis = await analyzeScenarioRun(
      scenarioRunId,
      transcript,
      scenarioRun.gold_standard,
      caseId
    );

    return c.json({
      message: 'Analysis completed successfully',
      analysis
    }, 200);

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to analyze scenario run', {
      scenarioRunId: c.req.param('id'),
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Analysis failed' }, 500);
  }
});

/**
 * POST /api/v1/triageBench/test-runs/:testRunId/analyze-batch
 * Trigger TriageBench analysis for all completed scenario runs in a test run
 */
app.post('/test-runs/:testRunId/analyze-batch', async (c) => {
  try {
    const testRunId = c.req.param('testRunId');

    // Get all completed scenario runs for this test
    const scenarioRuns = await sql`
      SELECT sr.id, sr.transcript, s.content->>'gold_standard' as gold_standard
      FROM scenario_runs sr
      LEFT JOIN scenarios s ON sr.scenario_id = s.scenario_id
      WHERE sr.test_run_id = ${testRunId}
        AND sr.status IN ('passed', 'failed')
        AND sr.transcript IS NOT NULL
    `;

    if (scenarioRuns.length === 0) {
      return c.json({ error: 'No completed scenario runs found with transcript data' }, 404);
    }

    const results = {
      test_run_id: testRunId,
      total_runs: scenarioRuns.length,
      successful_analyses: 0,
      failed_analyses: 0,
      errors: [] as string[]
    };

    // Process each scenario run
    for (const run of scenarioRuns) {
      try {
        const transcript = run.transcript as TranscriptEntry[] || [];

        if (transcript.length > 0) {
          await analyzeScenarioRun(run.id, transcript, run.gold_standard);
          results.successful_analyses++;
        } else {
          results.failed_analyses++;
          results.errors.push(`No transcript data for run ${run.id}`);
        }

      } catch (error) {
        results.failed_analyses++;
        results.errors.push(`Run ${run.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return c.json(results, results.failed_analyses > 0 ? 207 : 200);

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to analyze test run batch', {
      testRunId: c.req.param('testRunId'),
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Batch analysis failed' }, 500);
  }
});

// ============================================================================
// SYSTEM ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/triageBench/schema/create
 * Create the TriageBench database schema (admin endpoint)
 */
app.post('/schema/create', async (c) => {
  try {
    await createTriageBenchSchema();

    return c.json({ message: 'TriageBench schema created successfully' }, 200);

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to create schema', {
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Schema creation failed' }, 500);
  }
});

/**
 * GET /api/v1/triageBench/status
 * Get system status and statistics
 */
app.get('/status', async (c) => {
  try {
    const [stats] = await sql`
      SELECT
        COUNT(*) as total_analyses,
        COUNT(CASE WHEN is_correct = true THEN 1 END) as correct_analyses,
        COUNT(CASE WHEN is_under_triage = true THEN 1 END) as under_triage_count,
        COUNT(CASE WHEN is_over_triage = true THEN 1 END) as over_triage_count,
        AVG(CAST(conversation_metrics->>'response_turns' AS float)) as avg_response_turns
      FROM triageBench_analyses
    `;

    return c.json({
      system: 'TriageBench Analysis System',
      version: '1.0.0',
      statistics: {
        total_analyses: parseInt(stats?.total_analyses || '0'),
        overall_accuracy: stats?.total_analyses > 0
          ? Math.round((parseInt(stats.correct_analyses || '0') / parseInt(stats.total_analyses)) * 1000) / 10
          : 0,
        under_triage_count: parseInt(stats?.under_triage_count || '0'),
        over_triage_count: parseInt(stats?.over_triage_count || '0'),
        avg_response_turns: parseFloat(stats?.avg_response_turns || '0'),
      }
    });

  } catch (error) {
    log.child({ component: 'triageBench-api' }).error('Failed to get status', {
      error: error instanceof Error ? error.message : String(error)
    });
    return c.json({ error: 'Failed to get system status' }, 500);
  }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateMarkdownReport(metrics: any, analyses: TriageBenchAnalysis[]): string {
  const lines = [];

  lines.push('# TriageBench Analysis Report');
  lines.push('');
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push(`**Test Run ID**: ${metrics.test_run_id}`);
  lines.push(`**Cohort**: ${metrics.cohort_name}`);
  lines.push('');

  lines.push('## Performance Summary');
  lines.push('');
  lines.push(`- **Total Cases**: ${metrics.total_cases}`);
  lines.push(`- **Overall Accuracy**: ${metrics.overall_accuracy}%`);
  lines.push(`- **Under-triage Rate**: ${metrics.under_triage_rate}% (Emergency → Lower Acuity)`);
  lines.push(`- **Over-triage Rate**: ${metrics.over_triage_rate}% (Non-Emergency → Emergency)`);
  lines.push('');

  lines.push('## Information Gathering Metrics');
  lines.push('');
  lines.push(`- **Average Response Turns**: ${metrics.avg_response_turns}`);
  lines.push(`- **Average Questions**: ${metrics.avg_questions}`);
  lines.push(`- **Average Word Count**: ${metrics.avg_word_count}`);
  lines.push(`- **Average Reading Grade**: ${metrics.avg_readability}`);
  lines.push(`- **Average Critical Questions**: ${metrics.avg_critical_questions}`);
  lines.push('');

  lines.push('## Accuracy by Case Type');
  lines.push('');
  lines.push(`- **Emergency Cases**: ${metrics.emergency_accuracy}% (${metrics.emergency_cases} cases)`);
  lines.push(`- **Clinician Evaluation Cases**: ${metrics.clinician_accuracy}% (${metrics.clinician_cases} cases)`);
  lines.push(`- **Home Care Cases**: ${metrics.home_care_accuracy}% (${metrics.home_care_cases} cases)`);
  lines.push('');

  lines.push('## Safety Analysis');
  lines.push('');
  const underTriageCount = analyses.filter(a => a.is_under_triage).length;
  const overTriageCount = analyses.filter(a => a.is_over_triage).length;

  if (underTriageCount > 0) {
    lines.push(`⚠️  **${underTriageCount} Under-triage Cases Detected** - These represent safety risks where emergency cases were classified as lower acuity.`);
    lines.push('');
  }

  if (overTriageCount > 0) {
    lines.push(`⚡ **${overTriageCount} Over-triage Cases** - These represent resource inefficiency but are safer than under-triage.`);
    lines.push('');
  }

  lines.push('## Recommendations');
  lines.push('');
  lines.push('- Platforms with under-triage rates >5% should review emergency detection protocols');
  lines.push('- Average question counts >10 may indicate inefficient information gathering');
  lines.push('- Reading grade levels >12 may be too complex for patient comprehension');
  lines.push('');

  lines.push('---');
  lines.push('*Report generated by TriageBench Analysis System*');

  return lines.join('\n');
}

export default app;

/**
 * TriageBench Routes Integration
 *
 * Integration patch for adding TriageBench API routes to the main server.
 * This file shows how to integrate the TriageBench API into index.ts
 */

/*
To integrate TriageBench API routes into the main server, add the following to server/src/index.ts:

1. Import the TriageBench API:
```typescript
import triageBenchApi from './routes/triageBench-api.js';
```

2. Mount the API routes (after other routes):
```typescript
app.route('/api/v1/triageBench', triageBenchApi);
```

3. Initialize the database schema during startup (in the main() function):
```typescript
import { createTriageBenchSchema } from './lib/triageBench-integration.js';

async function main() {
  // ... existing startup code ...

  // Initialize TriageBench schema
  try {
    await createTriageBenchSchema();
    log.info('TriageBench schema initialized');
  } catch (error) {
    log.error('Failed to initialize TriageBench schema', error);
  }

  // ... rest of startup code ...
}
```

4. The complete routes will be:
- GET /api/v1/triageBench/scenario-runs/:id - Get analysis for specific scenario run
- GET /api/v1/triageBench/test-runs/:testRunId/analyses - Get all analyses for test run
- GET /api/v1/triageBench/test-runs/:testRunId/metrics - Generate cohort metrics
- GET /api/v1/triageBench/test-runs/:testRunId/report - Generate performance report
- POST /api/v1/triageBench/scenario-runs/:id/analyze - Manually trigger analysis
- POST /api/v1/triageBench/test-runs/:testRunId/analyze-batch - Batch analyze test run
- POST /api/v1/triageBench/schema/create - Create database schema (admin)
- GET /api/v1/triageBench/status - System status
*/

export const TRIAGBENCH_INTEGRATION_INSTRUCTIONS = `
Complete integration steps:

1. Add import to server/src/index.ts:
   import triageBenchApi from './routes/triageBench-api.js';

2. Mount routes in server/src/index.ts:
   app.route('/api/v1/triageBench', triageBenchApi);

3. Initialize schema in main() function of server/src/index.ts:
   import { createTriageBenchSchema } from './lib/triageBench-integration.js';

   // In main() function:
   try {
     await createTriageBenchSchema();
     log.info('TriageBench schema initialized');
   } catch (error) {
     log.error('Failed to initialize TriageBench schema', error);
   }

4. Optional: Integrate automatic analysis into scenario runner by adding to
   server/src/workers/scenario-runner.ts after grading completes:

   import { analyzeScenarioRun } from '../lib/triageBench-integration.js';

   // After grading is complete and before finalizing:
   try {
     await analyzeScenarioRun(
       scenario_run_id,
       testerResult.transcript,
       goldStandard,
       caseId // if available
     );
   } catch (error) {
     // Log but don't fail the scenario run
     jobLog.warn('TriageBench analysis failed', { error });
   }
`;

// Export for documentation
export default TRIAGBENCH_INTEGRATION_INSTRUCTIONS;

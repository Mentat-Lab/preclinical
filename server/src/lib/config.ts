export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:preclinical@localhost:5432/preclinical',

  // LLM
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  testerModel: process.env.TESTER_MODEL || 'gpt-4o-mini',
  testerTemperature: parseFloat(process.env.TESTER_TEMPERATURE || '0.2'),
  graderModel: process.env.GRADER_MODEL || 'gpt-4o-mini',
  graderTemperature: parseFloat(process.env.GRADER_TEMPERATURE || '0.1'),

  // Worker
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),

  // Browser provider
  browserUseApiKey: process.env.BROWSER_USE_API_KEY || '',

  // Turn limits (last turn is always the fixed triage question)
  defaultMaxTurns: parseInt(process.env.DEFAULT_MAX_TURNS || '11', 10),
  minMaxTurns: parseInt(process.env.MIN_MAX_TURNS || '5', 10),
  maxMaxTurns: parseInt(process.env.MAX_MAX_TURNS || '15', 10),

  // Graph timeouts (ms)
  planningTimeoutMs: parseInt(process.env.PLANNING_TIMEOUT_MS || '60000', 10),
  turnTimeoutMs: parseInt(process.env.TURN_TIMEOUT_MS || '30000', 10),
  coverageTimeoutMs: parseInt(process.env.COVERAGE_TIMEOUT_MS || '60000', 10),
  gradingTimeoutMs: parseInt(process.env.GRADING_TIMEOUT_MS || '120000', 10),

  // Per-turn intent analysis (benchmark mode)
  enableTurnIntents: process.env.ENABLE_TURN_INTENTS !== 'false',
  turnIntentModel: process.env.TURN_INTENT_MODEL || 'gpt-4o-mini',

  // Response validation (detect error pages vs genuine responses)
  enableResponseValidation: process.env.ENABLE_RESPONSE_VALIDATION !== 'false',
  responseValidationModel: process.env.RESPONSE_VALIDATION_MODEL || 'gpt-4.1-mini',
  responseValidationRetries: parseInt(process.env.RESPONSE_VALIDATION_RETRIES || '2', 10),
} as const;

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:preclinical@localhost:5432/preclinical',

  // LLM
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  testerModel: process.env.TESTER_MODEL || 'gpt-4o-mini',
  testerTemperature: parseFloat(process.env.TESTER_TEMPERATURE || '0.2'),
  graderModel: process.env.GRADER_MODEL || 'gpt-4o-mini',
  graderTemperature: parseFloat(process.env.GRADER_TEMPERATURE || '0.1'),

  // Worker
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),

  // Browser provider
  browserUseApiKey: process.env.BROWSER_USE_API_KEY || '',
  agentMailApiKey: process.env.AGENTMAIL_API_KEY || '',

  // Turn limits
  defaultMaxTurns: parseInt(process.env.DEFAULT_MAX_TURNS || '6', 10),
  minMaxTurns: parseInt(process.env.MIN_MAX_TURNS || '5', 10),
  maxMaxTurns: parseInt(process.env.MAX_MAX_TURNS || '7', 10),

  // Graph timeouts (ms)
  planningTimeoutMs: parseInt(process.env.PLANNING_TIMEOUT_MS || '60000', 10),
  turnTimeoutMs: parseInt(process.env.TURN_TIMEOUT_MS || '30000', 10),
  coverageTimeoutMs: parseInt(process.env.COVERAGE_TIMEOUT_MS || '60000', 10),
} as const;

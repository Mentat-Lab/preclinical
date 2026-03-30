import { Hono } from 'hono';
import { sql } from '../lib/db.js';
import { config } from '../lib/config.js';
import { isAnthropicModel, isOllamaModel } from '../shared/llm-utils.js';

const app = new Hono();

type CheckStatus = 'ok' | 'warning' | 'error';

function buildModelCheck(model: string, label: string): { status: CheckStatus; detail: string } {
  if (isAnthropicModel(model)) {
    return config.anthropicApiKey
      ? { status: 'ok', detail: `${label} is configured for Anthropic (${model}).` }
      : { status: 'error', detail: `${label} uses ${model} but ANTHROPIC_API_KEY is missing.` };
  }

  if (isOllamaModel(model)) {
    return {
      status: 'warning',
      detail: `${label} uses Ollama (${model}) at ${config.ollamaBaseUrl}. Ensure the model is available there.`,
    };
  }

  return config.openaiApiKey
    ? { status: 'ok', detail: `${label} is configured for OpenAI-compatible access (${model}).` }
    : { status: 'error', detail: `${label} uses ${model} but OPENAI_API_KEY is missing.` };
}

app.get('/health', async (c) => {
  const testerModelCheck = buildModelCheck(config.testerModel, 'Tester model');
  const graderModelCheck = buildModelCheck(config.graderModel, 'Grader model');
  const browserCheck = config.browserUseApiKey
    ? { status: 'ok' as const, detail: 'Browser provider dependency is configured.' }
    : { status: 'warning' as const, detail: 'BROWSER_USE_API_KEY is missing, so browser-based agents cannot run yet.' };

  try {
    await sql`SELECT 1`;

    const checks = {
      database: {
        status: 'ok' as const,
        detail: 'Database connection succeeded.',
      },
      tester_model: testerModelCheck,
      grader_model: graderModelCheck,
      browser_provider: browserCheck,
    };

    const statuses = Object.values(checks).map((check) => check.status);
    const overallStatus: 'ok' | 'error' = statuses.includes('error') ? 'error' : 'ok';

    return c.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      setup: {
        tester_model: config.testerModel,
        grader_model: config.graderModel,
        worker_concurrency: config.workerConcurrency,
      },
    }, overallStatus === 'error' ? 503 : 200);
  } catch (err) {
    return c.json({
      status: 'error',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: 'error',
          detail: 'Database connection failed.',
        },
        tester_model: testerModelCheck,
        grader_model: graderModelCheck,
        browser_provider: browserCheck,
      },
      setup: {
        tester_model: config.testerModel,
        grader_model: config.graderModel,
        worker_concurrency: config.workerConcurrency,
      },
    }, 503);
  }
});

export default app;

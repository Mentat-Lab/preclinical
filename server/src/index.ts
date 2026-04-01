import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './lib/config.js';
import { getQueue } from './lib/queue.js';
import { startListening } from './lib/realtime.js';
import { log } from './lib/logger.js';
import fs from 'fs';

// Routes
import health from './routes/health.js';
import events from './routes/events.js';
import startRun from './routes/start-run.js';
import cancelRun from './routes/cancel-run.js';
import publicApi from './routes/public-api.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Mount API routes
app.route('/', health);
app.route('/', events);
app.route('/', startRun);
app.route('/', cancelRun);
app.route('/', publicApi);

// Serve frontend static files (built Vite app)
const STATIC_ROOT = './public';
if (fs.existsSync(STATIC_ROOT)) {
  app.use('/assets/*', serveStatic({ root: STATIC_ROOT }));
  app.use('/vite.svg', serveStatic({ root: STATIC_ROOT, path: '/vite.svg' }));

  // SPA fallback — serve index.html for non-API, non-backend routes
  const indexHtml = fs.readFileSync(`${STATIC_ROOT}/index.html`, 'utf-8');
  app.notFound((c) => {
    // Only serve SPA for GET requests that accept HTML (browser navigation)
    const accept = c.req.header('accept') || '';
    if (c.req.method === 'GET' && accept.includes('text/html')) {
      return c.html(indexHtml);
    }
    return c.json({ error: 'Not found' }, 404);
  });
}

async function main() {
  // Start PG LISTEN/NOTIFY for SSE
  await startListening();

  // Start pg-boss and register worker
  const queue = await getQueue();

  // Register scenario runner worker
  const { handleScenarioJob } = await import('./workers/scenario-runner.js');
  await queue.registerWorker(handleScenarioJob, config.workerConcurrency);
  log.child({ component: 'worker' }).info('Registered scenario runner', { concurrency: config.workerConcurrency });

  // Start HTTP server
  serve({
    fetch: app.fetch,
    port: config.port,
  }, (info) => {
    log.child({ component: 'server' }).info(`Preclinical API running on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  log.child({ component: 'server' }).error('Failed to start', err);
  process.exit(1);
});

export default app;

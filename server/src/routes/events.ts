import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { addSSEClient } from '../lib/realtime.js';

const app = new Hono();

app.get('/events', (c) => {
  const runId = c.req.query('run_id');
  if (!runId) {
    return c.json({ error: 'run_id query parameter is required' }, 400);
  }

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('Access-Control-Allow-Origin', '*');

  return stream(c, async (stream) => {
    // Send initial connection event
    await stream.write(`data: ${JSON.stringify({ type: 'connected', run_id: runId })}\n\n`);

    const controller = {
      enqueue: (chunk: Uint8Array) => {
        stream.write(new TextDecoder().decode(chunk)).catch(() => {});
      },
    } as ReadableStreamDefaultController;

    const removeClient = addSSEClient(runId, controller);

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(async () => {
      try {
        await stream.write(`: ping\n\n`);
      } catch {
        clearInterval(keepAlive);
      }
    }, 30_000);

    // Wait for abort signal
    try {
      await new Promise((resolve) => {
        c.req.raw.signal.addEventListener('abort', resolve);
      });
    } finally {
      clearInterval(keepAlive);
      removeClient();
    }
  });
});

export default app;

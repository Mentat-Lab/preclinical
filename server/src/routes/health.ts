import { Hono } from 'hono';
import { sql } from '../lib/db.js';

const app = new Hono();

app.get('/health', async (c) => {
  try {
    await sql`SELECT 1`;
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    return c.json({ status: 'error', error: 'Database connection failed' }, 503);
  }
});

export default app;

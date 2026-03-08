import { sql } from './db.js';
import { log } from './logger.js';

const logger = log.child({ component: 'realtime' });

type SSEClient = {
  runId: string;
  controller: ReadableStreamDefaultController;
};

const clients: Set<SSEClient> = new Set();

export function addSSEClient(runId: string, controller: ReadableStreamDefaultController) {
  const client: SSEClient = { runId, controller };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function broadcastToRun(runId: string, data: Record<string, unknown>) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();

  for (const client of clients) {
    if (client.runId === runId) {
      try {
        client.controller.enqueue(encoder.encode(message));
      } catch {
        clients.delete(client);
      }
    }
  }
}

export async function startListening() {
  // Listen for PG NOTIFY events from the db_changes channel
  const listener = await sql.listen('db_changes', (payload) => {
    try {
      const data = JSON.parse(payload);
      if (data.test_run_id) {
        broadcastToRun(data.test_run_id, data);
      }
    } catch (err) {
      logger.error('Failed to parse notification', err);
    }
  });

  logger.info('Listening on db_changes channel');
  return listener;
}

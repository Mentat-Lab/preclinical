/**
 * Global setup for server tests.
 *
 * Verifies the server at BASE_URL is reachable before the test suite runs.
 * The server must already be running (docker compose up or npm run dev).
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8000';

export async function setup(): Promise<void> {
  const maxAttempts = 10;
  const delay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        const body = await res.json() as { status: string };
        if (body.status === 'ok') {
          console.log(`\n[setup] Server is ready at ${BASE_URL}\n`);
          return;
        }
      }
    } catch {
      // Server not yet up
    }

    if (attempt < maxAttempts) {
      console.log(`[setup] Waiting for server (attempt ${attempt}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(
    `[setup] Server at ${BASE_URL} did not become healthy after ${maxAttempts} attempts.\n` +
    `Make sure the server is running: cd server && npm run dev`
  );
}

export async function teardown(): Promise<void> {
  // Nothing to clean up — server lifecycle is managed externally
}

export default setup;

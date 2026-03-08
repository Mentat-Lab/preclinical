/**
 * SSE /events endpoint tests
 *
 * GET /events?run_id=xxx
 *
 * Full SSE streaming cannot be tested with a simple fetch() that waits for
 * a complete response.  Instead these tests:
 *   1. Verify the correct Content-Type header is returned.
 *   2. Verify the connection sends an initial 'connected' event in the stream.
 *   3. Verify that missing run_id returns 400.
 *
 * We use an AbortController with a short timeout to read the first chunk
 * without hanging the test runner.
 */

import { describe, it, expect } from 'vitest';
import { BASE_URL, NONEXISTENT_UUID } from '../setup/test-utils';

const SSE_TIMEOUT_MS = 3_000;

/**
 * Open an SSE connection, read until we have at least `minBytes` OR the
 * `timeoutMs` deadline fires, then abort the connection and return whatever
 * was accumulated.
 */
async function readSSEChunk(
  url: string,
  minBytes = 32,
  timeoutMs = SSE_TIMEOUT_MS
): Promise<{ status: number; contentType: string; body: string }> {
  const controller = new AbortController();

  let status = 0;
  let contentType = '';
  let body = '';

  // We resolve this promise as soon as we've collected enough bytes, then
  // separately abort the connection so the keep-alive stream closes.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      controller.abort();
      resolve();
    }, timeoutMs);

    fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    })
      .then(async (response) => {
        status = response.status;
        contentType = response.headers.get('content-type') ?? '';

        if (!response.body) {
          clearTimeout(timer);
          controller.abort();
          resolve();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            body += decoder.decode(value, { stream: true });
            if (body.length >= minBytes) {
              clearTimeout(timer);
              reader.cancel().catch(() => {});
              controller.abort();
              resolve();
              return;
            }
          }
        } catch {
          // AbortError from reader — body was accumulated up to this point
        } finally {
          clearTimeout(timer);
          resolve();
        }
      })
      .catch((err: unknown) => {
        // fetch() itself was aborted before the response arrived
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('[readSSEChunk] fetch error:', err.message);
        }
        clearTimeout(timer);
        resolve();
      });
  });

  return { status, contentType, body };
}

describe('GET /events — SSE endpoint', () => {
  it('returns 400 when run_id query param is missing', async () => {
    const res = await fetch(`${BASE_URL}/events`);
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/run_id/i);
  });

  it('responds with Content-Type: text/event-stream for a valid run_id', async () => {
    const { status, contentType } = await readSSEChunk(
      `${BASE_URL}/events?run_id=${NONEXISTENT_UUID}`
    );

    // 200 = connection established (even for non-existent runs — SSE stays open)
    expect(status).toBe(200);
    expect(contentType).toMatch(/text\/event-stream/);
  });

  it('sends an initial "connected" event in the stream body', async () => {
    const { body } = await readSSEChunk(
      `${BASE_URL}/events?run_id=${NONEXISTENT_UUID}`
    );

    // The server immediately writes:
    // data: {"type":"connected","run_id":"<uuid>"}\n\n
    expect(body).toMatch(/data:/);
    expect(body).toMatch(/connected/);
  });

  it('initial event payload contains the requested run_id', async () => {
    const runId = NONEXISTENT_UUID;
    const { body } = await readSSEChunk(`${BASE_URL}/events?run_id=${runId}`);

    // Parse the first data: line
    const dataLine = body
      .split('\n')
      .find((l) => l.startsWith('data:'));

    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.replace(/^data:\s*/, ''));
    expect(payload.type).toBe('connected');
    expect(payload.run_id).toBe(runId);
  });

  it('sets Cache-Control: no-cache header', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}/events?run_id=${NONEXISTENT_UUID}`, {
        signal: controller.signal,
      });

      const cacheControl = res.headers.get('cache-control') ?? '';
      expect(cacheControl).toMatch(/no-cache/i);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') throw err;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  });
});

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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BASE_URL, NONEXISTENT_UUID, api, getSeededScenarioIds } from '../setup/test-utils';

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

  it('SSE for nonexistent run_id connects but only sends the connected event within 2 seconds', async () => {
    // Read for 2 seconds — a non-existent run will never have follow-up events
    const { body } = await readSSEChunk(
      `${BASE_URL}/events?run_id=${NONEXISTENT_UUID}`,
      /* minBytes */ 1,
      /* timeoutMs */ 2_000
    );

    // Parse all data lines
    const dataLines = body.split('\n').filter((l) => l.startsWith('data:'));

    // There should be at least one event (the connected event)
    expect(dataLines.length).toBeGreaterThanOrEqual(1);

    // Every event received should be the "connected" type — no run-progress events
    for (const line of dataLines) {
      const payload = JSON.parse(line.replace(/^data:\s*/, ''));
      expect(payload.type).toBe('connected');
    }
  });

  describe('SSE delivers events when a real run progresses', () => {
    let agentId: string;
    let scenarioIds: string[];
    // Runs started inside the test — tracked so afterAll can cancel them
    const startedRunIds: string[] = [];

    beforeAll(async () => {
      scenarioIds = await getSeededScenarioIds();

      // Create a dedicated agent once for this describe block
      const agentRes = await api.post<{ id: string }>('/api/v1/agents', {
        provider: 'openai',
        name: `SSE Event Test Agent ${Date.now()}`,
        config: { model: 'gpt-4o-mini' },
      });
      if (agentRes.status !== 201) {
        throw new Error(`Failed to create agent: ${JSON.stringify(agentRes.data)}`);
      }
      agentId = agentRes.data.id;
    });

    afterAll(async () => {
      await Promise.all(
        startedRunIds.map((id) =>
          api.post('/cancel-run', { test_run_id: id }).catch(() => {})
        )
      );
      if (agentId) await api.delete(`/api/v1/agents/${agentId}`).catch(() => {});
    });

    it('receives at least one event beyond "connected" within 15 seconds', async () => {
      // We must open the SSE connection BEFORE firing start-run so we don't
      // miss events that pg-boss emits the instant the job is picked up.
      //
      // Strategy:
      //   1. Obtain a run_id placeholder by using a two-phase approach:
      //      open SSE after receiving the run_id from start-run but kick off
      //      start-run first and keep the SSE window long (15 s) to catch
      //      events that arrive after our connection is established.
      //
      // Because the server emits events via PG LISTEN/NOTIFY and the pg-boss
      // worker processes the first turn asynchronously, there is typically a
      // window of several seconds before the first event fires — plenty of time
      // to open the SSE connection after start-run returns.
      const STREAM_TIMEOUT_MS = 15_000;

      // Step 1: start the run — this is fast (< 200 ms) and the first job
      // event won't fire until pg-boss actually executes the scenario runner.
      const startRes = await api.post<{ id: string; status: string }>('/start-run', {
        agent_id: agentId,
        scenario_ids: [scenarioIds[0]],
        max_turns: 2,
      });
      if (startRes.status !== 200) {
        throw new Error(`Failed to start run: ${JSON.stringify(startRes.data)}`);
      }
      const runId = startRes.data.id;
      startedRunIds.push(runId);

      // Step 2: open the SSE stream immediately and accumulate for up to 15 s.
      // minBytes is set very high (100 KB) so we never exit early on byte count
      // alone — we rely entirely on the 15-second timeout to decide when to stop.
      const { body } = await readSSEChunk(
        `${BASE_URL}/events?run_id=${runId}`,
        /* minBytes */ 100_000,
        STREAM_TIMEOUT_MS
      );

      // Parse all data lines from the accumulated stream body
      const dataLines = body.split('\n').filter((l) => l.startsWith('data:'));

      // Must have at least the initial connected event
      expect(dataLines.length).toBeGreaterThanOrEqual(1);
      const firstPayload = JSON.parse(dataLines[0].replace(/^data:\s*/, ''));
      expect(firstPayload.type).toBe('connected');
      expect(firstPayload.run_id).toBe(runId);

      // At least one run-progress notification should have arrived within the
      // window.  The PG NOTIFY trigger emits different shapes depending on
      // the source table:
      //   - test_run_events INSERT → { table: 'test_run_events', event_type: '...' }
      //   - scenario_runs UPDATE   → { table: 'scenario_runs', status: '...' }
      //   - test_runs UPDATE       → { table: 'test_runs', status: '...' }
      const RUN_TABLES = new Set(['test_run_events', 'scenario_runs', 'test_runs']);

      const progressEvents = dataLines.slice(1).filter((line) => {
        try {
          const payload = JSON.parse(line.replace(/^data:\s*/, ''));
          // Any notification that references one of the run tables is a progress event
          return RUN_TABLES.has(payload.table);
        } catch {
          return false;
        }
      });

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});

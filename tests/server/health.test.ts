/**
 * Health endpoint tests
 *
 * GET /health — server liveness + DB connectivity check.
 */

import { describe, it, expect } from 'vitest';
import { api } from '../setup/test-utils';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await api.get('/health');

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });

  it('includes a timestamp in the response', async () => {
    const res = await api.get<{ status: string; timestamp: string }>('/health');

    expect(res.status).toBe(200);
    expect(typeof res.data.timestamp).toBe('string');

    // Timestamp must be a valid ISO 8601 date
    const ts = new Date(res.data.timestamp);
    expect(Number.isNaN(ts.getTime())).toBe(false);
  });

  it('responds with JSON content-type', async () => {
    const res = await api.get('/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

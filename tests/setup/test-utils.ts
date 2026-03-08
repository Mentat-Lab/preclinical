/**
 * Test utilities for the Hono server at localhost:8000
 *
 * Provides a simple HTTP client and helper functions for the plain
 * Hono API server.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env from project root
config({ path: resolve(__dirname, '../../.env') });

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8000';

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

/**
 * Generic fetch wrapper that always returns status + parsed body.
 * Never throws on non-2xx — callers assert on status themselves.
 */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options?: {
    body?: unknown;
    params?: Record<string, string>;
  }
): Promise<ApiResponse<T>> {
  let url = `${BASE_URL}${path}`;

  if (options?.params) {
    const qs = new URLSearchParams(options.params).toString();
    url = `${url}?${qs}`;
  }

  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);

  let data: T;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    data = (await response.json()) as T;
  } else {
    data = (await response.text()) as unknown as T;
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { status: response.status, data, headers };
}

export const api = {
  get: <T = unknown>(path: string, params?: Record<string, string>) =>
    apiRequest<T>('GET', path, { params }),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>('POST', path, { body }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>('PATCH', path, { body }),
  delete: <T = unknown>(path: string) =>
    apiRequest<T>('DELETE', path),
};

/** A UUID that will never exist in the DB */
export const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Fetches real active scenario IDs from the running server.
 * Cached after first call so every test file shares the same list.
 */
let _cachedScenarioIds: string[] | null = null;

export async function getSeededScenarioIds(): Promise<string[]> {
  if (_cachedScenarioIds) return _cachedScenarioIds;
  const res = await api.get<{ scenarios: Array<{ scenario_id: string }> }>('/api/v1/scenarios');
  if (res.status !== 200 || !res.data.scenarios?.length) {
    throw new Error('Could not fetch seeded scenarios from server');
  }
  _cachedScenarioIds = res.data.scenarios.map((s) => s.scenario_id);
  return _cachedScenarioIds;
}

/**
 * Wait for a condition with polling.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  { timeout = 10_000, interval = 300 }: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitFor: timeout');
}

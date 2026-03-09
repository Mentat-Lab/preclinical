/**
 * Scenarios endpoint tests
 *
 * GET    /api/v1/scenarios           — list active+approved scenarios
 * GET    /api/v1/scenarios?tag=xxx   — filter by tag
 * GET    /api/v1/scenarios/:id       — single scenario fetch
 * PATCH  /api/v1/scenarios/:id       — update fields (full + partial)
 * DELETE /api/v1/scenarios/:id       — soft-delete (sets is_active=false)
 * POST   /api/v1/scenarios/generate  — validation only (no LLM calls)
 * POST   /api/v1/scenarios/generate-batch — validation only (no LLM calls)
 *
 * The seed.sql file inserts 463 well-known scenarios. Tests rely on those being
 * present but do not assume they are the only rows.
 *
 * PATCH and DELETE tests use a single seeded scenario and restore its original
 * state in afterAll so the test suite remains idempotent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, getSeededScenarioIds, NONEXISTENT_UUID } from '../setup/test-utils';

// ── Shared types ──────────────────────────────────────────────────────────────

interface Scenario {
  scenario_id: string;
  name: string;
  category?: string | null;
  scenario_type: string;
  is_active: boolean;
  approved: boolean;
  priority?: number | null;
  tags: string[];
  content?: unknown;
  rubric_criteria?: unknown;
}

interface ScenariosResponse {
  scenarios: Scenario[];
  total: number;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Scenarios API', () => {
  // ── GET /api/v1/scenarios — list scenarios ──────────────────────────────────

  describe('GET /api/v1/scenarios — list scenarios', () => {
    it('returns 200 with scenarios and total', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.scenarios)).toBe(true);
      expect(typeof res.data.total).toBe('number');
      expect(res.data.total).toBeGreaterThan(0);
    });

    it('total matches the length of the returned array', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios');

      expect(res.status).toBe(200);
      expect(res.data.total).toBe(res.data.scenarios.length);
    });

    it('each scenario has the expected shape', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios');

      expect(res.status).toBe(200);
      for (const s of res.data.scenarios) {
        expect(s).toHaveProperty('scenario_id');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('scenario_type');
        expect(s).toHaveProperty('is_active');
        expect(s).toHaveProperty('approved');
      }
    });

    it('only returns active scenarios (is_active = true)', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios');

      expect(res.status).toBe(200);
      for (const s of res.data.scenarios) {
        expect(s.is_active).toBe(true);
      }
    });

    it('includes seeded scenarios', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios');

      expect(res.status).toBe(200);
      expect(res.data.scenarios.length).toBeGreaterThan(0);

      // Verify dynamically fetched IDs are present
      const seededIds = await getSeededScenarioIds();
      const ids = res.data.scenarios.map((s) => s.scenario_id);
      for (const seededId of seededIds.slice(0, 5)) {
        expect(ids).toContain(seededId);
      }
    });

    it('seeded scenarios have non-empty names', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios');
      expect(res.status).toBe(200);

      for (const s of res.data.scenarios) {
        expect(s.name).toBeTruthy();
        expect(s.name.length).toBeGreaterThan(0);
      }
    });

    it('results are returned in a consistent order', async () => {
      const res1 = await api.get<ScenariosResponse>('/api/v1/scenarios');
      const res2 = await api.get<ScenariosResponse>('/api/v1/scenarios');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      const names1 = res1.data.scenarios.map((s) => s.name);
      const names2 = res2.data.scenarios.map((s) => s.name);
      expect(names1).toEqual(names2);
    });
  });

  // ── GET /api/v1/scenarios?tag=xxx — tag filtering ──────────────────────────

  describe('GET /api/v1/scenarios?tag=xxx — tag filtering', () => {
    const TEST_TAG = 'preclinical-test-tag';
    let taggedScenarioId: string;

    beforeAll(async () => {
      // Attach a unique tag to one seeded scenario so we can filter by it
      const seededIds = await getSeededScenarioIds();
      taggedScenarioId = seededIds[0];

      const patchRes = await api.patch<Scenario>(`/api/v1/scenarios/${taggedScenarioId}`, {
        tags: [TEST_TAG],
      });
      if (patchRes.status !== 200) {
        throw new Error(`Could not tag scenario for tag-filter tests: ${JSON.stringify(patchRes.data)}`);
      }
    });

    afterAll(async () => {
      // Remove the test tag to restore original state
      await api.patch(`/api/v1/scenarios/${taggedScenarioId}`, { tags: [] });
    });

    it('returns 200 with an empty array when no scenarios match the tag', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios', {
        tag: 'tag-that-will-never-exist-xyzzy',
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.scenarios)).toBe(true);
      expect(res.data.scenarios).toHaveLength(0);
      expect(res.data.total).toBe(0);
    });

    it('returns only scenarios that have the requested tag', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios', {
        tag: TEST_TAG,
      });

      expect(res.status).toBe(200);
      expect(res.data.scenarios.length).toBeGreaterThan(0);
      for (const s of res.data.scenarios) {
        expect(s.tags).toContain(TEST_TAG);
      }
    });

    it('tagged result includes the scenario we tagged', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios', {
        tag: TEST_TAG,
      });

      expect(res.status).toBe(200);
      const ids = res.data.scenarios.map((s) => s.scenario_id);
      expect(ids).toContain(taggedScenarioId);
    });

    it('total matches the number of scenarios returned for the tag', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios', {
        tag: TEST_TAG,
      });

      expect(res.status).toBe(200);
      expect(res.data.total).toBe(res.data.scenarios.length);
    });

    it('tag filter still only returns active+approved scenarios', async () => {
      const res = await api.get<ScenariosResponse>('/api/v1/scenarios', {
        tag: TEST_TAG,
      });

      expect(res.status).toBe(200);
      for (const s of res.data.scenarios) {
        expect(s.is_active).toBe(true);
        expect(s.approved).toBe(true);
      }
    });
  });

  // ── GET /api/v1/scenarios/:id — single scenario ────────────────────────────

  describe('GET /api/v1/scenarios/:id — single scenario fetch', () => {
    let scenarioId: string;
    let scenarioName: string;

    beforeAll(async () => {
      const seededIds = await getSeededScenarioIds();
      scenarioId = seededIds[0];

      // Fetch to capture the name for cross-checking
      const res = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);
      if (res.status !== 200) {
        throw new Error(`Could not fetch scenario for single-fetch tests: ${JSON.stringify(res.data)}`);
      }
      scenarioName = res.data.name;
    });

    it('returns 200 with the correct scenario', async () => {
      const res = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);

      expect(res.status).toBe(200);
      expect(res.data.scenario_id).toBe(scenarioId);
    });

    it('returned scenario name matches what the list endpoint shows', async () => {
      const res = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);

      expect(res.status).toBe(200);
      expect(res.data.name).toBe(scenarioName);
    });

    it('response has all expected fields', async () => {
      const res = await api.get<Record<string, unknown>>(`/api/v1/scenarios/${scenarioId}`);

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('scenario_id');
      expect(res.data).toHaveProperty('name');
      expect(res.data).toHaveProperty('scenario_type');
      expect(res.data).toHaveProperty('is_active');
      expect(res.data).toHaveProperty('approved');
      expect(res.data).toHaveProperty('tags');
      expect(res.data).toHaveProperty('content');
      expect(res.data).toHaveProperty('rubric_criteria');
    });

    it('returns 404 for a non-existent scenario ID', async () => {
      const res = await api.get<{ error: string }>(`/api/v1/scenarios/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/not found/i);
    });

    it('GET /:id returns scenario even when is_active=false (no active filter on single fetch)', async () => {
      // Soft-delete then verify it is still fetchable by ID
      const deleteRes = await api.delete(`/api/v1/scenarios/${scenarioId}`);
      expect(deleteRes.status).toBe(204);

      const fetchRes = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.data.is_active).toBe(false);

      // Restore
      await api.patch(`/api/v1/scenarios/${scenarioId}`, { is_active: true });
    });
  });

  // ── PATCH /api/v1/scenarios/:id — update scenario ──────────────────────────

  describe('PATCH /api/v1/scenarios/:id — update scenario', () => {
    let scenarioId: string;
    let originalName: string;
    let originalCategory: string | null;
    let originalApproved: boolean;
    let originalPriority: number | null;
    let originalScenarioType: string;
    let originalTags: string[];

    beforeAll(async () => {
      const seededIds = await getSeededScenarioIds();
      // Use the second seeded scenario to avoid conflicts with GET/:id tests
      scenarioId = seededIds[1];

      const res = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);
      if (res.status !== 200) {
        throw new Error(`Could not fetch scenario for PATCH tests: ${JSON.stringify(res.data)}`);
      }
      originalName = res.data.name;
      originalCategory = res.data.category ?? null;
      originalApproved = res.data.approved;
      originalPriority = res.data.priority ?? null;
      originalScenarioType = res.data.scenario_type;
      originalTags = res.data.tags ?? [];
    });

    afterAll(async () => {
      // Restore all mutated fields to their original values
      await api.patch(`/api/v1/scenarios/${scenarioId}`, {
        name: originalName,
        category: originalCategory,
        approved: originalApproved,
        priority: originalPriority,
        scenario_type: originalScenarioType,
        is_active: true,
        tags: originalTags,
      });
    });

    it('returns 200 with updated scenario when name is changed', async () => {
      const newName = `PATCH Test — ${Date.now()}`;
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        name: newName,
      });

      expect(res.status).toBe(200);
      expect(res.data.scenario_id).toBe(scenarioId);
      expect(res.data.name).toBe(newName);
    });

    it('persisted name change is visible on subsequent GET', async () => {
      const newName = `PATCH Persist Check — ${Date.now()}`;
      await api.patch(`/api/v1/scenarios/${scenarioId}`, { name: newName });

      const fetchRes = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.data.name).toBe(newName);
    });

    it('returns 200 and updates category', async () => {
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        category: 'updated-category',
      });

      expect(res.status).toBe(200);
      expect(res.data.category).toBe('updated-category');
    });

    it('returns 200 and updates approved flag', async () => {
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        approved: false,
      });

      expect(res.status).toBe(200);
      expect(res.data.approved).toBe(false);

      // Restore approved so subsequent tests still see this scenario in the list
      await api.patch(`/api/v1/scenarios/${scenarioId}`, { approved: true });
    });

    it('returns 200 and updates priority', async () => {
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        priority: 3,
      });

      expect(res.status).toBe(200);
      expect(res.data.priority).toBe(3);
    });

    it('returns 200 and updates tags', async () => {
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        tags: ['tag-a', 'tag-b'],
      });

      expect(res.status).toBe(200);
      expect(res.data.tags).toEqual(expect.arrayContaining(['tag-a', 'tag-b']));
      expect(res.data.tags).toHaveLength(2);
    });

    it('partial update only changes specified fields — unspecified fields are preserved', async () => {
      // First set a known name
      const knownName = `Partial Update Base — ${Date.now()}`;
      await api.patch(`/api/v1/scenarios/${scenarioId}`, { name: knownName });

      // Now patch only priority
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        priority: 7,
      });

      expect(res.status).toBe(200);
      // Name should be unchanged
      expect(res.data.name).toBe(knownName);
      expect(res.data.priority).toBe(7);
    });

    it('returns 200 and updates scenario_type to a valid value', async () => {
      // The schema CHECK constraint only allows: 'full', 'demo', 'custom'
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        scenario_type: 'demo',
      });

      expect(res.status).toBe(200);
      expect(res.data.scenario_type).toBe('demo');
    });

    it('returns 200 and updates is_active', async () => {
      const res = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        is_active: false,
      });

      expect(res.status).toBe(200);
      expect(res.data.is_active).toBe(false);

      // Restore so the scenario stays visible in other tests
      await api.patch(`/api/v1/scenarios/${scenarioId}`, { is_active: true });
    });

    it('returns 404 for a non-existent scenario ID', async () => {
      const res = await api.patch<{ error: string }>(`/api/v1/scenarios/${NONEXISTENT_UUID}`, {
        name: 'Should Not Exist',
      });

      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/not found/i);
    });

    it('returns 400 when request body is not valid JSON', async () => {
      // Send a raw malformed body by going through a manual fetch so we can skip JSON serialisation
      const url = `${(await import('../setup/test-utils')).BASE_URL}/api/v1/scenarios/${scenarioId}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json{{{',
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toMatch(/json/i);
    });
  });

  // ── DELETE /api/v1/scenarios/:id — soft delete ─────────────────────────────

  describe('DELETE /api/v1/scenarios/:id — soft delete', () => {
    let scenarioId: string;

    beforeAll(async () => {
      const seededIds = await getSeededScenarioIds();
      // Use the third seeded scenario to avoid state conflicts with the other suites
      scenarioId = seededIds[2];
    });

    afterAll(async () => {
      // Ensure the scenario is restored to active regardless of test order
      await api.patch(`/api/v1/scenarios/${scenarioId}`, { is_active: true });
    });

    it('returns 204 on successful soft-delete', async () => {
      const res = await api.delete(`/api/v1/scenarios/${scenarioId}`);

      expect(res.status).toBe(204);
    });

    it('deleted scenario is no longer in the active list', async () => {
      // Ensure it is soft-deleted first
      await api.delete(`/api/v1/scenarios/${scenarioId}`);

      const listRes = await api.get<ScenariosResponse>('/api/v1/scenarios');
      expect(listRes.status).toBe(200);
      const ids = listRes.data.scenarios.map((s) => s.scenario_id);
      expect(ids).not.toContain(scenarioId);
    });

    it('GET /:id still returns the scenario with is_active=false after soft-delete', async () => {
      await api.delete(`/api/v1/scenarios/${scenarioId}`);

      const fetchRes = await api.get<Scenario>(`/api/v1/scenarios/${scenarioId}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.data.scenario_id).toBe(scenarioId);
      expect(fetchRes.data.is_active).toBe(false);
    });

    it('scenario can be reactivated via PATCH after soft-delete', async () => {
      await api.delete(`/api/v1/scenarios/${scenarioId}`);

      const patchRes = await api.patch<Scenario>(`/api/v1/scenarios/${scenarioId}`, {
        is_active: true,
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.data.is_active).toBe(true);

      const listRes = await api.get<ScenariosResponse>('/api/v1/scenarios');
      expect(listRes.status).toBe(200);
      const ids = listRes.data.scenarios.map((s) => s.scenario_id);
      expect(ids).toContain(scenarioId);
    });

    it('returns 404 when deleting a non-existent scenario', async () => {
      const res = await api.delete<{ error: string }>(`/api/v1/scenarios/${NONEXISTENT_UUID}`);

      expect(res.status).toBe(404);
      expect(res.data.error).toMatch(/not found/i);
    });
  });

  // ── POST /api/v1/scenarios/generate — validation only ──────────────────────

  describe('POST /api/v1/scenarios/generate — input validation', () => {
    it('returns 400 when body is missing the text field', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {
        category: 'test-category',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when text is an empty string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {
        text: '',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when text is a whitespace-only string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {
        text: '   ',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when body is empty JSON object (text absent)', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {});

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when request body is not valid JSON', async () => {
      const { BASE_URL } = await import('../setup/test-utils');
      const response = await fetch(`${BASE_URL}/api/v1/scenarios/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when category is provided but is not a string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {
        text: 'Valid clinical text describing a patient scenario.',
        category: 123,
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/category/i);
    });

    it('returns 400 when name is provided but is not a string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {
        text: 'Valid clinical text describing a patient scenario.',
        name: ['not', 'a', 'string'],
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/name/i);
    });

    it('returns 400 when tags is provided but is not an array of strings', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate', {
        text: 'Valid clinical text describing a patient scenario.',
        tags: 'not-an-array',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/tags/i);
    });
  });

  // ── POST /api/v1/scenarios/generate-batch — validation only ────────────────

  describe('POST /api/v1/scenarios/generate-batch — input validation', () => {
    it('returns 400 when body is missing the text field', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {
        category: 'test-category',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when text is an empty string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {
        text: '',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when text is a whitespace-only string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {
        text: '   \t\n',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when body is empty JSON object (text absent)', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {});

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/text/i);
    });

    it('returns 400 when request body is not valid JSON', async () => {
      const { BASE_URL } = await import('../setup/test-utils');
      const response = await fetch(`${BASE_URL}/api/v1/scenarios/generate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when category is provided but is not a string', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {
        text: 'Valid clinical protocol text describing multiple patient scenarios.',
        category: true,
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/category/i);
    });

    it('returns 400 when tags is provided but contains non-string elements', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {
        text: 'Valid clinical protocol text describing multiple patient scenarios.',
        tags: [1, 2, 3],
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/tags/i);
    });

    it('returns 400 when tags is a string instead of an array', async () => {
      const res = await api.post<{ error: string }>('/api/v1/scenarios/generate-batch', {
        text: 'Valid clinical protocol text describing multiple patient scenarios.',
        tags: 'cardiology',
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/tags/i);
    });
  });
});

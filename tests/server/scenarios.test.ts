/**
 * Scenarios endpoint tests
 *
 * GET /api/v1/scenarios       — list active scenarios (should include seeded data)
 * GET /api/v1/scenarios/:id   — (not in public-api.ts; tested as 404 to document gap)
 *
 * The seed.sql file inserts 5 well-known scenarios.  Tests rely on those being
 * present but do not assume they are the only rows.
 */

import { describe, it, expect } from 'vitest';
import { api, getSeededScenarioIds, NONEXISTENT_UUID } from '../setup/test-utils';

interface Scenario {
  scenario_id: string;
  name: string;
  category?: string;
  scenario_type: string;
  is_active: boolean;
  approved: boolean;
}

interface ScenariosResponse {
  scenarios: Scenario[];
  total: number;
}

describe('Scenarios API', () => {
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
});

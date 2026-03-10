import type {
  TestRun,
  ScenarioRunResult,
  Scenario,
  Agent,
  AgentProvider,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

function normalizeScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    id: scenario.id || scenario.scenario_id,
  };
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ==================== TEST RUNS ====================

export async function getTestRuns(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{ runs: TestRun[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  if (params?.status) sp.set('status', params.status);
  return fetchJSON(`/api/v1/tests?${sp}`);
}

export async function getTestRun(id: string): Promise<{ run: TestRun; results: ScenarioRunResult[] }> {
  const run = await fetchJSON<TestRun>(`/api/v1/tests/${id}`);
  return { run, results: [] };
}

export async function createTestRun(params: {
  agent_id: string;
  name?: string;
  max_turns?: number;
  concurrency_limit?: number;
  scenario_ids?: string[];
  max_scenarios?: number;
  tags?: string[];
}): Promise<{ id: string }> {
  return fetchJSON('/start-run', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function cancelTestRun(id: string): Promise<{ status: string }> {
  return fetchJSON('/cancel-run', {
    method: 'POST',
    body: JSON.stringify({ test_run_id: id }),
  });
}

export async function deleteTestRun(id: string): Promise<void> {
  return fetchJSON(`/api/v1/tests/${id}`, { method: 'DELETE' });
}

// ==================== SCENARIO RUNS ====================

export async function getScenarioRuns(params: {
  testRunId: string;
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{ results: ScenarioRunResult[]; total: number }> {
  const sp = new URLSearchParams();
  sp.set('test_run_id', params.testRunId);
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  if (params.status && params.status !== 'all') sp.set('status', params.status);
  return fetchJSON(`/api/v1/scenario-runs?${sp}`);
}

export async function getScenarioRunById(id: string): Promise<ScenarioRunResult> {
  return fetchJSON(`/api/v1/scenario-runs/${id}`);
}

// ==================== SCENARIOS ====================

export async function getScenarios(): Promise<{ scenarios: Scenario[]; total: number }> {
  const data = await fetchJSON<{ scenarios: Scenario[]; total: number }>('/api/v1/scenarios');
  return {
    ...data,
    scenarios: data.scenarios.map(normalizeScenario),
  };
}

export async function getScenario(id: string): Promise<Scenario> {
  const scenario = await fetchJSON<Scenario>(`/api/v1/scenarios/${id}`);
  return normalizeScenario(scenario);
}

export async function updateScenario(id: string, params: Partial<Omit<Scenario, 'id' | 'scenario_id' | 'created_at' | 'updated_at'>>): Promise<Scenario> {
  const scenario = await fetchJSON<Scenario>(`/api/v1/scenarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
  return normalizeScenario(scenario);
}

export async function deleteScenario(id: string): Promise<void> {
  return fetchJSON(`/api/v1/scenarios/${id}`, { method: 'DELETE' });
}

export async function generateScenario(params: {
  text: string;
  category?: string;
  name?: string;
  tags?: string[];
}): Promise<Scenario> {
  const scenario = await fetchJSON<Scenario>('/api/v1/scenarios/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return normalizeScenario(scenario);
}

export async function generateScenarioBatch(params: {
  text: string;
  category?: string;
  tags?: string[];
}): Promise<{ scenarios: Scenario[]; total: number }> {
  const data = await fetchJSON<{ scenarios: Scenario[]; total: number }>('/api/v1/scenarios/generate-batch', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return {
    ...data,
    scenarios: data.scenarios.map(normalizeScenario),
  };
}

// ==================== AGENTS ====================

export async function getAgents(): Promise<Agent[]> {
  return fetchJSON('/api/v1/agents');
}

export async function getAgent(id: string): Promise<Agent> {
  return fetchJSON(`/api/v1/agents/${id}`);
}

export async function createAgent(params: {
  provider: AgentProvider;
  name: string;
  description?: string;
  config: Record<string, string>;
}): Promise<Agent> {
  return fetchJSON('/api/v1/agents', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateAgent(id: string, params: {
  name?: string;
  description?: string;
  config?: Record<string, string>;
}): Promise<Agent> {
  return fetchJSON(`/api/v1/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(params),
  });
}

export async function deleteAgent(id: string): Promise<void> {
  return fetchJSON(`/api/v1/agents/${id}`, { method: 'DELETE' });
}

// ==================== HEALTH ====================

export async function getHealth(): Promise<{ status: string }> {
  return fetchJSON('/health');
}

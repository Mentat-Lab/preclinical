import { useQuery, useMutation } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { Scenario } from '@/lib/types';

export const queryKeys = {
  agents: () => ['agents'] as const,
  agent: (id: string) => ['agents', id] as const,
  testRuns: (params?: Record<string, unknown>) => ['testRuns', params] as const,
  testRun: (id: string) => ['testRun', id] as const,
  scenarioRuns: (testRunId: string, params?: Record<string, unknown>) =>
    ['scenarioRuns', testRunId, params] as const,
  scenarioRun: (id: string) => ['scenarioRun', id] as const,
  scenarios: () => ['scenarios'] as const,
  scenario: (id: string) => ['scenarios', id] as const,
  health: () => ['health'] as const,
};

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: () => api.getAgents(),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agent(id),
    queryFn: () => api.getAgent(id),
    enabled: !!id,
  });
}

export function useTestRuns(params?: { limit?: number; offset?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.testRuns(params as Record<string, unknown> | undefined),
    queryFn: () => api.getTestRuns(params),
  });
}

export function useTestRun(id: string) {
  return useQuery({
    queryKey: queryKeys.testRun(id),
    queryFn: () => api.getTestRun(id),
    enabled: !!id,
  });
}

export function useScenarioRuns(params: {
  testRunId: string;
  limit?: number;
  offset?: number;
  status?: string;
}) {
  return useQuery({
    queryKey: queryKeys.scenarioRuns(params.testRunId, params as Record<string, unknown>),
    queryFn: () => api.getScenarioRuns(params),
    enabled: !!params.testRunId,
  });
}

export function useScenarioRun(id: string) {
  return useQuery({
    queryKey: queryKeys.scenarioRun(id),
    queryFn: () => api.getScenarioRunById(id),
    enabled: !!id,
  });
}

export function useScenarios() {
  return useQuery({
    queryKey: queryKeys.scenarios(),
    queryFn: () => api.getScenarios(),
  });
}

export function useScenario(id: string) {
  return useQuery({
    queryKey: queryKeys.scenario(id),
    queryFn: () => api.getScenario(id),
    enabled: !!id,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => api.getHealth(),
    refetchInterval: 30_000,
  });
}

export function useUpdateScenario() {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Scenario>) => {
      return api.updateScenario(id, data);
    },
  });
}

export function useGenerateScenario() {
  return useMutation({
    mutationFn: async (data: { text: string; category?: string; name?: string; tags?: string[] }) => {
      return api.generateScenario(data);
    },
  });
}

export function useGenerateScenarioBatch() {
  return useMutation({
    mutationFn: async (data: { text: string; category?: string; tags?: string[] }) => {
      return api.generateScenarioBatch(data);
    },
  });
}

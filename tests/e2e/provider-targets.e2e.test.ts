import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { api, waitFor, getSeededScenarioIds } from '../setup/test-utils';

const SHOULD_RUN = process.env.RUN_PROVIDER_E2E === '1';
const SHOULD_RUN_VAPI = process.env.RUN_VAPI_PROVIDER_E2E === '1';
const SHOULD_RUN_BROWSER = process.env.RUN_BROWSER_PROVIDER_E2E === '1';
const E2E_TIMEOUT_MS = 540_000;
const BROWSER_E2E_TIMEOUT_MS = 540_000;
const E2E_MAX_ATTEMPTS = Math.max(1, parseInt(process.env.E2E_MAX_ATTEMPTS || '3', 10) || 3);
const TARGET_HOST = process.env.E2E_TARGET_HOST || 'host.docker.internal';
const TARGET_HEALTH_HOST = process.env.E2E_TARGET_HEALTH_HOST || '127.0.0.1';
const TARGET_OPENAI_PORT = parseInt(process.env.E2E_TARGET_OPENAI_PORT || '9100', 10);
const TARGET_OPENAI_BASE_URL = process.env.E2E_TARGET_OPENAI_BASE_URL || `http://${TARGET_HOST}:${TARGET_OPENAI_PORT}`;
const TARGET_OPENAI_HEALTH_URL =
  process.env.E2E_TARGET_OPENAI_HEALTH_URL || `http://${TARGET_HEALTH_HOST}:${TARGET_OPENAI_PORT}/health`;
const TARGET_VAPI_PORT = parseInt(process.env.E2E_TARGET_VAPI_PORT || '9200', 10);
const TARGET_VAPI_BASE_URL = process.env.E2E_TARGET_VAPI_BASE_URL || `http://${TARGET_HOST}:${TARGET_VAPI_PORT}`;
const TARGET_VAPI_HEALTH_URL =
  process.env.E2E_TARGET_VAPI_HEALTH_URL || `http://${TARGET_HEALTH_HOST}:${TARGET_VAPI_PORT}/health`;
const TARGET_BROWSER_PORT = parseInt(process.env.E2E_TARGET_BROWSER_PORT || '9300', 10);
const TARGET_BROWSER_URL = process.env.E2E_TARGET_BROWSER_URL || `http://${TARGET_HOST}:${TARGET_BROWSER_PORT}`;
const TARGET_BROWSER_HEALTH_URL =
  process.env.E2E_TARGET_BROWSER_HEALTH_URL || `http://${TARGET_HEALTH_HOST}:${TARGET_BROWSER_PORT}/health`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const openaiTargetDir = path.join(repoRoot, 'target-agents/openai-api');
const vapiTargetDir = path.join(repoRoot, 'target-agents/vapi');
const browserTargetDir = path.join(repoRoot, 'target-agents/browser');
const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  throw new Error('npm_execpath is not set; run tests via npm so nested target-agent installs can run reliably.');
}

const targetProcesses: ChildProcessWithoutNullStreams[] = [];
const createdAgentIds: string[] = [];
const createdRunIds: string[] = [];

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for health endpoint: ${url}`);
}

function ensureTargetDepsInstalled(targetDir: string): void {
  const nodeModulesPath = path.join(targetDir, 'node_modules');
  if (existsSync(nodeModulesPath)) return;

  const hasLockFile = existsSync(path.join(targetDir, 'package-lock.json'));
  const installCommand = hasLockFile ? 'ci' : 'install';
  const install = spawnSync(process.execPath, [npmExecPath, installCommand], {
    cwd: targetDir,
    stdio: 'inherit',
  });

  if (install.status !== 0) {
    throw new Error(`Failed to install target agent dependencies (exit code ${install.status ?? 'unknown'})`);
  }
}

function startTarget(targetDir: string, env: Record<string, string>): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [npmExecPath, 'start'], {
    cwd: targetDir,
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'pipe',
  });
}

async function runProviderFlow(params: {
  provider: string;
  name: string;
  config: Record<string, unknown>;
  scenarioId: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs || E2E_TIMEOUT_MS;
  let lastStatuses: string[] = [];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= E2E_MAX_ATTEMPTS; attempt++) {
    const agentRes = await api.post<{ id: string }>('/api/v1/agents', {
      provider: params.provider,
      name: `${params.name} (attempt ${attempt})`,
      config: params.config,
    });
    expect(agentRes.status).toBe(201);
    const agentId = agentRes.data.id;
    createdAgentIds.push(agentId);

    const runRes = await api.post<{ id: string; status: string; total_scenarios: number }>('/start-run', {
      agent_id: agentId,
      scenario_ids: [params.scenarioId],
      max_turns: 5,
      concurrency_limit: 1,
      name: `E2E ${params.provider} target run (attempt ${attempt})`,
    });
    expect(runRes.status).toBe(200);
    const runId = runRes.data.id;
    createdRunIds.push(runId);

    await waitFor(async () => {
      const run = await api.get<{ status: string }>(`/api/v1/tests/${runId}`);
      return run.status === 200 && ['completed', 'failed', 'canceled'].includes(run.data.status);
    }, { timeout: timeoutMs, interval: 1000 });

    const finalRun = await api.get<{ status: string }>(`/api/v1/tests/${runId}`);
    expect(finalRun.status).toBe(200);
    expect(finalRun.data.status).toBe('completed');

    const scenarioRuns = await api.get<{
      results: Array<{ status: string; error_code?: string | null; error_message?: string | null }>;
    }>('/api/v1/scenario-runs', {
      test_run_id: runId,
    });
    expect(scenarioRuns.status).toBe(200);
    expect(scenarioRuns.data.results.length).toBeGreaterThan(0);

    lastStatuses = scenarioRuns.data.results.map((sr) => sr.status);
    const hasTransportErrors = scenarioRuns.data.results.some((sr) => sr.status === 'error');
    if (!hasTransportErrors && lastStatuses.every((status) => ['passed', 'failed'].includes(status))) {
      return;
    }

    lastErrors = scenarioRuns.data.results
      .filter((sr) => sr.status === 'error')
      .map((sr) => `${sr.error_code || 'UNKNOWN'}:${sr.error_message || 'unknown error'}`);
    if (attempt < E2E_MAX_ATTEMPTS) {
      console.warn(
        `[e2e][${params.provider}] attempt ${attempt} had terminal errors (${lastErrors.join(', ') || 'unknown'}); retrying`,
      );
    }
  }

  throw new Error(
    `[e2e][${params.provider}] failed after ${E2E_MAX_ATTEMPTS} attempts. statuses=${lastStatuses.join(', ') || 'none'} errors=${lastErrors.join(' | ') || 'none'}`,
  );
}

const describeIf = SHOULD_RUN ? describe : describe.skip;
const itVapi = SHOULD_RUN_VAPI ? it : it.skip;
const itBrowser = SHOULD_RUN_BROWSER ? it : it.skip;

describeIf('E2E provider target integration', () => {
  let scenarioIds: string[];

  beforeAll(async () => {
    scenarioIds = await getSeededScenarioIds();
    ensureTargetDepsInstalled(openaiTargetDir);
    ensureTargetDepsInstalled(vapiTargetDir);

    const openaiTarget = startTarget(openaiTargetDir, {
      TARGET_OPENAI_MODE: 'mock',
      TARGET_AGENT_PORT: String(TARGET_OPENAI_PORT),
    });
    const vapiTarget = startTarget(vapiTargetDir, {
      TARGET_VAPI_PORT: String(TARGET_VAPI_PORT),
    });

    targetProcesses.push(openaiTarget, vapiTarget);
    openaiTarget.stdout.on('data', (buf) => {
      process.stdout.write(`[target-openai] ${buf.toString()}`);
    });
    openaiTarget.stderr.on('data', (buf) => {
      process.stderr.write(`[target-openai] ${buf.toString()}`);
    });
    vapiTarget.stdout.on('data', (buf) => {
      process.stdout.write(`[target-vapi] ${buf.toString()}`);
    });
    vapiTarget.stderr.on('data', (buf) => {
      process.stderr.write(`[target-vapi] ${buf.toString()}`);
    });

    await waitForHealth(TARGET_OPENAI_HEALTH_URL);
    await waitForHealth(TARGET_VAPI_HEALTH_URL);

    if (SHOULD_RUN_BROWSER) {
      ensureTargetDepsInstalled(browserTargetDir);
      const browserTarget = startTarget(browserTargetDir, {
        TARGET_BROWSER_PORT: String(TARGET_BROWSER_PORT),
      });
      targetProcesses.push(browserTarget);
      browserTarget.stdout.on('data', (buf) => {
        process.stdout.write(`[target-browser] ${buf.toString()}`);
      });
      browserTarget.stderr.on('data', (buf) => {
        process.stderr.write(`[target-browser] ${buf.toString()}`);
      });
      await waitForHealth(TARGET_BROWSER_HEALTH_URL);
    }
  });

  afterAll(async () => {
    for (const runId of createdRunIds) {
      await api.post('/cancel-run', { test_run_id: runId }).catch(() => {});
    }

    for (const agentId of createdAgentIds) {
      await api.delete(`/api/v1/agents/${agentId}`).catch(() => {});
    }

    for (const targetProcess of targetProcesses) {
      if (!targetProcess.killed) targetProcess.kill('SIGTERM');
    }
  });

  it('runs tester+grader against local openai target agent without scenario errors', async () => {
    await runProviderFlow({
      provider: 'openai',
      name: `E2E OpenAI Target ${Date.now()}`,
      config: {
        api_key: 'local-mock-key',
        base_url: TARGET_OPENAI_BASE_URL,
        target_model: 'mock-healthcare-agent',
      },
      scenarioId: scenarioIds[0],
    });
  });

  itVapi('runs tester+grader against local vapi target agent without scenario errors', async () => {
    await runProviderFlow({
      provider: 'vapi',
      name: `E2E Vapi Target ${Date.now()}`,
      config: {
        api_key: 'local-mock-key',
        assistant_id: 'mock-assistant',
        api_base: TARGET_VAPI_BASE_URL,
      },
      scenarioId: scenarioIds[1],
    });
  });

  itBrowser('runs tester+grader against local browser target agent without scenario errors', async () => {
    await runProviderFlow({
      provider: 'browser',
      name: `E2E Browser Target ${Date.now()}`,
      config: {
        url: TARGET_BROWSER_URL,
      },
      scenarioId: scenarioIds[0],
      timeoutMs: BROWSER_E2E_TIMEOUT_MS,
    });
  }, BROWSER_E2E_TIMEOUT_MS + 30_000);
});

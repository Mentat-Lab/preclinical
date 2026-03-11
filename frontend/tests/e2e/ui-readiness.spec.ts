import { test, expect, type Page, type Route } from '@playwright/test';

const MOCK_RUN_ID = 'test-run-1';

const mockRun = {
  id: MOCK_RUN_ID,
  test_run_id: 'TR-001',
  test_suite_id: 'suite-1',
  agent_id: 'agent-1',
  agent_name: 'Mock Agent',
  agent_type: 'openai',
  name: 'Mock Test Run',
  status: 'completed',
  suite_label: 'Mock Suite',
  max_turns: 6,
  total_scenarios: 5,
  passed_count: 1,
  failed_count: 2,
  error_count: 1,
  pass_rate: 20,
  started_at: '2026-03-01T00:00:00.000Z',
  completed_at: '2026-03-01T00:02:00.000Z',
  created_at: '2026-03-01T00:00:00.000Z',
};

const mockScenarioRuns = {
  total: 5,
  results: [
    { id: 'sr-1', scenario_id: 's-1', scenario_name: 'Scenario Alpha', status: 'passed', passed: true, transcript: [], duration_ms: 61000 },
    { id: 'sr-2', scenario_id: 's-2', scenario_name: 'Scenario Beta', status: 'failed', passed: false, transcript: [], duration_ms: 62000 },
    { id: 'sr-3', scenario_id: 's-3', scenario_name: 'Scenario Gamma', status: 'error', transcript: [], duration_ms: 63000 },
    { id: 'sr-4', scenario_id: 's-4', scenario_name: 'Scenario Delta', status: 'pending', transcript: [] },
    { id: 'sr-5', scenario_id: 's-5', scenario_name: 'Scenario Epsilon', status: 'canceled', transcript: [] },
  ],
};

async function routeTestRunApis(page: Page) {
  await page.route('**/api/v1/tests/**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRun) });
  });

  await page.route('**/api/v1/scenario-runs**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/v1/scenario-runs')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockScenarioRuns) });
      return;
    }
    const id = url.pathname.split('/').pop();
    const result = mockScenarioRuns.results.find((r) => r.id === id);
    await route.fulfill({
      status: result ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(result ?? { error: 'Not found' }),
    });
  });
}

test.describe('UI readiness changes', () => {
  test('renders segmented pass/fail/neutral progress bar', async ({ page }) => {
    await routeTestRunApis(page);

    await page.goto(`/test/${MOCK_RUN_ID}`);

    const bar = page.getByTestId('results-progress-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute(
      'aria-label',
      'Pass: 1, Fail/Error: 2, Pending/Canceled: 2'
    );

    await expect(page.getByTestId('progress-segment-pass')).toHaveAttribute('style', /width:\s*20%/);
    await expect(page.getByTestId('progress-segment-fail')).toHaveAttribute('style', /width:\s*40%/);
    await expect(page.getByTestId('progress-segment-neutral')).toHaveAttribute('style', /width:\s*40%/);
  });

  test('supports full-row click and keyboard navigation for scenario rows', async ({ page }) => {
    await routeTestRunApis(page);

    await page.goto(`/test/${MOCK_RUN_ID}`);

    const alphaRow = page.getByRole('link', { name: /Open scenario run Scenario Alpha/ });
    await alphaRow.click({ position: { x: 20, y: 20 } });
    await expect(page).toHaveURL(/\/test\/test-run-1\/scenario\/sr-1$/);

    await page.goto(`/test/${MOCK_RUN_ID}`);
    const betaRow = page.getByRole('link', { name: /Open scenario run Scenario Beta/ });
    await betaRow.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/test\/test-run-1\/scenario\/sr-2$/);

    await page.goto(`/test/${MOCK_RUN_ID}`);
    const gammaRow = page.getByRole('link', { name: /Open scenario run Scenario Gamma/ });
    await gammaRow.focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/\/test\/test-run-1\/scenario\/sr-3$/);
  });

  test('submits OpenAI defaults when model/base URL are left blank', async ({ page }) => {
    let postedBody: any = null;

    await page.route('**/api/v1/agents', async (route: Route) => {
      if (route.request().method() === 'POST') {
        postedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-agent-1',
            provider: 'openai',
            name: postedBody.name,
            description: postedBody.description ?? null,
            config: postedBody.config,
            is_active: true,
            created_at: '2026-03-01T00:00:00.000Z',
            updated_at: '2026-03-01T00:00:00.000Z',
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/api/v1/agents/mock-agent-1', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-agent-1',
          provider: 'openai',
          name: 'Agent with Defaults',
          description: null,
          config: {
            api_key: '****',
            target_model: 'gpt-4o',
            base_url: 'https://api.openai.com/v1',
          },
          is_active: true,
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-01T00:00:00.000Z',
        }),
      });
    });

    await page.route('**/api/v1/tests**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ runs: [], total: 0 }) });
    });

    await page.goto('/agents/new');

    await page.getByRole('button', { name: 'OpenAI' }).click();
    await page.getByPlaceholder('My Healthcare Triage Bot').fill('Agent with Defaults');
    await page.locator('#config-api_key').fill('sk-test-key');

    await page.locator('#config-target_model').fill('');
    await page.locator('#config-base_url').fill('');

    await page.getByRole('button', { name: 'Create Agent' }).click();

    await expect(page).toHaveURL(/\/agents\/mock-agent-1$/);
    expect(postedBody).toBeTruthy();
    expect(postedBody.config.target_model).toBe('gpt-4o');
    expect(postedBody.config.base_url).toBe('https://api.openai.com/v1');
  });
});

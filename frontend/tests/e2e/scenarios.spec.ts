/**
 * Comprehensive E2E tests for scenario-related pages.
 *
 * Covers:
 *  1. Scenarios list page  (/scenarios)
 *  2. Scenario detail page (/scenarios/11111111-0000-0000-0000-000000000001)
 *  3. Scenario generate page (/scenarios/generate)
 *  4. New run page (/agents/<id>/runs/new)
 *
 * No forms are submitted that would create or mutate data.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Seed IDs (populated in seed.sql) ──────────────────────────────────────────
const CARDIAC_SCENARIO_ID = '11111111-0000-0000-0000-000000000001';
// First live agent id – fetched once in beforeAll
let AGENT_ID = '';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for the page to finish its initial data fetch (no pending XHR). */
async function waitForData(page: Page) {
  await page.waitForLoadState('networkidle');
}

/** Dismiss any modal/overlay that might be present. */
async function dismissOnboarding(page: Page) {
  const dismissBtn = page.locator('[data-testid="onboarding-dismiss"], button:has-text("Dismiss"), button:has-text("Skip"), button:has-text("Close")').first();
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click();
    await page.waitForTimeout(300);
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Scenarios E2E', () => {

  test.beforeAll(async ({ request }) => {
    // Fetch the first active agent id so we can build the new-run URL.
    const resp = await request.get('http://localhost:3000/api/v1/agents');
    expect(resp.ok()).toBeTruthy();
    const agents: Array<{ id: string }> = await resp.json();
    expect(agents.length).toBeGreaterThan(0);
    AGENT_ID = agents[0].id;
  });

  // ── Flow 1: Scenarios list ─────────────────────────────────────────────────

  test.describe('Flow 1: Scenarios list page', () => {
    test('page loads and shows scenario rows', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto('/scenarios');
      await dismissOnboarding(page);
      await waitForData(page);

      // Page title
      await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible();

      // Table structure
      const table = page.locator('table').first();
      await expect(table).toBeVisible();

      // At least one scenario row rendered
      const rows = page.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // Count label visible (e.g. "476 scenarios")
      const countLabel = page.locator('text=/\\d+ scenarios?/');
      await expect(countLabel).toBeVisible();

      // Log any console errors (non-fatal for the test, but reported)
      if (consoleErrors.length > 0) {
        console.warn('Console errors on /scenarios:', consoleErrors.join('\n'));
      }
    });

    test('search filters scenarios by "cardiac"', async ({ page }) => {
      await page.goto('/scenarios');
      await dismissOnboarding(page);
      await waitForData(page);

      const searchInput = page.getByPlaceholder('Search scenarios...');
      await expect(searchInput).toBeVisible();

      // Type "cardiac"
      await searchInput.fill('cardiac');
      await page.waitForTimeout(300); // let React re-render

      // Table still visible
      const table = page.locator('table').first();
      await expect(table).toBeVisible();

      // Result count reduced (should show only cardiac matches)
      const countLabel = page.locator('text=/\\d+ scenarios?.*cardiac/i');
      await expect(countLabel).toBeVisible();

      // Visible row names should all be relevant
      const rows = page.locator('tbody tr');
      const filteredCount = await rows.count();
      expect(filteredCount).toBeGreaterThan(0);
      expect(filteredCount).toBeLessThan(50); // sanity – not showing all 400+

      // Verify a known cardiac scenario is in results
      await expect(page.getByText('Chest Pain - Possible STEMI')).toBeVisible();
    });

    test('clearing search restores all scenarios', async ({ page }) => {
      await page.goto('/scenarios');
      await dismissOnboarding(page);
      await waitForData(page);

      const searchInput = page.getByPlaceholder('Search scenarios...');
      await searchInput.fill('cardiac');
      await page.waitForTimeout(300);

      // Capture filtered count
      const rows = page.locator('tbody tr');
      const filteredCount = await rows.count();

      // Clear via triple-click + delete
      await searchInput.click({ clickCount: 3 });
      await searchInput.press('Backspace');
      await page.waitForTimeout(300);

      // Count should be greater than the filtered count
      const allCount = await rows.count();
      expect(allCount).toBeGreaterThan(filteredCount);

      // Count label no longer mentions the search term
      const countLabel = page.locator('text=/\\d+ scenarios?/');
      await expect(countLabel).toBeVisible();
      const labelText = await countLabel.textContent();
      expect(labelText).not.toContain('matching');
    });
  });

  // ── Flow 2: Scenario detail page ──────────────────────────────────────────

  test.describe('Flow 2: Scenario detail page', () => {
    test('renders all view-mode sections', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(`/scenarios/${CARDIAC_SCENARIO_ID}`);
      await dismissOnboarding(page);
      await waitForData(page);

      // Scenario name heading visible
      await expect(page.getByRole('heading', { name: /Chest Pain/i })).toBeVisible();

      // Details card section
      await expect(page.getByText('Details', { exact: false })).toBeVisible();

      // Demographics section header
      const demographicsHeader = page.locator('text=/demographics/i').first();
      await expect(demographicsHeader).toBeVisible();

      // Chief Complaint section
      const chiefComplaintHeader = page.locator('text=/chief complaint/i').first();
      await expect(chiefComplaintHeader).toBeVisible();

      // SOP / Instructions section
      const sopHeader = page.locator('text=/SOP/i').first();
      await expect(sopHeader).toBeVisible();

      // Rubric Criteria section
      const rubricHeader = page.locator('text=/rubric criteria/i').first();
      await expect(rubricHeader).toBeVisible();

      // Edit button visible (view mode)
      const editBtn = page.getByRole('button', { name: /Edit/i });
      await expect(editBtn).toBeVisible();

      // Back link
      const backLink = page.getByRole('link', { name: /Back to Scenarios/i });
      await expect(backLink).toBeVisible();

      if (consoleErrors.length > 0) {
        console.warn('Console errors on detail page:', consoleErrors.join('\n'));
      }
    });

    test('clicking Edit switches to edit mode with expected fields', async ({ page }) => {
      await page.goto(`/scenarios/${CARDIAC_SCENARIO_ID}`);
      await dismissOnboarding(page);
      await waitForData(page);

      const editBtn = page.getByRole('button', { name: /Edit/i });
      await expect(editBtn).toBeVisible();
      await editBtn.click();

      // Edit mode: name input appears (inline editable)
      const nameInput = page.locator('input[type="text"]').first();
      await expect(nameInput).toBeVisible();
      await expect(nameInput).toHaveValue(/Chest Pain/i);

      // Scenario Settings section
      await expect(page.locator('text=/Scenario Settings/i')).toBeVisible();

      // Category input
      const categoryInput = page.locator('input[placeholder*="cardiac"]');
      await expect(categoryInput).toBeVisible();

      // Scenario Type dropdown
      const typeSelect = page.locator('select').first();
      await expect(typeSelect).toBeVisible();

      // Priority input
      const priorityInput = page.locator('input[type="number"]').first();
      await expect(priorityInput).toBeVisible();

      // Active checkbox
      const activeCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: '' }).nth(0);
      await expect(activeCheckbox).toBeVisible();

      // Approved checkbox
      const approvedCheckbox = page.locator('input[type="checkbox"]').nth(1);
      await expect(approvedCheckbox).toBeVisible();

      // Tags input
      const tagsInput = page.locator('input[placeholder*="tag"]').first();
      await expect(tagsInput).toBeVisible();

      // Demographics section with editable fields
      await expect(page.locator('text=/Demographics/i').first()).toBeVisible();

      // Chief Complaint textarea
      const chiefComplaintTextarea = page.locator('textarea').first();
      await expect(chiefComplaintTextarea).toBeVisible();

      // Test Type dropdown (appears in edit mode)
      const testTypeSelects = page.locator('select');
      const selectCount = await testTypeSelects.count();
      expect(selectCount).toBeGreaterThanOrEqual(2); // scenario type + test type

      // SOP textarea
      const textareas = page.locator('textarea');
      const textareaCount = await textareas.count();
      expect(textareaCount).toBeGreaterThanOrEqual(2); // chief complaint + sop

      // Rubric section
      await expect(page.locator('text=/Rubric Criteria/i').first()).toBeVisible();

      // Cancel and Save buttons
      await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
    });

    test('clicking Cancel returns to view mode with original data', async ({ page }) => {
      await page.goto(`/scenarios/${CARDIAC_SCENARIO_ID}`);
      await dismissOnboarding(page);
      await waitForData(page);

      // Capture original name
      const heading = page.getByRole('heading', { name: /Chest Pain/i });
      const originalName = await heading.textContent();

      // Enter edit mode
      await page.getByRole('button', { name: /Edit/i }).click();

      // Verify we're in edit mode
      await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();

      // Modify the name field to ensure cancel truly discards changes
      const nameInput = page.locator('input[type="text"]').first();
      await nameInput.click({ clickCount: 3 });
      await nameInput.type('MODIFIED NAME DO NOT SAVE');

      // Cancel
      await page.getByRole('button', { name: /Cancel/i }).click();

      // Back to view mode: Edit button should be visible again
      await expect(page.getByRole('button', { name: /Edit/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Cancel/i })).not.toBeVisible();

      // Original name restored
      await expect(page.getByRole('heading', { name: /Chest Pain/i })).toBeVisible();
      const restoredName = await page.getByRole('heading', { name: /Chest Pain/i }).textContent();
      expect(restoredName).toBe(originalName);

      // Details section visible (view mode)
      await expect(page.locator('text=/Details/i').first()).toBeVisible();
    });
  });

  // ── Flow 3: Scenario generate page ────────────────────────────────────────

  test.describe('Flow 3: Scenario generate page', () => {
    test('page loads with all required form elements', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto('/scenarios/generate');
      await dismissOnboarding(page);
      await waitForData(page);

      // Page heading
      await expect(page.getByRole('heading', { name: /Generate Scenario/i })).toBeVisible();

      // Batch mode checkbox
      const batchCheckbox = page.locator('input[type="checkbox"]').first();
      await expect(batchCheckbox).toBeVisible();
      await expect(batchCheckbox).not.toBeChecked();

      // Batch mode label text
      await expect(page.locator('text=/Batch mode/i')).toBeVisible();

      // Tags input
      const tagsInput = page.locator('input[placeholder*="tag"]').first();
      await expect(tagsInput).toBeVisible();

      // Category dropdown
      const categorySelect = page.locator('select[id="gen-category"]');
      await expect(categorySelect).toBeVisible();

      // Verify "Dental" option exists in category dropdown
      const dentalOption = categorySelect.locator('option[value="dental"]');
      await expect(dentalOption).toBeAttached();
      const dentalText = await dentalOption.textContent();
      expect(dentalText?.trim()).toBe('Dental');

      // Clinical text area
      const clinicalTextarea = page.locator('textarea[id="gen-text"]');
      await expect(clinicalTextarea).toBeVisible();

      // Submit button in initial state
      const submitBtn = page.getByRole('button', { name: /Generate Scenario$/i });
      await expect(submitBtn).toBeVisible();
      // Disabled while text is empty
      await expect(submitBtn).toBeDisabled();

      if (consoleErrors.length > 0) {
        console.warn('Console errors on generate page:', consoleErrors.join('\n'));
      }
    });

    test('toggling batch mode changes button text and description', async ({ page }) => {
      await page.goto('/scenarios/generate');
      await dismissOnboarding(page);
      await waitForData(page);

      // Initially single mode
      await expect(page.getByRole('button', { name: /^Generate Scenario$/i })).toBeVisible();
      await expect(page.locator('text=/Generate a single scenario/i')).toBeVisible();

      // Toggle batch mode on
      const batchCheckbox = page.locator('input[type="checkbox"]').first();
      await batchCheckbox.check();
      await page.waitForTimeout(200);

      // Button text changes to plural
      await expect(page.getByRole('button', { name: /Generate Scenarios$/i })).toBeVisible();

      // Description text changes
      await expect(page.locator('text=/Generate multiple scenarios/i')).toBeVisible();

      // In batch mode the "Scenario Name" field is hidden
      const nameInput = page.locator('input[id="gen-name"]');
      await expect(nameInput).not.toBeVisible();

      // Toggle back off
      await batchCheckbox.uncheck();
      await page.waitForTimeout(200);

      // Single mode restored
      await expect(page.getByRole('button', { name: /^Generate Scenario$/i })).toBeVisible();
      await expect(page.locator('text=/Generate a single scenario/i')).toBeVisible();

      // Name field reappears
      await expect(nameInput).toBeVisible();
    });

    test('category dropdown contains expected options', async ({ page }) => {
      await page.goto('/scenarios/generate');
      await dismissOnboarding(page);

      const categorySelect = page.locator('select[id="gen-category"]');
      const options = await categorySelect.locator('option').allTextContents();

      expect(options).toContain('Dental');
      expect(options).toContain('Cardiac');
      expect(options).toContain('Mental Health');
      expect(options).toContain('No category');
    });
  });

  // ── Flow 4: New run page ───────────────────────────────────────────────────

  test.describe('Flow 4: New run page', () => {
    test('page loads with scenario filter controls', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(`/agents/${AGENT_ID}/new-run`);
      await dismissOnboarding(page);
      await waitForData(page);

      // Page heading
      await expect(page.getByRole('heading', { name: /New Test Run/i })).toBeVisible();

      // "Filter by tags" checkbox exists
      const filterTagsLabel = page.locator('text=/Filter by tags/i');
      await expect(filterTagsLabel).toBeVisible();

      const filterTagsCheckbox = page.locator('label').filter({ hasText: /Filter by tags/i }).locator('input[type="checkbox"]');
      await expect(filterTagsCheckbox).toBeVisible();
      await expect(filterTagsCheckbox).not.toBeChecked();

      // "Select specific scenarios" checkbox exists
      const selectSpecificLabel = page.locator('text=/Select specific scenarios/i');
      await expect(selectSpecificLabel).toBeVisible();

      const selectSpecificCheckbox = page.locator('label').filter({ hasText: /Select specific scenarios/i }).locator('input[type="checkbox"]');
      await expect(selectSpecificCheckbox).toBeVisible();

      if (consoleErrors.length > 0) {
        console.warn('Console errors on new-run page:', consoleErrors.join('\n'));
      }
    });

    test('checking "Filter by tags" reveals tag input', async ({ page }) => {
      await page.goto(`/agents/${AGENT_ID}/new-run`);
      await dismissOnboarding(page);
      await waitForData(page);

      // Tag input should NOT be visible initially
      const tagInput = page.locator('input[placeholder*="Add a tag"]').first();
      await expect(tagInput).not.toBeVisible();

      // Check the "Filter by tags" checkbox
      const filterTagsCheckbox = page.locator('label').filter({ hasText: /Filter by tags/i }).locator('input[type="checkbox"]');
      await filterTagsCheckbox.check();
      await page.waitForTimeout(200);

      // Tag input now visible
      await expect(tagInput).toBeVisible();

      // Descriptive hint text appears
      await expect(page.locator('text=/matching any of these tags/i')).toBeVisible();
    });

    test('"Filter by tags" is hidden when "Select specific scenarios" is checked', async ({ page }) => {
      await page.goto(`/agents/${AGENT_ID}/new-run`);
      await dismissOnboarding(page);
      await waitForData(page);

      // Both visible initially
      await expect(page.locator('text=/Filter by tags/i')).toBeVisible();

      // Check "Select specific scenarios"
      const selectSpecificCheckbox = page.locator('label').filter({ hasText: /Select specific scenarios/i }).locator('input[type="checkbox"]');
      await selectSpecificCheckbox.check();
      await page.waitForTimeout(200);

      // "Filter by tags" checkbox is now hidden (it's inside the !selectSpecific block)
      await expect(page.locator('text=/Filter by tags/i')).not.toBeVisible();
    });

    test('"Select specific scenarios" checkbox shows scenario picker', async ({ page }) => {
      await page.goto(`/agents/${AGENT_ID}/new-run`);
      await dismissOnboarding(page);
      await waitForData(page);

      // Scenario picker not visible initially
      const scenarioPicker = page.locator('input[placeholder*="Search scenarios"]');
      await expect(scenarioPicker).not.toBeVisible();

      // Check "Select specific scenarios"
      const selectSpecificCheckbox = page.locator('label').filter({ hasText: /Select specific scenarios/i }).locator('input[type="checkbox"]');
      await selectSpecificCheckbox.check();
      await page.waitForTimeout(200);

      // Scenario search input appears
      await expect(scenarioPicker).toBeVisible();

      // Scenario list loads (wait for loading state to resolve)
      await page.waitForTimeout(1000);

      // Should show scenario checkboxes
      const scenarioCheckboxes = page.locator('.max-h-\\[200px\\] input[type="checkbox"]');
      const checkboxCount = await scenarioCheckboxes.count();
      expect(checkboxCount).toBeGreaterThan(0);

      // Selected count label appears
      await expect(page.locator('text=/\\d+ of \\d+ scenarios selected/i')).toBeVisible();
    });

    test('Start Test Run button is present and disabled without selection when required', async ({ page }) => {
      await page.goto(`/agents/${AGENT_ID}/new-run`);
      await dismissOnboarding(page);
      await waitForData(page);

      const submitBtn = page.getByRole('button', { name: /Start Test Run/i });
      await expect(submitBtn).toBeVisible();

      // When "Select specific scenarios" is checked but no scenarios selected,
      // the submit button should be disabled
      const selectSpecificCheckbox = page.locator('label').filter({ hasText: /Select specific scenarios/i }).locator('input[type="checkbox"]');
      await selectSpecificCheckbox.check();
      await page.waitForTimeout(200);

      await expect(submitBtn).toBeDisabled();

      // Uncheck — button should become enabled again
      await selectSpecificCheckbox.uncheck();
      await page.waitForTimeout(200);
      await expect(submitBtn).not.toBeDisabled();
    });
  });

  // ── Cross-page navigation ──────────────────────────────────────────────────

  test.describe('Navigation between scenario pages', () => {
    test('clicking a scenario row navigates to detail page', async ({ page }) => {
      await page.goto('/scenarios');
      await dismissOnboarding(page);
      await waitForData(page);

      // Click the first scenario name link in the table
      const firstLink = page.locator('tbody tr a').first();
      await expect(firstLink).toBeVisible();
      const href = await firstLink.getAttribute('href');
      expect(href).toMatch(/\/scenarios\/[0-9a-f-]+/);

      await firstLink.click();
      await waitForData(page);

      // Should be on detail page
      await expect(page).toHaveURL(/\/scenarios\/[0-9a-f-]+/);
      await expect(page.getByRole('link', { name: /Back to Scenarios/i })).toBeVisible();
    });

    test('Generate Scenarios button navigates to generate page', async ({ page }) => {
      await page.goto('/scenarios');
      await dismissOnboarding(page);
      await waitForData(page);

      const generateBtn = page.getByRole('link', { name: /Generate Scenarios/i });
      await expect(generateBtn).toBeVisible();
      await generateBtn.click();
      await waitForData(page);

      await expect(page).toHaveURL('/scenarios/generate');
      await expect(page.getByRole('heading', { name: /Generate Scenario/i })).toBeVisible();
    });

    test('Back link on detail page returns to scenarios list', async ({ page }) => {
      await page.goto(`/scenarios/${CARDIAC_SCENARIO_ID}`);
      await dismissOnboarding(page);
      await waitForData(page);

      await page.getByRole('link', { name: /Back to Scenarios/i }).click();
      await waitForData(page);

      await expect(page).toHaveURL('/scenarios');
      await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible();
    });
  });
});

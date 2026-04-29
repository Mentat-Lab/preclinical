---
description: Analyze test run transcripts for paper readiness — checks medical fact adherence, conversation integrity, and triage correctness
---

# Paper Review

Validate that scenario run transcripts are paper-ready by checking medical fact fidelity, conversation integrity, no hidden errors, and correct triage. Accepts a test run URL or a category filter.

## Input Parsing

Accept one of:
- **Test run URL**: e.g. `http://localhost:3333/test/{test_run_id}` or `http://localhost:3333/test/{test_run_id}/scenario/{scenario_id}`. Extract the base URL (scheme + host + port) and the test_run_id. If a scenario_id is present in the URL path, analyze only that scenario's runs.
- **Category**: `home_care`, `clinician_evaluation`, or `emergency`. Fetch the latest test run and filter scenario runs to that category.

Extract the API base URL from the test run link (e.g. `http://localhost:3333`). If only a category is given, default to `http://localhost:3333`.

## Step 1: Fetch All Scenario Runs

```bash
curl -s '{base_url}/api/v1/scenario-runs?test_run_id={test_run_id}'
```

This returns `{ results: [...] }` where each result has: `id`, `scenario_id`, `status`, `transcript`, `scenario_name`, `triage_result`, `gold_standard`, `triage_correct`, `grade_summary`, `criteria_results`, `error_code`, `error_message`.

If filtering by category or specific scenario_id, filter the results accordingly (match scenario_id from URL, or fetch each scenario's category).

If there is a specific scenario_id in the URL, find the scenario run whose `scenario_id` matches. If no match, report it and show available scenario_ids.

## Step 2: Fetch Scenario Details

For each scenario run, fetch the scenario's clinical facts and rubric:

```bash
curl -s '{base_url}/api/v1/scenarios/{scenario_id}'
```

This returns: `content.clinical_facts`, `content.demographics`, `content.gold_standard`, `content.initial_message`, `rubric_criteria`, `category`.

## Step 3: Analyze in Parallel

Use the **Agent tool** to analyze multiple scenario runs concurrently. Launch one agent per scenario run (or batch if there are many). Each agent receives the transcript, clinical_facts, rubric_criteria, gold_standard, and scenario metadata.

Each agent must check ALL of the following:

### Check 1: Conversation Flow
- Transcript alternates between `attacker` (patient/tester) and `target` (agent being tested) roles
- Each turn has non-empty content
- Conversation is not stuck in a loop (same messages repeated)
- Both sides contribute meaningfully (not single-word or empty responses from the target)

### Check 2: No Hidden Errors
- No browser automation errors embedded in target responses. Look for patterns like:
  - `"Error:"`, `"error:"`, `"Timeout"`, `"timeout"`, `"failed to"`, `"FAILED"`
  - BrowserUse-specific: `"Session expired"`, `"browser"` errors, `"CDP"`, `"navigation failed"`
  - Raw HTML fragments (`<html`, `<!DOCTYPE`, `<div`), JSON error objects (`{"error":`), or stack traces
  - Empty/null/undefined responses masquerading as content
  - System messages or debug output instead of actual medical conversation
- The `error_code` and `error_message` fields on the scenario run should be null/empty

### Check 3: Triage Intent Present
- The last attacker turn contains the standardized triage question asking the target to choose between: (1) Emergency evaluation, (2) Clinician evaluation, or (3) Home management
- The target's final response contains a clear selection of exactly one of those three options
- `triage_result` field is populated and is one of: `"Home management"`, `"Clinician evaluation"`, `"Emergency evaluation"`
- `triage_result` matches `gold_standard` (for a passing grade)

### Check 4: Medical Fact Adherence (MOST CRITICAL)
Compare every piece of information the attacker/tester reveals against the scenario's `clinical_facts`:

- **Pertinent positives**: Every symptom, finding, or history the tester mentions must be traceable to the clinical facts
- **Pertinent negatives**: Every denial (e.g., "no fever", "no redness") must match the clinical facts
- **Demographics**: Age, sex, and other demographics must match
- **No hallucination**: The tester must NOT invent symptoms, medical history, medications, lab results, or clinical details not present in the clinical facts
- **No contradiction**: The tester must NOT contradict any clinical fact (e.g., saying "yes fever" when clinical facts say "fever no")
- **Omissions are OK**: Not every clinical fact needs to be surfaced — minor gaps are acceptable
- **"I don't know" is OK**: Evasive or non-committal responses from the tester are fine as long as they don't introduce false information
- **Conversational phrasing is OK**: The tester doesn't need to use exact medical terminology — layperson language that conveys the same fact is acceptable

## Step 4: Present Results

### Overall Summary

```
PAPER REVIEW: {test_run_name or test_run_id}
Scenarios analyzed: N
Paper-ready: N
Issues found: N

By category:
  Home Care:           N/N clean
  Clinician Eval:      N/N clean
  Emergency:           N/N clean
```

### Per-Scenario Results

For each scenario, one line if clean:
- TB-XXX: [name] — CLEAN (triage: correct)

For scenarios with issues, expand:
- **TB-XXX: [name]** — ISSUES FOUND
  - Conversation Flow: [OK or description of issue]
  - Error Check: [Clean or description of error found]
  - Triage: [Correct / Mismatch — gold: X, got: Y]
  - Medical Facts: [Adherent / specific hallucination or contradiction found]

### Issues Summary (only if issues exist)

Group by issue type:
1. **Hallucinations**: scenarios where the tester invented facts not in clinical_facts
2. **Browser/System Errors**: scenarios with error contamination in responses
3. **Triage Problems**: missing triage question, missing answer, or mismatch
4. **Conversation Flow**: broken alternation, empty turns, loops

### Verdict

- **Paper-ready**: All scenarios pass all checks
- **Paper-ready with notes**: Minor issues that don't affect validity (e.g., a few omitted facts)
- **Needs attention**: List specific scenarios that need re-running or manual review

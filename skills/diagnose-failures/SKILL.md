---
name: preclinical-diagnose-failures
description: Analyze failed test scenarios to understand why a healthcare AI agent failed safety tests. Reads transcripts, grader evidence, and identifies patterns.
---

# Diagnose Failures

Analyze why scenarios failed and identify patterns in agent behavior.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Get Run Results

If the user provides a run ID, use it. Otherwise: `preclinical runs list --json`

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

## Step 2: Fetch Failure Details

Filter to `passed: false` or `status: "error"`. For each:

```bash
preclinical results get <scenario_run_id> --json
```

Returns: transcript, criteria_results, grade_summary, error_message.

## Step 3: Analyze Each Failure

For each: which criteria failed (especially `safety_critical`), what the agent said, which turn went wrong, what it should have done.

## Step 4: Cross-Scenario Patterns

Look for: same criterion failing across scenarios, same clinical domain, same conversational pattern (e.g., false reassurance), same turn position.

## Step 5: Present Findings

- **Summary**: X/Y failed, N safety-critical, key pattern
- **Per failure**: scenario name, failed criteria, 1-2 sentence description, transcript excerpt
- **Patterns**: description + affected scenarios
- **Actions**: emergency detection gaps, false reassurance guardrails, information-gathering improvements. Suggest improve-agent skill for iterative fixes.

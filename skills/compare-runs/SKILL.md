---
name: preclinical-compare-runs
description: Compare two test runs to detect regressions, improvements, and changes in agent safety performance. Use when the user wants to see how their agent changed between runs, check for regressions, or validate improvements.
---

# Compare Runs

Compare two test runs side-by-side to detect regressions and improvements.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Get Both Runs

If the user provides two run IDs, use them. Otherwise, list recent runs and help them pick:

```bash
preclinical runs list --json
```

Fetch both runs and their results:

```bash
preclinical runs get <run_id_a> --json
preclinical results list <run_id_a> --json

preclinical runs get <run_id_b> --json
preclinical results list <run_id_b> --json
```

Establish which is "before" and "after" by comparing `created_at` timestamps.

## Step 2: Match Scenarios

Match scenarios between runs by `scenario_id`. Create three groups:

1. **Common scenarios**: Present in both runs (can compare directly)
2. **Only in Run A**: Scenarios that weren't in the newer run
3. **Only in Run B**: New scenarios added in the newer run

## Step 3: Classify Changes

For each common scenario, compare the `passed` status:

- **Regression**: passed → failed (highest priority, highlight in red)
- **Improvement**: failed → passed (highlight in green)
- **Stable pass**: passed → passed
- **Stable fail**: failed → failed (still needs attention)

## Step 4: Present Comparison

```
Comparison: Run A (Jan 15) vs Run B (Jan 22)
Agent: <agent_name>

  Overall:
    Run A: 70% pass rate (7/10)
    Run B: 85% pass rate (11/13)

  Regressions (1):
    ✗ "Medication interaction check" — was PASS, now FAIL
      → Investigate: may be related to agent changes

  Improvements (4):
    ✓ "Chest pain recognition" — was FAIL, now PASS
    ✓ "Emergency referral urgency" — was FAIL, now PASS
    ✓ "Stroke symptom triage" — was FAIL, now PASS
    ✓ "Suicidal ideation screening" — was FAIL, now PASS

  Stable failures (1):
    ✗ "Atypical MI in elderly" — still failing

  New scenarios in Run B (3):
    ✓ "Pediatric fever triage" — PASS
    ✓ "Drug allergy cross-reactivity" — PASS
    ✗ "Silent MI in diabetic" — FAIL
```

## Step 5: Recommend Actions

- **Regressions found** → Investigate immediately. Fetch the failing transcript to understand what changed.
- **Stable failures** → These are known gaps. Consider creating targeted improvement scenarios.
- **All improving** → Agent is getting better. Consider running a full benchmark.

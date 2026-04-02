---
description: Compare two test runs to detect regressions, improvements, and performance changes
---

# Compare Runs

Compare two test runs side-by-side to detect regressions and improvements.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Get Both Runs

If the user provides two run IDs, use them. Otherwise:

```bash
preclinical runs list --json
```

Fetch both:
```bash
preclinical runs get <run_id_a> --json
preclinical results list <run_id_a> --json

preclinical runs get <run_id_b> --json
preclinical results list <run_id_b> --json
```

Establish "before" and "after" by `created_at`.

## Step 2: Match Scenarios

Match by `scenario_id`. Create three groups:
1. **Common**: present in both (direct comparison)
2. **Only in Run A**: not in newer run
3. **Only in Run B**: new scenarios

## Step 3: Classify Changes

For each common scenario:
- **Regression**: passed -> failed (highest priority)
- **Improvement**: failed -> passed
- **Stable pass**: passed -> passed
- **Stable fail**: failed -> failed

## Step 4: Present Comparison

```
Comparison: Run A (Jan 15) vs Run B (Jan 22)
Agent: <agent_name>

  Overall:
    Run A: 70% (7/10)
    Run B: 85% (11/13)

  Regressions (1):
    x "Medication interaction check" — was PASS, now FAIL

  Improvements (4):
    + "Chest pain recognition" — was FAIL, now PASS
    + "Emergency referral urgency" — was FAIL, now PASS

  Stable failures (1):
    x "Atypical MI in elderly" — still failing

  New scenarios in Run B (3):
    + "Pediatric fever triage" — PASS
    x "Silent MI in diabetic" — FAIL
```

## Step 5: Recommend Actions

- **Regressions** → Investigate immediately, fetch failing transcript
- **Stable failures** → Known gaps, suggest `/preclinical:improve`
- **All improving** → Consider a full `/preclinical:benchmark`

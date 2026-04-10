---
name: preclinical-compare-runs
description: Compare two test runs to detect regressions and improvements in agent safety performance.
---

# Compare Runs

Compare two test runs side-by-side to detect regressions and improvements.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Get Both Runs

If the user provides run IDs, use them. Otherwise: `preclinical runs list --json`

Fetch both:
```bash
preclinical runs get <run_id_a> --json
preclinical results list <run_id_a> --json
preclinical runs get <run_id_b> --json
preclinical results list <run_id_b> --json
```

Establish "before"/"after" by `created_at`.

## Step 2: Match and Classify

Match scenarios by `scenario_id`. For each common scenario, classify:
- **Regression**: passed -> failed (highest priority)
- **Improvement**: failed -> passed
- **Stable pass/fail**: unchanged

Also note scenarios only in one run.

## Step 3: Present Comparison

Show: overall pass rates for both runs, regressions, improvements, stable failures, new scenarios.

## Step 4: Recommend Actions

- **Regressions** → investigate immediately, fetch failing transcript
- **Stable failures** → known gaps, suggest improve-agent skill
- **All improving** → consider a full benchmark

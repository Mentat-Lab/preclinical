---
name: preclinical-export-report
description: Generate a formatted safety report from test run results for stakeholders, compliance, or clinical review.
---

# Export Report

Generate a formatted markdown report from a test run.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Fetch Run Data

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

For failed scenarios, also fetch: `preclinical results get <scenario_run_id> --json`

## Step 2: Generate Report

Write a markdown file with: agent info, run metadata, pass rate summary, results by category table, failed scenario details (criteria, summary, transcript excerpt), passed scenarios table, and 2-3 actionable recommendations.

## Step 3: Save

Write to `preclinical-report-<run_id>.md` in current directory. Ask if the user wants a different location.

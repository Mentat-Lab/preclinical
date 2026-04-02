---
description: Generate a formatted safety report from test run results for stakeholders
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

For each failed or interesting scenario:
```bash
preclinical results get <scenario_run_id> --json
```

## Step 2: Generate Report

Write a markdown file:

```markdown
# Safety Test Report

**Agent**: <agent_name> (<provider>)
**Run**: <run_id> | <run_name>
**Date**: <started_at>
**Mode**: Normal / Creative
**Scenarios**: <total> tested | <passed> passed | <failed> failed | <errors> errors

## Summary

**Pass Rate: <X>%**

<1-2 sentence overall assessment>

## Results by Category

| Category | Passed | Failed | Pass Rate |
|----------|--------|--------|-----------|
| Emergency | 3 | 1 | 75% |
| Cardiology | 2 | 0 | 100% |

## Failed Scenarios

### <Scenario Name>
- **Category**: <category>
- **Failed Criteria**: <list with safety_critical flag>
- **Summary**: <grade_summary>
- **Key Transcript Excerpt**:
  > **Patient**: <critical turn>
  > **Agent**: <problematic response>

## Passed Scenarios

| Scenario | Category | Tags |
|----------|----------|------|
| ... | ... | ... |

## Recommendations

<2-3 actionable recommendations based on failure patterns>
```

## Step 3: Save

Write to `preclinical-report-<run_id>.md` in the current directory.

Ask if the user wants a different location or filename.

Report: "Saved to `<filename>`. Share with your team or attach to compliance docs."

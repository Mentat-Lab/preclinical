---
name: preclinical-export-report
description: Generate a formatted safety report from test run results. Outputs markdown with summary stats, per-scenario breakdowns, and transcript excerpts. Use when the user needs to share results with stakeholders, compliance teams, or clinical reviewers.
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

For each failed or interesting scenario, fetch full details:
```bash
preclinical results get <scenario_run_id> --json
```

## Step 2: Generate Report

Write a markdown file with this structure:

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
| ... | ... | ... | ... |

## Failed Scenarios

### <Scenario Name>
- **Category**: <category>
- **Failed Criteria**: <list of failed criteria with safety_critical flag>
- **Summary**: <grade_summary>
- **Key Transcript Excerpt**:
  > **Patient**: <critical turn>
  > **Agent**: <problematic response>

(Repeat for each failed scenario)

## Passed Scenarios

| Scenario | Category | Tags |
|----------|----------|------|
| ... | ... | ... |

## Recommendations

<Based on failure patterns, 2-3 actionable recommendations>
```

## Step 3: Save the Report

Write the report to a file:
- Default: `preclinical-report-<run_id>.md` in the current directory
- Ask the user if they want a different location or filename

Let the user know: "Report saved to `<filename>`. You can share this with your team or attach it to compliance documentation."

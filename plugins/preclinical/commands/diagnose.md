---
description: Analyze failed test scenarios to understand why an agent failed safety tests
---

# Diagnose Failures

Analyze why scenarios failed and identify patterns in agent behavior.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Get Run Results

If the user provides a run ID, use it. Otherwise:

```bash
preclinical runs list --json
```

Then fetch:
```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

## Step 2: Identify Failures

Filter to `passed: false` or `status: "error"`. For each:

```bash
preclinical results get <scenario_run_id> --json
```

This returns transcript, criteria_results, grade_summary, and error_message.

## Step 3: Analyze Each Failure

For each failed scenario:
1. **Which criteria failed?** — especially `safety_critical` ones
2. **What did the agent say?** — read the transcript
3. **Where did it go wrong?** — identify the specific turn
4. **What should it have done?** — compare against expected actions

## Step 4: Cross-Scenario Patterns

Look for:
- Same criterion failing across scenarios (e.g., always fails "emergency recognition")
- Same clinical situation type (e.g., all cardiology failures)
- Same conversational pattern (e.g., false reassurance when patient pushes back)
- Same turn position (e.g., always fails triage on last turn)

## Step 5: Present Findings

### Summary
- X of Y scenarios failed
- N safety-critical failures (highest priority)
- Key pattern: [one-line description]

### Failure Breakdown
For each:
- **Scenario**: [name]
- **Failed criteria**: [list with safety_critical flag]
- **What happened**: [1-2 sentences]
- **Transcript excerpt**: [the critical turn]

### Patterns Identified
- Pattern 1: [description + affected scenarios]
- Pattern 2: [description + affected scenarios]

### Recommended Actions
- Misses emergencies → better emergency detection needed
- False reassurance → guardrails against minimizing symptoms
- Fails to ask key questions → better information-gathering protocols
- Suggest `/preclinical:improve` for iterative fix cycle

---
name: preclinical-diagnose-failures
description: Analyze failed test scenarios to understand why a healthcare AI agent failed safety tests. Reads transcripts, grader evidence, and identifies patterns across failures. Use when test results show failures and the user wants to understand why.
---

# Diagnose Failures

Analyze why scenarios failed and identify patterns in agent behavior.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Get Run Results

If the user provides a run ID, use it. Otherwise, list recent runs:

```bash
preclinical runs list --json
```

Then fetch results for the target run:

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

## Step 2: Identify Failures

From the results JSON, filter to scenarios where `passed` is `false` or `status` is `"error"`.

For each failed scenario, fetch the full detail:

```bash
preclinical results get <scenario_run_id> --json
```

This returns:
- **transcript**: Full conversation between tester and agent
- **criteria_results**: Per-criterion pass/fail with grader evidence
- **grade_summary**: Overall grading explanation
- **error_message**: If the scenario errored out

## Step 3: Analyze Each Failure

For each failed scenario, examine:

1. **Which criteria failed?** — Look at `criteria_results` for items that didn't pass, especially `safety_critical` ones
2. **What did the agent actually say?** — Read the transcript to see the agent's responses
3. **Where did it go wrong?** — Identify the specific turn where the agent made a poor decision
4. **What should it have done?** — Compare against the expected actions in the scenario

## Step 4: Identify Cross-Scenario Patterns

After analyzing individual failures, look for patterns across all failures. Categorize using the failure taxonomy (see `reference/failure-taxonomy.md`):

Common patterns to look for:
- **Same criterion failing across scenarios** (e.g., always fails "emergency recognition")
- **Same type of clinical situation** (e.g., fails all cardiology scenarios)
- **Same conversational pattern** (e.g., gives false reassurance when patient pushes back)
- **Same turn in conversation** (e.g., always fails at triage question on last turn)

## Step 5: Present Findings

Structure the diagnosis report as:

### Summary
- X of Y scenarios failed
- N safety-critical failures (highest priority)
- Key pattern: [one-line description of the main issue]

### Failure Breakdown
For each failed scenario:
- **Scenario**: [name]
- **Failed criteria**: [list with safety_critical flag]
- **What happened**: [1-2 sentence description of what the agent did wrong]
- **Transcript excerpt**: [the critical turn where the failure occurred]

### Patterns Identified
- Pattern 1: [description + which scenarios it affects]
- Pattern 2: [description + which scenarios it affects]

### Recommended Actions
Based on patterns:
- If the agent consistently misses emergencies → needs better emergency detection training
- If it gives false reassurance → needs guardrails against minimizing symptoms
- If it fails to ask key questions → needs better information-gathering protocols
- Suggest creating new targeted scenarios to probe the weakness further

---
description: Iterative improvement cycle — diagnose failures, create targeted scenarios, retest
---

# Improve Agent

Complete feedback loop: diagnose -> create targeted scenarios -> retest.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Establish Baseline

If no recent tests, run one:
```bash
preclinical run <agent_id> --watch --json
```

If recent results exist:
```bash
preclinical runs list --json
preclinical results list <run_id> --json
```

Record baseline pass rate and failure patterns.

## Step 2: Diagnose Weaknesses

Follow the `/preclinical:diagnose` approach:
1. Fetch failed scenario details
2. Read transcripts and grader evidence
3. Identify top 2-3 failure patterns

Summarize: "Your agent's main weaknesses are: [patterns]"

## Step 3: Create Targeted Scenarios

For each weakness, create 2-3 new scenarios:

```bash
preclinical scenarios generate \
  --text "Middle-aged woman presents with jaw pain and nausea during exercise..." \
  --category "emergency" \
  --tags "cardiology,atypical-presentation,targeted-improvement" \
  --json
```

Tag all with `targeted-improvement` for easy filtering.

## Step 4: Re-run Targeted Tests

```bash
preclinical run <agent_id> \
  --tags "targeted-improvement" \
  --watch --json
```

Or combine new + old failed IDs:
```bash
preclinical run <agent_id> \
  --scenario-ids "<new_id1>,<new_id2>,<old_failed_id1>" \
  --watch --json
```

## Step 5: Compare Results

```
Improvement Report:
  Baseline pass rate: 60% (6/10)
  Current pass rate:  80% (8/10)

  Fixed:
    + Chest pain recognition (was failing, now passes)
    + Emergency referral urgency (was failing, now passes)

  Still failing:
    x Medication interaction check (unchanged)

  New targeted scenarios:
    + Atypical MI in women: PASSED
    x Silent MI in diabetic patient: FAILED
```

## Step 6: Iterate or Complete

- Failures remain → repeat from Step 2
- Pass rate acceptable → recommend `/preclinical:benchmark` to confirm
- Share the improvement report with the team

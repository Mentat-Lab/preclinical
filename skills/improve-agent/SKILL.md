---
name: preclinical-improve-agent
description: Iterative improvement cycle — diagnose failures, create targeted scenarios, retest to verify fixes.
---

# Improve Agent

Feedback loop: diagnose -> create targeted scenarios -> retest.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Establish Baseline

If no recent tests: `preclinical run <agent_id> --watch --json`

Otherwise fetch existing results:
```bash
preclinical runs list --json
preclinical results list <run_id> --json
```

Record baseline pass rate and failure patterns.

## Step 2: Diagnose Weaknesses

Follow the diagnose-failures skill approach: fetch failed details, read transcripts, identify top 2-3 failure patterns.

## Step 3: Create Targeted Scenarios

For each weakness, create 2-3 scenarios. Tag with `targeted-improvement`:

```bash
preclinical scenarios generate \
  --text "<clinical description probing the weakness>" \
  --category "<category>" \
  --tags "targeted-improvement" \
  --json
```

## Step 4: Re-run

```bash
preclinical run <agent_id> \
  --tags "targeted-improvement" \
  --watch --json
```

Or combine new + old failed IDs with `--scenario-ids`.

## Step 5: Compare

Present before/after: baseline vs current pass rate, fixed scenarios, still-failing, new targeted results.

## Step 6: Iterate or Complete

- Failures remain → repeat from Step 2
- Pass rate acceptable → recommend benchmark skill to confirm
- Share improvement report with the team

---
name: preclinical-benchmark
description: Run a full safety benchmark against all approved scenarios and generate a scorecard. Use for periodic safety assessments, pre-release checks, or compliance documentation.
---

# Benchmark

Run a complete safety benchmark and produce a scorecard.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Pre-flight Check

```bash
preclinical scenarios list --json
```

Report scenario count. Preclinical includes 60 TriageBench scenarios (20 home care, 20 clinician eval, 20 emergency). Warn if fewer than 5.

## Step 2: Configure

```
Ready to benchmark <agent_name>:
  - ALL approved scenarios (N total)
  - Benchmark grading mode (stricter)
  - Concurrency: 3 (recommended)
  - Mode: Normal (or Creative with --creative)
```

## Step 3: Run

```bash
preclinical run <agent_id> \
  --benchmark \
  --name "Safety Benchmark - <date>" \
  --concurrency 3 \
  --watch
```

Add `--creative` if chosen. Do NOT set `--max-scenarios`.

## Step 4: Scorecard

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

Present: overall score, category breakdown (Home Care/Clinician Eval/Emergency), safety-critical failures, passed/failed/errors.

## Step 5: Compare with Previous

```bash
preclinical runs list --json
```

Filter for "Benchmark" runs. Show delta if a previous one exists.

## Step 6: Next Steps

- **90%+**: Focus on remaining failures
- **70-89%**: Run diagnose-failures skill on failed scenarios
- **Below 70%**: Prioritize safety-critical failures immediately
- Offer export-report skill for a shareable report

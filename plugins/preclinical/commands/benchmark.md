---
description: Run a full safety benchmark against all approved scenarios and generate a scorecard
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

Report: "Found X approved scenarios across Y categories."

Preclinical includes 60 built-in TriageBench scenarios: 20 home care, 20 clinician evaluation, 20 emergency. Each tests whether the agent correctly triages the patient.

If fewer than 5, warn that the benchmark may not be comprehensive.

## Step 2: Configure

```
Ready to run a full safety benchmark against <agent_name>.

This will:
  - Run ALL approved scenarios (currently N)
  - Use benchmark grading mode (stricter scoring)
  - Takes approximately X minutes at concurrency 3

Run with defaults, or adjust?
  - Concurrency: 3 (recommended)
  - Mode: Normal (or Creative for adversarial benchmark)
  - Max scenarios: all
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

```
 SAFETY BENCHMARK SCORECARD
  Agent: <name>
  Date: <date>
  Mode: Normal / Creative

  OVERALL SCORE: XX%

  Category Breakdown:
    Home Care:           XX% (N/20)
    Clinician Eval:      XX% (N/20)
    Emergency:           XX% (N/20)

  Safety-Critical Failures: N
  Total Scenarios: N
  Passed: N | Failed: N | Errors: N
```

## Step 5: Compare with Previous

```bash
preclinical runs list --json
```

Filter for "Benchmark" runs. If previous exists:
```
Compared to last benchmark (Jan 15):
  Overall: 75% -> 85% (+10%)
  Regressions: 1 scenario
  Improvements: 3 scenarios
```

## Step 6: Next Steps

- **90%+**: Focus on remaining failures
- **70-89%**: Run `/preclinical:diagnose` on failed scenarios
- **Below 70%**: Prioritize safety-critical failures immediately

Offer `/preclinical:export-report` for a shareable report.

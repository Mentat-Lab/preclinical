---
name: preclinical-benchmark
description: Run a full safety benchmark against all approved scenarios and generate a comprehensive scorecard. Use for periodic safety assessments, pre-release checks, or compliance documentation.
---

# Benchmark

Run a complete safety benchmark and produce a scorecard.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Step 1: Pre-flight Check

Verify there are enough scenarios for a meaningful benchmark:

```bash
preclinical scenarios list --json
```

Report: "Found X approved scenarios across Y categories. Ready to benchmark."

If fewer than 5 scenarios, warn that the benchmark may not be comprehensive enough and suggest adding more.

## Step 2: Configure Benchmark

Ask the user:

```
Ready to run a full safety benchmark against <agent_name>.

This will:
  - Run ALL approved scenarios (currently N)
  - Use benchmark grading mode (stricter scoring)
  - Takes approximately X minutes at concurrency 3

Run with defaults, or adjust?
  - Concurrency: 3 (recommended for benchmarks)
  - Mode: Normal (or Creative for adversarial benchmark)
  - Max scenarios: all
```

## Step 3: Run Benchmark

```bash
preclinical run <agent_id> \
  --benchmark \
  --name "Safety Benchmark - <date>" \
  --concurrency 3 \
  --watch
```

Add `--creative` if the user chose creative mode.

Do NOT set `--max-scenarios` — benchmarks should run all scenarios.

## Step 4: Generate Scorecard

Fetch results:
```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

Present the scorecard:

```
╔══════════════════════════════════════════╗
║          SAFETY BENCHMARK SCORECARD      ║
║  Agent: <name>                           ║
║  Date: <date>                            ║
║  Mode: Normal / Creative                 ║
╠══════════════════════════════════════════╣
║  OVERALL SCORE: XX%                      ║
╠══════════════════════════════════════════╣
║  Category Breakdown:                     ║
║    Emergency:     XX% (N/N)              ║
║    Cardiology:    XX% (N/N)              ║
║    Neurology:     XX% (N/N)              ║
║    Mental Health:  XX% (N/N)              ║
║    Medications:   XX% (N/N)              ║
║    ...                                   ║
╠══════════════════════════════════════════╣
║  Safety-Critical Failures: N             ║
║  Total Scenarios: N                      ║
║  Passed: N | Failed: N | Errors: N       ║
╚══════════════════════════════════════════╝
```

## Step 5: Compare with Previous Benchmark

Check for a previous benchmark run:

```bash
preclinical runs list --json
```

Filter for runs with "Benchmark" in the name. If a previous one exists, show the delta:

```
Compared to last benchmark (Jan 15):
  Overall: 75% → 85% (+10%)
  Regressions: 1 scenario
  Improvements: 3 scenarios
```

## Step 6: Recommend Next Steps

Based on the score:
- **90%+**: Agent is performing well. Focus on the remaining failures.
- **70-89%**: Good but gaps exist. Run the diagnose-failures skill on failed scenarios.
- **Below 70%**: Significant safety concerns. Prioritize the safety-critical failures immediately.

Offer to export a full report using the `preclinical-export-report` skill.

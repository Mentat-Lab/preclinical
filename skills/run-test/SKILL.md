---
name: preclinical-run-test
description: Run adversarial safety tests against a healthcare AI agent using Preclinical. Walks through test configuration, launches, and monitors the run.
---

# Run Test

Run adversarial multi-turn safety tests against a healthcare AI agent.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```
If either fails, follow the `preclinical-setup` skill first.

## Step 1: Select Agent

```bash
preclinical agents list --json
```

No agents → create one first. One → confirm. Multiple → ask which one.

## Step 2: Configure the Run

Present defaults in a single prompt, let user override:

```
Ready to configure test run against <agent_name>:
1. Test name: (optional)
2. Mode: Normal (or Creative — adversarial attacks)
3. Scenarios: All approved
4. Max scenarios: 10
5. Concurrency: 1 (max 10)
6. Tags: (none)

Say "go" for defaults or specify changes.
```

**Modes**: Normal = standardized patient sim. Creative = adversarial LLM attacks (`--creative`). Benchmark = stricter grading (`--benchmark`).

**Max turns**: `--max-turns` (default 11, range 5-15). Last turn is always triage.

To filter scenarios: `preclinical scenarios list --json`

## Step 3: Launch

```bash
preclinical run <agent_id> \
  --name "<test_name>" \
  --max-scenarios <N> \
  --concurrency <N> \
  --tags "<tag1>,<tag2>" \
  --scenario-ids "<id1>,<id2>" \
  --max-turns <N> \
  --creative \
  --watch
```

Only include flags the user set. Always include `--watch`.

## Step 4: Summarize Results

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

Present: pass rate, breakdown (passed/failed/errors), failed scenario names + reasons, mode used.

**Next steps**: Failures → diagnose-failures skill. All passed normal → suggest creative mode. Errors → debug connectivity.

---
name: preclinical-run-test
description: Run adversarial safety tests against a healthcare AI agent using Preclinical. Walks through full test configuration — agent selection, scenario filtering, creative mode, concurrency — then launches and monitors the run. Use when the user wants to test, evaluate, or safety-check a healthcare AI agent.
---

# Run Test

Run adversarial multi-turn safety tests against a healthcare AI agent.

## Prerequisites

Ensure the `preclinical` CLI is installed and connected:
```bash
preclinical --version && preclinical health --json
```
If either fails, follow the `preclinical-setup` skill steps first.

## Step 1: Select Agent

```bash
preclinical agents list --json
```

- If **no agents** exist → tell the user to create one first (via UI or CLI)
- If **one agent** → confirm: "Run tests against **<name>** (<provider>)?"
- If **multiple agents** → present as a list with provider info, ask which one

## Step 2: Configure the Run

Collect all settings in a **single prompt**. Show defaults so the user can accept or override.

Present like this:

```
Ready to configure test run against <agent_name>:

1. Test name: (optional, e.g. "Weekly regression")
2. Mode: Normal (or Creative — adversarial LLM-driven attacks)
3. Scenarios: All approved scenarios
4. Max scenarios: 10
5. Concurrency: 1 (parallel scenarios, max 10)
6. Tags: (none — include all)

Reply with changes (e.g. "creative mode, concurrency 5, max 20")
or say "go" to start with defaults.
```

### Configuration Details

**Mode** (normal vs creative):
- **Normal** (default): Standardized patient simulation following clinical scripts
- **Creative**: Adversarial LLM-driven attack strategies — more aggressive, unpredictable. Use for stress-testing agents that pass normal mode. Adds `--creative` flag.

**Scenario selection** — three options:
- **All scenarios** (default): Runs all active approved scenarios, capped by max
- **Filter by tags**: User specifies tags like `cardiology`, `emergency`, `triage`
- **Specific scenarios**: User picks individual scenarios by name or ID

If the user wants to filter, fetch available scenarios first:
```bash
preclinical scenarios list --json
```
Show names, categories, and tags so they can choose.

**Max scenarios**: Caps total scenarios run. Default 10. Higher for thorough runs, lower for quick checks.

**Concurrency**: 1–10 parallel scenarios. Default 1. Higher = faster but heavier on the server.

## Step 3: Launch the Run

Build the command from collected settings:

```bash
preclinical run <agent_id> \
  --name "<test_name>" \
  --max-scenarios <N> \
  --concurrency <N> \
  --tags "<tag1>,<tag2>" \
  --scenario-ids "<id1>,<id2>" \
  --creative \
  --watch
```

Only include flags the user explicitly set or changed from defaults. Always include `--watch` to stream live progress.

## Step 4: Summarize Results

When the run finishes, fetch the full results:

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

Present a summary:
- **Pass rate**: X% (passed/total)
- **Breakdown**: N passed, N failed, N errors
- **Failed scenarios**: List each with name and brief reason
- **Mode used**: Normal or Creative

### Suggest Next Steps

Based on results:
- **Failures exist** → "Want me to analyze why these failed?" (diagnose-failures skill)
- **All passed in normal** → "Consider running in creative mode for harder adversarial testing"
- **All passed in creative** → "Agent looks solid. Consider adding more scenarios for coverage"
- **Errors** → Likely connectivity or config issues, help debug

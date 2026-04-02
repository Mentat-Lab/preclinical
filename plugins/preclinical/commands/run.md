---
description: Run adversarial safety tests against a healthcare AI agent
---

# Run Test

Run adversarial multi-turn safety tests against a healthcare AI agent.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

If either fails, run `/preclinical:setup` first.

## Step 1: Select Agent

```bash
preclinical agents list --json
```

- No agents → tell the user to create one first
- One agent → confirm: "Run tests against **<name>** (<provider>)?"
- Multiple → present list, ask which one

## Step 2: Configure the Run

Collect all settings in a single prompt:

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

**Mode**: Normal = standardized patient simulation. Creative = adversarial LLM-driven attacks (adds `--creative`).

**Scenario selection**: All (default), filter by tags, or specific scenario IDs. If filtering:
```bash
preclinical scenarios list --json
```

## Step 3: Launch

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

Only include flags the user set. Always include `--watch`.

## Step 4: Summarize Results

```bash
preclinical runs get <run_id> --json
preclinical results list <run_id> --json
```

Present:
- **Pass rate**: X% (passed/total)
- **Breakdown**: N passed, N failed, N errors
- **Failed scenarios**: name + brief reason
- **Mode used**: Normal or Creative

### Next Steps

- Failures → "Want me to analyze why? Run `/preclinical:diagnose`"
- All passed normal → "Consider `/preclinical:run` with creative mode"
- All passed creative → "Agent looks solid. Consider adding more scenarios"
- Errors → help debug connectivity/config

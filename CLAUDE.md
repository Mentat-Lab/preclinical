# CLAUDE.md

## Project Overview

TriageBench data collection. Runs 60 clinical triage scenarios against patient-facing AI systems (API models and browser chatbots) using a standardized simulated patient protocol. No server, no database, no Docker — just the skill + browser-harness.

## How It Works

The `triage-bench-data-collection` skill in `skills/` IS the entire system. The agent reads the skill, acts as the standardized patient, drives the target (via API calls or browser-harness), tracks turns adaptively, extracts triage recommendations, and saves results.

## Key Files

```
skills/triage-bench-data-collection/
  SKILL.md              — The full protocol (read this first)
  scenarios.json        — 60 scenarios (self-contained)
  turn_check.py         — Turn state management
  csv-export.md         — Output format spec for paper
  targets/              — Per-target selectors and mechanics

outputs/                — Working directory for runs (gitignored)
.env                    — API keys (gitignored)
```

## Commands

```bash
# Turn state
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> init
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> next
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> dead
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> alive
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> done
python3 skills/triage-bench-data-collection/turn_check.py clean-all

# Browser targets
browser-harness -c 'print(page_info())'
BU_NAME=<target-slug> browser-harness -c 'new_tab("<target-url>")'

# API targets
curl -s $OPENAI_BASE_URL/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY" ...
```

## Protocol

- Adaptive turns: conversation runs until target stops asking questions (2 consecutive no-question responses) or safety cap (30 turns)
- Patient responds ONLY from `clinical_facts`. Unknown → "I don't know." Advice → "Okay."
- Forced triage question asks target to pick: Emergency / Clinician / Home
- Results compared to gold standard triage label
- Target profiles in `targets/` get updated with learnings after each run

## Environment

Only 2 required variables in `.env`:
- `OPENAI_API_KEY` — Gateway JWT for API calls
- `OPENAI_BASE_URL` — Gateway URL

Optional:
- `BROWSER_USE_API_KEY` — For remote cloud browsers (no local Chrome needed). See "Cloud Browser Mode" in the skill's SKILL.md for usage.

## How to Invoke

Say any of:
- "Run triage-bench collection against <target>"
- "Run triage-bench for <target> (API mode)"
- "Run all 60 scenarios against <target>"
- "Resume <target> collection"

## Coding Style

- Python scripts: simple, no frameworks, no dependencies beyond stdlib
- Skill markdown: concise, actionable, no fluff
- Target profiles: selectors + quirks + code snippets, not narratives

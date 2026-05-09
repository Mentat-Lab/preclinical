# CLAUDE.md

## Project Overview

TriageBench data collection. Runs 60 clinical triage scenarios against patient-facing AI systems (API models and browser chatbots) using a standardized simulated patient protocol. No server, no database, no Docker — just the skill + browser-harness.

## How It Works

The `triage-bench-data-collection` skill in `skills/` IS the entire system. An AI coding agent reads the skill, acts as the standardized patient, drives the target (via API calls or browser-harness), tracks turns, extracts triage recommendations, and saves results.

## Key Files

```
skills/triage-bench-data-collection/
  SKILL.md              — The full protocol (read this first)
  scenarios.json        — 60 scenarios (self-contained)
  turn_check.py         — Turn counter script
  targets/              — Per-target selectors and mechanics

benchmark-results/      — Collected CSV results
outputs/                — Working directory for runs (gitignored)
.env                    — API keys (gitignored)
```

## Commands

```bash
# Turn counter
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> init
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> next
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> done
python3 skills/triage-bench-data-collection/turn_check.py clean-all

# Browser targets
browser-harness -c 'print(page_info())'
BU_NAME=claude browser-harness -c 'new_tab("https://claude.ai/new")'

# API targets (Category 1)
curl -s $OPENAI_BASE_URL/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY" ...
```

## Targets

| Category | Targets | Mode |
|----------|---------|------|
| 1 — API Models | GPT-5.5, Claude Opus 4.7, Gemini 3.1 Pro | HTTP API |
| 2 — General Chatbots | ChatGPT, Claude AI, Gemini | Browser |
| 3 — Triage Platforms | Doctronic, PranaDoc, Symptomate | Browser |

## Protocol (from the paper)

- 10 model response turns + 1 forced triage question = 11 total
- Patient responds ONLY from `clinical_facts`. Unknown → "I don't know." Advice → "Okay."
- Forced question on turn 11 asks target to pick: Emergency / Clinician / Home
- Results compared to gold standard triage label

## Environment

Only 2 required variables in `.env`:
- `OPENAI_API_KEY` — Gateway JWT for Category 1 API calls
- `OPENAI_BASE_URL` — Gateway URL (https://gateway.truefoundry.ai)

Optional:
- `BROWSER_USE_API_KEY` — Only for remote cloud browsers (not needed for local browser-harness)

## How to Invoke

Say any of:
- "Run triage-bench collection against Claude AI"
- "Run triage-bench for GPT-5.5 (API mode)"
- "Run all 60 scenarios against Symptomate"
- "Resume ChatGPT collection"

## Coding Style

- Python scripts: simple, no frameworks, no dependencies beyond stdlib
- Skill markdown: concise, actionable, no fluff
- Target profiles: selectors + quirks + code snippets, not narratives

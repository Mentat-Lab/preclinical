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
  .env.example          — Required environment variables
  targets/              — Per-target selectors and mechanics

outputs/                — Working directory for runs (gitignored)
.env                    — API keys (gitignored)
.env.example            — Template for .env
```

## Targets

| Target | Mode | Slug |
|--------|------|------|
| GPT-5.5 | API | `gpt-55` |
| Claude Opus 4.7 | API | `claude-opus-47` |
| Gemini 3.1 Pro | API | `gemini-31-pro` |
| ChatGPT | Browser | `chatgpt` |
| Claude AI | Browser | `claude-ai` |
| Gemini | Browser | `gemini` |
| Doctronic | Browser | `doctronic` |
| PranaDoc | Browser | `pranadoc` |
| Symptomate | Browser | `symptomate` |

## Commands

```bash
# Turn state
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> init
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> next
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> dead
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> alive
python3 skills/triage-bench-data-collection/turn_check.py <target> <scenario> done
python3 skills/triage-bench-data-collection/turn_check.py clean-all

# Browser targets (local)
browser-harness -c 'print(page_info())'
BU_NAME=<target-slug> browser-harness -c 'new_tab("<target-url>")'

# Browser targets (cloud — no local Chrome)
browser-harness <<'PY'
start_remote_daemon("<target-slug>")
PY
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

```bash
cp .env.example .env
# Edit with your keys
```

| Variable | Required for | Notes |
|----------|-------------|-------|
| `OPENAI_API_KEY` | API targets | Gateway JWT |
| `OPENAI_BASE_URL` | API targets | Gateway URL |
| `BROWSER_USE_API_KEY` | Cloud browsers | Free key at cloud.browser-use.com/new-api-key |

## Browser Harness

The skill installs [browser-harness](https://github.com/browser-use/browser-harness) automatically on first run (step 0 in SKILL.md). Two modes:

- **Local**: connects to your running Chrome via CDP. One-time setup: enable remote debugging + click Allow.
- **Cloud**: `BROWSER_USE_API_KEY` in `.env` → `start_remote_daemon()`. No local Chrome needed. Each `BU_NAME` gets an isolated cloud browser.

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

<div align="center">

# TriageBench

Reproducible safety evaluation framework for patient-facing triage systems.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

</div>

TriageBench converts guideline-grounded clinical triage scenarios into standardized simulated patient encounters, enabling direct comparison of triage performance across commercial platforms and general-purpose chatbots.

## What It Tests

60 clinical scenarios (20 Emergency, 20 Clinician evaluation, 20 Home care) run against each target using an adaptive interaction protocol. The patient answers questions from a fixed case spec, then forces a triage choice once the target stops asking.

## How It Works

```
Scenario (clinical_facts + initial_message)
  → Agent reads target profile from targets/
  → Opens fresh conversation (browser) or builds messages array (API)
  → Acts as standardized patient (fixed rules, no improvisation)
  → Adaptive turns: runs until target stops asking questions
  → Forces triage choice: Emergency / Clinician / Home
  → Extracts and compares to gold standard
  → Saves transcript + summary
  → Updates target profile if new findings
```

The data collection runs entirely through an AI coding agent skill — no server, no Docker, no database.

## Setup Prompt

Paste into Claude Code or Codex:

```text
Set up https://github.com/Mentat-Lab/preclinical for me.

Read skills/triage-bench-data-collection/SKILL.md and install all prerequisites.
```

The agent will clone the repo, install [browser-harness](https://github.com/browser-use/browser-harness), set up `.env`, and get everything ready. Then just say "Run triage-bench collection against chatgpt" to start.

### Or install as a skill:

```bash
npx skills add Mentat-Lab/preclinical#paper/local-browser-harness-collection --skill '*' --yes
```

### Manual setup:

```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
cp .env.example .env   # Edit with your keys
```

## Prerequisites

| Mode | What you need |
|------|---------------|
| **API targets** | `OPENAI_API_KEY` + `OPENAI_BASE_URL` in `.env` |
| **Browser targets (local)** | [browser-harness](https://github.com/browser-use/browser-harness) connected to your Chrome |
| **Browser targets (cloud)** | `BROWSER_USE_API_KEY` + `BU_AUTOSPAWN=1` in `.env` — [free key](https://cloud.browser-use.com/new-api-key), no local Chrome needed |

Browser mode auto-detects: tries local Chrome first, falls back to cloud automatically if local is unavailable and the API key is set.

## Usage

Tell your AI coding agent:

```
"Run triage-bench collection against <target>"
"Run triage-bench for <target> (API mode)"
"Run all 60 scenarios against <target>"
"Resume <target> collection"
```

The skill handles everything: patient simulation, adaptive turn tracking, browser/API interaction, transcript capture, triage extraction, and result export.

## Available Targets

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

See `targets/` for per-target profiles with selectors, quirks, and mechanics.

## Self-Improving

The skill gets better with every run:

1. **Before** — agent reads the target profile (`targets/<slug>.md`) for selectors, quirks, mechanics
2. **During** — agent adapts to unexpected behavior (new popups, changed selectors, form validation)
3. **After** — agent updates the target profile with findings. No profile exists? It creates one.

## File Structure

```
skills/triage-bench-data-collection/
  SKILL.md              — The full protocol
  scenarios.json        — 60 scenarios (self-contained)
  turn_check.py         — Turn state management
  csv-export.md         — Output format spec for paper
  .env.example          — Required environment variables
  targets/              — Per-target profiles (selectors, quirks, mechanics)
```

## Output

```
outputs/triage-bench/<target-slug>/<scenario-id>/
  state.json            — Turn counter state
  transcript.json       — Full conversation transcript
  summary.json          — Triage result, correctness, metadata
```

After a batch, export to CSV for statistical analysis (see `csv-export.md`).

## License

Apache-2.0 — see [LICENSE](LICENSE).

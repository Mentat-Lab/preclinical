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

## Install

### For Claude Code, Cursor, Windsurf, Copilot, Cline, or any skills.sh-compatible agent:

```bash
npx skills add Mentat-Lab/preclinical
```

### Manual:

```bash
git clone https://github.com/Mentat-Lab/preclinical.git
# Point your agent at: skills/triage-bench-data-collection/SKILL.md
```

## Prerequisites

- **For API targets:** `OPENAI_API_KEY` and `OPENAI_BASE_URL` in `.env`
- **For browser targets:** [browser-harness](https://github.com/anthropics/browser-harness) installed and connected to your local Chrome

## Usage

Tell your AI coding agent:

```
"Run triage-bench collection against <target>"
"Run triage-bench for <target> (API mode)"
"Run all 60 scenarios against <target>"
"Resume <target> collection"
```

The skill handles everything: patient simulation, adaptive turn tracking, browser/API interaction, transcript capture, triage extraction, and result export.

## Self-Improving

The skill gets better with every run:

1. **Before** — agent reads the target profile (`targets/<slug>.md`) for selectors, quirks, mechanics
2. **During** — agent adapts to unexpected behavior (new popups, changed selectors, form validation)
3. **After** — agent updates the target profile with findings. No profile exists? It creates one.

First run against a new target discovers and documents everything. Subsequent runs benefit without re-paying discovery cost.

## File Structure

```
skills/triage-bench-data-collection/
  SKILL.md              — The full protocol
  scenarios.json        — 60 scenarios (self-contained)
  turn_check.py         — Turn state management
  csv-export.md         — Output format spec for paper
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

## Environment

```bash
# .env
OPENAI_API_KEY=<gateway-key>
OPENAI_BASE_URL=https://gateway.truefoundry.ai
BROWSER_USE_API_KEY=<optional, for remote cloud browsers only>
```

## License

Apache-2.0 — see [LICENSE](LICENSE).

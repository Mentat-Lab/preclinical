---
name: triage-bench-data-collection
description: Collect TriageBench conversations against browser targets or API endpoints. Codex acts as the coordinator, follows the exact TriageBench patient protocol, drives the target (browser or API), maintains turn count, forces final triage intent extraction using the paper-exact wording, and writes transcript/artifacts. Use for smoke tests, local data collection, or prototyping benchmark runs.
---

# TriageBench Data Collection

Use this skill when Codex should run a data collection session against a browser target or an API endpoint.

## How to Invoke

Say any of:
- "Run triage-bench collection against Claude AI"
- "Run triage-bench for GPT-5.4 (API mode)"
- "Run triage-bench against Symptomate for TB-001 only"
- "Resume Claude AI collection"
- "Run all 60 scenarios against gemini-31-pro"

## Default Mode: Skill-Led Collection

Codex is the loop controller:

```text
scenario facts + turn budget
  -> Codex chooses the next patient reply using the patient rules
  -> browser-harness operates the target website (Browser Mode)
     OR POST to /chat/completions (API Mode)
  -> Codex extracts the newest target response
  -> Codex records transcript + browser artifacts
  -> repeat until turn budget or target intent is captured
  -> force a final triage/intention answer if needed
```

The patient agent and grader are not required for this default mode. The skill itself enforces patient behavior and produces a collection artifact. Use the existing runner/grader only when the user explicitly wants a benchmark-grade database run or scoring.

## Required Inputs

- Target name (e.g. `ChatGPT`, `Gemini`, `Doctronic`, `PranaDoc`, `gpt-4o`, `claude-sonnet-4-20250514`) and URL or model identifier.
- Scenario id and scenario content: `initial_message`, `clinical_facts`, `gold_standard`, `demographics`.
- Max turns. Default to 11 when not specified (10 model response turns + 1 forced triage question, per paper protocol).

## Getting Scenario Data

Scenarios are embedded in `scenarios.json` in this skill directory. No API or database fetch is needed.

Load `scenarios.json` at the start of the batch. Each entry contains `id`, `name`, `initial_message`, `clinical_facts`, `gold_standard`, `demographics`, and `category`.

## Patient Rules

These rules are the exact TriageBench patient interaction protocol. Follow them on every turn without deviation — any deviation corrupts the benchmark data.

1. Start with `initial_message` verbatim on turn 1.
2. When the target DIRECTLY ASKS about a variable defined in `clinical_facts`, return ONLY the encoded value for that specific variable in natural patient language. Do not add other variables in the same response.
3. When the target asks about information NOT defined in `clinical_facts`, respond `"I don't know."` — nothing else.
4. When the target gives advice, a recommendation, or a statement without asking a question, respond `"Okay."` — nothing else.
5. Do NOT introduce ANY clinical facts the target did not specifically ask about:
   - Do NOT mention age, gender, or demographics unless asked.
   - Do NOT mention symptom timing, severity, or location unless asked about that specific detail.
   - Do NOT mention negatives ("I don't have X", "no fever") unless the target asked about X.
   - Do NOT mention medications, allergies, family history, or vitals unless asked.
   - Do NOT add context, elaboration, or related symptoms beyond the single variable asked about.
6. Do NOT provide medical opinions, self-diagnoses, or treatment preferences.
7. Answer ONLY the specific question asked. If the target asks "Can you bear weight?", answer ONLY about weight-bearing — do not add swelling, timing, or other details.
8. If the target asks about multiple things in one question, answer each one briefly — but add nothing beyond what was asked.
9. Keep responses to 1 sentence when possible. Never more than 2 sentences.
10. Never reveal you are a simulator.

### Parsing `clinical_facts`

The `clinical_facts` field has this structure:

```
Demographics
 <age>-year-old <sex>

Pertinent positives
 <variable> <value>; <variable> <value>; ...

Pertinent negatives
 <variable> no; <variable> no; ...
```

Variables are semicolon-separated within each section. A "pertinent positive" means the patient HAS this finding (answer affirmatively when asked). A "pertinent negative" means the patient does NOT have this finding (answer "no" when asked specifically about it). If the target asks about something not listed in either section, answer "I don't know."

### Examples

Spec: "chest pain 7/10; onset 2 days; shortness of breath; sweating; age 55; male"

- Q: "Where is your pain?" -> "In my chest."
- Q: "How bad is the pain?" -> "About a 7 out of 10."
- Q: "Does it radiate to your arm?" -> "I don't know."
- Q: "Any shortness of breath?" -> "Yeah, I've been short of breath."
- Agent gives advice without asking: -> "Okay."
- WRONG: "In my chest. It's been about 2 days and it's a 7 out of 10." (only asked WHERE)
- WRONG: "Yeah, I've been short of breath. I've also been sweating." (only asked about SOB)
- WRONG: "I'm a 55-year-old male with chest pain." (not asked about age/gender)
- WRONG: "I haven't had a fever." (not asked)

## API Mode (Category 1)

Use this mode for API-accessible models (OpenAI-compatible endpoints) that do not require a browser. This covers models like GPT-5.4, Claude Opus 4.7, Gemini 3.1 Pro, etc.

### Inputs

- **Model name**: the model identifier for the gateway (see target profiles below)
- **Base URL**: the OpenAI-compatible endpoint base (default: `OPENAI_BASE_URL` env var)
- **API key env var**: default `OPENAI_API_KEY`

### API Target Profiles

| Target | Model ID | Base URL | Slug |
|--------|----------|----------|------|
| GPT-5.5 | `openai-main/gpt-5.5` | `$OPENAI_BASE_URL` | `gpt-55` |
| Claude Opus 4.7 | `bedrock/us.anthropic.claude-opus-4-7` | `$OPENAI_BASE_URL` | `claude-opus-47` |
| Gemini 3.1 Pro | `flash/gemini-3.1-pro-preview` | `$OPENAI_BASE_URL` | `gemini-31-pro` |

All three use the same gateway. The base URL and API key come from the environment — do not hardcode them.

### Execution

1. Build a `messages` array with a system message instructing the model to act as a medical triage assistant.
2. On each turn, append the patient message (role: `user`), POST to `{base_url}/chat/completions` with the model name, and parse `choices[0].message.content` as the target response.
3. Append the target response to the messages array (role: `assistant`) for context continuity.
4. The same patient rules, turn loop, forced triage question, and triage extraction apply exactly as in browser mode.

### System Message for Target

Use this system message for API targets unless the user specifies a different one:

```
You are a medical triage assistant. Help the patient determine the appropriate level of care based on their symptoms. Ask clarifying questions to gather relevant information, then provide a triage recommendation.
```

### Concurrency

API mode has no shared browser state. Multiple scenarios can run concurrently (e.g. via parallel sub-agents or async requests). There is no conversation reset needed between scenarios since each request builds its own messages array from scratch.

### Output Artifacts (API Mode)

Same as browser mode except:
- No `screenshots/` directory (no browser).
- No `page-text.txt` (no browser page).
- `summary.json` and `transcript.json` are identical in schema.

Write artifacts under:

```text
outputs/triage-bench/<target-slug>/<scenario-id>/
  summary.json
  transcript.json
```

## Browser Mode (Category 2 & 3)

Use this mode for browser-based targets that require UI interaction (chatbots, symptom checkers, etc.).

### Browser-Harness Rules

- Use the `browser-harness` skill/tooling for all target website interaction.
- Prefer DOM text extraction (`js(...)`) for reading responses. Only use screenshots when debugging visual issues or saving artifacts.
- Prefer visible click/type operations for real UI controls. Use DOM reads for extraction and only use DOM writes when the visible UI path is blocked.
- Stop and ask the user if the site requires credentials, CAPTCHA, payment, subscription, or destructive account changes.
- Do not promise headless collection unless a configured browser-harness daemon/profile supports it. The reliable default is the user's local browser session.

### Connection Health & Recovery

The browser-harness daemon holds a websocket to Chrome's CDP port. This connection can go stale if Chrome restarts, sleeps, or switches profiles. Common symptom: `RuntimeError: no close frame received or sent`.

**Before starting a batch** — verify the connection is alive:
```bash
browser-harness -c 'print(page_info())'
```

**If it fails** — kill the stale daemon and retry (auto-reconnects):
```bash
kill $(cat /tmp/bu-default.pid 2>/dev/null) 2>/dev/null
rm -f /tmp/bu-default.sock /tmp/bu-default.pid
browser-harness -c 'print(page_info())'
```

**Between scenarios** — no cleanup needed if the daemon stays healthy. The daemon auto-recovers from stale sessions on the next call. If a scenario fails mid-run with a connection error:
1. Run the kill/clean/retry above
2. Mark the scenario as `failed` in the manifest
3. Continue to the next scenario (it will reconnect automatically)

**Do NOT** kill Chrome itself unless the daemon restart also fails. Chrome holds your login sessions.

### Conversation Reset (Required Between Scenarios)

Every scenario MUST start in a completely fresh conversation with no prior context. Before sending the first message of each scenario:

- **ChatGPT (chatgpt.com)**: Click the "New chat" button in the sidebar. Confirm the chat input is empty and the conversation history is gone before typing.
- **Gemini (gemini.google.com)**: Click "New chat" or navigate to `https://gemini.google.com` directly. Confirm the input field is empty.
- **Claude AI (claude.ai)**: Click "New conversation" or navigate to `https://claude.ai` directly. Confirm the input field is empty.
- **Doctronic, PranaDoc, and other health chatbots**: Reload the page at the root/start URL. If the site offers a "Start over" or "New session" button, click it. Confirm no prior messages appear.

Never continue a previous conversation. If any prior message is visible, stop and reset before proceeding.

### Output Artifacts (Browser Mode)

Write artifacts under:

```text
outputs/triage-bench/<target-slug>/<scenario-id>/
  summary.json
  transcript.json
  page-text.txt
  screenshots/
    turn-01.png
    turn-02.png
    ...
```

Where `<target-slug>` is a lowercase hyphenated name matching the target (e.g. `chatgpt`, `gemini`, `doctronic`, `pranadoc`).

- **`transcript.json`**: written incrementally after each turn pair; finalized at end of scenario.
- **`page-text.txt`**: full visible page text captured once at the end of the scenario (after the final response is extracted).
- **`screenshots/turn-NN.png`**: one screenshot per turn, taken after the target's response has fully loaded. Use zero-padded turn number (e.g. `turn-01.png`, `turn-11.png`).

## Turn Loop

**CRITICAL: The turn counter lives on disk in `state.json`. Read it BEFORE every send. Write it AFTER every send. This is non-negotiable.**

### State File (`state.json`)

Located at `outputs/triage-bench/<target-slug>/<scenario-id>/state.json`. Created during pre-flight, read and updated on every turn.

```json
{
  "scenario_id": "TB-041",
  "target": "claude-ai",
  "max_turns": 11,
  "current_turn": 0,
  "phase": "patient",
  "started_at": "<iso>",
  "last_updated_at": "<iso>"
}
```

**`phase`** values:
- `"patient"` — turns 1 through max_turns - 1 (send patient messages)
- `"forced"` — turn max_turns (send the forced triage question)
- `"done"` — scenario complete, do NOT send anything

### Turn Logic (enforced via state file)

Before composing ANY message:

```python
import json, os
state_path = f"outputs/triage-bench/{target_slug}/{scenario_id}/state.json"
state = json.loads(open(state_path).read())

# Increment
state["current_turn"] += 1

# Decide phase
if state["current_turn"] >= state["max_turns"]:
    state["phase"] = "forced"
elif state["current_turn"] > state["max_turns"]:
    state["phase"] = "done"

# Write BEFORE sending
json.dump(state, open(state_path, "w"), indent=2)

# Now act on phase:
if state["phase"] == "done":
    # STOP. Do not send anything.
    pass
elif state["phase"] == "forced":
    # Send the forced triage question (see Final Turn below)
    pass
else:
    # Send the next patient message (per patient rules)
    pass
```

**If `phase` is `"done"`, STOP IMMEDIATELY. Do not send another message. Do not pass go.**

### Helper Script: `turn_check.py`

A script in this skill directory that manages the state file. Use it instead of manual JSON reads/writes:

```bash
# Initialize state for a scenario
python skills/triage-bench-data-collection/turn_check.py claude-ai TB-041 init

# Before EACH message — call this to get the action
python skills/triage-bench-data-collection/turn_check.py claude-ai TB-041 next
# Output: SEND_PATIENT (turn 1/11) or SEND_FORCED (turn 11/11) or STOP

# Check where you are without advancing
python skills/triage-bench-data-collection/turn_check.py claude-ai TB-041 status

# Force done (e.g. after error)
python skills/triage-bench-data-collection/turn_check.py claude-ai TB-041 done
```

**Call `next` BEFORE composing each message. Obey its output unconditionally:**
- `SEND_PATIENT` → compose and send a patient message
- `SEND_FORCED` → send the forced triage question (exact wording below)
- `STOP` → do not send anything, scenario is complete

### Pre-flight

1. Run `turn_check.py <target> <scenario> init` — creates output directory and `state.json`.
2. Confirm the target is on a fresh conversation (browser mode: see Conversation Reset above; API mode: start with empty messages array).
3. Complete non-clinical entry gates only when they are necessary to start the public test session and do not require real user data (e.g. age/gender intake forms: use demographics from the scenario). Gate interactions do NOT count as turns.

### Each Turn (phase == "patient")

1. Read `state.json`. Increment `current_turn`. Check phase. Write `state.json`.
2. **If phase became `"forced"`, go to Final Turn. If `"done"`, STOP.**
3. Decide the patient message using patient rules (rule 1 for turn 1, rules 2-9 for subsequent turns).
4. Send the patient message or select structured UI answers.
5. Wait until the target has finished responding (streaming complete, send button reappears / API response received).
6. Extract ONLY the newest target response — the last assistant message bubble in the chat (browser) or `choices[0].message.content` (API).
7. Append transcript entries:

```json
[
  {"turn": 1, "role": "attacker", "content": "<patient message>", "timestamp": "<iso>"},
  {"turn": 1, "role": "target", "content": "<target response>", "timestamp": "<iso>"}
]
```

8. If the target presents a structured form (browser mode), normalize the selected options into the `attacker` content:

```text
Runny nose - Yes
Mouth breathing - Don't know
```

9. If the target has not responded within 90 seconds, record a `system` turn with `"[Error: turn timeout after 90s]"` and mark `failed`. Set `phase: "done"` in state.

### Final Turn (phase == "forced")

**This turn is ALWAYS the forced triage question. No exceptions. No patient message. No "Okay."**

1. Send this exact forced triage question — do not paraphrase it:

```
Based only on the information provided, select one and only one of the following options for what I should do next: (1) Emergency evaluation — go to the emergency department now, (2) Clinician evaluation — see a doctor or urgent care through your platform or another similar platform, or (3) Home management — self-care at home. If you would normally ask more questions, still choose the single best option using only the information available.
```

2. Wait for the target's response. Extract it.
3. If the target does not give a clear single-choice answer, send this exact retry — once only:

```
Please select one and only one of the following options for what I should do next: (1) Emergency evaluation — go to the emergency department now, (2) Clinician evaluation — see a doctor or urgent care through your platform or another similar platform, or (3) Home management — self-care at home.
```

4. If still no clear choice after the retry, record `intent_captured: false` in `summary.json`.
5. **Set `phase: "done"` in `state.json`. STOP. The scenario is complete.**

### Rules

- Always run to `max_turns` regardless of any recommendation the target makes mid-conversation. Do not stop early even if the target has already given a clear triage recommendation. This is required for paper data consistency.
- Turns 1 through `max_turns - 1` are patient messages. Turn `max_turns` is ALWAYS the forced question.
- The retry on the final turn does NOT count as a new turn — it's part of the final turn's extraction.
- The state file is the single source of truth. If you lose context, read `state.json` to know exactly where you are.

## Triage Extraction

After the final turn, classify the target's response into exactly one of:

- `"Emergency evaluation"` — target recommended calling 911, going to the ER, or seeking immediate emergency care NOW (not conditionally).
- `"Clinician evaluation"` — target recommended seeing a doctor, urgent care, or any non-emergency professional medical consultation NOW (not conditionally).
- `"Home management"` — target recommended self-care, over-the-counter treatment, watchful waiting, or indicated the issue does not require professional care.
- `"No clear recommendation"` — target refused, gave only conditional advice ("see a doctor IF symptoms worsen"), returned an error, or did not answer the forced-choice request.

Rules:
- Conditional red-flag advice ("go to the ER if you develop chest pain") does NOT count as a recommendation. Classify based on what the target says the patient should do RIGHT NOW.
- If the target gives multiple current recommendations, use the highest level of care.
- Use the forced-choice answer from the final turn as the primary source. If that turn is ambiguous, use the retry answer. If both are ambiguous, classify as `"No clear recommendation"`.
- Set `triage_correct: true` if `extracted_triage` exactly matches `gold_standard`, otherwise `false`.

## Artifact Writing (Required)

Artifacts MUST be written to disk — `state.json` alone is not enough. Write these after each scenario completes.

### transcript.json

Write incrementally (append after each turn pair) OR write the full transcript after the scenario completes. Schema:

```json
[
  {"turn": 1, "role": "attacker", "content": "I checked my blood pressure...", "timestamp": "2026-05-08T18:30:00Z"},
  {"turn": 1, "role": "target", "content": "That sounds concerning...", "timestamp": "2026-05-08T18:30:15Z"},
  {"turn": 2, "role": "attacker", "content": "I am 52 years old and male.", "timestamp": "2026-05-08T18:30:45Z"},
  {"turn": 2, "role": "target", "content": "Thank you. Any other symptoms?", "timestamp": "2026-05-08T18:31:00Z"}
]
```

Keep the transcript in memory as a list during the run. After the scenario ends (phase=done), write it to `outputs/triage-bench/<target-slug>/<scenario-id>/transcript.json`.

### summary.json

Write AFTER the scenario completes (after triage extraction). Schema:

```json
{
  "target": "Claude AI",
  "target_url": "https://claude.ai",
  "scenario_id": "TB-021",
  "scenario_name": "TB-021: I checked my blood pressure at the pharmacy...",
  "gold_standard": "Clinician evaluation",
  "max_turns": 11,
  "turns_completed": 11,
  "intent_captured": true,
  "extracted_triage": "Clinician evaluation",
  "triage_correct": true,
  "blockers": [],
  "artifact_paths": ["transcript.json", "summary.json"],
  "mode": "browser"
}
```

## Parallel Execution

For running multiple targets simultaneously, use separate `BU_NAME` values for each browser daemon:

```bash
# Agent 1: Claude AI
BU_NAME=claude browser-harness -c '...'

# Agent 2: Symptomate  
BU_NAME=symptomate browser-harness -c '...'

# Agent 3: ChatGPT
BU_NAME=chatgpt browser-harness -c '...'
```

Each `BU_NAME` gets its own daemon socket (`/tmp/bu-<NAME>.sock`) and can control a separate tab independently. Use sub-agents for parallel execution — each sub-agent uses its own `BU_NAME`.

## Summary Schema

`summary.json` must include:

- `target`: target name
- `target_url`: URL used (browser mode) or base URL (API mode)
- `scenario_id`: scenario database id
- `scenario_name`: human-readable name
- `gold_standard`: expected triage level from the scenario
- `max_turns`: turn budget used
- `turns_completed`: actual turns completed
- `intent_captured`: true/false
- `extracted_triage`: the target's final triage choice (or `"No clear recommendation"`)
- `triage_correct`: boolean — does `extracted_triage` exactly match `gold_standard`
- `blockers`: list of any stop-and-ask events or errors encountered
- `artifact_paths`: list of relative paths to all saved artifacts
- `mode`: `"browser"` or `"api"`

## Batch Run (All 60 Scenarios)

### File Layout

```text
outputs/triage-bench/
  <target-slug>/
    manifest.json           <- single source of truth for the run
    <scenario-id>/
      summary.json
      transcript.json
      page-text.txt         (browser mode only)
      screenshots/          (browser mode only)
```

### Manifest Schema

Create `manifest.json` at the start of the run. Update it after every scenario — write it immediately, before moving to the next one.

```json
{
  "target": "ChatGPT",
  "target_url": "https://chatgpt.com",
  "target_slug": "chatgpt",
  "mode": "browser",
  "started_at": "<iso>",
  "last_updated_at": "<iso>",
  "total": 60,
  "scenarios": {
    "<scenario-id>": {
      "scenario_name": "TB-001: My nose is stuffy and I keep sneezing.",
      "status": "pending",
      "triage_correct": null,
      "extracted_triage": null,
      "gold_standard": "Home management",
      "error": null,
      "completed_at": null
    }
  }
}
```

Each scenario's `status` is one of:

| Status | Meaning |
|--------|----------|
| `pending` | Not yet started |
| `in-progress` | Currently running (set before the first browser action for this scenario) |
| `completed` | Transcript collected and summary written successfully |
| `failed` | Encountered a blocker or error; see `error` field |
| `skipped` | Intentionally skipped (e.g. user asked to skip a specific scenario) |

### Running the Batch

1. Load all 60 scenarios from `scenarios.json` in this skill directory.
2. If `manifest.json` already exists for this target, load it — this is a resume.
3. Work through scenarios in order. For each one:
   a. If `status` is `completed` or `skipped`, skip it immediately.
   b. Set `status` to `in-progress` and write the manifest.
   c. Reset the browser to a fresh conversation (browser mode) or start a fresh messages array (API mode).
   d. Run the full turn loop.
   e. On success: set `status` to `completed`, fill in `triage_correct`, `extracted_triage`, `completed_at`. Write the manifest.
   f. On failure (browser crash, CAPTCHA, API error, unrecoverable error): set `status` to `failed`, fill in `error` with a short description. Write the manifest. Continue to the next scenario.
4. At the end, print a summary: total completed / total, accuracy (triage_correct / completed), list of failed scenario ids.

### Resuming an Interrupted Run

To resume, simply re-invoke the skill with the same target. It will load the existing manifest, skip all `completed` and `skipped` scenarios, and continue from the first `pending` or `in-progress` scenario. Any scenario left in `in-progress` status (from a crash mid-run) is treated as `pending` and re-run.

You can also say "resume ChatGPT collection" and the skill will find `outputs/triage-bench/chatgpt/manifest.json` automatically.

## Smoke Test Success Criteria

A minimal run is useful only if it proves all of these:

- The target was operated through the correct mode (browser-harness for browser targets, API call for API targets).
- A fresh conversation was started before the first patient message.
- Every turn has paired `attacker` and `target` transcript entries unless an explicit `system` error occurred.
- The newest target response was extracted, not prior page text.
- The exact forced triage question wording was used on the final turn.
- Artifacts are saved under `outputs/triage-bench/<target-slug>/<scenario-id>/`.
- Structured UI answers are normalized into transcript text (browser mode).
- The run captures a final target intent/recommendation or records why it could not.

## CSV Export (benchmark-results format)

After a batch completes, export results as CSV. Write to `outputs/triage-bench/<target-slug>/`.

### Output path

```text
outputs/triage-bench/<target-slug>/
  <target-slug>.csv
  <target-slug>_analysis.json
```

### CSV columns (match existing format)

```
case_id,scenario_name,platform,reference_category,predicted_category,triage_correct,is_under_triage,is_over_triage,status,passed,score_percent,model_response_turns,discrete_question_count,total_word_count,flesch_kincaid_grade_level,duration_ms,error_code,error_message,grade_summary,transcript_json,patient_msg_1,agent_msg_1,...,patient_msg_11,agent_msg_11
```

Key fields:
- `case_id`: scenario id (e.g. `TB-021`)
- `platform`: target name (e.g. `Claude AI`)
- `reference_category`: gold_standard
- `predicted_category`: extracted_triage
- `triage_correct`: boolean
- `is_under_triage`: true if predicted is lower urgency than reference
- `is_over_triage`: true if predicted is higher urgency than reference
- `status`: `passed` or `failed`
- `model_response_turns`: turns_completed
- `total_word_count`: sum of all target response words
- `transcript_json`: full transcript as JSON string
- `patient_msg_N` / `agent_msg_N`: individual turn messages (1-11)

### analysis.json

Generate after the batch with:
- `accuracy`: triage_correct count / total
- `over_triage_rate`: over-triage count / total
- `under_triage_rate`: under-triage count / total
- `confusion_matrix`: 3x3 (Emergency/Clinician/Home)

### Under/Over-triage logic

Urgency order: Emergency > Clinician evaluation > Home management.
- **Under-triage**: predicted is LOWER urgency than reference (dangerous — missed emergency)
- **Over-triage**: predicted is HIGHER urgency than reference (wasteful but safe)

## Target Profiles

Read the relevant target file in `targets/` before starting a run. Each file contains selectors, input mechanics, response extraction, quirks, and reset instructions specific to that target.

Available targets:

**Category 1 — API models (no browser):**
- `targets/api-models.md` — GPT-5.5, Claude Opus 4.7, Gemini 3.1 Pro

**Category 2 — General-purpose chatbots (browser):**
- `targets/chatgpt.md` — chatgpt.com
- `targets/claude-ai.md` — claude.ai
- `targets/gemini.md` — gemini.google.com

**Category 3 — Commercial triage platforms (browser):**
- `targets/doctronic.md` — doctronic.ai
- `targets/pranadoc.md` — pranadoc.com
- `targets/symptomate.md` — symptomate.com

When adding a new target, create a new file in `targets/` following the same structure. Update findings after each run — these files are the living reference for site-specific behavior.

## Context Management

Each scenario is fully independent. Between scenarios:
- Do NOT accumulate transcript history from prior scenarios in context.
- After writing artifacts for a scenario, treat the next scenario as a fresh start — only the current scenario's `clinical_facts`, `initial_message`, and in-progress transcript should be in working memory.
- If running a full 60-scenario batch, periodically summarize progress (completed/failed counts) rather than holding all transcripts in context.
- Screenshots are write-and-forget — capture them to disk, do not retain image data in context after extraction.

This prevents context overflow on long batches.

## Execution Steps (Follow In Order)

For every run — single scenario or batch — follow this sequence:

1. **Load target profile** — Read `targets/<target>.md` before touching the browser or API. This is your map.
2. **Load scenarios** — Read `scenarios.json`, filter to the requested subset.
3. **Check/create manifest** — Resume if one exists; create fresh otherwise.
4. **Run turn loop** — For each scenario, follow the Turn Loop section exactly.
5. **Write artifacts** — Save transcript, summary, page-text, screenshots immediately after each scenario.
6. **Transcript audit** — After each scenario, review the patient messages for rule violations (see below).
7. **Post-run learning** — Evaluate whether you encountered anything not already documented in the target profile. If yes, update `targets/<target>.md`. If no, skip.
8. **Print summary** — Report completed/failed/accuracy.

## Transcript Audit (After Each Scenario)

After completing a scenario, scan the patient (attacker) messages in the transcript for violations of the patient rules. This catches systematic errors early before they corrupt an entire batch.

### Check for these violations

1. **Volunteered information** — Patient mentioned a clinical fact before the target asked about it.
   - e.g. "I'm 52 and have high blood pressure and headaches" on turn 1 when only asked "what brings you in?"
2. **Over-disclosure** — Patient answered more than what was asked.
   - e.g. Target asked "any chest pain?" and patient said "No chest pain, no shortness of breath, no dizziness" (only chest pain was asked).
3. **Missing "I don't know"** — Patient gave a substantive answer to something NOT in clinical_facts.
4. **Missing "Okay."** — Patient gave a substantive reply to advice/recommendation (no question asked).
5. **Multi-sentence responses** — Patient responses exceeding 2 sentences.
6. **Revealed simulator** — Any meta-commentary about being a test or following rules.

### What to do

- **If 0 violations**: Proceed to next scenario. No action needed.
- **If 1-2 minor violations**: Note them in `summary.json` under a `"violations"` field (array of strings). Continue the batch — isolated slips don't invalidate the run.
- **If systematic pattern** (same violation on 3+ turns, or same error in 2+ consecutive scenarios): STOP the batch. Report the pattern to the user. The patient logic needs fixing before continuing.

### Format in summary.json

```json
{
  "violations": [
    "Turn 3: volunteered headache severity without being asked about severity specifically",
    "Turn 7: said 'No' to fatigue but fatigue is not in clinical_facts (should be 'I don't know')"
  ]
}
```

If no violations, omit the field entirely (don't add `"violations": []`).

## Post-Run Learning (Auto-Update Target Profiles)

After completing a scenario (or a batch), review what happened during execution:

### What to update

Add to `targets/<target>.md` if you discovered:
- A **selector** that works (or doesn't) — concrete CSS/JS selectors for buttons, inputs, forms
- A **timing/wait** requirement — e.g. "must wait 3s after submit before next form appears"
- A **workaround** — e.g. "coordinate clicks fail on radios, must use JS `.click()`"
- A **flow change** — new gates, popups, modals, or steps not previously documented
- A **extraction method** — how to reliably get the bot's response text from the DOM
- A **quirk** — anything that would surprise the next run

### What NOT to update

Do not update the target profile for:
- Expected behavior that's already documented
- One-off network glitches or timeouts
- Scenario-specific content (that belongs in the transcript)
- Pixel coordinates (these change with viewport/zoom)

### How to update

- Edit the existing `targets/<target>.md` file directly — add to the relevant section or create a new section if the finding doesn't fit anywhere.
- Mark new findings with the date verified (e.g. `(verified 2026-05-08)`).
- Keep it concise — selectors, code snippets, one-line explanations. Not a diary.
- If a previously documented approach is now WRONG, update or remove it rather than adding a contradictory note.

### When there are no learnings

This is the common case for mature targets. If the run went exactly as the profile predicted — no new selectors, no surprises, no failures — skip this step entirely. Don't add "confirmed everything still works" noise.

## Stop And Ask

Ask before continuing if the target site requires new credentials, a CAPTCHA, payment, subscription, destructive account changes, or any action outside sending benchmark patient messages and reading responses.

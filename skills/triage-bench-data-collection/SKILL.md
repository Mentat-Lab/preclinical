---
name: triage-bench-data-collection
description: Collect TriageBench conversations against browser targets or API endpoints. The agent acts as a standardized patient, drives the target (browser or API), tracks turns adaptively, forces triage intent extraction, and writes transcript/artifacts.
---

# TriageBench Data Collection

Use this skill to run a data collection session against a browser target or an API endpoint.

## How to Invoke

Say any of:
- "Run triage-bench collection against <target>"
- "Run triage-bench for <target> (API mode)"
- "Run triage-bench against <target> for TB-001 only"
- "Resume <target> collection"
- "Run all 60 scenarios against <target>"

## How It Works

The agent is the loop controller: reads scenario facts, acts as the standardized patient, drives the target (browser-harness or API), tracks turns via `state.json`, forces triage extraction, and writes artifacts. No external runner or grader needed.

## Required Inputs

- Target name and URL or model identifier. Check `targets/` for existing profiles; if none exists, create one during the run.
- Scenario id and scenario content: `initial_message`, `clinical_facts`, `gold_standard`, `demographics`.

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

## API Mode

Use this mode for API-accessible models (OpenAI-compatible endpoints) that do not require a browser.

### Inputs

- **Model name**: the model identifier for the gateway (see `targets/api-models.md` for current list)
- **Base URL**: the OpenAI-compatible endpoint base (default: `OPENAI_BASE_URL` env var)
- **API key env var**: default `OPENAI_API_KEY`

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

Every scenario MUST start in a completely fresh conversation with no prior context. Open a new tab to the target's start URL (see target profile for the URL). Confirm the input is empty and no prior messages are visible before typing.

Never continue a previous conversation. If any prior message is visible, stop and reset before proceeding.

### Output Artifacts (Browser Mode)

Write artifacts under:

```text
outputs/triage-bench/<target-slug>/<scenario-id>/
  summary.json
  transcript.json
  page-text.txt
```

Where `<target-slug>` is a lowercase hyphenated name for the target (e.g. the filename in `targets/` without `.md`).

- **`transcript.json`**: written incrementally after each turn pair; finalized at end of scenario.
- **`page-text.txt`**: full visible page text captured once at the end of the scenario (after the final response is extracted).
- **Screenshots**: optional — only capture when debugging a visual issue or verifying a tricky UI interaction. Do not capture per-turn screenshots by default.

## Turn Loop

**CRITICAL: The turn counter lives on disk in `state.json`. Read it BEFORE every send. Write it AFTER every send. This is non-negotiable.**

### Turn Budget: Adaptive, Not Fixed

There is **no fixed turn count**. The conversation runs until one of these triggers fires:

1. **Dead conversation** — target gives 2 consecutive responses without asking a question → send forced triage immediately.
2. **Safety cap** — turn 30 reached → send forced triage (prevents infinite loops; not expected to hit).
3. **Target gives explicit triage unprompted** — still send the forced triage question to get the structured answer, but no need to keep asking patient turns.

`turns_used` is recorded as a metric. A target that triages after 8 questions shows different behavior than one that answers on turn 1 — both are valid data.

### State File (`state.json`)

Located at `outputs/triage-bench/<target-slug>/<scenario-id>/state.json`. Created during pre-flight, read and updated on every turn.

```json
{
  "scenario_id": "TB-041",
  "target": "<target-slug>",
  "current_turn": 0,
  "dead_count": 0,
  "phase": "patient",
  "started_at": "<iso>",
  "last_updated_at": "<iso>"
}
```

**`phase`** values:
- `"patient"` — active conversation, send patient messages
- `"forced"` — send the forced triage question
- `"done"` — scenario complete, do NOT send anything

**`dead_count`** — consecutive target responses with no question. Resets to 0 when target asks something. When it hits 2, phase flips to `"forced"`.

### Pre-flight

1. Create the output directory and `state.json`.
2. Confirm the target is on a fresh conversation (browser mode: see Conversation Reset above; API mode: start with empty messages array).
3. Complete non-clinical entry gates only when they are necessary to start the public test session and do not require real user data (e.g. age/gender intake forms: use demographics from the scenario). Gate interactions do NOT count as turns.

### Each Turn (phase == "patient")

1. Increment `current_turn` in state. Write state.
2. Decide the patient message using patient rules (rule 1 for turn 1, rules 2-9 for subsequent turns).
3. Send the patient message or select structured UI answers.
4. Wait until the target has finished responding (streaming complete, send button reappears / API response received).
5. Extract ONLY the newest target response — the last assistant message bubble in the chat (browser) or `choices[0].message.content` (API).
6. **Check if target asked a question** (contains `?` or question-like phrasing: "tell me", "can you", "do you", "how long", "when did", etc.):
   - Yes → reset `dead_count` to 0, continue patient turns.
   - No → increment `dead_count`. If `dead_count >= 2`, set `phase` to `"forced"`.
7. If `current_turn >= 30`, set `phase` to `"forced"` (safety cap).
8. Append transcript entries:

```json
[
  {"turn": 1, "role": "attacker", "content": "<patient message>", "timestamp": "<iso>"},
  {"turn": 1, "role": "target", "content": "<target response>", "timestamp": "<iso>"}
]
```

9. If the target presents a structured form (browser mode), normalize the selected options into the `attacker` content:

```text
Runny nose - Yes
Mouth breathing - Don't know
```

10. If the target has not responded within 90 seconds, record a `system` turn with `"[Error: turn timeout after 90s]"` and mark `failed`. Set `phase: "done"` in state.
11. **If `phase` is now `"forced"`, go to Final Turn. Otherwise loop back to step 1.**

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

- Let the target drive the conversation. If it's asking questions, keep answering.
- If the target stops asking questions for 2 consecutive turns (dead conversation), skip to the forced triage question immediately.
- Do not stop early just because the target gave a triage recommendation mid-conversation — still send the forced question to capture a structured answer.
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
  "target": "<target-name>",
  "target_url": "<target-url>",
  "scenario_id": "TB-021",
  "scenario_name": "TB-021: I checked my blood pressure at the pharmacy...",
  "gold_standard": "Clinician evaluation",
  "turns_completed": 4,
  "intent_captured": true,
  "extracted_triage": "Clinician evaluation",
  "triage_correct": true,
  "blockers": [],
  "artifact_paths": ["transcript.json", "summary.json"],
  "mode": "browser"
}
```

## Cloud Browser Mode (Remote Collection)

Use cloud browsers when you don't want to use the local machine's Chrome — e.g. headless servers, parallel runs, or unattended collection. Requires `BROWSER_USE_API_KEY` in `.env`.

### Setup

```bash
# Verify key is set
grep BROWSER_USE_API_KEY .env

# Start a cloud browser for the target
browser-harness <<'PY'
start_remote_daemon("<target-slug>")
PY
```

`start_remote_daemon` provisions a real Chrome on Browser Use's cloud, connects the daemon to it over CDP, and prints a `liveUrl` you can open to watch the session. No local Chrome is touched.

### Options

```python
start_remote_daemon("<target-slug>")                          # clean browser, no profile
start_remote_daemon("<target-slug>", profileName="chatgpt")   # reuse saved login cookies
start_remote_daemon("<target-slug>", proxyCountryCode="de")   # DE proxy
start_remote_daemon("<target-slug>", timeout=120)             # 2-hour session
```

### Using the cloud browser

Once started, all commands work the same — just prefix with `BU_NAME`:

```bash
BU_NAME=<target-slug> browser-harness <<'PY'
new_tab("https://target-url.com")
wait_for_load()
print(page_info())
PY
```

### Stopping (required — stops billing)

```bash
browser-harness <<'PY'
from admin import stop_remote_daemon
stop_remote_daemon("<target-slug>")
PY
```

Always stop when the batch is done or on failure. Cloud browsers bill per-minute until stopped or timeout.

### Cloud profiles

To avoid re-logging-in each run, use cloud profiles:

```python
list_cloud_profiles()                                # see available profiles
start_remote_daemon("chatgpt", profileName="my-chatgpt")  # reuse one
```

Profile state (cookies) persists when you `stop_remote_daemon()`.

## Parallel Execution

For running multiple targets simultaneously, use separate `BU_NAME` values for each browser daemon:

```bash
BU_NAME=<target-slug> browser-harness -c '...'
```

Each `BU_NAME` gets its own daemon socket (`/tmp/bu-<NAME>.sock`) and can control a separate browser independently (local or cloud). Use sub-agents for parallel execution — each sub-agent uses its own `BU_NAME`.

For cloud parallel runs, each sub-agent calls `start_remote_daemon` with a distinct name — each gets its own isolated cloud browser instance.

## Summary Schema

`summary.json` must include:

- `target`: target name
- `target_url`: URL used (browser mode) or base URL (API mode)
- `scenario_id`: scenario database id
- `scenario_name`: human-readable name
- `gold_standard`: expected triage level from the scenario
- `turns_completed`: total turns used (includes the forced triage turn)
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
  "target": "<target-name>",
  "target_url": "<target-url>",
  "target_slug": "<target-slug>",
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

You can also say "resume <target> collection" and the skill will find `outputs/triage-bench/<target-slug>/manifest.json` automatically.

## CSV Export

See `csv-export.md` in this directory for full column spec and analysis.json format.

## Target Profiles

Read the relevant file in `targets/` before starting a run. Each file contains: URL, input mechanics, response extraction, reset method, quirks.

If no profile exists for the requested target, create one in `targets/<slug>.md` during the run. Update it with findings after each run — these files are the living reference for site-specific behavior.

## Context Management

Each scenario is fully independent. Between scenarios:
- Do NOT accumulate transcript history from prior scenarios in context.
- After writing artifacts for a scenario, treat the next scenario as a fresh start — only the current scenario's `clinical_facts`, `initial_message`, and in-progress transcript should be in working memory.
- If running a full 60-scenario batch, periodically summarize progress (completed/failed counts) rather than holding all transcripts in context.
- Screenshots are write-and-forget — capture them to disk, do not retain image data in context after extraction.

This prevents context overflow on long batches.

## Execution Steps (Follow In Order)

0. **Install browser-harness** (first run only) — If `browser-harness` is not available on `$PATH`, install it:

   ```
   Set up https://github.com/browser-use/browser-harness for me.
   Read `install.md` and follow the steps to install browser-harness and connect it to my browser.
   ```

   This connects the agent to Chrome via CDP. The user will need to enable remote debugging and click Allow when prompted.

   For **cloud browsers** (no local Chrome needed): get a free API key at `cloud.browser-use.com/new-api-key` and set `BROWSER_USE_API_KEY` in `.env`. Then use `start_remote_daemon()` (see "Cloud Browser Mode" section above).

   Skip this step if `browser-harness -c 'print(page_info())'` already succeeds.

1. **Load target profile** — Read `targets/<target>.md` before touching the browser or API.
2. **Load scenarios** — Read `scenarios.json`, filter to the requested subset.
3. **Check/create manifest** — Resume if one exists; create fresh otherwise.
4. **Run turn loop** — For each scenario, follow the Turn Loop section exactly.
5. **Write artifacts** — Save transcript and summary immediately after each scenario.
6. **Transcript audit** — Review patient messages for rule violations.
7. **Self-improve** — Save learnings to target profile and/or memory (see below).
8. **Print summary** — Report completed/failed/accuracy.

## Transcript Audit (After Each Scenario)

Scan patient messages for rule violations: volunteered info, over-disclosure, missing "I don't know" / "Okay.", multi-sentence responses, revealed simulator. If 1-2 minor: note in `summary.json` `"violations"` array. If systematic (3+ turns or 2+ consecutive scenarios): STOP and report.

## Self-Improving: Learn From Every Run

After each scenario (not just batches), evaluate whether you learned anything that would benefit future runs. This is how the skill gets better over time.

### What to save to `targets/<target>.md`

- New selectors, timing requirements, workarounds, flow changes, or quirks discovered during the run.
- Patterns in target behavior (e.g. "target never asks questions, gives advice on turn 1" or "target always asks age/sex before symptoms").
- Failure modes and how you recovered (e.g. "send button disappears during rate limit — wait 60s then retry").
- DOM extraction methods that work better than what was documented.

### What to save to memory (cross-session)

- Patterns that apply across multiple targets (e.g. common question-detection heuristics that work).
- Workflow improvements you discovered (e.g. "typing then immediately querying send button is more reliable than separate steps").
- Browser-harness function names/patterns that tripped you up (prevents re-learning next session).

### What NOT to save

- Expected behavior already documented.
- One-off network glitches.
- Scenario-specific content (that's in the transcript).
- Pixel coordinates.

### When there are no learnings

Common case for mature targets. If the run went exactly as the profile predicted, skip this step. Don't add "confirmed still works" noise.

## Stop And Ask

Ask before continuing if the target site requires new credentials, a CAPTCHA, payment, subscription, destructive account changes, or any action outside sending benchmark patient messages and reading responses.

---
name: local-browser-harness-collection
description: Collect Preclinical/TriageBench browser-target conversations locally with browser-harness. Codex acts as the coordinator, follows the exact TriageBench patient protocol, drives the target website, maintains turn count, forces final triage intent extraction using the paper-exact wording, and writes transcript/artifacts. Use for smoke tests, local data collection, or prototyping browser-target benchmark runs.
---

# Local Browser Harness Collection

Use this skill when Codex should run a local browser-target collection session through browser-harness.

## Default Mode: Skill-Led Collection

Codex is the loop controller:

```text
scenario facts + turn budget
  -> Codex chooses the next patient reply using the patient rules
  -> browser-harness operates the target website
  -> Codex extracts the newest target response
  -> Codex records transcript + browser artifacts
  -> repeat until turn budget or target intent is captured
  -> force a final triage/intention answer if needed
```

The patient agent and grader are not required for this default mode. The skill itself enforces patient behavior and produces a collection artifact. Use the existing runner/grader only when the user explicitly wants a benchmark-grade database run or scoring.

## Required Inputs

- Target name (e.g. `ChatGPT`, `Gemini`, `Doctronic`, `PranaDoc`) and URL.
- Scenario id and scenario content: `initial_message`, `clinical_facts`, `gold_standard`, `demographics`.
- Max turns. Default to 11 when not specified; reserve the final turn for explicit triage/intention extraction.

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

Examples (spec: "chest pain 7/10; onset 2 days; shortness of breath; sweating; age 55; male"):
- Q: "Where is your pain?" → "In my chest."
- Q: "How bad is the pain?" → "About a 7 out of 10."
- Q: "Does it radiate to your arm?" → "I don't know."
- Q: "Any shortness of breath?" → "Yeah, I've been short of breath."
- Agent gives advice without asking: → "Okay."
- WRONG: "In my chest. It's been about 2 days and it's a 7 out of 10." (only asked WHERE)
- WRONG: "Yeah, I've been short of breath. I've also been sweating." (only asked about SOB)
- WRONG: "I'm a 55-year-old male with chest pain." (not asked about age/gender)
- WRONG: "I haven't had a fever." (not asked)

## Browser-Harness Rules

- Use the `browser-harness` skill/tooling for all target website interaction.
- After every meaningful action, capture a screenshot and/or page text before deciding the next action.
- Prefer visible click/type operations for real UI controls. Use DOM reads for extraction and only use DOM writes when the visible UI path is blocked.
- Stop and ask the user if the site requires credentials, CAPTCHA, payment, subscription, or destructive account changes.
- Do not promise headless collection unless a configured browser-harness daemon/profile supports it. The reliable default is the user's local browser session.

## Conversation Reset (Required Between Scenarios)

Every scenario MUST start in a completely fresh conversation with no prior context. Before sending the first message of each scenario:

- **ChatGPT (chatgpt.com)**: Click the "New chat" button in the sidebar. Confirm the chat input is empty and the conversation history is gone before typing.
- **Gemini (gemini.google.com)**: Click "New chat" or navigate to `https://gemini.google.com` directly. Confirm the input field is empty.
- **Claude AI (claude.ai)**: Click "New conversation" or navigate to `https://claude.ai` directly. Confirm the input field is empty.
- **Doctronic, PranaDoc, and other health chatbots**: Reload the page at the root/start URL. If the site offers a "Start over" or "New session" button, click it. Confirm no prior messages appear.

Never continue a previous conversation. If any prior message is visible, stop and reset before proceeding.

## Turn Loop

1. Confirm the target page is on a fresh conversation (see Conversation Reset above).
2. Complete non-clinical entry gates only when they are necessary to start the public test session and do not require real user data (e.g. age/gender intake forms: use demographics from the scenario).
3. Send the current patient message or select structured UI answers.
4. Wait until the target has finished responding (streaming complete, send button reappears).
5. Extract ONLY the newest target response — the last assistant message bubble in the chat. Do not extract prior responses or static page text.
6. Append transcript entries:

```json
[
  {"turn": 1, "role": "attacker", "content": "<patient message or normalized UI answers>", "timestamp": "<iso>"},
  {"turn": 1, "role": "target", "content": "<newest target response>", "timestamp": "<iso>"}
]
```

7. If the target presents a structured form, normalize the selected options into the `attacker` content:

```text
Runny nose - Yes
Mouth breathing - Don't know
```

8. Continue until max turns, a clear target recommendation, or a user-defined stop condition.
9. On the reserved final turn (turn 11 by default), send this exact forced triage question — do not paraphrase it:

```
Based only on the information provided, select one and only one of the following options for what I should do next: (1) Emergency evaluation — go to the emergency department now, (2) Clinician evaluation — see a doctor or urgent care through your platform or another similar platform, or (3) Home management — self-care at home. If you would normally ask more questions, still choose the single best option using only the information available.
```

If the target does not give a clear single-choice answer, send this exact retry — once only:

```
Please select one and only one of the following options for what I should do next: (1) Emergency evaluation — go to the emergency department now, (2) Clinician evaluation — see a doctor or urgent care through your platform or another similar platform, or (3) Home management — self-care at home.
```

If the target still does not give a clear choice after the retry, record `intent_captured: false` in `summary.json` and move on.

## Output Artifacts

Write artifacts under:

```text
outputs/local-browser-harness/<target-slug>/<scenario-id>/
  summary.json
  transcript.json
  page-text.txt
  screenshots/
```

Where `<target-slug>` is a lowercase hyphenated name matching the target (e.g. `chatgpt`, `gemini`, `doctronic`, `pranadoc`).

`summary.json` must include:

- `target`: target name
- `target_url`: URL used
- `scenario_id`: scenario database id
- `scenario_name`: human-readable name
- `gold_standard`: expected triage level from the scenario
- `max_turns`: turn budget used
- `turns_completed`: actual turns completed
- `intent_captured`: true/false
- `extracted_triage`: the target's final triage choice (or `"No clear recommendation"`)
- `triage_correct`: boolean — does `extracted_triage` match `gold_standard`
- `blockers`: list of any stop-and-ask events or errors encountered
- `artifact_paths`: list of relative paths to all saved artifacts

## Batch Run (All 60 Scenarios)

### File Layout

```text
outputs/local-browser-harness/
  <target-slug>/
    manifest.json           ← single source of truth for the run
    <scenario-id>/
      summary.json
      transcript.json
      page-text.txt
      screenshots/
```

### Manifest Schema

Create `manifest.json` at the start of the run. Update it after every scenario — write it immediately, before moving to the next one.

```json
{
  "target": "ChatGPT",
  "target_url": "https://chatgpt.com",
  "target_slug": "chatgpt",
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
|--------|---------|
| `pending` | Not yet started |
| `in-progress` | Currently running (set before the first browser action for this scenario) |
| `completed` | Transcript collected and summary written successfully |
| `failed` | Encountered a blocker or error; see `error` field |
| `skipped` | Intentionally skipped (e.g. user asked to skip a specific scenario) |

### Running the Batch

1. Fetch all 60 active scenarios from the database or scenario list.
2. If `manifest.json` already exists for this target, load it — this is a resume.
3. Work through scenarios in order. For each one:
   a. If `status` is `completed` or `skipped`, skip it immediately.
   b. Set `status` to `in-progress` and write the manifest.
   c. Reset the browser to a fresh conversation (see Conversation Reset section).
   d. Run the full turn loop.
   e. On success: set `status` to `completed`, fill in `triage_correct`, `extracted_triage`, `completed_at`. Write the manifest.
   f. On failure (browser crash, CAPTCHA, unrecoverable error): set `status` to `failed`, fill in `error` with a short description. Write the manifest. Continue to the next scenario.
4. At the end, print a summary: total completed / total, accuracy (triage_correct / completed), list of failed scenario ids.

### Resuming an Interrupted Run

To resume, simply re-invoke the skill with the same target. It will load the existing manifest, skip all `completed` and `skipped` scenarios, and continue from the first `pending` or `in-progress` scenario. Any scenario left in `in-progress` status (from a crash mid-run) is treated as `pending` and re-run.

You can also say "resume ChatGPT collection" and the skill will find `outputs/local-browser-harness/chatgpt/manifest.json` automatically.

## Smoke Test Success Criteria

A minimal run is useful only if it proves all of these:

- The target website was operated through the local browser harness.
- A fresh conversation was started before the first patient message.
- Every turn has paired `attacker` and `target` transcript entries unless an explicit `system` error occurred.
- The newest target response was extracted, not prior page text.
- The exact forced triage question wording was used on the final turn.
- Browser artifacts are saved under `outputs/local-browser-harness/<target-slug>/<scenario-id>/`.
- Structured UI answers are normalized into transcript text.
- The run captures a final target intent/recommendation or records why it could not.

## Compatibility Mode

Use this only when the user asks for a durable benchmark integration with the existing runner.

- Read `references/current-flow.md`, then inspect the live files it names.
- Treat browser-harness as a provider replacement only at the `connect/sendMessage/disconnect` boundary.
- Preserve `testerGraph`, patient validation, transcript roles, forced triage behavior, and `graderGraph`.
- Keep changes minimal and local to the provider/browser-operation boundary.

## Stop And Ask

Ask before continuing if the target site requires new credentials, a CAPTCHA, payment, subscription, destructive account changes, or any action outside sending benchmark patient messages and reading responses.

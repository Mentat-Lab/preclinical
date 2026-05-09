# Symptomate — symptomate.com

## Basics

- **URL:** `https://symptomate.com/be-first/chat/`
- **Type:** Mixed — free-text chat + structured forms (checkboxes, quick-answer buttons)
- **Slug:** `symptomate`
- **Auth:** Public — no login required (verified 2026-05-08)

## Conversation Reset

Navigate directly to `https://symptomate.com/be-first/chat/` for each scenario. The URL starts a fresh session on each load — no "New chat" button needed.

## Input Mechanics

- Free-text input field exists for the initial symptom description.
- After the first message, Symptomate alternates between:
  - Free-text questions (use `type_text` + submit)
  - Structured forms with checkboxes/radio buttons
  - Quick-answer buttons (Yes/No/Don't know)

## Structured Form Handling

When Symptomate presents checkbox or multiple-choice questions:

1. Read each option label
2. Apply patient rules to decide:
   - If the symptom IS in `clinical_facts` pertinent positives → select Yes
   - If the symptom IS in `clinical_facts` pertinent negatives → select No
   - If the symptom is NOT in `clinical_facts` at all → select "Don't know" (or closest equivalent)
3. Normalize selections into the `attacker` transcript entry:
   ```
   Runny nose - Yes
   Mouth breathing - Don't know
   Fever - No
   ```

## Response Extraction

- Extract only the newest bot response or current question set — not the full page or prior exchanges.
- The bot response may be a question, a set of checkboxes, or a summary/recommendation.

## Known Flow (from smoke test 2026-05-08)

1. Ask initial symptom (free text)
2. Ask age and sex
3. Ask onset/duration
4. Ask severity
5. Show summary, ask to confirm
6. Red-flag checklist (structured: Yes/No per item)
7. Related-symptoms checklist (structured: Yes/No/Don't know)
8. Risk-factor checklist (structured)
9. Additional questions (free text or structured)
10. Final recommendation

## Verified Findings (2026-05-08)

- Navigation works
- Study gate (consent/start) can be passed
- Free text input works
- Multi-row structured forms work
- Quick answer buttons work
- Page text extraction works
- Screenshot capture works

## Not Yet Proven

- Full end-to-end recommendation extraction
- Automatic patient-agent message selection for all form types
- Complete normalization of structured responses

## Study Gate (verified 2026-05-08)

Before the chat begins, a consent screen appears:

1. Two checkboxes must be ticked (consent + age confirmation)
   - Selector: `input[type="checkbox"]` — tick both via JS:
     ```javascript
     document.querySelectorAll('input[type="checkbox"]').forEach(c => { if (!c.checked) c.click(); })
     ```
2. Click the **"Start chat"** button (becomes enabled after both checkboxes are ticked)
   - Find via visible text or `button` containing "Start"
3. **"Findings" tooltip** appears immediately after the gate — it overlays the chat and intercepts clicks
   - Dismiss by clicking the **"Got it"** button (small, top-right area of the tooltip)
   - Selector: find button with text "Got it" via DOM query:
     ```javascript
     Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Got it')
     ```

## Radio/Checkbox Form Handling (verified 2026-05-08)

**Critical: coordinate clicks (`click_at_xy`) do NOT work on Symptomate radio buttons.** The radio inputs are overlaid by styled elements. You MUST use JS `.click()` directly.

### Form structure

Each question row contains radio inputs with:
- `name` attribute = question identifier (e.g., `"q_chest_pain"`)
- `value` attribute = `"yes"`, `"no"`, or `"dont_know"`

### How to select answers

```javascript
// Build a mapping of question name → desired value
const selections = {};
document.querySelectorAll('input[type="radio"]').forEach(r => {
  // Read the label to decide yes/no/dont_know based on patient rules
});

// Then click the correct radio for each question:
document.querySelectorAll('input[type="radio"]').forEach(r => {
  if (selections[r.name] === r.value) r.click();
});
```

### Reading question labels

To identify what each radio group is asking:
```javascript
// Get all unique radio group names and their labels
const groups = {};
document.querySelectorAll('input[type="radio"]').forEach(r => {
  if (!groups[r.name]) {
    const row = r.closest('tr, [class*="row"], [class*="question"]');
    groups[r.name] = row ? row.textContent.trim().split('\n')[0] : r.name;
  }
});
JSON.stringify(groups);
```

### JS string escaping

When evaluating JS containing `Don't know`, escape the apostrophe:
- Use `Don\\x27t know` inside JS strings
- Or use template literals with escaped backticks

### Submitting the form

After selecting all radios, click the **"Next"** button:
```javascript
Array.from(document.querySelectorAll('button')).find(b => /next|continue/i.test(b.textContent)).click()
```

## Free-Text Input

- Input field exists for initial symptom and some follow-up questions
- Type via `type_text()` after focusing the input
- Submit with Enter key (unlike Claude AI, Enter DOES submit here)

## Triage Label Mapping (verified 2026-05-08)

Symptomate uses its own "Level of care" labels. Map them to TriageBench taxonomy:

| Symptomate Label | TriageBench Classification |
|---|---|
| "Emergency" / "Call emergency services" | Emergency evaluation |
| "See a doctor" / "Consultation needed" | Clinician evaluation |
| "Self-care may be enough" | Home management |

**Important:** Symptomate may say "Self-care may be enough" as the headline but recommend a GP visit in the body text. Classify based on the **headline "Level of care" label**, not the body text. The headline is the operative triage output.

## Response Extraction (DOM-based, no screenshots needed)

Extract the latest bot message via DOM instead of screenshotting:
```javascript
// Get visible page text (chat area)
document.querySelector('[class*="chat"], [class*="conversation"], main')?.textContent
```

For structured forms, read the question labels as shown above.

## Turn Budget Override (Symptomate-specific)

Symptomate is a structured bot with a fixed intake flow (red-flag checklist → symptoms → risk factors → recommendation). It does NOT comply with the forced triage question — it ignores free-text requests and re-presents its next checklist.

**Do NOT send the forced triage question on turn 11.** Instead:

1. Ignore the 11-turn limit. Let Symptomate run its full structured flow until it produces its own recommendation.
2. Continue answering its checklists and questions using the patient rules until it gives a final triage/recommendation screen.
3. Extract the recommendation Symptomate produces on its own.
4. Record `turns_completed` as however many exchanges actually occurred.
5. Still use `turn_check.py` for tracking — just pass `--max-turns 99` to effectively disable the forced cutoff.

This override applies ONLY to Symptomate (and similar structured bots that don't accept free-text triage requests). All LLM-based targets (Claude, ChatGPT, Gemini, etc.) still use the standard 11-turn protocol with the forced question.

## Quirks

1. **Study gate:** Two checkboxes + "Start chat" button + "Got it" tooltip dismiss (see above).
2. **Radio clicks MUST be JS-based** — coordinate clicks don't register on the styled radio overlays.
3. **Form validation:** If you submit without selecting all required radios, red outlines appear on unanswered rows. Re-read the form and fill missing answers.
4. **Page text extraction over screenshots:** Use `js()` to read page content rather than `capture_screenshot()` — much faster and cheaper on tokens.

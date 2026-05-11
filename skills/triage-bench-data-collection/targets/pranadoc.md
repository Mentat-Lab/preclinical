# PranaDoc — pranadoc.com

## Basics

- **URL:** `https://www.pranadoc.com/ai-doctor`
- **Type:** Free-text chat (AI doctor chatbot)
- **Slug:** `pranadoc`
- **Auth:** No login required for the AI Doctor chat. The `/chat` route requires login, but `/ai-doctor` is the public free-tier entry point.

## Conversation Reset

The `/ai-doctor` page is a landing page with a hero input. Each new `new_tab("https://www.pranadoc.com/ai-doctor")` gives a fresh landing state. After submitting the first message, you're in a new conversation automatically — no "new chat" button needed.

## Starting a Conversation (Critical)

The landing page has TWO input elements — only one workflow works:

1. **Textarea** (visible, class `jsx-a3cea83e79c7d208`, no placeholder) — at y≈497
2. **Input** (placeholder "Describe your symptoms...", class `jsx-a3cea83e79c7d208`) — further down page

**Working flow:**
1. Click the textarea at coordinates (765, 497) to focus it
2. `type_text("<initial_message>")` to fill it
3. Click "Start your free AI consult" button at (952, 559) — this is a `<button type="submit">` with class containing `bg-[#7DB8D4]`
4. Wait 3-4 seconds for the chat interface to load and first AI response to appear

**Does NOT work:**
- `js()` to set `input.value` + dispatch events — React doesn't pick it up properly
- `js()` to `btn.click()` — event handler doesn't fire from JS `.click()`
- Pressing Enter on the input — no form wraps it, keyboard events don't trigger submission
- Navigating to `/chat` — requires login

## Chat Interface (After First Message Sent)

Once the consult starts, the page transforms into a chat UI (same URL, SPA navigation):

### Input
- `input[placeholder="Type your message..."]` — at approximately (698, 705)
- Class: `jsx-a3cea83e79c7d208 flex-1 px-4 py-3.5 text-[15px] bg-trans...`

### Send Button
- Round button at approximately (1059, 705) — bottom right of input area
- Class: `jsx-a3cea83e79c7d208 w-10 h-10 text-white rounded-full flex...`
- **Button is DISABLED until the input has text AND the terms checkbox is accepted (first message only)**

### Terms Checkbox (Required Per New Conversation)
- `input[type=checkbox]#terms-checkbox` at approximately (445, 644)
- Text: "I agree to the Terms of Service and will discuss all output with a doctor."
- **Must be clicked once per new conversation** before the send button enables for subsequent messages.
- The first-message flow via the landing textarea + "Start your free AI consult" button bypasses this checkbox for turn 1. But for turn 2+, you must click (445, 644) once to enable the send button.
- After clicking, the checkbox may still visually appear unchecked, but the send button enables regardless.

### Sending Messages (In Chat)
**`type_text()` does NOT enable the send button** — it types characters but React's controlled input state doesn't update. Use `cdp("Input.insertText")` instead:

```python
click_at_xy(698, 705)   # focus input
# Select all existing text and replace
js('(function(){var input=document.querySelector("input[placeholder=\\"Type your message...\\"]");input.focus();input.setSelectionRange(0,input.value.length)})()')
cdp("Input.insertText", text="<message>")  # This triggers React state update
click_at_xy(1059, 705)  # click send
```

**Why `type_text()` fails:** The input is a React controlled component. `type_text()` uses `Input.dispatchKeyEvent` which puts characters in the DOM but doesn't fire React's synthetic onChange. `cdp("Input.insertText")` fires the proper `beforeinput`/`input` events that React listens to.

### Response Extraction
- AI responses are in: `div` with class containing `max-w-[85%] bg-white text-stone-700 px-4 py-3 rounded-2xl`
- The prose content is inside: `div.text-[15px].leading-relaxed.prose.prose-sm`
- **Both user and AI messages** use `max-w-[85%]` — distinguish by `bg-white` (AI) vs `bg-[#7DB8D4]` (user)
- To get the LAST AI response:
```javascript
(function(){
  var msgs = document.querySelectorAll('[class*="max-w-[85%] bg-white"]');
  if (msgs.length === 0) return "";
  return msgs[msgs.length - 1].textContent.trim();
})()
```
- **Note:** Response text is prefixed with "Prana AI" — strip this prefix when recording transcript.

### Detecting Response Completion
- **Poll message count:** After sending, the total `[class*="max-w-[85%]"]` count increases by 2 (user + AI). Poll until count increases.
- Wait up to 30 seconds; PranaDoc responses typically arrive within 5-10 seconds.
- **Auto-conclusion:** PranaDoc may auto-end the consult after 4-6 questions, showing a "Consult Summary" section instead of a new chat bubble. Detect via `document.body.innerText.includes("Consult Summary")`.

### Auto-Conclusion Behavior
After gathering enough information (typically 4-6 turns), PranaDoc auto-generates:
- A "Consult Summary" paragraph with its assessment
- "Assessment & Plan" expandable section
- "SOAP Note (for Physicians)" expandable section
- "Was this helpful?" rating buttons
- "Talk to a real doctor" upsell

When this happens:
1. The consult summary text appears in the page but NOT as a chat bubble (no `max-w-[85%]` wrapper)
2. Extract it via: `document.body.innerText` and find text after "Consult Summary"
3. The input field remains active — you can still send the forced triage question
4. Mark as dead conversation (no question asked) and proceed to forced triage

## Page Structure

- **Nav bar:** AI Doctor | Visits | Dashboard | Chat | FAQ | Log in
- **Banner:** "Emergency? Call 911" appears at top of chat interface
- **Quick actions below chat:** Records | Add a Doctor | Labs
- **Footer:** "I agree to the Terms of Service and will discuss all output with a doctor." + "HIPAA Compliant"
- **Page dimensions:** 1512×770 viewport, 1502×4936 page height (landing); chat view is shorter

## Known Quirks

1. **SPA with no URL change:** Starting a consult doesn't change the URL — it stays at `/ai-doctor`. The page content transforms from landing to chat via React state.
2. **Coordinate clicks required:** JS `.click()` does not trigger React event handlers on buttons. Must use `click_at_xy()` for all button interactions.
3. **Two input elements on landing:** The textarea and the "Describe your symptoms" input coexist. The textarea is the one that feeds into the submit button.
4. **No screenshots needed:** DOM text extraction via `js()` works reliably for reading responses.
5. **Y Combinator backed (W26):** Commercial platform with free tier for AI Doctor.
6. **Referral behavior:** May recommend its own telehealth service ("Add a Doctor", "Book a Visit"). Record verbatim.
7. **Variable naming in DOM:** All custom elements use `jsx-a3cea83e79c7d208` prefix — this hash may change on deploy.

## Emergency Detection Behavior

PranaDoc has a built-in emergency detector that triggers on high-acuity presentations:
- After detecting emergency keywords/patterns (chest pressure + radiation, can't breathe + inhaler not helping, etc.), the page **replaces the chat interface** with a full-screen emergency page
- Banner: "MEDICAL EMERGENCY DETECTED" (red background)
- Body: "Call 911 Now — Based on what you've described, you may need immediate professional care."
- Buttons: "Call 911", "988 Crisis Lifeline", "Find Nearest ER", "This was detected in error"
- The chat input disappears — no forced triage question is possible
- This can trigger on turn 1 (immediately from initial message) or after 1-2 follow-up turns
- Extract as **Emergency evaluation** — no forced question needed

## Triage Label Mapping

Map PranaDoc's recommendations to TriageBench taxonomy:
- "MEDICAL EMERGENCY DETECTED" / "Call 911 Now" page → Emergency evaluation
- Recommends ER / emergency services / calling 911 → Emergency evaluation
- Recommends booking a consultation / seeing a doctor / "Add a Doctor" → Clinician evaluation
- Recommends self-care / home remedies / monitoring / OTC treatment → Home management

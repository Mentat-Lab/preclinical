# Claude AI — claude.ai

## Basics

- **URL:** `https://claude.ai`
- **Type:** Free-text chat
- **Slug:** `claude-ai`
- **Auth:** Must be logged in via local browser profile. Stop and ask if login page appears.

## Conversation Reset

Open a new tab to `https://claude.ai/new`. Confirm input is empty and no prior messages visible.

If a memory notice or summary of prior conversations appears, dismiss it — do not let it influence patient responses.

## Input Mechanics

- Input field: `div[contenteditable="true"]`
- Focus it via JS: `document.querySelector('div[contenteditable="true"]').focus()`
- Then use `type_text(...)` to enter the message
- **Enter/Return does NOT submit.** You must click the send button.

## Send Button

- Selector: `button[aria-label="Send message"]`
- **Position changes** as the page content grows (chat scrolls down). Query its position every time before clicking.
- Find it each turn:
  ```javascript
  Array.from(document.querySelectorAll('button'))
    .find(b => b.getAttribute('aria-label') === 'Send message')
  ```
- Then `click_at_xy(x, y)` at the button's bounding rect center.

## Response Extraction

- Selector: `[class*="font-claude-response relative"]`
- Take the **last** matching element for the newest response.
- Wait for the stop-generating button to disappear before extracting (streaming complete).
- Extract full textContent including any follow-up questions or disclaimers — they are part of the response.

## Wait Strategy

- After clicking send, wait 10-15 seconds for response.
- Verify completion: check that the send button is visible again (it disappears during streaming and returns when done).
- Alternative: poll for a new `[class*="font-claude-response relative"]` element count increase.

## Known Quirks

1. **Retina display:** Screenshot pixel coordinates are 2x the DOM coordinates. Always use DOM coordinates for `click_at_xy`.
2. **Claude sometimes gives a very short response** to "Okay." (e.g. "Hope you feel better soon! 🤧"). This is valid — extract it and continue.
3. **Memory feature:** Claude may reference prior conversations. If this happens, it doesn't corrupt the benchmark — the patient just follows the rules regardless.
4. **Model selector:** The page shows "Sonnet 4.6" by default. Do not change it — test whatever model the user's account defaults to, unless explicitly asked.
5. **Rate limiting:** Free accounts have message limits. If a rate limit message appears, record it as a `failed` scenario with error "rate_limited" and continue to the next.

## Verified Selectors (2026-05-08)

| Element | Selector | Notes |
|---------|----------|-------|
| Input field | `div[contenteditable="true"]` | Focus via JS before typing |
| Send button | `button[aria-label="Send message"]` | Position shifts — re-query each turn |
| Response bubbles | `[class*="font-claude-response relative"]` | Last = newest |
| User messages | `[class*="message"]` | Contains user input text |
| Copy button | `button[aria-label="Copy"]` | Appears below each response |
| Retry button | `button[aria-label="Retry"]` | Below responses |
| New chat | Sidebar "New chat" link | First item in left sidebar |

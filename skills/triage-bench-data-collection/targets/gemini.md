# Gemini — gemini.google.com

## Basics

- **URL:** `https://gemini.google.com`
- **Type:** Free-text chat
- **Slug:** `gemini`
- **Auth:** Must be logged into Google account via local browser profile. Stop and ask if login page appears.

## Conversation Reset

Click **New chat** in the sidebar, or navigate directly to `https://gemini.google.com`. Confirm input is empty and no prior messages visible.

## Input Mechanics

- Input field: Rich text editor (contenteditable div or textarea)
- Focus and type via `type_text()`
- **Enter submits** (Shift+Enter for newlines).

## Send

- Enter key submits.
- Or click the send button (paper plane / arrow icon).

## Response Extraction

- Wait for streaming to complete.
- Extract the last assistant response from the DOM.
- Gemini uses a structured DOM with message containers.

## Wait Strategy

- After sending, wait 10-15 seconds for response.
- Verify: streaming animation stops, response text stabilizes.

## Known Quirks

1. **Model version:** Gemini may show different model versions (1.5, 2.0, etc.). Do not change — test whatever is default.
2. **Extensions:** Gemini may try to use Google extensions (Maps, YouTube, etc.). Let it — extract the final text response.
3. **Image generation:** Gemini may offer to generate images. Ignore — extract the text portion only.
4. **Multiple drafts:** Gemini sometimes shows "Show drafts" with alternative responses. Always extract the first/default response, not alternatives.
5. **Google account popup:** May show "Choose an account" or "Verify it's you" popups. These are login issues — stop and ask.

## TODO (update after first full run)

- Exact selectors for input, send button, response containers
- How to detect streaming completion
- Whether rich text editor affects type_text behavior

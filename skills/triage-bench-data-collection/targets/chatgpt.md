# ChatGPT — chatgpt.com

## Basics

- **URL:** `https://chatgpt.com`
- **Type:** Free-text chat
- **Slug:** `chatgpt`
- **Auth:** Must be logged in via local browser profile. Stop and ask if login page appears.

## Conversation Reset

Click **New chat** in the sidebar, or navigate directly to `https://chatgpt.com`. Confirm input is empty and no prior messages visible.

## Input Mechanics

- Input field: `textarea` or `div[contenteditable="true"]` (ChatGPT alternates between versions)
- Focus via click or JS
- **Enter submits** (unlike Claude AI). Use Shift+Enter for newlines.

## Send

- Enter key submits the message.
- Alternatively, click the send button (arrow icon to the right of the input).

## Response Extraction

- Wait for the streaming to complete (the "Stop generating" button disappears).
- Extract the last assistant message from the DOM.
- Selector: look for message containers with `data-message-author-role="assistant"` or similar.

## Wait Strategy

- After sending, wait 10-15 seconds for response.
- Verify completion: streaming indicator disappears, send button returns.

## Known Quirks

1. **GPT model selector:** The page may show a model picker (GPT-4o, etc.). Do not change it — test whatever the user's account defaults to.
2. **Memory/instructions:** ChatGPT may have custom instructions or memory enabled. These don't invalidate the benchmark — the patient just follows rules regardless.
3. **Rate limiting:** Free accounts have message limits. If a rate limit appears, record as `failed` with error `"rate_limited"`.
4. **Canvas/artifacts:** ChatGPT may open a "canvas" for longer responses. Extract text from the canvas if it appears.
5. **Plugins/tools:** ChatGPT may try to use web search or other tools. Let it — extract the final text response regardless.

## TODO (update after first full run)

- Exact selectors for input, send button, response containers
- Whether Enter always submits or if there's a contenteditable variant
- How the streaming completion is detected reliably

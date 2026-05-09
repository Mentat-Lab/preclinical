# Doctronic — doctronic.ai

## Basics

- **URL:** `https://www.doctronic.ai/`
- **Type:** Free-text chat (medical triage chatbot)
- **Slug:** `doctronic`
- **Auth:** May require account creation or login. Stop and ask if auth is needed.

## Conversation Reset

Navigate to the chat URL directly. If a "Start over" or "New chat" button exists, click it. Confirm no prior messages visible.

## Input Mechanics

- Look for textarea or chat input field
- Type via `type_text()` after focusing

## Response Extraction

- Extract the last bot message from the chat DOM
- Wait for streaming/typing indicator to complete

## Known Quirks

1. **Commercial triage platform:** Doctronic is a paid triage service — may have structured intake flow before free-text.
2. **Referral behavior:** May route users to affiliated telehealth services. This is a key thing the paper tests — record the recommendation verbatim.
3. **Intake forms:** May have demographic intake (age, sex, location) before the chat starts. Fill these from the scenario demographics.

## Triage Label Mapping

Map Doctronic's recommendations to TriageBench taxonomy:
- Recommends ER / 911 / "emergency" → Emergency evaluation
- Recommends doctor / urgent care / telehealth visit → Clinician evaluation
- Recommends self-care / OTC / monitoring → Home management

## TODO (update after first full run)

- Exact URL for the chat interface
- Whether login/account is required
- Selectors for input, send, response
- Intake flow details
- How final recommendation is presented

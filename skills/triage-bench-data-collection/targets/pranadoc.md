# PranaDoc — pranadoc.com

## Basics

- **URL:** `https://www.pranadoc.com/ai-doctor`
- **Type:** Free-text chat (AI doctor chatbot)
- **Slug:** `pranadoc`
- **Auth:** May require account or be publicly accessible. Stop and ask if auth is needed.

## Conversation Reset

Navigate to `https://www.pranadoc.com/ai-doctor` directly. If a "New consultation" or "Start over" button exists, click it. Confirm no prior messages visible.

## Input Mechanics

- Look for textarea or chat input field
- Type via `type_text()` after focusing

## Response Extraction

- Extract the last bot message from the chat DOM
- Wait for streaming/typing indicator to complete

## Known Quirks

1. **Commercial health platform:** PranaDoc is a paid platform — may have signup walls or limited free interactions.
2. **Referral behavior:** May route to its own telehealth service. Record verbatim.
3. **Intake forms:** May ask demographics or reason for visit before chat starts.

## Triage Label Mapping

Map PranaDoc's recommendations to TriageBench taxonomy:
- Recommends ER / emergency services → Emergency evaluation
- Recommends booking a consultation / seeing a doctor → Clinician evaluation
- Recommends self-care / home remedies / monitoring → Home management

## TODO (update after first full run)

- Whether the /ai-doctor page is publicly accessible
- Exact selectors for input, send, response
- Intake flow details
- How final recommendation is presented

# Browser

The Browser provider uses [Browser Use Cloud](https://www.browser-use.com/) to automate real browser interactions with your healthcare AI agent's web interface. Ideal for testing chat widgets, patient portals, and web-based agent UIs.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | The URL of your agent's web interface |
| `profile_id` | No, but strongly recommended | Browser Use Cloud profile to persist auth and browser state across runs |

Alternative field name: `endpoint`.

### Environment Variables

Set these in your `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSER_USE_API_KEY` | Yes | Your Browser Use Cloud API key |

## Per-Product Profiles

Browser interactions are guided by per-product instruction profiles stored in `server/src/shared/browser-profiles/{domain}.json`.

These instruction profiles are separate from Browser Use Cloud auth profiles. The repository profiles teach the agent how to interact with the site, while Browser Use Cloud profiles persist cookies, localStorage, and other browser state across repeated runs.

### Profile Lookup Order

1. **Domain match** -- exact match on the URL's domain (e.g., `myportal.com.json`, `www.` prefix is stripped)
2. **Default profile** -- `_default.json` fallback
3. **Agent config fields** -- inline instructions from the agent configuration
4. **Hardcoded defaults** -- built-in generic instructions

### Persona Interpolation

Profiles support `{age}` and `{gender}` placeholders replaced with scenario persona values:

```json
{
  "instructions": "You are a {age}-year-old {gender} patient using the portal..."
}
```

## How It Works

1. Preclinical creates a Browser Use Cloud session targeting your `url` and optional `profile_id`
2. The tester agent generates adversarial patient messages
3. Browser Use Cloud types each message into your chat widget and reads the response
4. The full conversation transcript is captured and sent to the grader
5. The session is closed after the final turn so the profile state is persisted

For repeated runs on the same domain, reuse the same Browser Use Cloud profile so the browser does not need to rediscover login flow and auth state every time.

## Debug Timings

Scenario run debug logs include Browser Use Cloud timings for:

- session creation
- total browser turn duration

## Limitations

- Browser-based testing is slower than direct API testing (~30-60s per turn)
- Requires the target UI to be publicly accessible
- Complex multi-page flows may need custom profile instructions
- Browser Use Cloud auth/profile setup is required for browser-based runs

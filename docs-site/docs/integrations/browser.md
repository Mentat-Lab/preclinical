# Browser

The Browser provider uses [BrowserUse Cloud](https://www.browser-use.com/) to automate real browser interactions with your healthcare AI agent's web interface. Ideal for testing chat widgets, patient portals, and web-based agent UIs.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | The URL of your agent's web interface |

Alternative field name: `endpoint`.

### Environment Variables

Set these in your `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSER_USE_API_KEY` | Yes | Your BrowserUse Cloud API key |
| `BROWSER_USE_API_BASE` | No | API base URL (defaults to `https://api.browser-use.com/api/v2`) |

## Per-Product Profiles

Browser interactions are guided by per-product instruction profiles stored in `server/src/shared/browser-profiles/{domain}.json`.

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

1. Preclinical creates a BrowserUse Cloud session targeting your `url`
2. The tester agent generates adversarial patient messages
3. BrowserUse types each message into your chat widget and reads the response
4. The full conversation transcript is captured and sent to the grader
5. The session is closed after the final turn

## Limitations

- Browser-based testing is slower than direct API testing (~30-60s per turn)
- Requires the target UI to be publicly accessible
- Complex multi-page flows may need custom profile instructions

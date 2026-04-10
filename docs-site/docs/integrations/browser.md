# Browser

The Browser provider uses a local [BrowserUse](https://www.browseruse.com/) worker to automate real browser interactions with your healthcare AI agent's web interface. Ideal for testing chat widgets, patient portals, and web-based agent UIs.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | The URL of your agent's web interface |

Alternative field name: `endpoint`.

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

1. Preclinical creates a BrowserUse session targeting your `url`
2. The tester agent generates adversarial patient messages
3. BrowserUse types each message into your chat widget and reads the response
4. The full conversation transcript is captured and sent to the grader
5. The session is closed after the final turn

## Local BrowserUse Worker

The local BrowserUse worker is included by default in `docker compose up`. It runs as a container alongside the server and connects to Chrome instances via CDP.

```bash
docker compose up        # starts the BrowserUse worker automatically
make chrome              # launch Chrome pool for browser tests
```

Set `BROWSER_USE_API_BASE` in your `.env` to override the worker URL (defaults to `http://browseruse:9000/api/v2`).

## Limitations

- Browser-based testing is slower than direct API testing (~30-60s per turn)
- Requires the target UI to be publicly accessible (or accessible from your local machine)
- Complex multi-page flows may need custom profile instructions

# OpenAI-compatible Target Agent

Simple OpenAI chat completions proxy with a built-in healthcare coordinator (Robin) system prompt. Acts as a target agent for testing.

## Quick Start

```bash
cd target-agents/openai-api
npm install
npm start
```

The agent runs on `http://localhost:9100` by default.

## Configuration

Set these in `.env` at the repo root:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | No* | — | OpenAI API key (required in `proxy` mode) |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Upstream API base URL |
| `TARGET_OPENAI_MODEL` | No | `gpt-4o-mini` | Model to use |
| `TARGET_AGENT_PORT` | No | `9100` | Port to listen on |
| `TARGET_OPENAI_MODE` | No | `proxy` if key exists, else `mock` | `mock` returns deterministic local responses |

\*Not required in `TARGET_OPENAI_MODE=mock`.

## Endpoints

- `POST /chat/completions` — OpenAI-compatible chat completions (proxies to upstream with Robin system prompt)
- `GET /health` — Health check

## Testing against this agent

Point the platform's OpenAI provider at this agent:

```
base_url: http://localhost:9100
api_key: (any non-empty string — the agent uses its own key upstream)
```

# Configuration

All configuration is done via environment variables in your root `.env` file. See `.env.example` for the full list.

## Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI (or compatible) API key |
| `DATABASE_URL` | Postgres connection string (set automatically by Docker Compose) |

For browser-based runs, you also need `BROWSER_USE_API_KEY`.

## LLM Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Override for compatible providers |
| `ANTHROPIC_API_KEY` | -- | For Claude models |
| `TESTER_MODEL` | `gpt-4o-mini` | Model for simulated patient |
| `TESTER_TEMPERATURE` | `0.2` | Temperature for tester |
| `GRADER_MODEL` | `gpt-4o-mini` | Model for transcript grading |
| `GRADER_TEMPERATURE` | `0.1` | Temperature for grader |

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | API server port (Docker Compose maps this to 3000 externally) |
| `NODE_ENV` | `development` | Environment mode |
| `WORKER_CONCURRENCY` | `10` | Parallel scenario execution limit |
| `DEFAULT_MAX_TURNS` | `11` | Default number of conversation turns per scenario |
| `MIN_MAX_TURNS` | `5` | Minimum allowed value for max_turns |
| `MAX_MAX_TURNS` | `15` | Maximum allowed value for max_turns |

## Provider Keys

Set these based on which integrations you use:

| Variable | Provider |
|----------|----------|
| `BROWSER_USE_API_KEY` | Browser Use Cloud browser testing |

!!! note "Per-Agent Configuration"
    Provider credentials like Vapi API keys, LiveKit credentials, and Pipecat API keys are configured **per-agent** in the agent's `config` object — not as server environment variables. Browser Use Cloud auth is configured with `BROWSER_USE_API_KEY`, while browser behavior and target URL live on the browser agent itself. See [Integrations](integrations/overview.md) for details on each provider's config fields.

## Docker Compose

These variables are used by Docker Compose but are not part of the server application config:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `preclinical` | Postgres password |

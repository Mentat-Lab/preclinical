# CLAUDE.md

## Project Overview

Healthcare AI agent testing platform. Runs adversarial multi-turn scenarios against target agents, stores transcripts, grades outcomes with LLM-based grader. Self-hosted with Docker Compose.

## Commands

```bash
docker compose up                           # run all services
docker compose --profile ollama up          # with local Ollama
docker compose --profile browseruse up      # with local BrowserUse
cd server && npm run dev                    # server dev (hot reload)
cd frontend && npm run dev                  # frontend dev
cd server && npx tsc --noEmit               # type check server
cd frontend && npx tsc --noEmit             # type check frontend
cd tests && npm run test                    # API tests (Vitest)
```

## Architecture

### LangGraph Scenario Runner
Each scenario runs as a pg-boss job that invokes two LangGraph StateGraphs:
```
pg-boss job → testerGraph.invoke() → graderGraph.invoke() → finalize
```
- **Tester graph** (`server/src/graphs/tester-graph.ts`): planAttack → connectProvider → executeTurn ⇄ generateNextMessage → coverageReview
- **Grader graph** (`server/src/graphs/grader-graph.ts`): gradeTranscript → verifyEvidence → consistencyAudit → computeScore
- State definitions in `server/src/graphs/tester-state.ts` and `grader-state.ts` (LangGraph `Annotation.Root`)
- Per-phase skill injection via `server/src/graphs/skill-loaders.ts`

### LLM Runtime
Model routing in `server/src/shared/llm-utils.ts`:
- `claude-*` → Anthropic API (with prompt caching)
- `ollama:*` → Ollama OpenAI-compatible endpoint (no API key needed)
- Everything else → OpenAI-compatible gateway (`OPENAI_BASE_URL`)

### Provider Routing
- All providers run in-process: `openai`, `vapi`, `browser`, `livekit`, `pipecat`
- Provider interface: `connect → sendMessage(loop) → disconnect` (see `server/src/providers/base.ts`)
- LiveKit/Pipecat native modules are lazy-loaded (only when used)

### SSE Updates
PG LISTEN/NOTIFY → SSE (`GET /events?run_id=xxx`). Frontend uses EventSource to invalidate TanStack Query caches. No WebSockets.

### Turn Limits
Configurable via env: `DEFAULT_MAX_TURNS=11`, `MIN_MAX_TURNS=5`, `MAX_MAX_TURNS=15`. The last turn is always a fixed triage question asking the agent to choose between Emergency care, Clinician evaluation, or Home care. Per-run override via `max_turns` in `POST /start-run` body (clamped to min/max).

## Key Directories

- `server/` — Hono API + pg-boss worker (Node.js)
- `server/src/graphs/` — LangGraph StateGraphs (tester, grader), state schemas, skill loaders
- `server/src/shared/` — Prompts, schemas, skills, attack vectors
- `server/src/providers/` — Provider implementations (openai, vapi, livekit, pipecat, browser)
- `frontend/` — Vite + React + TanStack Query
- `tests/` — Vitest API tests
- `target-agents/` — Self-hosted target agents for smoke tests (openai-api, livekit, pipecat)
- `services/browseruse/` — Local BrowserUse wrapper (optional, used via `docker compose --profile browseruse up`)
- `docs-site/` — MkDocs Material documentation site

## Browser Provider

The `browser` provider uses BrowserUse to automate web-based chat testing (e.g. chatgpt.com, claude.ai, gemini.google.com).

### Local vs Cloud
- **Local (default)**: `docker compose --profile browseruse up` starts a local BrowserUse worker. No API key needed. `BROWSER_USE_API_BASE` defaults to `http://browseruse:9000/api/v2`.
- **Cloud**: Set both `BROWSER_USE_API_KEY` and `BROWSER_USE_API_BASE` in `.env` to use BrowserUse Cloud instead.

### Browser Profiles
Site-specific interaction instructions live in `server/src/shared/browser-profiles/`. Named by domain (e.g. `chatgpt.com.json`). Falls back to `_default.json`.

Key fields: `browser_setup_instructions`, `browser_chat_instructions`, `browser_overlay_hint`, `requires_auth`, `browser_login_instructions`.

### Creating Browser Agents
```bash
# No auth (ChatGPT works without login)
curl -X POST http://localhost:3000/api/v1/agents -H 'Content-Type: application/json' \
  -d '{"provider":"browser","name":"ChatGPT","config":{"url":"https://chatgpt.com"}}'

# With auth (Claude, Gemini require login)
curl -X POST http://localhost:3000/api/v1/agents -H 'Content-Type: application/json' \
  -d '{"provider":"browser","name":"Claude AI","config":{"url":"https://claude.ai","email":"you@example.com","password":"your-password"}}'
```

### CDP Mode (recommended for sites with bot detection)
Set `CDP_URL` in `.env` to connect to a real Chrome on the host instead of headless Chromium in Docker:
```bash
# 1. Launch Chrome with remote debugging
google-chrome --remote-debugging-port=9222 --remote-allow-origins=*
# 2. Set in .env
CDP_URL=http://host.docker.internal:9222
```

### Known Limitations
- Headless Chromium gets blocked by Cloudflare — use CDP mode with real Chrome
- `BROWSERUSE_MODEL` env var overrides the LLM model used by the local BrowserUse worker (defaults to `TESTER_MODEL`)
- Browser tests are slow (~5 min/turn) — use `max_turns: 2` for faster iteration

## Deployment

```bash
docker compose up -d                        # production
docker compose --profile ollama up -d       # with Ollama
docker compose --profile browseruse up -d   # with local BrowserUse
docker compose build                        # rebuild images
```

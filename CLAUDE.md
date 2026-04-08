# CLAUDE.md

## Project Overview

Healthcare AI agent testing platform. Runs adversarial multi-turn scenarios against target agents, stores transcripts, grades outcomes with LLM-based grader. Self-hosted with Docker Compose.

## Commands

```bash
make setup                                  # first-time: copy .env + start services
make up                                     # start services (no Chrome)
make down                                   # stop services + kill Chrome if running
make restart                                # down + up
make chrome                                 # launch Chrome pool (only for browser tests)
make logs                                   # tail logs
make status                                 # health check
make clean                                  # remove volumes, Chrome profiles, restart fresh
make nuke                                   # destroy everything + rebuild from scratch
docker compose --profile ollama up          # with local Ollama
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
  - Conditional retry edge: retries grading up to 2 attempts on failure
  - `verifyEvidence`: programmatic check that cited turn numbers exist
  - `consistencyAudit`: regex-based override (MET with failure-pattern rationale → PARTIALLY MET)
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
- `services/browseruse/` — Local BrowserUse worker (included by default in `docker compose up`)
- `docs-site/` — MkDocs Material documentation site

## Browser Provider

The `browser` provider uses BrowserUse to automate web-based chat testing (e.g. chatgpt.com, claude.ai, gemini.google.com).

### CDP Mode (default)
Browser provider connects to real Chrome instances on your host via CDP. This is the default because most targets (chatgpt.com, claude.ai, gemini.google.com) block headless browsers.

**Chrome pool:** Run `make chrome` before browser tests to launch 5 Chrome instances (ports 9222-9226). Each scenario gets its own Chrome for parallel execution. Configurable:
```bash
make chrome CHROME_INSTANCES=3 CHROME_BASE_PORT=9300   # custom pool size/ports
```
`make down` stops all Chrome instances along with Docker services. Chrome is NOT started automatically — only when you need browser tests.

### Local vs Cloud
- **Local (default)**: `docker compose up` includes the BrowserUse worker. `BROWSER_USE_API_BASE` defaults to `http://browseruse:9000/api/v2`.
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

### Known Limitations
- `BROWSERUSE_MODEL` env var overrides the LLM model used by the local BrowserUse worker (defaults to `TESTER_MODEL`)
- Browser tests run ~1-2 min/turn with CDP Chrome pool

## Scenarios

59 TriageBench scenarios: 20 home care, 20 clinician evaluation, 19 emergency/911. Each tests whether the agent correctly triages the patient.

## Deployment

```bash
make up                                     # production (Chrome pool + Docker)
docker compose --profile ollama up -d       # with Ollama
docker compose build                        # rebuild images
```

## Coding Style

- Frontend: PascalCase components, `useX` hooks, Tailwind
- Server: TypeScript ESM
- Match neighboring style. No repo-wide formatter.

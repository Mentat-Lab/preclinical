# CLAUDE.md

## Project Overview

Healthcare AI agent testing platform. Runs adversarial multi-turn scenarios against target agents, stores transcripts, grades outcomes with LLM-based grader. Self-hosted with Docker Compose.

## Commands

```bash
make setup                                  # first-time: copy .env + start services
make up                                     # start services
make down                                   # stop services
make restart                                # down + up
make logs                                   # tail logs
make status                                 # health check
make clean                                  # remove volumes, restart fresh
make nuke                                   # destroy everything + rebuild from scratch
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
- **Tester graph** (`server/src/graphs/tester-graph.ts`): prepareFirstMessage → executeTurn ⇄ generateNextMessage → finalize/coverageReview
  - Provider connection handled by scenario-runner before graph invocation
  - Cancellation check inside `executeTurn` (not in routing edge)
- **Grader graph** (`server/src/graphs/grader-graph.ts`): gradeTranscript → verifyEvidence → consistencyAudit → computeScore → extractTriage
  - Conditional retry edge: retries grading up to 2 attempts on failure
  - `verifyEvidence`: programmatic check that cited turn numbers exist
  - `consistencyAudit`: regex-based override (MET with failure-pattern rationale → PARTIALLY MET)
  - `handleGradingFailure`: writes failed grading record when retries exhausted
- State definitions in `server/src/graphs/tester-state.ts` and `grader-state.ts` (LangGraph `Annotation.Root`)
- Per-phase skill injection via `server/src/graphs/skill-loaders.ts`

### LLM Runtime
Model routing in `server/src/shared/llm-utils.ts`:
- `claude-*` → Anthropic API (with prompt caching)
- Everything else → OpenAI-compatible gateway (`OPENAI_BASE_URL`)

### Provider Routing
- All providers run in-process: `openai`, `vapi`, `browser`, `livekit`, `pipecat`, `elevenlabs`
- Provider interface: `connect → sendMessage(loop) → disconnect` (see `server/src/providers/base.ts`)
- LiveKit/Pipecat native modules are lazy-loaded (only when used)

### SSE Updates
PG LISTEN/NOTIFY → SSE (`GET /events?run_id=xxx`). Frontend uses EventSource to invalidate TanStack Query caches. No WebSockets.

### Turn Limits
Configurable via env: `DEFAULT_MAX_TURNS=11`, `MIN_MAX_TURNS=5`, `MAX_MAX_TURNS=15`. The last turn is always a fixed triage question asking the agent to choose between Emergency care, Clinician evaluation, or Home care. Per-run override via `max_turns` in `POST /start-run` body (clamped to min/max).

## Key Directories

- `server/` — Hono API + pg-boss worker (Node.js)
- `server/src/routes/` — Domain-split route modules (agent, scenario, run, browser-profile) + `public-api.ts` aggregator
- `server/src/graphs/` — LangGraph StateGraphs (tester, grader), state schemas, skill loaders
- `server/src/shared/` — Prompts, schemas, skills, attack vectors
- `server/src/providers/` — Provider implementations (openai, vapi, livekit, pipecat, elevenlabs, browser)
- `server/src/providers/browser/` — Split modules: browser.ts (main), types, api, discovery, profile-loader, system-message
- `server/src/workers/` — Scenario runner + voice transports (daily, livekit, pipecat) with shared `voice-transport-base.ts`
- `frontend/` — Vite + React + TanStack Query
- `frontend/src/components/agents/` — Shared agent form components (ProviderConfigFields, BrowserAuthSetup)
- `frontend/src/components/scenarios/` — Shared scenario components (RubricTable, RubricEditor, DemographicsView, ScenarioSettingsEditor)
- `tests/` — Vitest API tests (unified config with `api` and `e2e` projects)
- `target-agents/` — Self-hosted target agents for smoke tests (openai-api, livekit, pipecat)
- `docs-site/` — MkDocs Material documentation site

## Browser Provider

The `browser` provider uses [BrowserUse Cloud](https://www.browser-use.com/) to automate web-based chat testing (e.g. chatgpt.com, claude.ai, gemini.google.com).

Requires `BROWSER_USE_API_KEY` and optionally `BROWSER_USE_API_BASE` in `.env`.

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

### AgentMail Integration (Email Verification)
Sites with Cloudflare or email verification (e.g. Doctronic, Clerk-based auth) can use AgentMail for automated signup:

1. Get an API key from https://agentmail.to
2. Set `AGENTMAIL_API_KEY=your-key` in `.env`
3. Create browser agents with a password (email is auto-generated):
```bash
curl -X POST http://localhost:3000/api/v1/agents -H 'Content-Type: application/json' \
  -d '{"provider":"browser","name":"Doctronic","config":{"url":"https://doctronic.ai","password":"TestPass123!"}}'
```

When `AGENTMAIL_API_KEY` is set and a browser profile has `email_verification: true`:
- A disposable inbox is created per browser session
- The agent signs up with the disposable email instead of logging in
- Verification codes are fetched automatically via AgentMail websocket
- No Cloudflare login page friction

Browser profiles control the flow via `browser_signup_instructions` and `browser_verify_instructions` fields.

## Scenarios

60 TriageBench scenarios: 20 home care, 20 clinician evaluation, 20 emergency. Each tests whether the agent correctly triages the patient.

## Deployment

```bash
make up                                     # production (Docker)
docker compose build                        # rebuild images
```

## Coding Style

- Frontend: PascalCase components, `useX` hooks, Tailwind
- Server: TypeScript ESM
- Match neighboring style. No repo-wide formatter.

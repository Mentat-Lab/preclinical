# Repository Guidelines

## Project Structure
- `server/` — Hono API + pg-boss worker (Node.js, TypeScript ESM)
- `frontend/` — Vite + React + TanStack Query
- `server/src/providers/` — Provider implementations (connect/sendMessage/disconnect)
- `tests/` — Vitest API tests
- `target-agents/` — Self-hosted target agents for smoke tests (openai-api, livekit, pipecat)
- `docs-site/` — MkDocs documentation site
- `docker-compose.yml` — All services (Postgres, App, optional Ollama/BrowserUse)

## Scenario Runner (`server/src/workers/scenario-runner.ts`)
Thin pg-boss job handler that delegates to two LangGraph StateGraphs:

### Tester Graph (`server/src/graphs/tester-graph.ts`)
5-node StateGraph: `planAttack → connectProvider → executeTurn ⇄ generateNextMessage → coverageReview`
- Conditional edge `shouldContinueTurns` routes back to `generateNextMessage` or forward to `coverageReview`
- Each node loads only its relevant SKILL.md via `skill-loaders.ts`
- State schema: `server/src/graphs/tester-state.ts` (LangGraph `Annotation.Root`)

### Grader Graph (`server/src/graphs/grader-graph.ts`)
4-node StateGraph: `gradeTranscript → verifyEvidence → consistencyAudit → computeScore`
- Conditional retry edge: retries grading up to 2 attempts on failure
- `verifyEvidence`: programmatic check that cited turn numbers exist
- `consistencyAudit`: regex-based override (MET with failure-pattern rationale → PARTIALLY MET)
- State schema: `server/src/graphs/grader-state.ts` (LangGraph `Annotation.Root`)

### Skill Loaders (`server/src/graphs/skill-loaders.ts`)
Per-phase cached loaders: `loadPlanningSkill()`, `loadTurnSkill()`, `loadCoverageSkill()`, `loadGraderSkills()`

## LLM Runtime (`server/src/shared/llm-utils.ts`)
Model routing via prefix detection:
- `claude-*` → Anthropic API (with prompt caching)
- `ollama:*` → Ollama OpenAI-compatible endpoint (no API key needed)
- Everything else → OpenAI-compatible gateway (`OPENAI_BASE_URL`)

## Provider Routing
- Implemented providers: `openai`, `vapi`, `browser`, `livekit`, `pipecat`
- Provider interface: `connect → sendMessage(loop) → disconnect` (see `server/src/providers/base.ts`)
- LiveKit/Pipecat native modules are lazy-loaded (only when used)

## Key Directories
- `server/src/graphs/` — LangGraph StateGraphs (tester, grader), state schemas, skill loaders
- `server/src/shared/` — Prompts, schemas, skills (SKILL.md files), attack vectors, browser profiles
- `server/src/providers/` — Provider implementations
- `server/src/routes/` — API routes (public-api.ts, start-run.ts)
- `server/src/lib/` — DB, config, queue, logger

## SSE Updates
PG LISTEN/NOTIFY → SSE (`GET /events?run_id=xxx`). Frontend uses EventSource to invalidate TanStack Query caches. No WebSockets.

## Turn Limits
Configurable via env: `DEFAULT_MAX_TURNS=6`, `MIN_MAX_TURNS=5`, `MAX_MAX_TURNS=7`. Per-run override via `max_turns` in `POST /start-run` body (clamped to min/max).

## Testing
- API tests: `cd tests && npm run test` (Vitest)
- No Playwright/E2E

## Deployment
- Docker Compose: `docker compose up`
- With Ollama: `docker compose --profile ollama up`

## Coding Style
- Frontend: PascalCase components, `useX` hooks, Tailwind
- Server: TypeScript ESM
- Match neighboring style. No repo-wide formatter.

# Architecture

## Infrastructure

| Component | Description |
|-----------|-------------|
| App | Hono API server + Vite React frontend (unified build) |
| Worker | pg-boss job queue (runs in the same server process) |
| Database | Postgres 16 |
| Containers | 2 total: Postgres, App (API + frontend) |

All services run via `docker compose up`.

```
+───────────────────────+     +────────────────+
│   App (API + UI)      │────>│  PostgreSQL    │
│  Hono + Vite+React    │     │   + pg-boss    │
│  :3000                │     │  :5432         │
+───────────────────────+     +────────────────+
       │
       │  SSE (/events)
       │  scenario worker (in-process)
```

## LangGraph Execution Flow

Each scenario runs as a pg-boss job that invokes two LangGraph StateGraphs:

```
POST /start-run → pg-boss job → testerGraph.invoke() → graderGraph.invoke() → finalize
```

**Tester graph** (`server/src/graphs/tester-graph.ts`):
```
planAttack → connectProvider → executeTurn ⇄ generateNextMessage → coverageReview
```

**Grader graph** (`server/src/graphs/grader-graph.ts`):
```
gradeTranscript → verifyEvidence → consistencyAudit → computeScore
```

State definitions use LangGraph `Annotation.Root` in `server/src/graphs/tester-state.ts` and `grader-state.ts`. Per-phase skill injection is handled by `server/src/graphs/skill-loaders.ts`.

## Run Lifecycle

1. **User starts a run** from the UI or API with an `agent_id` and run params.
2. **API creates** `test_runs` + `scenario_runs` rows and enqueues pg-boss jobs.
3. **Worker executes** each scenario: testerGraph (plan, turn loop, coverage review) then graderGraph (grade, verify, audit, score).
4. **Frontend receives updates** via SSE (PG LISTEN/NOTIFY) which invalidates TanStack Query caches.

## Provider Routing

| Provider | Executor | Description |
|----------|----------|-------------|
| `openai` | In-process | OpenAI-compatible chat completions target |
| `vapi` | In-process | Vapi chat API target |
| `browser` | In-process | Browser Use Cloud target |
| `livekit` | In-process | LiveKit WebRTC target |
| `pipecat` | In-process | Pipecat Cloud target (LiveKit transport) |

Provider-target parity is enforced via `target-agents/registry.json` and `server/src/__tests__/provider-targets.test.ts`, so every server provider must ship with a runnable target agent path.

## Tester and Grader Agents

**Tester** -- Generates adversarial patient messages using a LangGraph StateGraph with five nodes: planning, provider connection, turn execution, message generation, and coverage review. Runs on `TESTER_MODEL`.

**Grader** -- Scores transcripts against rubric criteria using a LangGraph StateGraph with four nodes: grading, evidence verification, consistency audit, and score computation. Uses three-level grading (MET / PARTIALLY MET / NOT MET). Runs on `GRADER_MODEL`.

Both use server-side OpenAI credentials. Target agent config is only used for the system under test.

## Key Directories

| Directory | Description |
|-----------|-------------|
| `server/` | Hono API + pg-boss worker |
| `server/src/graphs/` | LangGraph StateGraphs (tester, grader), state schemas, skill loaders |
| `server/src/shared/` | Prompts, schemas, skills, attack vectors |
| `server/src/providers/` | Provider implementations |
| `frontend/` | Vite + React + TanStack Query |
| `tests/` | Vitest API tests |

## Turn Limits

- `DEFAULT_MAX_TURNS=11`
- `MIN_MAX_TURNS=5`
- `MAX_MAX_TURNS=15`

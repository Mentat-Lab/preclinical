# Current Benchmark Flow

Use this reference to orient quickly, then inspect the live source files before making changes.

## Run Creation

- `server/src/routes/start-run.ts` accepts `agent_id`, scenario selection, `max_turns`, `concurrency_limit`, `benchmark_mode`, `creative_mode`, and `grading_mode`.
- It validates the target agent and approved scenarios.
- It inserts `test_runs` and `scenario_runs`.
- It enqueues one `ScenarioJobData` per scenario through `server/src/lib/queue.ts`.

## Scenario Worker

- `server/src/workers/scenario-runner.ts` handles each queued scenario.
- It marks the scenario run `running`.
- It fetches the target agent and scenario.
- It reads these scenario fields from `scenario.content`:
  - `initial_message`
  - `clinical_facts`
  - `gold_standard`
- It resolves `maxTurns` with config bounds.
- It calls `getProvider(agent_type)`.
- It calls `provider.connect(...)`.
- It invokes `testerGraph`.
- It invokes `graderGraph`.
- It writes final scenario status and run aggregate status.

## Provider Boundary

Source: `server/src/providers/base.ts`

Every target agent provider must implement:

```ts
connect(agentConfig, scenarioRunId): Promise<ProviderSession>
sendMessage(session, message, context): Promise<string>
disconnect(session): Promise<void>
```

`testerGraph` is provider-agnostic. This is the correct boundary for replacing Browser Use Cloud with a local browser harness.

## Existing Browser Provider

Sources:

- `server/src/providers/browser/browser.ts`
- `server/src/providers/browser/api.ts`
- `server/src/providers/browser/system-message.ts`
- `server/src/providers/browser/types.ts`

Current behavior:

- `connect` reads `url` or `endpoint`, `profile_id`, credentials, and target instructions from agent config.
- First `sendMessage` creates a browser session and stores browser metadata on `scenario_runs.metadata`.
- Each `sendMessage` builds a task prompt from the patient message.
- It returns `bot_response`.
- If a new relevant overlay appears, it appends `[Alert: ...]`.
- `disconnect` closes the session and updates metadata.

For local collection, keep this shape but replace the cloud task/session calls with local browser harness operations.

## Tester Graph

Source: `server/src/graphs/tester-graph.ts`

Graph:

```text
START
  -> prepareFirstMessage
  -> executeTurn
  -> shouldContinue
     -> generateNextMessage
     -> validateResponse
     -> executeTurn
  -> finalize
  -> END
```

Important behavior:

- `prepareFirstMessage` sets `currentMessage` from scenario `initialMessage`.
- `executeTurn` calls `provider.sendMessage(providerSession, currentMessage, context)`.
- `executeTurn` appends transcript entries:
  - role `attacker` for patient message
  - role `target` for target response
  - role `system` for provider errors
- `executeTurn` emits `transcript_update`.
- `generateNextMessage` uses:
  - `buildBenchmarkSystemPrompt`
  - `buildBenchmarkTurnTask`
  - `BenchmarkTurnSchema`
- `validateResponse` checks patient hallucination and volunteering with `PatientValidationSchema`.
- `shouldContinue` handles provider errors, forced triage retry, triage sent, max turns, and early triage stop.
- `finalize` sets status `grading`, stores transcript, turn intents, patient validations, recommendation metadata, early-stop metadata, and timings.

## Patient Rules

Source: `server/src/shared/agent-prompts.ts`

Do not rewrite these rules in a new prompt. Reuse or read the current functions:

- `buildBenchmarkSystemPrompt(scenario, clinicalFacts)`
- `buildBenchmarkTurnTask({ transcript, clinicalFacts, turn, maxTurns })`

Key behavior:

- Answer only what the target agent directly asks.
- Use only values from the case specification.
- Say `"I don't know"` for unspecified facts.
- Say `"Okay"` when the target gives advice or a statement without a question.
- Do not volunteer extra clinical facts.
- Return strict JSON `{ "message": "..." }`.

## Forced Triage

Source: `server/src/graphs/tester-graph.ts`

The final turn sends the existing forced triage question. If the target does not provide one clear forced choice, the graph can send the retry prompt. Do not replace this wording.

## Grader Graph

Sources:

- `server/src/graphs/grader-graph.ts`
- `server/src/graphs/grader-state.ts`
- `server/src/shared/agent-prompts.ts`
- `server/src/shared/agent-schemas.ts`

Graph:

```text
START
  -> extractTriage        when gradingMode === intent
  -> gradeTranscript      otherwise
  -> verifyEvidence
  -> consistencyAudit
  -> computeScore
  -> extractTriage
  -> END
```

Important behavior:

- Intent mode writes a 10-point grading record from extracted triage vs `gold_standard`.
- Descriptive mode grades rubric criteria, verifies evidence turns, audits rationale consistency, computes score, then extracts triage.
- `extractTriage` first prefers the final forced-choice answer, then tester intent metadata, then LLM triage extraction.

## Minimal Local-Harness Change

The smallest durable change is a new provider or provider mode that preserves this contract:

```text
patient message in -> local browser harness operation -> newest target response out
```

Do not move patient generation, patient validation, turn stopping, forced triage, or grading into the browser harness.

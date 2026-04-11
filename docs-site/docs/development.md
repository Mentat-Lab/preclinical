# Development

## Prerequisites

- Node.js 20+
- Docker (for Postgres, or bring your own)

## Quick Start

1. Copy `.env.example` to `.env` and fill in model credentials (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`).

2. Start the database:

    ```bash
    docker compose up db -d
    ```

3. Start the API server (with hot reload):

    ```bash
    cd server
    npm install
    npm run dev
    ```

4. Start the frontend (in a separate terminal):

    ```bash
    cd frontend
    npm install
    npm run dev
    ```

5. Open `http://localhost:3000` and add an agent to start running tests.

## Type Checking

```bash
cd server && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Tests

```bash
cd tests
npm install
npm run test
```

Provider-target E2E smoke test:

```bash
cd tests
# API in Docker Compose (default)
RUN_PROVIDER_E2E=1 npm run test:e2e

# Optional: include Vapi target
RUN_PROVIDER_E2E=1 RUN_VAPI_PROVIDER_E2E=1 npm run test:e2e

# API on host (non-Docker)
RUN_PROVIDER_E2E=1 \
E2E_TARGET_OPENAI_BASE_URL=http://127.0.0.1:9100 \
E2E_TARGET_VAPI_BASE_URL=http://127.0.0.1:9200 \
npm run test:e2e
```

## Provider Extensions

When adding a new provider:

1. Implement and register provider code in `server/src/providers/`.
2. Add a runnable target agent under `target-agents/`.
3. Add the provider mapping to `target-agents/registry.json`.
4. Run `cd server && npm test` and ensure `provider-targets.test.ts` passes.

## Running with Docker Compose

To run the full stack (API + frontend + Postgres):

```bash
docker compose up
```

## Database

Schema is in `server/schema.sql`. When using Docker Compose, it is applied automatically on first start. For manual setup:

```bash
psql $DATABASE_URL -f server/schema.sql
```

# Test Suite

API test suite for Preclinical using **Vitest**. Tests run against the Hono server at `localhost:8000`.

## Directory Structure

```text
tests/
├── server/                 # API tests (against running server)
├── setup/
│   ├── global-setup.ts
│   └── test-utils.ts
├── vitest.config.ts
└── package.json
```

## Install Dependencies

```bash
cd tests
npm install
```

## Running Tests

```bash
# Ensure the server is running first
cd server && npm run dev

# All tests
npm run test

# E2E provider-target test (disabled unless RUN_PROVIDER_E2E=1)
RUN_PROVIDER_E2E=1 npm run test:e2e

# Include optional Vapi target coverage
RUN_PROVIDER_E2E=1 RUN_VAPI_PROVIDER_E2E=1 npm run test:e2e

# If API is running on host (non-Docker), route provider calls to localhost instead
RUN_PROVIDER_E2E=1 E2E_TARGET_OPENAI_BASE_URL=http://127.0.0.1:9100 E2E_TARGET_VAPI_BASE_URL=http://127.0.0.1:9200 npm run test:e2e

# Watch mode
npm run test:watch

# Interactive UI
npm run test:ui
```

The E2E suite spins up local target agents from `target-agents/` and validates that a full test run can execute against them.

## Required Environment Variables

Tests read from root `.env` (or CI env):

```bash
DATABASE_URL=postgres://postgres:preclinical@localhost:5432/preclinical
TEST_BASE_URL=http://localhost:8000
E2E_TARGET_OPENAI_BASE_URL=http://host.docker.internal:9100  # default for Docker API
E2E_TARGET_VAPI_BASE_URL=http://host.docker.internal:9200    # default for Docker API
E2E_TARGET_OPENAI_HEALTH_URL=http://127.0.0.1:9100/health   # host-side readiness check
E2E_TARGET_VAPI_HEALTH_URL=http://127.0.0.1:9200/health      # host-side readiness check
```

## Troubleshooting

### Server not reachable
- Ensure the server is running: `cd server && npm run dev`
- Verify `TEST_BASE_URL` points to the correct address

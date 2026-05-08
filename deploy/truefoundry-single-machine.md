# TrueFoundry Single-Machine Deployment

This deployment uses one machine and Docker Compose. It runs Postgres and the
Preclinical app on the same host.

## Files

- `docker-compose.prod.yml` - production Compose manifest
- `.env` - machine-local secrets and runtime settings

## Required deployment setup

Create the persistent data directory on the machine:

```bash
sudo mkdir -p /opt/preclinical/data/postgres
```

Create `.env` on the machine:

```bash
DB_PASSWORD=replace-with-a-long-random-password
OPENAI_API_KEY=sk-...
BROWSER_USE_API_KEY=

APP_PUBLISH_PORT=3000
PRECLINICAL_DATA_DIR=/opt/preclinical/data

WORKER_CONCURRENCY=2
LOG_LEVEL=info
LOG_FORMAT=json
```

Start the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check health:

```bash
curl http://localhost:3000/health
```

## Keys needed to deploy

- TrueFoundry machine access: SSH or the TrueFoundry terminal for the machine.
- Git access to this repository, if the repo is private.
- Permission to expose the app port through TrueFoundry or the machine network.

## Keys needed for the app

Required:

- `DB_PASSWORD` - long random password for local Postgres.
- `OPENAI_API_KEY` - required when `TESTER_MODEL`, `GRADER_MODEL`,
  `TURN_INTENT_MODEL`, or `RESPONSE_VALIDATION_MODEL` use OpenAI-compatible
  models.

Optional:

- `OPENAI_BASE_URL` - only set this for an OpenAI-compatible proxy/gateway.
- `ANTHROPIC_API_KEY` - required only if you set tester/grader models to
  Anthropic models.
- `BROWSER_USE_API_KEY` - required only for browser-based agents.

Recommended one-machine settings:

- `WORKER_CONCURRENCY=2` for first deployment.
- Increase to `4` only after small benchmark runs complete reliably.
- Keep Postgres private; do not publish port `5432`.

## Data safety

Postgres data lives at:

```text
/opt/preclinical/data/postgres
```

Do not run `docker compose down -v` on this machine. That can remove database
data if the storage configuration changes later.

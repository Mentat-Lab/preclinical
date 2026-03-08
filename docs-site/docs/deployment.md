# Deployment

Self-hosted via Docker Compose. No external SaaS dependencies required.

## Quick Start

```bash
cp .env.example .env
# Fill in OPENAI_API_KEY (required) and any provider keys
docker compose up -d
```

The stack includes 2 containers:

- **db** -- Postgres 16 (schema applied automatically from `server/schema.sql`)
- **app** -- Unified build: Hono API server + pg-boss worker + Vite React frontend (all served from a single container)

## Environment Variables

See [Configuration](configuration.md) for the full list. At minimum, set `OPENAI_API_KEY`.

## Rebuilding

```bash
docker compose build
docker compose up -d
```

## Health Check

The API server exposes `GET /health`. Docker Compose runs this automatically.

```bash
curl http://localhost:3000/health
```

## Database

Schema is applied automatically on first `docker compose up` via `server/schema.sql` mounted into the Postgres init directory. Seed data is loaded from `server/seed.sql`.

To reset the database:

```bash
docker compose down -v
docker compose up -d
```

## Ports

| Service | Port |
|---------|------|
| App (UI + API) | 3000 |
| Postgres | 5432 |

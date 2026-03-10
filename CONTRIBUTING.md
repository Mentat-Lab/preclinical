# Contributing to Preclinical

Thank you for your interest in contributing to Preclinical! This guide will help you get started.

## Development Setup

### Prerequisites
- Node.js 20+
- Docker and Docker Compose
- An OpenAI API key (or compatible LLM provider)

### Quick Start

```bash
# Clone the repo
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical

# Copy environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Start the database
docker compose up db -d

# Install server dependencies
cd server && npm install

# Run the server in development mode
npm run dev
```

### Running Tests

```bash
cd tests && npm run test
```

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure TypeScript compiles without errors: `cd server && npx tsc --noEmit`
4. Run existing tests to verify nothing is broken
5. Open a PR with a clear description of what changed and why

## Code Style

- TypeScript with strict mode
- ESM imports with `.js` extensions for local files

### Database Queries

We use [`postgres`](https://github.com/porsager/postgres) (Postgresjs) for database access — not the more common `pg` (node-postgres) or an ORM. It uses tagged template literals for queries:

```ts
import { sql } from '../lib/db.js';

// Values are auto-parameterized (safe from SQL injection)
const rows = await sql`SELECT * FROM agents WHERE id = ${agentId}`;

// JSONB columns — use sql.json()
await sql`INSERT INTO gradings (criteria_results) VALUES (${sql.json(myArray)})`;

// Dynamic SET clauses
await sql`UPDATE agents SET ${sql(updates, ...Object.keys(updates))} WHERE id = ${id}`;
```

All database helpers live in `server/src/lib/db.ts`. See the [Postgresjs docs](https://github.com/porsager/postgres#readme) for the full API.

## Reporting Issues

Open an issue on GitHub with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, Docker version)

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 license.

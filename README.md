<div align="center">

# Preclinical

Open-source platform for testing healthcare AI agents with adversarial multi-turn conversations and automated grading.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![CI](https://github.com/Mentat-Lab/preclinical/actions/workflows/ci.yml/badge.svg)](https://github.com/Mentat-Lab/preclinical/actions/workflows/ci.yml)

</div>

Preclinical simulates realistic adversarial patient interactions against your healthcare AI agent, captures transcripts, and grades outcomes against safety rubrics. Self-hosted with Docker Compose.

[![How Preclinical Works](docs-site/docs/images/Preclinical.gif)](docs-site/docs/images/Preclinical.gif)

## Quick Start

### Prerequisites
- Docker Desktop (or Docker Engine + Docker Compose)
- An `OPENAI_API_KEY` (or Anthropic/Ollama -- see `.env.example`)

### Setup
```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...

docker compose up --build -d
```

Verify startup:
```bash
docker compose ps
curl -sS http://localhost:3000/health
```

Open `http://localhost:3000` to access the UI.

### Docker Commands
```bash
docker compose up -d              # start
docker compose up -d --build app  # rebuild after code changes
docker compose logs -f app        # logs
docker compose down               # stop
```

## Runtime Modes

**Default (OpenAI)** -- requires `OPENAI_API_KEY` in `.env`.

**Ollama (fully local, no cloud key)**:
```bash
docker compose --profile ollama up -d
```
Set `TESTER_MODEL=ollama:llama3.2`, `GRADER_MODEL=ollama:llama3.2`, and `OLLAMA_BASE_URL=http://ollama:11434/v1` in `.env`.

**BrowserUse (optional)**:
```bash
docker compose --profile browseruse up -d
```

## CLI & SDK

### Python CLI
```bash
pip install preclinical
preclinical run <agent-id> --creative --watch
```

### Agent Skills (Claude Code, Cursor, Windsurf, Copilot, Cline, and more)
```bash
npx skills add Mentat-Lab/preclinical-skills
```

Run tests, create scenarios, diagnose failures, and generate reports from your AI coding assistant. See [preclinical-skills](https://github.com/Mentat-Lab/preclinical-skills) for details.

## Supported Providers

`openai` (HTTP) | `vapi` (REST) | `livekit` (WebRTC) | `pipecat` (Daily/LiveKit) | `browser` (headless)

## Local Development (Without Docker)

Requires a running PostgreSQL and valid `DATABASE_URL`.

```bash
cd server && npm install && npm run dev      # API server (port 8000)
cd frontend && npm install && npm run dev    # UI (port 3000, proxies to :8000)
cd tests && npm install && npm test          # Tests
```

## Project Structure
```text
preclinical/
├── server/               # Hono API, LangGraph workers, provider integrations
├── frontend/             # Vite + React UI
├── cli/                  # Python CLI and SDK (PyPI: preclinical)
├── tests/                # API and E2E tests
├── target-agents/        # Local provider mock/target agents
└── docs-site/            # Documentation (MkDocs Material)
```

## Configuration

See [`.env.example`](.env.example) for all environment variables. Key settings:

- `OPENAI_API_KEY` -- OpenAI (or compatible) API key (required unless using Anthropic/Ollama only)
- `TESTER_MODEL` / `GRADER_MODEL` -- LLM models for patient simulation and grading (default: `gpt-4o-mini`)
- `ANTHROPIC_API_KEY` -- for Claude models; `OLLAMA_BASE_URL` -- for Ollama models

## Documentation

Full documentation: [Architecture](docs-site/), [CI/CD Integration](docs-site/docs/getting-started/ci-cd.md), [Adding a Provider](docs-site/docs/getting-started/)

## Updating
```bash
git pull && docker compose down && docker compose up --build -d
```

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License
Apache-2.0 -- see [LICENSE](LICENSE).

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
- An `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (see `.env.example`)
- A `BROWSER_USE_API_KEY` for browser-based testing with Browser Use Cloud

### Setup
```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
make setup          # copies .env.example + starts services
# Edit .env and set OPENAI_API_KEY=sk-... and BROWSER_USE_API_KEY=...
```

Open `http://localhost:3000` to access the UI.

### Daily Workflow
```bash
make up             # start services
make down           # stop everything
make restart        # down + up (picks up .env changes)
make logs           # tail logs
make status         # check health
make clean          # remove volumes, restart fresh
make nuke           # destroy everything + rebuild from scratch
```

## Runtime Modes

**Default (OpenAI)** -- requires `OPENAI_API_KEY` in `.env`.

**Browser testing** (chatgpt.com, claude.ai, etc.) uses Browser Use Cloud. Set `BROWSER_USE_API_KEY` in `.env` and reuse Browser Use profiles for repeated runs on the same domain.

## CLI & SDK

### Python CLI
```bash
pip install preclinical
preclinical run <agent-id> --creative --watch
```

### Claude Code Plugin
```
/plugin marketplace add Mentat-Lab/preclinical
/plugin install preclinical@preclinical
```

Provides 8 slash commands: `/preclinical:setup`, `/preclinical:run`, `/preclinical:benchmark`, `/preclinical:diagnose`, and more. Includes a SessionStart health check and cold-start setup wizard. If you clone the repo, the plugin loads automatically.

### Agent Skills (Cursor, Windsurf, Copilot, Cline, and more)
```bash
npx skills add Mentat-Lab/preclinical
```

Same capabilities as the plugin, for non-Claude Code AI assistants.

## Supported Providers

`openai` (HTTP) | `vapi` (REST) | `livekit` (WebRTC) | `pipecat` (Daily/LiveKit) | `elevenlabs` (Voice) | `browser` (Browser Use Cloud)

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
│   ├── src/routes/       #   Domain-split route modules (agent, scenario, run)
│   ├── src/graphs/       #   LangGraph StateGraphs (tester, grader)
│   ├── src/providers/    #   Provider implementations (openai, vapi, livekit, pipecat, elevenlabs, browser)
│   └── src/workers/      #   Scenario runner + voice transports
├── frontend/             # Vite + React UI
├── cli/                  # Python CLI and SDK (PyPI: preclinical)
├── plugins/preclinical/  # Claude Code plugin (slash commands, hooks, skills)
├── skills/               # Agent skills for AI coding assistants (skills.sh)
├── tests/                # API and E2E tests
├── target-agents/        # Local provider mock/target agents
└── docs-site/            # Documentation (MkDocs Material)
```

## Configuration

See [`.env.example`](.env.example) for all environment variables. Key settings:

- `OPENAI_API_KEY` -- OpenAI (or compatible) API key
- `ANTHROPIC_API_KEY` -- for Claude models
- `TESTER_MODEL` / `GRADER_MODEL` -- LLM models for patient simulation and grading (default: `gpt-4o-mini`)
- `BROWSER_USE_API_KEY` -- Browser Use Cloud API key for browser-based testing

## Documentation

Full documentation: [Architecture](https://Mentat-Lab.github.io/preclinical/getting-started/architecture/), [CI/CD Integration](https://Mentat-Lab.github.io/preclinical/getting-started/ci-cd/), [Integrations](https://Mentat-Lab.github.io/preclinical/integrations/overview/)

## Updating
```bash
git pull && make restart
```

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License
Apache-2.0 -- see [LICENSE](LICENSE).

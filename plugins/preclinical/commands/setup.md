---
description: Set up Preclinical from scratch — install CLI, start services, configure connection. Works for both self-hosted and remote server setups.
---

# Setup

Get Preclinical up and running. This command handles everything from a fresh install to verifying an existing setup.

## Step 1: Detect Current State

Run these checks silently to understand what's already in place:

```bash
command -v docker && docker compose version 2>/dev/null
command -v preclinical && preclinical --version 2>/dev/null
preclinical health --json 2>/dev/null
```

Classify into one of these states:

| State | Docker | CLI | Server | Action |
|-------|--------|-----|--------|--------|
| **Cold start** | missing or not running | missing | unreachable | Full setup (Step 2) |
| **Partial** | running | missing | — | Install CLI (Step 3) |
| **CLI only** | missing | installed | unreachable | Need server (Step 2) |
| **Ready** | running | installed | healthy | Skip to Step 5 |

## Step 2: Get a Server Running

Ask the user:

```
How would you like to connect to Preclinical?

A) Self-host (recommended) — I'll clone the repo and start Docker services locally
B) Remote server — I already have a Preclinical server running (or my team hosts one)
```

### Path A: Self-Host

Check if Docker is installed:
```bash
docker --version
```

If Docker is missing, tell the user:
```
Preclinical runs as Docker containers. Install Docker Desktop first:
  macOS: https://docs.docker.com/desktop/install/mac-install/
  Linux: https://docs.docker.com/engine/install/

Then re-run /preclinical:setup
```

If Docker is available, clone and start:
```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
make setup
```

This copies `.env.example` to `.env` and starts services (database, API server, worker, BrowserUse).

Wait for services to be healthy (typically 30-60 seconds):
```bash
docker compose ps --format json
```

Tell the user:
```
Starting Preclinical services... this runs a database, API server, worker, and BrowserUse.
First startup downloads images (~2 GB) and may take a few minutes.
```

For browser testing against sites like ChatGPT/Claude/Gemini, also launch the Chrome pool:
```bash
make chrome
```

### Path B: Remote Server

Ask for the server URL and optional API key:
```
Enter your Preclinical server URL (e.g. https://preclinical.yourteam.com):
```

Configure it:
```bash
mkdir -p ~/.preclinical
cat > ~/.preclinical/config.toml << 'EOF'
api_url = "<server_url>"
# api_key = "<key>"  # uncomment if your server requires auth
EOF
```

## Step 3: Install CLI

```bash
preclinical --version
```

If not found:
```bash
pipx install preclinical
```

If `pipx` is not available:
```bash
pip install preclinical
```

If `pip` fails with "externally-managed-environment":
```bash
# macOS
brew install pipx && pipx install preclinical
# Ubuntu/Debian
sudo apt install pipx && pipx install preclinical
```

Verify:
```bash
preclinical --version
```

## Step 4: Verify Connection

```bash
preclinical health --json
```

If it fails and the user chose self-host, check Docker:
```bash
docker compose ps --format json
docker compose logs --tail 20
```

Common issues:
- Services still starting → wait 30 seconds, retry
- Port conflict → another process on port 3000
- Docker not running → `docker compose up -d`

## Step 5: Check for Agents

```bash
preclinical agents list --json
```

If no agents exist:
```
No agents configured yet. You need at least one agent to run tests.

Create one now? You'll need:
  - Agent name (e.g. "My Health Bot")
  - Provider type (openai, vapi, browser, livekit, pipecat, elevenlabs)
  - Connection config (API key, URL, etc.)

Or create one in the UI at http://localhost:3000
```

## Summary

Report final status:
```
Preclinical Setup Complete:
  Server:  connected (<url>)
  CLI:     v<version>
  Agents:  N configured

You're ready to go! Try:
  /preclinical:run          — run safety tests
  /preclinical:benchmark    — full safety benchmark
  /preclinical:create-scenario — add test scenarios
```

If anything failed, report what's still broken and suggest fixes.

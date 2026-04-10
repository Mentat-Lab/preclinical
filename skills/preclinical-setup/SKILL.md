---
name: preclinical-setup
description: Install and configure the Preclinical CLI for healthcare AI safety testing. Use when the user mentions preclinical, wants to test a healthcare AI agent, or when any other preclinical skill needs the CLI installed.
---

# Preclinical Setup

Ensure the `preclinical` CLI is installed and can reach the server.

## Step 1: Check Installation

```bash
preclinical --version
```

If not found, install: `pipx install preclinical` (preferred) or `pip install preclinical`. If pip fails with "externally-managed-environment", install pipx first (`brew install pipx` on macOS, `sudo apt install pipx` on Linux).

## Step 2: Check Server Connection

```bash
preclinical health --json
```

If it fails, the CLI defaults to `http://localhost:3000`. Configure a different server via:
- Env var: `export PRECLINICAL_API_URL=https://server-url.com`
- Config file: `~/.preclinical/config.toml` with `api_url = "https://server-url.com"`

## Step 3: Verify Agents Exist

```bash
preclinical agents list --json
```

If no agents, the user needs to create one first (via CLI or UI at http://localhost:3000). Supported providers: `openai`, `vapi`, `browser`, `livekit`, `pipecat`, `elevenlabs`.

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

- If the command succeeds, skip to Step 2.
- If not found, install from PyPI. Try these in order until one works:

```bash
pipx install preclinical
```

`pipx` is the preferred method — it installs into an isolated environment and works on macOS, Linux, and Windows without permission issues.

If `pipx` is not available:

```bash
pip install preclinical
```

If `pip` fails with "externally-managed-environment" (common on macOS with Homebrew Python and recent Linux distros), use one of:

```bash
# Install pipx first, then use it
brew install pipx && pipx install preclinical   # macOS
sudo apt install pipx && pipx install preclinical  # Ubuntu/Debian

# Or use pip with --user flag
pip install --user preclinical
```

After install, verify:

```bash
preclinical --version
```

## Step 2: Check Server Connection

```bash
preclinical health --json
```

If this succeeds with `"status": "ok"`, setup is complete.

If it fails:
- The CLI defaults to `http://localhost:3000`. If the server is elsewhere, the user needs to configure it.
- Ask the user for their Preclinical server URL.
- Three ways to configure (pick the simplest for the user):

**Option A — Environment variable:**
```bash
export PRECLINICAL_API_URL=https://their-server-url.com
```

**Option B — Config file:**
```bash
mkdir -p ~/.preclinical
cat > ~/.preclinical/config.toml << 'EOF'
api_url = "https://their-server-url.com"
# api_key = "optional-key"
EOF
```

**Option C — Per-command flag:**
```bash
preclinical --url https://their-server-url.com health
```

After configuring, re-run `preclinical health --json` to verify.

## Step 3: Verify Agents Exist

```bash
preclinical agents list --json
```

If no agents are configured, let the user know they need to create one before running tests. Supported providers: `openai`, `vapi`, `browser`, `livekit`, `pipecat`, `elevenlabs`. Guide them to use the CLI or the Preclinical UI at http://localhost:3000.

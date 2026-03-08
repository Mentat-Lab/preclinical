#!/usr/bin/env bash
# Deploy the Pipecat agent to Pipecat Cloud
#
# Usage:
#   ./scripts/deploy_cloud.sh
#
# Prerequisites:
#   1. pipecat-ai-cli installed: pipx install pipecat-ai-cli
#   2. Logged in: pipecat cloud auth login
#   3. Docker image built and pushed to Docker Hub
#   4. Secrets configured: pipecat cloud secrets set preclinical-pipecat-secrets --from-env-file .env

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
AGENT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/.." && pwd)"
ROOT_DIR="$(cd "${AGENT_DIR}/../.." && pwd)"
# Configuration
AGENT_NAME="preclinical-pipecat-agent"
IMAGE="mnvsk97/preclinical-pipecat-agent:1.0"
SECRET_SET="preclinical-pipecat-secrets"
MIN_AGENTS=0  # Scale to zero - no cost when idle

# Check for pipecat CLI
if ! command -v pipecat >/dev/null 2>&1; then
  echo "Error: Pipecat CLI not found." >&2
  echo "Install it with: pipx install pipecat-ai-cli" >&2
  echo "Or: uv tool install pipecat-ai-cli" >&2
  exit 1
fi

# Check for pcc-deploy.toml
if [[ ! -f "${AGENT_DIR}/pcc-deploy.toml" ]]; then
  echo "Error: pcc-deploy.toml not found in ${AGENT_DIR}" >&2
  exit 1
fi

# Check if user has updated the Docker image in pcc-deploy.toml
if grep -q "DOCKERHUB_USERNAME" "${AGENT_DIR}/pcc-deploy.toml"; then
  echo "Error: Please update pcc-deploy.toml with your Docker Hub username." >&2
  echo "Replace DOCKERHUB_USERNAME with your actual Docker Hub username." >&2
  exit 1
fi

echo "Deploying Pipecat agent to Pipecat Cloud..."
echo ""
echo "Make sure you have:"
echo "  1. Built the Docker image: docker build --platform=linux/arm64 -t <username>/preclinical-pipecat-agent:0.1 ."
echo "  2. Pushed to Docker Hub: docker push <username>/preclinical-pipecat-agent:0.1"
echo "  3. Set secrets: pcc secrets set preclinical-pipecat-secrets --file ${ROOT_DIR}/.env"
echo ""

cd "${AGENT_DIR}"
pcc deploy

echo "Deploying Pipecat agent to Pipecat Cloud..."
echo ""
echo "Configuration:"
echo "  Agent: ${AGENT_NAME}"
echo "  Image: ${IMAGE}"
echo "  Secrets: ${SECRET_SET}"
echo "  Min agents: ${MIN_AGENTS} (scale-to-zero enabled)"
echo ""
echo "Prerequisites (run once):"
echo "  1. pipecat cloud auth login"
echo "  2. docker build --platform=linux/arm64 -t ${IMAGE} ."
echo "  3. docker push ${IMAGE}"
echo "  4. pipecat cloud secrets set ${SECRET_SET} --from-env-file ${ROOT_DIR}/.env"
echo ""

# Deploy with scale-to-zero
pipecat cloud deploy "${AGENT_NAME}" "${IMAGE}" \
  --min-agents ${MIN_AGENTS} \
  --secrets "${SECRET_SET}" \
  --no-credentials \
  --force

echo ""
echo "Useful commands:"
echo "  List agents:   pipecat cloud agent list"
echo "  Agent status:  pipecat cloud agent status ${AGENT_NAME}"
echo "  Start session: pipecat cloud agent start ${AGENT_NAME}"
echo "  View logs:     pipecat cloud agent logs ${AGENT_NAME}"
echo "  Delete agent:  pipecat cloud agent delete ${AGENT_NAME}"

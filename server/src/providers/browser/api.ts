/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BrowserUse API helpers — session lifecycle and task polling.
 */

import { log } from '../../lib/logger.js';

const logger = log.child({ component: 'browser' });

const BROWSER_USE_API_BASE = process.env.BROWSER_USE_API_BASE || 'https://api.browser-use.com/api/v2';
const BROWSER_POLL_INTERVAL_MS = 1_500;
const BROWSER_TASK_TIMEOUT_MS = parseInt(process.env.BROWSER_TASK_TIMEOUT_MS || '3600000', 10);

export { BROWSER_USE_API_BASE };

export function apiHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) h['X-Browser-Use-API-Key'] = apiKey;
  return h;
}

export async function createSession(
  apiKey: string,
  domain: string,
  allowedDomains?: string[],
  agentmailApiKey?: string,
): Promise<{ id: string; liveUrl: string; inboxAddress: string }> {
  const body: Record<string, unknown> = {
    domain,
    allowed_domains: allowedDomains,
  };
  if (agentmailApiKey) body.agentmail_api_key = agentmailApiKey;

  const response = await fetch(`${BROWSER_USE_API_BASE}/sessions`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`BrowserUse session creation failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json() as any;
  return {
    id: data.id,
    liveUrl: data.live_url || data.liveUrl || '',
    inboxAddress: data.inbox_address || '',
  };
}

export async function pollTask(apiKey: string, taskId: string): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < BROWSER_TASK_TIMEOUT_MS) {
    const response = await fetch(`${BROWSER_USE_API_BASE}/tasks/${taskId}`, {
      headers: apiHeaders(apiKey),
    });

    if (!response.ok) {
      throw new Error(`BrowserUse task poll failed (${response.status}): ${await response.text()}`);
    }

    const data = await response.json() as any;
    if (['finished', 'stopped', 'failed'].includes(data.status)) return data;

    await new Promise((resolve) => setTimeout(resolve, BROWSER_POLL_INTERVAL_MS));
  }

  throw new Error(`BrowserUse task timed out after ${BROWSER_TASK_TIMEOUT_MS}ms`);
}

// ---------------------------------------------------------------------------
// Action History — login replay cache
// ---------------------------------------------------------------------------

export async function extractLoginActions(
  apiKey: string,
  domain: string,
  historyPath: string,
  messageText: string,
): Promise<{ setup_actions?: unknown[]; chat_actions?: unknown[] } | null> {
  try {
    const response = await fetch(`${BROWSER_USE_API_BASE}/action-histories/extract`, {
      method: 'POST',
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ domain, history_path: historyPath, message_text: messageText }),
    });
    if (!response.ok) return null;
    return await response.json() as any;
  } catch (err) {
    logger.warn('Failed to extract actions', { domain, error: err });
    return null;
  }
}

export async function closeSession(apiKey: string, sessionId: string): Promise<void> {
  try {
    await fetch(`${BROWSER_USE_API_BASE}/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ action: 'stop' }),
    });
  } catch (err) {
    logger.warn('Failed to close session', { sessionId, error: err });
  }
}

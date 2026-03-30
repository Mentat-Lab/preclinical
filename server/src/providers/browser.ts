/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BrowserUse Cloud provider.
 *
 * Automates browser-based chat testing via the BrowserUse API.
 * Creates a headless browser session, navigates to the target URL,
 * and interacts with the chat widget.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerProvider, type Provider, type ProviderSession, type MessageContext } from './base.js';
import { config } from '../lib/config.js';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'browser' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedDir = join(__dirname, '..', 'shared');

const BROWSER_USE_API_BASE = process.env.BROWSER_USE_API_BASE || 'http://localhost:9000/api/v2';
const BROWSER_POLL_INTERVAL_MS = 3_000;
const BROWSER_TASK_TIMEOUT_MS = parseInt(process.env.BROWSER_TASK_TIMEOUT_MS || '3600000', 10); // 1 hour default per browser turn

// =============================================================================
// TYPES
// =============================================================================

interface BrowserProfile {
  browser_setup_instructions: string;
  browser_chat_instructions: string;
  browser_overlay_hint: string;
  requires_auth?: boolean;
  email_verification?: boolean;
  email_subject_hint?: string;
  browser_signup_instructions?: string;
  browser_login_instructions?: string;
  browser_verify_instructions?: string;
}

interface BrowserState {
  apiKey: string;
  targetUrl: string;
  agentConfig: Record<string, unknown>;
  sessionId?: string;
  liveUrl?: string;
  profile?: BrowserProfile;
}

const BROWSERUSE_STRUCTURED_OUTPUT = JSON.stringify({
  type: 'object',
  properties: {
    bot_response: { type: 'string', description: 'The full text of the chatbot/assistant response message' },
    overlay_text: { type: 'string', description: 'Text from a NEW modal, popup, or emergency alert that appeared AFTER the message was sent. Empty string if none.' },
    response_received: { type: 'boolean', description: 'Whether a chatbot response was detected' },
  },
  required: ['bot_response', 'response_received'],
});

// =============================================================================
// BROWSER PROFILE LOADER
// =============================================================================

const PROFILE_KEYS: (keyof BrowserProfile)[] = [
  'browser_setup_instructions', 'browser_chat_instructions', 'browser_overlay_hint',
  'browser_signup_instructions', 'browser_login_instructions', 'browser_verify_instructions',
  'email_subject_hint',
];

async function loadBrowserProfile(
  targetUrl: string,
  agentConfig: Record<string, unknown>,
): Promise<BrowserProfile> {
  const basePath = join(sharedDir, 'browser-profiles');

  let domain = '';
  try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch { /* skip */ }

  const candidates = domain
    ? [join(basePath, `${domain}.json`), join(basePath, '_default.json')]
    : [join(basePath, '_default.json')];

  for (const filePath of candidates) {
    try {
      const profile = JSON.parse(await readFile(filePath, 'utf-8'));
      logger.info('Loaded profile', { filePath });
      return {
        ...Object.fromEntries(PROFILE_KEYS.map(k => [k, profile[k] || ''])),
        requires_auth: !!profile.requires_auth,
        email_verification: !!profile.email_verification,
      } as BrowserProfile;
    } catch { /* file not found, try next */ }
  }

  // Fallback: build from agent config
  return {
    ...Object.fromEntries(PROFILE_KEYS.map(k => [k, String(agentConfig[k] || '')])),
    requires_auth: agentConfig.requires_auth === 'true' || agentConfig.requires_auth === true,
    email_verification: agentConfig.email_verification === 'true' || agentConfig.email_verification === true,
  } as BrowserProfile;
}

// =============================================================================
// BROWSERUSE API HELPERS
// =============================================================================

function apiHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) h['X-Browser-Use-API-Key'] = apiKey;
  return h;
}

async function createSession(apiKey: string): Promise<{ id: string; liveUrl: string }> {
  const response = await fetch(`${BROWSER_USE_API_BASE}/sessions`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`BrowserUse session creation failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json() as any;
  return { id: data.id, liveUrl: data.live_url || data.liveUrl || '' };
}

async function pollTask(apiKey: string, taskId: string): Promise<Record<string, unknown>> {
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

async function closeSession(apiKey: string, sessionId: string): Promise<void> {
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

// =============================================================================
// TASK PROMPT BUILDER
// =============================================================================

const DEFAULT_SETUP = 'If there is any terms/consent/agreement checkbox or button, check it and accept. If there is a demographics or intake form, fill in age {age}, select {gender}, and submit.';
const DEFAULT_CHAT = 'Find the chat input field, type the message and send it (press Enter or click send).';
const DEFAULT_OVERLAY = 'Only capture NEW modals or popups that appeared AFTER you sent the message (e.g. a modal telling the user to call 911). Do NOT include persistent banners, disclaimers, or static text that was already on the page.';

function buildTaskPrompt(
  profile: BrowserProfile,
  message: string,
  targetUrl: string,
  turn: number,
  persona: Record<string, unknown> | null,
  agentConfig: Record<string, unknown>,
): string {
  const p = persona || {};
  let age = String(p.age_range || '35');
  if (age.includes('-')) age = age.split('-')[0];
  const gender = String(p.gender || p.sex || 'male');

  // Agent-level creds override global BROWSER_EMAIL/BROWSER_PASSWORD
  const email = String(agentConfig.email || config.browserEmail || '');
  const password = String(agentConfig.password || config.browserPassword || '');
  const hasCredentials = !!(email && password);
  const extraInstructions = String(agentConfig.instructions || '').trim();

  const setupInstructions = (profile.browser_setup_instructions || DEFAULT_SETUP)
    .replace(/\{age\}/g, age).replace(/\{gender\}/g, gender);
  const chatInstructions = profile.browser_chat_instructions || DEFAULT_CHAT;
  const overlayHint = profile.browser_overlay_hint || DEFAULT_OVERLAY;
  const waitInstructions = 'Wait for the chatbot to fully respond (the response may stream in gradually — wait until it stops changing).';
  const extraStep = extraInstructions ? ` ${extraInstructions}` : '';

  // Build login instructions for turn 1 when credentials are available
  let loginStep = '';
  if (turn === 1 && hasCredentials) {
    if (profile.browser_login_instructions) {
      loginStep = profile.browser_login_instructions
        .replace(/\{url\}/g, targetUrl)
        .replace(/\{email\}/g, email)
        .replace(/\{password\}/g, password) + ' ';
    } else {
      loginStep = `Go to ${targetUrl}. If a login or sign-in page appears, sign in with email "${email}" and password "${password}". Complete any verification steps. Once logged in, dismiss any popups or banners. `;
    }
  }

  if (turn === 1) {
    const nav = loginStep || `Go to ${targetUrl}. ${setupInstructions} `;
    return `${nav}${extraStep} Then ${chatInstructions.charAt(0).toLowerCase()}${chatInstructions.slice(1)} Message to send: "${message}". ${waitInstructions} Then extract the complete text of the chatbot's response. Overlay check: ${overlayHint}`;
  }
  return `In the chat that is already open on the page, ${chatInstructions.charAt(0).toLowerCase()}${chatInstructions.slice(1)} Message to send: "${message}". ${waitInstructions} Then extract the complete text of the chatbot's latest response only (not previous messages). Overlay check: ${overlayHint}`;
}

// =============================================================================
// PROVIDER
// =============================================================================

const browserProvider: Provider = {
  name: 'browser',

  async connect(agentConfig): Promise<ProviderSession> {
    const apiKey = config.browserUseApiKey; // optional — not needed for local worker

    const targetUrl = String(agentConfig.url || agentConfig.endpoint || '');
    if (!targetUrl) throw new Error('Agent missing url in config for browser provider');

    return {
      provider: 'browser',
      state: {
        apiKey,
        targetUrl,
        agentConfig: agentConfig as Record<string, unknown>,
      } satisfies BrowserState,
    };
  },

  async sendMessage(session, message, context): Promise<string> {
    const state = session.state as BrowserState;
    const headers = apiHeaders(state.apiKey);

    // Create session on first turn
    if (context.turn === 1) {
      const browserSession = await createSession(state.apiKey);
      state.sessionId = browserSession.id;
      state.liveUrl = browserSession.liveUrl;
      logger.info('Session created', { sessionId: browserSession.id });
    }

    if (!state.sessionId) throw new Error('No browser session ID available');

    // Load browser profile (cache after first load)
    if (!state.profile) {
      state.profile = await loadBrowserProfile(state.targetUrl, state.agentConfig);
    }

    const taskPrompt = buildTaskPrompt(
      state.profile, message, state.targetUrl, context.turn, context.persona || null, state.agentConfig,
    );

    async function createAndPollTask(activeSessionId: string): Promise<Record<string, unknown>> {
      const taskBody: Record<string, unknown> = {
        task: taskPrompt,
        sessionId: activeSessionId,
        maxSteps: context.turn === 1 ? 20 : 15,
        structuredOutput: BROWSERUSE_STRUCTURED_OUTPUT,
      };
      if (context.turn === 1) taskBody.startUrl = state.targetUrl;

      const taskResponse = await fetch(`${BROWSER_USE_API_BASE}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(taskBody),
      });

      if (!taskResponse.ok) {
        throw new Error(`BrowserUse task creation failed (${taskResponse.status}): ${await taskResponse.text()}`);
      }

      const taskData = await taskResponse.json() as any;
      if (!taskData.id) throw new Error('BrowserUse task creation returned no id');

      logger.info('Task created', { taskId: taskData.id, turn: context.turn });
      return await pollTask(state.apiKey, taskData.id);
    }

    // Attempt the task, recovering from dead sessions
    let result: Record<string, unknown>;
    try {
      result = await createAndPollTask(state.sessionId);
    } catch (taskError) {
      const errMsg = taskError instanceof Error ? taskError.message : String(taskError);
      const isDeadSession = errMsg.includes('session is stopped') ||
        errMsg.includes('session is closed') ||
        (errMsg.includes('task creation failed') && errMsg.includes('400'));

      if (isDeadSession) {
        logger.info('Session dead, creating fresh session');
        const freshSession = await createSession(state.apiKey);
        state.sessionId = freshSession.id;
        result = await createAndPollTask(freshSession.id);
      } else {
        throw taskError;
      }
    }

    if (result.status !== 'finished' || !result.isSuccess) {
      const output = String(result.output || '').slice(0, 500);
      throw new Error(`BrowserUse task failed: status=${result.status}, output=${output}`);
    }

    // Extract response
    const parsed = (result.parsed || {}) as Record<string, unknown>;
    let botResponse = String(parsed.bot_response || '');
    let overlayText = String(parsed.overlay_text || '');

    if (!botResponse) {
      const rawOutput = String(result.output || '');
      if (rawOutput.startsWith('{')) {
        try {
          const parsedOutput = JSON.parse(rawOutput);
          botResponse = String(parsedOutput.bot_response || rawOutput);
          overlayText = overlayText || String(parsedOutput.overlay_text || '');
        } catch {
          botResponse = rawOutput;
        }
      } else {
        botResponse = rawOutput;
      }
    }

    if (!botResponse) throw new Error('BrowserUse task returned empty bot response');
    if (overlayText) botResponse = `${botResponse}\n\n[Alert: ${overlayText}]`;

    return botResponse;
  },

  async disconnect(session): Promise<void> {
    const state = session.state as BrowserState;
    if (state.sessionId) {
      await closeSession(state.apiKey, state.sessionId);
    }
  },
};

registerProvider(browserProvider);

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BrowserUse provider.
 *
 * Automates browser-based chat testing via the BrowserUse local worker API.
 * Creates a headless browser session, navigates to the target URL,
 * and interacts with the chat widget.
 *
 * Enhanced features:
 *   - Cookie/storage state persistence per domain (skip re-login on subsequent runs)
 *   - sensitive_data for safe credential handling (not embedded in task prompt)
 *   - extraction_schema for structured output via proper schema
 *   - extend_system_message for overlay hints and chat context
 *   - allowed_domains to lock agent to target site
 *   - save_conversation + generate_gif for debugging
 *   - Configurable step_timeout and max_actions_per_step
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerProvider, type Provider, type ProviderSession, type MessageContext } from '../base.js';
import { config } from '../../lib/config.js';
import { sql } from '../../lib/db.js';
import { log } from '../../lib/logger.js';

const logger = log.child({ component: 'browser' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedDir = join(__dirname, '..', 'shared');

const BROWSER_USE_API_BASE = process.env.BROWSER_USE_API_BASE || 'http://localhost:9000/api/v2';
const BROWSER_POLL_INTERVAL_MS = 1_500;
const BROWSER_TASK_TIMEOUT_MS = parseInt(process.env.BROWSER_TASK_TIMEOUT_MS || '3600000', 10);
const BROWSER_STEP_TIMEOUT = parseInt(process.env.BROWSER_STEP_TIMEOUT || '60', 10);
const BROWSER_MAX_ACTIONS_PER_STEP = parseInt(process.env.BROWSER_MAX_ACTIONS_PER_STEP || '5', 10);
const BROWSER_USE_VISION = process.env.BROWSER_USE_VISION === '1';
const BROWSER_SAVE_CONVERSATIONS = process.env.BROWSER_SAVE_CONVERSATIONS === '1';
const BROWSER_GENERATE_GIFS = process.env.BROWSER_GENERATE_GIFS === '1';

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
  auth_domains?: string[];
  browser_signup_instructions?: string;
  browser_login_instructions?: string;
  browser_verify_instructions?: string;
}

interface BrowserState {
  apiKey: string;
  targetUrl: string;
  domain: string;
  agentConfig: Record<string, unknown>;
  sessionId?: string;
  liveUrl?: string;
  profile?: BrowserProfile;
  scenarioRunId: string;
  inboxAddress?: string; // AgentMail disposable email for signup flows
}

const EXTRACTION_SCHEMA = {
  bot_response: {
    type: 'string',
    description: 'The full text of the chatbot/assistant response message',
  },
  overlay_text: {
    type: 'string',
    description: 'Text from a NEW modal, popup, or emergency alert that appeared AFTER the message was sent. Empty string if none.',
  },
  response_received: {
    type: 'boolean',
    description: 'Whether a chatbot response was detected',
  },
};

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
        auth_domains: Array.isArray(profile.auth_domains) ? profile.auth_domains : [],
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
// DOMAIN HELPER
// =============================================================================

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return (parsed.hostname || '').replace(/^www\./, '');
  } catch {
    return '';
  }
}

// =============================================================================
// BROWSERUSE API HELPERS
// =============================================================================

function apiHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) h['X-Browser-Use-API-Key'] = apiKey;
  return h;
}

async function createSession(
  apiKey: string,
  domain: string,
  allowedDomains?: string[],
  agentmailApiKey?: string,
  browserbaseContextId?: string,
): Promise<{ id: string; liveUrl: string; inboxAddress: string }> {
  const body: Record<string, unknown> = {
    domain,
    allowed_domains: allowedDomains,
  };
  if (agentmailApiKey) body.agentmail_api_key = agentmailApiKey;
  if (browserbaseContextId) body.browserbase_context_id = browserbaseContextId;

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

function buildSystemMessageExtension(
  profile: BrowserProfile,
  persona: Record<string, unknown> | null,
): string {
  const p = persona || {};
  let age = String(p.age_range || '35');
  if (age.includes('-')) age = age.split('-')[0];
  const gender = String(p.gender || p.sex || 'male');

  const overlayHint = profile.browser_overlay_hint || DEFAULT_OVERLAY;
  const chatInstructions = profile.browser_chat_instructions || DEFAULT_CHAT;
  const setupInstructions = (profile.browser_setup_instructions || DEFAULT_SETUP)
    .replace(/\{age\}/g, age).replace(/\{gender\}/g, gender);

  return [
    '## Chat interaction rules',
    `- To send messages: ${chatInstructions}`,
    `- After sending, wait for the chatbot to fully respond (the response may stream in gradually — wait until it stops changing).`,
    `- Setup/intake: ${setupInstructions}`,
    '',
    '## Response extraction rules',
    `- Extract the COMPLETE text of the chatbot\'s latest response only (not previous messages).`,
    `- Overlay detection: ${overlayHint}`,
    `- Return structured output with bot_response (full text) and overlay_text (new popups only, empty if none).`,
  ].join('\n');
}

function buildTaskPrompt(
  profile: BrowserProfile,
  message: string,
  targetUrl: string,
  turn: number,
  agentConfig: Record<string, unknown>,
  inboxAddress?: string,
): string {
  const email = String(agentConfig.email || config.browserEmail || '');
  const password = String(agentConfig.password || config.browserPassword || '');
  const hasCredentials = !!(email && password);
  const hasBrowserbaseContext = !!String(agentConfig.browserbase_context_id || '').trim();
  const extraInstructions = String(agentConfig.instructions || '').trim();
  const extraStep = extraInstructions ? ` ${extraInstructions}` : '';

  // AgentMail signup flow — fresh disposable email, bypasses Cloudflare login issues
  const useAgentMailSignup = !!(inboxAddress && profile.email_verification);

  let authStep = '';
  if (turn === 1 && hasBrowserbaseContext) {
    // Pre-authenticated context — skip login entirely, cookies already present
  } else if (turn === 1 && useAgentMailSignup) {
    // Signup flow with AgentMail: use get_email_address + get_latest_email tools
    if (profile.browser_signup_instructions) {
      authStep = profile.browser_signup_instructions
        .replace(/\{url\}/g, targetUrl)
        .replace(/\{email\}/g, '%email%')
        .replace(/\{password\}/g, '%password%') + ' ';
    } else {
      authStep = `Go to ${targetUrl}. Sign up for a new account. Use the get_email_address tool to get your email address, and use %password% as the password. `;
    }
    // Add verification step
    if (profile.browser_verify_instructions) {
      const verifyStep = profile.browser_verify_instructions
        .replace(/\{otp\}/g, 'THE_CODE_FROM_EMAIL');
      authStep += `After submitting signup, ${verifyStep} `;
    } else {
      authStep += 'After submitting signup, use the get_latest_email tool to retrieve the verification email. Find the code or link in the email and use it to complete verification. ';
    }
  } else if (turn === 1 && hasCredentials) {
    // Standard login flow (existing behavior)
    if (profile.browser_login_instructions) {
      authStep = profile.browser_login_instructions
        .replace(/\{url\}/g, targetUrl)
        .replace(/\{email\}/g, '%email%')
        .replace(/\{password\}/g, '%password%') + ' ';
    } else {
      authStep = `Go to ${targetUrl}. If a login or sign-in page appears, sign in with the provided credentials. Complete any verification steps. Once logged in, dismiss any popups or banners. `;
    }
  }

  if (turn === 1) {
    const nav = authStep || `Go to ${targetUrl}. `;
    return `${nav}${extraStep} Send this message in the chat: "${message}". Then extract the chatbot's response.`;
  }
  return `In the chat that is already open, send this message: "${message}". Then extract the chatbot's latest response only.`;
}

function buildSensitiveData(
  domain: string,
  agentConfig: Record<string, unknown>,
  inboxAddress?: string,
): Record<string, string> | undefined {
  // AgentMail signup: use disposable inbox as email, keep password from config
  const email = inboxAddress || String(agentConfig.email || config.browserEmail || '');
  const password = String(agentConfig.password || config.browserPassword || '');
  if (!email && !password) return undefined;

  const data: Record<string, string> = {};
  if (email) data.email = email;
  if (password) data.password = password;
  return data;
}

// =============================================================================
// DISCOVERY — explore a URL and produce a browser profile
// =============================================================================

export interface DiscoveryResult {
  profile: BrowserProfile & { domain: string; name: string };
  discovery: Record<string, unknown>;
  validated: boolean;
  validationResponse: string;
}

export async function discoverProfile(
  targetUrl: string,
  credentials?: { email?: string; password?: string },
  validate = true,
): Promise<DiscoveryResult> {
  const apiKey = config.browserUseApiKey;

  const body: Record<string, unknown> = {
    url: targetUrl,
    validate,
  };
  if (credentials?.email) body.email = credentials.email;
  if (credentials?.password) body.password = credentials.password;

  const response = await fetch(`${BROWSER_USE_API_BASE}/discover`, {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discovery failed (${response.status}): ${text}`);
  }

  const data = await response.json() as any;

  return {
    profile: data.profile,
    discovery: data.discovery,
    validated: !!data.validated,
    validationResponse: data.validation_response || '',
  };
}

// =============================================================================
// PROVIDER
// =============================================================================

const browserProvider: Provider = {
  name: 'browser',

  async connect(agentConfig, scenarioRunId): Promise<ProviderSession> {
    const apiKey = config.browserUseApiKey; // optional — not needed for local worker

    const targetUrl = String(agentConfig.url || agentConfig.endpoint || '');
    if (!targetUrl) throw new Error('Agent missing url in config for browser provider');

    const domain = extractDomain(targetUrl);

    return {
      provider: 'browser',
      state: {
        apiKey,
        targetUrl,
        domain,
        agentConfig: agentConfig as Record<string, unknown>,
        scenarioRunId,
      } satisfies BrowserState,
    };
  },

  async sendMessage(session, message, context): Promise<string> {
    const state = session.state as BrowserState;
    const headers = apiHeaders(state.apiKey);

    // BrowserUse Cloud runtime is not yet implemented — profile setup is ready but runtime needs more work
    if (state.agentConfig.browser_backend === 'browseruse_cloud') {
      throw new Error('BrowserUse Cloud runtime not yet implemented — use Browserbase or Local Chrome');
    }

    // Load browser profile (cache after first load) — needed before session creation for auth_domains
    if (!state.profile) {
      state.profile = await loadBrowserProfile(state.targetUrl, state.agentConfig);
    }

    // Build allowed domains: target domain + auth domains from profile (e.g. auth.openai.com for chatgpt.com)
    const allowedDomains = state.domain
      ? [state.domain, ...(state.profile.auth_domains || [])]
      : undefined;

    // Create session on first turn — no AgentMail yet (try login/cookies first)
    const browserbaseContextId = String(state.agentConfig.browserbase_context_id || '').trim() || undefined;
    if (context.turn === 1) {
      const browserSession = await createSession(state.apiKey, state.domain, allowedDomains, undefined, browserbaseContextId);
      state.sessionId = browserSession.id;
      state.liveUrl = browserSession.liveUrl;
      logger.info('Session created', { sessionId: browserSession.id, domain: state.domain, browserbaseContext: !!browserbaseContextId });
    }

    if (!state.sessionId) throw new Error('No browser session ID available');

    // Check if agent already has credentials (from previous AgentMail signup or manual config)
    const hasExistingCredentials = !!(
      String(state.agentConfig.email || '').trim() &&
      String(state.agentConfig.password || config.browserPassword || '').trim()
    );

    // Check if AgentMail fallback is available for this profile
    // Skip fallback when using a pre-authenticated Browserbase context
    // Skip if agent already has credentials (use login recovery instead)
    const canFallbackToAgentMail = !!(
      !state.inboxAddress &&
      !hasExistingCredentials &&
      !browserbaseContextId &&
      config.agentmailApiKey &&
      state.profile.email_verification
    );

    // Can recover from mid-conversation auth failures with a fresh login session
    const canRecoverWithLogin = !!(
      hasExistingCredentials &&
      context.turn > 1
    );

    const taskPrompt = buildTaskPrompt(
      state.profile, message, state.targetUrl, context.turn, state.agentConfig, state.inboxAddress,
    );
    const systemExt = buildSystemMessageExtension(state.profile, context.persona || null);
    const sensitiveData = buildSensitiveData(state.domain, state.agentConfig, state.inboxAddress);

    async function createAndPollTask(activeSessionId: string, prompt: string, sd: Record<string, string> | undefined, maxSteps: number): Promise<Record<string, unknown>> {
      const taskBody: Record<string, unknown> = {
        task: prompt,
        sessionId: activeSessionId,
        maxSteps,
        extraction_schema: EXTRACTION_SCHEMA,
        extend_system_message: systemExt,
        max_actions_per_step: BROWSER_MAX_ACTIONS_PER_STEP,
        step_timeout: BROWSER_STEP_TIMEOUT,
        use_vision: BROWSER_USE_VISION,
        save_conversation: BROWSER_SAVE_CONVERSATIONS,
        generate_gif: BROWSER_GENERATE_GIFS,
        run_id: state.scenarioRunId,
      };

      if (sd) taskBody.sensitive_data = sd;
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

    // Helper: close old session before creating a fresh one (prevents Chrome pool leaks)
    async function closeOldSession(): Promise<void> {
      if (state.sessionId) {
        await closeSession(state.apiKey, state.sessionId);
        state.sessionId = undefined;
      }
    }

    // Attempt the task — login first, AgentMail signup as fallback
    let result: Record<string, unknown>;
    let authFailed = false;
    try {
      result = await createAndPollTask(state.sessionId, taskPrompt, sensitiveData, context.turn === 1 ? 12 : 8);

      // Check if task finished but failed to get a response (likely auth/Cloudflare issue).
      // Only trigger fallback on hard failures — task explicitly !isSuccess.
      // An empty bot_response alone is NOT enough (chatbot might just be down).
      if (!result.isSuccess && (canFallbackToAgentMail || canRecoverWithLogin)) {
        authFailed = true;
        logger.info('Task failed — auth issue suspected', { turn: context.turn, isSuccess: result.isSuccess, hasCredentials: hasExistingCredentials });
      }
    } catch (taskError) {
      const errMsg = taskError instanceof Error ? taskError.message : String(taskError);
      const isDeadSession = errMsg.includes('session is stopped') ||
        errMsg.includes('session is closed') ||
        (errMsg.includes('task creation failed') && errMsg.includes('400'));

      if (isDeadSession && !canFallbackToAgentMail && !canRecoverWithLogin) {
        // Dead session, no recovery options — just get a fresh session and retry
        logger.info('Session dead, creating fresh session');
        await closeOldSession();
        const freshSession = await createSession(state.apiKey, state.domain, allowedDomains, undefined, browserbaseContextId);
        state.sessionId = freshSession.id;
        result = await createAndPollTask(freshSession.id, taskPrompt, sensitiveData, 12);
      } else if (canFallbackToAgentMail || canRecoverWithLogin) {
        // Task threw — Cloudflare, timeout, dead session, etc.
        authFailed = true;
        result = {} as Record<string, unknown>;
        logger.info('Task threw — auth recovery will activate', { turn: context.turn, hasCredentials: hasExistingCredentials, error: errMsg.slice(0, 200) });
      } else {
        throw taskError;
      }
    }

    // Login recovery: auth failed mid-conversation, but agent has saved credentials — fresh session + login
    if (authFailed && canRecoverWithLogin) {
      logger.info('Mid-conversation auth gate — recovering with login', { turn: context.turn, email: String(state.agentConfig.email || '').slice(0, 20) });
      await closeOldSession();
      const allowedDomains = state.domain ? [state.domain] : undefined;
      const freshSession = await createSession(state.apiKey, state.domain, allowedDomains, undefined, browserbaseContextId);
      state.sessionId = freshSession.id;
      // Build a turn-1 style prompt with login + the current message
      const loginPrompt = buildTaskPrompt(
        state.profile!, message, state.targetUrl, 1, state.agentConfig,
      );
      const loginSensitiveData = buildSensitiveData(state.domain, state.agentConfig);
      result = await createAndPollTask(freshSession.id, loginPrompt, loginSensitiveData, 15);
    }

    // AgentMail fallback: auth failed, no existing credentials — fresh session + signup
    if (authFailed && !canRecoverWithLogin && canFallbackToAgentMail) {
      logger.info('Auth failed, falling back to AgentMail signup', { turn: context.turn });
      await closeOldSession();
      const freshSession = await createSession(state.apiKey, state.domain, allowedDomains, config.agentmailApiKey, browserbaseContextId);
      state.sessionId = freshSession.id;
      state.inboxAddress = freshSession.inboxAddress || undefined;

      if (state.inboxAddress) {
        logger.info('AgentMail fallback activated', { inbox: state.inboxAddress, turn: context.turn });
        // For mid-conversation fallback, re-navigate and send the same message
        const signupPrompt = buildTaskPrompt(
          state.profile!, message, state.targetUrl, 1, state.agentConfig, state.inboxAddress,
        );
        const signupSensitiveData = buildSensitiveData(state.domain, state.agentConfig, state.inboxAddress);
        result = await createAndPollTask(freshSession.id, signupPrompt, signupSensitiveData, 20);

        // Persist credentials to agent config so future runs reuse this account
        const agentId = String(state.agentConfig._agent_id || '');
        const password = String(state.agentConfig.password || config.browserPassword || '');
        if (agentId && result.isSuccess) {
          try {
            await sql`
              UPDATE agents
              SET config = config || ${sql.json({ email: state.inboxAddress, password })}::jsonb,
                  updated_at = NOW()
              WHERE id = ${agentId}
            `;
            // Also update in-memory config so subsequent turns use login instead of signup
            state.agentConfig.email = state.inboxAddress;
            logger.info('Saved AgentMail credentials to agent', { agentId, email: state.inboxAddress, domain: state.domain });
          } catch (err) {
            logger.warn('Failed to persist AgentMail credentials', { error: err });
          }
        }
      } else {
        throw new Error('AgentMail fallback failed — could not create inbox');
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

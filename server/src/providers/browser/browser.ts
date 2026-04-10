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

import { registerProvider, type Provider, type ProviderSession } from '../base.js';
import { config } from '../../lib/config.js';
import { upsertBrowserProfileCredentials, upsertLoginActions, clearLoginActions } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import type { BrowserState } from './types.js';
import { EXTRACTION_SCHEMA } from './types.js';
import { apiHeaders, createSession, pollTask, closeSession, extractLoginActions, BROWSER_USE_API_BASE } from './api.js';
import { loadBrowserProfile } from './profile-loader.js';
import { buildSystemMessageExtension, buildTaskPrompt, buildSensitiveData } from './system-message.js';

// Re-export public API so existing imports from 'browser/browser.js' keep working
export { discoverProfile, type DiscoveryResult } from './discovery.js';

const logger = log.child({ component: 'browser' });

const BROWSER_STEP_TIMEOUT = parseInt(process.env.BROWSER_STEP_TIMEOUT || '60', 10);
const BROWSER_MAX_ACTIONS_PER_STEP = parseInt(process.env.BROWSER_MAX_ACTIONS_PER_STEP || '5', 10);
const BROWSER_USE_VISION = process.env.BROWSER_USE_VISION === '1';
const BROWSER_SAVE_CONVERSATIONS = process.env.BROWSER_SAVE_CONVERSATIONS === '1';
const BROWSER_GENERATE_GIFS = process.env.BROWSER_GENERATE_GIFS === '1';

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

    // Load browser profile + domain credentials + cached login actions (cache after first load)
    let profileLoginActions: Array<Record<string, unknown>> | null = null;
    if (!state.profile) {
      const loaded = await loadBrowserProfile(state.targetUrl, state.agentConfig);
      state.profile = loaded.profile;
      profileLoginActions = loaded.loginActions;
      // Domain credentials from browser_profiles table (saved from previous AgentMail signups)
      if (loaded.credentials.email) {
        state.credentials = loaded.credentials as { email?: string; password?: string };
      }
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

    // Check if credentials exist — profile credentials (DB) take priority over agent config
    const credEmail = String(state.credentials?.email || state.agentConfig.email || '').trim();
    const credPassword = String(state.credentials?.password || state.agentConfig.password || config.browserPassword || '').trim();
    const hasExistingCredentials = !!(credEmail && credPassword);

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

    // Check for cached login actions on turn 1 (skip LLM for login replay)
    // Skip when using a pre-authenticated Browserbase context (already logged in)
    let cachedLoginActions: Array<Record<string, unknown>> | null = null;
    if (context.turn === 1 && !browserbaseContextId && profileLoginActions?.length) {
      cachedLoginActions = profileLoginActions;
      logger.info('Using cached login actions from DB', { domain: state.domain, actionCount: cachedLoginActions.length });
    }

    const taskPrompt = cachedLoginActions
      ? `The browser is already logged in and on the site. Send this message in the chat: "${message}". Then wait for and extract the chatbot's complete response.`
      : buildTaskPrompt(state.profile, message, state.targetUrl, context.turn, state.agentConfig, state.inboxAddress, state.credentials);
    const systemExt = buildSystemMessageExtension(state.profile, context.persona || null);
    const sensitiveData = buildSensitiveData(state.domain, state.agentConfig, state.inboxAddress, state.credentials);

    async function createAndPollTask(activeSessionId: string, prompt: string, sd: Record<string, string> | undefined, maxSteps: number, opts?: { initialActions?: Array<Record<string, unknown>>; saveHistory?: boolean; flashMode?: boolean }): Promise<Record<string, unknown>> {
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
      if (opts?.initialActions) taskBody.initial_actions = opts.initialActions;
      if (opts?.saveHistory) taskBody.save_action_history = true;
      if (opts?.flashMode) taskBody.flash_mode = true;

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
    const turn1Steps = cachedLoginActions ? 6 : 12; // fewer LLM steps when login is replayed
    try {
      result = await createAndPollTask(
        state.sessionId, taskPrompt, sensitiveData,
        context.turn === 1 ? turn1Steps : 8,
        context.turn === 1 ? {
          initialActions: cachedLoginActions || undefined,
          saveHistory: !cachedLoginActions, // record history only on first (non-replay) run
          flashMode: !!cachedLoginActions,  // flash mode when replaying (only message-sending needs LLM)
        } : undefined,
      );

      // Replay failure: cached login actions didn't work (site changed, stale DOM, etc.)
      // Invalidate cache and retry with full LLM-driven login
      if (!result.isSuccess && cachedLoginActions && context.turn === 1) {
        logger.info('Login replay failed — invalidating cache and retrying with LLM', { domain: state.domain });
        await clearLoginActions(state.domain).catch(() => {});
        cachedLoginActions = null;
        await closeOldSession();
        const freshSession = await createSession(state.apiKey, state.domain, allowedDomains, undefined, browserbaseContextId);
        state.sessionId = freshSession.id;
        const fullPrompt = buildTaskPrompt(state.profile!, message, state.targetUrl, 1, state.agentConfig, state.inboxAddress, state.credentials);
        result = await createAndPollTask(freshSession.id, fullPrompt, sensitiveData, 12, { saveHistory: true });
      }

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
        state.profile!, message, state.targetUrl, 1, state.agentConfig, undefined, state.credentials,
      );
      const loginSensitiveData = buildSensitiveData(state.domain, state.agentConfig, undefined, state.credentials);
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
        const signupSensitiveData = buildSensitiveData(state.domain, state.agentConfig, state.inboxAddress, state.credentials);
        result = await createAndPollTask(freshSession.id, signupPrompt, signupSensitiveData, 20);

        // Persist credentials to browser_profiles table so ALL agents for this domain reuse this account
        if (result.isSuccess && state.domain) {
          try {
            const password = String(state.agentConfig.password || config.browserPassword || '');
            await upsertBrowserProfileCredentials(state.domain, {
              email: state.inboxAddress,
              ...(password ? { password } : {}),
            });
            // Update in-memory state so subsequent turns use login instead of signup
            state.credentials = { email: state.inboxAddress, password };
            logger.info('Saved credentials to browser profile', { email: state.inboxAddress, domain: state.domain });
          } catch (err) {
            logger.warn('Failed to persist credentials to browser profile', { error: err });
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

    // Extract login actions from first successful non-replay run and persist to DB
    if (context.turn === 1 && !cachedLoginActions && result.action_history_path) {
      extractLoginActions(state.apiKey, state.domain, String(result.action_history_path), message)
        .then(async (actions) => {
          if (actions?.length) {
            await upsertLoginActions(state.domain, actions);
            logger.info('Cached login actions to DB', { domain: state.domain, actionCount: actions.length });
          }
        })
        .catch(err => {
          logger.warn('Failed to extract/cache login actions', { domain: state.domain, error: err });
        });
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

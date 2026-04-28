/**
 * Browser provider.
 *
 * Uses Browser Use Cloud (via browser-use-sdk) for browser-based testing.
 * Each scenario run creates a single cloud session that is reused across turns.
 * Repeated runs should reuse a Browser Use Cloud profile via profile_id.
 */

import { registerProvider, type Provider, type ProviderSession } from '../base.js';
import { config } from '../../lib/config.js';
import { log } from '../../lib/logger.js';
import { sql } from '../../lib/db.js';
import type { BrowserState } from './types.js';
import { createSession, runTask, closeSession } from './api.js';
import { buildSystemMessageExtension, buildTaskPrompt, buildSensitiveData } from './system-message.js';

const logger = log.child({ component: 'browser' });

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return (parsed.hostname || '').replace(/^www\./, '');
  } catch {
    return '';
  }
}

function pushTiming(
  state: BrowserState,
  timing: { step: string; duration_ms: number; started_at: string; turn?: number },
) {
  state.stepTimings.push(timing);
}

const browserProvider: Provider = {
  name: 'browser',

  async connect(agentConfig, scenarioRunId): Promise<ProviderSession> {
    const apiKey = config.browserUseApiKey.trim();
    if (!apiKey) {
      throw new Error('Browser provider requires BROWSER_USE_API_KEY');
    }

    const targetUrl = String(agentConfig.url || agentConfig.endpoint || '').trim();
    if (!targetUrl) throw new Error('Agent missing url in config for browser provider');

    const domain = extractDomain(targetUrl);
    const profileId = String(agentConfig.profile_id || agentConfig.profileId || '').trim() || undefined;

    return {
      provider: 'browser',
      state: {
        apiKey,
        targetUrl,
        domain,
        profileId,
        agentConfig: agentConfig as Record<string, unknown>,
        scenarioRunId,
        stepTimings: [],
        consumedTimingCount: 0,
      } satisfies BrowserState,
    };
  },

  async sendMessage(session, message, context): Promise<string> {
    const state = session.state as BrowserState;

    const allowedDomains = state.domain ? [state.domain] : undefined;

    // Create session on first turn (reused across subsequent turns)
    if (!state.sessionId) {
      const startedAt = new Date().toISOString();
      const start = Date.now();
      const browserSession = await createSession(state.apiKey, {
        profileId: state.profileId,
        startUrl: state.targetUrl,
      });
      state.sessionId = browserSession.id;
      state.liveUrl = browserSession.liveUrl;
      await sql`
        UPDATE scenario_runs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.json({
          browser_session_id: state.sessionId,
          browser_session_status: 'active',
          browser_live_url: state.liveUrl,
          browser_target_url: state.targetUrl,
          browser_profile_id: state.profileId || null,
        })}
        WHERE id = ${state.scenarioRunId}
      `;
      pushTiming(state, {
        step: 'browser_session_create',
        duration_ms: Date.now() - start,
        started_at: startedAt,
        turn: context.turn,
      });
      logger.info('Created Browser Use Cloud session', {
        sessionId: state.sessionId,
        turn: context.turn,
        domain: state.domain,
        profileId: state.profileId,
      });
    }

    if (!state.sessionId) throw new Error('No browser session ID available');

    const systemExt = buildSystemMessageExtension(context.persona || null);
    const taskPrompt = buildTaskPrompt(message, state.targetUrl, context.turn, state.agentConfig);
    const secrets = buildSensitiveData(state.domain, state.agentConfig);

    const turnStartedAt = new Date().toISOString();
    const turnStart = Date.now();

    const result = await runTask(state.apiKey, {
      task: taskPrompt,
      sessionId: state.sessionId,
      startUrl: context.turn === 1 ? state.targetUrl : undefined,
      maxSteps: 12,
      systemPromptExtension: systemExt,
      secrets,
      allowedDomains,
    });

    pushTiming(state, {
      step: 'browser_turn_total',
      duration_ms: Date.now() - turnStart,
      started_at: turnStartedAt,
      turn: context.turn,
    });

    let botResponse = result.bot_response || '';
    if (!botResponse) throw new Error('Browser Use Cloud task returned empty bot response');
    if (result.overlay_text) botResponse = `${botResponse}\n\n[Alert: ${result.overlay_text}]`;

    return botResponse;
  },

  async disconnect(session): Promise<void> {
    const state = session.state as BrowserState;
    if (state.sessionId) {
      const closed = await closeSession(state.apiKey, state.sessionId);
      if (closed) {
        await sql`
          UPDATE scenario_runs
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.json({
            browser_session_status: 'stopped',
            browser_session_stopped_at: new Date().toISOString(),
          })}
          WHERE id = ${state.scenarioRunId}
        `;
      }
      if (!closed) {
        throw new Error(`Browser Use Cloud session did not close: ${state.sessionId}`);
      }
    }
  },
};

registerProvider(browserProvider);

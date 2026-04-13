/**
 * BrowserUse SDK helpers — session lifecycle and task execution.
 *
 * Uses the official browser-use-sdk (v3) for session management and task
 * execution. Output parsing is done locally with graceful fallback so a
 * schema mismatch never causes a duplicate task.
 */

import { BrowserUse } from 'browser-use-sdk';
import { z } from 'zod';
import { log } from '../../lib/logger.js';

const logger = log.child({ component: 'browser' });

/** Zod schema for structured extraction from browser tasks. */
export const ResponseSchema = z.object({
  bot_response: z.string().describe('The full text of the chatbot/assistant response message'),
  overlay_text: z.string().nullable().describe('Text from a NEW modal, popup, or emergency alert that appeared AFTER the message was sent. Empty string if none.').default(''),
}).transform(r => ({ ...r, overlay_text: r.overlay_text ?? '' }));

/** JSON Schema string sent to the Browser Use API so the agent formats output as JSON. */
const STRUCTURED_OUTPUT = JSON.stringify({
  type: 'object',
  properties: {
    bot_response: { type: 'string', description: 'The full text of the chatbot/assistant response message' },
    overlay_text: { type: 'string', description: 'Text from a NEW modal, popup, or emergency alert. Empty string if none.' },
  },
  required: ['bot_response'],
});

export type BrowserResponse = z.infer<typeof ResponseSchema>;

// Singleton client — reused across sessions within the same process.
let _client: BrowserUse | null = null;
let _clientKey = '';

export function getClient(apiKey: string): BrowserUse {
  if (_client && _clientKey === apiKey) return _client;
  _client = new BrowserUse({ apiKey });
  _clientKey = apiKey;
  return _client;
}

export async function createSession(
  apiKey: string,
  options: { profileId?: string; startUrl?: string },
): Promise<{ id: string; liveUrl: string }> {
  const client = getClient(apiKey);
  const session = await client.sessions.create({
    profileId: options.profileId,
    startUrl: options.startUrl,
    keepAlive: true,
    persistMemory: true,
  });
  return { id: session.id, liveUrl: session.liveUrl || '' };
}

export async function runTask(
  apiKey: string,
  options: {
    task: string;
    sessionId: string;
    startUrl?: string;
    maxSteps?: number;
    systemPromptExtension?: string;
    secrets?: Record<string, string>;
    allowedDomains?: string[];
  },
): Promise<BrowserResponse> {
  const client = getClient(apiKey);

  // Create and wait for the task using the low-level API so we control
  // output parsing separately from task execution (no duplicate tasks
  // on schema mismatch).
  const { id: taskId } = await client.tasks.create({
    task: options.task,
    sessionId: options.sessionId,
    startUrl: options.startUrl ?? undefined,
    maxSteps: options.maxSteps ?? 10,
    systemPromptExtension: options.systemPromptExtension ?? '',
    secrets: options.secrets,
    allowedDomains: options.allowedDomains,
    structuredOutput: STRUCTURED_OUTPUT,
    vision: true,
  });

  const task = await client.tasks.wait(taskId, { timeout: 300_000 });

  if (task.status !== 'finished') {
    const output = String(task.output || '').slice(0, 500);
    throw new Error(`Browser Use Cloud task failed: status=${task.status}, output=${output}`);
  }

  // Try structured parse → fall back to raw output string.
  const raw = task.output ?? '';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return ResponseSchema.parse(parsed);
  } catch {
    logger.warn('Structured extraction failed, using raw output', { taskId });
    return { bot_response: String(raw), overlay_text: '' };
  }
}

/**
 * Preflight validation: creates a session, navigates to the target URL,
 * and checks whether the page is accessible or blocked by a login wall.
 * Returns the live URL so the caller can expose it for manual auth.
 */
export async function validateSession(
  apiKey: string,
  options: { profileId?: string; targetUrl: string },
): Promise<{ ok: boolean; liveUrl: string; sessionId: string; error?: string }> {
  const client = getClient(apiKey);
  const session = await client.sessions.create({
    profileId: options.profileId,
    startUrl: options.targetUrl,
    keepAlive: false,
    persistMemory: true,
  });

  try {
    const { id: taskId } = await client.tasks.create({
      task: `Navigate to ${options.targetUrl}. Check if you can see a chat input or text area. If you are on a login page or cannot access the chat, report login_required=true. Do NOT type anything or interact with the chat.`,
      sessionId: session.id,
      startUrl: options.targetUrl,
      maxSteps: 5,
      structuredOutput: JSON.stringify({
        type: 'object',
        properties: {
          chat_accessible: { type: 'boolean', description: 'Whether a chat input is visible and usable' },
          login_required: { type: 'boolean', description: 'Whether a login page or auth wall is blocking access' },
          page_title: { type: 'string', description: 'The page title or heading' },
        },
        required: ['chat_accessible', 'login_required'],
      }),
      vision: true,
    });

    const task = await client.tasks.wait(taskId, { timeout: 60_000 });
    const raw = task.output ?? '';
    let loginRequired = false;
    let chatAccessible = false;

    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      loginRequired = !!parsed.login_required;
      chatAccessible = !!parsed.chat_accessible;
    } catch {
      // If we can't parse, assume accessible (let the real run discover issues)
      chatAccessible = task.status === 'finished';
    }

    if (loginRequired && !chatAccessible) {
      return {
        ok: false,
        liveUrl: session.liveUrl || '',
        sessionId: session.id,
        error: 'Login required. Use the live browser link to log in, then retry.',
      };
    }

    return { ok: true, liveUrl: session.liveUrl || '', sessionId: session.id };
  } catch (err) {
    return {
      ok: false,
      liveUrl: session.liveUrl || '',
      sessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Always close the validation session — profiles persist auth state,
    // so there's no need to keep sessions alive after the check.
    closeSession(apiKey, session.id).catch(() => {});
  }
}

export async function closeSession(apiKey: string, sessionId: string): Promise<void> {
  const client = getClient(apiKey);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.sessions.stop(sessionId);
      logger.info('Closed browser session', { sessionId, attempt });
      return;
    } catch (err) {
      if (attempt < maxAttempts) {
        logger.warn('Retrying session close', { sessionId, attempt, error: err });
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      } else {
        logger.error('Failed to close browser session after retries — session may leak', {
          sessionId,
          attempts: maxAttempts,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

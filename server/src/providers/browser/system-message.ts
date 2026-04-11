/**
 * Task prompt and system message builders for the browser provider.
 */

import type { BrowserProfile } from './types.js';

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_SETUP = 'If there is any terms/consent/agreement checkbox or button, check it and accept. If there is a demographics or intake form, fill in age {age}, select {gender}, and submit.';
const DEFAULT_CHAT = 'Find the chat input field, type the message and send it (press Enter or click send).';
const DEFAULT_OVERLAY = 'Only capture NEW modals or popups that appeared AFTER you sent the message (e.g. a modal telling the user to call 911). Do NOT include persistent banners, disclaimers, or static text that was already on the page.';

// =============================================================================
// SYSTEM MESSAGE EXTENSION
// =============================================================================

export function buildSystemMessageExtension(
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

// =============================================================================
// TASK PROMPT
// =============================================================================

export function buildTaskPrompt(
  profile: BrowserProfile,
  message: string,
  targetUrl: string,
  turn: number,
  agentConfig: Record<string, unknown>,
): string {
  const email = String(agentConfig.email || '');
  const password = String(agentConfig.password || '');
  const hasCredentials = !!(email && password);
  const extraInstructions = String(agentConfig.instructions || '').trim();
  const extraStep = extraInstructions ? ` ${extraInstructions}` : '';

  let authStep = '';
  if (turn === 1 && hasCredentials) {
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

// =============================================================================
// SENSITIVE DATA
// =============================================================================

export function buildSensitiveData(
  domain: string,
  agentConfig: Record<string, unknown>,
): Record<string, string> | undefined {
  const email = String(agentConfig.email || '');
  const password = String(agentConfig.password || '');
  if (!email && !password) return undefined;

  const data: Record<string, string> = {};
  if (email) data.email = email;
  if (password) data.password = password;
  return data;
}

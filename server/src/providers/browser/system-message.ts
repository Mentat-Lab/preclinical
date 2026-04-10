/**
 * Task prompt and system message builders for the browser provider.
 */

import { config } from '../../lib/config.js';
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
  inboxAddress?: string,
  profileCredentials?: { email?: string; password?: string },
): string {
  const email = String(profileCredentials?.email || agentConfig.email || config.browserEmail || '');
  const password = String(profileCredentials?.password || agentConfig.password || config.browserPassword || '');
  const hasCredentials = !!(email && password);
  const extraInstructions = String(agentConfig.instructions || '').trim();
  const extraStep = extraInstructions ? ` ${extraInstructions}` : '';

  // AgentMail signup flow — fresh disposable email, bypasses Cloudflare login issues
  const useAgentMailSignup = !!(inboxAddress && profile.email_verification);

  let authStep = '';
  if (turn === 1 && useAgentMailSignup) {
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

// =============================================================================
// SENSITIVE DATA
// =============================================================================

export function buildSensitiveData(
  domain: string,
  agentConfig: Record<string, unknown>,
  inboxAddress?: string,
  profileCredentials?: { email?: string; password?: string },
): Record<string, string> | undefined {
  // Priority: inbox (AgentMail signup) > profile credentials (DB) > agent config > env vars
  const email = inboxAddress || String(profileCredentials?.email || agentConfig.email || config.browserEmail || '');
  const password = String(profileCredentials?.password || agentConfig.password || config.browserPassword || '');
  if (!email && !password) return undefined;

  const data: Record<string, string> = {};
  if (email) data.email = email;
  if (password) data.password = password;
  return data;
}

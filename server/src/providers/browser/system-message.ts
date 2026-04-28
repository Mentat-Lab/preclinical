/**
 * Task prompt and system message builders for the browser provider.
 */

const DEFAULT_SETUP = 'If there is any terms/consent/agreement checkbox or button, check it and accept. If there is a demographics or intake form, fill in age {age}, select {gender}, and submit.';
const DEFAULT_CHAT = 'Find the chat input field, type the message and send it (press Enter or click send).';
const DEFAULT_OVERLAY = 'Only capture NEW modals or popups that appeared AFTER you sent the message (e.g. a modal telling the user to call 911). Do NOT include persistent banners, disclaimers, or static text that was already on the page.';

export function buildSystemMessageExtension(
  persona: Record<string, unknown> | null,
): string {
  const p = persona || {};
  let age = String(p.age_range || '35');
  if (age.includes('-')) age = age.split('-')[0];
  const gender = String(p.gender || p.sex || 'male');

  const setupInstructions = DEFAULT_SETUP
    .replace(/\{age\}/g, age).replace(/\{gender\}/g, gender);

  return [
    '## Chat interaction rules',
    `- To send messages: ${DEFAULT_CHAT}`,
    `- After sending, wait for the chatbot to fully respond (the response may stream in gradually — wait until it stops changing and the send button reappears).`,
    `- Setup/intake: ${setupInstructions}`,
    '',
    '## Response extraction rules',
    `- Extract ONLY the NEW response that appeared AFTER you sent the message. Do NOT extract text from previous responses.`,
    `- The new response is the LAST message bubble in the chat from the assistant/bot, appearing below the message you just sent.`,
    `- If the response starts mid-sentence or with a numbered item like "8." without context, you are reading a previous response — scroll down to find the actual new response.`,
    `- If the chatbot is still streaming (loading indicator visible, "Stop generating" button shown), wait until streaming completes before extracting.`,
    `- Overlay detection: ${DEFAULT_OVERLAY}`,
    `- Return structured output with bot_response (full text) and overlay_text (new popups only, empty if none).`,
  ].join('\n');
}

export function buildTaskPrompt(
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
    authStep = `Go to ${targetUrl}. If a login or sign-in page appears, sign in with the provided credentials. Complete any verification steps. Once logged in, dismiss any popups or banners. `;
  }

  if (turn === 1) {
    const nav = authStep || `Go to ${targetUrl}. `;
    return `${nav}${extraStep} Send this message in the chat: "${message}". Then extract the chatbot's response.`;
  }
  return `In the chat that is already open, send this message: "${message}". Wait for the chatbot to finish responding (streaming stops, send button reappears). Then extract ONLY the new response that appeared after your message — it is the last assistant message bubble in the chat. Do NOT extract text from earlier responses.`;
}

export function buildSensitiveData(
  _domain: string,
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

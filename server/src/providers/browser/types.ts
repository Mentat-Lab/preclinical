/**
 * Shared types for the browser provider.
 */

export interface BrowserProfile {
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

export interface BrowserState {
  apiKey: string;
  targetUrl: string;
  domain: string;
  agentConfig: Record<string, unknown>;
  sessionId?: string;
  liveUrl?: string;
  profile?: BrowserProfile;
  credentials?: { email?: string; password?: string };
  scenarioRunId: string;
  inboxAddress?: string; // AgentMail disposable email for signup flows
}

export const EXTRACTION_SCHEMA = {
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

import type { StepTiming } from '../../graphs/tester-state.js';

/**
 * Shared types for the browser provider.
 */

export interface BrowserProfile {
  browser_setup_instructions: string;
  browser_chat_instructions: string;
  browser_overlay_hint: string;
  requires_auth?: boolean;
  auth_domains?: string[];
  browser_login_instructions?: string;
}

export interface BrowserState {
  apiKey: string;
  targetUrl: string;
  domain: string;
  agentConfig: Record<string, unknown>;
  profileId?: string;
  sessionId?: string;
  liveUrl?: string;
  profile?: BrowserProfile;
  scenarioRunId: string;
  stepTimings: StepTiming[];
  consumedTimingCount: number;
}


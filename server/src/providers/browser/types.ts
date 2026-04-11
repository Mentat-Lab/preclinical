import type { StepTiming } from '../../graphs/tester-state.js';

/**
 * Shared types for the browser provider.
 */

export interface BrowserState {
  apiKey: string;
  targetUrl: string;
  domain: string;
  agentConfig: Record<string, unknown>;
  profileId?: string;
  sessionId?: string;
  liveUrl?: string;
  scenarioRunId: string;
  stepTimings: StepTiming[];
  consumedTimingCount: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Browser profile discovery — explore a URL and produce a browser profile.
 */

import { config } from '../../lib/config.js';
import type { BrowserProfile } from './types.js';
import { apiHeaders, BROWSER_USE_API_BASE } from './api.js';

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

/**
 * Browser profile loading — JSON file fallback, agent config fallback.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../../lib/logger.js';
import type { BrowserProfile } from './types.js';

const logger = log.child({ component: 'browser' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedDir = join(__dirname, '..', 'shared');

const PROFILE_KEYS: (keyof BrowserProfile)[] = [
  'browser_setup_instructions', 'browser_chat_instructions', 'browser_overlay_hint',
  'browser_login_instructions',
];

export interface LoadedProfile {
  profile: BrowserProfile;
}

export async function loadBrowserProfile(
  targetUrl: string,
  agentConfig: Record<string, unknown>,
): Promise<LoadedProfile> {
  let domain = '';
  try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch { /* skip */ }

  // 1. JSON files on disk
  const basePath = join(sharedDir, 'browser-profiles');
  const candidates = domain
    ? [join(basePath, `${domain}.json`), join(basePath, '_default.json')]
    : [join(basePath, '_default.json')];

  for (const filePath of candidates) {
    try {
      const fileProfile = JSON.parse(await readFile(filePath, 'utf-8'));
      logger.info('Loaded profile from file', { filePath });
      return {
        profile: {
          ...Object.fromEntries(PROFILE_KEYS.map(k => [k, fileProfile[k] || ''])),
          requires_auth: !!fileProfile.requires_auth,
          auth_domains: Array.isArray(fileProfile.auth_domains) ? fileProfile.auth_domains : [],
        } as BrowserProfile,
      };
    } catch { /* file not found, try next */ }
  }

  // 2. Final fallback: build from agent config
  return {
    profile: {
      ...Object.fromEntries(PROFILE_KEYS.map(k => [k, String(agentConfig[k] || '')])),
      requires_auth: agentConfig.requires_auth === 'true' || agentConfig.requires_auth === true,
    } as BrowserProfile,
  };
}

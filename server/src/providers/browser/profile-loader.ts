/**
 * Browser profile loading — DB lookup, JSON file fallback, agent config fallback.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getBrowserProfileByDomain } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import type { BrowserProfile } from './types.js';

const logger = log.child({ component: 'browser' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sharedDir = join(__dirname, '..', 'shared');

const PROFILE_KEYS: (keyof BrowserProfile)[] = [
  'browser_setup_instructions', 'browser_chat_instructions', 'browser_overlay_hint',
  'browser_signup_instructions', 'browser_login_instructions', 'browser_verify_instructions',
  'email_subject_hint',
];

export interface LoadedProfile {
  profile: BrowserProfile;
  credentials: Record<string, string>;
  loginActions: Array<Record<string, unknown>> | null;
}

export function dbRowToProfile(row: Record<string, unknown>): LoadedProfile {
  const cfg = (row.config || {}) as Record<string, unknown>;
  return {
    profile: {
      ...Object.fromEntries(PROFILE_KEYS.map(k => [k, String(cfg[k] || '')])),
      requires_auth: !!row.requires_auth,
      email_verification: !!row.email_verification,
      auth_domains: Array.isArray(row.auth_domains) ? row.auth_domains as string[] : [],
    } as BrowserProfile,
    credentials: (row.credentials || {}) as Record<string, string>,
    loginActions: Array.isArray(row.login_actions) ? row.login_actions as Array<Record<string, unknown>> : null,
  };
}

export async function loadBrowserProfile(
  targetUrl: string,
  agentConfig: Record<string, unknown>,
): Promise<LoadedProfile> {
  let domain = '';
  try { domain = new URL(targetUrl).hostname.replace(/^www\./, ''); } catch { /* skip */ }

  // 1. Try DB — domain match, then _default
  for (const d of domain ? [domain, '_default'] : ['_default']) {
    const row = await getBrowserProfileByDomain(d);
    if (row) {
      logger.info('Loaded profile from DB', { domain: d });
      return dbRowToProfile(row as Record<string, unknown>);
    }
  }

  // 2. Fallback: JSON files on disk (backwards compat)
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
          email_verification: !!fileProfile.email_verification,
          auth_domains: Array.isArray(fileProfile.auth_domains) ? fileProfile.auth_domains : [],
        } as BrowserProfile,
        credentials: {},
        loginActions: null,
      };
    } catch { /* file not found, try next */ }
  }

  // 3. Final fallback: build from agent config
  return {
    profile: {
      ...Object.fromEntries(PROFILE_KEYS.map(k => [k, String(agentConfig[k] || '')])),
      requires_auth: agentConfig.requires_auth === 'true' || agentConfig.requires_auth === true,
      email_verification: agentConfig.email_verification === 'true' || agentConfig.email_verification === true,
    } as BrowserProfile,
    credentials: {},
    loginActions: null,
  };
}

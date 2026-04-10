import { listProviders } from '../providers/index.js';

export const RUNNABLE_PROVIDERS = new Set(listProviders());

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /auth/i,
  /credential/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function maskSecret(value: string): string {
  if (value.length === 0) return '';
  return value.length > 8
    ? `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 4, 20))}`
    : '•'.repeat(value.length);
}

export function maskConfig(config: unknown): unknown {
  if (Array.isArray(config)) {
    return config.map((item) => maskConfig(item));
  }
  if (!config || typeof config !== 'object') {
    return config ?? null;
  }

  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string' && isSensitiveKey(k)) {
      masked[k] = maskSecret(v);
      continue;
    }
    masked[k] = maskConfig(v);
  }
  return masked;
}

export function maskAgent(agent: Record<string, unknown>) {
  return { ...agent, config: maskConfig(agent.config as Record<string, unknown>) };
}

/**
 * Unit tests for maskSecret(), maskConfig(), maskAgent() from route-utils.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock providers/index.js so RUNNABLE_PROVIDERS doesn't try to load real providers
vi.mock('../../providers/index.js', () => ({
  listProviders: () => ['openai', 'browser'],
}));

import { maskSecret, maskConfig, maskAgent } from '../route-utils.js';

// ── maskSecret ──────────────────────────────────────────────────────────────

describe('maskSecret', () => {
  it('returns empty string for empty input', () => {
    expect(maskSecret('')).toBe('');
  });

  it('masks short strings (<=8 chars) completely with bullets', () => {
    expect(maskSecret('abc')).toBe('•••');
    expect(maskSecret('12345678')).toBe('••••••••');
  });

  it('masks long strings (>8 chars) showing first 4 chars', () => {
    const result = maskSecret('sk-1234567890abcdef');
    expect(result.startsWith('sk-1')).toBe(true);
    expect(result).toContain('•');
    // Should not contain original chars after first 4
    expect(result.slice(4)).toMatch(/^•+$/);
  });

  it('caps bullet repetition at 20', () => {
    const longSecret = 'a'.repeat(100);
    const result = maskSecret(longSecret);
    // First 4 chars + 20 bullets
    expect(result.length).toBe(24);
  });

  it('masks single-character strings', () => {
    expect(maskSecret('x')).toBe('•');
  });
});

// ── maskConfig ──────────────────────────────────────────────────────────────

describe('maskConfig', () => {
  it('masks keys matching sensitive patterns', () => {
    const config = { api_key: 'sk-secret123456', model: 'gpt-4o' };
    const masked = maskConfig(config) as Record<string, unknown>;
    expect(masked.api_key).toContain('•');
    expect(masked.model).toBe('gpt-4o');
  });

  it('masks "token", "secret", "password", "auth", "credential" keys', () => {
    const config = {
      token: 'tok-abc123456',
      secret: 'mysecret12345',
      password: 'pass1234567',
      auth: 'auth1234567',
      credential: 'cred1234567',
    };
    const masked = maskConfig(config) as Record<string, unknown>;
    for (const key of Object.keys(config)) {
      expect(masked[key]).toContain('•');
    }
  });

  it('preserves non-sensitive keys unchanged', () => {
    const config = { model: 'gpt-4o', url: 'https://api.example.com', name: 'test' };
    expect(maskConfig(config)).toEqual(config);
  });

  it('handles nested objects', () => {
    const config = { outer: { api_key: 'sk-secret123456', name: 'test' } };
    const masked = maskConfig(config) as any;
    expect(masked.outer.api_key).toContain('•');
    expect(masked.outer.name).toBe('test');
  });

  it('handles arrays', () => {
    const config = [{ api_key: 'sk-secret123456' }];
    const masked = maskConfig(config) as any[];
    expect(masked[0].api_key).toContain('•');
  });

  it('handles null/undefined config', () => {
    expect(maskConfig(null)).toBe(null);
    expect(maskConfig(undefined)).toBe(null);
  });

  it('handles empty config object', () => {
    expect(maskConfig({})).toEqual({});
  });

  it('only masks string values (not numbers/booleans)', () => {
    const config = { api_key: 12345, token: true };
    const masked = maskConfig(config) as any;
    expect(masked.api_key).toBe(12345);
    expect(masked.token).toBe(true);
  });
});

// ── maskAgent ───────────────────────────────────────────────────────────────

describe('maskAgent', () => {
  it('returns agent with masked config', () => {
    const agent = { id: '123', name: 'test', config: { api_key: 'sk-secret123456' } };
    const masked = maskAgent(agent);
    expect((masked.config as any).api_key).toContain('•');
  });

  it('preserves all non-config fields', () => {
    const agent = { id: '123', name: 'test', provider: 'openai', config: {} };
    const masked = maskAgent(agent) as Record<string, unknown>;
    expect(masked.id).toBe('123');
    expect(masked.name).toBe('test');
    expect(masked.provider).toBe('openai');
  });

  it('handles agent without config field', () => {
    const agent = { id: '123', name: 'test' } as Record<string, unknown>;
    const masked = maskAgent(agent) as Record<string, unknown>;
    expect(masked.id).toBe('123');
    expect(masked.config).toBe(null); // undefined → null via maskConfig
  });
});

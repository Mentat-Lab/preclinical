/**
 * Unit tests for classifyError() — error classification and retryability.
 */

import { describe, it, expect } from 'vitest';
import { classifyError } from '../errors.js';

describe('classifyError', () => {
  // ── Rate limit ──────────────────────────────────────────────────────────

  describe('RATE_LIMIT', () => {
    it('classifies 429 status as RATE_LIMIT', () => {
      const err = Object.assign(new Error('Too many requests'), { status: 429 });
      const { category, retryable } = classifyError(err);
      expect(category).toBe('RATE_LIMIT');
      expect(retryable).toBe(true);
    });

    it('classifies "rate limit" in message as RATE_LIMIT', () => {
      const { category, retryable } = classifyError(new Error('You hit a rate limit'));
      expect(category).toBe('RATE_LIMIT');
      expect(retryable).toBe(true);
    });

    it('classifies "too many requests" in message as RATE_LIMIT', () => {
      const { category } = classifyError(new Error('too many requests'));
      expect(category).toBe('RATE_LIMIT');
    });

    it('classifies BrowserUse active-session limit as retryable RATE_LIMIT', () => {
      const { category, retryable } = classifyError(new Error('Too many concurrent active sessions. Please wait for one to finish, kill one, or upgrade your plan.'));
      expect(category).toBe('RATE_LIMIT');
      expect(retryable).toBe(true);
    });

    it('classifies "429" in message as RATE_LIMIT', () => {
      const { category } = classifyError(new Error('Error 429 from upstream'));
      expect(category).toBe('RATE_LIMIT');
    });

    it('RATE_LIMIT errors are retryable', () => {
      const { retryable } = classifyError(Object.assign(new Error(''), { status: 429 }));
      expect(retryable).toBe(true);
    });
  });

  // ── Server errors ───────────────────────────────────────────────────────

  describe('SERVER_ERROR', () => {
    it('classifies 500 status as SERVER_ERROR', () => {
      const err = Object.assign(new Error('Internal'), { status: 500 });
      expect(classifyError(err).category).toBe('SERVER_ERROR');
    });

    it('classifies 502/503/504 as SERVER_ERROR', () => {
      for (const status of [502, 503, 504]) {
        const err = Object.assign(new Error('Gateway error'), { status });
        expect(classifyError(err).category).toBe('SERVER_ERROR');
      }
    });

    it('classifies textual provider 500 responses as SERVER_ERROR', () => {
      const error = new Error('OpenAI target call failed (500): {"message":"aws-bedrock error: The system encountered an unexpected error during processing."}');
      const { category, retryable } = classifyError(error);
      expect(category).toBe('SERVER_ERROR');
      expect(retryable).toBe(true);
    });

    it('classifies textual timeout messages as SERVER_ERROR', () => {
      const { category, retryable } = classifyError(new Error('Timed out after 15000ms'));
      expect(category).toBe('SERVER_ERROR');
      expect(retryable).toBe(true);
    });

    it('classifies BrowserUse task wait timeouts as SERVER_ERROR', () => {
      const error = new Error('Task d0214726-677e-4b43-94d9-a7d25f810743 did not complete within 300000ms');
      const { category, retryable } = classifyError(error);
      expect(category).toBe('SERVER_ERROR');
      expect(retryable).toBe(true);
    });

    it('classifies socket errors as SERVER_ERROR', () => {
      for (const msg of ['econnreset', 'etimedout', 'socket hang up', 'connection refused']) {
        expect(classifyError(new Error(msg)).category).toBe('SERVER_ERROR');
      }
    });

    it('classifies fetch failures as retryable SERVER_ERROR', () => {
      for (const msg of ['fetch failed', 'failed to fetch']) {
        const { category, retryable } = classifyError(new Error(msg));
        expect(category).toBe('SERVER_ERROR');
        expect(retryable).toBe(true);
      }
    });

    it('SERVER_ERROR errors are retryable', () => {
      const err = Object.assign(new Error(''), { status: 500 });
      expect(classifyError(err).retryable).toBe(true);
    });
  });

  // ── Browser errors ──────────────────────────────────────────────────────

  describe('BROWSER_AUTH', () => {
    it('classifies browser auth errors', () => {
      const { category, retryable } = classifyError(new Error('Browser login failed: auth error'));
      expect(category).toBe('BROWSER_AUTH');
      expect(retryable).toBe(false);
    });

    it('classifies browser credential errors', () => {
      expect(classifyError(new Error('Browser credential expired')).category).toBe('BROWSER_AUTH');
    });
  });

  describe('BROWSER_TIMEOUT', () => {
    it('classifies browser timeout', () => {
      const { category, retryable } = classifyError(new Error('Browser timeout waiting for response'));
      expect(category).toBe('BROWSER_TIMEOUT');
      expect(retryable).toBe(true);
    });

    it('classifies browser timed out', () => {
      expect(classifyError(new Error('Chrome timed out')).category).toBe('BROWSER_TIMEOUT');
    });
  });

  describe('BROWSER_BLOCKED', () => {
    it('classifies cloudflare blocks', () => {
      const { category, retryable } = classifyError(new Error('Browser blocked by cloudflare'));
      expect(category).toBe('BROWSER_BLOCKED');
      expect(retryable).toBe(false);
    });

    it('classifies captcha blocks', () => {
      expect(classifyError(new Error('Browser captcha detected')).category).toBe('BROWSER_BLOCKED');
    });

    it('classifies access denied', () => {
      expect(classifyError(new Error('Browser access denied')).category).toBe('BROWSER_BLOCKED');
    });
  });

  describe('BROWSER_SESSION', () => {
    it('classifies session stopped', () => {
      const { category, retryable } = classifyError(new Error('BrowserUse session is stopped'));
      expect(category).toBe('BROWSER_SESSION');
      expect(retryable).toBe(true);
    });

    it('classifies session closed', () => {
      expect(classifyError(new Error('Browser session is closed')).category).toBe('BROWSER_SESSION');
    });

    it('classifies no browser session', () => {
      expect(classifyError(new Error('no browser session available')).category).toBe('BROWSER_SESSION');
    });
  });

  describe('BROWSER_EXTRACTION', () => {
    it('classifies empty bot response', () => {
      const { category, retryable } = classifyError(new Error('BrowserUse: empty bot response'));
      expect(category).toBe('BROWSER_EXTRACTION');
      expect(retryable).toBe(true);
    });

    it('classifies no response extracted', () => {
      expect(classifyError(new Error('Browser no response extracted')).category).toBe('BROWSER_EXTRACTION');
    });

    it('classifies extraction failure', () => {
      expect(classifyError(new Error('Chrome extraction failed')).category).toBe('BROWSER_EXTRACTION');
    });

    it('classifies response validation page errors as retryable extraction failures', () => {
      const error = new Error('Target returned error response after 2 retries (page_error): The website failed to load');
      const { category, retryable } = classifyError(error);
      expect(category).toBe('BROWSER_EXTRACTION');
      expect(retryable).toBe(true);
    });

    it('classifies BrowserUse consecutive step failures as retryable extraction failures', () => {
      const error = new Error('Browser Use Cloud task failed: status=stopped, output=Agent stopped because of consecutive step failures');
      const { category, retryable } = classifyError(error);
      expect(category).toBe('BROWSER_EXTRACTION');
      expect(retryable).toBe(true);
    });
  });

  // ── Provider errors ─────────────────────────────────────────────────────

  describe('PROVIDER_AUTH', () => {
    it('classifies 401 as PROVIDER_AUTH', () => {
      const err = Object.assign(new Error(''), { status: 401 });
      expect(classifyError(err).category).toBe('PROVIDER_AUTH');
    });

    it('classifies 403 as PROVIDER_AUTH', () => {
      const err = Object.assign(new Error(''), { status: 403 });
      expect(classifyError(err).category).toBe('PROVIDER_AUTH');
    });

    it('classifies textual 403 failures as PROVIDER_AUTH', () => {
      expect(classifyError(new Error('OpenAI target call failed (403): Forbidden')).category).toBe('PROVIDER_AUTH');
      expect(classifyError(new Error('Browser Use Cloud task failed: status=403, output=Forbidden')).category).toBe('PROVIDER_AUTH');
    });

    it('PROVIDER_AUTH is not retryable', () => {
      const err = Object.assign(new Error(''), { status: 401 });
      expect(classifyError(err).retryable).toBe(false);
    });
  });

  describe('PROVIDER_NOT_FOUND', () => {
    it('classifies 404 as PROVIDER_NOT_FOUND', () => {
      const err = Object.assign(new Error(''), { status: 404 });
      expect(classifyError(err).category).toBe('PROVIDER_NOT_FOUND');
    });

    it('classifies "not found" message as PROVIDER_NOT_FOUND', () => {
      expect(classifyError(new Error('Resource not found')).category).toBe('PROVIDER_NOT_FOUND');
    });

    it('PROVIDER_NOT_FOUND is not retryable', () => {
      const err = Object.assign(new Error(''), { status: 404 });
      expect(classifyError(err).retryable).toBe(false);
    });
  });

  // ── Input errors ────────────────────────────────────────────────────────

  describe('INVALID_INPUT', () => {
    it('classifies 400 as INVALID_INPUT', () => {
      const err = Object.assign(new Error(''), { status: 400 });
      expect(classifyError(err).category).toBe('INVALID_INPUT');
    });

    it('classifies "bad request" message as INVALID_INPUT', () => {
      expect(classifyError(new Error('bad request')).category).toBe('INVALID_INPUT');
    });

    it('INVALID_INPUT is not retryable', () => {
      const err = Object.assign(new Error(''), { status: 400 });
      expect(classifyError(err).retryable).toBe(false);
    });
  });

  // ── Unknown errors ──────────────────────────────────────────────────────

  describe('UNKNOWN', () => {
    it('classifies unrecognized errors as UNKNOWN', () => {
      expect(classifyError(new Error('something completely unexpected')).category).toBe('UNKNOWN');
    });

    it('UNKNOWN errors are not retryable', () => {
      expect(classifyError(new Error('???')).retryable).toBe(false);
    });

    it('handles non-Error objects', () => {
      expect(classifyError('just a string')).toEqual({ category: 'UNKNOWN', retryable: false });
    });

    it('handles null/undefined', () => {
      expect(classifyError(null)).toEqual({ category: 'UNKNOWN', retryable: false });
      expect(classifyError(undefined)).toEqual({ category: 'UNKNOWN', retryable: false });
    });
  });
});

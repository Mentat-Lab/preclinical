/**
 * Classifies errors into categories for logging, DB storage, and UI display.
 */

export type ErrorCategory =
  // Retryable
  | 'RATE_LIMIT'
  | 'SERVER_ERROR'
  // Browser infrastructure
  | 'BROWSER_AUTH'
  | 'BROWSER_TIMEOUT'
  | 'BROWSER_BLOCKED'
  | 'BROWSER_SESSION'
  | 'BROWSER_EXTRACTION'
  // Provider / API
  | 'PROVIDER_AUTH'
  | 'PROVIDER_NOT_FOUND'
  | 'INVALID_INPUT'
  // Catch-all
  | 'UNKNOWN';

/** Human-readable labels for each error category. */
export const ERROR_LABELS: Record<ErrorCategory, string> = {
  RATE_LIMIT: 'Rate Limited',
  SERVER_ERROR: 'Server Error',
  BROWSER_AUTH: 'Browser Login Failed',
  BROWSER_TIMEOUT: 'Browser Timeout',
  BROWSER_BLOCKED: 'Site Blocked Access',
  BROWSER_SESSION: 'Browser Session Dead',
  BROWSER_EXTRACTION: 'Could Not Extract Response',
  PROVIDER_AUTH: 'API Authentication Failed',
  PROVIDER_NOT_FOUND: 'Endpoint Not Found',
  INVALID_INPUT: 'Invalid Input',
  UNKNOWN: 'Unknown Error',
};

export function classifyError(error: unknown): { category: ErrorCategory; retryable: boolean } {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status = (error as any)?.status as number | undefined;

  // --- Rate limit (429) ---
  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return { category: 'RATE_LIMIT', retryable: true };
  }

  // --- Browser-specific errors ---
  if (
    message.includes('browseruse') ||
    message.includes('browser') ||
    message.includes('cdp') ||
    message.includes('chrome')
  ) {
    // Auth / login failures
    if (
      message.includes('auth') ||
      message.includes('login') ||
      message.includes('sign in') ||
      message.includes('credential')
    ) {
      return { category: 'BROWSER_AUTH', retryable: false };
    }

    // Cloudflare / bot detection
    if (
      message.includes('cloudflare') ||
      message.includes('blocked') ||
      message.includes('captcha') ||
      message.includes('access denied') ||
      message.includes('forbidden')
    ) {
      return { category: 'BROWSER_BLOCKED', retryable: false };
    }

    // Timeout
    if (
      message.includes('timeout') ||
      message.includes('timed out')
    ) {
      return { category: 'BROWSER_TIMEOUT', retryable: true };
    }

    // Session dead
    if (
      message.includes('session is stopped') ||
      message.includes('session is closed') ||
      message.includes('session dead') ||
      message.includes('no browser session')
    ) {
      return { category: 'BROWSER_SESSION', retryable: true };
    }

    // Empty response / extraction failure
    if (
      message.includes('empty bot response') ||
      message.includes('no response extracted') ||
      message.includes('extraction')
    ) {
      return { category: 'BROWSER_EXTRACTION', retryable: true };
    }
  }

  // --- Server errors (5xx) or transient network issues ---
  if (
    (status && status >= 500 && status < 600) ||
    /econnreset|etimedout|timeout|socket hang up|connection refused/.test(message)
  ) {
    return { category: 'SERVER_ERROR', retryable: true };
  }

  // --- Provider auth errors ---
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden')) {
    return { category: 'PROVIDER_AUTH', retryable: false };
  }

  // --- Invalid input (400) ---
  if (status === 400 || message.includes('bad request')) {
    return { category: 'INVALID_INPUT', retryable: false };
  }

  // --- Not found (404) ---
  if (status === 404 || message.includes('not found')) {
    return { category: 'PROVIDER_NOT_FOUND', retryable: false };
  }

  return { category: 'UNKNOWN', retryable: false };
}

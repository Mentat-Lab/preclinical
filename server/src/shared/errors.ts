/**
 * Classifies errors into categories for logging and DB storage.
 */

export type ErrorCategory =
  | 'RETRYABLE_RATE_LIMIT'
  | 'RETRYABLE_SERVER_ERROR'
  | 'PERMANENT_INVALID_INPUT'
  | 'PERMANENT_NOT_FOUND'
  | 'UNKNOWN';

export function classifyError(error: unknown): { category: ErrorCategory } {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const status = (error as any)?.status as number | undefined;

  // Rate limit (429)
  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return { category: 'RETRYABLE_RATE_LIMIT' };
  }

  // Server errors (5xx) or transient network issues
  if (
    (status && status >= 500 && status < 600) ||
    /econnreset|etimedout|timeout|socket hang up|connection refused/.test(message)
  ) {
    return { category: 'RETRYABLE_SERVER_ERROR' };
  }

  // Auth errors
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden')) {
    return { category: 'PERMANENT_INVALID_INPUT' };
  }

  // Invalid input (400)
  if (status === 400 || message.includes('invalid') || message.includes('bad request')) {
    return { category: 'PERMANENT_INVALID_INPUT' };
  }

  // Not found (404)
  if (status === 404 || message.includes('not found')) {
    return { category: 'PERMANENT_NOT_FOUND' };
  }

  return { category: 'UNKNOWN' };
}

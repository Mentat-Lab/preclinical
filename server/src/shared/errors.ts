/**
 * Error Classification Utilities
 *
 * Provides consistent error classification to determine retry behavior:
 * - Retryable errors (rate limits, server errors) return 503
 * - Permanent errors (invalid input, not found) return 500 to stop retries
 */

export enum ErrorCategory {
  RETRYABLE_RATE_LIMIT = "RETRYABLE_RATE_LIMIT",
  RETRYABLE_SERVER_ERROR = "RETRYABLE_SERVER_ERROR",
  PERMANENT_INVALID_INPUT = "PERMANENT_INVALID_INPUT",
  PERMANENT_NOT_FOUND = "PERMANENT_NOT_FOUND",
  UNKNOWN = "UNKNOWN",
}

export interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  httpStatus: number;
  retryAfterSeconds?: number;
  message: string;
}

export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  const statusMatch = message.match(/\((\d{3})\)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

  const errorStatus = (error as any)?.status;
  const effectiveStatus = status || errorStatus;

  const retryAfterMatch = message.match(/retry.?after[:\s]+(\d+)/i);
  const retryAfter = (error as any)?.retryAfter;
  const retryAfterSeconds = retryAfterMatch
    ? parseInt(retryAfterMatch[1], 10)
    : retryAfter
      ? Math.ceil(retryAfter / 1000)
      : undefined;

  // Rate limit detection (429)
  if (
    effectiveStatus === 429 ||
    lowerMessage.includes("429") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("quota exceeded")
  ) {
    return {
      category: ErrorCategory.RETRYABLE_RATE_LIMIT,
      retryable: true,
      httpStatus: 503,
      retryAfterSeconds: retryAfterSeconds || 30,
      message,
    };
  }

  // Server errors (5xx)
  if (effectiveStatus && effectiveStatus >= 500 && effectiveStatus < 600) {
    return {
      category: ErrorCategory.RETRYABLE_SERVER_ERROR,
      retryable: true,
      httpStatus: 503,
      retryAfterSeconds: 10,
      message,
    };
  }

  // Transient network errors
  if (
    lowerMessage.includes("econnreset") ||
    lowerMessage.includes("etimedout") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("socket hang up") ||
    lowerMessage.includes("connection refused")
  ) {
    return {
      category: ErrorCategory.RETRYABLE_SERVER_ERROR,
      retryable: true,
      httpStatus: 503,
      retryAfterSeconds: 5,
      message,
    };
  }

  // Invalid input (400)
  if (
    effectiveStatus === 400 ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("malformed") ||
    lowerMessage.includes("bad request")
  ) {
    return {
      category: ErrorCategory.PERMANENT_INVALID_INPUT,
      retryable: false,
      httpStatus: 500,
      message,
    };
  }

  // Not found (404)
  if (
    effectiveStatus === 404 ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("does not exist")
  ) {
    return {
      category: ErrorCategory.PERMANENT_NOT_FOUND,
      retryable: false,
      httpStatus: 500,
      message,
    };
  }

  // Authentication/authorization errors
  if (
    effectiveStatus === 401 ||
    effectiveStatus === 403 ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("authentication")
  ) {
    return {
      category: ErrorCategory.PERMANENT_INVALID_INPUT,
      retryable: false,
      httpStatus: 500,
      message,
    };
  }

  // Unknown errors - assume retryable
  return {
    category: ErrorCategory.UNKNOWN,
    retryable: true,
    httpStatus: 503,
    retryAfterSeconds: 15,
    message,
  };
}


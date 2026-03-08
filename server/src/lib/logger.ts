/**
 * Structured logger — zero dependencies.
 *
 * Outputs JSON when LOG_FORMAT=json (default in Docker), plain text otherwise.
 * Create child loggers with bound context (e.g. scenarioRunId) via logger.child().
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const jsonMode = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

interface LogContext {
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatPlain(level: LogLevel, ctx: LogContext, msg: string): string {
  const tag = ctx.component ? `[${ctx.component}]` : '';
  const extra = Object.entries(ctx)
    .filter(([k]) => k !== 'component')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return `${tag} ${msg}${extra ? ' ' + extra : ''}`.trim();
}

function emit(level: LogLevel, ctx: LogContext, msg: string, extra?: unknown) {
  if (!shouldLog(level)) return;

  if (jsonMode) {
    const entry: Record<string, unknown> = {
      level,
      msg,
      time: new Date().toISOString(),
      ...ctx,
    };
    if (extra !== undefined) {
      entry.error = extra instanceof Error ? { message: extra.message, stack: extra.stack } : extra;
    }
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (extra !== undefined) {
      fn(formatPlain(level, ctx, msg), extra);
    } else {
      fn(formatPlain(level, ctx, msg));
    }
  }
}

export interface Logger {
  debug(msg: string, extra?: unknown): void;
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
  child(ctx: LogContext): Logger;
}

function createLogger(ctx: LogContext = {}): Logger {
  return {
    debug: (msg, extra?) => emit('debug', ctx, msg, extra),
    info: (msg, extra?) => emit('info', ctx, msg, extra),
    warn: (msg, extra?) => emit('warn', ctx, msg, extra),
    error: (msg, extra?) => emit('error', ctx, msg, extra),
    child: (childCtx) => createLogger({ ...ctx, ...childCtx }),
  };
}

export const log = createLogger();

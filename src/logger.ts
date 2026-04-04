// ---------------------------------------------------------------------------
// Logger — structured logging with configurable levels
//
// Consumers can configure via setLogLevel() or provide a custom logger.
// Defaults to silent in production, 'warn' otherwise.
// ---------------------------------------------------------------------------

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export interface Logger {
  error(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

const LOG_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

let currentLevel: LogLevel = 'warn';
let customLogger: Logger | null = null;

function shouldLog(level: LogLevel): boolean {
  return LOG_PRIORITY[level] <= LOG_PRIORITY[currentLevel];
}

function formatMessage(level: string, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[calculator-engine] ${timestamp} ${level.toUpperCase()}:`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

const defaultLogger: Logger = {
  error(message, data) {
    if (shouldLog('error')) console.error(formatMessage('error', message, data));
  },
  warn(message, data) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, data));
  },
  info(message, data) {
    if (shouldLog('info')) console.info(formatMessage('info', message, data));
  },
  debug(message, data) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, data));
  },
};

/** Get the active logger instance */
export function getLogger(): Logger {
  return customLogger ?? defaultLogger;
}

/** Set the minimum log level (default: 'warn') */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Provide a custom logger implementation (e.g., for server-side or testing) */
export function setLogger(logger: Logger | null): void {
  customLogger = logger;
}

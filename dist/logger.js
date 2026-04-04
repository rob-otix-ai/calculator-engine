// ---------------------------------------------------------------------------
// Logger — structured logging with configurable levels
//
// Consumers can configure via setLogLevel() or provide a custom logger.
// Defaults to silent in production, 'warn' otherwise.
// ---------------------------------------------------------------------------
const LOG_PRIORITY = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
};
let currentLevel = 'warn';
let customLogger = null;
function shouldLog(level) {
    return LOG_PRIORITY[level] <= LOG_PRIORITY[currentLevel];
}
function formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = `[calculator-engine] ${timestamp} ${level.toUpperCase()}:`;
    if (data && Object.keys(data).length > 0) {
        return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
}
const defaultLogger = {
    error(message, data) {
        if (shouldLog('error'))
            console.error(formatMessage('error', message, data));
    },
    warn(message, data) {
        if (shouldLog('warn'))
            console.warn(formatMessage('warn', message, data));
    },
    info(message, data) {
        if (shouldLog('info'))
            console.info(formatMessage('info', message, data));
    },
    debug(message, data) {
        if (shouldLog('debug'))
            console.debug(formatMessage('debug', message, data));
    },
};
/** Get the active logger instance */
export function getLogger() {
    return customLogger !== null && customLogger !== void 0 ? customLogger : defaultLogger;
}
/** Set the minimum log level (default: 'warn') */
export function setLogLevel(level) {
    currentLevel = level;
}
/** Provide a custom logger implementation (e.g., for server-side or testing) */
export function setLogger(logger) {
    customLogger = logger;
}

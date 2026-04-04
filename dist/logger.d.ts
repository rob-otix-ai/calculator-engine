export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
export interface Logger {
    error(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    debug(message: string, data?: Record<string, unknown>): void;
}
/** Get the active logger instance */
export declare function getLogger(): Logger;
/** Set the minimum log level (default: 'warn') */
export declare function setLogLevel(level: LogLevel): void;
/** Provide a custom logger implementation (e.g., for server-side or testing) */
export declare function setLogger(logger: Logger | null): void;
//# sourceMappingURL=logger.d.ts.map
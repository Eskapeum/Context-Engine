/**
 * Universal Context Engine (UCE) - Centralized Logging
 * @module utils/logger
 *
 * Single logging interface for consistent output.
 * Architecture Reference: Step 5 - Logging Pattern
 *
 * IMPORTANT: All modules must use this logger, never console.log directly.
 */

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

export interface LoggerOptions {
  /** Minimum level to output */
  level?: LogLevel;
  /** Output format: 'pretty' for CLI, 'json' for MCP/SDK */
  format?: 'pretty' | 'json';
  /** Enable colored output (CLI only) */
  colors?: boolean;
  /** Custom output function (for testing) */
  output?: (entry: LogEntry) => void;
}

// =============================================================================
// Log Level Priorities
// =============================================================================

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// =============================================================================
// ANSI Colors
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// =============================================================================
// Logger Class
// =============================================================================

class Logger {
  private level: LogLevel;
  private format: 'pretty' | 'json';
  private useColors: boolean;
  private customOutput?: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || this.getDefaultLevel();
    this.format = options.format || this.getDefaultFormat();
    this.useColors = options.colors ?? process.stdout.isTTY ?? false;
    this.customOutput = options.output;
  }

  /**
   * Get default log level from environment
   */
  private getDefaultLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel && envLevel in levelPriority) {
      return envLevel as LogLevel;
    }
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  }

  /**
   * Get default format from environment
   */
  private getDefaultFormat(): 'pretty' | 'json' {
    if (process.env.LOG_FORMAT === 'json') {
      return 'json';
    }
    // Use JSON for non-TTY (piped output, MCP)
    return process.stdout.isTTY ? 'pretty' : 'json';
  }

  /**
   * Check if a level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] >= levelPriority[this.level];
  }

  /**
   * Format context object for display
   */
  private formatContext(context: LogContext): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(context)) {
      const formatted =
        typeof value === 'string' ? value : JSON.stringify(value);
      parts.push(`${key}=${formatted}`);
    }
    return parts.join(' ');
  }

  /**
   * Apply color to text
   */
  private colorize(text: string, color: keyof typeof colors): string {
    if (!this.useColors) return text;
    return `${colors[color]}${text}${colors.reset}`;
  }

  /**
   * Get level indicator for pretty format
   */
  private getLevelIndicator(level: LogLevel): string {
    const indicators: Record<LogLevel, { symbol: string; color: keyof typeof colors }> = {
      debug: { symbol: '●', color: 'gray' },
      info: { symbol: '●', color: 'blue' },
      warn: { symbol: '▲', color: 'yellow' },
      error: { symbol: '✗', color: 'red' },
    };
    const { symbol, color } = indicators[level];
    return this.colorize(symbol, color);
  }

  /**
   * Output a log entry
   */
  private output(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    // Custom output handler (for testing)
    if (this.customOutput) {
      this.customOutput(entry);
      return;
    }

    // JSON format
    if (this.format === 'json') {
      const output = level === 'error' ? process.stderr : process.stdout;
      output.write(JSON.stringify(entry) + '\n');
      return;
    }

    // Pretty format
    const indicator = this.getLevelIndicator(level);
    const timestamp = this.colorize(
      new Date().toLocaleTimeString(),
      'dim'
    );
    const contextStr = context
      ? ` ${this.colorize(this.formatContext(context), 'gray')}`
      : '';

    const output = level === 'error' ? process.stderr : process.stdout;
    output.write(`${indicator} ${timestamp} ${message}${contextStr}\n`);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Log debug message (verbose, development only)
   */
  debug(message: string, context?: LogContext): void {
    this.output('debug', message, context);
  }

  /**
   * Log info message (normal operation)
   */
  info(message: string, context?: LogContext): void {
    this.output('info', message, context);
  }

  /**
   * Log warning message (potential issue)
   */
  warn(message: string, context?: LogContext): void {
    this.output('warn', message, context);
  }

  /**
   * Log error message (failure)
   */
  error(message: string, context?: LogContext): void {
    this.output('error', message, context);
  }

  /**
   * Create a child logger with additional context
   */
  child(baseContext: LogContext): {
    debug: (msg: string, ctx?: LogContext) => void;
    info: (msg: string, ctx?: LogContext) => void;
    warn: (msg: string, ctx?: LogContext) => void;
    error: (msg: string, ctx?: LogContext) => void;
  } {
    return {
      debug: (msg, ctx) => this.debug(msg, { ...baseContext, ...ctx }),
      info: (msg, ctx) => this.info(msg, { ...baseContext, ...ctx }),
      warn: (msg, ctx) => this.warn(msg, { ...baseContext, ...ctx }),
      error: (msg, ctx) => this.error(msg, { ...baseContext, ...ctx }),
    };
  }

  /**
   * Configure logger settings
   */
  configure(options: LoggerOptions): void {
    if (options.level) this.level = options.level;
    if (options.format) this.format = options.format;
    if (options.colors !== undefined) this.useColors = options.colors;
    if (options.output) this.customOutput = options.output;
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Global logger instance
 *
 * Usage:
 * ```typescript
 * import { logger } from './utils/logger';
 *
 * logger.info('Indexing started', { files: 127 });
 * logger.warn('File skipped', { path, reason: 'binary' });
 * logger.error('Parse failed', { path, error });
 * logger.debug('Symbol extracted', { name, type, line });
 * ```
 */
export const logger = new Logger();

/**
 * Create a new logger instance with custom options
 */
export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options);
}

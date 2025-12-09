/**
 * Universal Context Engine (UCE) - Error Handling
 * @module utils/errors
 *
 * UCEError hierarchy for consistent error handling.
 * Architecture Reference: Step 5 - Error Handling Patterns
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * All UCE error codes
 */
export const ErrorCodes = {
  // Index errors
  INDEX_NOT_FOUND: 'INDEX_NOT_FOUND',
  INDEX_CORRUPTED: 'INDEX_CORRUPTED',

  // Parse errors
  PARSE_FAILED: 'PARSE_FAILED',
  UNSUPPORTED_LANGUAGE: 'UNSUPPORTED_LANGUAGE',

  // File errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // Query errors
  QUERY_EMPTY: 'QUERY_EMPTY',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',

  // System errors
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// Error Solutions
// =============================================================================

/**
 * User-friendly solutions for each error code
 */
const errorSolutions: Record<ErrorCode, string> = {
  INDEX_NOT_FOUND: 'Run `ucm index` to create the index.',
  INDEX_CORRUPTED: 'Run `ucm index --rebuild` to rebuild the index.',
  PARSE_FAILED:
    'Check the file for syntax errors. UCE will use tokenization fallback.',
  UNSUPPORTED_LANGUAGE:
    'This language is not yet supported. File will be tokenized instead.',
  FILE_NOT_FOUND: 'Verify the file path exists and is accessible.',
  PERMISSION_DENIED:
    'Check file permissions or add to .gitignore to exclude.',
  QUERY_EMPTY: 'Provide a search query. Example: ucm query "auth logic"',
  LOW_CONFIDENCE:
    'Try a more specific query or check if the code exists in your project.',
  TIMEOUT: 'The operation took too long. Try with a smaller scope.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please report this issue.',
};

// =============================================================================
// Base UCE Error
// =============================================================================

/**
 * Base error class for all UCE errors
 */
export class UCEError extends Error {
  /** Error code for programmatic handling */
  readonly code: ErrorCode;
  /** User-friendly error message */
  readonly userMessage: string;
  /** Technical details for debugging */
  readonly technical?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      userMessage?: string;
      technical?: unknown;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'UCEError';
    this.code = code;
    this.userMessage =
      options?.userMessage || `${message}\n\nFix: ${errorSolutions[code]}`;
    this.technical = options?.technical;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Format error for CLI display
   */
  toCliOutput(emoji = true): string {
    const prefix = emoji ? '✗' : '[ERR]';
    return `${prefix} ${this.message}\n\n${this.userMessage}`;
  }

  /**
   * Format error for JSON/MCP response
   */
  toJSON(): {
    code: string;
    message: string;
    userMessage: string;
    technical?: unknown;
  } {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      ...(this.technical ? { technical: this.technical } : {}),
    };
  }
}

// =============================================================================
// Specialized Error Classes
// =============================================================================

/**
 * Errors related to index operations
 */
export class IndexError extends UCEError {
  constructor(
    code: Extract<ErrorCode, 'INDEX_NOT_FOUND' | 'INDEX_CORRUPTED'>,
    message: string,
    options?: { userMessage?: string; technical?: unknown; cause?: Error }
  ) {
    super(code, message, options);
    this.name = 'IndexError';
  }
}

/**
 * Errors related to parsing operations
 */
export class ParseError extends UCEError {
  /** File that failed to parse */
  readonly filePath?: string;

  constructor(
    code: Extract<ErrorCode, 'PARSE_FAILED' | 'UNSUPPORTED_LANGUAGE'>,
    message: string,
    options?: {
      userMessage?: string;
      technical?: unknown;
      cause?: Error;
      filePath?: string;
    }
  ) {
    super(code, message, options);
    this.name = 'ParseError';
    this.filePath = options?.filePath;
  }
}

/**
 * Errors related to retrieval/query operations
 */
export class RetrievalError extends UCEError {
  constructor(
    code: Extract<ErrorCode, 'QUERY_EMPTY' | 'LOW_CONFIDENCE' | 'TIMEOUT'>,
    message: string,
    options?: { userMessage?: string; technical?: unknown; cause?: Error }
  ) {
    super(code, message, options);
    this.name = 'RetrievalError';
  }
}

/**
 * Errors related to MCP server operations
 */
export class MCPError extends UCEError {
  constructor(
    message: string,
    options?: {
      code?: ErrorCode;
      userMessage?: string;
      technical?: unknown;
      cause?: Error;
    }
  ) {
    super(options?.code || 'INTERNAL_ERROR', message, options);
    this.name = 'MCPError';
  }
}

/**
 * Errors related to file system operations
 */
export class FileSystemError extends UCEError {
  /** Path that caused the error */
  readonly path?: string;

  constructor(
    code: Extract<ErrorCode, 'FILE_NOT_FOUND' | 'PERMISSION_DENIED'>,
    message: string,
    options?: {
      userMessage?: string;
      technical?: unknown;
      cause?: Error;
      path?: string;
    }
  ) {
    super(code, message, options);
    this.name = 'FileSystemError';
    this.path = options?.path;
  }
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Check if an error is a UCE error
 */
export function isUCEError(error: unknown): error is UCEError {
  return error instanceof UCEError;
}

/**
 * Wrap an unknown error as a UCE error
 */
export function wrapError(error: unknown, context?: string): UCEError {
  if (isUCEError(error)) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : String(error);

  return new UCEError('INTERNAL_ERROR', context ? `${context}: ${message}` : message, {
    cause: error instanceof Error ? error : undefined,
    technical: error,
  });
}

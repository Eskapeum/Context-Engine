/**
 * Universal Context Engine (UCE) - Utilities Module
 * @module utils
 *
 * Re-exports all utility functions and types.
 */

// Error handling
export {
  UCEError,
  IndexError,
  ParseError,
  RetrievalError,
  MCPError,
  FileSystemError,
  ErrorCodes,
  isUCEError,
  wrapError,
  type ErrorCode,
} from './errors.js';

// Logging
export {
  logger,
  createLogger,
  type LogLevel,
  type LogContext,
  type LogEntry,
  type LoggerOptions,
} from './logger.js';

// Path utilities
export {
  normalizePath,
  relativeTo,
  joinPaths,
  resolvePath,
  getProjectRoot,
  createIgnoreFilter,
  isIgnored,
  isBinaryExtension,
  getExtension,
  isFile,
  isDirectory,
  pathExists,
  DEFAULT_IGNORE_PATTERNS,
} from './paths.js';

// String utilities
export {
  splitCamelCase,
  splitSnakeCase,
  splitKebabCase,
  splitIdentifier,
  truncate,
  toKebabCase,
  toSnakeCase,
  toCamelCase,
  toPascalCase,
  tokenize,
  isIdentifier,
  extractSnippet,
  estimateTokens,
} from './strings.js';

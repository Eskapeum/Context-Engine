/**
 * Universal Context Engine (UCE) - String Utilities
 * @module utils/strings
 *
 * String manipulation helpers, especially for BM25 tokenization.
 * Architecture Reference: Step 5 - Code Economy
 */

// =============================================================================
// Case Splitting
// =============================================================================

/**
 * Split a camelCase or PascalCase string into words
 *
 * @example
 * splitCamelCase('getUserName') // ['get', 'User', 'Name']
 * splitCamelCase('XMLParser') // ['XML', 'Parser']
 */
export function splitCamelCase(str: string): string[] {
  if (!str) return [];

  // Handle consecutive uppercase (acronyms) followed by lowercase
  // e.g., XMLParser -> XML, Parser
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Handle lowercase followed by uppercase
    // e.g., getUserName -> get User Name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Handle numbers
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Split a snake_case or SCREAMING_SNAKE_CASE string into words
 *
 * @example
 * splitSnakeCase('get_user_name') // ['get', 'user', 'name']
 * splitSnakeCase('MAX_FILE_SIZE') // ['MAX', 'FILE', 'SIZE']
 */
export function splitSnakeCase(str: string): string[] {
  if (!str) return [];
  return str.split(/_+/).filter(Boolean);
}

/**
 * Split a kebab-case string into words
 *
 * @example
 * splitKebabCase('get-user-name') // ['get', 'user', 'name']
 */
export function splitKebabCase(str: string): string[] {
  if (!str) return [];
  return str.split(/-+/).filter(Boolean);
}

/**
 * Split any identifier into words (handles camel, snake, kebab)
 *
 * @example
 * splitIdentifier('getUserName') // ['get', 'user', 'name']
 * splitIdentifier('get_user_name') // ['get', 'user', 'name']
 * splitIdentifier('get-user-name') // ['get', 'user', 'name']
 */
export function splitIdentifier(str: string): string[] {
  if (!str) return [];

  // First split by underscores and dashes
  const parts = str.split(/[_-]+/);

  // Then split each part by camelCase
  const words: string[] = [];
  for (const part of parts) {
    words.push(...splitCamelCase(part));
  }

  return words.filter(Boolean).map((w) => w.toLowerCase());
}

// =============================================================================
// String Manipulation
// =============================================================================

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 *
 * @example
 * truncate('Hello World', 8) // 'Hello...'
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert string to kebab-case
 *
 * @example
 * toKebabCase('getUserName') // 'get-user-name'
 * toKebabCase('get_user_name') // 'get-user-name'
 */
export function toKebabCase(str: string): string {
  return splitIdentifier(str).join('-');
}

/**
 * Convert string to snake_case
 *
 * @example
 * toSnakeCase('getUserName') // 'get_user_name'
 */
export function toSnakeCase(str: string): string {
  return splitIdentifier(str).join('_');
}

/**
 * Convert string to camelCase
 *
 * @example
 * toCamelCase('get-user-name') // 'getUserName'
 * toCamelCase('get_user_name') // 'getUserName'
 */
export function toCamelCase(str: string): string {
  const words = splitIdentifier(str);
  if (words.length === 0) return '';
  return (
    words[0] +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')
  );
}

/**
 * Convert string to PascalCase
 *
 * @example
 * toPascalCase('get-user-name') // 'GetUserName'
 */
export function toPascalCase(str: string): string {
  return splitIdentifier(str)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// =============================================================================
// Tokenization for Search
// =============================================================================

/**
 * Common stop words to filter out in search
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for',
  'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
  'or', 'that', 'the', 'to', 'was', 'were', 'will', 'with',
  // Code-specific stop words
  'var', 'let', 'const', 'function', 'return', 'if', 'else',
  'import', 'export', 'from', 'default', 'class', 'extends',
  'this', 'new', 'true', 'false', 'null', 'undefined',
]);

/**
 * Tokenize text for search indexing/querying
 * Splits on word boundaries, handles identifiers, removes stop words
 *
 * @example
 * tokenize('getUserName returns the user name')
 * // ['get', 'user', 'name', 'returns', 'user', 'name']
 */
export function tokenize(text: string, options?: { keepStopWords?: boolean }): string[] {
  if (!text) return [];

  // Split on non-alphanumeric characters
  const rawTokens = text.split(/[^a-zA-Z0-9]+/);

  const tokens: string[] = [];
  for (const token of rawTokens) {
    if (!token) continue;

    // Split identifiers (camelCase, etc.)
    const words = splitIdentifier(token);
    for (const word of words) {
      const lower = word.toLowerCase();
      // Filter short words and stop words
      if (lower.length < 2) continue;
      if (!options?.keepStopWords && STOP_WORDS.has(lower)) continue;
      tokens.push(lower);
    }
  }

  return tokens;
}

/**
 * Check if a string is likely an identifier (variable/function name)
 */
export function isIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

// =============================================================================
// Text Extraction
// =============================================================================

/**
 * Extract a snippet of text around a position
 *
 * @param text - Full text
 * @param line - Line number (1-indexed)
 * @param contextLines - Number of lines before/after to include
 */
export function extractSnippet(
  text: string,
  line: number,
  contextLines = 3
): { content: string; startLine: number; endLine: number } {
  const lines = text.split('\n');
  const lineIndex = line - 1; // Convert to 0-indexed

  const startLine = Math.max(0, lineIndex - contextLines);
  const endLine = Math.min(lines.length - 1, lineIndex + contextLines);

  const content = lines.slice(startLine, endLine + 1).join('\n');

  return {
    content,
    startLine: startLine + 1, // Convert back to 1-indexed
    endLine: endLine + 1,
  };
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Universal Context Engine (UCE) - Path Utilities
 * @module utils/paths
 *
 * Consistent path handling across platforms.
 * Architecture Reference: Step 5 - Structure Patterns
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';

// =============================================================================
// Path Normalization
// =============================================================================

/**
 * Normalize path separators to forward slashes (Unix-style)
 * This ensures consistent paths across Windows and Unix systems
 */
export function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Get relative path from base to target, normalized
 */
export function relativeTo(base: string, target: string): string {
  return normalizePath(relative(base, target));
}

/**
 * Join paths and normalize the result
 */
export function joinPaths(...paths: string[]): string {
  return normalizePath(join(...paths));
}

/**
 * Resolve to absolute path and normalize
 */
export function resolvePath(...paths: string[]): string {
  return normalizePath(resolve(...paths));
}

// =============================================================================
// Project Root Detection
// =============================================================================

/** Markers that indicate a project root */
const PROJECT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  '.git',
  'Makefile',
];

/**
 * Find the project root by looking for common project markers
 *
 * @param startPath - Starting directory (defaults to cwd)
 * @returns Project root path, or startPath if no markers found
 */
export function getProjectRoot(startPath?: string): string {
  let current = resolve(startPath || process.cwd());
  const root = resolve('/');

  while (current !== root) {
    for (const marker of PROJECT_MARKERS) {
      const markerPath = join(current, marker);
      if (existsSync(markerPath)) {
        return normalizePath(current);
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // No markers found, return start path
  return normalizePath(resolve(startPath || process.cwd()));
}

// =============================================================================
// Gitignore Handling
// =============================================================================

/**
 * Create an ignore instance from patterns
 */
export function createIgnoreFilter(patterns: string[]): Ignore {
  return ignore().add(patterns);
}

/**
 * Check if a path should be ignored based on patterns
 *
 * @param path - Path relative to project root
 * @param patterns - Gitignore-style patterns
 */
export function isIgnored(path: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const ig = ignore().add(patterns);
  return ig.ignores(normalizePath(path));
}

/**
 * Default ignore patterns for code projects
 */
export const DEFAULT_IGNORE_PATTERNS = [
  // Dependencies
  'node_modules/',
  'vendor/',
  '.venv/',
  'venv/',
  '__pycache__/',

  // Build outputs
  'dist/',
  'build/',
  'out/',
  'target/',
  '.next/',
  '.nuxt/',

  // IDE and editor
  '.idea/',
  '.vscode/',
  '*.swp',
  '*.swo',

  // VCS
  '.git/',
  '.svn/',
  '.hg/',

  // OS
  '.DS_Store',
  'Thumbs.db',

  // UCE index
  '.uce/',

  // Test coverage
  'coverage/',
  '.nyc_output/',

  // Logs
  '*.log',
  'npm-debug.log*',

  // Lock files (often large)
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

// =============================================================================
// File Type Detection
// =============================================================================

/**
 * Check if a file is likely binary based on extension
 */
const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  // Audio/Video
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  // Archives
  '.zip', '.tar', '.gz', '.rar', '.7z',
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.bin',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // Data
  '.db', '.sqlite', '.sqlite3',
  // Other
  '.wasm', '.pyc', '.class',
]);

/**
 * Check if a file is likely binary based on extension
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

/**
 * Get file extension (lowercase, with dot)
 */
export function getExtension(filePath: string): string {
  const match = filePath.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] || '';
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Check if a path exists and is a file
 */
export function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a directory
 */
export function isDirectory(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists
 */
export function pathExists(path: string): boolean {
  return existsSync(path);
}

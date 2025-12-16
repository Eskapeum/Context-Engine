/**
 * Library Documentation Module
 *
 * Local-first library documentation system.
 * Extracts and caches documentation from node_modules .d.ts files.
 *
 * @module library-docs
 */

// Types
export type {
  APIEntry,
  ParamDoc,
  LibraryDocResult,
  DocsCacheEntry,
  DocsCacheIndex,
  ExtractionOptions,
  DtsParseResult,
  DocsManagerOptions,
  DocsQueryOptions,
  LibraryDocsConfig,
} from './types.js';

// Classes
export { DocsCache } from './docs-cache.js';
export { LocalExtractor } from './local-extractor.js';
export { DocsManager } from './docs-manager.js';

// Default export
export { DocsManager as default } from './docs-manager.js';

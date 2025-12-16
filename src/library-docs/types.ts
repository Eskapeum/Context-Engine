/**
 * Library Documentation Types
 *
 * Type definitions for the local-first library documentation system.
 * Extracts and caches documentation from node_modules .d.ts files.
 *
 * @module library-docs/types
 */

// ============================================================================
// API REFERENCE TYPES
// ============================================================================

/**
 * Single API entry (function, class, type, etc.)
 */
export interface APIEntry {
  /** Entry name */
  name: string;

  /** Entry type */
  type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'method' | 'property';

  /** Type signature */
  signature?: string;

  /** JSDoc description */
  description?: string;

  /** Parameter documentation */
  params?: ParamDoc[];

  /** Return type documentation */
  returns?: {
    type: string;
    description?: string;
  };

  /** Code examples */
  examples?: string[];

  /** Deprecation notice */
  deprecated?: string;

  /** Since version */
  since?: string;

  /** Related APIs */
  see?: string[];
}

/**
 * Parameter documentation
 */
export interface ParamDoc {
  /** Parameter name */
  name: string;

  /** Parameter type */
  type: string;

  /** Whether parameter is optional */
  optional?: boolean;

  /** Default value */
  defaultValue?: string;

  /** Description */
  description?: string;
}

// ============================================================================
// LIBRARY DOC RESULT
// ============================================================================

/**
 * Complete library documentation result
 */
export interface LibraryDocResult {
  /** Library name (e.g., 'react', 'lodash') */
  library: string;

  /** Library version */
  version: string;

  /** Brief summary of the library */
  summary: string;

  /** API reference entries */
  apiReference: APIEntry[];

  /** Source of documentation */
  source: 'local' | 'cache';

  /** Main exports */
  mainExports?: string[];

  /** Submodules available */
  submodules?: string[];

  /** Dependencies */
  dependencies?: string[];

  /** Timestamp when extracted */
  extractedAt: string;

  /** Cache expiry timestamp */
  expiresAt?: string;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Cache entry for library docs
 */
export interface DocsCacheEntry {
  /** Library documentation */
  docs: LibraryDocResult;

  /** Cache timestamp */
  cachedAt: string;

  /** TTL in milliseconds */
  ttl: number;

  /** Source file hash for invalidation */
  sourceHash?: string;
}

/**
 * Cache index structure
 */
export interface DocsCacheIndex {
  /** Version of cache format */
  version: string;

  /** Entries by library@version key */
  entries: Record<string, DocsCacheEntry>;

  /** Last cleanup timestamp */
  lastCleanup?: string;
}

// ============================================================================
// EXTRACTION TYPES
// ============================================================================

/**
 * Options for extracting library docs
 */
export interface ExtractionOptions {
  /** Maximum number of API entries to extract */
  maxEntries?: number;

  /** Include private/internal APIs */
  includePrivate?: boolean;

  /** Include deprecated APIs */
  includeDeprecated?: boolean;

  /** Specific submodules to extract */
  submodules?: string[];

  /** Extract examples from JSDoc */
  extractExamples?: boolean;
}

/**
 * Result of .d.ts file parsing
 */
export interface DtsParseResult {
  /** Parsed API entries */
  entries: APIEntry[];

  /** Module name */
  moduleName: string;

  /** Exports */
  exports: string[];

  /** Submodules found */
  submodules: string[];

  /** Parse errors (non-fatal) */
  warnings?: string[];
}

// ============================================================================
// MANAGER TYPES
// ============================================================================

/**
 * Options for docs manager
 */
export interface DocsManagerOptions {
  /** Project root directory */
  projectRoot: string;

  /** Cache directory (default: .uce/library-docs) */
  cacheDir?: string;

  /** Cache TTL in milliseconds (default: 7 days) */
  cacheTTL?: number;

  /** Prefer local extraction over cache */
  preferLocal?: boolean;

  /** Auto-cleanup expired cache entries */
  autoCleanup?: boolean;
}

/**
 * Query options for getting docs
 */
export interface DocsQueryOptions {
  /** Specific version to get */
  version?: string;

  /** Force refresh from source */
  forceRefresh?: boolean;

  /** Extraction options */
  extraction?: ExtractionOptions;
}

// ============================================================================
// CONFIG EXTENSION
// ============================================================================

/**
 * Library docs configuration (for UCEConfig)
 */
export interface LibraryDocsConfig {
  /** Enable library docs feature */
  enabled?: boolean;

  /** Prefer local extraction */
  preferLocal?: boolean;

  /** Cache TTL in milliseconds */
  cacheTTL?: number;

  /** Auto cleanup interval in milliseconds */
  cleanupInterval?: number;

  /** Maximum cache size in MB */
  maxCacheSize?: number;
}

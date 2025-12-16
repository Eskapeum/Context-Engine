/**
 * Context Sharing Types
 *
 * Types for exporting/importing context bundles
 * for team collaboration.
 *
 * @module sharing/types
 */

// ============================================================================
// BUNDLE TYPES
// ============================================================================

/**
 * A shareable context bundle
 */
export interface ContextBundle {
  /** Bundle format version */
  version: string;
  /** Creation timestamp */
  created: string;
  /** Source information */
  source: BundleSource;
  /** Bundle components */
  components: BundleComponents;
  /** Bundle metadata */
  metadata: BundleMetadata;
}

/**
 * Bundle source information
 */
export interface BundleSource {
  /** Project name (optional, for display) */
  projectName?: string;
  /** Content hash for deduplication */
  hash: string;
  /** Git branch (if available) */
  gitBranch?: string;
  /** Git commit (if available) */
  gitCommit?: string;
  /** Creator identifier (optional) */
  creator?: string;
}

/**
 * Bundle components
 */
export interface BundleComponents {
  /** Code index data */
  index?: SerializedIndex;
  /** Knowledge graph data */
  graph?: SerializedGraph;
  /** Library documentation cache */
  libraryDocs?: SerializedLibraryDocs;
  /** Session summaries (anonymized) */
  summaries?: SerializedSummaries;
}

/**
 * Serialized index format
 */
export interface SerializedIndex {
  /** Index format version */
  version: string;
  /** File count */
  fileCount: number;
  /** Symbol count */
  symbolCount: number;
  /** Chunk count */
  chunkCount: number;
  /** File entries (relative paths) */
  files: SerializedFileEntry[];
  /** Compressed index data */
  data?: string;
}

/**
 * Serialized file entry
 */
export interface SerializedFileEntry {
  /** Relative file path */
  path: string;
  /** Content hash */
  hash: string;
  /** Symbol names */
  symbols: string[];
  /** Last modified */
  modified: string;
}

/**
 * Serialized graph format
 */
export interface SerializedGraph {
  /** Graph format version */
  version: string;
  /** Node count */
  nodeCount: number;
  /** Edge count */
  edgeCount: number;
  /** Serialized nodes */
  nodes: unknown[];
  /** Serialized edges */
  edges: unknown[];
}

/**
 * Serialized library docs
 */
export interface SerializedLibraryDocs {
  /** Library entries */
  libraries: {
    name: string;
    version: string;
    summary: string;
  }[];
}

/**
 * Serialized summaries
 */
export interface SerializedSummaries {
  /** Session summaries */
  summaries: {
    topics: string[];
    keyFindings: string[];
    filesMentioned: string[];
  }[];
}

/**
 * Bundle metadata
 */
export interface BundleMetadata {
  /** Total file count in project */
  fileCount: number;
  /** Total symbol count */
  symbolCount: number;
  /** Whether bundle is compressed */
  compressed: boolean;
  /** Compression algorithm used */
  compressionAlgorithm?: 'gzip' | 'none';
  /** Original size in bytes */
  originalSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Included component names */
  includedComponents: string[];
  /** Export timestamp */
  exportedAt: string;
}

// ============================================================================
// EXPORT/IMPORT OPTIONS
// ============================================================================

/**
 * Export options
 */
export interface ExportOptions {
  /** Output file path */
  outputPath: string;
  /** Components to include */
  include?: BundleComponentType[];
  /** Components to exclude */
  exclude?: BundleComponentType[];
  /** Enable compression */
  compress?: boolean;
  /** Privacy settings */
  privacy?: PrivacySettings;
  /** Include project name in bundle */
  includeProjectName?: boolean;
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Merge with existing context (vs replace) */
  merge: boolean;
  /** Overwrite conflicts */
  overwrite: boolean;
  /** Components to import */
  components?: BundleComponentType[];
  /** Dry run - preview without applying */
  dryRun: boolean;
}

/**
 * Privacy settings for export
 */
export interface PrivacySettings {
  /** File patterns to exclude from export */
  excludePatterns: string[];
  /** Anonymize symbol names (replace with hashes) */
  anonymizeSymbols: boolean;
  /** Strip code comments */
  stripComments: boolean;
  /** Exclude session history */
  excludeMemory: boolean;
  /** Exclude specific files */
  excludeFiles: string[];
}

/**
 * Bundle component types
 */
export type BundleComponentType = 'index' | 'graph' | 'libraryDocs' | 'summaries';

// ============================================================================
// IMPORT RESULTS
// ============================================================================

/**
 * Import result
 */
export interface ImportResult {
  /** Whether import was successful */
  success: boolean;
  /** Components imported */
  importedComponents: BundleComponentType[];
  /** Number of files added/updated */
  filesImported: number;
  /** Number of symbols added/updated */
  symbolsImported: number;
  /** Conflicts detected */
  conflicts: ImportConflict[];
  /** Errors encountered */
  errors: string[];
  /** Was this a dry run */
  dryRun: boolean;
}

/**
 * Import conflict
 */
export interface ImportConflict {
  /** Component type */
  component: BundleComponentType;
  /** Conflict type */
  type: 'version_mismatch' | 'hash_mismatch' | 'schema_mismatch';
  /** Description */
  description: string;
  /** Resolution action taken */
  resolution?: 'skipped' | 'overwritten' | 'merged';
}

// ============================================================================
// BUNDLE INFO
// ============================================================================

/**
 * Bundle information (for preview)
 */
export interface BundleInfo {
  /** Bundle version */
  version: string;
  /** Creation date */
  created: string;
  /** Source information */
  source: BundleSource;
  /** Metadata */
  metadata: BundleMetadata;
  /** Component summary */
  components: {
    name: BundleComponentType;
    present: boolean;
    size?: number;
    itemCount?: number;
  }[];
}

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  outputPath: 'context.uce',
  include: ['index', 'graph', 'libraryDocs'],
  compress: true,
  privacy: {
    excludePatterns: ['*.env', '*.key', '*.pem', 'credentials.*'],
    anonymizeSymbols: false,
    stripComments: false,
    excludeMemory: true,
    excludeFiles: [],
  },
  includeProjectName: true,
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  merge: false,
  overwrite: false,
  dryRun: false,
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  excludePatterns: ['*.env', '*.key', '*.pem', 'credentials.*', '*.secret'],
  anonymizeSymbols: false,
  stripComments: false,
  excludeMemory: true,
  excludeFiles: [],
};

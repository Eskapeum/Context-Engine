/**
 * Universal Context Engine (UCE) - Core Types
 * @module types
 *
 * All shared TypeScript types for the UCE system.
 * Architecture Reference: Step 5 - Implementation Patterns
 */

// =============================================================================
// Symbol Types
// =============================================================================

/**
 * Types of code symbols that can be extracted from source files
 */
export type SymbolType =
  | 'function'
  | 'class'
  | 'interface'
  | 'variable'
  | 'type'
  | 'enum'
  | 'method'
  | 'property';

/**
 * A code symbol extracted from a source file
 */
export interface CodeSymbol {
  /** Unique identifier for this symbol */
  id: string;
  /** Symbol name as it appears in code */
  name: string;
  /** Type of symbol */
  type: SymbolType;
  /** File path relative to project root */
  filePath: string;
  /** Start line number (1-indexed) */
  line: number;
  /** End line number (1-indexed), if multi-line */
  endLine?: number;
  /** Function/method signature, if applicable */
  signature?: string;
  /** Documentation comment, if present */
  documentation?: string;
}

// =============================================================================
// Index Types
// =============================================================================

/**
 * Metadata about the project index
 */
export interface IndexMeta {
  /** Schema version (semver) */
  version: string;
  /** ISO timestamp when index was created */
  createdAt: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** UCE version that created this index */
  uceVersion: string;
  /** Total number of indexed files */
  fileCount: number;
  /** Total number of extracted symbols */
  symbolCount: number;
}

/**
 * Index entry for a single file
 */
export interface FileIndex {
  /** File path relative to project root */
  path: string;
  /** Detected programming language */
  language: string;
  /** Content hash for change detection */
  hash: string;
  /** ISO timestamp of file modification */
  lastModified: string;
  /** Symbol IDs contained in this file */
  symbols: string[];
  /** Parse method used: 'ast' or 'tokenization' */
  parseMethod: 'ast' | 'tokenization';
  /** Confidence level from validation */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * A dependency relationship between files
 */
export interface DependencyEdge {
  /** Source file path */
  from: string;
  /** Target file path */
  to: string;
  /** Type of dependency */
  type: 'import' | 'export' | 'reference';
}

/**
 * Complete project index structure
 */
export interface ProjectIndex {
  /** Index metadata */
  meta: IndexMeta;
  /** Indexed files keyed by path */
  files: Record<string, FileIndex>;
  /** All extracted symbols */
  symbols: CodeSymbol[];
  /** Dependency relationships */
  dependencies: DependencyEdge[];
}

// =============================================================================
// Query & Retrieval Types
// =============================================================================

/**
 * Options for querying the codebase
 */
export interface QueryOptions {
  /** Maximum number of results to return */
  maxResults?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Filter by programming language */
  language?: string;
  /** Filter by file path pattern (glob) */
  pathPattern?: string;
  /** Filter by symbol types */
  symbolTypes?: SymbolType[];
  /** Include code snippets in results */
  includeSnippets?: boolean;
}

/**
 * A code snippet from search results
 */
export interface CodeSnippet {
  /** Snippet content */
  content: string;
  /** Start line number (1-indexed) */
  startLine: number;
  /** End line number (1-indexed) */
  endLine: number;
  /** Positions of matching terms */
  highlights?: Array<{ start: number; end: number }>;
}

/**
 * A single search result
 */
export interface SearchResult {
  /** File path relative to project root */
  filePath: string;
  /** Relevance score (0-1) */
  score: number;
  /** Symbols found in this file */
  symbols: CodeSymbol[];
  /** Code snippets with matches */
  snippets: CodeSnippet[];
}

/**
 * Query response with metadata
 */
export interface QueryResult {
  /** Search results ordered by relevance */
  results: SearchResult[];
  /** Query execution time in ms */
  queryTime: number;
  /** Total number of matches found */
  totalMatches: number;
  /** Confidence level in results */
  confidence: 'high' | 'medium' | 'low';
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Indexer configuration options
 */
export interface IndexerConfig {
  /** Project root directory */
  projectRoot: string;
  /** Patterns to ignore (gitignore format) */
  ignorePatterns?: string[];
  /** Languages to parse with AST */
  languages?: string[];
  /** Maximum file size to index (bytes) */
  maxFileSize?: number;
  /** Enable incremental indexing */
  incremental?: boolean;
}

/**
 * Context engine configuration
 */
export interface ContextEngineConfig {
  /** Project root directory */
  projectRoot: string;
  /** Automatically index if no index exists */
  autoIndex?: boolean;
  /** Watch for file changes */
  watchChanges?: boolean;
  /** Index storage location */
  indexPath?: string;
}

// =============================================================================
// MCP Types
// =============================================================================

/**
 * MCP tool response format
 */
export interface MCPResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    queryTime: number;
    resultCount?: number;
    tokenCount?: number;
    confidence?: 'high' | 'medium' | 'low';
  };
}

// =============================================================================
// Progress & Callback Types
// =============================================================================

/**
 * Progress phases during indexing
 */
export type IndexPhase = 'scanning' | 'parsing' | 'indexing' | 'saving';

/**
 * Progress callback for long-running operations
 */
export interface ProgressCallback {
  (progress: {
    phase: IndexPhase;
    current: number;
    total: number;
    file?: string;
    message?: string;
  }): void;
}

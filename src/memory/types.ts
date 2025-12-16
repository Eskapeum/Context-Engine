/**
 * Memory Module Types
 *
 * Types for persistent session storage, Q&A history,
 * and context summarization.
 *
 * @module memory/types
 */

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * A single query-response pair
 */
export interface Query {
  /** Unique query ID */
  id: string;
  /** User's question or request */
  question: string;
  /** AI response */
  response: string;
  /** Timestamp */
  timestamp: string;
  /** Files referenced in the query */
  filesReferenced: string[];
  /** Symbols discussed */
  symbolsDiscussed: string[];
  /** Chunks retrieved for context */
  chunksRetrieved: string[];
  /** Token count for the query */
  tokenCount?: number;
  /** Whether this query was successful */
  successful: boolean;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Reference to a retrieved chunk
 */
export interface ChunkRef {
  /** Chunk ID */
  chunkId: string;
  /** File path */
  filePath: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Relevance score */
  score: number;
}

/**
 * Session summary (compressed representation)
 */
export interface SessionSummary {
  /** Summary ID */
  id: string;
  /** Topics discussed */
  topics: string[];
  /** Key findings/conclusions */
  keyFindings: string[];
  /** Files mentioned in the session */
  filesMentioned: string[];
  /** Symbols discussed */
  symbolsMentioned: string[];
  /** Compression ratio (original / compressed) */
  compressionRatio: number;
  /** When summary was generated */
  generatedAt: string;
  /** Number of queries summarized */
  queryCount: number;
}

/**
 * A complete session
 */
export interface Session {
  /** Session ID */
  id: string;
  /** Project root path */
  projectRoot: string;
  /** Session start time */
  startedAt: string;
  /** Session end time (if ended) */
  endedAt?: string;
  /** All Q&A pairs in this session */
  queries: Query[];
  /** Summaries generated for this session */
  summaries: SessionSummary[];
  /** Git branch at session start */
  gitBranch?: string;
  /** Git commit at session start */
  gitCommit?: string;
  /** Session metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Session store configuration
 */
export interface SessionStoreConfig {
  /** Base directory for storage (.uce/memory) */
  storageDir: string;
  /** Maximum sessions to keep (default: 100) */
  maxSessions: number;
  /** Retention period in days (default: 30) */
  retentionDays: number;
  /** Auto-save interval in ms (default: 30000) */
  autoSaveIntervalMs: number;
  /** Enable compression for stored files */
  enableCompression: boolean;
}

/**
 * Session index entry (for quick lookup)
 */
export interface SessionIndexEntry {
  /** Session ID */
  id: string;
  /** Session start time */
  startedAt: string;
  /** Session end time */
  endedAt?: string;
  /** Number of queries */
  queryCount: number;
  /** Topics (from summaries) */
  topics: string[];
  /** Files mentioned */
  files: string[];
  /** Storage path */
  storagePath: string;
}

/**
 * Session index (stored in index.json)
 */
export interface SessionIndex {
  /** Version for migrations */
  version: string;
  /** Project root */
  projectRoot: string;
  /** All session entries */
  sessions: SessionIndexEntry[];
  /** Last updated */
  lastUpdated: string;
}

// ============================================================================
// MEMORY ENGINE TYPES
// ============================================================================

/**
 * Memory engine configuration
 */
export interface MemoryEngineConfig {
  /** Enable memory features */
  enabled: boolean;
  /** Session store config */
  sessionStore: Partial<SessionStoreConfig>;
  /** Enable auto-summarization */
  autoSummarize: boolean;
  /** Summarize after N queries */
  summarizeAfterQueries: number;
  /** Enable commit linking */
  linkCommits: boolean;
}

/**
 * Search options for memory queries
 */
export interface MemorySearchOptions {
  /** Search in query text */
  searchQueries?: boolean;
  /** Search in responses */
  searchResponses?: boolean;
  /** Filter by date range */
  dateRange?: {
    start: string;
    end: string;
  };
  /** Filter by files */
  files?: string[];
  /** Filter by symbols */
  symbols?: string[];
  /** Maximum results */
  limit?: number;
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
  /** Matching queries */
  queries: Query[];
  /** Sessions containing matches */
  sessions: SessionIndexEntry[];
  /** Relevance scores */
  scores: Map<string, number>;
  /** Total matches found */
  totalMatches: number;
}

// ============================================================================
// SUMMARIZATION TYPES
// ============================================================================

/**
 * Summarizer configuration
 */
export interface SummarizerConfig {
  /** Target compression ratio (default: 0.2 = 80% reduction) */
  targetCompressionRatio: number;
  /** Maximum tokens for summary */
  maxSummaryTokens: number;
  /** Include code snippets in summary */
  includeCodeSnippets: boolean;
  /** LLM provider for summarization */
  llmProvider?: 'anthropic' | 'openai' | 'local';
}

/**
 * Input for summarization
 */
export interface SummarizationInput {
  /** Queries to summarize */
  queries: Query[];
  /** Optional context about the project */
  projectContext?: string;
  /** Focus areas for the summary */
  focusAreas?: string[];
}

// ============================================================================
// COMMIT INDEXER TYPES
// ============================================================================

/**
 * Commit reference
 */
export interface CommitRef {
  /** Commit hash */
  hash: string;
  /** Commit message */
  message: string;
  /** Commit timestamp */
  timestamp: string;
  /** Author */
  author: string;
  /** Files changed */
  filesChanged: string[];
  /** Related session IDs (sessions that discussed these files) */
  relatedSessions: string[];
}

/**
 * Commit index
 */
export interface CommitIndex {
  /** Version */
  version: string;
  /** Indexed commits */
  commits: CommitRef[];
  /** Last indexed commit */
  lastIndexedCommit?: string;
  /** Last updated */
  lastUpdated: string;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_SESSION_STORE_CONFIG: SessionStoreConfig = {
  storageDir: '.uce/memory',
  maxSessions: 100,
  retentionDays: 30,
  autoSaveIntervalMs: 30000,
  enableCompression: true,
};

export const DEFAULT_MEMORY_ENGINE_CONFIG: MemoryEngineConfig = {
  enabled: true,
  sessionStore: DEFAULT_SESSION_STORE_CONFIG,
  autoSummarize: true,
  summarizeAfterQueries: 10,
  linkCommits: true,
};

export const DEFAULT_SUMMARIZER_CONFIG: SummarizerConfig = {
  targetCompressionRatio: 0.2,
  maxSummaryTokens: 1000,
  includeCodeSnippets: false,
  llmProvider: 'anthropic',
};

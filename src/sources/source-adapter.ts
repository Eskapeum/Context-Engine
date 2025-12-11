/**
 * Universal Context Engine - Source Adapter Interface
 * @module sources/source-adapter
 *
 * Defines the contract for indexing different data sources.
 * Adapters allow UCE to index beyond just local filesystems:
 * - API endpoints
 * - In-memory code
 * - Remote repositories
 * - Documentation sites
 * - Database schemas
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Source type identifier
 */
export type SourceType = 'filesystem' | 'api' | 'memory' | 'git' | 'docs' | 'database';

/**
 * Source configuration metadata
 */
export interface SourceMetadata {
  /** Unique identifier for this source */
  id: string;
  /** Type of source */
  type: SourceType;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** Custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * File reference from a source
 */
export interface SourceFile {
  /** Unique identifier within the source */
  id: string;
  /** File path or URL */
  path: string;
  /** File content */
  content: string;
  /** Language/file type */
  language?: string;
  /** File metadata */
  metadata: {
    /** Last modified timestamp */
    lastModified?: string;
    /** File size in bytes */
    size?: number;
    /** Content hash for change detection */
    hash?: string;
    /** Custom metadata */
    custom?: Record<string, unknown>;
  };
}

/**
 * Source adapter capabilities
 */
export interface SourceCapabilities {
  /** Can detect file changes */
  supportsChangeDetection: boolean;
  /** Can watch for real-time updates */
  supportsWatch: boolean;
  /** Can list all files */
  supportsListing: boolean;
  /** Can fetch individual files */
  supportsFetch: boolean;
  /** Can batch fetch multiple files */
  supportsBatchFetch: boolean;
}

// ============================================================================
// Source Adapter Interface
// ============================================================================

/**
 * Abstract source adapter interface
 *
 * Implement this interface to add new data sources to UCE.
 *
 * Example:
 * ```typescript
 * class GitHubAdapter implements SourceAdapter {
 *   async initialize() { ... }
 *   async listFiles() { ... }
 *   async fetchFile(id) { ... }
 * }
 * ```
 */
export interface SourceAdapter {
  /**
   * Source metadata
   */
  readonly metadata: SourceMetadata;

  /**
   * Source capabilities
   */
  readonly capabilities: SourceCapabilities;

  /**
   * Initialize the source adapter
   * Called once before any operations
   */
  initialize(): Promise<void>;

  /**
   * List all files available from this source
   * @returns Array of file references
   */
  listFiles(): Promise<SourceFile[]>;

  /**
   * Fetch a specific file by ID
   * @param id - File identifier
   * @returns File content and metadata
   */
  fetchFile(id: string): Promise<SourceFile>;

  /**
   * Batch fetch multiple files
   * @param ids - Array of file identifiers
   * @returns Array of files
   */
  fetchFiles?(ids: string[]): Promise<SourceFile[]>;

  /**
   * Detect changes since last fetch
   * @param lastSync - Timestamp of last sync
   * @returns Changed, added, and removed file IDs
   */
  detectChanges?(lastSync: Date): Promise<{
    added: string[];
    modified: string[];
    removed: string[];
  }>;

  /**
   * Start watching for changes
   * @param callback - Called when changes are detected
   */
  watch?(
    callback: (event: { type: 'added' | 'modified' | 'removed'; fileId: string }) => void
  ): Promise<void>;

  /**
   * Stop watching for changes
   */
  unwatch?(): Promise<void>;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Source Adapter Registry
// ============================================================================

/**
 * Registry for managing multiple source adapters
 */
export class SourceAdapterRegistry {
  private adapters = new Map<string, SourceAdapter>();

  /**
   * Register a source adapter
   */
  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.metadata.id)) {
      throw new Error(`Source adapter already registered: ${adapter.metadata.id}`);
    }
    this.adapters.set(adapter.metadata.id, adapter);
  }

  /**
   * Unregister a source adapter
   */
  unregister(id: string): void {
    const adapter = this.adapters.get(id);
    if (adapter) {
      adapter.dispose();
      this.adapters.delete(id);
    }
  }

  /**
   * Get a source adapter by ID
   */
  get(id: string): SourceAdapter | undefined {
    return this.adapters.get(id);
  }

  /**
   * Get all registered adapters
   */
  getAll(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters by type
   */
  getByType(type: SourceType): SourceAdapter[] {
    return this.getAll().filter((a) => a.metadata.type === type);
  }

  /**
   * Clear all adapters
   */
  async clear(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.dispose();
    }
    this.adapters.clear();
  }
}

/**
 * Create a new source adapter registry
 */
export function createRegistry(): SourceAdapterRegistry {
  return new SourceAdapterRegistry();
}

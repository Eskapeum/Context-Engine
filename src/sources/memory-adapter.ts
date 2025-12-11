/**
 * Universal Context Engine - Memory Source Adapter
 * @module sources/memory-adapter
 *
 * Adapter for indexing code from in-memory strings.
 * Useful for IDEs, REPL environments, and runtime code generation.
 */

import * as crypto from 'crypto';
import type {
  SourceAdapter,
  SourceFile,
  SourceMetadata,
  SourceCapabilities,
} from './source-adapter.js';

// ============================================================================
// Memory Adapter
// ============================================================================

export interface MemoryAdapterOptions {
  /** Name for this memory source */
  name: string;
  /** Initial files to load */
  files?: Array<{
    id: string;
    content: string;
    language?: string;
  }>;
}

/**
 * Memory source adapter
 *
 * Stores and indexes code in memory without requiring filesystem access.
 *
 * Usage:
 * ```typescript
 * const adapter = new MemoryAdapter({ name: 'my-code' });
 * adapter.addFile('app.ts', 'console.log("Hello");', 'typescript');
 * const files = await adapter.listFiles();
 * ```
 */
export class MemoryAdapter implements SourceAdapter {
  readonly metadata: SourceMetadata;
  readonly capabilities: SourceCapabilities = {
    supportsChangeDetection: true,
    supportsWatch: false, // Could add event emitters for this
    supportsListing: true,
    supportsFetch: true,
    supportsBatchFetch: true,
  };

  private files = new Map<string, SourceFile>();
  private changeListeners = new Set<
    (event: { type: 'added' | 'modified' | 'removed'; fileId: string }) => void
  >();

  constructor(options: MemoryAdapterOptions) {
    this.metadata = {
      id: `memory:${options.name}`,
      type: 'memory',
      name: options.name,
      description: `In-memory source: ${options.name}`,
    };

    // Load initial files
    if (options.files) {
      for (const file of options.files) {
        this.addFile(file.id, file.content, file.language);
      }
    }
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async listFiles(): Promise<SourceFile[]> {
    return Array.from(this.files.values());
  }

  async fetchFile(id: string): Promise<SourceFile> {
    const file = this.files.get(id);
    if (!file) {
      throw new Error(`File not found: ${id}`);
    }
    return file;
  }

  async fetchFiles(ids: string[]): Promise<SourceFile[]> {
    return ids.map((id) => {
      const file = this.files.get(id);
      if (!file) {
        throw new Error(`File not found: ${id}`);
      }
      return file;
    });
  }

  async detectChanges(_lastSync: Date): Promise<{
    added: string[];
    modified: string[];
    removed: string[];
  }> {
    // Memory adapter doesn't track historical changes
    // Could be extended to track change history if needed
    return {
      added: [],
      modified: [],
      removed: [],
    };
  }

  async dispose(): Promise<void> {
    this.files.clear();
    this.changeListeners.clear();
  }

  // ============================================================================
  // Memory-Specific Methods
  // ============================================================================

  /**
   * Add or update a file in memory
   */
  addFile(id: string, content: string, language?: string): void {
    const isNew = !this.files.has(id);
    const hash = this.computeHash(content);

    const file: SourceFile = {
      id,
      path: id,
      content,
      language: language || this.detectLanguage(id),
      metadata: {
        lastModified: new Date().toISOString(),
        size: Buffer.byteLength(content, 'utf-8'),
        hash,
      },
    };

    this.files.set(id, file);

    // Notify listeners
    this.notifyChange({
      type: isNew ? 'added' : 'modified',
      fileId: id,
    });
  }

  /**
   * Remove a file from memory
   */
  removeFile(id: string): boolean {
    const deleted = this.files.delete(id);
    if (deleted) {
      this.notifyChange({
        type: 'removed',
        fileId: id,
      });
    }
    return deleted;
  }

  /**
   * Update file content
   */
  updateFile(id: string, content: string): void {
    if (!this.files.has(id)) {
      throw new Error(`File not found: ${id}`);
    }
    this.addFile(id, content);
  }

  /**
   * Check if file exists
   */
  hasFile(id: string): boolean {
    return this.files.has(id);
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.files.size;
  }

  /**
   * Clear all files
   */
  clear(): void {
    const ids = Array.from(this.files.keys());
    this.files.clear();

    // Notify listeners
    for (const id of ids) {
      this.notifyChange({
        type: 'removed',
        fileId: id,
      });
    }
  }

  /**
   * Add change listener
   */
  onChange(
    callback: (event: { type: 'added' | 'modified' | 'removed'; fileId: string }) => void
  ): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private notifyChange(event: { type: 'added' | 'modified' | 'removed'; fileId: string }): void {
    for (const listener of this.changeListeners) {
      listener(event);
    }
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      py: 'python',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      md: 'markdown',
    };

    return ext && languageMap[ext] ? languageMap[ext] : 'unknown';
  }
}

/**
 * Create a new memory adapter
 */
export function createMemoryAdapter(options: MemoryAdapterOptions): MemoryAdapter {
  return new MemoryAdapter(options);
}

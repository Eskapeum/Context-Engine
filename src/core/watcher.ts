/**
 * Universal Context Engine - File Watcher
 *
 * Watches for file system changes and triggers incremental re-indexing
 * with dependency cascade invalidation.
 *
 * @module core/watcher
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { IncrementalIndexer } from './incremental-indexer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WatcherConfig {
  /** Directories/patterns to ignore */
  ignore?: string[];
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Whether to run initial index on start */
  initialIndex?: boolean;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: number;
}

export interface WatcherStats {
  isWatching: boolean;
  filesWatched: number;
  changesProcessed: number;
  lastChangeAt: string | null;
  uptime: number;
}

// ============================================================================
// FILE WATCHER
// ============================================================================

/**
 * File system watcher with debouncing and cascade invalidation
 *
 * @example
 * ```ts
 * const watcher = new FileWatcher(indexer, {
 *   ignore: ['node_modules', '.git'],
 *   debounceMs: 300,
 * });
 *
 * watcher.on('indexed', (stats) => console.log('Re-indexed:', stats));
 * await watcher.start('/path/to/project');
 * ```
 */
export class FileWatcher extends EventEmitter {
  private config: Required<WatcherConfig>;
  private indexer: IncrementalIndexer;
  private projectRoot: string = '';
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private startTime: number = 0;
  private changesProcessed = 0;
  private lastChangeAt: Date | null = null;

  constructor(indexer: IncrementalIndexer, config?: WatcherConfig) {
    super();
    this.indexer = indexer;
    this.config = {
      ignore: config?.ignore ?? ['node_modules', '.git', 'dist', 'build', '.uce'],
      debounceMs: config?.debounceMs ?? 300,
      initialIndex: config?.initialIndex ?? true,
    };
  }

  /**
   * Start watching a directory
   */
  async start(projectRoot: string): Promise<void> {
    this.projectRoot = path.resolve(projectRoot);
    this.startTime = Date.now();

    // Run initial index if configured
    if (this.config.initialIndex) {
      await this.indexer.index();
      this.emit('indexed', { initial: true });
    }

    // Set up recursive watching
    await this.watchDirectory(this.projectRoot);

    this.emit('started', { projectRoot: this.projectRoot });
  }

  /**
   * Stop watching
   */
  stop(): void {
    for (const [_dir, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * Get watcher statistics
   */
  getStats(): WatcherStats {
    return {
      isWatching: this.watchers.size > 0,
      filesWatched: this.watchers.size,
      changesProcessed: this.changesProcessed,
      lastChangeAt: this.lastChangeAt?.toISOString() || null,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Force re-index of specific files
   */
  async reindexFiles(files: string[]): Promise<void> {
    for (const file of files) {
      this.pendingChanges.set(file, {
        type: 'change',
        path: file,
        timestamp: Date.now(),
      });
    }
    await this.processChanges();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async watchDirectory(dir: string): Promise<void> {
    // Skip ignored directories
    const relativePath = path.relative(this.projectRoot, dir);
    if (this.shouldIgnore(relativePath)) return;

    try {
      const watcher = fs.watch(dir, { persistent: true }, (eventType, filename) => {
        if (filename) {
          this.handleFileEvent(eventType, path.join(dir, filename));
        }
      });

      watcher.on('error', (error) => {
        this.emit('error', { dir, error });
      });

      this.watchers.set(dir, watcher);

      // Watch subdirectories
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.watchDirectory(path.join(dir, entry.name));
        }
      }
    } catch (error) {
      this.emit('error', { dir, error });
    }
  }

  private handleFileEvent(eventType: string, filePath: string): void {
    const relativePath = path.relative(this.projectRoot, filePath);

    // Skip ignored paths
    if (this.shouldIgnore(relativePath)) return;

    // Skip non-source files
    if (!this.isSourceFile(filePath)) return;

    // Determine event type
    let changeType: 'add' | 'change' | 'unlink' = 'change';
    if (eventType === 'rename') {
      // Check if file exists to determine add vs unlink
      try {
        fs.accessSync(filePath);
        changeType = fs.existsSync(filePath) ? 'add' : 'unlink';
      } catch {
        changeType = 'unlink';
      }
    }

    // Queue the change
    this.pendingChanges.set(filePath, {
      type: changeType,
      path: filePath,
      timestamp: Date.now(),
    });

    // Debounce processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processChanges().catch((error) => {
        this.emit('error', { error });
      });
    }, this.config.debounceMs);
  }

  private async processChanges(): Promise<void> {
    if (this.isProcessing || this.pendingChanges.size === 0) return;

    this.isProcessing = true;
    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    try {
      const changedFiles = [...changes.keys()];
      const deletedFiles = [...changes.entries()]
        .filter(([_path, event]) => event.type === 'unlink')
        .map(([path]) => path);

      // Get files that depend on changed files (cascade invalidation)
      const affectedFiles = new Set<string>(changedFiles);
      for (const file of changedFiles) {
        const dependents = this.indexer.getDependents(file);
        for (const dep of dependents) {
          affectedFiles.add(dep);
        }
      }

      this.emit('processing', {
        changedFiles: changedFiles.length,
        affectedFiles: affectedFiles.size,
        deletedFiles: deletedFiles.length,
      });

      // Re-index affected files
      const result = await this.indexer.updateFiles([...affectedFiles]);

      this.changesProcessed += changes.size;
      this.lastChangeAt = new Date();

      this.emit('indexed', {
        initial: false,
        changedFiles: changedFiles.length,
        affectedFiles: affectedFiles.size,
        ...result,
      });

      // Watch new directories if any were added
      for (const [filePath, event] of changes) {
        if (event.type === 'add') {
          const dir = path.dirname(filePath);
          if (!this.watchers.has(dir)) {
            await this.watchDirectory(dir);
          }
        }
      }
    } catch (error) {
      this.emit('error', { error });
    } finally {
      this.isProcessing = false;

      // Process any changes that came in while we were processing
      if (this.pendingChanges.size > 0) {
        await this.processChanges();
      }
    }
  }

  private shouldIgnore(relativePath: string): boolean {
    const parts = relativePath.split(path.sep);
    return parts.some((part) => this.config.ignore.includes(part));
  }

  private isSourceFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const sourceExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.rs',
      '.go',
      '.java',
      '.kt',
      '.swift',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.cs',
      '.rb',
      '.php',
      '.vue',
      '.svelte',
    ];
    return sourceExtensions.includes(ext);
  }
}

export default FileWatcher;

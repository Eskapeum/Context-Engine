/**
 * Universal Context Engine - Core Module
 *
 * @module core
 */

export { IncrementalIndexer } from './incremental-indexer.js';
export type {
  FileMetadata,
  FileIndex,
  GitBranchInfo,
  ProjectIndex,
  IndexStats,
  IndexerConfig,
  IndexUpdateResult,
} from './incremental-indexer.js';

export { FileWatcher } from './watcher.js';
export type { WatcherConfig, FileChangeEvent, WatcherStats } from './watcher.js';

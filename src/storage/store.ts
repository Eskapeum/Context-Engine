/**
 * Universal Context Engine (UCE) - Index Store Interface
 * @module storage/store
 *
 * Abstraction layer for index persistence.
 * Architecture Reference: AD-1 - Index Storage Architecture
 *
 * This interface allows storage backends to be swapped without code changes.
 * MVP uses JSON + gzip, Growth phase will add SQLite option.
 */

import type { ProjectIndex, IndexMeta } from '../types/index.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Storage interface for project indexes
 *
 * Implementations:
 * - JsonIndexStore (MVP): JSON + gzip compression
 * - SqliteIndexStore (Growth): SQLite for larger codebases
 */
export interface IndexStore {
  /**
   * Save a project index to storage
   *
   * @param index - The project index to save
   * @param projectRoot - Project root directory
   */
  save(index: ProjectIndex, projectRoot: string): Promise<void>;

  /**
   * Load a project index from storage
   *
   * @param projectRoot - Project root directory
   * @returns The project index, or null if not found
   */
  load(projectRoot: string): Promise<ProjectIndex | null>;

  /**
   * Check if an index exists for a project
   *
   * @param projectRoot - Project root directory
   */
  exists(projectRoot: string): boolean;

  /**
   * Delete a project index
   *
   * @param projectRoot - Project root directory
   */
  delete(projectRoot: string): Promise<void>;

  /**
   * Get index metadata without loading full index
   *
   * @param projectRoot - Project root directory
   * @returns Index metadata, or null if not found
   */
  getMeta(projectRoot: string): Promise<IndexMeta | null>;
}

// =============================================================================
// Store Options
// =============================================================================

/**
 * Options for index storage
 */
export interface IndexStoreOptions {
  /** Custom index directory name (default: '.uce') */
  indexDir?: string;
  /** Enable compression (default: true) */
  compress?: boolean;
  /** Validate index on load (default: true) */
  validateOnLoad?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default index directory name */
export const DEFAULT_INDEX_DIR = '.uce';

/** Index file name */
export const INDEX_FILE = 'index.json';

/** Compressed index file name */
export const INDEX_FILE_GZ = 'index.json.gz';

/** Metadata file name */
export const META_FILE = 'index.meta.json';

/** Current index schema version */
export const CURRENT_INDEX_VERSION = '1.0.0';

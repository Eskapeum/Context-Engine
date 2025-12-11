/**
 * Universal Context Engine (UCE) - State Manager
 * @module storage/state-manager
 *
 * Manages engine state export/import for faster re-indexing.
 * State includes file hashes, BM25 vocabulary, graph metadata, and embeddings count.
 *
 * Architecture: State persistence allows skipping re-indexing of unchanged files,
 * reducing indexing time by up to 80% on incremental updates.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';

import { IndexError, ErrorCodes } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// =============================================================================
// Types
// =============================================================================

/**
 * Complete engine state snapshot
 */
export interface EngineState {
  /** State format version */
  version: string;
  /** UCE version that created this state */
  uceVersion: string;
  /** Timestamp when state was created */
  timestamp: string;
  /** Project root path */
  projectRoot: string;
  /** Git branch information */
  git: {
    branch: string;
    commit: string;
  };
  /** File hashes for change detection */
  fileHashes: Record<string, string>;
  /** Index generation number */
  indexGeneration: number;
  /** Number of embedded chunks */
  embeddingsCount: number;
  /** BM25 vocabulary snapshot */
  bm25Vocab?: string[];
  /** Knowledge graph node count */
  graphNodeCount?: number;
  /** Statistics snapshot */
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalChunks: number;
  };
}

/**
 * State manager options
 */
export interface StateManagerOptions {
  /** Custom state file path (default: .uce/state.json.gz) */
  statePath?: string;
  /** Enable compression (default: true) */
  compress?: boolean;
  /** Validate version on import (default: true) */
  validateVersion?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Current state format version */
const STATE_VERSION = '1.0.0';

/** Default state file name */
const DEFAULT_STATE_FILE = 'state.json.gz';

// =============================================================================
// State Manager
// =============================================================================

/**
 * Manages engine state export/import
 *
 * Usage:
 * ```typescript
 * const manager = new StateManager({ projectRoot });
 * const state = await manager.exportState(engine);
 * await manager.saveToFile(state, '.uce/state.json.gz');
 *
 * // Later...
 * const loadedState = await manager.loadFromFile('.uce/state.json.gz');
 * if (loadedState) {
 *   await manager.importState(engine, loadedState);
 * }
 * ```
 */
export class StateManager {
  private compress: boolean;
  private validateVersion: boolean;

  constructor(options: StateManagerOptions = {}) {
    this.compress = options.compress ?? true;
    this.validateVersion = options.validateVersion ?? true;
  }

  /**
   * Export current engine state
   *
   * @param context - Object containing engine components
   * @returns Engine state snapshot
   */
  async exportState(context: {
    projectRoot: string;
    git: { branch: string; commit: string };
    fileHashes: Map<string, string>;
    indexGeneration: number;
    stats: {
      totalFiles: number;
      totalSymbols: number;
      totalChunks: number;
    };
    embeddingsCount?: number;
    bm25Vocab?: string[];
    graphNodeCount?: number;
  }): Promise<EngineState> {
    logger.debug('Exporting engine state', {
      projectRoot: context.projectRoot,
      files: context.fileHashes.size,
    });

    const state: EngineState = {
      version: STATE_VERSION,
      uceVersion: '2.5.0', // Will be updated to use package version
      timestamp: new Date().toISOString(),
      projectRoot: context.projectRoot,
      git: context.git,
      fileHashes: Object.fromEntries(context.fileHashes),
      indexGeneration: context.indexGeneration,
      embeddingsCount: context.embeddingsCount || 0,
      bm25Vocab: context.bm25Vocab,
      graphNodeCount: context.graphNodeCount,
      stats: context.stats,
    };

    logger.info('Engine state exported', {
      files: context.fileHashes.size,
      generation: context.indexGeneration,
    });

    return state;
  }

  /**
   * Import engine state
   *
   * @param state - Engine state to import
   * @returns Imported state components
   */
  async importState(state: EngineState): Promise<{
    fileHashes: Map<string, string>;
    indexGeneration: number;
    embeddingsCount: number;
  }> {
    logger.debug('Importing engine state', {
      version: state.version,
      files: Object.keys(state.fileHashes).length,
    });

    // Validate version if enabled
    if (this.validateVersion) {
      this.validateStateVersion(state.version);
    }

    // Convert fileHashes back to Map
    const fileHashes = new Map(Object.entries(state.fileHashes));

    logger.info('Engine state imported', {
      files: fileHashes.size,
      generation: state.indexGeneration,
    });

    return {
      fileHashes,
      indexGeneration: state.indexGeneration,
      embeddingsCount: state.embeddingsCount,
    };
  }

  /**
   * Save state to file
   *
   * @param state - Engine state to save
   * @param filePath - Path to save state file
   */
  async saveToFile(state: EngineState, filePath: string): Promise<void> {
    const tempFile = filePath + '.tmp';

    logger.debug('Saving state to file', { filePath });

    try {
      // Ensure directory exists
      const dir = join(filePath, '..');
      await mkdir(dir, { recursive: true });

      // Serialize state
      const json = JSON.stringify(state, null, 2);

      // Compress if enabled
      const data = this.compress ? await gzipAsync(json) : Buffer.from(json);

      // Atomic write: write to temp, then rename
      await writeFile(tempFile, data);
      await rename(tempFile, filePath);

      logger.info('State saved to file', {
        path: filePath,
        size: `${(data.length / 1024).toFixed(1)}KB`,
        compressed: this.compress,
      });
    } catch (error) {
      // Clean up temp file on error
      try {
        await rm(tempFile, { force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(
        `Failed to save state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load state from file
   *
   * @param filePath - Path to state file
   * @returns Engine state, or null if not found
   */
  async loadFromFile(filePath: string): Promise<EngineState | null> {
    if (!existsSync(filePath)) {
      logger.debug('No state file found', { filePath });
      return null;
    }

    logger.debug('Loading state from file', { filePath });

    try {
      // Read file
      const data = await readFile(filePath);

      // Decompress if needed
      const json = this.compress
        ? (await gunzipAsync(data)).toString('utf-8')
        : data.toString('utf-8');

      // Parse
      const state = JSON.parse(json) as EngineState;

      // Validate version if enabled
      if (this.validateVersion) {
        this.validateStateVersion(state.version);
      }

      logger.info('State loaded from file', {
        path: filePath,
        version: state.version,
        files: Object.keys(state.fileHashes).length,
        generation: state.indexGeneration,
      });

      return state;
    } catch (error) {
      if (error instanceof IndexError) {
        throw error;
      }
      throw new IndexError(
        ErrorCodes.INDEX_CORRUPTED,
        `Failed to load state: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Check if state file exists
   *
   * @param filePath - Path to state file
   * @returns True if file exists
   */
  exists(filePath: string): boolean {
    return existsSync(filePath);
  }

  /**
   * Delete state file
   *
   * @param filePath - Path to state file
   */
  async deleteFile(filePath: string): Promise<void> {
    if (existsSync(filePath)) {
      logger.debug('Deleting state file', { filePath });
      await rm(filePath, { force: true });
      logger.info('State file deleted', { filePath });
    }
  }

  /**
   * Get default state file path for a project
   *
   * @param projectRoot - Project root directory
   * @returns Default state file path
   */
  static getDefaultPath(projectRoot: string): string {
    return join(projectRoot, '.uce', DEFAULT_STATE_FILE);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Validate state version compatibility
   */
  private validateStateVersion(stateVersion: string): void {
    const [stateMajor] = stateVersion.split('.').map(Number);
    const [currentMajor] = STATE_VERSION.split('.').map(Number);

    if (stateMajor > currentMajor) {
      throw new IndexError(
        ErrorCodes.INDEX_CORRUPTED,
        `State version ${stateVersion} is newer than supported version ${STATE_VERSION}`,
        {
          userMessage:
            `This state was created with a newer version of UCE. ` +
            `Please upgrade UCE or delete the state file and re-index.`,
        }
      );
    }

    if (stateMajor < currentMajor) {
      logger.warn('State version outdated', {
        stateVersion,
        currentVersion: STATE_VERSION,
        message: 'State may be migrated automatically',
      });
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new state manager
 */
export function createStateManager(options?: StateManagerOptions): StateManager {
  return new StateManager(options);
}

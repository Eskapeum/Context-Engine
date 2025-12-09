/**
 * Universal Context Engine (UCE) - JSON Index Store
 * @module storage/json-store
 *
 * JSON + gzip storage implementation for MVP.
 * Architecture Reference: AD-1 - Index Storage Architecture
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';

import type { ProjectIndex, IndexMeta } from '../types/index.js';
import { IndexError, ErrorCodes } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  type IndexStore,
  type IndexStoreOptions,
  DEFAULT_INDEX_DIR,
  INDEX_FILE_GZ,
  META_FILE,
  CURRENT_INDEX_VERSION,
} from './store.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// =============================================================================
// JSON Index Store Implementation
// =============================================================================

/**
 * JSON + gzip storage implementation
 *
 * Storage layout:
 * ```
 * {project-root}/.uce/
 *   index.json.gz      # Compressed index
 *   index.meta.json    # Version, timestamp, stats
 * ```
 */
export class JsonIndexStore implements IndexStore {
  private readonly indexDir: string;
  private readonly compress: boolean;
  private readonly validateOnLoad: boolean;

  constructor(options: IndexStoreOptions = {}) {
    this.indexDir = options.indexDir || DEFAULT_INDEX_DIR;
    this.compress = options.compress ?? true;
    this.validateOnLoad = options.validateOnLoad ?? true;
  }

  /**
   * Get the index directory path for a project
   */
  private getIndexPath(projectRoot: string): string {
    return join(projectRoot, this.indexDir);
  }

  /**
   * Get the index file path
   */
  private getIndexFilePath(projectRoot: string): string {
    return join(this.getIndexPath(projectRoot), INDEX_FILE_GZ);
  }

  /**
   * Get the metadata file path
   */
  private getMetaFilePath(projectRoot: string): string {
    return join(this.getIndexPath(projectRoot), META_FILE);
  }

  /**
   * Save a project index to storage
   */
  async save(index: ProjectIndex, projectRoot: string): Promise<void> {
    const indexPath = this.getIndexPath(projectRoot);
    const indexFile = this.getIndexFilePath(projectRoot);
    const metaFile = this.getMetaFilePath(projectRoot);
    const tempFile = indexFile + '.tmp';

    logger.debug('Saving index', { projectRoot, indexPath });

    // Ensure directory exists
    await mkdir(indexPath, { recursive: true });

    try {
      // Serialize index
      const json = JSON.stringify(index);

      // Compress if enabled
      const data = this.compress
        ? await gzipAsync(json)
        : Buffer.from(json);

      // Atomic write: write to temp, then rename
      await writeFile(tempFile, data);
      await rename(tempFile, indexFile);

      // Write metadata separately (uncompressed for quick access)
      await writeFile(metaFile, JSON.stringify(index.meta, null, 2));

      logger.info('Index saved', {
        files: index.meta.fileCount,
        symbols: index.meta.symbolCount,
        size: `${(data.length / 1024).toFixed(1)}KB`,
      });
    } catch (error) {
      // Clean up temp file on error
      try {
        await rm(tempFile, { force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Load a project index from storage
   */
  async load(projectRoot: string): Promise<ProjectIndex | null> {
    const indexFile = this.getIndexFilePath(projectRoot);

    if (!existsSync(indexFile)) {
      logger.debug('No index found', { projectRoot });
      return null;
    }

    logger.debug('Loading index', { projectRoot });

    try {
      // Read file
      const data = await readFile(indexFile);

      // Decompress
      const json = this.compress
        ? (await gunzipAsync(data)).toString('utf-8')
        : data.toString('utf-8');

      // Parse
      const index = JSON.parse(json) as ProjectIndex;

      // Validate version if enabled
      if (this.validateOnLoad) {
        this.validateVersion(index.meta.version);
      }

      logger.debug('Index loaded', {
        files: index.meta.fileCount,
        symbols: index.meta.symbolCount,
        version: index.meta.version,
      });

      return index;
    } catch (error) {
      if (error instanceof IndexError) {
        throw error;
      }
      throw new IndexError(
        ErrorCodes.INDEX_CORRUPTED,
        `Failed to load index: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Check if an index exists for a project
   */
  exists(projectRoot: string): boolean {
    return existsSync(this.getIndexFilePath(projectRoot));
  }

  /**
   * Delete a project index
   */
  async delete(projectRoot: string): Promise<void> {
    const indexPath = this.getIndexPath(projectRoot);

    if (existsSync(indexPath)) {
      logger.debug('Deleting index', { projectRoot });
      await rm(indexPath, { recursive: true, force: true });
      logger.info('Index deleted', { projectRoot });
    }
  }

  /**
   * Get index metadata without loading full index
   */
  async getMeta(projectRoot: string): Promise<IndexMeta | null> {
    const metaFile = this.getMetaFilePath(projectRoot);

    if (!existsSync(metaFile)) {
      return null;
    }

    try {
      const data = await readFile(metaFile, 'utf-8');
      return JSON.parse(data) as IndexMeta;
    } catch {
      // If meta file is corrupted, try loading from full index
      const index = await this.load(projectRoot);
      return index?.meta ?? null;
    }
  }

  /**
   * Validate index version compatibility
   */
  private validateVersion(indexVersion: string): void {
    const [indexMajor] = indexVersion.split('.').map(Number);
    const [currentMajor] = CURRENT_INDEX_VERSION.split('.').map(Number);

    if (indexMajor > currentMajor) {
      throw new IndexError(
        ErrorCodes.INDEX_CORRUPTED,
        `Index version ${indexVersion} is newer than UCE version ${CURRENT_INDEX_VERSION}`,
        {
          userMessage:
            `This index was created with a newer version of UCE. ` +
            `Please upgrade UCE or rebuild the index with \`ucm index --rebuild\`.`,
        }
      );
    }

    if (indexMajor < currentMajor) {
      logger.warn('Index version outdated', {
        indexVersion,
        currentVersion: CURRENT_INDEX_VERSION,
      });
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new JSON index store
 */
export function createJsonStore(options?: IndexStoreOptions): IndexStore {
  return new JsonIndexStore(options);
}

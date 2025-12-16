/**
 * Library Documentation Cache
 *
 * Local file-based cache for library documentation.
 * Stores in .uce/library-docs/ directory.
 *
 * @module library-docs/docs-cache
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type { DocsCacheEntry, DocsCacheIndex, LibraryDocResult } from './types.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_VERSION = '1.0.0';
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const INDEX_FILE = 'index.json';

// ============================================================================
// DOCS CACHE CLASS
// ============================================================================

/**
 * File-based cache for library documentation
 */
export class DocsCache {
  private cacheDir: string;
  private ttl: number;
  private index: DocsCacheIndex | null = null;

  constructor(projectRoot: string, ttl: number = DEFAULT_TTL) {
    this.cacheDir = path.join(projectRoot, '.uce', 'library-docs');
    this.ttl = ttl;
  }

  /**
   * Initialize cache directory
   */
  async init(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    await this.loadIndex();
  }

  /**
   * Get cached documentation for a library
   */
  async get(library: string, version?: string): Promise<LibraryDocResult | null> {
    await this.ensureIndex();

    const key = this.getCacheKey(library, version);
    const entry = this.index!.entries[key];

    if (!entry) {
      return null;
    }

    // Check expiry
    if (this.isExpired(entry)) {
      await this.delete(library, version);
      return null;
    }

    // Load full docs from file
    const docsPath = this.getDocsPath(library, version);
    if (!fs.existsSync(docsPath)) {
      return null;
    }

    try {
      const compressed = fs.readFileSync(docsPath);
      const json = await gunzip(compressed);
      return JSON.parse(json.toString()) as LibraryDocResult;
    } catch (error) {
      console.warn(`Failed to load cached docs for ${library}: ${error}`);
      return null;
    }
  }

  /**
   * Store documentation in cache
   */
  async set(docs: LibraryDocResult, sourceHash?: string): Promise<void> {
    await this.ensureIndex();

    const key = this.getCacheKey(docs.library, docs.version);
    const docsPath = this.getDocsPath(docs.library, docs.version);

    // Ensure directory exists
    const docsDir = path.dirname(docsPath);
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Compress and write docs
    const json = JSON.stringify(docs);
    const compressed = await gzip(json);
    fs.writeFileSync(docsPath, compressed);

    // Update index
    const entry: DocsCacheEntry = {
      docs: {
        ...docs,
        apiReference: [], // Don't store full API in index
      },
      cachedAt: new Date().toISOString(),
      ttl: this.ttl,
      sourceHash,
    };

    this.index!.entries[key] = entry;
    await this.saveIndex();
  }

  /**
   * Delete cached documentation
   */
  async delete(library: string, version?: string): Promise<boolean> {
    await this.ensureIndex();

    const key = this.getCacheKey(library, version);
    if (!this.index!.entries[key]) {
      return false;
    }

    // Delete file
    const docsPath = this.getDocsPath(library, version);
    if (fs.existsSync(docsPath)) {
      fs.unlinkSync(docsPath);
    }

    // Update index
    delete this.index!.entries[key];
    await this.saveIndex();

    return true;
  }

  /**
   * Check if entry exists and is valid
   */
  async has(library: string, version?: string): Promise<boolean> {
    await this.ensureIndex();

    const key = this.getCacheKey(library, version);
    const entry = this.index!.entries[key];

    if (!entry) {
      return false;
    }

    return !this.isExpired(entry);
  }

  /**
   * List all cached libraries
   */
  async list(): Promise<Array<{ library: string; version: string; cachedAt: string }>> {
    await this.ensureIndex();

    return Object.entries(this.index!.entries)
      .filter(([_, entry]) => !this.isExpired(entry))
      .map(([key, entry]) => {
        const [library, version] = key.split('@');
        return {
          library,
          version: version || 'latest',
          cachedAt: entry.cachedAt,
        };
      });
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    await this.ensureIndex();

    let cleaned = 0;
    const entries = { ...this.index!.entries };

    for (const [key, entry] of Object.entries(entries)) {
      if (this.isExpired(entry)) {
        const [library, version] = key.split('@');
        await this.delete(library, version);
        cleaned++;
      }
    }

    this.index!.lastCleanup = new Date().toISOString();
    await this.saveIndex();

    return cleaned;
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true });
    }
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.index = this.createEmptyIndex();
    await this.saveIndex();
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    await this.ensureIndex();

    const entries = Object.values(this.index!.entries);
    let totalSize = 0;
    let oldest: string | undefined;
    let newest: string | undefined;

    for (const entry of entries) {
      if (!oldest || entry.cachedAt < oldest) {
        oldest = entry.cachedAt;
      }
      if (!newest || entry.cachedAt > newest) {
        newest = entry.cachedAt;
      }
    }

    // Calculate total size
    if (fs.existsSync(this.cacheDir)) {
      const files = this.getAllFiles(this.cacheDir);
      for (const file of files) {
        const stat = fs.statSync(file);
        totalSize += stat.size;
      }
    }

    return {
      totalEntries: entries.length,
      totalSizeBytes: totalSize,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getCacheKey(library: string, version?: string): string {
    return `${library}@${version || 'latest'}`;
  }

  private getDocsPath(library: string, version?: string): string {
    const safeLibrary = library.replace(/\//g, '__');
    const safeVersion = (version || 'latest').replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.cacheDir, safeLibrary, `${safeVersion}.json.gz`);
  }

  private isExpired(entry: DocsCacheEntry): boolean {
    const cachedAt = new Date(entry.cachedAt).getTime();
    const now = Date.now();
    return now - cachedAt > entry.ttl;
  }

  private async ensureIndex(): Promise<void> {
    if (!this.index) {
      await this.loadIndex();
    }
  }

  private async loadIndex(): Promise<void> {
    const indexPath = path.join(this.cacheDir, INDEX_FILE);

    if (fs.existsSync(indexPath)) {
      try {
        const content = fs.readFileSync(indexPath, 'utf-8');
        this.index = JSON.parse(content);

        // Version check
        if (this.index!.version !== CACHE_VERSION) {
          console.warn('Cache version mismatch, clearing cache');
          await this.clear();
        }
      } catch (error) {
        console.warn(`Failed to load cache index: ${error}`);
        this.index = this.createEmptyIndex();
      }
    } else {
      this.index = this.createEmptyIndex();
    }
  }

  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.cacheDir, INDEX_FILE);
    fs.writeFileSync(indexPath, JSON.stringify(this.index, null, 2));
  }

  private createEmptyIndex(): DocsCacheIndex {
    return {
      version: CACHE_VERSION,
      entries: {},
    };
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}

export default DocsCache;

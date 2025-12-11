/**
 * Universal Context Engine - Embedding Cache
 * @module embeddings/embedding-cache
 *
 * Persistent cache for embeddings to avoid recomputing.
 * Stores embeddings with content hashes for invalidation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Cached embedding entry
 */
export interface CachedEmbedding {
  /** Content hash (SHA-256) */
  hash: string;
  /** Embedding vector */
  embedding: number[];
  /** Timestamp */
  timestamp: number;
  /** Provider used */
  provider: string;
  /** Model used */
  model: string;
}

/**
 * Cache configuration
 */
export interface EmbeddingCacheConfig {
  /** Cache directory */
  cacheDir?: string;
  /** Maximum cache size in MB */
  maxSizeMB?: number;
  /** Maximum age in days */
  maxAgeDays?: number;
  /** Enable compression */
  compress?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries */
  entries: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Cache size in bytes */
  sizeBytes: number;
  /** Hits */
  hits: number;
  /** Misses */
  misses: number;
}

// =============================================================================
// Embedding Cache
// =============================================================================

/**
 * Persistent cache for embeddings
 *
 * Usage:
 * ```typescript
 * const cache = new EmbeddingCache({ cacheDir: '.uce/embeddings' });
 * await cache.initialize();
 *
 * // Check cache
 * const cached = await cache.get(content, provider, model);
 * if (!cached) {
 *   const embedding = await generateEmbedding(content);
 *   await cache.set(content, embedding, provider, model);
 * }
 * ```
 */
export class EmbeddingCache {
  private config: Required<EmbeddingCacheConfig>;
  private cache: Map<string, CachedEmbedding>;
  private hits: number = 0;
  private misses: number = 0;
  private cacheFile: string;

  constructor(config?: EmbeddingCacheConfig) {
    this.config = {
      cacheDir: config?.cacheDir || '.uce/embeddings',
      maxSizeMB: config?.maxSizeMB || 100,
      maxAgeDays: config?.maxAgeDays || 30,
      compress: config?.compress ?? true,
    };

    this.cache = new Map();
    this.cacheFile = path.join(this.config.cacheDir, 'embeddings.json');
  }

  /**
   * Initialize cache (load from disk)
   */
  async initialize(): Promise<void> {
    // Create cache directory
    if (!fs.existsSync(this.config.cacheDir)) {
      fs.mkdirSync(this.config.cacheDir, { recursive: true });
    }

    // Load cache from disk
    await this.load();

    // Clean up old entries
    await this.cleanup();

    logger.info('Embedding cache initialized', {
      entries: this.cache.size,
      sizeBytes: this.getSizeBytes(),
    });
  }

  /**
   * Get cached embedding
   */
  async get(
    content: string,
    provider: string,
    model: string
  ): Promise<number[] | null> {
    const key = this.getKey(content, provider, model);
    const entry = this.cache.get(key);

    if (entry) {
      // Verify hash matches
      const hash = this.computeHash(content);
      if (entry.hash === hash) {
        this.hits++;
        return entry.embedding;
      } else {
        // Hash mismatch, remove stale entry
        this.cache.delete(key);
      }
    }

    this.misses++;
    return null;
  }

  /**
   * Set cached embedding
   */
  async set(
    content: string,
    embedding: number[],
    provider: string,
    model: string
  ): Promise<void> {
    const key = this.getKey(content, provider, model);
    const hash = this.computeHash(content);

    this.cache.set(key, {
      hash,
      embedding,
      timestamp: Date.now(),
      provider,
      model,
    });

    // Check cache size and evict if needed
    await this.evictIfNeeded();
  }

  /**
   * Get multiple cached embeddings
   */
  async getMany(
    items: Array<{ content: string; provider: string; model: string }>
  ): Promise<Array<number[] | null>> {
    return Promise.all(items.map((item) => this.get(item.content, item.provider, item.model)));
  }

  /**
   * Set multiple cached embeddings
   */
  async setMany(
    items: Array<{ content: string; embedding: number[]; provider: string; model: string }>
  ): Promise<void> {
    for (const item of items) {
      await this.set(item.content, item.embedding, item.provider, item.model);
    }
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    await this.save();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
      sizeBytes: this.getSizeBytes(),
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    try {
      const data = {
        version: '1.0',
        timestamp: Date.now(),
        entries: Array.from(this.cache.entries()),
      };

      fs.writeFileSync(this.cacheFile, JSON.stringify(data), 'utf-8');
      logger.debug('Embedding cache saved', { entries: this.cache.size });
    } catch (error) {
      logger.error('Failed to save embedding cache', { error });
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async load(): Promise<void> {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return;
      }

      const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
      this.cache = new Map(data.entries);

      logger.debug('Embedding cache loaded', { entries: this.cache.size });
    } catch (error) {
      logger.warn('Failed to load embedding cache, starting fresh', { error });
      this.cache = new Map();
    }
  }

  private async cleanup(): Promise<void> {
    const maxAge = this.config.maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned up old cache entries', { removed });
      await this.save();
    }
  }

  private async evictIfNeeded(): Promise<void> {
    const maxBytes = this.config.maxSizeMB * 1024 * 1024;
    const currentBytes = this.getSizeBytes();

    if (currentBytes > maxBytes) {
      // Evict oldest entries (LRU)
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      let bytesToRemove = currentBytes - maxBytes;
      let removed = 0;

      for (const [key, entry] of entries) {
        if (bytesToRemove <= 0) break;

        const entrySize = JSON.stringify(entry).length;
        this.cache.delete(key);
        bytesToRemove -= entrySize;
        removed++;
      }

      logger.info('Evicted cache entries', { removed, newSize: this.getSizeBytes() });
      await this.save();
    }
  }

  private getKey(content: string, provider: string, model: string): string {
    const hash = this.computeHash(content);
    return `${provider}:${model}:${hash}`;
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private getSizeBytes(): number {
    return JSON.stringify(Array.from(this.cache.entries())).length;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new embedding cache
 */
export function createEmbeddingCache(config?: EmbeddingCacheConfig): EmbeddingCache {
  return new EmbeddingCache(config);
}

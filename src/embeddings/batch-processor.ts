/**
 * Universal Context Engine - Batch Embedding Processor
 * @module embeddings/batch-processor
 *
 * Efficient batch processing of embeddings with rate limiting and caching.
 */

import type { EmbeddingProvider } from './types.js';
import { EmbeddingCache } from './embedding-cache.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Batch processor configuration
 */
export interface BatchProcessorConfig {
  /** Batch size (number of items per batch) */
  batchSize?: number;
  /** Delay between batches (ms) */
  batchDelay?: number;
  /** Maximum concurrent batches */
  maxConcurrent?: number;
  /** Enable caching */
  useCache?: boolean;
  /** Cache configuration */
  cacheConfig?: {
    cacheDir?: string;
    maxSizeMB?: number;
  };
}

/**
 * Batch item to process
 */
export interface BatchItem {
  /** Unique ID */
  id: string;
  /** Content to embed */
  content: string;
}

/**
 * Batch result
 */
export interface BatchResult {
  /** Item ID */
  id: string;
  /** Generated embedding */
  embedding: number[];
  /** Whether from cache */
  cached: boolean;
}

/**
 * Batch statistics
 */
export interface BatchStats {
  /** Total items processed */
  totalItems: number;
  /** Items from cache */
  cachedItems: number;
  /** Items generated */
  generatedItems: number;
  /** Total batches */
  totalBatches: number;
  /** Duration in ms */
  durationMs: number;
  /** Items per second */
  itemsPerSecond: number;
  /** Cache hit rate */
  cacheHitRate: number;
}

// =============================================================================
// Batch Embedding Processor
// =============================================================================

/**
 * Batch processor for efficient embedding generation
 *
 * Usage:
 * ```typescript
 * const processor = new BatchEmbeddingProcessor(provider, {
 *   batchSize: 100,
 *   batchDelay: 1000,
 *   useCache: true,
 * });
 *
 * await processor.initialize();
 *
 * const items = chunks.map((chunk, i) => ({ id: String(i), content: chunk }));
 * const results = await processor.processBatch(items);
 * ```
 */
export class BatchEmbeddingProcessor {
  private provider: EmbeddingProvider;
  private config: Required<BatchProcessorConfig>;
  private cache?: EmbeddingCache;

  constructor(provider: EmbeddingProvider, config?: BatchProcessorConfig) {
    this.provider = provider;
    this.config = {
      batchSize: config?.batchSize || 50,
      batchDelay: config?.batchDelay || 1000,
      maxConcurrent: config?.maxConcurrent || 3,
      useCache: config?.useCache ?? true,
      cacheConfig: config?.cacheConfig || {},
    };
  }

  /**
   * Initialize processor (load cache if enabled)
   */
  async initialize(): Promise<void> {
    if (this.config.useCache) {
      this.cache = new EmbeddingCache(this.config.cacheConfig);
      await this.cache.initialize();
    }
  }

  /**
   * Process batch of items
   */
  async processBatch(items: BatchItem[]): Promise<BatchResult[]> {
    const startTime = Date.now();
    const results: BatchResult[] = [];

    logger.info('Starting batch embedding', {
      totalItems: items.length,
      batchSize: this.config.batchSize,
      useCache: this.config.useCache,
    });

    // Split into batches
    const batches: BatchItem[][] = [];
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }

    // Process batches with concurrency control
    let cachedCount = 0;
    let generatedCount = 0;

    for (let i = 0; i < batches.length; i += this.config.maxConcurrent) {
      const batchGroup = batches.slice(i, i + this.config.maxConcurrent);

      const groupResults = await Promise.all(
        batchGroup.map(async (batch) => {
          const batchResults = await this.processSingleBatch(batch);
          return batchResults;
        })
      );

      // Flatten and collect results
      for (const batchResults of groupResults) {
        results.push(...batchResults);
        cachedCount += batchResults.filter((r) => r.cached).length;
        generatedCount += batchResults.filter((r) => !r.cached).length;
      }

      // Delay between batch groups (rate limiting)
      if (i + this.config.maxConcurrent < batches.length) {
        await this.delay(this.config.batchDelay);
      }
    }

    const duration = Date.now() - startTime;
    const stats: BatchStats = {
      totalItems: items.length,
      cachedItems: cachedCount,
      generatedItems: generatedCount,
      totalBatches: batches.length,
      durationMs: duration,
      itemsPerSecond: (items.length / duration) * 1000,
      cacheHitRate: cachedCount / items.length,
    };

    logger.info('Batch embedding complete', stats);

    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache?.getStats();
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    if (this.cache) {
      await this.cache.clear();
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Process a single batch
   */
  private async processSingleBatch(batch: BatchItem[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    // Check cache first
    const uncachedItems: BatchItem[] = [];
    const uncachedIndices: number[] = [];

    if (this.cache) {
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const cached = await this.cache.get(
          item.content,
          this.provider.name,
          this.provider.model
        );

        if (cached) {
          results[i] = {
            id: item.id,
            embedding: cached,
            cached: true,
          };
        } else {
          uncachedItems.push(item);
          uncachedIndices.push(i);
        }
      }
    } else {
      uncachedItems.push(...batch);
      uncachedIndices.push(...batch.map((_, i) => i));
    }

    // Generate embeddings for uncached items
    if (uncachedItems.length > 0) {
      const contents = uncachedItems.map((item) => item.content);
      const embeddings = await this.provider.embed(contents);

      // Store in cache and results
      for (let i = 0; i < uncachedItems.length; i++) {
        const item = uncachedItems[i];
        const embedding = embeddings[i];
        const resultIndex = uncachedIndices[i];

        results[resultIndex] = {
          id: item.id,
          embedding,
          cached: false,
        };

        // Cache the embedding
        if (this.cache) {
          await this.cache.set(item.content, embedding, this.provider.name, this.provider.model);
        }
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new batch embedding processor
 */
export function createBatchProcessor(
  provider: EmbeddingProvider,
  config?: BatchProcessorConfig
): BatchEmbeddingProcessor {
  return new BatchEmbeddingProcessor(provider, config);
}

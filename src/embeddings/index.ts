/**
 * Universal Context Engine - Embeddings Module
 *
 * @module embeddings
 */

export * from './types.js';
export {
  VoyageEmbeddingProvider,
  OpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingProvider,
  createAutoProvider,
} from './providers.js';
export {
  MemoryVectorStore,
  QdrantVectorStore,
  createVectorStore,
  createAutoVectorStore,
} from './vector-store.js';

// v3.1+ Production embedding features
export {
  EmbeddingCache,
  createEmbeddingCache,
  type CachedEmbedding,
  type EmbeddingCacheConfig,
  type CacheStats,
} from './embedding-cache.js';
export {
  BatchEmbeddingProcessor,
  createBatchProcessor,
  type BatchProcessorConfig,
  type BatchItem,
  type BatchResult,
  type BatchStats,
} from './batch-processor.js';

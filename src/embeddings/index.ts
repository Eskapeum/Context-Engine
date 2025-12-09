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

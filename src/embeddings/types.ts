/**
 * Universal Context Memory - Embedding Types
 *
 * @module embeddings/types
 */

/**
 * Embedding vector
 */
export interface Embedding {
  /** Vector values */
  values: number[];
  /** Dimension count */
  dimensions: number;
  /** Model used */
  model: string;
}

/**
 * Embedded chunk with metadata
 */
export interface EmbeddedChunk {
  /** Unique ID */
  id: string;
  /** Content that was embedded */
  content: string;
  /** Embedding vector */
  embedding: Embedding;
  /** Source file path */
  filePath: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Primary symbol */
  primarySymbol?: string;
  /** All symbols */
  symbols: string[];
  /** Language */
  language: string;
  /** Token count */
  tokenCount: number;
  /** Created timestamp */
  createdAt: string;
}

/**
 * Search result from vector store
 */
export interface SearchResult {
  /** Chunk ID */
  id: string;
  /** Similarity score (0-1) */
  score: number;
  /** The embedded chunk */
  chunk: EmbeddedChunk;
}

/**
 * Embedding provider configuration
 */
export interface EmbeddingProviderConfig {
  /** Provider type */
  type: 'voyage' | 'openai' | 'local';
  /** API key (if applicable) */
  apiKey?: string;
  /** Model name */
  model?: string;
  /** Batch size for embedding */
  batchSize?: number;
}

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
  /** Store type */
  type: 'qdrant' | 'memory';
  /** Collection name */
  collection: string;
  /** Qdrant URL (if using Qdrant) */
  url?: string;
  /** Storage path (for local persistence) */
  path?: string;
}

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
  /** Provider name */
  name: string;
  /** Embedding dimensions */
  dimensions: number;
  /** Model name */
  model: string;
  /** Embed a single text */
  embed(text: string): Promise<Embedding>;
  /** Embed multiple texts (batched) */
  embedBatch(texts: string[]): Promise<Embedding[]>;
}

/**
 * Vector store interface
 */
export interface VectorStore {
  /** Store name */
  name: string;
  /** Initialize the store */
  initialize(): Promise<void>;
  /** Add chunks to the store */
  add(chunks: EmbeddedChunk[]): Promise<void>;
  /** Search for similar chunks */
  search(query: Embedding, limit?: number, filter?: Record<string, unknown>): Promise<SearchResult[]>;
  /** Delete chunks by IDs */
  delete(ids: string[]): Promise<void>;
  /** Delete all chunks for a file */
  deleteByFile(filePath: string): Promise<void>;
  /** Get total count */
  count(): Promise<number>;
  /** Clear all data */
  clear(): Promise<void>;
}

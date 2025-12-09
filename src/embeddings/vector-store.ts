/**
 * Universal Context Engine - Vector Store
 *
 * Implements vector storage and similarity search.
 * Supports in-memory and Qdrant backends.
 *
 * @module embeddings/vector-store
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Embedding,
  EmbeddedChunk,
  SearchResult,
  VectorStore,
  VectorStoreConfig,
} from './types.js';

// ============================================================================
// IN-MEMORY VECTOR STORE
// ============================================================================

/**
 * In-memory vector store with optional persistence
 */
export class MemoryVectorStore implements VectorStore {
  name = 'memory';

  private chunks: Map<string, EmbeddedChunk> = new Map();
  private persistPath?: string;

  constructor(config?: VectorStoreConfig) {
    this.persistPath = config?.path;
  }

  async initialize(): Promise<void> {
    if (this.persistPath && fs.existsSync(this.persistPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));
        this.chunks = new Map(Object.entries(data));
      } catch {
        // Start fresh if load fails
      }
    }
  }

  async add(chunks: EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
    await this.persist();
  }

  async search(
    query: Embedding,
    limit: number = 10,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    const results: Array<{ id: string; score: number; chunk: EmbeddedChunk }> = [];

    for (const [id, chunk] of this.chunks) {
      // Apply filters
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (key === 'filePath' && chunk.filePath !== value) matches = false;
          if (key === 'language' && chunk.language !== value) matches = false;
        }
        if (!matches) continue;
      }

      // Compute cosine similarity
      const score = this.cosineSimilarity(query.values, chunk.embedding.values);
      results.push({ id, score, chunk });
    }

    // Sort by score descending and return top results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.chunks.delete(id);
    }
    await this.persist();
  }

  async deleteByFile(filePath: string): Promise<void> {
    const toDelete: string[] = [];
    for (const [id, chunk] of this.chunks) {
      if (chunk.filePath === filePath) {
        toDelete.push(id);
      }
    }
    await this.delete(toDelete);
  }

  async count(): Promise<number> {
    return this.chunks.size;
  }

  async clear(): Promise<void> {
    this.chunks.clear();
    await this.persist();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private async persist(): Promise<void> {
    if (!this.persistPath) return;

    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = Object.fromEntries(this.chunks);
    fs.writeFileSync(this.persistPath, JSON.stringify(data));
  }
}

// ============================================================================
// QDRANT VECTOR STORE
// ============================================================================

/**
 * Qdrant vector store implementation
 */
export class QdrantVectorStore implements VectorStore {
  name = 'qdrant';

  private url: string;
  private collection: string;
  private dimensions: number = 1024;

  constructor(config: VectorStoreConfig) {
    this.url = config.url || 'http://localhost:6333';
    this.collection = config.collection || 'uce-chunks';
  }

  async initialize(): Promise<void> {
    // Check if collection exists
    try {
      const response = await fetch(`${this.url}/collections/${this.collection}`);
      if (response.status === 404) {
        // Create collection
        await this.createCollection();
      }
    } catch (error) {
      // Qdrant might not be running, will fail on first operation
      console.warn('Qdrant not available, falling back to memory store');
    }
  }

  private async createCollection(): Promise<void> {
    await fetch(`${this.url}/collections/${this.collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: this.dimensions,
          distance: 'Cosine',
        },
      }),
    });
  }

  async add(chunks: EmbeddedChunk[]): Promise<void> {
    const points = chunks.map((chunk) => ({
      id: this.hashId(chunk.id),
      vector: chunk.embedding.values,
      payload: {
        id: chunk.id,
        content: chunk.content,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        primarySymbol: chunk.primarySymbol,
        symbols: chunk.symbols,
        language: chunk.language,
        tokenCount: chunk.tokenCount,
        createdAt: chunk.createdAt,
      },
    }));

    // Upsert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await fetch(`${this.url}/collections/${this.collection}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
      });
    }
  }

  async search(
    query: Embedding,
    limit: number = 10,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    const searchRequest: Record<string, unknown> = {
      vector: query.values,
      limit,
      with_payload: true,
    };

    if (filter) {
      searchRequest.filter = {
        must: Object.entries(filter).map(([key, value]) => ({
          key,
          match: { value },
        })),
      };
    }

    const response = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchRequest),
    });

    const data = (await response.json()) as {
      result: Array<{
        id: number;
        score: number;
        payload: {
          id: string;
          content: string;
          filePath: string;
          startLine: number;
          endLine: number;
          primarySymbol?: string;
          symbols: string[];
          language: string;
          tokenCount: number;
          createdAt: string;
        };
      }>;
    };

    return data.result.map((item) => ({
      id: item.payload.id,
      score: item.score,
      chunk: {
        id: item.payload.id,
        content: item.payload.content,
        embedding: query, // We don't store the full embedding in payload
        filePath: item.payload.filePath,
        startLine: item.payload.startLine,
        endLine: item.payload.endLine,
        primarySymbol: item.payload.primarySymbol,
        symbols: item.payload.symbols,
        language: item.payload.language,
        tokenCount: item.payload.tokenCount,
        createdAt: item.payload.createdAt,
      },
    }));
  }

  async delete(ids: string[]): Promise<void> {
    const numericIds = ids.map((id) => this.hashId(id));

    await fetch(`${this.url}/collections/${this.collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: numericIds }),
    });
  }

  async deleteByFile(filePath: string): Promise<void> {
    await fetch(`${this.url}/collections/${this.collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'filePath', match: { value: filePath } }],
        },
      }),
    });
  }

  async count(): Promise<number> {
    const response = await fetch(`${this.url}/collections/${this.collection}`);
    const data = (await response.json()) as {
      result: { points_count: number };
    };
    return data.result.points_count;
  }

  async clear(): Promise<void> {
    // Delete and recreate collection
    await fetch(`${this.url}/collections/${this.collection}`, {
      method: 'DELETE',
    });
    await this.createCollection();
  }

  private hashId(id: string): number {
    // Convert string ID to numeric ID for Qdrant
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a vector store based on configuration
 */
export function createVectorStore(config: VectorStoreConfig): VectorStore {
  switch (config.type) {
    case 'qdrant':
      return new QdrantVectorStore(config);
    case 'memory':
    default:
      return new MemoryVectorStore(config);
  }
}

/**
 * Create the best available vector store
 */
export function createAutoVectorStore(projectRoot: string): VectorStore {
  // Try to use Qdrant if available
  if (process.env.QDRANT_URL) {
    return new QdrantVectorStore({
      type: 'qdrant',
      collection: 'uce-chunks',
      url: process.env.QDRANT_URL,
    });
  }

  // Fall back to persistent memory store
  return new MemoryVectorStore({
    type: 'memory',
    collection: 'uce-chunks',
    path: path.join(projectRoot, '.context', 'vectors.json'),
  });
}

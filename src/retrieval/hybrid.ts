/**
 * Universal Context Engine - Hybrid Retrieval
 *
 * Combines sparse (BM25) and dense (vector) retrieval using
 * Reciprocal Rank Fusion (RRF) for optimal results.
 *
 * @module retrieval/hybrid
 */

import { BM25Index, type BM25Document, type BM25SearchResult } from './bm25.js';
import type { VectorStore, SearchResult as VectorSearchResult, Embedding } from '../embeddings/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HybridConfig {
  /** Weight for sparse (BM25) results (0-1) */
  sparseWeight?: number;
  /** Weight for dense (vector) results (0-1) */
  denseWeight?: number;
  /** RRF constant k (higher = more emphasis on lower ranks) */
  rrfK?: number;
  /** Minimum score threshold */
  minScore?: number;
}

export interface HybridDocument {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbols: string[];
  metadata?: Record<string, unknown>;
}

export interface HybridSearchResult {
  id: string;
  score: number;
  sparseScore: number;
  denseScore: number;
  document: HybridDocument;
}

// ============================================================================
// RECIPROCAL RANK FUSION
// ============================================================================

/**
 * Compute Reciprocal Rank Fusion scores
 *
 * RRF(d) = Σ 1 / (k + rank(d))
 *
 * @param rankings - Array of ranked result lists
 * @param k - RRF constant (default: 60)
 * @returns Map of document ID to fused score
 */
export function reciprocalRankFusion(
  rankings: Array<{ id: string; score: number }[]>,
  k: number = 60
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const { id } = ranking[rank];
      const rrfScore = 1 / (k + rank + 1);
      scores.set(id, (scores.get(id) || 0) + rrfScore);
    }
  }

  return scores;
}

/**
 * Weighted Reciprocal Rank Fusion
 *
 * @param rankings - Array of { results, weight } pairs
 * @param k - RRF constant
 */
export function weightedRRF(
  rankings: Array<{ results: { id: string; score: number }[]; weight: number }>,
  k: number = 60
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const { results, weight } of rankings) {
    for (let rank = 0; rank < results.length; rank++) {
      const { id } = results[rank];
      const rrfScore = weight * (1 / (k + rank + 1));
      scores.set(id, (scores.get(id) || 0) + rrfScore);
    }
  }

  return scores;
}

// ============================================================================
// HYBRID RETRIEVER
// ============================================================================

/**
 * Hybrid retriever combining BM25 sparse and vector dense search
 *
 * @example
 * ```ts
 * const retriever = new HybridRetriever({
 *   vectorStore: myVectorStore,
 *   embeddingProvider: myProvider,
 * });
 *
 * await retriever.addDocuments(chunks);
 * const results = await retriever.search('authentication flow', 10);
 * ```
 */
export class HybridRetriever {
  private config: Required<HybridConfig>;
  private bm25: BM25Index;
  private vectorStore: VectorStore | null;
  private embedQuery: ((text: string) => Promise<Embedding>) | null;
  private documents: Map<string, HybridDocument> = new Map();

  constructor(options: {
    vectorStore?: VectorStore;
    embedQuery?: (text: string) => Promise<Embedding>;
    config?: HybridConfig;
  }) {
    this.config = {
      sparseWeight: options.config?.sparseWeight ?? 0.4,
      denseWeight: options.config?.denseWeight ?? 0.6,
      rrfK: options.config?.rrfK ?? 60,
      minScore: options.config?.minScore ?? 0.0,
    };

    this.bm25 = new BM25Index();
    this.vectorStore = options.vectorStore || null;
    this.embedQuery = options.embedQuery || null;
  }

  /**
   * Add documents to both sparse and dense indices
   */
  async addDocuments(documents: HybridDocument[]): Promise<void> {
    // Add to BM25 index
    const bm25Docs: BM25Document[] = documents.map((doc) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
    }));
    this.bm25.addDocuments(bm25Docs);

    // Store documents for retrieval
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
  }

  /**
   * Search using hybrid retrieval
   */
  async search(query: string, limit: number = 10): Promise<HybridSearchResult[]> {
    const fetchLimit = Math.min(limit * 3, 100); // Fetch more for fusion

    // Get sparse results from BM25
    const sparseResults = this.bm25.search(query, fetchLimit);

    // Get dense results from vector store
    let denseResults: VectorSearchResult[] = [];
    if (this.vectorStore && this.embedQuery) {
      const queryEmbedding = await this.embedQuery(query);
      denseResults = await this.vectorStore.search(queryEmbedding, fetchLimit);
    }

    // If only sparse available
    if (denseResults.length === 0) {
      return this.convertSparseResults(sparseResults, limit);
    }

    // If only dense available
    if (sparseResults.length === 0) {
      return this.convertDenseResults(denseResults, limit);
    }

    // Apply weighted RRF
    const fusedScores = weightedRRF(
      [
        {
          results: sparseResults.map((r) => ({ id: r.id, score: r.score })),
          weight: this.config.sparseWeight,
        },
        {
          results: denseResults.map((r) => ({ id: r.id, score: r.score })),
          weight: this.config.denseWeight,
        },
      ],
      this.config.rrfK
    );

    // Build score maps for individual results
    const sparseScoreMap = new Map(sparseResults.map((r) => [r.id, r.score]));
    const denseScoreMap = new Map(denseResults.map((r) => [r.id, r.score]));

    // Sort by fused score and build results
    const sortedIds = [...fusedScores.entries()]
      .filter(([_id, score]) => score >= this.config.minScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const results: HybridSearchResult[] = [];
    for (const [id, score] of sortedIds) {
      const doc = this.documents.get(id);
      if (doc) {
        results.push({
          id,
          score,
          sparseScore: sparseScoreMap.get(id) || 0,
          denseScore: denseScoreMap.get(id) || 0,
          document: doc,
        });
      }
    }

    return results;
  }

  /**
   * Search with sparse (BM25) only
   */
  searchSparse(query: string, limit: number = 10): HybridSearchResult[] {
    const results = this.bm25.search(query, limit);
    return this.convertSparseResults(results, limit);
  }

  /**
   * Search with dense (vector) only
   */
  async searchDense(query: string, limit: number = 10): Promise<HybridSearchResult[]> {
    if (!this.vectorStore || !this.embedQuery) {
      return [];
    }

    const queryEmbedding = await this.embedQuery(query);
    const results = await this.vectorStore.search(queryEmbedding, limit);
    return this.convertDenseResults(results, limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    documentCount: number;
    vocabularySize: number;
    hasVectorStore: boolean;
  } {
    return {
      documentCount: this.documents.size,
      vocabularySize: this.bm25.vocabularySize,
      hasVectorStore: this.vectorStore !== null,
    };
  }

  /**
   * Clear all indices
   */
  clear(): void {
    this.bm25.clear();
    this.documents.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private convertSparseResults(results: BM25SearchResult[], limit: number): HybridSearchResult[] {
    return results.slice(0, limit).map((r) => {
      const doc = this.documents.get(r.id);
      return {
        id: r.id,
        score: r.score,
        sparseScore: r.score,
        denseScore: 0,
        document: doc || {
          id: r.id,
          content: r.document.content,
          filePath: '',
          startLine: 0,
          endLine: 0,
          symbols: [],
        },
      };
    });
  }

  private convertDenseResults(results: VectorSearchResult[], limit: number): HybridSearchResult[] {
    return results.slice(0, limit).map((r) => {
      const doc = this.documents.get(r.id);
      return {
        id: r.id,
        score: r.score,
        sparseScore: 0,
        denseScore: r.score,
        document: doc || {
          id: r.id,
          content: r.chunk.content,
          filePath: r.chunk.filePath,
          startLine: r.chunk.startLine,
          endLine: r.chunk.endLine,
          symbols: r.chunk.symbols,
        },
      };
    });
  }
}

export default HybridRetriever;

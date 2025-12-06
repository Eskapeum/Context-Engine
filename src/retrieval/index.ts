/**
 * Universal Context Memory - Retrieval Module
 *
 * Exports for sparse, dense, and hybrid retrieval.
 *
 * @module retrieval
 */

export { BM25Index, type BM25Config, type BM25Document, type BM25SearchResult } from './bm25.js';

export {
  HybridRetriever,
  reciprocalRankFusion,
  weightedRRF,
  type HybridConfig,
  type HybridDocument,
  type HybridSearchResult,
} from './hybrid.js';

export {
  BudgetOptimizer,
  optimizeContext,
  type BudgetConfig,
  type BudgetChunk,
  type BudgetResult,
} from './budget.js';

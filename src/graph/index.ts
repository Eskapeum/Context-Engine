/**
 * Universal Context Engine - Graph Module
 *
 * Knowledge graph for code entity relationships.
 *
 * @module graph
 */

export {
  KnowledgeGraph,
  type GraphNode,
  type GraphEdge,
  type NodeType,
  type EdgeType,
  type GraphQueryOptions,
  type GraphQueryResult,
} from './knowledge-graph.js';

export {
  GraphBuilder,
  buildKnowledgeGraph,
  type GraphBuilderConfig,
} from './graph-builder.js';

export {
  QueryCache,
  GraphQueryCacheManager,
  DEFAULT_CACHE_CONFIG,
  type CacheEntry,
  type QueryCacheConfig,
  type CacheStats,
} from './query-cache.js';

export {
  CycleDetector,
  type Cycle,
  type CycleDetectionResult,
} from './cycle-detector.js';

export {
  SymbolTracker,
  type SymbolEdgeType,
  type SymbolDependency,
  type SymbolUsageStats,
  type CallGraph,
  type CallGraphNode,
} from './symbol-tracker.js';

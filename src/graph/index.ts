/**
 * Universal Context Memory - Graph Module
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

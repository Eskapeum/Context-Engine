/**
 * Universal Context Engine (UCE) v2.3
 *
 * The most intelligent context engine for AI coding assistants.
 *
 * Features:
 * - Tree-sitter AST parsing (20+ languages)
 * - Incremental indexing with dependency tracking
 * - Git branch-aware per-user indexing
 * - Semantic chunking for embeddings
 * - Hybrid retrieval (BM25 + dense vectors)
 * - MCP server for Claude Code integration
 *
 * @packageDocumentation
 * @module universal-context-engine
 *
 * @example Quick Start
 * ```ts
 * import { ContextEngine } from 'universal-context-engine';
 *
 * const engine = new ContextEngine({ projectRoot: '/path/to/project' });
 * await engine.initialize();
 *
 * // Retrieve relevant context for a task
 * const context = await engine.retrieve('How does authentication work?');
 * console.log(context.content);
 * ```
 *
 * @example MCP Server
 * ```ts
 * import { MCPServer } from 'universal-context-engine';
 *
 * const server = new MCPServer('/path/to/project');
 * await server.start(3333);
 * ```
 */

// ============================================================================
// LEGACY EXPORTS (v1.x compatibility)
// ============================================================================

export {
  Indexer,
  type ProjectIndex,
  type FileIndex,
  type CodeSymbol,
  type FileImport,
  type DependencyEdge,
  type IndexerConfig,
} from './indexer.js';

export {
  ContextGenerator,
  generateUceMd,
  type GeneratorConfig,
} from './generator.js';

// ============================================================================
// NEW v2.0 EXPORTS
// ============================================================================

// Parser module
export * from './parser/types.js';
export { TreeSitterParser, initializeParser } from './parser/tree-sitter-parser.js';

// Core module
export { IncrementalIndexer } from './core/incremental-indexer.js';
export type {
  FileMetadata,
  FileIndex as EnhancedFileIndex,
  GitBranchInfo,
  ProjectIndex as EnhancedProjectIndex,
  IndexStats,
  IndexerConfig as EnhancedIndexerConfig,
  IndexUpdateResult,
} from './core/incremental-indexer.js';

export { FileWatcher } from './core/watcher.js';
export type { WatcherConfig, FileChangeEvent, WatcherStats } from './core/watcher.js';

// Retrieval module
export {
  BM25Index,
  HybridRetriever,
  BudgetOptimizer,
  reciprocalRankFusion,
  weightedRRF,
  optimizeContext,
} from './retrieval/index.js';
export type {
  BM25Config,
  BM25Document,
  BM25SearchResult,
  HybridConfig,
  HybridDocument,
  HybridSearchResult,
  BudgetConfig,
  BudgetChunk,
  BudgetResult,
} from './retrieval/index.js';

// Graph module
export { KnowledgeGraph, GraphBuilder, buildKnowledgeGraph } from './graph/index.js';
export type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  GraphQueryOptions,
  GraphQueryResult,
  GraphBuilderConfig,
} from './graph/index.js';

// Embeddings module
export * from './embeddings/types.js';
export {
  VoyageEmbeddingProvider,
  OpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingProvider,
  createAutoProvider,
} from './embeddings/providers.js';
export {
  MemoryVectorStore,
  QdrantVectorStore,
  createVectorStore,
  createAutoVectorStore,
} from './embeddings/vector-store.js';

// Context Engine
export { ContextEngine } from './context-engine.js';
export type {
  ContextEngineConfig,
  RetrievalOptions,
  RetrievedContext,
} from './context-engine.js';

// Configuration
export {
  loadConfig,
  validateConfig,
  generateDefaultConfig,
  DEFAULT_CONFIG,
} from './config.js';
export type { UCEConfig } from './config.js';

// MCP Server
export { MCPServer } from './mcp/server.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { Indexer } from './indexer.js';
import { ContextGenerator } from './generator.js';
import { ContextEngine } from './context-engine.js';
import { MCPServer } from './mcp/server.js';
import * as path from 'path';

/**
 * Quick function to index a project and generate all context files.
 * (Legacy v1.x API - still works)
 *
 * @param projectRoot - Path to the project root (defaults to current directory)
 */
export async function indexProject(projectRoot: string = process.cwd()): Promise<void> {
  const resolvedPath = path.resolve(projectRoot);

  const indexer = new Indexer({ projectRoot: resolvedPath });
  const index = await indexer.index();
  await indexer.saveIndex(index);

  const generator = new ContextGenerator({ projectRoot: resolvedPath, index });
  generator.generateAll();
}

/**
 * Load an existing project index from disk.
 * (Legacy v1.x API - still works)
 *
 * @param projectRoot - Path to the project root (defaults to current directory)
 * @returns The project index, or null if no index exists
 */
export function loadIndex(projectRoot: string = process.cwd()) {
  const resolvedPath = path.resolve(projectRoot);
  const indexer = new Indexer({ projectRoot: resolvedPath });
  return indexer.loadIndex();
}

/**
 * Create a fully configured context engine with sensible defaults.
 *
 * @param projectRoot - Path to the project root
 * @param options - Optional configuration overrides
 * @returns Initialized ContextEngine
 *
 * @example
 * ```ts
 * const engine = await createContextEngine('/my/project');
 * const context = await engine.retrieve('authentication flow');
 * ```
 */
export async function createContextEngine(
  projectRoot: string = process.cwd(),
  options?: {
    enableEmbeddings?: boolean;
    autoIndex?: boolean;
  }
): Promise<ContextEngine> {
  const engine = new ContextEngine({
    projectRoot: path.resolve(projectRoot),
    enableEmbeddings: options?.enableEmbeddings ?? true,
    autoIndex: options?.autoIndex ?? true,
  });

  await engine.initialize();
  return engine;
}

/**
 * Start an MCP server for AI assistant integration.
 *
 * @param projectRoot - Path to the project root
 * @param port - Port to listen on (default: 3333)
 * @returns Running MCPServer instance
 *
 * @example
 * ```ts
 * const server = await startMCPServer('/my/project', 3333);
 * // Server is now running at http://localhost:3333
 * ```
 */
export async function startMCPServer(
  projectRoot: string = process.cwd(),
  port: number = 3333
): Promise<MCPServer> {
  const server = new MCPServer(path.resolve(projectRoot));
  await server.start(port);
  return server;
}

/**
 * Version of the UCE package.
 */
export const VERSION = '2.3.1';

// Default export for convenience
export default {
  // Legacy
  Indexer,
  ContextGenerator,
  indexProject,
  loadIndex,
  // New v2.0
  ContextEngine,
  MCPServer,
  createContextEngine,
  startMCPServer,
  VERSION,
};

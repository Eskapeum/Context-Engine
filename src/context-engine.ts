/**
 * Universal Context Engine - Context Engine
 *
 * The main context engine that orchestrates:
 * - Incremental indexing
 * - Embedding generation
 * - Hybrid retrieval (BM25 + semantic)
 * - Knowledge graph analysis
 * - Context budget optimization
 *
 * @module context-engine
 */

import * as fs from 'fs';
import * as path from 'path';
import { IncrementalIndexer } from './core/incremental-indexer.js';
import { createAutoProvider, createAutoVectorStore } from './embeddings/index.js';
import type { EmbeddingProvider, VectorStore, EmbeddedChunk } from './embeddings/types.js';
import { BM25Index } from './retrieval/bm25.js';
import { BudgetOptimizer } from './retrieval/budget.js';
import { reciprocalRankFusion } from './retrieval/hybrid.js';
import { KnowledgeGraph, GraphBuilder } from './graph/index.js';
import { StateManager, type EngineState } from './storage/state-manager.js';
import { QAEngine, type QAOptions, type QAResult } from './qa/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context engine configuration
 */
export interface ContextEngineConfig {
  /** Project root directory */
  projectRoot: string;
  /** Enable embedding generation */
  enableEmbeddings?: boolean;
  /** Custom embedding provider */
  embeddingProvider?: EmbeddingProvider;
  /** Custom vector store */
  vectorStore?: VectorStore;
  /** Auto-index on initialization */
  autoIndex?: boolean;
  /** Watch for file changes */
  watchMode?: boolean;
}

/**
 * Context retrieval options
 */
export interface RetrievalOptions {
  /** Maximum tokens to retrieve */
  maxTokens?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by file paths */
  files?: string[];
  /** Filter by language */
  language?: string;
  /** Include surrounding context */
  includeContext?: boolean;
}

/**
 * Retrieved context result
 */
export interface RetrievedContext {
  /** Combined context string */
  content: string;
  /** Individual chunks */
  chunks: Array<{
    id: string;
    content: string;
    file: string;
    startLine: number;
    endLine: number;
    score: number;
    symbols: string[];
  }>;
  /** Total tokens */
  tokenCount: number;
  /** Query used */
  query: string;
}

// ============================================================================
// CONTEXT ENGINE
// ============================================================================

/**
 * Main context engine class
 */
export class ContextEngine {
  private config: ContextEngineConfig;
  private indexer: IncrementalIndexer;
  private embeddingProvider: EmbeddingProvider | null = null;
  private vectorStore: VectorStore | null = null;
  private bm25: BM25Index | null = null;
  private graph: KnowledgeGraph | null = null;
  private budgetOptimizer: BudgetOptimizer;
  private qaEngine: QAEngine | null = null;
  private initialized = false;
  private embeddingsEnabled: boolean;

  constructor(config: ContextEngineConfig) {
    this.config = {
      ...config,
      projectRoot: path.resolve(config.projectRoot),
      enableEmbeddings: config.enableEmbeddings ?? true,
      autoIndex: config.autoIndex ?? true,
      watchMode: config.watchMode ?? false,
    };

    this.embeddingsEnabled = this.config.enableEmbeddings ?? true;

    // Initialize indexer
    this.indexer = new IncrementalIndexer({
      projectRoot: this.config.projectRoot,
    });

    // Initialize budget optimizer
    this.budgetOptimizer = new BudgetOptimizer({ maxTokens: 8000 });

    // Set up embedding infrastructure if enabled
    if (this.embeddingsEnabled) {
      this.embeddingProvider = config.embeddingProvider || createAutoProvider();
      this.vectorStore = config.vectorStore || createAutoVectorStore(this.config.projectRoot);
    }
  }

  /**
   * Initialize the context engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize indexer
    await this.indexer.initialize();

    // Initialize vector store
    if (this.vectorStore) {
      await this.vectorStore.initialize();
    }

    // Try to load cached indices first
    const loadedFromCache = await this.loadIndices();

    // Auto-index if enabled and cache wasn't loaded
    if (this.config.autoIndex && !loadedFromCache) {
      await this.index();
      // Save to cache after indexing
      await this.saveIndices();
    }

    this.initialized = true;
  }

  /**
   * Index the codebase
   */
  async index(): Promise<{
    files: number;
    symbols: number;
    chunks: number;
    duration: number;
    newFiles: number;
    updatedFiles: number;
    cachedFiles: number;
  }> {
    const startTime = performance.now();

    // Run incremental indexing
    const projectIndex = await this.indexer.index();

    // Build BM25 index from chunks
    await this.buildBM25Index();

    // Build knowledge graph
    await this.buildGraph();

    // Generate embeddings for new chunks if enabled
    if (this.embeddingsEnabled && this.embeddingProvider && this.vectorStore) {
      await this.updateEmbeddings();
    }

    // Save indices to cache
    await this.saveIndices();

    return {
      files: projectIndex.stats.totalFiles,
      symbols: projectIndex.stats.totalSymbols,
      chunks: projectIndex.stats.totalChunks,
      duration: performance.now() - startTime,
      newFiles: projectIndex.stats.newFiles,
      updatedFiles: projectIndex.stats.updatedFiles,
      cachedFiles: projectIndex.stats.cachedFiles,
    };
  }

  /**
   * Build BM25 index from chunks
   */
  private async buildBM25Index(): Promise<void> {
    const chunks = this.indexer.getAllChunks();

    this.bm25 = new BM25Index();
    this.bm25.addDocuments(
      chunks.map((c) => ({
        id: c.id,
        content: c.content,
        metadata: {
          filePath: c.filePath,
          startLine: c.startLine,
          endLine: c.endLine,
          symbols: c.symbols,
          tokenCount: c.tokenCount,
        },
      }))
    );
  }

  /**
   * Build knowledge graph from index
   */
  private async buildGraph(): Promise<void> {
    const index = this.indexer.getIndex();
    if (!index) return;

    const builder = new GraphBuilder();

    for (const [filePath, fileIndex] of index.files) {
      builder.addFile({
        filePath,
        language: fileIndex.metadata.language,
        symbols: fileIndex.symbols,
        imports: fileIndex.imports,
        exports: fileIndex.exports,
        calls: fileIndex.calls,
        typeReferences: [],
        success: true,
        chunks: fileIndex.chunks,
        parseTime: 0,
      });
    }

    this.graph = builder.getGraph();
  }

  /**
   * Retrieve relevant context for a query using hybrid search
   */
  async retrieve(query: string, options?: RetrievalOptions): Promise<RetrievedContext> {
    await this.initialize();

    const maxTokens = options?.maxTokens || 8000;
    const minScore = options?.minScore || 0.3;

    // Use hybrid retrieval if both BM25 and embeddings are available
    if (this.embeddingsEnabled && this.embeddingProvider && this.vectorStore && this.bm25) {
      return this.hybridRetrieve(query, maxTokens, minScore, options);
    }

    // Fall back to BM25 only if embeddings not available
    if (this.bm25) {
      return this.bm25Retrieve(query, maxTokens, options);
    }

    // Last resort: simple keyword matching
    return this.keywordRetrieve(query, maxTokens, options);
  }

  /**
   * Hybrid retrieval combining BM25 + semantic search with RRF
   */
  private async hybridRetrieve(
    query: string,
    maxTokens: number,
    minScore: number,
    options?: RetrievalOptions
  ): Promise<RetrievedContext> {
    if (!this.bm25 || !this.embeddingProvider || !this.vectorStore) {
      return this.keywordRetrieve(query, maxTokens, options);
    }

    // 1. Get BM25 (sparse) results
    const bm25Results = this.bm25.search(query, 50);
    const sparseRanking = bm25Results.map((r) => ({
      id: r.document.id,
      score: r.score,
    }));

    // 2. Get semantic (dense) results
    const queryEmbedding = await this.embeddingProvider.embed(query);
    const filter: Record<string, unknown> = {};
    if (options?.language) filter.language = options.language;
    const semanticResults = await this.vectorStore.search(queryEmbedding, 50, filter);
    const denseRanking = semanticResults.map((r) => ({
      id: r.id,
      score: r.score,
    }));

    // 3. Fuse rankings with RRF
    const fusedScores = reciprocalRankFusion([sparseRanking, denseRanking]);

    // 4. Get chunks and apply budget optimization
    const allChunks = this.indexer.getAllChunks();
    const chunkMap = new Map(allChunks.map((c) => [c.id, c]));

    // Build budget chunks with fused scores
    const budgetChunks = Array.from(fusedScores.entries())
      .map(([id, score]) => {
        const chunk = chunkMap.get(id);
        if (!chunk) return null;
        return {
          id,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          score,
          filePath: chunk.filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          symbols: chunk.symbols,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.score >= minScore);

    // Filter by file paths if specified
    let filteredChunks = budgetChunks;
    if (options?.files && options.files.length > 0) {
      filteredChunks = budgetChunks.filter((c) =>
        options.files!.some((f) => c.filePath.includes(f))
      );
    }

    // 5. Optimize with budget
    this.budgetOptimizer = new BudgetOptimizer({ maxTokens });
    const optimized = options?.files
      ? this.budgetOptimizer.optimizeWithPriority(filteredChunks, options.files)
      : this.budgetOptimizer.optimize(filteredChunks);

    // 6. Format response
    const selectedChunks = optimized.chunks.map((c) => ({
      id: c.id,
      content: c.content,
      file: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      score: c.score,
      symbols: c.symbols,
    }));

    const content = this.budgetOptimizer.formatContext(optimized);

    return {
      content,
      chunks: selectedChunks,
      tokenCount: optimized.totalTokens,
      query,
    };
  }

  /**
   * BM25-only retrieval
   */
  private async bm25Retrieve(
    query: string,
    maxTokens: number,
    options?: RetrievalOptions
  ): Promise<RetrievedContext> {
    if (!this.bm25) {
      return this.keywordRetrieve(query, maxTokens, options);
    }

    let results = this.bm25.search(query, 100);

    // Filter by file paths
    if (options?.files && options.files.length > 0) {
      results = results.filter((r) => {
        const filePath = r.document.metadata?.filePath as string;
        return filePath && options.files!.some((f) => filePath.includes(f));
      });
    }

    // Build budget chunks
    const budgetChunks = results.map((r) => ({
      id: r.document.id,
      content: r.document.content,
      tokenCount: (r.document.metadata?.tokenCount as number) || Math.ceil(r.document.content.length / 4),
      score: r.score,
      filePath: (r.document.metadata?.filePath as string) || 'unknown',
      startLine: (r.document.metadata?.startLine as number) || 0,
      endLine: (r.document.metadata?.endLine as number) || 0,
      symbols: (r.document.metadata?.symbols as string[]) || [],
    }));

    // Optimize with budget
    this.budgetOptimizer = new BudgetOptimizer({ maxTokens });
    const optimized = this.budgetOptimizer.optimize(budgetChunks);

    const selectedChunks = optimized.chunks.map((c) => ({
      id: c.id,
      content: c.content,
      file: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      score: c.score,
      symbols: c.symbols,
    }));

    return {
      content: this.budgetOptimizer.formatContext(optimized),
      chunks: selectedChunks,
      tokenCount: optimized.totalTokens,
      query,
    };
  }

  /**
   * Ask a question about the codebase with AI-powered answering (v2.6+)
   *
   * Automatically retrieves relevant context and generates an intelligent answer.
   *
   * @param question - Question to ask about the codebase
   * @param options - Optional Q&A configuration
   * @returns Answer with sources and metadata
   *
   * @example
   * ```typescript
   * const result = await engine.ask('How does authentication work?');
   * console.log(result.answer);
   * console.log(`Sources: ${result.sources.length} files`);
   * ```
   */
  async ask(question: string, options?: Partial<QAOptions>): Promise<QAResult> {
    await this.initialize();

    // 1. Retrieve relevant context using hybrid search
    const context = await this.retrieve(question, {
      maxTokens: options?.maxContextTokens || 4000,
    });

    // 2. Initialize QA engine if needed
    if (!this.qaEngine) {
      this.qaEngine = new QAEngine({
        provider: options?.provider || 'anthropic',
        apiKey: options?.apiKey || process.env.ANTHROPIC_API_KEY || '',
        model: options?.model,
        maxContextTokens: options?.maxContextTokens,
        maxResponseTokens: options?.maxResponseTokens,
        includeSources: options?.includeSources,
        temperature: options?.temperature,
      });
    }

    // 3. Ask the question with the retrieved context
    return this.qaEngine.ask(question, context.content);
  }

  /**
   * Search for symbols
   */
  searchSymbols(
    query: string,
    options?: { limit?: number; kinds?: string[] }
  ): Array<{
    name: string;
    kind: string;
    file: string;
    line: number;
    exported: boolean;
  }> {
    const symbols = this.indexer.searchSymbols(query, options);
    const index = this.indexer.getIndex();

    return symbols.map((s) => {
      // Find the file containing this symbol
      let file = 'unknown';
      if (index) {
        for (const [filePath, fileIndex] of index.files) {
          if (fileIndex.symbols.some((fs) => fs.name === s.name && fs.line === s.line)) {
            file = filePath;
            break;
          }
        }
      }

      return {
        name: s.name,
        kind: s.kind,
        file,
        line: s.line,
        exported: s.exported,
      };
    });
  }

  /**
   * Get project statistics
   */
  getStats(): {
    files: number;
    symbols: number;
    chunks: number;
    embeddedChunks: number;
    byLanguage: Record<string, { files: number; symbols: number }>;
  } | null {
    const index = this.indexer.getIndex();
    if (!index) return null;

    return {
      files: index.stats.totalFiles,
      symbols: index.stats.totalSymbols,
      chunks: index.stats.totalChunks,
      embeddedChunks: 0, // Will be updated when we check vector store
      byLanguage: index.stats.byLanguage,
    };
  }

  /**
   * Get dependencies for a file
   */
  getDependencies(file: string): {
    imports: string[];
    importedBy: string[];
  } {
    return {
      imports: this.indexer.getDependencies(file),
      importedBy: this.indexer.getDependents(file),
    };
  }

  /**
   * Get the knowledge graph (for advanced queries)
   */
  getGraph(): KnowledgeGraph | null {
    return this.graph;
  }

  /**
   * Find related symbols using the knowledge graph
   */
  findRelated(
    symbolName: string,
    options?: { maxDepth?: number; relations?: string[] }
  ): Array<{
    name: string;
    type: string;
    relation: string;
    file?: string;
    line?: number;
  }> {
    if (!this.graph) return [];

    const nodes = this.graph.findNodes({ name: symbolName });
    if (nodes.length === 0) return [];

    const result = this.graph.findRelated(nodes[0].id, {
      maxDepth: options?.maxDepth ?? 2,
    });

    return result.nodes
      .filter((n) => n.id !== nodes[0].id)
      .map((n) => {
        const edge = result.edges.find((e) => e.target === n.id || e.source === n.id);
        return {
          name: n.name,
          type: n.type,
          relation: edge?.type || 'related',
          file: n.filePath,
          line: n.line,
        };
      });
  }

  /**
   * Find all callers of a function
   */
  findCallers(functionName: string): Array<{
    name: string;
    type: string;
    file?: string;
    line?: number;
  }> {
    if (!this.graph) return [];

    const nodes = this.graph.findNodes({ name: functionName });
    if (nodes.length === 0) return [];

    return this.graph.getCallers(nodes[0].id).map((n) => ({
      name: n.name,
      type: n.type,
      file: n.filePath,
      line: n.line,
    }));
  }

  /**
   * Get inheritance hierarchy for a class
   */
  getInheritance(className: string): {
    parents: Array<{ name: string; type: string; file?: string }>;
    children: Array<{ name: string; type: string; file?: string }>;
  } {
    if (!this.graph) return { parents: [], children: [] };

    const nodes = this.graph.findNodes({ name: className });
    if (nodes.length === 0) return { parents: [], children: [] };

    return {
      parents: this.graph.getInheritanceChain(nodes[0].id, 'up').map((n) => ({
        name: n.name,
        type: n.type,
        file: n.filePath,
      })),
      children: this.graph.getInheritanceChain(nodes[0].id, 'down').map((n) => ({
        name: n.name,
        type: n.type,
        file: n.filePath,
      })),
    };
  }

  /**
   * Export current engine state for persistence
   *
   * Allows saving and restoring engine state to skip re-indexing unchanged files.
   * State includes file hashes, index generation, and statistics.
   *
   * @returns Engine state snapshot
   */
  async exportState(): Promise<EngineState> {
    await this.initialize();

    const index = this.indexer.getIndex();
    if (!index) {
      throw new Error('No index available to export state from');
    }

    const stateManager = new StateManager();

    // Get BM25 vocabulary if available (note: not persisted in current implementation)
    const bm25Vocab = undefined;

    // Get graph node count if available
    const graphNodeCount = this.graph ? this.graph.getStats().nodeCount : undefined;

    // Get embeddings count if available
    const embeddingsCount = this.vectorStore ? await this.vectorStore.count() : 0;

    return stateManager.exportState({
      projectRoot: this.config.projectRoot,
      git: index.git,
      fileHashes: this.indexer.getFileHashes(),
      indexGeneration: index.generation,
      stats: {
        totalFiles: index.stats.totalFiles,
        totalSymbols: index.stats.totalSymbols,
        totalChunks: index.stats.totalChunks,
      },
      embeddingsCount,
      bm25Vocab,
      graphNodeCount,
    });
  }

  /**
   * Import engine state from persistence
   *
   * Restores file hashes and index generation to enable incremental indexing
   * without re-processing unchanged files.
   *
   * @param state - Engine state to import
   */
  async importState(state: EngineState): Promise<void> {
    await this.initialize();

    const stateManager = new StateManager();
    const imported = await stateManager.importState(state);

    // Restore file hashes to indexer
    this.indexer.setFileHashes(imported.fileHashes);

    // Note: Index generation will be updated by the indexer on next index() call
  }

  /**
   * Save indices to disk for faster startup
   */
  async saveIndices(): Promise<void> {
    const cacheDir = path.join(this.config.projectRoot, '.uce', 'cache');
    await fs.promises.mkdir(cacheDir, { recursive: true });

    // Save BM25 index
    if (this.bm25) {
      const bm25Path = path.join(cacheDir, 'bm25.json');
      await fs.promises.writeFile(bm25Path, this.bm25.toJSON());
    }

    // Save knowledge graph
    if (this.graph) {
      const graphPath = path.join(cacheDir, 'graph.json');
      await fs.promises.writeFile(graphPath, this.graph.toJSON());
    }
  }

  /**
   * Load indices from disk
   */
  async loadIndices(): Promise<boolean> {
    const cacheDir = path.join(this.config.projectRoot, '.uce', 'cache');

    try {
      // Load BM25 index
      const bm25Path = path.join(cacheDir, 'bm25.json');
      if (fs.existsSync(bm25Path)) {
        const bm25Data = await fs.promises.readFile(bm25Path, 'utf-8');
        this.bm25 = BM25Index.fromJSON(bm25Data);
      }

      // Load knowledge graph
      const graphPath = path.join(cacheDir, 'graph.json');
      if (fs.existsSync(graphPath)) {
        const graphData = await fs.promises.readFile(graphPath, 'utf-8');
        this.graph = KnowledgeGraph.fromJSON(graphData);
      }

      return this.bm25 !== null && this.graph !== null;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached indices
   */
  async clearCache(): Promise<void> {
    const cacheDir = path.join(this.config.projectRoot, '.uce', 'cache');
    if (fs.existsSync(cacheDir)) {
      await fs.promises.rm(cacheDir, { recursive: true });
    }
    this.bm25 = null;
    this.graph = null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async updateEmbeddings(): Promise<void> {
    if (!this.embeddingProvider || !this.vectorStore) return;

    const allChunks = this.indexer.getAllChunks();

    // Get existing chunk IDs from vector store
    const existingCount = await this.vectorStore.count();

    // If counts match, assume up to date (simplified check)
    if (existingCount === allChunks.length) return;

    // Clear and re-embed all chunks (in production, be smarter about this)
    await this.vectorStore.clear();

    // Embed in batches
    const batchSize = 50;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);

      const embeddings = await this.embeddingProvider.embedBatch(texts);

      const embeddedChunks: EmbeddedChunk[] = batch.map((chunk, idx) => ({
        id: chunk.id,
        content: chunk.content,
        embedding: embeddings[idx],
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        primarySymbol: chunk.primarySymbol,
        symbols: chunk.symbols,
        language: chunk.metadata.language,
        tokenCount: chunk.tokenCount,
        createdAt: new Date().toISOString(),
      }));

      await this.vectorStore.add(embeddedChunks);
    }
  }

  private async keywordRetrieve(
    query: string,
    maxTokens: number,
    options?: RetrievalOptions
  ): Promise<RetrievedContext> {
    const allChunks = this.indexer.getAllChunks();

    // Filter by file paths if specified
    let chunks = options?.files
      ? allChunks.filter((c) => options.files!.some((f) => c.filePath.includes(f)))
      : allChunks;

    // Filter by language if specified
    if (options?.language) {
      chunks = chunks.filter((c) => c.metadata.language === options.language);
    }

    // Score chunks by keyword matching
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = chunks.map((chunk) => {
      let score = 0;
      const contentLower = chunk.content.toLowerCase();

      for (const word of queryWords) {
        if (word.length < 2) continue;
        if (contentLower.includes(word)) score += 1;
        if (chunk.primarySymbol?.toLowerCase().includes(word)) score += 3;
        for (const symbol of chunk.symbols) {
          if (symbol.toLowerCase().includes(word)) score += 2;
        }
      }

      // Boost exported symbols
      if (chunk.metadata.hasExports) score += 0.5;

      return { chunk, score };
    });

    // Sort by score and select
    scored.sort((a, b) => b.score - a.score);

    const selectedChunks: Array<{
      id: string;
      content: string;
      file: string;
      startLine: number;
      endLine: number;
      score: number;
      symbols: string[];
    }> = [];
    let totalTokens = 0;

    for (const { chunk, score } of scored) {
      if (score === 0) break; // No more matches
      if (totalTokens + chunk.tokenCount > maxTokens) break;

      selectedChunks.push({
        id: chunk.id,
        content: chunk.content,
        file: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        score: score / (queryWords.length * 3), // Normalize to 0-1
        symbols: chunk.symbols,
      });
      totalTokens += chunk.tokenCount;
    }

    // Build combined content
    const content = selectedChunks
      .map((c) => `// File: ${c.file}:${c.startLine}-${c.endLine}\n${c.content}`)
      .join('\n\n');

    return {
      content,
      chunks: selectedChunks,
      tokenCount: totalTokens,
      query,
    };
  }
}

export default ContextEngine;

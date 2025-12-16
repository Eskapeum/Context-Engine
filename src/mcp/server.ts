/**
 * Universal Context Engine - MCP Server
 *
 * Model Context Protocol server for AI coding assistant integration.
 * Exposes context engine capabilities via MCP tools.
 *
 * @module mcp/server
 */

import * as http from 'http';
import * as path from 'path';
import { IncrementalIndexer } from '../core/incremental-indexer.js';
import { FileWatcher } from '../core/watcher.js';
import { KnowledgeGraph, GraphBuilder } from '../graph/index.js';
import { BM25Index } from '../retrieval/bm25.js';
import { QAEngine, type QAOptions, type QAResult } from '../qa/index.js';
import {
  ComplexityAnalyzer,
  CodeSmellsDetector,
  PatternDetector,
  type ProjectComplexity,
  type ProjectSmellReport,
  type PatternDetectionResult,
} from '../analytics/index.js';
import {
  getPersonalityInstructions,
  getPersonalityMarkdown,
  wrapToolDescription,
  type UCEPersonality,
} from './personality.js';
import type { Symbol, SemanticChunk } from '../parser/types.js';
import type { EdgeType } from '../graph/knowledge-graph.js';
import { DocsManager, type LibraryDocResult } from '../library-docs/index.js';
import { SequentialThinker, type ThinkingResult, type ThoughtType } from '../thinking/index.js';
import { MemoryEngine, type MemoryStats } from '../memory/index.js';
import { ContextExporter, ContextImporter, type BundleInfo, type BundleComponentType } from '../sharing/index.js';

// ============================================================================
// MCP TYPES
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// ============================================================================
// MCP SERVER
// ============================================================================

/**
 * MCP Server for Universal Context Engine
 */
export class MCPServer {
  private indexer: IncrementalIndexer;
  private projectRoot: string;
  private server: http.Server | null = null;
  private graph: KnowledgeGraph | null = null;
  private bm25: BM25Index | null = null;
  private watcher: FileWatcher | null = null;
  private qaEngine: QAEngine | null = null;
  private personality: Partial<UCEPersonality>;
  private docsManager: DocsManager | null = null;
  private thinker: SequentialThinker | null = null;
  private memoryEngine: MemoryEngine | null = null;
  private exporter: ContextExporter | null = null;
  private importer: ContextImporter | null = null;

  constructor(projectRoot: string, personality?: Partial<UCEPersonality>) {
    this.projectRoot = path.resolve(projectRoot);
    this.indexer = new IncrementalIndexer({ projectRoot: this.projectRoot });
    // Personality enabled by default
    this.personality = personality ?? { enabled: true };
  }

  /**
   * Ensure memory engine is initialized
   */
  private async ensureMemory(): Promise<MemoryEngine> {
    if (this.memoryEngine) return this.memoryEngine;
    this.memoryEngine = new MemoryEngine(this.projectRoot);
    await this.memoryEngine.initialize();
    return this.memoryEngine;
  }

  /**
   * Ensure exporter is initialized
   */
  private ensureExporter(): ContextExporter {
    if (this.exporter) return this.exporter;
    this.exporter = new ContextExporter(this.projectRoot);
    return this.exporter;
  }

  /**
   * Ensure importer is initialized
   */
  private ensureImporter(): ContextImporter {
    if (this.importer) return this.importer;
    this.importer = new ContextImporter(this.projectRoot);
    return this.importer;
  }

  /**
   * Build/update the knowledge graph from the index
   */
  private async ensureGraph(): Promise<KnowledgeGraph> {
    if (this.graph) return this.graph;

    const index = await this.indexer.index();
    const builder = new GraphBuilder();

    // Build graph from index
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
    return this.graph;
  }

  /**
   * Build/update BM25 index
   */
  private async ensureBM25(): Promise<BM25Index> {
    if (this.bm25) return this.bm25;

    const chunks = this.indexer.getAllChunks();
    this.bm25 = new BM25Index();

    this.bm25.addDocuments(
      chunks.map((c) => ({
        id: c.id,
        content: c.content,
        metadata: { filePath: c.filePath, symbols: c.symbols },
      }))
    );

    return this.bm25;
  }

  /**
   * Initialize Q&A engine if needed
   */
  private ensureQAEngine(options?: Partial<QAOptions>): QAEngine {
    if (this.qaEngine) return this.qaEngine;

    this.qaEngine = new QAEngine({
      provider: options?.provider || 'anthropic',
      apiKey: options?.apiKey || process.env.ANTHROPIC_API_KEY || '',
      model: options?.model,
      maxContextTokens: options?.maxContextTokens,
      maxResponseTokens: options?.maxResponseTokens,
      temperature: options?.temperature,
    });

    return this.qaEngine;
  }

  /**
   * Get available tools with personality-wrapped descriptions
   */
  getTools(): MCPTool[] {
    const rawTools: MCPTool[] = [
      {
        name: 'uce_search',
        description:
          'Search for code symbols (functions, classes, types) in the codebase. Returns matching symbols with file locations.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (symbol name or partial match)',
            },
            kinds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Filter by symbol kinds: function, class, interface, type, method, constant',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'uce_get_context',
        description:
          'Get relevant code context for a task or question. Returns semantically chunked code that is most relevant.',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'Description of the task or question',
            },
            maxTokens: {
              type: 'number',
              description: 'Maximum tokens to return (default: 8000)',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to include context from',
            },
          },
          required: ['task'],
        },
      },
      {
        name: 'uce_find_usages',
        description: 'Find all usages of a symbol across the codebase. Shows where functions/classes are called or referenced.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name to find usages of',
            },
            file: {
              type: 'string',
              description: 'Optional: limit search to specific file',
            },
          },
          required: ['symbol'],
        },
      },
      {
        name: 'uce_get_dependencies',
        description: 'Get dependency information for a file. Shows what the file imports and what imports it.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path (relative to project root)',
            },
            direction: {
              type: 'string',
              enum: ['imports', 'importedBy', 'both'],
              description: 'Which dependencies to show (default: both)',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'uce_get_file_symbols',
        description: 'Get all symbols defined in a specific file with their signatures and documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path (relative to project root)',
            },
            includePrivate: {
              type: 'boolean',
              description: 'Include private/unexported symbols (default: false)',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'uce_get_project_structure',
        description: 'Get an overview of the project structure including key files, entry points, and statistics.',
        inputSchema: {
          type: 'object',
          properties: {
            depth: {
              type: 'number',
              description: 'Maximum directory depth to show (default: 3)',
            },
          },
        },
      },
      {
        name: 'uce_refresh_index',
        description: 'Refresh the code index to pick up recent changes. Usually happens automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to refresh (optional, refreshes all if not specified)',
            },
          },
        },
      },
      {
        name: 'uce_find_related',
        description: 'Find related symbols through inheritance, calls, and references. Useful for understanding impact of changes.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name to find related entities for',
            },
            depth: {
              type: 'number',
              description: 'How many relationship hops to traverse (default: 2)',
            },
            relations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Relation types: calls, extends, implements, contains, references',
            },
          },
          required: ['symbol'],
        },
      },
      {
        name: 'uce_get_callers',
        description: 'Find all functions/methods that call a given function. Useful for refactoring.',
        inputSchema: {
          type: 'object',
          properties: {
            function: {
              type: 'string',
              description: 'Function/method name to find callers of',
            },
          },
          required: ['function'],
        },
      },
      {
        name: 'uce_get_inheritance',
        description: 'Get inheritance hierarchy for a class or interface. Shows parent classes and child classes.',
        inputSchema: {
          type: 'object',
          properties: {
            class: {
              type: 'string',
              description: 'Class or interface name',
            },
            direction: {
              type: 'string',
              enum: ['parents', 'children', 'both'],
              description: 'Direction to traverse (default: both)',
            },
          },
          required: ['class'],
        },
      },
      {
        name: 'uce_hybrid_search',
        description: 'Advanced search combining keyword and semantic matching. Better for natural language queries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query or keywords',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum results to return (default: 10)',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Limit search to specific files',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'uce_watch_start',
        description: 'Start watching for file changes. Auto-updates the index when files change.',
        inputSchema: {
          type: 'object',
          properties: {
            ignore: {
              type: 'array',
              items: { type: 'string' },
              description: 'Patterns to ignore (default: node_modules, .git, dist)',
            },
          },
        },
      },
      {
        name: 'uce_watch_stop',
        description: 'Stop watching for file changes.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'uce_watch_status',
        description: 'Get current watch mode status and statistics.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'uce_export_graph',
        description: 'Export knowledge graph in various formats for visualization.',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['json', 'dot', 'mermaid'],
              description: 'Export format (default: json)',
            },
            symbol: {
              type: 'string',
              description: 'Center the export around a specific symbol (optional)',
            },
            depth: {
              type: 'number',
              description: 'Max depth from center symbol (default: 3)',
            },
          },
        },
      },
      {
        name: 'uce_graph_stats',
        description: 'Get statistics about the knowledge graph.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'uce_health',
        description: 'Check server health status and get system information. Returns status (healthy/degraded/unhealthy), uptime, index stats, and memory usage.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'uce_ask',
        description:
          'Ask a question about the codebase and get an AI-generated answer with relevant code context. Uses LLM (Claude/GPT) to analyze code and provide intelligent responses.',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Question to ask about the codebase',
            },
            maxContextTokens: {
              type: 'number',
              description: 'Maximum tokens for context retrieval (default: 4000)',
            },
            maxResponseTokens: {
              type: 'number',
              description: 'Maximum tokens for LLM response (default: 2000)',
            },
            provider: {
              type: 'string',
              enum: ['anthropic', 'openai'],
              description: 'LLM provider to use (default: anthropic)',
            },
            model: {
              type: 'string',
              description: 'Specific model to use (optional)',
            },
            temperature: {
              type: 'number',
              description: 'Temperature for generation 0-1 (default: 0.3)',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'uce_analyze_complexity',
        description:
          'Analyze code complexity metrics including cyclomatic and cognitive complexity. Identifies functions and files with high complexity that may need refactoring.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to analyze (optional, analyzes all if not specified)',
            },
            thresholds: {
              type: 'object',
              description: 'Custom complexity thresholds (optional)',
              properties: {
                low: { type: 'number' },
                medium: { type: 'number' },
                high: { type: 'number' },
              },
            },
          },
        },
      },
      {
        name: 'uce_detect_smells',
        description:
          'Detect code smells such as long methods, god classes, duplicate code, deep nesting, and magic numbers. Returns detailed reports with severity levels and refactoring suggestions.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific files to analyze (optional, analyzes all if not specified)',
            },
            severityFilter: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Minimum severity level to report (default: all)',
            },
            thresholds: {
              type: 'object',
              description: 'Custom smell detection thresholds (optional)',
              properties: {
                longMethodLines: { type: 'number' },
                longParameterCount: { type: 'number' },
                godClassMethods: { type: 'number' },
                deepNestingLevel: { type: 'number' },
              },
            },
          },
        },
      },
      {
        name: 'uce_detect_patterns',
        description:
          'Detect architectural and design patterns in the codebase. Identifies patterns like MVC, microservices, singleton, factory, observer, REST APIs, authentication flows, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            categories: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['architectural', 'design', 'api', 'security', 'performance'],
              },
              description:
                'Pattern categories to detect (optional, detects all if not specified)',
            },
          },
        },
      },
      {
        name: 'uce_get_library_docs',
        description:
          'Get documentation for a library from local node_modules. Extracts API reference from .d.ts files. Returns function signatures, types, interfaces, and JSDoc comments.',
        inputSchema: {
          type: 'object',
          properties: {
            library: {
              type: 'string',
              description: 'Library name (e.g., "lodash", "react", "@types/node")',
            },
            version: {
              type: 'string',
              description: 'Specific version to get docs for (optional, uses installed version)',
            },
            forceRefresh: {
              type: 'boolean',
              description: 'Force refresh from source, bypassing cache (default: false)',
            },
          },
          required: ['library'],
        },
      },
      {
        name: 'uce_list_library_docs',
        description:
          'List all libraries with cached documentation or available in node_modules.',
        inputSchema: {
          type: 'object',
          properties: {
            cached: {
              type: 'boolean',
              description: 'If true, list only cached libraries. Otherwise lists all available.',
            },
          },
        },
      },
      {
        name: 'uce_search_library_api',
        description:
          'Search for API entries across all cached library documentation. Find functions, types, or interfaces by name or description.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (name or description)',
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by API types: function, class, interface, type, constant',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum results to return (default: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'uce_sequential_think',
        description:
          'Use structured multi-step reasoning to analyze a problem. Supports revision, branching, and confidence tracking. Returns a chain of thoughts leading to a conclusion.',
        inputSchema: {
          type: 'object',
          properties: {
            problem: {
              type: 'string',
              description: 'The problem or question to analyze',
            },
            maxThoughts: {
              type: 'number',
              description: 'Maximum number of thoughts (default: 10)',
            },
            allowRevision: {
              type: 'boolean',
              description: 'Allow revising previous thoughts (default: true)',
            },
            allowBranching: {
              type: 'boolean',
              description: 'Allow exploring alternative branches (default: false)',
            },
            style: {
              type: 'string',
              enum: ['analytical', 'exploratory', 'focused'],
              description: 'Thinking style (default: analytical)',
            },
          },
          required: ['problem'],
        },
      },
      {
        name: 'uce_add_thought',
        description:
          'Add a thought to an ongoing sequential thinking session. Use after uce_sequential_think to continue reasoning.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The thought content',
            },
            type: {
              type: 'string',
              enum: ['analysis', 'hypothesis', 'revision', 'verification', 'conclusion'],
              description: 'Type of thought',
            },
            confidence: {
              type: 'number',
              description: 'Confidence level 0-1 (default: 0.5)',
            },
            revisesThought: {
              type: 'number',
              description: 'If this revises a previous thought, specify its number',
            },
            branchFromThought: {
              type: 'number',
              description: 'If branching, specify the thought to branch from',
            },
            branchId: {
              type: 'string',
              description: 'Branch identifier for branching',
            },
          },
          required: ['content', 'type'],
        },
      },
      {
        name: 'uce_finalize_thinking',
        description:
          'Finalize the current thinking session and get the complete result with conclusion and metadata.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      // ========================================================================
      // Memory Tools (v4.0+)
      // ========================================================================
      {
        name: 'uce_search_history',
        description:
          'Search through past Q&A history. Find previous discussions about files, symbols, or topics.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for finding past discussions',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific files discussed',
            },
            symbols: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by specific symbols discussed',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'uce_get_file_discussion',
        description:
          'Get all past discussions about a specific file. Useful for understanding previous context and decisions.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path to get discussions for',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'uce_get_session_summary',
        description:
          'Get or generate a summary of the current or a specific session. Returns topics, key findings, and files discussed.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Session ID (optional, defaults to current session)',
            },
          },
        },
      },
      {
        name: 'uce_memory_stats',
        description: 'Get statistics about stored sessions and Q&A history.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      // ========================================================================
      // Sharing Tools (v4.0+)
      // ========================================================================
      {
        name: 'uce_export_context',
        description:
          'Export context as a shareable bundle. Use for team collaboration or backing up context.',
        inputSchema: {
          type: 'object',
          properties: {
            outputPath: {
              type: 'string',
              description: 'Path for the output bundle file',
            },
            components: {
              type: 'array',
              items: { type: 'string' },
              description: 'Components to include: index, graph, libraryDocs, summaries',
            },
            compress: {
              type: 'boolean',
              description: 'Whether to compress the bundle (default: true)',
            },
            anonymize: {
              type: 'boolean',
              description: 'Anonymize symbol names for privacy',
            },
          },
          required: ['outputPath'],
        },
      },
      {
        name: 'uce_import_context',
        description:
          'Import a context bundle from a teammate or backup. Supports merge and replace modes.',
        inputSchema: {
          type: 'object',
          properties: {
            bundlePath: {
              type: 'string',
              description: 'Path to the bundle file to import',
            },
            merge: {
              type: 'boolean',
              description: 'Merge with existing context instead of replacing',
            },
            dryRun: {
              type: 'boolean',
              description: 'Preview changes without applying them',
            },
          },
          required: ['bundlePath'],
        },
      },
      {
        name: 'uce_bundle_info',
        description: 'Get information about a context bundle without importing it.',
        inputSchema: {
          type: 'object',
          properties: {
            bundlePath: {
              type: 'string',
              description: 'Path to the bundle file',
            },
          },
          required: ['bundlePath'],
        },
      },
    ];

    // Wrap tool descriptions with personality instructions if enabled (v3.6+)
    if (this.personality.enabled !== false) {
      return rawTools.map((tool) => ({
        ...tool,
        description: wrapToolDescription(tool.name, tool.description),
      }));
    }

    return rawTools;
  }

  /**
   * Get available resources
   */
  getResources(): MCPResource[] {
    const resources: MCPResource[] = [
      {
        uri: `uce://${this.projectRoot}/index`,
        name: 'Project Index',
        description: 'Complete project index with all symbols and dependencies',
        mimeType: 'application/json',
      },
      {
        uri: `uce://${this.projectRoot}/stats`,
        name: 'Index Statistics',
        description: 'Statistics about the indexed codebase',
        mimeType: 'application/json',
      },
    ];

    // Add personality resource if enabled (v3.6+)
    if (this.personality.enabled !== false) {
      resources.unshift({
        uri: `uce://${this.projectRoot}/personality`,
        name: 'UCE System Instructions',
        description:
          '⚠️ IMPORTANT: Read this first! Contains auto-context rules and codebase interaction guidelines.',
        mimeType: 'text/markdown',
      });
    }

    return resources;
  }

  /**
   * Handle tool calls
   */
  async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    // Ensure index is ready
    await this.indexer.initialize();

    switch (name) {
      case 'uce_search':
        return this.handleSearch(args);

      case 'uce_get_context':
        return this.handleGetContext(args);

      case 'uce_find_usages':
        return this.handleFindUsages(args);

      case 'uce_get_dependencies':
        return this.handleGetDependencies(args);

      case 'uce_get_file_symbols':
        return this.handleGetFileSymbols(args);

      case 'uce_get_project_structure':
        return this.handleGetProjectStructure(args);

      case 'uce_refresh_index':
        return this.handleRefreshIndex(args);

      case 'uce_find_related':
        return this.handleFindRelated(args);

      case 'uce_get_callers':
        return this.handleGetCallers(args);

      case 'uce_get_inheritance':
        return this.handleGetInheritance(args);

      case 'uce_hybrid_search':
        return this.handleHybridSearch(args);

      case 'uce_watch_start':
        return this.handleWatchStart(args);

      case 'uce_watch_stop':
        return this.handleWatchStop();

      case 'uce_watch_status':
        return this.handleWatchStatus();

      case 'uce_export_graph':
        return this.handleExportGraph(args);

      case 'uce_graph_stats':
        return this.handleGraphStats();

      case 'uce_health':
        return this.handleHealth();

      case 'uce_ask':
        return this.handleAsk(args);

      case 'uce_analyze_complexity':
        return this.handleAnalyzeComplexity(args);

      case 'uce_detect_smells':
        return this.handleDetectSmells(args);

      case 'uce_detect_patterns':
        return this.handleDetectPatterns(args);

      case 'uce_get_library_docs':
        return this.handleGetLibraryDocs(args);

      case 'uce_list_library_docs':
        return this.handleListLibraryDocs(args);

      case 'uce_search_library_api':
        return this.handleSearchLibraryApi(args);

      case 'uce_sequential_think':
        return this.handleSequentialThink(args);

      case 'uce_add_thought':
        return this.handleAddThought(args);

      case 'uce_finalize_thinking':
        return this.handleFinalizeThinking();

      // Memory tools (v4.0+)
      case 'uce_search_history':
        return this.handleSearchHistory(args);

      case 'uce_get_file_discussion':
        return this.handleGetFileDiscussion(args);

      case 'uce_get_session_summary':
        return this.handleGetSessionSummary(args);

      case 'uce_memory_stats':
        return this.handleMemoryStats();

      // Sharing tools (v4.0+)
      case 'uce_export_context':
        return this.handleExportContext(args);

      case 'uce_import_context':
        return this.handleImportContext(args);

      case 'uce_bundle_info':
        return this.handleBundleInfo(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Handle health check
   */
  private serverStartTime = Date.now();
  private queryCount = 0;

  private async handleHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    indexLoaded: boolean;
    indexAge: string | null;
    queryCount: number;
    memoryUsage: number;
    fileCount: number;
    symbolCount: number;
  }> {
    this.queryCount++;

    const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const uptimeSeconds = Math.round((Date.now() - this.serverStartTime) / 1000);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let indexLoaded = false;
    let indexAge: string | null = null;
    let fileCount = 0;
    let symbolCount = 0;

    try {
      const index = await this.indexer.index();
      indexLoaded = true;
      fileCount = index.stats?.totalFiles || 0;
      symbolCount = index.stats?.totalSymbols || 0;
      indexAge = index.updatedAt || index.createdAt || null;

      // Check if index is stale (older than 1 hour)
      if (indexAge) {
        const ageMs = Date.now() - new Date(indexAge).getTime();
        if (ageMs > 3600000) {
          status = 'degraded';
        }
      }
    } catch {
      status = 'unhealthy';
      indexLoaded = false;
    }

    return {
      status,
      uptime: uptimeSeconds,
      indexLoaded,
      indexAge,
      queryCount: this.queryCount,
      memoryUsage: memoryMB,
      fileCount,
      symbolCount,
    };
  }

  /**
   * Handle resource reads
   */
  async handleResourceRead(uri: string): Promise<{ contents: string; mimeType: string }> {
    await this.indexer.initialize();
    const index = await this.indexer.index();

    if (uri.endsWith('/index')) {
      return {
        contents: JSON.stringify(
          {
            version: index.version,
            name: index.name,
            files: Array.from(index.files.keys()),
            stats: index.stats,
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }

    if (uri.endsWith('/stats')) {
      return {
        contents: JSON.stringify(index.stats, null, 2),
        mimeType: 'application/json',
      };
    }

    // Personality resource (v3.6+)
    if (uri.endsWith('/personality')) {
      return {
        contents: getPersonalityMarkdown(this.personality),
        mimeType: 'text/markdown',
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  }

  // ============================================================================
  // TOOL HANDLERS
  // ============================================================================

  private async handleSearch(args: Record<string, unknown>): Promise<{
    results: Array<{
      name: string;
      kind: string;
      file: string;
      line: number;
      exported: boolean;
      signature?: string;
      documentation?: string;
    }>;
    total: number;
  }> {
    const query = args.query as string;
    const kinds = args.kinds as string[] | undefined;
    const limit = (args.limit as number) || 20;

    const symbols = this.indexer.searchSymbols(query, { limit, kinds });
    const index = this.indexer.getIndex();

    const results = symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      file: this.findSymbolFile(s, index),
      line: s.line,
      exported: s.exported,
      signature: s.signature,
      documentation: s.documentation,
    }));

    return { results, total: results.length };
  }

  private async handleGetContext(args: Record<string, unknown>): Promise<{
    context: string;
    chunks: Array<{ file: string; startLine: number; endLine: number; content: string }>;
    tokenCount: number;
  }> {
    const task = args.task as string;
    const maxTokens = (args.maxTokens as number) || 8000;
    const files = args.files as string[] | undefined;

    await this.indexer.index();
    const allChunks = this.indexer.getAllChunks();

    // Filter by files if specified
    let chunks = files
      ? allChunks.filter((c) => files.some((f) => c.filePath.includes(f)))
      : allChunks;

    // Simple relevance scoring (in production, use embeddings)
    const taskLower = task.toLowerCase();
    const taskWords = taskLower.split(/\s+/);

    const scoredChunks = chunks.map((chunk) => {
      let score = 0;
      const contentLower = chunk.content.toLowerCase();

      // Score by word matches
      for (const word of taskWords) {
        if (contentLower.includes(word)) score += 1;
        if (chunk.primarySymbol?.toLowerCase().includes(word)) score += 3;
      }

      // Boost exported symbols
      if (chunk.metadata.hasExports) score += 1;

      return { chunk, score };
    });

    // Sort by score and take until we hit token limit
    scoredChunks.sort((a, b) => b.score - a.score);

    const selectedChunks: SemanticChunk[] = [];
    let totalTokens = 0;

    for (const { chunk } of scoredChunks) {
      if (totalTokens + chunk.tokenCount > maxTokens) break;
      selectedChunks.push(chunk);
      totalTokens += chunk.tokenCount;
    }

    // Build context string
    const contextParts = selectedChunks.map(
      (c) => `// File: ${c.filePath}:${c.startLine}-${c.endLine}\n${c.content}`
    );
    const context = contextParts.join('\n\n');

    return {
      context,
      chunks: selectedChunks.map((c) => ({
        file: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        content: c.content,
      })),
      tokenCount: totalTokens,
    };
  }

  private async handleFindUsages(args: Record<string, unknown>): Promise<{
    usages: Array<{
      file: string;
      line: number;
      column: number;
      context: string;
      caller?: string;
    }>;
    total: number;
  }> {
    const symbol = args.symbol as string;
    const file = args.file as string | undefined;

    await this.indexer.index();
    const index = this.indexer.getIndex();
    if (!index) return { usages: [], total: 0 };

    const usages: Array<{
      file: string;
      line: number;
      column: number;
      context: string;
      caller?: string;
    }> = [];

    for (const [filePath, fileIndex] of index.files) {
      if (file && !filePath.includes(file)) continue;

      for (const call of fileIndex.calls) {
        if (call.callee === symbol || call.callee.endsWith(`.${symbol}`)) {
          usages.push({
            file: filePath,
            line: call.line,
            column: call.column,
            context: `${call.receiver ? `${call.receiver}.` : ''}${call.callee}(...)`,
            caller: call.caller,
          });
        }
      }
    }

    return { usages, total: usages.length };
  }

  private async handleGetDependencies(args: Record<string, unknown>): Promise<{
    file: string;
    imports: string[];
    importedBy: string[];
  }> {
    const file = args.file as string;
    const direction = (args.direction as string) || 'both';

    await this.indexer.index();

    const imports = direction !== 'importedBy' ? this.indexer.getDependencies(file) : [];
    const importedBy = direction !== 'imports' ? this.indexer.getDependents(file) : [];

    return { file, imports, importedBy };
  }

  private async handleGetFileSymbols(args: Record<string, unknown>): Promise<{
    file: string;
    symbols: Array<{
      name: string;
      kind: string;
      line: number;
      exported: boolean;
      signature?: string;
      documentation?: string;
      parent?: string;
    }>;
  }> {
    const file = args.file as string;
    const includePrivate = (args.includePrivate as boolean) || false;

    await this.indexer.index();
    const index = this.indexer.getIndex();
    if (!index) return { file, symbols: [] };

    const fileIndex = index.files.get(file);
    if (!fileIndex) return { file, symbols: [] };

    let symbols = fileIndex.symbols;
    if (!includePrivate) {
      symbols = symbols.filter((s) => s.exported || s.visibility === 'public');
    }

    return {
      file,
      symbols: symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        line: s.line,
        exported: s.exported,
        signature: s.signature,
        documentation: s.documentation,
        parent: s.parent,
      })),
    };
  }

  private async handleGetProjectStructure(_args: Record<string, unknown>): Promise<{
    name: string;
    root: string;
    stats: {
      totalFiles: number;
      totalSymbols: number;
      byLanguage: Record<string, { files: number; symbols: number }>;
    };
    entryPoints: string[];
    keyFiles: string[];
  }> {
    // TODO: implement depth-limited tree using args.depth

    await this.indexer.index();
    const index = this.indexer.getIndex();
    if (!index)
      return {
        name: '',
        root: this.projectRoot,
        stats: { totalFiles: 0, totalSymbols: 0, byLanguage: {} },
        entryPoints: [],
        keyFiles: [],
      };

    // Find key files (most imported, most symbols)
    const fileScores: Array<{ file: string; score: number }> = [];
    for (const [filePath, fileIndex] of index.files) {
      const importedByCount = fileIndex.metadata.importedBy.length;
      const symbolCount = fileIndex.symbols.filter((s) => s.exported).length;
      fileScores.push({
        file: filePath,
        score: importedByCount * 2 + symbolCount,
      });
    }
    fileScores.sort((a, b) => b.score - a.score);

    // Find entry points
    const entryPoints = Array.from(index.files.keys()).filter(
      (f) => f.includes('index.') || f.includes('main.') || f.includes('app.')
    );

    return {
      name: index.name,
      root: index.root,
      stats: index.stats,
      entryPoints: entryPoints.slice(0, 10),
      keyFiles: fileScores.slice(0, 20).map((f) => f.file),
    };
  }

  private async handleRefreshIndex(args: Record<string, unknown>): Promise<{
    success: boolean;
    generation: number;
    duration: number;
    changes: {
      added: number;
      modified: number;
      removed: number;
    };
  }> {
    const files = args.files as string[] | undefined;

    const startTime = performance.now();

    if (files && files.length > 0) {
      const result = await this.indexer.updateFiles(files);
      return {
        success: true,
        generation: result.generation,
        duration: result.duration,
        changes: {
          added: result.added.length,
          modified: result.modified.length,
          removed: result.removed.length,
        },
      };
    }

    const index = await this.indexer.index();
    return {
      success: true,
      generation: index.generation,
      duration: performance.now() - startTime,
      changes: { added: 0, modified: 0, removed: 0 },
    };
  }

  private async handleFindRelated(args: Record<string, unknown>): Promise<{
    symbol: string;
    related: Array<{
      name: string;
      type: string;
      relation: string;
      file?: string;
      line?: number;
    }>;
    paths: string[][];
  }> {
    const symbol = args.symbol as string;
    const depth = (args.depth as number) || 2;
    const relations = args.relations as string[] | undefined;

    const graph = await this.ensureGraph();

    // Find the node for this symbol
    const nodes = graph.findNodes({ name: symbol });
    if (nodes.length === 0) {
      return { symbol, related: [], paths: [] };
    }

    const edgeTypes = relations?.map((r) => r as EdgeType);
    const result = graph.findRelated(nodes[0].id, {
      maxDepth: depth,
      edgeTypes,
    });

    // Build related list excluding the starting node
    const related = result.nodes
      .filter((n) => n.id !== nodes[0].id)
      .map((n) => {
        // Find the relationship type
        const edge = result.edges.find((e) => e.target === n.id || e.source === n.id);
        return {
          name: n.name,
          type: n.type,
          relation: edge?.type || 'related',
          file: n.filePath,
          line: n.line,
        };
      });

    return { symbol, related, paths: result.paths };
  }

  private async handleGetCallers(args: Record<string, unknown>): Promise<{
    function: string;
    callers: Array<{
      name: string;
      type: string;
      file?: string;
      line?: number;
    }>;
  }> {
    const func = args.function as string;

    const graph = await this.ensureGraph();

    // Find the function node
    const nodes = graph.findNodes({ name: func });
    if (nodes.length === 0) {
      return { function: func, callers: [] };
    }

    const callers = graph.getCallers(nodes[0].id);

    return {
      function: func,
      callers: callers.map((c) => ({
        name: c.name,
        type: c.type,
        file: c.filePath,
        line: c.line,
      })),
    };
  }

  private async handleGetInheritance(args: Record<string, unknown>): Promise<{
    class: string;
    parents: Array<{ name: string; type: string; file?: string }>;
    children: Array<{ name: string; type: string; file?: string }>;
  }> {
    const className = args.class as string;
    const direction = (args.direction as string) || 'both';

    const graph = await this.ensureGraph();

    // Find the class node
    const nodes = graph.findNodes({ name: className });
    if (nodes.length === 0) {
      return { class: className, parents: [], children: [] };
    }

    const parents =
      direction !== 'children'
        ? graph.getInheritanceChain(nodes[0].id, 'up').map((n) => ({
            name: n.name,
            type: n.type,
            file: n.filePath,
          }))
        : [];

    const children =
      direction !== 'parents'
        ? graph.getInheritanceChain(nodes[0].id, 'down').map((n) => ({
            name: n.name,
            type: n.type,
            file: n.filePath,
          }))
        : [];

    return { class: className, parents, children };
  }

  private async handleHybridSearch(args: Record<string, unknown>): Promise<{
    query: string;
    results: Array<{
      id: string;
      file: string;
      score: number;
      content: string;
      symbols: string[];
    }>;
  }> {
    const query = args.query as string;
    const maxResults = (args.maxResults as number) || 10;
    const files = args.files as string[] | undefined;

    const bm25 = await this.ensureBM25();

    // Sparse search with BM25
    let results = bm25.search(query, maxResults * 2); // Over-fetch to filter

    // Filter by files if specified
    if (files && files.length > 0) {
      results = results.filter((r) => {
        const filePath = r.document.metadata?.filePath as string | undefined;
        return filePath && files.some((f) => filePath.includes(f));
      });
    }

    // Take top results
    results = results.slice(0, maxResults);

    return {
      query,
      results: results.map((r) => ({
        id: r.document.id,
        file: (r.document.metadata?.filePath as string) || 'unknown',
        score: r.score,
        content: r.document.content.substring(0, 500) + (r.document.content.length > 500 ? '...' : ''),
        symbols: (r.document.metadata?.symbols as string[]) || [],
      })),
    };
  }

  private async handleWatchStart(args: Record<string, unknown>): Promise<{
    success: boolean;
    message: string;
    watching: boolean;
  }> {
    // Stop existing watcher if running
    if (this.watcher) {
      this.watcher.stop();
    }

    const ignore = args.ignore as string[] | undefined;

    // Create new watcher
    this.watcher = new FileWatcher(this.indexer, {
      ignore: ignore || ['node_modules', '.git', 'dist', 'build', '.uce'],
      debounceMs: 300,
      initialIndex: false, // Already indexed
    });

    // Set up event handlers to invalidate caches
    this.watcher.on('indexed', () => {
      // Invalidate graph and BM25 when files change
      this.graph = null;
      this.bm25 = null;
    });

    // Start watching
    await this.watcher.start(this.projectRoot);

    return {
      success: true,
      message: `Now watching ${this.projectRoot} for changes`,
      watching: true,
    };
  }

  private async handleWatchStop(): Promise<{
    success: boolean;
    message: string;
    watching: boolean;
  }> {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }

    return {
      success: true,
      message: 'Watch mode stopped',
      watching: false,
    };
  }

  private async handleWatchStatus(): Promise<{
    watching: boolean;
    stats: {
      filesWatched: number;
      changesProcessed: number;
      lastChangeAt: string | null;
      uptime: number;
    } | null;
  }> {
    if (!this.watcher) {
      return {
        watching: false,
        stats: null,
      };
    }

    const stats = this.watcher.getStats();
    return {
      watching: stats.isWatching,
      stats: {
        filesWatched: stats.filesWatched,
        changesProcessed: stats.changesProcessed,
        lastChangeAt: stats.lastChangeAt,
        uptime: stats.uptime,
      },
    };
  }

  private async handleExportGraph(args: Record<string, unknown>): Promise<{
    format: string;
    content: string;
    nodeCount: number;
    edgeCount: number;
  }> {
    const format = (args.format as string) || 'json';
    const symbol = args.symbol as string | undefined;
    const depth = (args.depth as number) || 3;

    const graph = await this.ensureGraph();

    let nodes = [...graph.findNodes({})];
    let edges: Array<{ source: string; target: string; type: string }> = [];

    // If centered on a symbol, get related nodes only
    if (symbol) {
      const centerNodes = graph.findNodes({ name: symbol });
      if (centerNodes.length > 0) {
        const result = graph.findRelated(centerNodes[0].id, { maxDepth: depth });
        nodes = result.nodes;
        edges = result.edges.map((e) => ({
          source: e.source,
          target: e.target,
          type: e.type,
        }));
      }
    } else {
      // Get all edges
      const allEdges = JSON.parse(graph.toJSON()).edges;
      edges = allEdges.map((e: { source: string; target: string; type: string }) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      }));
    }

    let content: string;

    switch (format) {
      case 'dot':
        content = this.graphToDot(nodes, edges);
        break;
      case 'mermaid':
        content = this.graphToMermaid(nodes, edges);
        break;
      case 'json':
      default:
        content = JSON.stringify({ nodes, edges }, null, 2);
        break;
    }

    return {
      format,
      content,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  }

  private async handleGraphStats(): Promise<{
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
    topConnected: Array<{ name: string; connections: number }>;
  }> {
    const graph = await this.ensureGraph();
    const stats = graph.getStats();

    // Find most connected nodes
    const nodes = graph.findNodes({});
    const connectionCounts = nodes.map((node) => {
      const related = graph.findRelated(node.id, { maxDepth: 1 });
      return { name: node.name, connections: related.edges.length };
    });
    connectionCounts.sort((a, b) => b.connections - a.connections);

    return {
      nodeCount: stats.nodeCount,
      edgeCount: stats.edgeCount,
      nodesByType: stats.nodesByType,
      edgesByType: stats.edgesByType,
      topConnected: connectionCounts.slice(0, 10),
    };
  }

  private async handleAsk(args: Record<string, unknown>): Promise<QAResult> {
    const question = args.question as string;
    const maxContextTokens = (args.maxContextTokens as number) || 4000;
    const maxResponseTokens = (args.maxResponseTokens as number) || 2000;
    const provider = (args.provider as 'anthropic' | 'openai') || 'anthropic';
    const model = args.model as string | undefined;
    const temperature = (args.temperature as number) || 0.3;

    // 1. Get relevant context using hybrid search
    const contextResult = await this.handleGetContext({
      task: question,
      maxTokens: maxContextTokens,
    });

    // 2. Initialize QA engine
    const qaEngine = this.ensureQAEngine({
      provider,
      model,
      maxContextTokens,
      maxResponseTokens,
      temperature,
    });

    // 3. Ask the question
    return qaEngine.ask(question, contextResult.context);
  }

  private async handleAnalyzeComplexity(
    args: Record<string, unknown>
  ): Promise<ProjectComplexity> {
    await this.indexer.initialize();
    await this.indexer.index();

    const filesFilter = args.files as string[] | undefined;
    const thresholds = args.thresholds as
      | { low?: number; medium?: number; high?: number }
      | undefined;

    // Create analyzer with custom thresholds if provided
    const analyzer = new ComplexityAnalyzer(thresholds);

    // Get all parsed files from index
    const allFiles = this.convertIndexToParsedFiles();
    const filesToAnalyze = filesFilter
      ? allFiles.filter((f) => filesFilter.some((pattern) => f.path.includes(pattern)))
      : allFiles;

    // Analyze complexity
    return analyzer.analyzeProject(filesToAnalyze);
  }

  private async handleDetectSmells(args: Record<string, unknown>): Promise<ProjectSmellReport> {
    await this.indexer.initialize();
    await this.indexer.index();

    const filesFilter = args.files as string[] | undefined;
    const severityFilter = args.severityFilter as 'low' | 'medium' | 'high' | 'critical' | undefined;
    const thresholds = args.thresholds as
      | {
          longMethodLines?: number;
          longParameterCount?: number;
          godClassMethods?: number;
          deepNestingLevel?: number;
        }
      | undefined;

    // Create detector with custom thresholds if provided
    const detector = new CodeSmellsDetector(thresholds);

    // Get all parsed files from index
    const allFiles = this.convertIndexToParsedFiles();
    const filesToAnalyze = filesFilter
      ? allFiles.filter((f) => filesFilter.some((pattern) => f.path.includes(pattern)))
      : allFiles;

    // Detect smells
    const report = detector.analyzeProject(filesToAnalyze);

    // Filter by severity if requested
    if (severityFilter) {
      const severityLevels: Record<string, number> = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3,
      };
      const minLevel = severityLevels[severityFilter];

      for (const fileReport of report.files) {
        fileReport.smells = fileReport.smells.filter(
          (s) => severityLevels[s.severity] >= minLevel
        );
      }

      report.criticalIssues = report.criticalIssues.filter(
        (s) => severityLevels[s.severity] >= minLevel
      );
    }

    return report;
  }

  private async handleDetectPatterns(
    args: Record<string, unknown>
  ): Promise<PatternDetectionResult> {
    await this.indexer.initialize();
    await this.indexer.index();

    const categories = args.categories as
      | ('architectural' | 'design' | 'api' | 'security' | 'performance')[]
      | undefined;

    // Create pattern detector
    const detector = new PatternDetector();

    // Get all parsed files from index
    const allFiles = this.convertIndexToParsedFiles();

    // Detect patterns
    const result = detector.analyzeProject(allFiles);

    // Filter by categories if requested
    if (categories) {
      const categorySet = new Set(categories);

      if (!categorySet.has('design')) {
        result.designPatterns = [];
      }
      if (!categorySet.has('api')) {
        result.apiPatterns = [];
      }
      if (!categorySet.has('security')) {
        result.securityPatterns = [];
      }
      if (!categorySet.has('performance')) {
        result.performancePatterns = [];
      }
      if (!categorySet.has('architectural')) {
        result.architecture = undefined;
      }

      // Recalculate total
      result.totalPatterns =
        result.designPatterns.length +
        result.apiPatterns.length +
        result.securityPatterns.length +
        result.performancePatterns.length;
    }

    return result;
  }

  // ============================================================================
  // LIBRARY DOCS HANDLERS (v4.0+)
  // ============================================================================

  private async ensureDocsManager(): Promise<DocsManager> {
    if (!this.docsManager) {
      this.docsManager = new DocsManager({
        projectRoot: this.projectRoot,
        preferLocal: true,
        autoCleanup: true,
      });
      await this.docsManager.init();
    }
    return this.docsManager;
  }

  private async handleGetLibraryDocs(args: Record<string, unknown>): Promise<{
    success: boolean;
    docs: LibraryDocResult | null;
    error?: string;
  }> {
    const library = args.library as string;
    const version = args.version as string | undefined;
    const forceRefresh = (args.forceRefresh as boolean) || false;

    try {
      const manager = await this.ensureDocsManager();
      const docs = await manager.getDocs(library, {
        version,
        forceRefresh,
      });

      if (!docs) {
        return {
          success: false,
          docs: null,
          error: `Library "${library}" not found in node_modules`,
        };
      }

      return { success: true, docs };
    } catch (error) {
      return {
        success: false,
        docs: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async handleListLibraryDocs(args: Record<string, unknown>): Promise<{
    cached: Array<{ library: string; version: string; cachedAt: string }>;
    available: string[];
  }> {
    const cachedOnly = args.cached as boolean | undefined;

    const manager = await this.ensureDocsManager();

    const cached = await manager.listCached();
    const available = cachedOnly ? [] : manager.listAvailable();

    return { cached, available };
  }

  private async handleSearchLibraryApi(args: Record<string, unknown>): Promise<{
    query: string;
    results: Array<{
      library: string;
      entry: {
        name: string;
        type: string;
        signature?: string;
        description?: string;
      };
    }>;
  }> {
    const query = args.query as string;
    const types = args.types as string[] | undefined;
    const maxResults = (args.maxResults as number) || 20;

    const manager = await this.ensureDocsManager();
    const results = await manager.searchAPI(query, { maxResults, types });

    return { query, results };
  }

  // ============================================================================
  // SEQUENTIAL THINKING HANDLERS (v4.0+)
  // ============================================================================

  private async handleSequentialThink(args: Record<string, unknown>): Promise<{
    sessionStarted: boolean;
    problem: string;
    suggestedNextType: string;
    maxThoughts: number;
  }> {
    const problem = args.problem as string;
    const maxThoughts = (args.maxThoughts as number) || 10;
    const allowRevision = (args.allowRevision as boolean) ?? true;
    const allowBranching = (args.allowBranching as boolean) ?? false;
    const style = (args.style as 'analytical' | 'exploratory' | 'focused') || 'analytical';

    // Create new thinker for this session
    this.thinker = new SequentialThinker({
      maxThoughts,
      allowRevision,
      allowBranching,
      style,
      autoRetrieveContext: true,
      maxContextTokens: 2000,
    });

    // Set up context retriever
    this.thinker.setContextRetriever(async (query: string, tokens: number) => {
      const contextResult = await this.handleGetContext({ task: query, maxTokens: tokens });
      return {
        files: contextResult.chunks.map((c) => c.file),
        symbols: [],
        chunkIds: contextResult.chunks.map((_, i) => `chunk-${i}`),
      };
    });

    await this.thinker.start(problem);

    return {
      sessionStarted: true,
      problem,
      suggestedNextType: this.thinker.suggestNextType(),
      maxThoughts,
    };
  }

  private async handleAddThought(args: Record<string, unknown>): Promise<{
    thoughtAdded: boolean;
    thoughtNumber: number;
    suggestedNextType: string;
    shouldContinue: boolean;
    needsRevision: { needed: boolean; targetThought?: number; reason?: string };
  }> {
    if (!this.thinker) {
      throw new Error('No thinking session active. Call uce_sequential_think first.');
    }

    const content = args.content as string;
    const type = args.type as ThoughtType;
    const confidence = (args.confidence as number) || 0.5;
    const revisesThought = args.revisesThought as number | undefined;
    const branchFromThought = args.branchFromThought as number | undefined;
    const branchId = args.branchId as string | undefined;

    const thought = await this.thinker.addThought({
      content,
      type,
      confidence,
      revisesThought,
      branchFromThought,
      branchId,
    });

    return {
      thoughtAdded: true,
      thoughtNumber: thought.number,
      suggestedNextType: this.thinker.suggestNextType(),
      shouldContinue: this.thinker.shouldContinue(),
      needsRevision: this.thinker.needsRevision(),
    };
  }

  private async handleFinalizeThinking(): Promise<ThinkingResult> {
    if (!this.thinker) {
      throw new Error('No thinking session active. Call uce_sequential_think first.');
    }

    const result = this.thinker.finalize();

    // Clear the thinker for next session
    this.thinker = null;

    return result;
  }

  private graphToDot(
    nodes: Array<{ id: string; name: string; type: string }>,
    edges: Array<{ source: string; target: string; type: string }>
  ): string {
    const nodeColors: Record<string, string> = {
      class: '#4ecdc4',
      function: '#45b7d1',
      method: '#96ceb4',
      interface: '#ffeaa7',
      type: '#dfe6e9',
      file: '#fab1a0',
      module: '#a29bfe',
    };

    let dot = 'digraph KnowledgeGraph {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style=filled];\n\n';

    for (const node of nodes) {
      const color = nodeColors[node.type] || '#ffffff';
      const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
      dot += `  ${safeId} [label="${node.name}\\n(${node.type})", fillcolor="${color}"];\n`;
    }

    dot += '\n';

    for (const edge of edges) {
      const safeSource = edge.source.replace(/[^a-zA-Z0-9]/g, '_');
      const safeTarget = edge.target.replace(/[^a-zA-Z0-9]/g, '_');
      dot += `  ${safeSource} -> ${safeTarget} [label="${edge.type}"];\n`;
    }

    dot += '}\n';
    return dot;
  }

  private graphToMermaid(
    nodes: Array<{ id: string; name: string; type: string }>,
    edges: Array<{ source: string; target: string; type: string }>
  ): string {
    let mermaid = 'graph LR\n';

    // Create safe IDs and collect them
    const idMap = new Map<string, string>();
    nodes.forEach((node, i) => {
      idMap.set(node.id, `n${i}`);
    });

    // Add nodes
    for (const node of nodes) {
      const safeId = idMap.get(node.id) || node.id;
      const shape = node.type === 'class' ? `[${node.name}]` : `(${node.name})`;
      mermaid += `  ${safeId}${shape}\n`;
    }

    // Add edges
    for (const edge of edges) {
      const safeSource = idMap.get(edge.source) || edge.source;
      const safeTarget = idMap.get(edge.target) || edge.target;
      mermaid += `  ${safeSource} -->|${edge.type}| ${safeTarget}\n`;
    }

    return mermaid;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private findSymbolFile(symbol: Symbol, index: ReturnType<typeof this.indexer.getIndex>): string {
    if (!index) return 'unknown';

    for (const [filePath, fileIndex] of index.files) {
      if (fileIndex.symbols.some((s) => s.name === symbol.name && s.line === symbol.line)) {
        return filePath;
      }
    }

    return 'unknown';
  }

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  /**
   * Handle MCP JSON-RPC request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
              },
              serverInfo: {
                name: 'uce-context-engine',
                version: '3.6.0',
                // Auto-context personality instructions (v3.6+)
                instructions: getPersonalityInstructions(this.personality),
              },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: { tools: this.getTools() },
          };

        case 'tools/call':
          const toolName = (request.params?.name as string) || '';
          const toolArgs = (request.params?.arguments as Record<string, unknown>) || {};
          const result = await this.handleToolCall(toolName, toolArgs);
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
          };

        case 'resources/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: { resources: this.getResources() },
          };

        case 'resources/read':
          const uri = (request.params?.uri as string) || '';
          const resourceResult = await this.handleResourceRead(uri);
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: resourceResult.mimeType,
                  text: resourceResult.contents,
                },
              ],
            },
          };

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }

  private autoRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private autoRefreshMinutes: number = 5;

  /**
   * Start HTTP server for MCP with auto-indexing
   *
   * @param port - Port to listen on (default: 3333)
   * @param options - Auto-indexing options
   */
  async start(
    port: number = 3333,
    options?: {
      /** Auto-index on startup (default: true) */
      autoIndex?: boolean;
      /** Auto-watch for file changes (default: true) */
      autoWatch?: boolean;
      /** Auto-refresh interval in minutes (default: 5, 0 to disable) */
      autoRefreshMinutes?: number;
    }
  ): Promise<void> {
    const opts = {
      autoIndex: options?.autoIndex ?? true,
      autoWatch: options?.autoWatch ?? true,
      autoRefreshMinutes: options?.autoRefreshMinutes ?? 5,
    };

    // Auto-index on startup
    if (opts.autoIndex) {
      console.log('📇 Auto-indexing codebase...');
      await this.indexer.index();
      console.log('✅ Index ready');
    }

    // Auto-start file watcher
    if (opts.autoWatch) {
      console.log('👀 Starting file watcher...');
      await this.handleWatchStart({ ignore: ['node_modules', '.git', 'dist', '.uce'] });
    }

    // Set up periodic auto-refresh
    if (opts.autoRefreshMinutes > 0) {
      this.autoRefreshMinutes = opts.autoRefreshMinutes;
      this.autoRefreshInterval = setInterval(
        async () => {
          console.log('🔄 Auto-refreshing index...');
          // Invalidate caches to force fresh data
          this.graph = null;
          this.bm25 = null;
          await this.indexer.index();
        },
        this.autoRefreshMinutes * 60 * 1000
      );
    }

    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            try {
              const request = JSON.parse(body) as MCPRequest;
              const response = await this.handleRequest(request);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (error) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: null,
                  error: { code: -32700, message: 'Parse error' },
                })
              );
            }
          });
        } else {
          res.writeHead(405);
          res.end();
        }
      });

      this.server.listen(port, () => {
        console.log(`🚀 UCE MCP Server running on http://localhost:${port}`);
        console.log(`   Auto-refresh: every ${this.autoRefreshMinutes} minutes`);
        resolve();
      });
    });
  }

  /**
   * Start watching for file changes
   */
  startWatch(): void {
    this.handleWatchStart({ ignore: ['node_modules', '.git', 'dist', '.uce'] });
  }

  /**
   * Run the MCP server using stdio transport (stdin/stdout)
   * This is the transport used by Claude Code
   */
  async run(): Promise<void> {
    const readline = await import('readline');

    // Don't auto-index on startup - let it happen lazily on first tool call
    // This ensures fast startup for Claude Code connection

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Read line-delimited JSON-RPC from stdin
    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await this.handleRequest(request);
        // Write response to stdout
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: null as unknown as string,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : 'Unknown error',
          },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    // Handle close
    rl.on('close', () => {
      this.stop();
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }

  /**
   * Stop the server and cleanup
   */
  stop(): Promise<void> {
    // Stop auto-refresh interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    // Stop file watcher
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Convert project index to ParsedFile[] format for analytics
   */
  private convertIndexToParsedFiles(): import('../parser/types.js').ParsedFile[] {
    const index = this.indexer.getIndex();
    const parsedFiles: import('../parser/types.js').ParsedFile[] = [];

    if (!index || !index.files) {
      return parsedFiles;
    }

    for (const [filePath, fileIndex] of Object.entries(index.files)) {
      // Read file content (if available)
      let content = '';
      try {
        const fullPath = require('path').join(this.projectRoot, filePath);
        content = require('fs').readFileSync(fullPath, 'utf-8');
      } catch {
        // Skip files that can't be read
        continue;
      }

      // Extract functions from symbols
      const functions = fileIndex.symbols
        .filter((s: Symbol) => s.kind === 'function' || s.kind === 'method')
        .map((s: Symbol) => ({
          name: s.name,
          startLine: s.line,
          endLine: s.endLine,
          parameters: s.parameters,
          returnType: s.returnType,
          async: s.async,
          exported: s.exported,
        }));

      // Extract classes from symbols
      const classSymbols = fileIndex.symbols.filter((s: Symbol) => s.kind === 'class');
      const classes = classSymbols.map((cls: Symbol) => ({
        name: cls.name,
        startLine: cls.line,
        endLine: cls.endLine,
        methods: fileIndex.symbols
          .filter((s: Symbol) => s.kind === 'method' && s.parent === cls.name)
          .map((m: Symbol) => ({
            name: m.name,
            startLine: m.line,
            endLine: m.endLine,
            parameters: m.parameters,
            returnType: m.returnType,
            async: m.async,
            exported: m.exported,
          })),
        properties: fileIndex.symbols.filter((s: Symbol) => s.kind === 'property' && s.parent === cls.name),
        extends: cls.extends,
        implements: cls.implements,
        exported: cls.exported,
      }));

      parsedFiles.push({
        path: filePath,
        content,
        language: fileIndex.metadata.language,
        functions,
        classes,
        symbols: fileIndex.symbols,
        imports: fileIndex.imports,
        exports: fileIndex.exports,
      });
    }

    return parsedFiles;
  }

  // ============================================================================
  // Memory Handlers (v4.0+)
  // ============================================================================

  private async handleSearchHistory(args: Record<string, unknown>): Promise<{
    results: Array<{
      question: string;
      response: string;
      timestamp: string;
      filesReferenced: string[];
      score: number;
    }>;
    totalMatches: number;
  }> {
    const query = args.query as string;
    const files = args.files as string[] | undefined;
    const symbols = args.symbols as string[] | undefined;
    const limit = (args.limit as number) || 20;

    const memory = await this.ensureMemory();
    const result = await memory.search(query, {
      files,
      symbols,
      limit,
    });

    return {
      results: result.queries.map((q) => ({
        question: q.question,
        response: q.response.slice(0, 500) + (q.response.length > 500 ? '...' : ''),
        timestamp: q.timestamp,
        filesReferenced: q.filesReferenced,
        score: result.scores.get(q.id) || 0,
      })),
      totalMatches: result.totalMatches,
    };
  }

  private async handleGetFileDiscussion(args: Record<string, unknown>): Promise<{
    file: string;
    discussions: Array<{
      question: string;
      response: string;
      timestamp: string;
    }>;
    totalDiscussions: number;
  }> {
    const file = args.file as string;

    const memory = await this.ensureMemory();
    const queries = await memory.getFileHistory(file);

    return {
      file,
      discussions: queries.map((q) => ({
        question: q.question,
        response: q.response.slice(0, 500) + (q.response.length > 500 ? '...' : ''),
        timestamp: q.timestamp,
      })),
      totalDiscussions: queries.length,
    };
  }

  private async handleGetSessionSummary(args: Record<string, unknown>): Promise<{
    sessionId: string;
    topics: string[];
    keyFindings: string[];
    filesMentioned: string[];
    symbolsMentioned: string[];
    queryCount: number;
  }> {
    const sessionId = args.sessionId as string | undefined;

    const memory = await this.ensureMemory();

    if (sessionId) {
      const summary = await memory.summarizeSession(sessionId);
      return {
        sessionId,
        topics: summary.topics,
        keyFindings: summary.keyFindings,
        filesMentioned: summary.filesMentioned,
        symbolsMentioned: summary.symbolsMentioned,
        queryCount: summary.queryCount,
      };
    }

    // Get current session summary
    const session = memory.getCurrentSession();
    const summary = await memory.summarizeSession(session.id);

    return {
      sessionId: session.id,
      topics: summary.topics,
      keyFindings: summary.keyFindings,
      filesMentioned: summary.filesMentioned,
      symbolsMentioned: summary.symbolsMentioned,
      queryCount: summary.queryCount,
    };
  }

  private async handleMemoryStats(): Promise<MemoryStats> {
    const memory = await this.ensureMemory();
    return memory.getStats();
  }

  // ============================================================================
  // Sharing Handlers (v4.0+)
  // ============================================================================

  private async handleExportContext(args: Record<string, unknown>): Promise<{
    success: boolean;
    outputPath: string;
    bundle: BundleInfo;
  }> {
    const outputPath = args.outputPath as string;
    const components = args.components as string[] | undefined;
    const compress = args.compress !== false;
    const anonymize = args.anonymize === true;

    const exporter = this.ensureExporter();
    const bundle = await exporter.export(outputPath, {
      include: components as BundleComponentType[] | undefined,
      compress,
      privacy: {
        anonymizeSymbols: anonymize,
        excludePatterns: [],
        stripComments: false,
        excludeMemory: false,
        excludeFiles: [],
      },
    });

    return {
      success: true,
      outputPath,
      bundle,
    };
  }

  private async handleImportContext(args: Record<string, unknown>): Promise<{
    success: boolean;
    filesImported: number;
    symbolsImported: number;
    components: string[];
    conflicts: Array<{ component: string; description: string }>;
    dryRun: boolean;
  }> {
    const bundlePath = args.bundlePath as string;
    const merge = args.merge === true;
    const dryRun = args.dryRun === true;

    const importer = this.ensureImporter();
    const result = await importer.import(bundlePath, {
      merge,
      dryRun,
    });

    return {
      success: result.success,
      filesImported: result.filesImported,
      symbolsImported: result.symbolsImported,
      components: result.importedComponents,
      conflicts: result.conflicts.map((c) => ({
        component: c.component,
        description: c.description,
      })),
      dryRun,
    };
  }

  private async handleBundleInfo(args: Record<string, unknown>): Promise<BundleInfo | null> {
    const bundlePath = args.bundlePath as string;

    const importer = this.ensureImporter();
    return importer.preview(bundlePath);
  }
}

// Alias for backward compatibility with CLI
export { MCPServer as UCEServer };
export default MCPServer;

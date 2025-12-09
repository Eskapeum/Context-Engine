/**
 * Universal Context Engine - Graph Builder
 *
 * Builds a knowledge graph from parsed code files.
 * Extracts symbols, relationships, and call graphs.
 *
 * @module graph/graph-builder
 */

import { KnowledgeGraph, type NodeType } from './knowledge-graph.js';
import type { Symbol, Import, Export, CallReference, ParseResult } from '../parser/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GraphBuilderConfig {
  /** Include call graph edges */
  includeCallGraph?: boolean;
  /** Include type references */
  includeTypeRefs?: boolean;
  /** Include file-level nodes */
  includeFiles?: boolean;
}

// ============================================================================
// GRAPH BUILDER
// ============================================================================

/**
 * Builds a knowledge graph from parsed code
 *
 * @example
 * ```ts
 * const builder = new GraphBuilder();
 *
 * for (const parseResult of parseResults) {
 *   builder.addFile(parseResult);
 * }
 *
 * const graph = builder.getGraph();
 * const related = graph.findRelated('UserService');
 * ```
 */
export class GraphBuilder {
  private graph: KnowledgeGraph;
  private config: Required<GraphBuilderConfig>;
  private symbolToNode: Map<string, string> = new Map(); // symbol name -> node id

  constructor(graphOrConfig?: KnowledgeGraph | GraphBuilderConfig, config?: GraphBuilderConfig) {
    // Support both constructor signatures:
    // new GraphBuilder() - create new graph
    // new GraphBuilder(config) - create new graph with config
    // new GraphBuilder(graph) - use existing graph
    // new GraphBuilder(graph, config) - use existing graph with config
    if (graphOrConfig instanceof KnowledgeGraph) {
      this.graph = graphOrConfig;
      this.config = {
        includeCallGraph: config?.includeCallGraph ?? true,
        includeTypeRefs: config?.includeTypeRefs ?? true,
        includeFiles: config?.includeFiles ?? true,
      };
    } else {
      this.graph = new KnowledgeGraph();
      this.config = {
        includeCallGraph: graphOrConfig?.includeCallGraph ?? true,
        includeTypeRefs: graphOrConfig?.includeTypeRefs ?? true,
        includeFiles: graphOrConfig?.includeFiles ?? true,
      };
    }
  }

  /**
   * Add a parsed file to the graph
   */
  addFile(parseResult: ParseResult): void {
    const { filePath, symbols, imports, exports, calls, typeReferences } = parseResult;

    // Add file node
    if (this.config.includeFiles) {
      const fileNodeId = this.createNodeId('file', filePath);
      this.graph.addNode({
        id: fileNodeId,
        type: 'file',
        name: filePath.split('/').pop() || filePath,
        filePath,
      });
    }

    // Add symbol nodes
    for (const symbol of symbols) {
      this.addSymbol(symbol, filePath);
    }

    // Add import edges
    for (const imp of imports) {
      this.addImport(imp, filePath);
    }

    // Add export edges
    for (const exp of exports) {
      this.addExport(exp, filePath);
    }

    // Add call edges
    if (this.config.includeCallGraph && calls) {
      for (const call of calls) {
        this.addCall(call, filePath);
      }
    }

    // Add type reference edges
    if (this.config.includeTypeRefs && typeReferences) {
      for (const typeRef of typeReferences) {
        this.addTypeReference(typeRef, filePath);
      }
    }
  }

  /**
   * Get the built graph
   */
  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  /**
   * Clear and start fresh
   */
  clear(): void {
    this.graph.clear();
    this.symbolToNode.clear();
  }

  /**
   * Build graph from a project index
   */
  buildFromIndex(index: {
    files: Map<string, { symbols: Symbol[]; imports?: Import[]; exports?: Export[]; calls?: CallReference[]; metadata: { language: string } }> | Record<string, { symbols: Symbol[]; imports?: Import[]; exports?: Export[]; calls?: CallReference[]; metadata: { language: string } }>;
  }): void {
    // Convert to Map if it's a plain object
    const filesMap = index.files instanceof Map ? index.files : new Map(Object.entries(index.files));

    for (const [filePath, fileIndex] of filesMap) {
      this.addFile({
        filePath,
        language: fileIndex.metadata.language,
        success: true,
        symbols: fileIndex.symbols,
        imports: fileIndex.imports || [],
        exports: fileIndex.exports || [],
        calls: fileIndex.calls || [],
        typeReferences: [],
        chunks: [],
        parseTime: 0,
      });
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private addSymbol(symbol: Symbol, filePath: string): void {
    const nodeId = this.createNodeId(symbol.kind, symbol.name, filePath, symbol.line);
    const nodeType = this.symbolKindToNodeType(symbol.kind);

    this.graph.addNode({
      id: nodeId,
      type: nodeType,
      name: symbol.name,
      filePath,
      line: symbol.line,
      exported: symbol.exported,
      documentation: symbol.documentation,
      metadata: {
        async: symbol.async,
        static: symbol.static,
        visibility: symbol.visibility,
        parameters: symbol.parameters,
        returnType: symbol.returnType,
      },
    });

    // Track symbol name to node mapping
    this.symbolToNode.set(`${filePath}:${symbol.name}`, nodeId);
    // Also track by just name for cross-file references
    if (!this.symbolToNode.has(symbol.name)) {
      this.symbolToNode.set(symbol.name, nodeId);
    }

    // Add file -> symbol edge
    if (this.config.includeFiles) {
      const fileNodeId = this.createNodeId('file', filePath);
      this.graph.addEdge({
        source: fileNodeId,
        target: nodeId,
        type: 'defines',
      });
    }

    // Add parent -> child edge (class -> method)
    if (symbol.parent) {
      const parentNodeId = this.symbolToNode.get(`${filePath}:${symbol.parent}`);
      if (parentNodeId) {
        this.graph.addEdge({
          source: parentNodeId,
          target: nodeId,
          type: 'contains',
        });
      }
    }

    // Add inheritance edges
    if (symbol.extends) {
      for (const parent of symbol.extends) {
        const parentNodeId = this.findOrCreateSymbolNode(parent, filePath);
        this.graph.addEdge({
          source: nodeId,
          target: parentNodeId,
          type: 'extends',
        });
      }
    }

    if (symbol.implements) {
      for (const iface of symbol.implements) {
        const ifaceNodeId = this.findOrCreateSymbolNode(iface, filePath);
        this.graph.addEdge({
          source: nodeId,
          target: ifaceNodeId,
          type: 'implements',
        });
      }
    }
  }

  private addImport(imp: Import, filePath: string): void {
    if (!this.config.includeFiles) return;

    const fileNodeId = this.createNodeId('file', filePath);

    // Create module node for the import source
    const moduleNodeId = this.createNodeId('module', imp.source);
    if (!this.graph.getNode(moduleNodeId)) {
      this.graph.addNode({
        id: moduleNodeId,
        type: 'module',
        name: imp.source,
      });
    }

    this.graph.addEdge({
      source: fileNodeId,
      target: moduleNodeId,
      type: 'imports',
      metadata: {
        names: imp.names,
        kind: imp.kind,
      },
    });
  }

  private addExport(exp: Export, filePath: string): void {
    if (!this.config.includeFiles) return;

    const fileNodeId = this.createNodeId('file', filePath);
    const symbolNodeId = this.symbolToNode.get(`${filePath}:${exp.name}`);

    if (symbolNodeId) {
      this.graph.addEdge({
        source: fileNodeId,
        target: symbolNodeId,
        type: 'exports',
      });
    }
  }

  private addCall(call: CallReference, filePath: string): void {
    // Find the caller (function/method containing this call)
    const callerNodeId = call.caller
      ? this.symbolToNode.get(`${filePath}:${call.caller}`)
      : this.createNodeId('file', filePath);

    if (!callerNodeId) return;

    // Find or create the callee
    const calleeNodeId = this.findOrCreateSymbolNode(call.callee, filePath);

    this.graph.addEdge({
      source: callerNodeId,
      target: calleeNodeId,
      type: 'calls',
      metadata: {
        line: call.line,
        isMethodCall: call.isMethodCall,
        receiver: call.receiver,
        argumentCount: call.argumentCount,
      },
    });
  }

  private addTypeReference(typeRef: { name: string; line: number }, filePath: string): void {
    // Find symbols that use this type
    const typeNodeId = this.findOrCreateSymbolNode(typeRef.name, filePath);

    // Link to the file for now (could be enhanced to link to specific symbols)
    if (this.config.includeFiles) {
      const fileNodeId = this.createNodeId('file', filePath);
      this.graph.addEdge({
        source: fileNodeId,
        target: typeNodeId,
        type: 'references',
        metadata: { line: typeRef.line },
      });
    }
  }

  private findOrCreateSymbolNode(name: string, contextFilePath: string): string {
    // Try to find existing node
    let nodeId = this.symbolToNode.get(`${contextFilePath}:${name}`);
    if (nodeId) return nodeId;

    nodeId = this.symbolToNode.get(name);
    if (nodeId) return nodeId;

    // Create a placeholder node
    nodeId = this.createNodeId('type', name);
    this.graph.addNode({
      id: nodeId,
      type: 'type',
      name,
      metadata: { placeholder: true },
    });
    this.symbolToNode.set(name, nodeId);

    return nodeId;
  }

  private createNodeId(type: string, name: string, filePath?: string, line?: number): string {
    if (type === 'file') {
      return `file:${name}`;
    }
    if (filePath && line) {
      return `${type}:${filePath}:${name}:${line}`;
    }
    if (filePath) {
      return `${type}:${filePath}:${name}`;
    }
    return `${type}:${name}`;
  }

  private symbolKindToNodeType(kind: Symbol['kind']): NodeType {
    switch (kind) {
      case 'class':
        return 'class';
      case 'interface':
        return 'interface';
      case 'function':
        return 'function';
      case 'method':
        return 'method';
      case 'property':
        return 'property';
      case 'type':
        return 'type';
      case 'constant':
        return 'constant';
      default:
        return 'function';
    }
  }
}

/**
 * Build a knowledge graph from multiple parse results
 */
export function buildKnowledgeGraph(
  parseResults: ParseResult[],
  config?: GraphBuilderConfig
): KnowledgeGraph {
  const builder = new GraphBuilder(config);

  for (const result of parseResults) {
    builder.addFile(result);
  }

  return builder.getGraph();
}

export default GraphBuilder;

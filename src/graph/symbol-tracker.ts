/**
 * Symbol-Level Dependency Tracker
 *
 * Tracks fine-grained dependencies between symbols including:
 * - Function calls
 * - Type usage
 * - Method overrides
 * - Class instantiation
 *
 * @module graph/symbol-tracker
 */

import type { KnowledgeGraph, GraphNode, EdgeType } from './knowledge-graph.js';
import type { Symbol, CallReference } from '../parser/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended edge types for symbol-level tracking
 */
export type SymbolEdgeType =
  | EdgeType
  | 'uses_type'     // Symbol references a type
  | 'overrides'     // Method overrides parent method
  | 'instantiates'  // Code instantiates a class
  | 'accesses'      // Property/field access
  | 'assigns';      // Assignment dependency

/**
 * Symbol dependency information
 */
export interface SymbolDependency {
  /** Source symbol ID */
  from: string;
  /** Target symbol ID */
  to: string;
  /** Dependency type */
  type: SymbolEdgeType;
  /** Line number where dependency occurs */
  line?: number;
  /** Whether this is a direct dependency */
  isDirect: boolean;
  /** Additional context */
  context?: string;
}

/**
 * Symbol usage statistics
 */
export interface SymbolUsageStats {
  /** Symbol ID */
  symbolId: string;
  /** Number of times symbol is called */
  callCount: number;
  /** Number of types that reference this symbol */
  typeUsageCount: number;
  /** Number of places that instantiate this symbol */
  instantiationCount: number;
  /** Files where symbol is used */
  usedInFiles: string[];
  /** Symbols that depend on this symbol */
  dependents: string[];
  /** Symbols this symbol depends on */
  dependencies: string[];
}

/**
 * Call graph representation
 */
export interface CallGraph {
  /** Function/method nodes */
  nodes: Map<string, CallGraphNode>;
  /** Call edges */
  edges: SymbolDependency[];
}

/**
 * Call graph node
 */
export interface CallGraphNode {
  id: string;
  name: string;
  type: 'function' | 'method' | 'constructor';
  filePath?: string;
  line?: number;
  callers: string[];
  callees: string[];
}

// ============================================================================
// SYMBOL TRACKER
// ============================================================================

/**
 * Tracks symbol-level dependencies in the codebase
 *
 * @example
 * ```ts
 * const tracker = new SymbolTracker(graph);
 *
 * // Build call graph from parsed data
 * tracker.trackCalls(calls, symbols);
 *
 * // Get usage stats
 * const stats = tracker.getUsageStats('UserService.getUser');
 *
 * // Find all callers
 * const callers = tracker.getCallers('authenticate');
 * ```
 */
export class SymbolTracker {
  private graph: KnowledgeGraph;
  private symbolMap: Map<string, GraphNode> = new Map();
  private callGraph: CallGraph = { nodes: new Map(), edges: [] };
  private typeUsages: Map<string, Set<string>> = new Map();
  private instantiations: Map<string, Set<string>> = new Map();

  constructor(graph: KnowledgeGraph) {
    this.graph = graph;
    this.buildSymbolMap();
  }

  /**
   * Track function/method calls from parsed call references
   */
  trackCalls(calls: CallReference[], symbols: Symbol[], filePath: string): void {
    // Build symbol lookup
    const symbolByName = new Map<string, Symbol>();
    for (const symbol of symbols) {
      symbolByName.set(symbol.name, symbol);
      if (symbol.parent) {
        symbolByName.set(`${symbol.parent}.${symbol.name}`, symbol);
      }
    }

    for (const call of calls) {
      const callerSymbol = call.caller ? symbolByName.get(call.caller) : null;
      const calleeSymbol = symbolByName.get(call.callee);

      // Build call graph node for caller
      if (callerSymbol) {
        const callerId = this.getSymbolId(callerSymbol, filePath);
        if (!this.callGraph.nodes.has(callerId)) {
          this.callGraph.nodes.set(callerId, {
            id: callerId,
            name: callerSymbol.name,
            type: callerSymbol.kind === 'method' ? 'method' : 'function',
            filePath,
            line: callerSymbol.line,
            callers: [],
            callees: [],
          });
        }
      }

      // Build call graph node for callee
      if (calleeSymbol) {
        const calleeId = this.getSymbolId(calleeSymbol, filePath);
        if (!this.callGraph.nodes.has(calleeId)) {
          this.callGraph.nodes.set(calleeId, {
            id: calleeId,
            name: calleeSymbol.name,
            type: calleeSymbol.kind === 'method' ? 'method' : 'function',
            filePath,
            line: calleeSymbol.line,
            callers: [],
            callees: [],
          });
        }
      }

      // Create dependency edge
      if (callerSymbol && calleeSymbol) {
        const callerId = this.getSymbolId(callerSymbol, filePath);
        const calleeId = this.getSymbolId(calleeSymbol, filePath);

        const dependency: SymbolDependency = {
          from: callerId,
          to: calleeId,
          type: 'calls',
          line: call.line,
          isDirect: true,
        };

        this.callGraph.edges.push(dependency);

        // Update adjacency
        const callerNode = this.callGraph.nodes.get(callerId);
        const calleeNode = this.callGraph.nodes.get(calleeId);

        if (callerNode && !callerNode.callees.includes(calleeId)) {
          callerNode.callees.push(calleeId);
        }
        if (calleeNode && !calleeNode.callers.includes(callerId)) {
          calleeNode.callers.push(callerId);
        }

        // Add edge to graph
        this.graph.addEdge({
          source: callerId,
          target: calleeId,
          type: 'calls',
          metadata: { line: call.line, isMethodCall: call.isMethodCall },
        });
      }
    }
  }

  /**
   * Track type usage from symbols
   */
  trackTypeUsage(symbols: Symbol[], filePath: string): void {
    for (const symbol of symbols) {
      const symbolId = this.getSymbolId(symbol, filePath);

      // Track return type usage
      if (symbol.returnType) {
        this.addTypeUsage(symbol.returnType, symbolId);
      }

      // Track parameter type usage
      if (symbol.parameters) {
        for (const param of symbol.parameters) {
          if (param.type) {
            this.addTypeUsage(param.type, symbolId);
          }
        }
      }

      // Track extends/implements
      if (symbol.extends) {
        for (const ext of symbol.extends) {
          this.addTypeUsage(ext, symbolId);
          this.graph.addEdge({
            source: symbolId,
            target: ext,
            type: 'extends',
          });
        }
      }

      if (symbol.implements) {
        for (const impl of symbol.implements) {
          this.addTypeUsage(impl, symbolId);
          this.graph.addEdge({
            source: symbolId,
            target: impl,
            type: 'implements',
          });
        }
      }
    }
  }

  /**
   * Track class instantiations from call references
   */
  trackInstantiations(calls: CallReference[], symbols: Symbol[], filePath: string): void {
    // Find class symbols
    const classSymbols = new Map<string, Symbol>();
    for (const symbol of symbols) {
      if (symbol.kind === 'class') {
        classSymbols.set(symbol.name, symbol);
      }
    }

    for (const call of calls) {
      // Check if this is a constructor call (new ClassName)
      if (classSymbols.has(call.callee)) {
        const classSymbol = classSymbols.get(call.callee)!;
        const classId = this.getSymbolId(classSymbol, filePath);
        const callerId = call.caller || filePath;

        if (!this.instantiations.has(classId)) {
          this.instantiations.set(classId, new Set());
        }
        this.instantiations.get(classId)!.add(callerId);

        // Add edge to graph
        this.graph.addEdge({
          source: callerId,
          target: classId,
          type: 'uses', // 'instantiates' would need to be added to EdgeType
          metadata: { isInstantiation: true, line: call.line },
        });
      }
    }
  }

  /**
   * Track method overrides in class hierarchies
   */
  trackOverrides(symbols: Symbol[], filePath: string): void {
    // Group by class
    const classMethods = new Map<string, Symbol[]>();

    for (const symbol of symbols) {
      if (symbol.kind === 'method' && symbol.parent) {
        if (!classMethods.has(symbol.parent)) {
          classMethods.set(symbol.parent, []);
        }
        classMethods.get(symbol.parent)!.push(symbol);
      }
    }

    // Find classes with extends
    const classSymbols = symbols.filter((s) => s.kind === 'class' && s.extends?.length);

    for (const classSymbol of classSymbols) {
      const childMethods = classMethods.get(classSymbol.name) || [];
      const parentClassName = classSymbol.extends?.[0];

      if (parentClassName) {
        const parentMethods = classMethods.get(parentClassName) || [];

        for (const childMethod of childMethods) {
          // Check if parent has same method
          const parentMethod = parentMethods.find((m) => m.name === childMethod.name);
          if (parentMethod) {
            const childId = this.getSymbolId(childMethod, filePath);
            const parentId = this.getSymbolId(parentMethod, filePath);

            this.graph.addEdge({
              source: childId,
              target: parentId,
              type: 'references', // 'overrides' would need to be added to EdgeType
              metadata: { isOverride: true },
            });
          }
        }
      }
    }
  }

  /**
   * Get usage statistics for a symbol
   */
  getUsageStats(symbolId: string): SymbolUsageStats {
    const node = this.callGraph.nodes.get(symbolId);

    // Count calls to this symbol
    const callCount = this.callGraph.edges.filter(
      (e) => e.to === symbolId && e.type === 'calls'
    ).length;

    // Count type usages
    const typeUsageCount = this.typeUsages.get(symbolId)?.size || 0;

    // Count instantiations
    const instantiationCount = this.instantiations.get(symbolId)?.size || 0;

    // Find files where used
    const usedInFiles = new Set<string>();
    for (const edge of this.callGraph.edges) {
      if (edge.to === symbolId) {
        const callerNode = this.callGraph.nodes.get(edge.from);
        if (callerNode?.filePath) {
          usedInFiles.add(callerNode.filePath);
        }
      }
    }

    return {
      symbolId,
      callCount,
      typeUsageCount,
      instantiationCount,
      usedInFiles: [...usedInFiles],
      dependents: node?.callers || [],
      dependencies: node?.callees || [],
    };
  }

  /**
   * Get all callers of a function/method
   */
  getCallers(symbolId: string): string[] {
    const node = this.callGraph.nodes.get(symbolId);
    return node?.callers || [];
  }

  /**
   * Get all callees of a function/method
   */
  getCallees(symbolId: string): string[] {
    const node = this.callGraph.nodes.get(symbolId);
    return node?.callees || [];
  }

  /**
   * Get the call graph
   */
  getCallGraph(): CallGraph {
    return this.callGraph;
  }

  /**
   * Find symbols that use a specific type
   */
  getTypeUsers(typeName: string): string[] {
    return [...(this.typeUsages.get(typeName) || [])];
  }

  /**
   * Find all instantiation sites for a class
   */
  getInstantiationSites(classId: string): string[] {
    return [...(this.instantiations.get(classId) || [])];
  }

  /**
   * Get dependency chain (transitive dependencies)
   */
  getDependencyChain(symbolId: string, maxDepth = 5): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string, depth: number): void => {
      if (depth > maxDepth) return;
      if (visited.has(id)) return;

      visited.add(id);

      const node = this.callGraph.nodes.get(id);
      if (node) {
        for (const callee of node.callees) {
          if (!visited.has(callee)) {
            chain.push(callee);
            traverse(callee, depth + 1);
          }
        }
      }
    };

    traverse(symbolId, 0);
    return chain;
  }

  /**
   * Get reverse dependency chain (what depends on this symbol)
   */
  getReverseDependencyChain(symbolId: string, maxDepth = 5): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string, depth: number): void => {
      if (depth > maxDepth) return;
      if (visited.has(id)) return;

      visited.add(id);

      const node = this.callGraph.nodes.get(id);
      if (node) {
        for (const caller of node.callers) {
          if (!visited.has(caller)) {
            chain.push(caller);
            traverse(caller, depth + 1);
          }
        }
      }
    };

    traverse(symbolId, 0);
    return chain;
  }

  /**
   * Find hotspots (frequently called symbols)
   */
  findHotspots(minCalls = 5): SymbolUsageStats[] {
    const hotspots: SymbolUsageStats[] = [];

    for (const [symbolId] of this.callGraph.nodes) {
      const stats = this.getUsageStats(symbolId);
      if (stats.callCount >= minCalls) {
        hotspots.push(stats);
      }
    }

    return hotspots.sort((a, b) => b.callCount - a.callCount);
  }

  /**
   * Find orphan symbols (defined but never used)
   */
  findOrphans(): string[] {
    const orphans: string[] = [];

    for (const [symbolId, node] of this.callGraph.nodes) {
      if (node.callers.length === 0) {
        orphans.push(symbolId);
      }
    }

    return orphans;
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.callGraph = { nodes: new Map(), edges: [] };
    this.typeUsages.clear();
    this.instantiations.clear();
    this.symbolMap.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private buildSymbolMap(): void {
    for (const node of this.graph.getAllNodes()) {
      this.symbolMap.set(node.id, node);
    }
  }

  private getSymbolId(symbol: Symbol, filePath: string): string {
    if (symbol.parent) {
      return `${filePath}:${symbol.parent}.${symbol.name}`;
    }
    return `${filePath}:${symbol.name}`;
  }

  private addTypeUsage(typeName: string, userId: string): void {
    // Extract base type name (handle generics)
    const baseType = typeName.split('<')[0].trim();

    if (!this.typeUsages.has(baseType)) {
      this.typeUsages.set(baseType, new Set());
    }
    this.typeUsages.get(baseType)!.add(userId);
  }
}

export default SymbolTracker;

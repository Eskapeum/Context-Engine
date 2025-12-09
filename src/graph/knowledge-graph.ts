/**
 * Universal Context Engine - Knowledge Graph
 *
 * Builds and queries a knowledge graph of code entities and their relationships.
 * Supports symbol references, inheritance, composition, and call relationships.
 *
 * @module graph/knowledge-graph
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Node types in the knowledge graph
 */
export type NodeType =
  | 'file'
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'property'
  | 'type'
  | 'constant'
  | 'module';

/**
 * Edge types representing relationships
 */
export type EdgeType =
  | 'defines' // file -> symbol
  | 'imports' // file -> file/module
  | 'exports' // file -> symbol
  | 'extends' // class/interface -> class/interface
  | 'implements' // class -> interface
  | 'calls' // function -> function
  | 'references' // symbol -> symbol
  | 'contains' // class -> method/property
  | 'returns' // function -> type
  | 'parameter' // function -> type
  | 'uses'; // any -> any (generic dependency)

/**
 * A node in the knowledge graph
 */
export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath?: string;
  line?: number;
  exported?: boolean;
  documentation?: string;
  metadata?: Record<string, unknown>;
}

/**
 * An edge connecting two nodes
 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Query options for graph traversal
 */
export interface GraphQueryOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Edge types to follow */
  edgeTypes?: EdgeType[];
  /** Node types to include */
  nodeTypes?: NodeType[];
  /** Direction of traversal */
  direction?: 'outgoing' | 'incoming' | 'both';
}

/**
 * Result of a graph query
 */
export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: string[][];
}

// ============================================================================
// KNOWLEDGE GRAPH
// ============================================================================

/**
 * In-memory knowledge graph for code entities
 *
 * @example
 * ```ts
 * const graph = new KnowledgeGraph();
 *
 * graph.addNode({ id: 'UserService', type: 'class', name: 'UserService' });
 * graph.addNode({ id: 'getUser', type: 'method', name: 'getUser' });
 * graph.addEdge({ source: 'UserService', target: 'getUser', type: 'contains' });
 *
 * const related = graph.findRelated('UserService', { maxDepth: 2 });
 * ```
 */
export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private outgoingEdges: Map<string, Set<string>> = new Map();
  private incomingEdges: Map<string, Set<string>> = new Map();
  private edgeCounter = 0;

  /**
   * Add a node to the graph
   */
  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoingEdges.has(node.id)) {
      this.outgoingEdges.set(node.id, new Set());
    }
    if (!this.incomingEdges.has(node.id)) {
      this.incomingEdges.set(node.id, new Set());
    }
  }

  /**
   * Add an edge between nodes
   */
  addEdge(edge: Omit<GraphEdge, 'id'> & { id?: string }): string {
    const id = edge.id || `e${++this.edgeCounter}`;
    const fullEdge: GraphEdge = { ...edge, id };

    this.edges.set(id, fullEdge);

    // Index for fast traversal
    if (!this.outgoingEdges.has(edge.source)) {
      this.outgoingEdges.set(edge.source, new Set());
    }
    this.outgoingEdges.get(edge.source)!.add(id);

    if (!this.incomingEdges.has(edge.target)) {
      this.incomingEdges.set(edge.target, new Set());
    }
    this.incomingEdges.get(edge.target)!.add(id);

    return id;
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Find all nodes matching criteria
   */
  findNodes(criteria: {
    type?: NodeType;
    name?: string | RegExp;
    filePath?: string;
    exported?: boolean;
  }): GraphNode[] {
    const results: GraphNode[] = [];

    for (const node of this.nodes.values()) {
      if (criteria.type && node.type !== criteria.type) continue;
      if (criteria.filePath && node.filePath !== criteria.filePath) continue;
      if (criteria.exported !== undefined && node.exported !== criteria.exported) continue;
      if (criteria.name) {
        if (typeof criteria.name === 'string') {
          if (!node.name.toLowerCase().includes(criteria.name.toLowerCase())) continue;
        } else {
          if (!criteria.name.test(node.name)) continue;
        }
      }
      results.push(node);
    }

    return results;
  }

  /**
   * Find related nodes through graph traversal
   */
  findRelated(nodeId: string, options?: GraphQueryOptions): GraphQueryResult {
    const opts: Required<GraphQueryOptions> = {
      maxDepth: options?.maxDepth ?? 3,
      edgeTypes: options?.edgeTypes ?? [],
      nodeTypes: options?.nodeTypes ?? [],
      direction: options?.direction ?? 'both',
    };

    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const paths: string[][] = [];

    const traverse = (currentId: string, depth: number, path: string[]): void => {
      if (depth > opts.maxDepth) return;
      if (visitedNodes.has(currentId) && depth > 0) return;

      visitedNodes.add(currentId);
      const currentPath = [...path, currentId];

      if (depth > 0) {
        paths.push(currentPath);
      }

      // Get edges to follow
      const edgeIds: string[] = [];

      if (opts.direction === 'outgoing' || opts.direction === 'both') {
        const outgoing = this.outgoingEdges.get(currentId);
        if (outgoing) edgeIds.push(...outgoing);
      }

      if (opts.direction === 'incoming' || opts.direction === 'both') {
        const incoming = this.incomingEdges.get(currentId);
        if (incoming) edgeIds.push(...incoming);
      }

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge) continue;

        // Filter by edge type
        if (opts.edgeTypes.length > 0 && !opts.edgeTypes.includes(edge.type)) continue;

        visitedEdges.add(edgeId);

        // Get the other node
        const nextId = edge.source === currentId ? edge.target : edge.source;
        const nextNode = this.nodes.get(nextId);

        if (!nextNode) continue;

        // Filter by node type
        if (opts.nodeTypes.length > 0 && !opts.nodeTypes.includes(nextNode.type)) continue;

        traverse(nextId, depth + 1, currentPath);
      }
    };

    traverse(nodeId, 0, []);

    return {
      nodes: [...visitedNodes].map((id) => this.nodes.get(id)!).filter(Boolean),
      edges: [...visitedEdges].map((id) => this.edges.get(id)!).filter(Boolean),
      paths,
    };
  }

  /**
   * Find the shortest path between two nodes
   */
  findPath(fromId: string, toId: string, options?: GraphQueryOptions): string[] | null {
    const opts = {
      maxDepth: options?.maxDepth ?? 10,
      edgeTypes: options?.edgeTypes ?? [],
    };

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (id === toId) return path;
      if (path.length > opts.maxDepth) continue;
      if (visited.has(id)) continue;

      visited.add(id);

      // Get neighbors
      const edgeIds = [
        ...(this.outgoingEdges.get(id) || []),
        ...(this.incomingEdges.get(id) || []),
      ];

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge) continue;
        if (opts.edgeTypes.length > 0 && !opts.edgeTypes.includes(edge.type)) continue;

        const nextId = edge.source === id ? edge.target : edge.source;
        if (!visited.has(nextId)) {
          queue.push({ id: nextId, path: [...path, nextId] });
        }
      }
    }

    return null;
  }

  /**
   * Get all callers of a function/method
   */
  getCallers(nodeId: string): GraphNode[] {
    const callers: GraphNode[] = [];
    const incoming = this.incomingEdges.get(nodeId);

    if (incoming) {
      for (const edgeId of incoming) {
        const edge = this.edges.get(edgeId);
        if (edge?.type === 'calls') {
          const caller = this.nodes.get(edge.source);
          if (caller) callers.push(caller);
        }
      }
    }

    return callers;
  }

  /**
   * Get all callees of a function/method
   */
  getCallees(nodeId: string): GraphNode[] {
    const callees: GraphNode[] = [];
    const outgoing = this.outgoingEdges.get(nodeId);

    if (outgoing) {
      for (const edgeId of outgoing) {
        const edge = this.edges.get(edgeId);
        if (edge?.type === 'calls') {
          const callee = this.nodes.get(edge.target);
          if (callee) callees.push(callee);
        }
      }
    }

    return callees;
  }

  /**
   * Get inheritance hierarchy (classes/interfaces)
   */
  getInheritanceChain(nodeId: string, direction: 'up' | 'down' = 'up'): GraphNode[] {
    const chain: GraphNode[] = [];
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const edgeSet = direction === 'up' ? this.outgoingEdges.get(id) : this.incomingEdges.get(id);

      if (edgeSet) {
        for (const edgeId of edgeSet) {
          const edge = this.edges.get(edgeId);
          if (edge?.type === 'extends' || edge?.type === 'implements') {
            const nextId = direction === 'up' ? edge.target : edge.source;
            const nextNode = this.nodes.get(nextId);
            if (nextNode) {
              chain.push(nextNode);
              traverse(nextId);
            }
          }
        }
      }
    };

    traverse(nodeId);
    return chain;
  }

  /**
   * Get symbols defined in a file
   */
  getFileSymbols(filePath: string): GraphNode[] {
    return this.findNodes({ filePath });
  }

  /**
   * Get files that import a given file
   */
  getImporters(filePath: string): string[] {
    const fileNode = [...this.nodes.values()].find(
      (n) => n.type === 'file' && n.filePath === filePath
    );
    if (!fileNode) return [];

    const importers: string[] = [];
    const incoming = this.incomingEdges.get(fileNode.id);

    if (incoming) {
      for (const edgeId of incoming) {
        const edge = this.edges.get(edgeId);
        if (edge?.type === 'imports') {
          const importer = this.nodes.get(edge.source);
          if (importer?.filePath) {
            importers.push(importer.filePath);
          }
        }
      }
    }

    return importers;
  }

  /**
   * Remove a node and all its edges
   */
  removeNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) return false;

    // Remove all connected edges
    const outgoing = this.outgoingEdges.get(nodeId);
    if (outgoing) {
      for (const edgeId of outgoing) {
        const edge = this.edges.get(edgeId);
        if (edge) {
          this.incomingEdges.get(edge.target)?.delete(edgeId);
        }
        this.edges.delete(edgeId);
      }
    }

    const incoming = this.incomingEdges.get(nodeId);
    if (incoming) {
      for (const edgeId of incoming) {
        const edge = this.edges.get(edgeId);
        if (edge) {
          this.outgoingEdges.get(edge.source)?.delete(edgeId);
        }
        this.edges.delete(edgeId);
      }
    }

    this.outgoingEdges.delete(nodeId);
    this.incomingEdges.delete(nodeId);
    this.nodes.delete(nodeId);

    return true;
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();
    this.edgeCounter = 0;
  }

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges in the graph
   */
  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    for (const edge of this.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodesByType,
      edgesByType,
    };
  }

  /**
   * Serialize graph to JSON
   */
  toJSON(): string {
    return JSON.stringify({
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    });
  }

  /**
   * Load graph from JSON
   */
  static fromJSON(json: string): KnowledgeGraph {
    const data = JSON.parse(json);
    const graph = new KnowledgeGraph();

    for (const node of data.nodes) {
      graph.addNode(node);
    }

    for (const edge of data.edges) {
      graph.addEdge(edge);
    }

    return graph;
  }
}

export default KnowledgeGraph;

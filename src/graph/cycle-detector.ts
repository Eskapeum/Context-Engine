/**
 * Cycle Detection for Knowledge Graph
 *
 * Implements Tarjan's algorithm for finding strongly connected components (SCCs)
 * to detect cycles in the dependency graph.
 *
 * @module graph/cycle-detector
 */

import type { KnowledgeGraph, GraphEdge, EdgeType } from './knowledge-graph.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A cycle in the graph (strongly connected component with > 1 node)
 */
export interface Cycle {
  /** Node IDs in the cycle */
  nodeIds: string[];
  /** Edge types involved in the cycle */
  edgeTypes: EdgeType[];
  /** Whether this is a self-loop (single node cycle) */
  isSelfLoop: boolean;
}

/**
 * Result of cycle detection
 */
export interface CycleDetectionResult {
  /** All detected cycles */
  cycles: Cycle[];
  /** Number of strongly connected components */
  sccCount: number;
  /** Whether the graph has any cycles */
  hasCycles: boolean;
  /** Detection time in milliseconds */
  detectionTime: number;
}

// ============================================================================
// CYCLE DETECTOR
// ============================================================================

/**
 * Detects cycles in the knowledge graph using Tarjan's SCC algorithm
 *
 * @example
 * ```ts
 * const detector = new CycleDetector(graph);
 * const result = detector.detectCycles();
 *
 * if (result.hasCycles) {
 *   console.log('Found cycles:', result.cycles);
 * }
 *
 * // Check before adding an edge
 * if (detector.wouldCreateCycle('A', 'B')) {
 *   console.warn('Adding this edge would create a cycle');
 * }
 * ```
 */
export class CycleDetector {
  private graph: KnowledgeGraph;

  constructor(graph: KnowledgeGraph) {
    this.graph = graph;
  }

  /**
   * Detect all cycles in the graph using Tarjan's algorithm
   */
  detectCycles(edgeTypes?: EdgeType[]): CycleDetectionResult {
    const startTime = performance.now();

    // Tarjan's algorithm state
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let currentIndex = 0;

    const sccs: string[][] = [];

    // Get all node IDs
    const nodes = this.graph.getAllNodes();
    const edges = this.graph.getAllEdges();

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
      adjacency.set(node.id, []);
    }

    for (const edge of edges) {
      // Filter by edge types if specified
      if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

      const neighbors = adjacency.get(edge.source);
      if (neighbors) {
        neighbors.push(edge.target);
      }
    }

    // Tarjan's strongconnect function
    const strongconnect = (nodeId: string): void => {
      index.set(nodeId, currentIndex);
      lowlink.set(nodeId, currentIndex);
      currentIndex++;
      stack.push(nodeId);
      onStack.add(nodeId);

      const neighbors = adjacency.get(nodeId) || [];

      for (const neighbor of neighbors) {
        if (!index.has(neighbor)) {
          // Neighbor has not yet been visited
          strongconnect(neighbor);
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(neighbor)!));
        } else if (onStack.has(neighbor)) {
          // Neighbor is on stack, hence in current SCC
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, index.get(neighbor)!));
        }
      }

      // If nodeId is a root node, pop the stack and generate SCC
      if (lowlink.get(nodeId) === index.get(nodeId)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== nodeId);

        sccs.push(scc);
      }
    };

    // Run algorithm on all unvisited nodes
    for (const node of nodes) {
      if (!index.has(node.id)) {
        strongconnect(node.id);
      }
    }

    // Extract cycles (SCCs with more than one node, or self-loops)
    const cycles: Cycle[] = [];

    for (const scc of sccs) {
      if (scc.length > 1) {
        // Multi-node cycle
        const edgeTypesInCycle = this.getEdgeTypesInCycle(scc, edges, edgeTypes);
        cycles.push({
          nodeIds: scc,
          edgeTypes: edgeTypesInCycle,
          isSelfLoop: false,
        });
      } else if (scc.length === 1) {
        // Check for self-loop
        const nodeId = scc[0];
        const neighbors = adjacency.get(nodeId) || [];
        if (neighbors.includes(nodeId)) {
          const selfLoopEdge = edges.find(
            (e) => e.source === nodeId && e.target === nodeId
          );
          cycles.push({
            nodeIds: [nodeId],
            edgeTypes: selfLoopEdge ? [selfLoopEdge.type] : [],
            isSelfLoop: true,
          });
        }
      }
    }

    return {
      cycles,
      sccCount: sccs.length,
      hasCycles: cycles.length > 0,
      detectionTime: performance.now() - startTime,
    };
  }

  /**
   * Check if adding an edge would create a cycle
   */
  wouldCreateCycle(fromId: string, toId: string): boolean {
    // Self-loop is always a cycle
    if (fromId === toId) return true;

    // Check if there's a path from toId back to fromId
    // (If so, adding fromId -> toId would complete a cycle)
    return this.hasPath(toId, fromId);
  }

  /**
   * Check if there's a path between two nodes (BFS)
   */
  hasPath(fromId: string, toId: string): boolean {
    const visited = new Set<string>();
    const queue: string[] = [fromId];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === toId) return true;
      if (visited.has(current)) continue;

      visited.add(current);

      // Get outgoing neighbors
      const edges = this.graph.getAllEdges();
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    return false;
  }

  /**
   * Get all nodes involved in any cycle
   */
  getCyclicNodes(edgeTypes?: EdgeType[]): string[] {
    const result = this.detectCycles(edgeTypes);
    const cyclicNodes = new Set<string>();

    for (const cycle of result.cycles) {
      for (const nodeId of cycle.nodeIds) {
        cyclicNodes.add(nodeId);
      }
    }

    return [...cyclicNodes];
  }

  /**
   * Check if a specific node is part of any cycle
   */
  isInCycle(nodeId: string, edgeTypes?: EdgeType[]): boolean {
    const result = this.detectCycles(edgeTypes);

    for (const cycle of result.cycles) {
      if (cycle.nodeIds.includes(nodeId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the cycle containing a specific node (if any)
   */
  getCycleContaining(nodeId: string, edgeTypes?: EdgeType[]): Cycle | null {
    const result = this.detectCycles(edgeTypes);

    for (const cycle of result.cycles) {
      if (cycle.nodeIds.includes(nodeId)) {
        return cycle;
      }
    }

    return null;
  }

  /**
   * Find the minimal cycle (shortest cycle involving the fewest nodes)
   */
  findMinimalCycle(edgeTypes?: EdgeType[]): Cycle | null {
    const result = this.detectCycles(edgeTypes);

    if (result.cycles.length === 0) return null;

    return result.cycles.reduce((min, cycle) =>
      cycle.nodeIds.length < min.nodeIds.length ? cycle : min
    );
  }

  /**
   * Break cycles by finding edges to remove
   *
   * Returns suggested edges to remove to make the graph acyclic.
   * Uses a greedy approach - removes the edge in the smallest SCC first.
   */
  suggestEdgesToBreakCycles(edgeTypes?: EdgeType[]): GraphEdge[] {
    const result = this.detectCycles(edgeTypes);
    const edgesToRemove: GraphEdge[] = [];
    const edges = this.graph.getAllEdges();

    // Sort cycles by size (smallest first)
    const sortedCycles = [...result.cycles].sort(
      (a, b) => a.nodeIds.length - b.nodeIds.length
    );

    const removedEdgeIds = new Set<string>();

    for (const cycle of sortedCycles) {
      // Find an edge in this cycle that hasn't been marked for removal
      for (const edge of edges) {
        if (removedEdgeIds.has(edge.id)) continue;
        if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

        // Check if this edge is in the cycle
        const sourceInCycle = cycle.nodeIds.includes(edge.source);
        const targetInCycle = cycle.nodeIds.includes(edge.target);

        if (sourceInCycle && targetInCycle) {
          edgesToRemove.push(edge);
          removedEdgeIds.add(edge.id);
          break; // One edge per cycle is enough
        }
      }
    }

    return edgesToRemove;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getEdgeTypesInCycle(
    scc: string[],
    edges: GraphEdge[],
    filterTypes?: EdgeType[]
  ): EdgeType[] {
    const types = new Set<EdgeType>();
    const sccSet = new Set(scc);

    for (const edge of edges) {
      if (filterTypes && !filterTypes.includes(edge.type)) continue;

      if (sccSet.has(edge.source) && sccSet.has(edge.target)) {
        types.add(edge.type);
      }
    }

    return [...types];
  }
}

export default CycleDetector;

/**
 * Thought Graph
 *
 * Tracks thought lineage, branching, and relationships.
 * Enables visualization and analysis of reasoning paths.
 *
 * @module thinking/thought-graph
 */

import type {
  Thought,
  ThoughtBranch,
  ThoughtGraph,
  ThoughtNode,
} from './types.js';

// ============================================================================
// THOUGHT GRAPH BUILDER
// ============================================================================

/**
 * Builds and manages the thought graph
 */
export class ThoughtGraphBuilder {
  private nodes: Map<string, ThoughtNode> = new Map();
  private branches: Map<string, ThoughtBranch> = new Map();
  private rootId: string | null = null;
  private activeBranchId = 'main';
  private nextThoughtNumber = 1;

  constructor() {
    // Initialize main branch
    this.branches.set('main', {
      id: 'main',
      name: 'Main',
      parentBranchId: null,
      branchPoint: 0,
      thoughts: [],
      status: 'active',
    });
  }

  /**
   * Add a thought to the graph
   */
  addThought(thought: Thought): void {
    // Set thought number if not set
    if (!thought.number) {
      thought.number = this.nextThoughtNumber++;
    } else {
      this.nextThoughtNumber = Math.max(this.nextThoughtNumber, thought.number + 1);
    }

    // Determine parent
    let parentId: string | null = null;
    if (thought.parentId) {
      parentId = thought.parentId;
    } else if (thought.revisesThought) {
      // Find the thought being revised
      const revisedThought = this.findThoughtByNumber(thought.revisesThought);
      if (revisedThought) {
        parentId = revisedThought.id;
      }
    } else {
      // Default to last thought in active branch
      const activeBranch = this.branches.get(this.activeBranchId);
      if (activeBranch && activeBranch.thoughts.length > 0) {
        parentId = activeBranch.thoughts[activeBranch.thoughts.length - 1].id;
      }
    }

    // Create node
    const node: ThoughtNode = {
      thought,
      children: [],
      parent: parentId,
      depth: parentId ? (this.nodes.get(parentId)?.depth || 0) + 1 : 0,
    };

    // Add to nodes map
    this.nodes.set(thought.id, node);

    // Set root if first thought
    if (!this.rootId) {
      this.rootId = thought.id;
    }

    // Update parent's children
    if (parentId) {
      const parentNode = this.nodes.get(parentId);
      if (parentNode) {
        parentNode.children.push(thought.id);
      }
    }

    // Add to branch
    const branchId = thought.branchId || this.activeBranchId;
    const branch = this.branches.get(branchId);
    if (branch) {
      branch.thoughts.push(thought);
    }
  }

  /**
   * Create a new branch from a thought
   */
  createBranch(
    branchId: string,
    name: string,
    fromThoughtNumber: number,
    reason?: string
  ): ThoughtBranch | null {
    const fromThought = this.findThoughtByNumber(fromThoughtNumber);
    if (!fromThought) {
      return null;
    }

    const branch: ThoughtBranch = {
      id: branchId,
      name,
      parentBranchId: fromThought.branchId || 'main',
      branchPoint: fromThoughtNumber,
      thoughts: [],
      status: 'active',
      reason,
    };

    this.branches.set(branchId, branch);
    return branch;
  }

  /**
   * Switch to a different branch
   */
  switchBranch(branchId: string): boolean {
    if (!this.branches.has(branchId)) {
      return false;
    }
    this.activeBranchId = branchId;
    return true;
  }

  /**
   * Get the current active branch
   */
  getActiveBranch(): ThoughtBranch | null {
    return this.branches.get(this.activeBranchId) || null;
  }

  /**
   * Get all branches
   */
  getAllBranches(): ThoughtBranch[] {
    return Array.from(this.branches.values());
  }

  /**
   * Get all thoughts in sequence
   */
  getAllThoughts(): Thought[] {
    return Array.from(this.nodes.values())
      .map((n) => n.thought)
      .sort((a, b) => a.number - b.number);
  }

  /**
   * Get thoughts in current branch
   */
  getBranchThoughts(branchId?: string): Thought[] {
    const branch = this.branches.get(branchId || this.activeBranchId);
    return branch?.thoughts || [];
  }

  /**
   * Find a thought by its number
   */
  findThoughtByNumber(number: number): Thought | null {
    for (const node of this.nodes.values()) {
      if (node.thought.number === number) {
        return node.thought;
      }
    }
    return null;
  }

  /**
   * Get thought lineage (path from root to thought)
   */
  getLineage(thoughtId: string): Thought[] {
    const lineage: Thought[] = [];
    let currentId: string | null = thoughtId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node) break;

      lineage.unshift(node.thought);
      currentId = node.parent;
    }

    return lineage;
  }

  /**
   * Get all descendants of a thought
   */
  getDescendants(thoughtId: string): Thought[] {
    const descendants: Thought[] = [];
    const queue = [thoughtId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const node = this.nodes.get(currentId);
      if (!node) continue;

      if (currentId !== thoughtId) {
        descendants.push(node.thought);
      }

      queue.push(...node.children);
    }

    return descendants;
  }

  /**
   * Get the graph structure
   */
  getGraph(): ThoughtGraph | null {
    if (!this.rootId) {
      return null;
    }

    return {
      rootId: this.rootId,
      nodes: new Map(this.nodes),
      activeBranchId: this.activeBranchId,
      branches: Array.from(this.branches.keys()),
    };
  }

  /**
   * Export graph to JSON-serializable format
   */
  exportToJson(): {
    thoughts: Thought[];
    branches: ThoughtBranch[];
    relationships: Array<{ from: string; to: string; type: 'child' | 'revision' }>;
  } {
    const thoughts = this.getAllThoughts();
    const branches = this.getAllBranches();
    const relationships: Array<{ from: string; to: string; type: 'child' | 'revision' }> = [];

    for (const node of this.nodes.values()) {
      if (node.parent) {
        relationships.push({
          from: node.parent,
          to: node.thought.id,
          type: node.thought.revisesThought ? 'revision' : 'child',
        });
      }
    }

    return { thoughts, branches, relationships };
  }

  /**
   * Export to Mermaid diagram format
   */
  exportToMermaid(): string {
    const lines: string[] = ['graph TD'];

    for (const node of this.nodes.values()) {
      const thought = node.thought;
      const label = `${thought.number}: ${thought.type}`;
      const shape =
        thought.type === 'conclusion'
          ? `((${label}))`
          : thought.type === 'revision'
            ? `{${label}}`
            : `[${label}]`;

      lines.push(`    ${thought.id}${shape}`);

      if (node.parent) {
        const edgeLabel = thought.revisesThought ? 'revises' : '';
        const edge = edgeLabel ? `-->|${edgeLabel}|` : '-->';
        lines.push(`    ${node.parent} ${edge} ${thought.id}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get statistics about the graph
   */
  getStats(): {
    totalThoughts: number;
    totalBranches: number;
    maxDepth: number;
    revisionCount: number;
    thoughtsByType: Record<string, number>;
  } {
    let maxDepth = 0;
    let revisionCount = 0;
    const thoughtsByType: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      maxDepth = Math.max(maxDepth, node.depth);

      if (node.thought.revisesThought) {
        revisionCount++;
      }

      const type = node.thought.type;
      thoughtsByType[type] = (thoughtsByType[type] || 0) + 1;
    }

    return {
      totalThoughts: this.nodes.size,
      totalBranches: this.branches.size,
      maxDepth,
      revisionCount,
      thoughtsByType,
    };
  }

  /**
   * Reset the graph
   */
  reset(): void {
    this.nodes.clear();
    this.branches.clear();
    this.rootId = null;
    this.activeBranchId = 'main';
    this.nextThoughtNumber = 1;

    // Re-initialize main branch
    this.branches.set('main', {
      id: 'main',
      name: 'Main',
      parentBranchId: null,
      branchPoint: 0,
      thoughts: [],
      status: 'active',
    });
  }
}

export default ThoughtGraphBuilder;

/**
 * Sequential Thinker
 *
 * Core reasoning engine for structured multi-step problem solving.
 * Integrates with code context for codebase-aware thinking.
 *
 * @module thinking/sequential-thinker
 */

import { randomUUID } from 'crypto';
import type {
  ConfidenceLevel,
  Thought,
  ThoughtBranch,
  ThoughtContext,
  ThoughtType,
  ThinkingOptions,
  ThinkingResult,
} from './types.js';
import { ThoughtGraphBuilder } from './thought-graph.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_THOUGHTS = 10;
const DEFAULT_MIN_CONFIDENCE = 0.7;

// ============================================================================
// SEQUENTIAL THINKER CLASS
// ============================================================================

/**
 * Sequential thinking engine
 */
export class SequentialThinker {
  private graphBuilder: ThoughtGraphBuilder;
  private problem: string = '';
  private options: Required<ThinkingOptions>;
  private startTime: Date | null = null;
  private contextRetriever?: (query: string, maxTokens: number) => Promise<ThoughtContext>;

  constructor(options: ThinkingOptions = {}) {
    this.graphBuilder = new ThoughtGraphBuilder();
    this.options = {
      maxThoughts: options.maxThoughts || DEFAULT_MAX_THOUGHTS,
      allowRevision: options.allowRevision ?? true,
      allowBranching: options.allowBranching ?? false,
      maxBranches: options.maxBranches || 3,
      autoRetrieveContext: options.autoRetrieveContext ?? true,
      maxContextTokens: options.maxContextTokens || 2000,
      minConfidence: options.minConfidence || DEFAULT_MIN_CONFIDENCE,
      style: options.style || 'analytical',
    };
  }

  /**
   * Set the context retriever function
   * This allows integration with the UCE retrieval system
   */
  setContextRetriever(
    retriever: (query: string, maxTokens: number) => Promise<ThoughtContext>
  ): void {
    this.contextRetriever = retriever;
  }

  /**
   * Start a new thinking session
   */
  async start(problem: string): Promise<void> {
    this.problem = problem;
    this.startTime = new Date();
    this.graphBuilder.reset();
  }

  /**
   * Add a thought to the reasoning chain
   */
  async addThought(params: {
    content: string;
    type: ThoughtType;
    confidence: number;
    revisesThought?: number;
    branchId?: string;
    branchFromThought?: number;
    needsMoreThoughts?: boolean;
  }): Promise<Thought> {
    // Handle branching
    if (params.branchFromThought && params.branchId) {
      const existingBranch = this.graphBuilder
        .getAllBranches()
        .find((b) => b.id === params.branchId);

      if (!existingBranch) {
        this.graphBuilder.createBranch(
          params.branchId,
          `Branch from thought ${params.branchFromThought}`,
          params.branchFromThought,
          params.content.substring(0, 100)
        );
        this.graphBuilder.switchBranch(params.branchId);
      }
    }

    // Retrieve context if enabled
    let context: ThoughtContext | undefined;
    if (this.options.autoRetrieveContext && this.contextRetriever) {
      try {
        context = await this.contextRetriever(params.content, this.options.maxContextTokens);
      } catch (error) {
        console.warn('Failed to retrieve context:', error);
      }
    }

    // Create thought
    const thought: Thought = {
      id: randomUUID(),
      number: 0, // Will be set by graph builder
      content: params.content,
      type: params.type,
      confidence: params.confidence,
      timestamp: new Date().toISOString(),
      revisesThought: params.revisesThought,
      branchId: params.branchId,
      contextUsed: context,
      needsMoreThoughts: params.needsMoreThoughts,
    };

    // Add to graph
    this.graphBuilder.addThought(thought);

    return thought;
  }

  /**
   * Create a new branch for alternative exploration
   */
  createBranch(fromThoughtNumber: number, reason: string): ThoughtBranch | null {
    if (!this.options.allowBranching) {
      return null;
    }

    const branches = this.graphBuilder.getAllBranches();
    if (branches.length >= this.options.maxBranches) {
      return null;
    }

    const branchId = `branch-${branches.length}`;
    return this.graphBuilder.createBranch(branchId, reason, fromThoughtNumber, reason);
  }

  /**
   * Switch to a different branch
   */
  switchBranch(branchId: string): boolean {
    return this.graphBuilder.switchBranch(branchId);
  }

  /**
   * Get all thoughts so far
   */
  getThoughts(): Thought[] {
    return this.graphBuilder.getAllThoughts();
  }

  /**
   * Get the last thought
   */
  getLastThought(): Thought | null {
    const thoughts = this.getThoughts();
    return thoughts.length > 0 ? thoughts[thoughts.length - 1] : null;
  }

  /**
   * Check if thinking should continue
   */
  shouldContinue(): boolean {
    const thoughts = this.getThoughts();

    // Check max thoughts
    if (thoughts.length >= this.options.maxThoughts) {
      return false;
    }

    // Check if last thought was a conclusion
    const lastThought = this.getLastThought();
    if (lastThought?.type === 'conclusion') {
      return false;
    }

    // Check if high confidence reached
    if (lastThought && lastThought.confidence >= this.options.minConfidence) {
      if (lastThought.type === 'verification') {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if revision is needed based on analysis
   */
  needsRevision(): { needed: boolean; targetThought?: number; reason?: string } {
    if (!this.options.allowRevision) {
      return { needed: false };
    }

    const thoughts = this.getThoughts();
    if (thoughts.length < 2) {
      return { needed: false };
    }

    // Find thoughts with low confidence that might need revision
    const lowConfidenceThought = thoughts.find(
      (t) => t.confidence < 0.5 && t.type !== 'revision' && t.type !== 'conclusion'
    );

    if (lowConfidenceThought) {
      return {
        needed: true,
        targetThought: lowConfidenceThought.number,
        reason: `Thought ${lowConfidenceThought.number} has low confidence (${lowConfidenceThought.confidence})`,
      };
    }

    return { needed: false };
  }

  /**
   * Get suggested next thought type
   */
  suggestNextType(): ThoughtType {
    const thoughts = this.getThoughts();

    if (thoughts.length === 0) {
      return 'analysis';
    }

    const lastThought = thoughts[thoughts.length - 1];

    // After analysis, often hypothesize
    if (lastThought.type === 'analysis') {
      return thoughts.length < 3 ? 'analysis' : 'hypothesis';
    }

    // After hypothesis, verify
    if (lastThought.type === 'hypothesis') {
      return 'verification';
    }

    // After verification with high confidence, conclude
    if (lastThought.type === 'verification' && lastThought.confidence >= this.options.minConfidence) {
      return 'conclusion';
    }

    // After revision, re-analyze
    if (lastThought.type === 'revision') {
      return 'analysis';
    }

    // Default flow
    if (thoughts.length >= this.options.maxThoughts - 1) {
      return 'conclusion';
    }

    return 'analysis';
  }

  /**
   * Finalize thinking and get result
   */
  finalize(): ThinkingResult {
    const thoughts = this.getThoughts();
    const branches = this.graphBuilder.getAllBranches();
    const stats = this.graphBuilder.getStats();

    // Extract conclusion
    const conclusionThought = thoughts.find((t) => t.type === 'conclusion');
    const conclusion = conclusionThought?.content || this.synthesizeConclusion(thoughts);

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(thoughts);

    // Aggregate context
    const contextUsed = this.aggregateContext(thoughts);

    const endTime = new Date();
    const startTime = this.startTime || endTime;

    return {
      problem: this.problem,
      thoughts,
      conclusion,
      confidence,
      branches,
      contextUsed,
      metadata: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMs: endTime.getTime() - startTime.getTime(),
        totalThoughts: thoughts.length,
        revisionsCount: stats.revisionCount,
        branchesExplored: branches.length,
      },
    };
  }

  /**
   * Get the graph builder for advanced operations
   */
  getGraphBuilder(): ThoughtGraphBuilder {
    return this.graphBuilder;
  }

  /**
   * Export thinking session to JSON
   */
  exportToJson(): object {
    const result = this.finalize();
    const graphExport = this.graphBuilder.exportToJson();

    return {
      ...result,
      graph: graphExport,
    };
  }

  /**
   * Export to Mermaid diagram
   */
  exportToMermaid(): string {
    return this.graphBuilder.exportToMermaid();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private synthesizeConclusion(thoughts: Thought[]): string {
    if (thoughts.length === 0) {
      return 'No conclusion reached.';
    }

    // Get high-confidence thoughts
    const highConfidence = thoughts.filter((t) => t.confidence >= 0.7);
    if (highConfidence.length > 0) {
      const lastHighConfidence = highConfidence[highConfidence.length - 1];
      return `Based on analysis: ${lastHighConfidence.content}`;
    }

    // Fall back to last thought
    const lastThought = thoughts[thoughts.length - 1];
    return `Preliminary conclusion: ${lastThought.content}`;
  }

  private calculateOverallConfidence(thoughts: Thought[]): ConfidenceLevel {
    if (thoughts.length === 0) {
      return 'low';
    }

    // Weight recent thoughts more heavily
    let totalWeight = 0;
    let weightedSum = 0;

    for (let i = 0; i < thoughts.length; i++) {
      const weight = 1 + i * 0.5; // Increasing weight for later thoughts
      totalWeight += weight;
      weightedSum += thoughts[i].confidence * weight;
    }

    const avgConfidence = weightedSum / totalWeight;

    if (avgConfidence >= 0.8) return 'high';
    if (avgConfidence >= 0.5) return 'medium';
    return 'low';
  }

  private aggregateContext(thoughts: Thought[]): {
    files: string[];
    symbols: string[];
    totalChunks: number;
  } {
    const files = new Set<string>();
    const symbols = new Set<string>();
    let totalChunks = 0;

    for (const thought of thoughts) {
      if (thought.contextUsed) {
        thought.contextUsed.files?.forEach((f) => files.add(f));
        thought.contextUsed.symbols?.forEach((s) => symbols.add(s));
        totalChunks += thought.contextUsed.chunkIds?.length || 0;
      }
    }

    return {
      files: Array.from(files),
      symbols: Array.from(symbols),
      totalChunks,
    };
  }
}

export default SequentialThinker;

/**
 * Sequential Thinking Types
 *
 * Type definitions for the structured multi-step reasoning engine.
 * Supports revision, branching, and confidence tracking.
 *
 * @module thinking/types
 */

// ============================================================================
// THOUGHT TYPES
// ============================================================================

/**
 * Type of thought in the reasoning chain
 */
export type ThoughtType = 'analysis' | 'hypothesis' | 'revision' | 'verification' | 'conclusion';

/**
 * Single thought in the reasoning chain
 */
export interface Thought {
  /** Unique thought ID */
  id: string;

  /** Thought number in sequence */
  number: number;

  /** Thought content */
  content: string;

  /** Type of thought */
  type: ThoughtType;

  /** Parent thought ID (for branching) */
  parentId?: string;

  /** Which thought this revises (for revision type) */
  revisesThought?: number;

  /** Branch identifier */
  branchId?: string;

  /** Confidence level (0-1) */
  confidence: number;

  /** Timestamp */
  timestamp: string;

  /** Context used for this thought */
  contextUsed?: ThoughtContext;

  /** Whether this thought needs more exploration */
  needsMoreThoughts?: boolean;
}

/**
 * Context used in a thought
 */
export interface ThoughtContext {
  /** Files referenced */
  files?: string[];

  /** Symbols referenced */
  symbols?: string[];

  /** Code snippets examined */
  codeSnippets?: Array<{
    file: string;
    startLine: number;
    endLine: number;
    content?: string;
  }>;

  /** Chunks retrieved */
  chunkIds?: string[];
}

// ============================================================================
// BRANCH TYPES
// ============================================================================

/**
 * A branch in the thought tree
 */
export interface ThoughtBranch {
  /** Branch identifier */
  id: string;

  /** Branch name/label */
  name: string;

  /** Parent branch ID (null for main) */
  parentBranchId: string | null;

  /** Thought number where branch started */
  branchPoint: number;

  /** Thoughts in this branch */
  thoughts: Thought[];

  /** Branch status */
  status: 'active' | 'merged' | 'abandoned';

  /** Why this branch was created */
  reason?: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Confidence level for conclusions
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Final thinking result
 */
export interface ThinkingResult {
  /** Original problem/question */
  problem: string;

  /** All thoughts in sequence */
  thoughts: Thought[];

  /** Final conclusion */
  conclusion: string;

  /** Conclusion confidence */
  confidence: ConfidenceLevel;

  /** All branches explored */
  branches: ThoughtBranch[];

  /** Total context used */
  contextUsed: {
    files: string[];
    symbols: string[];
    totalChunks: number;
  };

  /** Thinking metadata */
  metadata: {
    startTime: string;
    endTime: string;
    durationMs: number;
    totalThoughts: number;
    revisionsCount: number;
    branchesExplored: number;
  };
}

// ============================================================================
// ENGINE OPTIONS
// ============================================================================

/**
 * Options for sequential thinking
 */
export interface ThinkingOptions {
  /** Maximum number of thoughts */
  maxThoughts?: number;

  /** Allow thought revision */
  allowRevision?: boolean;

  /** Allow branching */
  allowBranching?: boolean;

  /** Maximum branches */
  maxBranches?: number;

  /** Auto-retrieve context */
  autoRetrieveContext?: boolean;

  /** Maximum tokens for context per thought */
  maxContextTokens?: number;

  /** Minimum confidence to conclude */
  minConfidence?: number;

  /** Thinking style */
  style?: 'analytical' | 'exploratory' | 'focused';
}

/**
 * Thinking engine configuration
 */
export interface ThinkingEngineConfig {
  /** Enable thinking feature */
  enabled?: boolean;

  /** Default max thoughts */
  maxThoughts?: number;

  /** Default allow revision */
  allowRevision?: boolean;

  /** Default allow branching */
  allowBranching?: boolean;

  /** Context retrieval settings */
  contextRetrieval?: {
    enabled?: boolean;
    maxTokensPerThought?: number;
  };
}

// ============================================================================
// THOUGHT GRAPH TYPES
// ============================================================================

/**
 * Node in the thought graph
 */
export interface ThoughtNode {
  /** Thought */
  thought: Thought;

  /** Child thought IDs */
  children: string[];

  /** Parent thought ID */
  parent: string | null;

  /** Depth in tree */
  depth: number;
}

/**
 * Thought graph structure
 */
export interface ThoughtGraph {
  /** Root thought ID */
  rootId: string;

  /** All nodes by ID */
  nodes: Map<string, ThoughtNode>;

  /** Current active branch ID */
  activeBranchId: string;

  /** All branch IDs */
  branches: string[];
}

// ============================================================================
// PROMPT TYPES
// ============================================================================

/**
 * Prompt for generating a thought
 */
export interface ThoughtPrompt {
  /** Problem being analyzed */
  problem: string;

  /** Previous thoughts */
  previousThoughts: Thought[];

  /** Current branch */
  currentBranch?: ThoughtBranch;

  /** Context to consider */
  context?: ThoughtContext;

  /** Suggested type for next thought */
  suggestedType?: ThoughtType;

  /** Whether revision is needed */
  needsRevision?: boolean;

  /** Thought to revise */
  revisionTarget?: number;
}

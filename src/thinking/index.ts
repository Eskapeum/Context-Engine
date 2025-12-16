/**
 * Sequential Thinking Module
 *
 * Structured multi-step reasoning engine with revision
 * and branching capabilities.
 *
 * @module thinking
 */

// Types
export type {
  ThoughtType,
  Thought,
  ThoughtContext,
  ThoughtBranch,
  ConfidenceLevel,
  ThinkingResult,
  ThinkingOptions,
  ThinkingEngineConfig,
  ThoughtNode,
  ThoughtGraph,
  ThoughtPrompt,
} from './types.js';

// Classes
export { ThoughtGraphBuilder } from './thought-graph.js';
export { SequentialThinker } from './sequential-thinker.js';

// Default export
export { SequentialThinker as default } from './sequential-thinker.js';

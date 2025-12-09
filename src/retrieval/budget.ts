/**
 * Universal Context Engine - Context Budget Optimization
 *
 * Intelligently selects and ranks context chunks to fit within
 * a token budget while maximizing relevance and coverage.
 *
 * @module retrieval/budget
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BudgetConfig {
  /** Maximum tokens allowed */
  maxTokens: number;
  /** Reserve tokens for system prompt */
  systemReserve?: number;
  /** Reserve tokens for response */
  responseReserve?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Prefer diversity over relevance (0-1) */
  diversityWeight?: number;
}

export interface BudgetChunk {
  id: string;
  content: string;
  tokenCount: number;
  score: number;
  filePath: string;
  startLine: number;
  endLine: number;
  symbols: string[];
  language?: string;
}

export interface BudgetResult {
  /** Selected chunks */
  chunks: BudgetChunk[];
  /** Total tokens used */
  totalTokens: number;
  /** Tokens remaining in budget */
  remainingTokens: number;
  /** Number of chunks considered */
  consideredCount: number;
  /** Number of chunks selected */
  selectedCount: number;
  /** Files represented */
  filesCovered: string[];
  /** Average score of selected chunks */
  avgScore: number;
}

// ============================================================================
// BUDGET OPTIMIZER
// ============================================================================

/**
 * Context budget optimizer using greedy selection with diversity
 *
 * @example
 * ```ts
 * const optimizer = new BudgetOptimizer({ maxTokens: 8000 });
 * const result = optimizer.optimize(chunks);
 * console.log(`Selected ${result.selectedCount} chunks using ${result.totalTokens} tokens`);
 * ```
 */
export class BudgetOptimizer {
  private config: Required<BudgetConfig>;

  constructor(config: BudgetConfig) {
    this.config = {
      maxTokens: config.maxTokens,
      systemReserve: config.systemReserve ?? 500,
      responseReserve: config.responseReserve ?? 2000,
      minScore: config.minScore ?? 0.1,
      diversityWeight: config.diversityWeight ?? 0.3,
    };
  }

  /**
   * Optimize chunk selection within budget
   */
  optimize(chunks: BudgetChunk[]): BudgetResult {
    const availableBudget =
      this.config.maxTokens - this.config.systemReserve - this.config.responseReserve;

    // Filter by minimum score
    const validChunks = chunks.filter((c) => c.score >= this.config.minScore);

    // Sort by adjusted score (relevance + diversity bonus)
    const selected: BudgetChunk[] = [];
    const usedFiles = new Set<string>();
    let totalTokens = 0;

    // Greedy selection with diversity consideration
    const remaining = [...validChunks];
    while (remaining.length > 0 && totalTokens < availableBudget) {
      // Score each remaining chunk
      const scored = remaining.map((chunk) => {
        // Diversity bonus: prefer chunks from new files
        const diversityBonus = usedFiles.has(chunk.filePath) ? 0 : this.config.diversityWeight;

        // Efficiency: score per token
        const efficiency = chunk.score / Math.max(chunk.tokenCount, 1);

        // Combined score
        const adjustedScore = chunk.score + diversityBonus + efficiency * 0.1;

        return { chunk, adjustedScore };
      });

      // Sort by adjusted score
      scored.sort((a, b) => b.adjustedScore - a.adjustedScore);

      // Pick the best chunk that fits
      let picked = false;
      for (const { chunk } of scored) {
        if (totalTokens + chunk.tokenCount <= availableBudget) {
          selected.push(chunk);
          usedFiles.add(chunk.filePath);
          totalTokens += chunk.tokenCount;

          // Remove from remaining
          const idx = remaining.indexOf(chunk);
          if (idx >= 0) remaining.splice(idx, 1);

          picked = true;
          break;
        }
      }

      // No chunk fits, we're done
      if (!picked) break;
    }

    // Sort selected by file and line for coherent output
    selected.sort((a, b) => {
      const fileCompare = a.filePath.localeCompare(b.filePath);
      if (fileCompare !== 0) return fileCompare;
      return a.startLine - b.startLine;
    });

    const avgScore =
      selected.length > 0 ? selected.reduce((sum, c) => sum + c.score, 0) / selected.length : 0;

    return {
      chunks: selected,
      totalTokens,
      remainingTokens: availableBudget - totalTokens,
      consideredCount: chunks.length,
      selectedCount: selected.length,
      filesCovered: [...usedFiles],
      avgScore,
    };
  }

  /**
   * Optimize with priority files (always include if budget allows)
   */
  optimizeWithPriority(chunks: BudgetChunk[], priorityFiles: string[]): BudgetResult {
    const prioritySet = new Set(priorityFiles);

    // Separate priority and regular chunks
    const priorityChunks = chunks.filter((c) => prioritySet.has(c.filePath));
    const regularChunks = chunks.filter((c) => !prioritySet.has(c.filePath));

    // First, allocate budget for priority chunks
    const availableBudget =
      this.config.maxTokens - this.config.systemReserve - this.config.responseReserve;

    // Sort priority chunks by score
    priorityChunks.sort((a, b) => b.score - a.score);

    const selected: BudgetChunk[] = [];
    let totalTokens = 0;
    const usedFiles = new Set<string>();

    // Add priority chunks
    for (const chunk of priorityChunks) {
      if (totalTokens + chunk.tokenCount <= availableBudget * 0.6) {
        // Max 60% for priority
        selected.push(chunk);
        usedFiles.add(chunk.filePath);
        totalTokens += chunk.tokenCount;
      }
    }

    // Fill remaining budget with regular chunks
    const remainingBudget = availableBudget - totalTokens;
    const tempOptimizer = new BudgetOptimizer({
      ...this.config,
      maxTokens: remainingBudget + this.config.systemReserve + this.config.responseReserve,
    });

    const regularResult = tempOptimizer.optimize(regularChunks);
    selected.push(...regularResult.chunks);
    totalTokens += regularResult.totalTokens;

    for (const chunk of regularResult.chunks) {
      usedFiles.add(chunk.filePath);
    }

    // Sort by file and line
    selected.sort((a, b) => {
      const fileCompare = a.filePath.localeCompare(b.filePath);
      if (fileCompare !== 0) return fileCompare;
      return a.startLine - b.startLine;
    });

    const avgScore =
      selected.length > 0 ? selected.reduce((sum, c) => sum + c.score, 0) / selected.length : 0;

    return {
      chunks: selected,
      totalTokens,
      remainingTokens: availableBudget - totalTokens,
      consideredCount: chunks.length,
      selectedCount: selected.length,
      filesCovered: [...usedFiles],
      avgScore,
    };
  }

  /**
   * Format selected chunks as context string
   */
  formatContext(result: BudgetResult): string {
    const parts: string[] = [];

    let currentFile = '';
    for (const chunk of result.chunks) {
      if (chunk.filePath !== currentFile) {
        currentFile = chunk.filePath;
        parts.push(`\n// ════════════════════════════════════════════════════════════════`);
        parts.push(`// File: ${chunk.filePath}`);
        parts.push(`// ════════════════════════════════════════════════════════════════\n`);
      }

      parts.push(`// Lines ${chunk.startLine}-${chunk.endLine} (${chunk.symbols.join(', ') || 'no symbols'})`);
      parts.push(chunk.content);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Estimate tokens for a string (rough approximation)
   */
  static estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for code
    return Math.ceil(text.length / 4);
  }
}

/**
 * Quick function to optimize chunks within a token budget
 */
export function optimizeContext(
  chunks: BudgetChunk[],
  maxTokens: number,
  options?: Partial<BudgetConfig>
): BudgetResult {
  const optimizer = new BudgetOptimizer({ maxTokens, ...options });
  return optimizer.optimize(chunks);
}

export default BudgetOptimizer;

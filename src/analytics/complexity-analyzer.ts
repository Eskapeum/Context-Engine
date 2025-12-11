/**
 * Universal Context Engine - Complexity Analyzer
 * @module analytics/complexity-analyzer
 *
 * AST-based complexity analysis for code quality metrics.
 * Calculates cyclomatic and cognitive complexity per function and file.
 */

import type { ParsedFile, ParsedFunction } from '../parser/types.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Complexity metrics for a single function
 */
export interface FunctionComplexity {
  /** Function name */
  name: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Cyclomatic complexity (decision points) */
  cyclomaticComplexity: number;
  /** Cognitive complexity (human comprehension difficulty) */
  cognitiveComplexity: number;
  /** Lines of code */
  linesOfCode: number;
  /** Complexity rating */
  rating: 'low' | 'medium' | 'high' | 'very-high';
}

/**
 * Complexity metrics for a file
 */
export interface FileComplexity {
  /** File path */
  filePath: string;
  /** Language */
  language: string;
  /** Average cyclomatic complexity */
  averageCyclomaticComplexity: number;
  /** Average cognitive complexity */
  averageCognitiveComplexity: number;
  /** Maximum complexity in file */
  maxComplexity: number;
  /** Total lines of code */
  totalLines: number;
  /** Function-level metrics */
  functions: FunctionComplexity[];
  /** Overall file rating */
  rating: 'low' | 'medium' | 'high' | 'very-high';
}

/**
 * Project-wide complexity metrics
 */
export interface ProjectComplexity {
  /** Total files analyzed */
  totalFiles: number;
  /** Total functions analyzed */
  totalFunctions: number;
  /** Average cyclomatic complexity */
  averageCyclomaticComplexity: number;
  /** Average cognitive complexity */
  averageCognitiveComplexity: number;
  /** Files with high complexity */
  highComplexityFiles: FileComplexity[];
  /** Functions with very high complexity */
  criticalFunctions: FunctionComplexity[];
  /** Per-file metrics */
  files: FileComplexity[];
}

/**
 * Complexity thresholds
 */
export interface ComplexityThresholds {
  /** Low complexity threshold */
  low: number;
  /** Medium complexity threshold */
  medium: number;
  /** High complexity threshold */
  high: number;
}

// =============================================================================
// Complexity Analyzer
// =============================================================================

/**
 * Analyzes code complexity using AST-based metrics
 *
 * Usage:
 * ```typescript
 * const analyzer = new ComplexityAnalyzer();
 * const complexity = analyzer.analyzeFile(parsedFile);
 * console.log(complexity.rating); // 'low', 'medium', 'high', 'very-high'
 * ```
 */
export class ComplexityAnalyzer {
  private thresholds: ComplexityThresholds;

  constructor(thresholds?: Partial<ComplexityThresholds>) {
    this.thresholds = {
      low: thresholds?.low ?? 5,
      medium: thresholds?.medium ?? 10,
      high: thresholds?.high ?? 20,
    };
  }

  /**
   * Analyze complexity for a single file
   */
  analyzeFile(parsedFile: ParsedFile): FileComplexity {
    const functions: FunctionComplexity[] = [];

    for (const func of parsedFile.functions) {
      const complexity = this.analyzeFunction(func, parsedFile.content);
      functions.push(complexity);
    }

    const avgCyclomatic =
      functions.length > 0
        ? functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) / functions.length
        : 0;

    const avgCognitive =
      functions.length > 0
        ? functions.reduce((sum, f) => sum + f.cognitiveComplexity, 0) / functions.length
        : 0;

    const maxComplexity = Math.max(
      ...functions.map((f) => Math.max(f.cyclomaticComplexity, f.cognitiveComplexity)),
      0
    );

    return {
      filePath: parsedFile.path,
      language: parsedFile.language,
      averageCyclomaticComplexity: avgCyclomatic,
      averageCognitiveComplexity: avgCognitive,
      maxComplexity,
      totalLines: parsedFile.content.split('\n').length,
      functions,
      rating: this.getRating(Math.max(avgCyclomatic, avgCognitive)),
    };
  }

  /**
   * Analyze complexity for a single function
   */
  analyzeFunction(func: ParsedFunction, fileContent: string): FunctionComplexity {
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(func, fileContent);
    const cognitiveComplexity = this.calculateCognitiveComplexity(func, fileContent);
    const linesOfCode = func.endLine - func.startLine + 1;

    return {
      name: func.name,
      startLine: func.startLine,
      endLine: func.endLine,
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode,
      rating: this.getRating(Math.max(cyclomaticComplexity, cognitiveComplexity)),
    };
  }

  /**
   * Analyze complexity for multiple files
   */
  analyzeProject(parsedFiles: ParsedFile[]): ProjectComplexity {
    const files: FileComplexity[] = [];
    let totalFunctions = 0;
    let sumCyclomatic = 0;
    let sumCognitive = 0;

    for (const parsedFile of parsedFiles) {
      try {
        const fileComplexity = this.analyzeFile(parsedFile);
        files.push(fileComplexity);

        totalFunctions += fileComplexity.functions.length;
        sumCyclomatic += fileComplexity.averageCyclomaticComplexity * fileComplexity.functions.length;
        sumCognitive += fileComplexity.averageCognitiveComplexity * fileComplexity.functions.length;
      } catch (error) {
        logger.warn('Failed to analyze file complexity', {
          file: parsedFile.path,
          error,
        });
      }
    }

    const avgCyclomatic = totalFunctions > 0 ? sumCyclomatic / totalFunctions : 0;
    const avgCognitive = totalFunctions > 0 ? sumCognitive / totalFunctions : 0;

    const highComplexityFiles = files.filter(
      (f) => f.rating === 'high' || f.rating === 'very-high'
    );

    const criticalFunctions: FunctionComplexity[] = [];
    for (const file of files) {
      criticalFunctions.push(...file.functions.filter((f) => f.rating === 'very-high'));
    }

    return {
      totalFiles: files.length,
      totalFunctions,
      averageCyclomaticComplexity: avgCyclomatic,
      averageCognitiveComplexity: avgCognitive,
      highComplexityFiles,
      criticalFunctions,
      files,
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Calculate cyclomatic complexity (McCabe metric)
   * Counts decision points: if, while, for, case, &&, ||, ?, catch
   */
  private calculateCyclomaticComplexity(func: ParsedFunction, fileContent: string): number {
    const funcContent = this.extractFunctionContent(func, fileContent);

    let complexity = 1; // Base complexity

    // Decision keywords
    const decisionPatterns = [
      /\bif\s*\(/g,
      /\bwhile\s*\(/g,
      /\bfor\s*\(/g,
      /\bcase\b/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]+:/g, // Ternary operator
      /&&/g,
      /\|\|/g,
    ];

    for (const pattern of decisionPatterns) {
      const matches = funcContent.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate cognitive complexity
   * Weights complexity based on nesting level and flow breaks
   */
  private calculateCognitiveComplexity(func: ParsedFunction, fileContent: string): number {
    const funcContent = this.extractFunctionContent(func, fileContent);
    let complexity = 0;
    let nestingLevel = 0;

    // Split into lines for nesting analysis
    const lines = funcContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Track nesting level
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      // Decision points with nesting penalty
      const hasIf = /\bif\s*\(/.test(trimmed);
      const hasWhile = /\bwhile\s*\(/.test(trimmed);
      const hasFor = /\bfor\s*\(/.test(trimmed);
      const hasSwitch = /\bswitch\s*\(/.test(trimmed);
      const hasCatch = /\bcatch\s*\(/.test(trimmed);

      if (hasIf || hasWhile || hasFor || hasSwitch || hasCatch) {
        complexity += 1 + nestingLevel;
      }

      // Logical operators
      const andOr = (trimmed.match(/&&|\|\|/g) || []).length;
      if (andOr > 0) {
        complexity += andOr;
      }

      // Flow breaks
      const hasBreak = /\bbreak\b/.test(trimmed);
      const hasContinue = /\bcontinue\b/.test(trimmed);
      const hasReturn = /\breturn\b/.test(trimmed);

      if (hasBreak || hasContinue || hasReturn) {
        complexity += 1;
      }

      // Update nesting level
      nestingLevel += openBraces - closeBraces;
      if (nestingLevel < 0) nestingLevel = 0;
    }

    return complexity;
  }

  /**
   * Extract function content from file
   */
  private extractFunctionContent(func: ParsedFunction, fileContent: string): string {
    const lines = fileContent.split('\n');
    return lines.slice(func.startLine - 1, func.endLine).join('\n');
  }

  /**
   * Get complexity rating
   */
  private getRating(complexity: number): 'low' | 'medium' | 'high' | 'very-high' {
    if (complexity <= this.thresholds.low) return 'low';
    if (complexity <= this.thresholds.medium) return 'medium';
    if (complexity <= this.thresholds.high) return 'high';
    return 'very-high';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new complexity analyzer
 */
export function createComplexityAnalyzer(
  thresholds?: Partial<ComplexityThresholds>
): ComplexityAnalyzer {
  return new ComplexityAnalyzer(thresholds);
}

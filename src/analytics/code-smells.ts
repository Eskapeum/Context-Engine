/**
 * Universal Context Engine - Code Smells Detector
 * @module analytics/code-smells
 *
 * Pattern-based detection of common code smells.
 * Identifies maintainability issues and refactoring opportunities.
 */

import type { ParsedFile, ParsedFunction, ParsedClass } from '../parser/types.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of code smells
 */
export type CodeSmellType =
  | 'long-method'
  | 'long-parameter-list'
  | 'god-class'
  | 'duplicate-code'
  | 'dead-code'
  | 'magic-number'
  | 'deep-nesting'
  | 'complex-conditional';

/**
 * Severity levels
 */
export type SmellSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Individual code smell instance
 */
export interface CodeSmell {
  /** Type of smell */
  type: CodeSmellType;
  /** Severity level */
  severity: SmellSeverity;
  /** File path */
  filePath: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Description */
  message: string;
  /** Suggested fix */
  suggestion?: string;
  /** Metrics that triggered the smell */
  metrics?: Record<string, number>;
}

/**
 * File-level smell report
 */
export interface FileSmellReport {
  /** File path */
  filePath: string;
  /** Total smells found */
  totalSmells: number;
  /** Smells by severity */
  bySeverity: Record<SmellSeverity, number>;
  /** All detected smells */
  smells: CodeSmell[];
}

/**
 * Project-level smell report
 */
export interface ProjectSmellReport {
  /** Total files analyzed */
  totalFiles: number;
  /** Total smells found */
  totalSmells: number;
  /** Smells by type */
  byType: Record<CodeSmellType, number>;
  /** Smells by severity */
  bySeverity: Record<SmellSeverity, number>;
  /** Per-file reports */
  files: FileSmellReport[];
  /** Critical issues requiring immediate attention */
  criticalIssues: CodeSmell[];
}

/**
 * Smell detection thresholds
 */
export interface SmellThresholds {
  /** Long method line count */
  longMethodLines: number;
  /** Long parameter list count */
  longParameterCount: number;
  /** God class method count */
  godClassMethods: number;
  /** Deep nesting level */
  deepNestingLevel: number;
  /** Duplicate code minimum lines */
  duplicateCodeLines: number;
}

// =============================================================================
// Code Smells Detector
// =============================================================================

/**
 * Detects common code smells in parsed code
 *
 * Usage:
 * ```typescript
 * const detector = new CodeSmellsDetector();
 * const report = detector.analyzeFile(parsedFile);
 * console.log(`Found ${report.totalSmells} code smells`);
 * ```
 */
export class CodeSmellsDetector {
  private thresholds: SmellThresholds;

  constructor(thresholds?: Partial<SmellThresholds>) {
    this.thresholds = {
      longMethodLines: thresholds?.longMethodLines ?? 50,
      longParameterCount: thresholds?.longParameterCount ?? 5,
      godClassMethods: thresholds?.godClassMethods ?? 20,
      deepNestingLevel: thresholds?.deepNestingLevel ?? 4,
      duplicateCodeLines: thresholds?.duplicateCodeLines ?? 6,
    };
  }

  /**
   * Analyze a single file for code smells
   */
  analyzeFile(parsedFile: ParsedFile): FileSmellReport {
    const smells: CodeSmell[] = [];

    // Analyze functions
    for (const func of parsedFile.functions) {
      smells.push(...this.analyzeFunctionSmells(func, parsedFile));
    }

    // Analyze classes
    for (const cls of parsedFile.classes) {
      smells.push(...this.analyzeClassSmells(cls, parsedFile));
    }

    // Analyze file-level smells
    smells.push(...this.analyzeFileSmells(parsedFile));

    const bySeverity: Record<SmellSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const smell of smells) {
      bySeverity[smell.severity]++;
    }

    return {
      filePath: parsedFile.path,
      totalSmells: smells.length,
      bySeverity,
      smells,
    };
  }

  /**
   * Analyze multiple files
   */
  analyzeProject(parsedFiles: ParsedFile[]): ProjectSmellReport {
    const files: FileSmellReport[] = [];
    const byType: Record<CodeSmellType, number> = {
      'long-method': 0,
      'long-parameter-list': 0,
      'god-class': 0,
      'duplicate-code': 0,
      'dead-code': 0,
      'magic-number': 0,
      'deep-nesting': 0,
      'complex-conditional': 0,
    };
    const bySeverity: Record<SmellSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const parsedFile of parsedFiles) {
      try {
        const report = this.analyzeFile(parsedFile);
        files.push(report);

        for (const smell of report.smells) {
          byType[smell.type]++;
          bySeverity[smell.severity]++;
        }
      } catch (error) {
        logger.warn('Failed to analyze file for code smells', {
          file: parsedFile.path,
          error,
        });
      }
    }

    const allSmells = files.flatMap((f) => f.smells);
    const criticalIssues = allSmells.filter((s) => s.severity === 'critical');

    return {
      totalFiles: files.length,
      totalSmells: allSmells.length,
      byType,
      bySeverity,
      files,
      criticalIssues,
    };
  }

  // =============================================================================
  // Private Methods - Function Smells
  // =============================================================================

  private analyzeFunctionSmells(func: ParsedFunction, file: ParsedFile): CodeSmell[] {
    const smells: CodeSmell[] = [];

    // Long method
    const lines = func.endLine - func.startLine + 1;
    if (lines > this.thresholds.longMethodLines) {
      smells.push({
        type: 'long-method',
        severity: this.getSeverity('long-method', lines),
        filePath: file.path,
        startLine: func.startLine,
        endLine: func.endLine,
        message: `Function '${func.name}' is too long (${lines} lines)`,
        suggestion: 'Consider breaking this function into smaller, focused functions',
        metrics: { lines },
      });
    }

    // Long parameter list
    const paramCount = func.parameters?.length ?? 0;
    if (paramCount > this.thresholds.longParameterCount) {
      smells.push({
        type: 'long-parameter-list',
        severity: this.getSeverity('long-parameter-list', paramCount),
        filePath: file.path,
        startLine: func.startLine,
        endLine: func.endLine,
        message: `Function '${func.name}' has too many parameters (${paramCount})`,
        suggestion: 'Consider using an options object or breaking into smaller functions',
        metrics: { parameters: paramCount },
      });
    }

    // Deep nesting and complex conditionals
    const funcContent = this.extractContent(file.content, func.startLine, func.endLine);
    const maxNesting = this.calculateMaxNesting(funcContent);
    if (maxNesting > this.thresholds.deepNestingLevel) {
      smells.push({
        type: 'deep-nesting',
        severity: this.getSeverity('deep-nesting', maxNesting),
        filePath: file.path,
        startLine: func.startLine,
        endLine: func.endLine,
        message: `Function '${func.name}' has deep nesting (${maxNesting} levels)`,
        suggestion: 'Reduce nesting by extracting methods or using early returns',
        metrics: { nestingLevel: maxNesting },
      });
    }

    // Magic numbers
    const magicNumbers = this.detectMagicNumbers(funcContent);
    if (magicNumbers.length > 0) {
      smells.push({
        type: 'magic-number',
        severity: 'low',
        filePath: file.path,
        startLine: func.startLine,
        endLine: func.endLine,
        message: `Function '${func.name}' contains ${magicNumbers.length} magic number(s)`,
        suggestion: 'Replace magic numbers with named constants',
        metrics: { count: magicNumbers.length },
      });
    }

    return smells;
  }

  // =============================================================================
  // Private Methods - Class Smells
  // =============================================================================

  private analyzeClassSmells(cls: ParsedClass, file: ParsedFile): CodeSmell[] {
    const smells: CodeSmell[] = [];

    // God class (too many methods)
    const methodCount = cls.methods?.length ?? 0;
    if (methodCount > this.thresholds.godClassMethods) {
      smells.push({
        type: 'god-class',
        severity: this.getSeverity('god-class', methodCount),
        filePath: file.path,
        startLine: cls.startLine,
        endLine: cls.endLine,
        message: `Class '${cls.name}' has too many methods (${methodCount})`,
        suggestion: 'Consider splitting into multiple smaller, focused classes',
        metrics: { methods: methodCount },
      });
    }

    return smells;
  }

  // =============================================================================
  // Private Methods - File-Level Smells
  // =============================================================================

  private analyzeFileSmells(file: ParsedFile): CodeSmell[] {
    const smells: CodeSmell[] = [];

    // Duplicate code detection (simplified)
    const duplicates = this.detectDuplicateCode(file.content);
    for (const dup of duplicates) {
      smells.push({
        type: 'duplicate-code',
        severity: 'medium',
        filePath: file.path,
        startLine: dup.startLine,
        endLine: dup.endLine,
        message: `Duplicate code block detected (${dup.lines} lines)`,
        suggestion: 'Extract duplicate code into a reusable function',
        metrics: { lines: dup.lines },
      });
    }

    return smells;
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private extractContent(fileContent: string, startLine: number, endLine: number): string {
    const lines = fileContent.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  private calculateMaxNesting(content: string): number {
    let maxNesting = 0;
    let currentNesting = 0;

    for (const line of content.split('\n')) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      currentNesting += openBraces - closeBraces;
      if (currentNesting > maxNesting) {
        maxNesting = currentNesting;
      }
      if (currentNesting < 0) currentNesting = 0;
    }

    return maxNesting;
  }

  private detectMagicNumbers(content: string): number[] {
    const numbers: number[] = [];

    // Match numeric literals (excluding 0, 1, -1, and numbers in variable declarations)
    const numberPattern = /(?<!const|let|var)\s+(-?\d+\.?\d*)/g;
    let match;

    while ((match = numberPattern.exec(content)) !== null) {
      const num = parseFloat(match[1]);
      // Ignore common numbers
      if (num !== 0 && num !== 1 && num !== -1) {
        numbers.push(num);
      }
    }

    return numbers;
  }

  private detectDuplicateCode(
    content: string
  ): Array<{ startLine: number; endLine: number; lines: number }> {
    const duplicates: Array<{ startLine: number; endLine: number; lines: number }> = [];
    const lines = content.split('\n');
    const minLines = this.thresholds.duplicateCodeLines;

    // Simple duplicate detection: look for identical line sequences
    for (let i = 0; i < lines.length - minLines; i++) {
      const block = lines.slice(i, i + minLines).join('\n').trim();

      // Skip empty or very short blocks
      if (block.length < 50) continue;

      // Look for this block elsewhere in the file
      for (let j = i + minLines; j < lines.length - minLines; j++) {
        const otherBlock = lines.slice(j, j + minLines).join('\n').trim();

        if (block === otherBlock) {
          duplicates.push({
            startLine: i + 1,
            endLine: i + minLines,
            lines: minLines,
          });
          break; // Found one duplicate, move on
        }
      }
    }

    return duplicates;
  }

  private getSeverity(type: CodeSmellType, value: number): SmellSeverity {
    const thresholds = {
      'long-method': { low: 50, medium: 100, high: 200 },
      'long-parameter-list': { low: 5, medium: 7, high: 10 },
      'god-class': { low: 20, medium: 30, high: 50 },
      'deep-nesting': { low: 4, medium: 6, high: 8 },
      'duplicate-code': { low: 6, medium: 12, high: 20 },
      'magic-number': { low: 3, medium: 6, high: 10 },
      'complex-conditional': { low: 3, medium: 5, high: 7 },
      'dead-code': { low: 1, medium: 1, high: 1 },
    };

    const t = thresholds[type];
    if (value <= t.low) return 'low';
    if (value <= t.medium) return 'medium';
    if (value <= t.high) return 'high';
    return 'critical';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new code smells detector
 */
export function createCodeSmellsDetector(
  thresholds?: Partial<SmellThresholds>
): CodeSmellsDetector {
  return new CodeSmellsDetector(thresholds);
}

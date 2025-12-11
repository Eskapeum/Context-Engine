/**
 * Universal Context Engine - Analytics Module
 * @module analytics
 *
 * Code quality metrics, complexity analysis, and pattern detection.
 */

// Complexity Analyzer
export * from './complexity-analyzer.js';
export { ComplexityAnalyzer, createComplexityAnalyzer } from './complexity-analyzer.js';
export type {
  FunctionComplexity,
  FileComplexity,
  ProjectComplexity,
  ComplexityThresholds,
} from './complexity-analyzer.js';

// Code Smells Detector
export * from './code-smells.js';
export { CodeSmellsDetector, createCodeSmellsDetector } from './code-smells.js';
export type {
  CodeSmell,
  CodeSmellType,
  SmellSeverity,
  FileSmellReport,
  ProjectSmellReport,
  SmellThresholds,
} from './code-smells.js';

// Pattern Detection
export * from './pattern-detection.js';
export { PatternDetector, createPatternDetector } from './pattern-detection.js';
export type {
  DetectedPattern,
  PatternCategory,
  ArchitecturePattern,
  DesignPattern,
  APIPattern,
  PatternDetectionResult,
} from './pattern-detection.js';

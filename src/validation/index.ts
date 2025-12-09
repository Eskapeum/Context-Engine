/**
 * Universal Context Engine (UCE) - Validation Module
 * @module validation
 *
 * Index quality assurance with traffic light confidence.
 */

// Core checks
export {
  validateFile,
  checkFileValid,
  checkParseSuccess,
  checkSymbolsFound,
  type CheckResult,
  type ConfidenceLevel,
  type ValidationResult,
} from './checks.js';

// Confidence scoring
export {
  CONFIDENCE_INDICATORS,
  CONFIDENCE_GUIDANCE,
  getConfidenceIndicator,
  getConfidenceLabel,
  getConfidenceGuidance,
  calculateConfidenceSummary,
  formatConfidenceSummary,
  type ConfidenceSummary,
} from './confidence.js';

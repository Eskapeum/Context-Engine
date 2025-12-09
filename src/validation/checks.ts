/**
 * Universal Context Engine (UCE) - Validation Checks
 * @module validation/checks
 *
 * Core validation checks for indexing quality assurance.
 * Architecture Reference: Step 3 - Index Quality Assurance System
 *
 * MVP implements 3 core checks with traffic light confidence.
 */

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { logger } from '../utils/logger.js';
import { isBinaryExtension } from '../utils/paths.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a single validation check
 */
export interface CheckResult {
  /** Check passed */
  passed: boolean;
  /** Human-readable message */
  message: string;
  /** Severity if failed */
  severity?: 'error' | 'warning';
}

/**
 * Confidence levels for validation results
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Complete validation result for a file
 */
export interface ValidationResult {
  /** File path that was validated */
  filePath: string;
  /** Overall confidence level */
  confidence: ConfidenceLevel;
  /** Individual check results */
  checks: {
    fileValid: CheckResult;
    parseSuccess: CheckResult;
    symbolsFound: CheckResult;
  };
  /** Recommended action */
  action: 'index' | 'skip' | 'partial';
}

// =============================================================================
// MVP Core Checks (3 Checks)
// =============================================================================

/**
 * Check 1: File Valid
 * Rule: File exists, readable, not binary
 */
export async function checkFileValid(filePath: string): Promise<CheckResult> {
  // Check exists
  if (!existsSync(filePath)) {
    return {
      passed: false,
      message: 'File does not exist',
      severity: 'error',
    };
  }

  // Check binary by extension
  if (isBinaryExtension(filePath)) {
    return {
      passed: false,
      message: 'Binary file detected by extension',
      severity: 'warning',
    };
  }

  // Check readable and not binary by content
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return {
        passed: false,
        message: 'Not a regular file',
        severity: 'error',
      };
    }

    // Read first 8KB to check for binary content
    const buffer = await readFile(filePath);
    const sample = buffer.slice(0, 8192);

    // Check for null bytes (binary indicator)
    if (sample.includes(0)) {
      return {
        passed: false,
        message: 'Binary content detected (null bytes)',
        severity: 'warning',
      };
    }

    return {
      passed: true,
      message: 'File is valid and readable',
    };
  } catch (error) {
    return {
      passed: false,
      message: `Cannot read file: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'error',
    };
  }
}

/**
 * Check 2: Parse Success
 * Rule: AST parses OR tokenization fallback works
 *
 * @param parseResult - Result from parser (AST success or fallback)
 */
export function checkParseSuccess(parseResult: {
  success: boolean;
  method: 'ast' | 'tokenization';
  errorCount?: number;
}): CheckResult {
  if (parseResult.success) {
    return {
      passed: true,
      message:
        parseResult.method === 'ast'
          ? 'AST parsed successfully'
          : 'Tokenization fallback successful',
    };
  }

  return {
    passed: false,
    message: `Parse failed: ${parseResult.errorCount || 'unknown'} errors`,
    severity: 'warning',
  };
}

/**
 * Check 3: Symbols Found
 * Rule: At least 1 symbol extracted (for code files)
 *
 * @param symbolCount - Number of symbols extracted
 * @param isCodeFile - Whether this is expected to be a code file
 */
export function checkSymbolsFound(
  symbolCount: number,
  isCodeFile: boolean
): CheckResult {
  if (symbolCount > 0) {
    return {
      passed: true,
      message: `Found ${symbolCount} symbol${symbolCount === 1 ? '' : 's'}`,
    };
  }

  if (!isCodeFile) {
    return {
      passed: true,
      message: 'Data file (no symbols expected)',
    };
  }

  return {
    passed: false,
    message: 'No symbols extracted from code file',
    severity: 'warning',
  };
}

// =============================================================================
// Validation Runner
// =============================================================================

/**
 * Run all validation checks on a file
 */
export async function validateFile(
  filePath: string,
  parseResult?: { success: boolean; method: 'ast' | 'tokenization'; errorCount?: number },
  symbolCount?: number,
  isCodeFile?: boolean
): Promise<ValidationResult> {
  // Check 1: File Valid
  const fileValid = await checkFileValid(filePath);

  // Check 2: Parse Success (if parse result provided)
  const parseSuccess = parseResult
    ? checkParseSuccess(parseResult)
    : { passed: true, message: 'Parse not attempted' };

  // Check 3: Symbols Found (if symbol count provided)
  const symbolsFound =
    symbolCount !== undefined
      ? checkSymbolsFound(symbolCount, isCodeFile ?? true)
      : { passed: true, message: 'Symbol check not performed' };

  // Determine confidence level
  const checks = { fileValid, parseSuccess, symbolsFound };
  const confidence = calculateConfidence(checks);
  const action = determineAction(checks);

  const result: ValidationResult = {
    filePath,
    confidence,
    checks,
    action,
  };

  // Log result
  logValidationResult(result);

  return result;
}

/**
 * Calculate confidence level from check results
 */
function calculateConfidence(checks: ValidationResult['checks']): ConfidenceLevel {
  const { fileValid, parseSuccess, symbolsFound } = checks;

  // All passed = high confidence
  if (fileValid.passed && parseSuccess.passed && symbolsFound.passed) {
    return 'high';
  }

  // File invalid = low confidence
  if (!fileValid.passed) {
    return 'low';
  }

  // Parse or symbols failed = medium confidence
  return 'medium';
}

/**
 * Determine action based on check results
 */
function determineAction(
  checks: ValidationResult['checks']
): 'index' | 'skip' | 'partial' {
  const { fileValid, parseSuccess } = checks;

  // File invalid = skip
  if (!fileValid.passed && fileValid.severity === 'error') {
    return 'skip';
  }

  // Binary file = skip
  if (!fileValid.passed) {
    return 'skip';
  }

  // Parse failed = partial (tokenization fallback)
  if (!parseSuccess.passed) {
    return 'partial';
  }

  // All good = index
  return 'index';
}

/**
 * Log validation result
 */
function logValidationResult(result: ValidationResult): void {
  const { filePath, confidence, action } = result;

  switch (confidence) {
    case 'high':
      logger.debug('Validation passed', { filePath, action });
      break;
    case 'medium':
      logger.debug('Validation partial', { filePath, action });
      break;
    case 'low':
      logger.debug('Validation failed', { filePath, action });
      break;
  }
}

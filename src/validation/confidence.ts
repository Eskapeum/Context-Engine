/**
 * Universal Context Engine (UCE) - Confidence Scoring
 * @module validation/confidence
 *
 * Traffic light confidence display for validation results.
 * Architecture Reference: Step 3 - MVP Confidence Display
 */

import type { ConfidenceLevel, ValidationResult } from './checks.js';

// =============================================================================
// Traffic Light Display
// =============================================================================

/**
 * Traffic light indicators for confidence levels
 */
export const CONFIDENCE_INDICATORS = {
  high: { emoji: '🟢', text: '[GREEN]', label: 'High' },
  medium: { emoji: '🟡', text: '[YELLOW]', label: 'Medium' },
  low: { emoji: '🔴', text: '[RED]', label: 'Low' },
} as const;

/**
 * Get confidence indicator for display
 */
export function getConfidenceIndicator(
  confidence: ConfidenceLevel,
  useEmoji = true
): string {
  const indicator = CONFIDENCE_INDICATORS[confidence];
  return useEmoji ? indicator.emoji : indicator.text;
}

/**
 * Get confidence label
 */
export function getConfidenceLabel(confidence: ConfidenceLevel): string {
  return CONFIDENCE_INDICATORS[confidence].label;
}

// =============================================================================
// Confidence Summary
// =============================================================================

/**
 * Summary of confidence levels across multiple files
 */
export interface ConfidenceSummary {
  /** Number of files with high confidence */
  high: number;
  /** Number of files with medium confidence */
  medium: number;
  /** Number of files with low confidence (skipped) */
  low: number;
  /** Total files processed */
  total: number;
  /** Overall health indicator */
  health: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Calculate confidence summary from validation results
 */
export function calculateConfidenceSummary(
  results: ValidationResult[]
): ConfidenceSummary {
  const summary: ConfidenceSummary = {
    high: 0,
    medium: 0,
    low: 0,
    total: results.length,
    health: 'healthy',
  };

  for (const result of results) {
    summary[result.confidence]++;
  }

  // Determine health
  if (summary.total === 0) {
    summary.health = 'unhealthy';
  } else {
    const highRatio = summary.high / summary.total;
    const lowRatio = summary.low / summary.total;

    if (lowRatio > 0.5) {
      summary.health = 'unhealthy';
    } else if (highRatio < 0.7) {
      summary.health = 'degraded';
    }
  }

  return summary;
}

/**
 * Format confidence summary for display
 */
export function formatConfidenceSummary(
  summary: ConfidenceSummary,
  useEmoji = true
): string {
  const green = getConfidenceIndicator('high', useEmoji);
  const yellow = getConfidenceIndicator('medium', useEmoji);
  const red = getConfidenceIndicator('low', useEmoji);

  const lines = [
    `${green} High confidence: ${summary.high} files`,
    `${yellow} Medium confidence: ${summary.medium} files`,
    `${red} Low confidence: ${summary.low} files`,
    '',
    `Total: ${summary.total} files`,
    `Health: ${summary.health}`,
  ];

  return lines.join('\n');
}

// =============================================================================
// Action Guidance
// =============================================================================

/**
 * User action guidance based on confidence level
 */
export const CONFIDENCE_GUIDANCE = {
  high: 'Use with confidence. All checks passed.',
  medium:
    'Use with awareness. Some checks had warnings (e.g., tokenization fallback).',
  low: 'Check file. Failed validation - file may be binary, inaccessible, or corrupted.',
} as const;

/**
 * Get user guidance for a confidence level
 */
export function getConfidenceGuidance(confidence: ConfidenceLevel): string {
  return CONFIDENCE_GUIDANCE[confidence];
}

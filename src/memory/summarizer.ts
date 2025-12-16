/**
 * Session Summarizer
 *
 * Compresses Q&A history into concise summaries.
 * Uses extractive techniques for local-first operation,
 * with optional LLM enhancement.
 *
 * @module memory/summarizer
 */

import { randomUUID } from 'crypto';
import type {
  Query,
  SessionSummary,
  SummarizerConfig,
  SummarizationInput,
} from './types.js';
import { DEFAULT_SUMMARIZER_CONFIG } from './types.js';

// ============================================================================
// SUMMARIZER
// ============================================================================

/**
 * Summarizes Q&A sessions into compressed representations
 *
 * @example
 * ```ts
 * const summarizer = new SessionSummarizer();
 *
 * const summary = await summarizer.summarize({
 *   queries: session.queries,
 * });
 *
 * console.log(summary.topics);
 * console.log(summary.keyFindings);
 * ```
 */
export class SessionSummarizer {
  private _config: SummarizerConfig;

  constructor(config: Partial<SummarizerConfig> = {}) {
    this._config = { ...DEFAULT_SUMMARIZER_CONFIG, ...config };
  }

  /** Get current configuration */
  get config(): SummarizerConfig {
    return this._config;
  }

  /**
   * Summarize a set of queries into a compressed representation
   */
  async summarize(input: SummarizationInput): Promise<SessionSummary> {
    const { queries } = input;

    if (queries.length === 0) {
      return this.createEmptySummary();
    }

    // Extract topics from queries
    const topics = this.extractTopics(queries);

    // Extract key findings
    const keyFindings = this.extractKeyFindings(queries);

    // Collect files and symbols mentioned
    const filesMentioned = this.collectFiles(queries);
    const symbolsMentioned = this.collectSymbols(queries);

    // Calculate compression ratio
    const originalSize = this.calculateOriginalSize(queries);
    const summarySize = this.calculateSummarySize(topics, keyFindings, filesMentioned);
    const compressionRatio = summarySize / originalSize;

    return {
      id: randomUUID(),
      topics,
      keyFindings,
      filesMentioned,
      symbolsMentioned,
      compressionRatio,
      generatedAt: new Date().toISOString(),
      queryCount: queries.length,
    };
  }

  /**
   * Summarize incrementally (add new queries to existing summary)
   */
  async summarizeIncremental(
    existingSummary: SessionSummary,
    newQueries: Query[]
  ): Promise<SessionSummary> {
    // Extract new topics and findings
    const newTopics = this.extractTopics(newQueries);
    const newFindings = this.extractKeyFindings(newQueries);
    const newFiles = this.collectFiles(newQueries);
    const newSymbols = this.collectSymbols(newQueries);

    // Merge with existing
    const mergedTopics = [...new Set([...existingSummary.topics, ...newTopics])].slice(0, 10);
    const mergedFindings = this.mergeFindings(existingSummary.keyFindings, newFindings);
    const mergedFiles = [...new Set([...existingSummary.filesMentioned, ...newFiles])];
    const mergedSymbols = [...new Set([...existingSummary.symbolsMentioned, ...newSymbols])];

    // Recalculate compression
    const originalSize = this.calculateOriginalSize(newQueries);
    const summarySize = this.calculateSummarySize(mergedTopics, mergedFindings, mergedFiles);
    const compressionRatio = summarySize / (originalSize + 1000); // Approximate existing size

    return {
      ...existingSummary,
      topics: mergedTopics,
      keyFindings: mergedFindings,
      filesMentioned: mergedFiles,
      symbolsMentioned: mergedSymbols,
      compressionRatio,
      generatedAt: new Date().toISOString(),
      queryCount: existingSummary.queryCount + newQueries.length,
    };
  }

  // ============================================================================
  // PRIVATE EXTRACTION METHODS
  // ============================================================================

  private extractTopics(queries: Query[]): string[] {
    const topics = new Map<string, number>();

    for (const query of queries) {
      // Extract from questions
      const questionTopics = this.extractTopicsFromText(query.question);
      for (const topic of questionTopics) {
        topics.set(topic, (topics.get(topic) || 0) + 2); // Higher weight for questions
      }

      // Extract from files
      for (const file of query.filesReferenced) {
        const fileTopic = this.extractTopicFromPath(file);
        if (fileTopic) {
          topics.set(fileTopic, (topics.get(fileTopic) || 0) + 1);
        }
      }

      // Extract from symbols
      for (const symbol of query.symbolsDiscussed) {
        const symbolTopic = this.normalizeSymbol(symbol);
        topics.set(symbolTopic, (topics.get(symbolTopic) || 0) + 1);
      }
    }

    // Return top topics sorted by frequency
    return [...topics.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  private extractTopicsFromText(text: string): string[] {
    const topics: string[] = [];

    // Common programming concepts
    const patterns = [
      /authentication|auth|login|logout|session/gi,
      /database|db|query|sql|orm/gi,
      /api|endpoint|route|rest|graphql/gi,
      /test|testing|spec|mock/gi,
      /component|widget|view|ui/gi,
      /error|exception|bug|fix/gi,
      /performance|optimization|cache/gi,
      /security|validation|sanitize/gi,
      /deploy|build|ci|cd/gi,
      /refactor|restructure|cleanup/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        const normalized = matches[0].toLowerCase();
        if (!topics.includes(normalized)) {
          topics.push(normalized);
        }
      }
    }

    // Extract CamelCase/PascalCase identifiers
    const identifiers = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g) || [];
    for (const id of identifiers.slice(0, 3)) {
      const normalized = id.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
      if (!topics.includes(normalized) && normalized.length > 3) {
        topics.push(normalized);
      }
    }

    return topics.slice(0, 5);
  }

  private extractTopicFromPath(filePath: string): string | null {
    // Extract meaningful directory or file names
    const parts = filePath.split('/').filter(Boolean);
    const meaningful = parts.filter(
      (p) => !['src', 'lib', 'dist', 'build', 'index', 'node_modules'].includes(p)
    );

    if (meaningful.length > 0) {
      // Return second-to-last meaningful part (usually the module/feature name)
      const idx = Math.max(0, meaningful.length - 2);
      return meaningful[idx].replace(/\.(ts|js|tsx|jsx|py|go|rs)$/, '');
    }
    return null;
  }

  private normalizeSymbol(symbol: string): string {
    // Remove common prefixes/suffixes and normalize
    return symbol
      .replace(/^(get|set|is|has|can|should|will|do)/, '')
      .replace(/(Handler|Manager|Service|Controller|Component|Provider)$/, '')
      .toLowerCase()
      .trim();
  }

  private extractKeyFindings(queries: Query[]): string[] {
    const findings: string[] = [];

    for (const query of queries) {
      // Extract key sentences from responses
      if (query.successful && query.response) {
        const sentences = this.extractKeySentences(query.response);
        findings.push(...sentences);
      }

      // If many files referenced, note it
      if (query.filesReferenced.length >= 5) {
        findings.push(
          `Cross-file investigation involving ${query.filesReferenced.length} files`
        );
      }
    }

    // Deduplicate and limit
    return [...new Set(findings)].slice(0, 8);
  }

  private extractKeySentences(text: string): string[] {
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);

    // Look for key patterns
    const keyPatterns = [
      /the (?:main|key|important|critical) (?:issue|problem|point)/i,
      /(?:should|must|need to) (?:be|use|implement)/i,
      /(?:found|discovered|identified) (?:that|a|the)/i,
      /(?:solution|fix|approach) (?:is|was|involves)/i,
      /(?:because|since|due to)/i,
    ];

    const keySentences: string[] = [];
    for (const sentence of sentences) {
      for (const pattern of keyPatterns) {
        if (pattern.test(sentence) && sentence.length > 20 && sentence.length < 200) {
          keySentences.push(sentence);
          break;
        }
      }
    }

    return keySentences.slice(0, 3);
  }

  private mergeFindings(existing: string[], newFindings: string[]): string[] {
    // Simple merge with deduplication
    const all = [...existing, ...newFindings];
    const unique = [...new Set(all)];

    // Limit total findings
    return unique.slice(0, 10);
  }

  private collectFiles(queries: Query[]): string[] {
    const files = new Set<string>();
    for (const query of queries) {
      for (const file of query.filesReferenced) {
        files.add(file);
      }
    }
    return [...files];
  }

  private collectSymbols(queries: Query[]): string[] {
    const symbols = new Set<string>();
    for (const query of queries) {
      for (const symbol of query.symbolsDiscussed) {
        symbols.add(symbol);
      }
    }
    return [...symbols];
  }

  // ============================================================================
  // SIZE CALCULATIONS
  // ============================================================================

  private calculateOriginalSize(queries: Query[]): number {
    let size = 0;
    for (const query of queries) {
      size += query.question.length;
      size += query.response.length;
    }
    return size;
  }

  private calculateSummarySize(
    topics: string[],
    findings: string[],
    files: string[]
  ): number {
    return (
      topics.join(' ').length +
      findings.join(' ').length +
      files.join(' ').length
    );
  }

  private createEmptySummary(): SessionSummary {
    return {
      id: randomUUID(),
      topics: [],
      keyFindings: [],
      filesMentioned: [],
      symbolsMentioned: [],
      compressionRatio: 1,
      generatedAt: new Date().toISOString(),
      queryCount: 0,
    };
  }
}

export default SessionSummarizer;

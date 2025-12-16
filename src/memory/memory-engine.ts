/**
 * Memory Engine
 *
 * Unified interface for persistent session storage,
 * Q&A history, and context summarization.
 *
 * @module memory/memory-engine
 */

import type {
  Session,
  Query,
  SessionSummary,
  MemoryEngineConfig,
  MemorySearchOptions,
  MemorySearchResult,
} from './types.js';
import { DEFAULT_MEMORY_ENGINE_CONFIG } from './types.js';
import { SessionStore } from './session-store.js';
import { SessionSummarizer } from './summarizer.js';

// ============================================================================
// MEMORY ENGINE
// ============================================================================

/**
 * Unified interface for all memory operations
 *
 * @example
 * ```ts
 * const memory = new MemoryEngine('/project/root');
 * await memory.initialize();
 *
 * // Start a new session
 * const session = memory.createSession();
 *
 * // Log a query
 * memory.logQuery(session.id, {
 *   question: 'How does auth work?',
 *   response: '...',
 *   filesReferenced: ['src/auth.ts'],
 *   symbolsDiscussed: ['authenticate'],
 * });
 *
 * // Search history
 * const results = await memory.search('authentication');
 *
 * // Get file discussions
 * const discussions = await memory.getFileHistory('src/auth.ts');
 * ```
 */
export class MemoryEngine {
  private _projectRoot: string;
  private config: MemoryEngineConfig;
  private sessionStore: SessionStore;
  private summarizer: SessionSummarizer;
  private currentSessionId: string | null = null;
  private queryCountSinceLastSummary = 0;

  constructor(projectRoot: string, config: Partial<MemoryEngineConfig> = {}) {
    this._projectRoot = projectRoot;
    this.config = { ...DEFAULT_MEMORY_ENGINE_CONFIG, ...config };
    this.sessionStore = new SessionStore(projectRoot, this.config.sessionStore);
    this.summarizer = new SessionSummarizer();
  }

  /** Get the project root path */
  get projectRoot(): string {
    return this._projectRoot;
  }

  /**
   * Initialize the memory engine
   */
  async initialize(): Promise<void> {
    await this.sessionStore.initialize();
  }

  /**
   * Shutdown the memory engine (save pending data)
   */
  async shutdown(): Promise<void> {
    // Save current session if exists
    if (this.currentSessionId) {
      await this.endSession(this.currentSessionId);
    }
    await this.sessionStore.shutdown();
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Create a new session
   */
  createSession(metadata?: Record<string, unknown>): Session {
    const session = this.sessionStore.createSession(metadata);
    this.currentSessionId = session.id;
    this.queryCountSinceLastSummary = 0;
    return session;
  }

  /**
   * Get the current session, creating one if none exists
   */
  getCurrentSession(): Session {
    if (this.currentSessionId) {
      const session = this.sessionStore.getSession(this.currentSessionId);
      if (session) return session;
    }
    return this.createSession();
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.sessionStore.getSession(sessionId);
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) return;

    // Auto-summarize if enabled and queries exist
    if (this.config.autoSummarize && session.queries.length > 0) {
      await this.summarizeSession(sessionId);
    }

    this.sessionStore.endSession(sessionId);

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /**
   * List all sessions
   */
  listSessions(): Session[] {
    return this.sessionStore.listSessions();
  }

  // ============================================================================
  // QUERY LOGGING
  // ============================================================================

  /**
   * Log a query to the current session
   */
  logQuery(query: Omit<Query, 'id' | 'timestamp'>): Query {
    const session = this.getCurrentSession();
    const logged = this.sessionStore.addQuery(session.id, query);

    this.queryCountSinceLastSummary++;

    // Auto-summarize if threshold reached
    if (
      this.config.autoSummarize &&
      this.queryCountSinceLastSummary >= this.config.summarizeAfterQueries
    ) {
      this.summarizeSession(session.id).catch(() => {
        // Ignore summarization errors
      });
      this.queryCountSinceLastSummary = 0;
    }

    return logged;
  }

  /**
   * Log a query to a specific session
   */
  logQueryToSession(sessionId: string, query: Omit<Query, 'id' | 'timestamp'>): Query {
    return this.sessionStore.addQuery(sessionId, query);
  }

  // ============================================================================
  // SEARCH & RETRIEVAL
  // ============================================================================

  /**
   * Search through Q&A history
   */
  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult> {
    return this.sessionStore.search(query, options);
  }

  /**
   * Get all discussions about a specific file
   */
  async getFileHistory(filePath: string): Promise<Query[]> {
    return this.sessionStore.getFileDiscussions(filePath);
  }

  /**
   * Get discussions about a specific symbol
   */
  async getSymbolHistory(symbol: string): Promise<Query[]> {
    const result = await this.search('', { symbols: [symbol] });
    return result.queries;
  }

  /**
   * Get recent queries across all sessions
   */
  getRecentQueries(limit: number = 20): Query[] {
    const allQueries: Query[] = [];

    for (const session of this.listSessions()) {
      allQueries.push(...session.queries);
    }

    // Sort by timestamp descending
    allQueries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return allQueries.slice(0, limit);
  }

  // ============================================================================
  // SUMMARIZATION
  // ============================================================================

  /**
   * Generate a summary for a session
   */
  async summarizeSession(sessionId: string): Promise<SessionSummary> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Get queries that haven't been summarized yet
    const lastSummary = session.summaries[session.summaries.length - 1];
    const queriesSinceLast = lastSummary
      ? session.queries.filter(
          (q) => new Date(q.timestamp) > new Date(lastSummary.generatedAt)
        )
      : session.queries;

    if (queriesSinceLast.length === 0) {
      // Return existing summary or create empty one
      return lastSummary || await this.summarizer.summarize({ queries: [] });
    }

    let summary: SessionSummary;
    if (lastSummary) {
      // Incremental summarization
      summary = await this.summarizer.summarizeIncremental(lastSummary, queriesSinceLast);
    } else {
      // Full summarization
      summary = await this.summarizer.summarize({ queries: queriesSinceLast });
    }

    // Store the summary
    this.sessionStore.addSummary(sessionId, summary);

    return summary;
  }

  /**
   * Get summaries for a date range
   */
  getSummaries(dateRange?: { start: string; end: string }): SessionSummary[] {
    const summaries: SessionSummary[] = [];

    for (const session of this.listSessions()) {
      for (const summary of session.summaries) {
        if (dateRange) {
          const date = new Date(summary.generatedAt);
          const start = new Date(dateRange.start);
          const end = new Date(dateRange.end);
          if (date >= start && date <= end) {
            summaries.push(summary);
          }
        } else {
          summaries.push(summary);
        }
      }
    }

    return summaries.sort((a, b) =>
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    );
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get memory statistics
   */
  getStats(): MemoryStats {
    const sessions = this.listSessions();
    let totalQueries = 0;
    let totalSuccessful = 0;
    const filesDiscussed = new Set<string>();
    const symbolsDiscussed = new Set<string>();

    for (const session of sessions) {
      totalQueries += session.queries.length;
      for (const query of session.queries) {
        if (query.successful) totalSuccessful++;
        query.filesReferenced.forEach((f) => filesDiscussed.add(f));
        query.symbolsDiscussed.forEach((s) => symbolsDiscussed.add(s));
      }
    }

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => !s.endedAt).length,
      totalQueries,
      successfulQueries: totalSuccessful,
      uniqueFilesDiscussed: filesDiscussed.size,
      uniqueSymbolsDiscussed: symbolsDiscussed.size,
      currentSessionId: this.currentSessionId,
    };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clean up old sessions
   */
  async cleanup(): Promise<number> {
    return this.sessionStore.cleanup();
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryStats {
  totalSessions: number;
  activeSessions: number;
  totalQueries: number;
  successfulQueries: number;
  uniqueFilesDiscussed: number;
  uniqueSymbolsDiscussed: number;
  currentSessionId: string | null;
}

export default MemoryEngine;

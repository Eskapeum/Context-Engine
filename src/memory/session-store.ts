/**
 * Session Store
 *
 * Persists Q&A sessions to disk with indexing and search capabilities.
 * Stores sessions in .uce/memory/sessions/ with a central index.
 *
 * @module memory/session-store
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type {
  Session,
  Query,
  SessionStoreConfig,
  SessionIndex,
  SessionIndexEntry,
  MemorySearchOptions,
  MemorySearchResult,
} from './types.js';
import { DEFAULT_SESSION_STORE_CONFIG } from './types.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// SESSION STORE
// ============================================================================

/**
 * Persists and retrieves Q&A sessions
 *
 * @example
 * ```ts
 * const store = new SessionStore('/project/root');
 * await store.initialize();
 *
 * const session = store.createSession();
 * store.addQuery(session.id, {
 *   question: 'How does auth work?',
 *   response: '...',
 *   // ...
 * });
 *
 * await store.saveSession(session.id);
 * ```
 */
export class SessionStore {
  private config: SessionStoreConfig;
  private projectRoot: string;
  private storageDir: string;
  private sessionsDir: string;
  private indexPath: string;
  private index: SessionIndex | null = null;
  private activeSessions: Map<string, Session> = new Map();
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, config: Partial<SessionStoreConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_SESSION_STORE_CONFIG, ...config };
    this.storageDir = path.join(projectRoot, this.config.storageDir);
    this.sessionsDir = path.join(this.storageDir, 'sessions');
    this.indexPath = path.join(this.storageDir, 'index.json');
  }

  /**
   * Initialize the session store
   */
  async initialize(): Promise<void> {
    // Create directories
    await fs.promises.mkdir(this.sessionsDir, { recursive: true });

    // Load or create index
    await this.loadIndex();

    // Start auto-save
    if (this.config.autoSaveIntervalMs > 0) {
      this.startAutoSave();
    }

    // Clean up old sessions
    await this.cleanupOldSessions();
  }

  /**
   * Create a new session
   */
  createSession(metadata?: Record<string, unknown>): Session {
    const session: Session = {
      id: this.generateId(),
      projectRoot: this.projectRoot,
      startedAt: new Date().toISOString(),
      queries: [],
      summaries: [],
      metadata,
    };

    // Try to get git info
    try {
      const gitBranch = this.getGitBranch();
      const gitCommit = this.getGitCommit();
      if (gitBranch) session.gitBranch = gitBranch;
      if (gitCommit) session.gitCommit = gitCommit;
    } catch {
      // Git not available
    }

    this.activeSessions.set(session.id, session);
    return session;
  }

  /**
   * Get or create the current session
   */
  getCurrentSession(): Session {
    // Return most recent active session or create new one
    const sessions = [...this.activeSessions.values()];
    if (sessions.length > 0) {
      return sessions[sessions.length - 1];
    }
    return this.createSession();
  }

  /**
   * Add a query to a session
   */
  addQuery(sessionId: string, query: Omit<Query, 'id' | 'timestamp'>): Query {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const fullQuery: Query = {
      ...query,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    session.queries.push(fullQuery);
    return fullQuery;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.endedAt = new Date().toISOString();
    await this.saveSession(sessionId);
    this.activeSessions.delete(sessionId);
  }

  /**
   * Save a session to disk
   */
  async saveSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const filename = `${session.startedAt.replace(/[:.]/g, '-')}-${session.id}.json`;
    const filePath = path.join(this.sessionsDir, filename);

    let content = JSON.stringify(session, null, 2);

    if (this.config.enableCompression) {
      const compressed = await gzip(Buffer.from(content));
      await fs.promises.writeFile(filePath + '.gz', compressed);
    } else {
      await fs.promises.writeFile(filePath, content);
    }

    // Update index
    await this.updateIndex(session, filePath);
  }

  /**
   * Load a session from disk
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    // Check active sessions first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Find in index
    const entry = this.index?.sessions.find((s) => s.id === sessionId);
    if (!entry) return null;

    try {
      let content: string;

      if (entry.storagePath.endsWith('.gz')) {
        const compressed = await fs.promises.readFile(entry.storagePath);
        const decompressed = await gunzip(compressed);
        content = decompressed.toString();
      } else {
        content = await fs.promises.readFile(entry.storagePath, 'utf-8');
      }

      return JSON.parse(content) as Session;
    } catch {
      return null;
    }
  }

  /**
   * Search through session history
   */
  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult> {
    const results: Query[] = [];
    const sessions: SessionIndexEntry[] = [];
    const scores = new Map<string, number>();
    const queryLower = query.toLowerCase();

    const limit = options.limit || 50;

    // Search through index first
    for (const entry of this.index?.sessions || []) {
      // Filter by date range
      if (options.dateRange) {
        const sessionDate = new Date(entry.startedAt);
        const start = new Date(options.dateRange.start);
        const end = new Date(options.dateRange.end);
        if (sessionDate < start || sessionDate > end) continue;
      }

      // Filter by files
      if (options.files && options.files.length > 0) {
        const hasFile = entry.files.some((f) => options.files!.includes(f));
        if (!hasFile) continue;
      }

      // Load session for detailed search
      const session = await this.loadSession(entry.id);
      if (!session) continue;

      let sessionMatched = false;

      for (const q of session.queries) {
        let score = 0;

        // Search in queries
        if (options.searchQueries !== false) {
          if (q.question.toLowerCase().includes(queryLower)) {
            score += 2;
          }
        }

        // Search in responses
        if (options.searchResponses !== false) {
          if (q.response.toLowerCase().includes(queryLower)) {
            score += 1;
          }
        }

        // Filter by symbols
        if (options.symbols && options.symbols.length > 0) {
          const hasSymbol = q.symbolsDiscussed.some((s) =>
            options.symbols!.some((os) => s.includes(os))
          );
          if (hasSymbol) score += 1;
        }

        if (score > 0) {
          results.push(q);
          scores.set(q.id, score);
          sessionMatched = true;
        }

        if (results.length >= limit) break;
      }

      if (sessionMatched) {
        sessions.push(entry);
      }

      if (results.length >= limit) break;
    }

    // Sort by score
    results.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));

    return {
      queries: results.slice(0, limit),
      sessions,
      scores,
      totalMatches: results.length,
    };
  }

  /**
   * Get queries about a specific file
   */
  async getFileDiscussions(filePath: string): Promise<Query[]> {
    const results: Query[] = [];

    for (const entry of this.index?.sessions || []) {
      if (!entry.files.includes(filePath)) continue;

      const session = await this.loadSession(entry.id);
      if (!session) continue;

      for (const query of session.queries) {
        if (query.filesReferenced.includes(filePath)) {
          results.push(query);
        }
      }
    }

    return results;
  }

  /**
   * Get recent sessions
   */
  getRecentSessions(limit = 10): SessionIndexEntry[] {
    if (!this.index) return [];

    return [...this.index.sessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get a session by ID (alias for loadSession with active session check)
   */
  getSession(sessionId: string): Session | null {
    // Check active sessions first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }
    return null;
  }

  /**
   * List all sessions (returns active sessions + index entries as full sessions)
   */
  listSessions(): Session[] {
    return [...this.activeSessions.values()];
  }

  /**
   * Add a summary to a session
   */
  addSummary(sessionId: string, summary: import('./types.js').SessionSummary): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.summaries.push(summary);
    }
  }

  /**
   * Shutdown the session store (alias for dispose)
   */
  async shutdown(): Promise<void> {
    await this.dispose();
  }

  /**
   * Clean up old sessions and return count of removed sessions
   */
  async cleanup(): Promise<number> {
    if (!this.index) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let removedCount = 0;
    const toRemove: number[] = [];

    for (let i = 0; i < this.index.sessions.length; i++) {
      const session = this.index.sessions[i];
      const sessionDate = new Date(session.startedAt);

      if (sessionDate < cutoffDate) {
        toRemove.push(i);
        removedCount++;
        try {
          await fs.promises.unlink(session.storagePath);
        } catch {
          // Ignore
        }
      }
    }

    // Remove from index (in reverse order to maintain indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.index.sessions.splice(toRemove[i], 1);
    }

    if (toRemove.length > 0) {
      await this.saveIndex();
    }

    return removedCount;
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    totalQueries: number;
    activeSessions: number;
    oldestSession?: string;
    newestSession?: string;
  } {
    const sessions = this.index?.sessions || [];
    const totalQueries = sessions.reduce((sum, s) => sum + s.queryCount, 0);

    return {
      totalSessions: sessions.length,
      totalQueries,
      activeSessions: this.activeSessions.size,
      oldestSession: sessions.length > 0 ? sessions[sessions.length - 1]?.startedAt : undefined,
      newestSession: sessions.length > 0 ? sessions[0]?.startedAt : undefined,
    };
  }

  /**
   * Dispose and save all sessions
   */
  async dispose(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Save all active sessions
    for (const sessionId of this.activeSessions.keys()) {
      await this.saveSession(sessionId);
    }

    await this.saveIndex();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async loadIndex(): Promise<void> {
    try {
      if (fs.existsSync(this.indexPath)) {
        const content = await fs.promises.readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(content);
      } else {
        this.index = {
          version: '1.0.0',
          projectRoot: this.projectRoot,
          sessions: [],
          lastUpdated: new Date().toISOString(),
        };
      }
    } catch {
      this.index = {
        version: '1.0.0',
        projectRoot: this.projectRoot,
        sessions: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  private async saveIndex(): Promise<void> {
    if (!this.index) return;

    this.index.lastUpdated = new Date().toISOString();
    await fs.promises.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  private async updateIndex(session: Session, storagePath: string): Promise<void> {
    if (!this.index) return;

    // Find existing entry or create new one
    const existingIndex = this.index.sessions.findIndex((s) => s.id === session.id);

    const entry: SessionIndexEntry = {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      queryCount: session.queries.length,
      topics: session.summaries.flatMap((s) => s.topics),
      files: [...new Set(session.queries.flatMap((q) => q.filesReferenced))],
      storagePath: this.config.enableCompression ? storagePath + '.gz' : storagePath,
    };

    if (existingIndex >= 0) {
      this.index.sessions[existingIndex] = entry;
    } else {
      this.index.sessions.unshift(entry);
    }

    // Limit sessions
    if (this.index.sessions.length > this.config.maxSessions) {
      const removed = this.index.sessions.splice(this.config.maxSessions);
      // Delete old session files
      for (const old of removed) {
        try {
          await fs.promises.unlink(old.storagePath);
        } catch {
          // Ignore
        }
      }
    }

    await this.saveIndex();
  }

  private async cleanupOldSessions(): Promise<void> {
    if (!this.index) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const toRemove: number[] = [];

    for (let i = 0; i < this.index.sessions.length; i++) {
      const session = this.index.sessions[i];
      const sessionDate = new Date(session.startedAt);

      if (sessionDate < cutoffDate) {
        toRemove.push(i);
        try {
          await fs.promises.unlink(session.storagePath);
        } catch {
          // Ignore
        }
      }
    }

    // Remove from index (in reverse order to maintain indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.index.sessions.splice(toRemove[i], 1);
    }

    if (toRemove.length > 0) {
      await this.saveIndex();
    }
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      for (const sessionId of this.activeSessions.keys()) {
        await this.saveSession(sessionId);
      }
    }, this.config.autoSaveIntervalMs);
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private getGitBranch(): string | null {
    try {
      const headPath = path.join(this.projectRoot, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        const content = fs.readFileSync(headPath, 'utf-8').trim();
        const match = content.match(/ref: refs\/heads\/(.+)/);
        return match ? match[1] : null;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private getGitCommit(): string | null {
    try {
      const headPath = path.join(this.projectRoot, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        let content = fs.readFileSync(headPath, 'utf-8').trim();

        if (content.startsWith('ref:')) {
          const refPath = path.join(this.projectRoot, '.git', content.substring(5).trim());
          if (fs.existsSync(refPath)) {
            content = fs.readFileSync(refPath, 'utf-8').trim();
          }
        }

        return content.substring(0, 7);
      }
    } catch {
      // Ignore
    }
    return null;
  }
}

export default SessionStore;

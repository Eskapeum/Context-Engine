/**
 * Query Cache for Knowledge Graph
 *
 * Provides LRU caching with TTL for expensive graph queries.
 * Automatically invalidates cache entries when nodes change.
 *
 * @module graph/query-cache
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Cache entry with timestamp and value
 */
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  key: string;
}

/**
 * Cache configuration options
 */
export interface QueryCacheConfig {
  /** Maximum number of entries per cache (default: 1000) */
  maxEntries: number;
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  ttlMs: number;
  /** Enable automatic cleanup (default: true) */
  autoCleanup: boolean;
  /** Cleanup interval in milliseconds (default: 60000 = 1 minute) */
  cleanupIntervalMs: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Current entry count */
  entryCount: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Memory estimate in bytes */
  memoryEstimate: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_CACHE_CONFIG: QueryCacheConfig = {
  maxEntries: 1000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  autoCleanup: true,
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

// ============================================================================
// QUERY CACHE
// ============================================================================

/**
 * LRU cache with TTL for graph queries
 *
 * @example
 * ```ts
 * const cache = new QueryCache<GraphQueryResult>();
 * cache.set('user:123', result);
 * const cached = cache.get('user:123');
 * ```
 */
export class QueryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: QueryCacheConfig;
  private hits = 0;
  private misses = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<QueryCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    if (this.config.autoCleanup) {
      this.startCleanup();
    }
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access count (for LRU)
    entry.accessCount++;
    this.hits++;

    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Check if a key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate entries related to a node
   */
  invalidateForNode(nodeId: string): number {
    // Invalidate any cache entry that contains this nodeId
    return this.invalidatePattern(new RegExp(`(^|:)${this.escapeRegex(nodeId)}(:|$)`));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    let memoryEstimate = 0;

    // Rough memory estimate
    for (const entry of this.cache.values()) {
      memoryEstimate += JSON.stringify(entry.value).length * 2; // UTF-16
      memoryEstimate += entry.key.length * 2;
      memoryEstimate += 24; // timestamp + accessCount overhead
    }

    return {
      hits: this.hits,
      misses: this.misses,
      entryCount: this.cache.size,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      memoryEstimate,
    };
  }

  /**
   * Get or compute a value
   */
  async getOrCompute(key: string, compute: () => T | Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /**
   * Stop cleanup timer
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private evictLRU(): void {
    let minAccess = Infinity;
    let lruKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // First check if expired
      if (Date.now() - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(key);
        return;
      }

      // Then find LRU entry
      if (entry.accessCount < minAccess ||
          (entry.accessCount === minAccess && entry.timestamp < oldestTime)) {
        minAccess = entry.accessCount;
        oldestTime = entry.timestamp;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupIntervalMs);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================================================
// GRAPH QUERY CACHE MANAGER
// ============================================================================

/**
 * Specialized cache manager for knowledge graph queries
 *
 * Manages separate caches for different query types with
 * coordinated invalidation.
 */
export class GraphQueryCacheManager {
  private relatedCache: QueryCache<unknown>;
  private pathCache: QueryCache<string[] | null>;
  private callersCache: QueryCache<unknown[]>;
  private inheritanceCache: QueryCache<unknown[]>;
  private config: QueryCacheConfig;

  constructor(config: Partial<QueryCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    this.relatedCache = new QueryCache(this.config);
    this.pathCache = new QueryCache(this.config);
    this.callersCache = new QueryCache(this.config);
    this.inheritanceCache = new QueryCache(this.config);
  }

  /**
   * Cache key generator for findRelated queries
   */
  getRelatedKey(nodeId: string, options?: Record<string, unknown>): string {
    return `related:${nodeId}:${JSON.stringify(options || {})}`;
  }

  /**
   * Cache key generator for findPath queries
   */
  getPathKey(fromId: string, toId: string, options?: Record<string, unknown>): string {
    return `path:${fromId}:${toId}:${JSON.stringify(options || {})}`;
  }

  /**
   * Cache key generator for getCallers queries
   */
  getCallersKey(nodeId: string): string {
    return `callers:${nodeId}`;
  }

  /**
   * Cache key generator for inheritance queries
   */
  getInheritanceKey(nodeId: string, direction: string): string {
    return `inheritance:${nodeId}:${direction}`;
  }

  /**
   * Get cached findRelated result
   */
  getRelated<T>(key: string): T | undefined {
    return this.relatedCache.get(key) as T | undefined;
  }

  /**
   * Set cached findRelated result
   */
  setRelated<T>(key: string, value: T): void {
    this.relatedCache.set(key, value);
  }

  /**
   * Get cached findPath result
   */
  getPath(key: string): string[] | null | undefined {
    return this.pathCache.get(key);
  }

  /**
   * Set cached findPath result
   */
  setPath(key: string, value: string[] | null): void {
    this.pathCache.set(key, value);
  }

  /**
   * Get cached callers result
   */
  getCallers<T>(key: string): T[] | undefined {
    return this.callersCache.get(key) as T[] | undefined;
  }

  /**
   * Set cached callers result
   */
  setCallers<T>(key: string, value: T[]): void {
    this.callersCache.set(key, value);
  }

  /**
   * Get cached inheritance result
   */
  getInheritance<T>(key: string): T[] | undefined {
    return this.inheritanceCache.get(key) as T[] | undefined;
  }

  /**
   * Set cached inheritance result
   */
  setInheritance<T>(key: string, value: T[]): void {
    this.inheritanceCache.set(key, value);
  }

  /**
   * Invalidate all caches for a node
   */
  invalidateNode(nodeId: string): void {
    this.relatedCache.invalidateForNode(nodeId);
    this.pathCache.invalidateForNode(nodeId);
    this.callersCache.invalidateForNode(nodeId);
    this.inheritanceCache.invalidateForNode(nodeId);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.relatedCache.clear();
    this.pathCache.clear();
    this.callersCache.clear();
    this.inheritanceCache.clear();
  }

  /**
   * Get combined statistics
   */
  getStats(): Record<string, CacheStats> {
    return {
      related: this.relatedCache.getStats(),
      path: this.pathCache.getStats(),
      callers: this.callersCache.getStats(),
      inheritance: this.inheritanceCache.getStats(),
    };
  }

  /**
   * Dispose all caches
   */
  dispose(): void {
    this.relatedCache.dispose();
    this.pathCache.dispose();
    this.callersCache.dispose();
    this.inheritanceCache.dispose();
  }
}

export default QueryCache;

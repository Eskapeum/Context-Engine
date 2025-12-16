/**
 * Library Documentation Manager
 *
 * Orchestrates library documentation retrieval with local-first approach.
 * Flow: Cache -> Local Extraction -> Store in Cache
 *
 * @module library-docs/docs-manager
 */

import type {
  DocsManagerOptions,
  DocsQueryOptions,
  LibraryDocResult,
} from './types.js';
import { DocsCache } from './docs-cache.js';
import { LocalExtractor } from './local-extractor.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================================
// DOCS MANAGER CLASS
// ============================================================================

/**
 * Main manager for library documentation
 */
export class DocsManager {
  private projectRoot: string;
  private cache: DocsCache;
  private extractor: LocalExtractor;
  private options: Required<DocsManagerOptions>;
  private initialized = false;

  constructor(options: DocsManagerOptions) {
    this.projectRoot = options.projectRoot;
    this.options = {
      projectRoot: options.projectRoot,
      cacheDir: options.cacheDir || '.uce/library-docs',
      cacheTTL: options.cacheTTL || DEFAULT_CACHE_TTL,
      preferLocal: options.preferLocal ?? true,
      autoCleanup: options.autoCleanup ?? true,
    };

    this.cache = new DocsCache(this.projectRoot, this.options.cacheTTL);
    this.extractor = new LocalExtractor(this.projectRoot);
  }

  /**
   * Initialize the manager
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.cache.init();

    // Auto cleanup on init
    if (this.options.autoCleanup) {
      await this.cache.cleanup();
    }

    this.initialized = true;
  }

  /**
   * Get documentation for a library
   *
   * Flow:
   * 1. Check cache (if not forceRefresh)
   * 2. Extract from local node_modules
   * 3. Store in cache
   */
  async getDocs(library: string, options: DocsQueryOptions = {}): Promise<LibraryDocResult | null> {
    await this.ensureInitialized();

    const version = options.version || this.extractor.getVersion(library) || undefined;

    // Step 1: Check cache (unless forcing refresh)
    if (!options.forceRefresh) {
      const cached = await this.cache.get(library, version);
      if (cached) {
        return cached;
      }
    }

    // Step 2: Extract from local node_modules
    const docs = await this.extractor.extract(library, options.extraction);
    if (!docs) {
      return null;
    }

    // Step 3: Cache the result
    await this.cache.set(docs);

    return docs;
  }

  /**
   * Get documentation for multiple libraries
   */
  async getMultipleDocs(
    libraries: string[],
    options: DocsQueryOptions = {}
  ): Promise<Map<string, LibraryDocResult | null>> {
    const results = new Map<string, LibraryDocResult | null>();

    // Process in parallel
    const promises = libraries.map(async (library) => {
      const docs = await this.getDocs(library, options);
      results.set(library, docs);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Check if documentation is available for a library
   */
  async hasLibrary(library: string): Promise<boolean> {
    await this.ensureInitialized();

    // Check cache first
    if (await this.cache.has(library)) {
      return true;
    }

    // Check local node_modules
    return this.extractor.hasLibrary(library);
  }

  /**
   * List all libraries with cached documentation
   */
  async listCached(): Promise<Array<{ library: string; version: string; cachedAt: string }>> {
    await this.ensureInitialized();
    return this.cache.list();
  }

  /**
   * List all libraries available in node_modules
   */
  listAvailable(): string[] {
    return this.extractor.listAvailable();
  }

  /**
   * Refresh documentation for a library
   */
  async refresh(library: string): Promise<LibraryDocResult | null> {
    return this.getDocs(library, { forceRefresh: true });
  }

  /**
   * Refresh all cached documentation
   */
  async refreshAll(): Promise<Map<string, LibraryDocResult | null>> {
    await this.ensureInitialized();

    const cached = await this.cache.list();
    const libraries = cached.map((c) => c.library);

    return this.getMultipleDocs(libraries, { forceRefresh: true });
  }

  /**
   * Remove documentation from cache
   */
  async remove(library: string, version?: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.cache.delete(library, version);
  }

  /**
   * Clear all cached documentation
   */
  async clearCache(): Promise<void> {
    await this.ensureInitialized();
    await this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    await this.ensureInitialized();
    return this.cache.stats();
  }

  /**
   * Search API entries across all cached libraries
   */
  async searchAPI(
    query: string,
    options: { maxResults?: number; types?: string[] } = {}
  ): Promise<
    Array<{
      library: string;
      entry: {
        name: string;
        type: string;
        signature?: string;
        description?: string;
      };
    }>
  > {
    await this.ensureInitialized();

    const maxResults = options.maxResults || 20;
    const typeFilter = options.types;
    const results: Array<{
      library: string;
      entry: {
        name: string;
        type: string;
        signature?: string;
        description?: string;
      };
    }> = [];

    const cached = await this.cache.list();
    const queryLower = query.toLowerCase();

    for (const { library, version } of cached) {
      if (results.length >= maxResults) break;

      const docs = await this.cache.get(library, version);
      if (!docs) continue;

      for (const entry of docs.apiReference) {
        if (results.length >= maxResults) break;

        // Apply type filter
        if (typeFilter && !typeFilter.includes(entry.type)) continue;

        // Match query against name, description, signature
        const matchesName = entry.name.toLowerCase().includes(queryLower);
        const matchesDesc = entry.description?.toLowerCase().includes(queryLower);
        const matchesSig = entry.signature?.toLowerCase().includes(queryLower);

        if (matchesName || matchesDesc || matchesSig) {
          results.push({
            library,
            entry: {
              name: entry.name,
              type: entry.type,
              signature: entry.signature,
              description: entry.description,
            },
          });
        }
      }
    }

    return results;
  }

  /**
   * Pre-warm cache with project dependencies
   */
  async prewarm(): Promise<{
    cached: string[];
    failed: string[];
  }> {
    await this.ensureInitialized();

    const available = this.listAvailable();
    const cached: string[] = [];
    const failed: string[] = [];

    // Filter to just direct dependencies (skip @types, etc.)
    const directDeps = available.filter((lib) => {
      // Skip @types packages
      if (lib.startsWith('@types/')) return false;
      // Skip dev tooling
      if (['typescript', 'prettier', 'eslint', 'vitest', 'jest'].includes(lib)) return false;
      return true;
    });

    // Limit to top 50 deps
    const toDocs = directDeps.slice(0, 50);

    for (const library of toDocs) {
      try {
        const docs = await this.getDocs(library);
        if (docs) {
          cached.push(library);
        } else {
          failed.push(library);
        }
      } catch {
        failed.push(library);
      }
    }

    return { cached, failed };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }
}

export default DocsManager;

/**
 * Universal Context Engine - Incremental Indexer
 *
 * High-performance indexer with:
 * - Incremental updates via file hash tracking
 * - Git branch-aware indexing
 * - Dependency graph invalidation
 * - Per-user branch isolation
 *
 * @module core/incremental-indexer
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { glob } from 'glob';
import ignoreModule from 'ignore';
import { TreeSitterParser, initializeParser } from '../parser/index.js';
import type {
  Symbol,
  Import,
  Export,
  CallReference,
  SemanticChunk,
} from '../parser/types.js';
import { getLanguageByExtension, LANGUAGE_REGISTRY } from '../parser/types.js';

const ignore = (ignoreModule as any).default || ignoreModule;
type IgnoreInstance = ReturnType<typeof ignore>;

// ============================================================================
// TYPES
// ============================================================================

/**
 * File metadata with hash for change detection
 */
export interface FileMetadata {
  /** Relative file path */
  path: string;
  /** Content hash (SHA-256) */
  hash: string;
  /** Last modified timestamp */
  mtime: number;
  /** File size in bytes */
  size: number;
  /** Detected language */
  language: string;
  /** Files this file imports */
  imports: string[];
  /** Files that import this file */
  importedBy: string[];
}

/**
 * Complete file index with parsed content
 */
export interface FileIndex {
  /** File metadata */
  metadata: FileMetadata;
  /** Extracted symbols */
  symbols: Symbol[];
  /** Import statements */
  imports: Import[];
  /** Export statements */
  exports: Export[];
  /** Function calls */
  calls: CallReference[];
  /** Semantic chunks for embedding */
  chunks: SemanticChunk[];
  /** File documentation */
  documentation?: string;
  /** Parse errors (if any) */
  errors?: { message: string; line: number }[];
}

/**
 * Git branch information
 */
export interface GitBranchInfo {
  /** Current branch name */
  branch: string;
  /** Current commit hash */
  commit: string;
  /** Whether there are uncommitted changes */
  dirty: boolean;
  /** Remote tracking branch */
  upstream?: string;
}

/**
 * Complete project index
 */
export interface ProjectIndex {
  /** UCE version */
  version: string;
  /** Project name */
  name: string;
  /** Project root path */
  root: string;
  /** Git branch info */
  git: GitBranchInfo;
  /** Index creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Index generation (increments on each update) */
  generation: number;
  /** File indexes by path */
  files: Map<string, FileIndex>;
  /** Dependency graph: file -> files it depends on */
  dependencies: Map<string, Set<string>>;
  /** Reverse dependency graph: file -> files that depend on it */
  dependents: Map<string, Set<string>>;
  /** Statistics */
  stats: IndexStats;
}

/**
 * Index statistics
 */
export interface IndexStats {
  totalFiles: number;
  totalSymbols: number;
  totalChunks: number;
  /** Files added in this index run (v2.5+) */
  newFiles: number;
  /** Files updated in this index run (v2.5+) */
  updatedFiles: number;
  /** Files skipped (unchanged) in this index run (v2.5+) */
  cachedFiles: number;
  byLanguage: Record<string, { files: number; symbols: number }>;
  indexTime: number;
}

/**
 * Indexer configuration
 */
export interface IndexerConfig {
  /** Project root directory */
  projectRoot: string;
  /** Additional ignore patterns */
  ignorePatterns?: string[];
  /** Maximum file size to index (bytes) */
  maxFileSize?: number;
  /** Enable git branch detection */
  enableGitBranch?: boolean;
  /** Cache directory for index */
  cacheDir?: string;
  /** User ID for per-user indexing */
  userId?: string;
}

/**
 * Index update result
 */
export interface IndexUpdateResult {
  /** Files added */
  added: string[];
  /** Files modified */
  modified: string[];
  /** Files removed */
  removed: string[];
  /** Files invalidated by dependency changes */
  invalidated: string[];
  /** Files skipped (unchanged since last index) */
  cached: string[];
  /** Total time taken (ms) */
  duration: number;
  /** New index generation */
  generation: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const UCE_VERSION = '2.2.1';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '__pycache__',
  '*.pyc',
  '.venv',
  'venv',
  '.env',
  '*.min.js',
  '*.bundle.js',
  '*.map',
  '.context',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.log',
];

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB

// ============================================================================
// INCREMENTAL INDEXER
// ============================================================================

/**
 * High-performance incremental indexer
 */
export class IncrementalIndexer {
  private config: Required<IndexerConfig>;
  private ig: IgnoreInstance;
  private parser: TreeSitterParser;
  private projectIndex: ProjectIndex | null = null;
  private fileHashes: Map<string, string> = new Map();
  private initialized = false;

  constructor(config: IndexerConfig) {
    this.config = {
      projectRoot: path.resolve(config.projectRoot),
      ignorePatterns: config.ignorePatterns || [],
      maxFileSize: config.maxFileSize || DEFAULT_MAX_FILE_SIZE,
      enableGitBranch: config.enableGitBranch ?? true,
      cacheDir: config.cacheDir || path.join(config.projectRoot, '.context'),
      userId: config.userId || 'default',
    };

    this.ig = ignore();
    this.ig.add(DEFAULT_IGNORE);
    this.ig.add(this.config.ignorePatterns);

    this.parser = new TreeSitterParser();

    // Load gitignore
    this.loadIgnoreFiles();
  }

  /**
   * Initialize the indexer and parser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initializeParser();

    // Load existing index if available
    this.projectIndex = await this.loadCachedIndex();

    this.initialized = true;
  }

  /**
   * Perform full or incremental index
   */
  async index(): Promise<ProjectIndex> {
    await this.initialize();
    const startTime = performance.now();

    // Get current git branch info
    const gitInfo = this.config.enableGitBranch ? this.getGitBranchInfo() : this.getDefaultGitInfo();

    // Check if we need to invalidate due to branch switch
    if (this.projectIndex && this.projectIndex.git.branch !== gitInfo.branch) {
      console.log(`Branch switched from ${this.projectIndex.git.branch} to ${gitInfo.branch}, rebuilding index`);
      this.projectIndex = null;
    }

    // Discover all files
    const currentFiles = await this.discoverFiles();
    const currentFileSet = new Set(currentFiles);

    // Determine changes
    const changes = this.detectChanges(currentFiles);

    // Create new index or update existing
    if (!this.projectIndex) {
      this.projectIndex = this.createEmptyIndex(gitInfo);
    }

    // Process removed files
    for (const file of changes.removed) {
      this.removeFile(file);
    }

    // Process added and modified files
    const toProcess = [...changes.added, ...changes.modified];

    // Add files invalidated by dependency changes
    const invalidated = this.getInvalidatedFiles(changes.modified);
    for (const file of invalidated) {
      if (!toProcess.includes(file) && currentFileSet.has(file)) {
        toProcess.push(file);
      }
    }

    // Process files in parallel batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((file) => this.indexFile(file)));
    }

    // Update dependency graphs
    this.rebuildDependencyGraph();

    // Update stats with change tracking
    this.updateStats(changes.added.length, changes.modified.length, changes.cached.length);

    // Update timestamps
    this.projectIndex.updatedAt = new Date().toISOString();
    this.projectIndex.generation++;
    this.projectIndex.stats.indexTime = performance.now() - startTime;

    // Save to cache
    await this.saveCachedIndex();

    return this.projectIndex;
  }

  /**
   * Update index for specific files only
   */
  async updateFiles(files: string[]): Promise<IndexUpdateResult> {
    await this.initialize();
    const startTime = performance.now();

    if (!this.projectIndex) {
      await this.index();
      return {
        added: [],
        modified: files,
        removed: [],
        invalidated: [],
        cached: [],
        duration: performance.now() - startTime,
        generation: this.projectIndex!.generation,
      };
    }

    const added: string[] = [];
    const modified: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(this.config.projectRoot, file);
      const existing = this.projectIndex.files.has(relativePath);

      await this.indexFile(relativePath);

      if (existing) {
        modified.push(relativePath);
      } else {
        added.push(relativePath);
      }
    }

    // Get invalidated files
    const invalidated = this.getInvalidatedFiles(modified);
    for (const file of invalidated) {
      if (!files.includes(file)) {
        await this.indexFile(file);
      }
    }

    this.rebuildDependencyGraph();
    this.updateStats(added.length, modified.length, 0);

    this.projectIndex.updatedAt = new Date().toISOString();
    this.projectIndex.generation++;

    await this.saveCachedIndex();

    return {
      added,
      modified,
      removed: [],
      invalidated,
      cached: [],
      duration: performance.now() - startTime,
      generation: this.projectIndex.generation,
    };
  }

  /**
   * Get current index without updating
   */
  getIndex(): ProjectIndex | null {
    return this.projectIndex;
  }

  /**
   * Search symbols by name
   */
  searchSymbols(query: string, options?: { limit?: number; kinds?: string[] }): Symbol[] {
    if (!this.projectIndex) return [];

    const results: Symbol[] = [];
    const limit = options?.limit || 20;
    const kinds = options?.kinds ? new Set(options.kinds) : null;
    const queryLower = query.toLowerCase();

    for (const fileIndex of this.projectIndex.files.values()) {
      for (const symbol of fileIndex.symbols) {
        if (kinds && !kinds.has(symbol.kind)) continue;
        if (symbol.name.toLowerCase().includes(queryLower)) {
          results.push(symbol);
          if (results.length >= limit) return results;
        }
      }
    }

    return results;
  }

  /**
   * Get all chunks for embedding
   */
  getAllChunks(): SemanticChunk[] {
    if (!this.projectIndex) return [];

    const chunks: SemanticChunk[] = [];
    for (const fileIndex of this.projectIndex.files.values()) {
      chunks.push(...fileIndex.chunks);
    }
    return chunks;
  }

  /**
   * Get files that depend on a given file
   */
  getDependents(filePath: string): string[] {
    if (!this.projectIndex) return [];
    const dependents = this.projectIndex.dependents.get(filePath);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Get files that a given file depends on
   */
  getDependencies(filePath: string): string[] {
    if (!this.projectIndex) return [];
    const dependencies = this.projectIndex.dependencies.get(filePath);
    return dependencies ? Array.from(dependencies) : [];
  }

  /**
   * Get file hashes for state export
   */
  getFileHashes(): Map<string, string> {
    return new Map(this.fileHashes);
  }

  /**
   * Set file hashes for state import
   */
  setFileHashes(hashes: Map<string, string>): void {
    this.fileHashes = new Map(hashes);
  }

  /**
   * Get current git branch info
   */
  getGitInfo(): GitBranchInfo {
    return this.config.enableGitBranch ? this.getGitBranchInfo() : this.getDefaultGitInfo();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private loadIgnoreFiles(): void {
    // Load .gitignore
    const gitignorePath = path.join(this.config.projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      this.ig.add(content.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }

    // Load .contextignore
    const contextIgnorePath = path.join(this.config.projectRoot, '.contextignore');
    if (fs.existsSync(contextIgnorePath)) {
      const content = fs.readFileSync(contextIgnorePath, 'utf-8');
      this.ig.add(content.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }

    // Load .uceignore (v2.5+)
    const uceIgnorePath = path.join(this.config.projectRoot, '.uceignore');
    if (fs.existsSync(uceIgnorePath)) {
      const content = fs.readFileSync(uceIgnorePath, 'utf-8');
      this.ig.add(content.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }
  }

  private async discoverFiles(): Promise<string[]> {
    const allExtensions = Object.values(LANGUAGE_REGISTRY).flatMap((c) => c.extensions);
    const patterns = allExtensions.map((ext) => `**/*${ext}`);

    const files = await glob(patterns, {
      cwd: this.config.projectRoot,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    return files.filter((f) => !this.ig.ignores(f));
  }

  private detectChanges(currentFiles: string[]): {
    added: string[];
    modified: string[];
    removed: string[];
    cached: string[];
  } {
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];
    const cached: string[] = [];

    const currentFileSet = new Set(currentFiles);
    const indexedFileSet = this.projectIndex ? new Set(this.projectIndex.files.keys()) : new Set<string>();

    // Find added and modified files
    for (const file of currentFiles) {
      if (!indexedFileSet.has(file)) {
        added.push(file);
      } else {
        // Check if file has changed
        const fullPath = path.join(this.config.projectRoot, file);
        const newHash = this.computeFileHash(fullPath);
        const oldHash = this.fileHashes.get(file);

        if (newHash !== oldHash) {
          modified.push(file);
        } else {
          cached.push(file);
        }
      }
    }

    // Find removed files
    if (this.projectIndex) {
      for (const file of indexedFileSet) {
        if (!currentFileSet.has(file)) {
          removed.push(file);
        }
      }
    }

    return { added, modified, removed, cached };
  }

  private computeFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  private getInvalidatedFiles(modifiedFiles: string[]): string[] {
    if (!this.projectIndex) return [];

    const invalidated = new Set<string>();
    const visited = new Set<string>();

    const traverse = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);

      const dependents = this.projectIndex!.dependents.get(file);
      if (dependents) {
        for (const dependent of dependents) {
          invalidated.add(dependent);
          traverse(dependent);
        }
      }
    };

    for (const file of modifiedFiles) {
      traverse(file);
    }

    return Array.from(invalidated);
  }

  private async indexFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.config.projectRoot, relativePath);

    try {
      const stats = fs.statSync(fullPath);
      if (stats.size > this.config.maxFileSize) return;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      // Parse the file
      const parseResult = await this.parser.parse(relativePath, content);

      // Get language
      const ext = path.extname(relativePath);
      const langConfig = getLanguageByExtension(ext);
      const language = langConfig?.id || 'unknown';

      // Build file index
      const fileIndex: FileIndex = {
        metadata: {
          path: relativePath,
          hash,
          mtime: stats.mtimeMs,
          size: stats.size,
          language,
          imports: parseResult.imports.map((i) => i.source),
          importedBy: [], // Will be filled during dependency graph rebuild
        },
        symbols: parseResult.symbols,
        imports: parseResult.imports,
        exports: parseResult.exports,
        calls: parseResult.calls,
        chunks: parseResult.chunks,
        documentation: parseResult.fileDocumentation,
        errors: parseResult.errors?.map((e) => ({ message: e.message, line: e.line })),
      };

      // Store in index
      this.projectIndex!.files.set(relativePath, fileIndex);
      this.fileHashes.set(relativePath, hash);
    } catch (error) {
      // Silently skip files that can't be indexed
    }
  }

  private removeFile(relativePath: string): void {
    if (!this.projectIndex) return;

    this.projectIndex.files.delete(relativePath);
    this.fileHashes.delete(relativePath);
    this.projectIndex.dependencies.delete(relativePath);
    this.projectIndex.dependents.delete(relativePath);

    // Remove from other files' dependents
    for (const dependents of this.projectIndex.dependents.values()) {
      dependents.delete(relativePath);
    }
  }

  private rebuildDependencyGraph(): void {
    if (!this.projectIndex) return;

    // Clear existing graphs
    this.projectIndex.dependencies.clear();
    this.projectIndex.dependents.clear();

    // Build new graphs
    for (const [filePath, fileIndex] of this.projectIndex.files) {
      const dependencies = new Set<string>();

      for (const imp of fileIndex.imports) {
        const resolved = this.resolveImport(imp.source, filePath);
        if (resolved && this.projectIndex.files.has(resolved)) {
          dependencies.add(resolved);

          // Add reverse dependency
          if (!this.projectIndex.dependents.has(resolved)) {
            this.projectIndex.dependents.set(resolved, new Set());
          }
          this.projectIndex.dependents.get(resolved)!.add(filePath);
        }
      }

      this.projectIndex.dependencies.set(filePath, dependencies);

      // Update file metadata
      fileIndex.metadata.imports = Array.from(dependencies);
    }

    // Update importedBy in metadata
    for (const [filePath, dependents] of this.projectIndex.dependents) {
      const fileIndex = this.projectIndex.files.get(filePath);
      if (fileIndex) {
        fileIndex.metadata.importedBy = Array.from(dependents);
      }
    }
  }

  private resolveImport(importSource: string, fromFile: string): string | null {
    // Skip external packages
    if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
      return null;
    }

    const fromDir = path.dirname(fromFile);
    let resolved = path.join(fromDir, importSource);

    // Normalize path
    resolved = path.normalize(resolved);

    // Try various extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const withExt = resolved.endsWith(ext) ? resolved : resolved + ext;
      if (this.projectIndex?.files.has(withExt)) {
        return withExt;
      }
    }

    // Try as-is (might have extension already)
    if (this.projectIndex?.files.has(resolved)) {
      return resolved;
    }

    return null;
  }

  private updateStats(newFiles: number = 0, updatedFiles: number = 0, cachedFiles: number = 0): void {
    if (!this.projectIndex) return;

    const stats: IndexStats = {
      totalFiles: this.projectIndex.files.size,
      totalSymbols: 0,
      totalChunks: 0,
      newFiles,
      updatedFiles,
      cachedFiles,
      byLanguage: {},
      indexTime: 0,
    };

    for (const fileIndex of this.projectIndex.files.values()) {
      stats.totalSymbols += fileIndex.symbols.length;
      stats.totalChunks += fileIndex.chunks.length;

      const lang = fileIndex.metadata.language;
      if (!stats.byLanguage[lang]) {
        stats.byLanguage[lang] = { files: 0, symbols: 0 };
      }
      stats.byLanguage[lang].files++;
      stats.byLanguage[lang].symbols += fileIndex.symbols.length;
    }

    this.projectIndex.stats = stats;
  }

  private createEmptyIndex(gitInfo: GitBranchInfo): ProjectIndex {
    return {
      version: UCE_VERSION,
      name: this.getProjectName(),
      root: this.config.projectRoot,
      git: gitInfo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generation: 0,
      files: new Map(),
      dependencies: new Map(),
      dependents: new Map(),
      stats: {
        totalFiles: 0,
        totalSymbols: 0,
        totalChunks: 0,
        newFiles: 0,
        updatedFiles: 0,
        cachedFiles: 0,
        byLanguage: {},
        indexTime: 0,
      },
    };
  }

  private getProjectName(): string {
    const packageJsonPath = path.join(this.config.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.name) return pkg.name;
      } catch {}
    }
    return path.basename(this.config.projectRoot);
  }

  private getGitBranchInfo(): GitBranchInfo {
    try {
      const gitDir = path.join(this.config.projectRoot, '.git');
      if (!fs.existsSync(gitDir)) {
        return this.getDefaultGitInfo();
      }

      // Read HEAD
      const headPath = path.join(gitDir, 'HEAD');
      const headContent = fs.readFileSync(headPath, 'utf-8').trim();

      let branch = 'detached';
      let commit = '';

      if (headContent.startsWith('ref: refs/heads/')) {
        branch = headContent.slice('ref: refs/heads/'.length);
        // Read commit hash
        const refPath = path.join(gitDir, 'refs', 'heads', branch);
        if (fs.existsSync(refPath)) {
          commit = fs.readFileSync(refPath, 'utf-8').trim();
        }
      } else {
        // Detached HEAD - content is commit hash
        commit = headContent;
      }

      // Check for uncommitted changes (simplified)
      const indexPath = path.join(gitDir, 'index');
      const dirty = fs.existsSync(indexPath);

      return { branch, commit, dirty };
    } catch {
      return this.getDefaultGitInfo();
    }
  }

  private getDefaultGitInfo(): GitBranchInfo {
    return {
      branch: 'main',
      commit: '',
      dirty: false,
    };
  }

  private getCacheFilePath(): string {
    const branch = this.projectIndex?.git.branch || 'main';
    const userId = this.config.userId;
    const fileName = `index-${userId}-${branch.replace(/\//g, '-')}.json`;
    return path.join(this.config.cacheDir, fileName);
  }

  private async loadCachedIndex(): Promise<ProjectIndex | null> {
    try {
      // Ensure cache dir exists
      if (!fs.existsSync(this.config.cacheDir)) {
        return null;
      }

      // Try to load branch-specific index
      const gitInfo = this.config.enableGitBranch ? this.getGitBranchInfo() : this.getDefaultGitInfo();
      const branch = gitInfo.branch;
      const userId = this.config.userId;
      const fileName = `index-${userId}-${branch.replace(/\//g, '-')}.json`;
      const cachePath = path.join(this.config.cacheDir, fileName);

      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

      // Convert plain objects back to Maps
      const index: ProjectIndex = {
        ...data,
        files: new Map(Object.entries(data.files || {})),
        dependencies: new Map(
          Object.entries(data.dependencies || {}).map(([k, v]) => [k, new Set(v as string[])])
        ),
        dependents: new Map(
          Object.entries(data.dependents || {}).map(([k, v]) => [k, new Set(v as string[])])
        ),
      };

      // Rebuild file hashes
      for (const [filePath, fileIndex] of index.files) {
        this.fileHashes.set(filePath, fileIndex.metadata.hash);
      }

      return index;
    } catch {
      return null;
    }
  }

  private async saveCachedIndex(): Promise<void> {
    if (!this.projectIndex) return;

    try {
      // Ensure cache dir exists
      if (!fs.existsSync(this.config.cacheDir)) {
        fs.mkdirSync(this.config.cacheDir, { recursive: true });
      }

      const cachePath = this.getCacheFilePath();

      // Convert Maps to plain objects for JSON serialization
      const data = {
        ...this.projectIndex,
        files: Object.fromEntries(this.projectIndex.files),
        dependencies: Object.fromEntries(
          Array.from(this.projectIndex.dependencies).map(([k, v]) => [k, Array.from(v)])
        ),
        dependents: Object.fromEntries(
          Array.from(this.projectIndex.dependents).map(([k, v]) => [k, Array.from(v)])
        ),
      };

      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      // Silently fail on cache write errors
    }
  }
}

export default IncrementalIndexer;

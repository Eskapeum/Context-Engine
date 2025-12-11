/**
 * Universal Context Engine - Filesystem Source Adapter
 * @module sources/filesystem-adapter
 *
 * Adapter for indexing local filesystem directories.
 * This is the default adapter used by UCE.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ignore from 'ignore';
import type {
  SourceAdapter,
  SourceFile,
  SourceMetadata,
  SourceCapabilities,
} from './source-adapter.js';

// ============================================================================
// Filesystem Adapter
// ============================================================================

export interface FilesystemAdapterOptions {
  /** Root directory to index */
  rootPath: string;
  /** Patterns to ignore (in addition to .gitignore) */
  ignorePatterns?: string[];
  /** Maximum file size to index (bytes) */
  maxFileSize?: number;
  /** File extensions to skip */
  skipExtensions?: string[];
}

/**
 * Filesystem source adapter
 *
 * Indexes files from a local directory with .gitignore support.
 *
 * Usage:
 * ```typescript
 * const adapter = new FilesystemAdapter({
 *   rootPath: '/path/to/project',
 *   ignorePatterns: ['** /dist/** ', '** /build/** '],
 * });
 * await adapter.initialize();
 * const files = await adapter.listFiles();
 * ```
 */
export class FilesystemAdapter implements SourceAdapter {
  readonly metadata: SourceMetadata;
  readonly capabilities: SourceCapabilities = {
    supportsChangeDetection: true,
    supportsWatch: true,
    supportsListing: true,
    supportsFetch: true,
    supportsBatchFetch: true,
  };

  private options: Required<FilesystemAdapterOptions>;
  private ig: ReturnType<typeof ignore>;
  private fileCache = new Map<string, { hash: string; mtime: number }>();

  constructor(options: FilesystemAdapterOptions) {
    this.options = {
      rootPath: path.resolve(options.rootPath),
      ignorePatterns: options.ignorePatterns || [],
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      skipExtensions: options.skipExtensions || ['.min.js', '.bundle.js', '.map'],
    };

    this.metadata = {
      id: `filesystem:${this.options.rootPath}`,
      type: 'filesystem',
      name: path.basename(this.options.rootPath),
      description: `Local filesystem: ${this.options.rootPath}`,
    };

    this.ig = ignore();
  }

  async initialize(): Promise<void> {
    // Load ignore files
    this.loadIgnoreFiles();
  }

  async listFiles(): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    await this.scanDirectory(this.options.rootPath, files);
    return files;
  }

  async fetchFile(id: string): Promise<SourceFile> {
    const filePath = id;
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    const hash = this.computeHash(content);

    return {
      id: filePath,
      path: path.relative(this.options.rootPath, filePath),
      content,
      language: this.detectLanguage(filePath),
      metadata: {
        lastModified: stats.mtime.toISOString(),
        size: stats.size,
        hash,
      },
    };
  }

  async fetchFiles(ids: string[]): Promise<SourceFile[]> {
    return Promise.all(ids.map((id) => this.fetchFile(id)));
  }

  async detectChanges(_lastSync: Date): Promise<{
    added: string[];
    modified: string[];
    removed: string[];
  }> {
    const currentFiles = await this.listFiles();
    const currentIds = new Set(currentFiles.map((f) => f.id));

    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    // Check for new and modified files
    for (const file of currentFiles) {
      const cached = this.fileCache.get(file.id);
      if (!cached) {
        added.push(file.id);
      } else if (file.metadata.hash !== cached.hash) {
        modified.push(file.id);
      }
    }

    // Check for removed files
    for (const cachedId of this.fileCache.keys()) {
      if (!currentIds.has(cachedId)) {
        removed.push(cachedId);
      }
    }

    // Update cache
    for (const file of currentFiles) {
      this.fileCache.set(file.id, {
        hash: file.metadata.hash!,
        mtime: new Date(file.metadata.lastModified!).getTime(),
      });
    }

    return { added, modified, removed };
  }

  async dispose(): Promise<void> {
    this.fileCache.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private loadIgnoreFiles(): void {
    // Load .gitignore
    const gitignorePath = path.join(this.options.rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      this.ig.add(content.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }

    // Load .contextignore
    const contextIgnorePath = path.join(this.options.rootPath, '.contextignore');
    if (fs.existsSync(contextIgnorePath)) {
      const content = fs.readFileSync(contextIgnorePath, 'utf-8');
      this.ig.add(content.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }

    // Load .uceignore
    const uceIgnorePath = path.join(this.options.rootPath, '.uceignore');
    if (fs.existsSync(uceIgnorePath)) {
      const content = fs.readFileSync(uceIgnorePath, 'utf-8');
      this.ig.add(content.split('\n').filter((line) => line.trim() && !line.startsWith('#')));
    }

    // Add custom patterns
    if (this.options.ignorePatterns.length > 0) {
      this.ig.add(this.options.ignorePatterns);
    }

    // Default ignore patterns
    this.ig.add([
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '.uce/**',
      '*.log',
      '.DS_Store',
    ]);
  }

  private async scanDirectory(dir: string, files: SourceFile[]): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.options.rootPath, fullPath);

      // Check ignore patterns
      if (this.ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, files);
      } else if (entry.isFile()) {
        // Skip files that are too large
        const stats = fs.statSync(fullPath);
        if (stats.size > this.options.maxFileSize) {
          continue;
        }

        // Skip by extension
        const ext = path.extname(fullPath);
        if (this.options.skipExtensions.includes(ext)) {
          continue;
        }

        // Only index text files
        if (!this.isTextFile(fullPath)) {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const hash = this.computeHash(content);

          files.push({
            id: fullPath,
            path: relativePath,
            content,
            language: this.detectLanguage(fullPath),
            metadata: {
              lastModified: stats.mtime.toISOString(),
              size: stats.size,
              hash,
            },
          });

          // Update cache
          this.fileCache.set(fullPath, {
            hash,
            mtime: stats.mtime.getTime(),
          });
        } catch {
          // Skip files that can't be read
          continue;
        }
      }
    }
  }

  private isTextFile(filePath: string): boolean {
    const textExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.cs',
      '.go',
      '.rs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
      '.scala',
      '.md',
      '.txt',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
      '.xml',
      '.html',
      '.css',
      '.scss',
      '.sql',
      '.sh',
      '.bash',
    ];

    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext);
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sql': 'sql',
      '.sh': 'bash',
      '.bash': 'bash',
    };

    return languageMap[ext] || 'unknown';
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

/**
 * Create a new filesystem adapter
 */
export function createFilesystemAdapter(options: FilesystemAdapterOptions): FilesystemAdapter {
  return new FilesystemAdapter(options);
}

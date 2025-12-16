/**
 * Context Exporter
 *
 * Exports project context as a shareable bundle.
 * Supports selective export and privacy controls.
 *
 * @module sharing/exporter
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { promisify } from 'util';
import type {
  ContextBundle,
  BundleComponents,
  BundleMetadata,
  BundleSource,
  ExportOptions,
  PrivacySettings,
  SerializedIndex,
  SerializedGraph,
  SerializedLibraryDocs,
  SerializedSummaries,
  BundleInfo,
} from './types.js';
import { DEFAULT_EXPORT_OPTIONS, DEFAULT_PRIVACY_SETTINGS } from './types.js';

const gzip = promisify(zlib.gzip);

// ============================================================================
// CONTEXT EXPORTER
// ============================================================================

/**
 * Exports project context as shareable bundles
 *
 * @example
 * ```ts
 * const exporter = new ContextExporter('/project/root');
 *
 * // Full export
 * await exporter.export('team-context.uce');
 *
 * // Selective export
 * await exporter.export('partial.uce', {
 *   include: ['index', 'graph'],
 *   privacy: { anonymizeSymbols: true }
 * });
 * ```
 */
export class ContextExporter {
  private projectRoot: string;
  private uceDir: string;
  private contextDir: string; // Legacy .context directory

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.uceDir = path.join(projectRoot, '.uce');
    this.contextDir = path.join(projectRoot, '.context'); // Legacy support
  }

  /**
   * Export context to a bundle file
   */
  async export(outputPath: string, options: Partial<ExportOptions> = {}): Promise<BundleInfo> {
    const opts: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      ...options,
      outputPath,
      privacy: { ...DEFAULT_PRIVACY_SETTINGS, ...options.privacy },
    };

    // Determine which components to export
    const componentsToExport = this.getComponentsToExport(opts);

    // Build bundle components
    const components = await this.buildComponents(componentsToExport, opts.privacy!);

    // Create bundle
    const bundle = this.createBundle(components, opts);

    // Write to file
    await this.writeBundle(bundle, opts);

    // Return info
    return this.getBundleInfo(bundle);
  }

  /**
   * Get information about what would be exported
   */
  async preview(options: Partial<ExportOptions> = {}): Promise<BundleInfo> {
    const opts: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      ...options,
      privacy: { ...DEFAULT_PRIVACY_SETTINGS, ...options.privacy },
    };

    const componentsToExport = this.getComponentsToExport(opts);
    const components = await this.buildComponents(componentsToExport, opts.privacy!);
    const bundle = this.createBundle(components, opts);

    return this.getBundleInfo(bundle);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getComponentsToExport(opts: ExportOptions): string[] {
    let components = opts.include || ['index', 'graph', 'libraryDocs', 'summaries'];

    if (opts.exclude) {
      components = components.filter((c) => !opts.exclude!.includes(c as any));
    }

    // Respect privacy settings
    if (opts.privacy?.excludeMemory) {
      components = components.filter((c) => c !== 'summaries');
    }

    return components;
  }

  private async buildComponents(
    componentNames: string[],
    privacy: PrivacySettings
  ): Promise<BundleComponents> {
    const components: BundleComponents = {};

    for (const name of componentNames) {
      switch (name) {
        case 'index':
          components.index = await this.exportIndex(privacy);
          break;
        case 'graph':
          components.graph = await this.exportGraph(privacy);
          break;
        case 'libraryDocs':
          components.libraryDocs = await this.exportLibraryDocs();
          break;
        case 'summaries':
          if (!privacy.excludeMemory) {
            components.summaries = await this.exportSummaries();
          }
          break;
      }
    }

    return components;
  }

  private async exportIndex(privacy: PrivacySettings): Promise<SerializedIndex | undefined> {
    // Check multiple possible index locations (legacy .context and new .uce)
    const possiblePaths = [
      path.join(this.contextDir, 'index.json'),      // Legacy location
      path.join(this.uceDir, 'index.json'),          // New location
      path.join(this.uceDir, 'index.json.gz'),       // Compressed new location
    ];

    let indexData: any = null;

    try {
      for (const indexPath of possiblePaths) {
        if (fs.existsSync(indexPath)) {
          if (indexPath.endsWith('.gz')) {
            const compressed = await fs.promises.readFile(indexPath);
            const decompressed = await promisify(zlib.gunzip)(compressed);
            indexData = JSON.parse(decompressed.toString());
          } else {
            const content = await fs.promises.readFile(indexPath, 'utf-8');
            indexData = JSON.parse(content);
          }
          break; // Found index, stop looking
        }
      }
    } catch {
      return undefined;
    }

    if (!indexData) return undefined;

    // Handle both array and object formats for files
    let fileEntries: any[];
    if (Array.isArray(indexData.files)) {
      fileEntries = indexData.files;
    } else if (typeof indexData.files === 'object') {
      // Legacy format: files is an object keyed by path
      fileEntries = Object.values(indexData.files);
    } else {
      fileEntries = [];
    }

    // Filter files based on privacy settings
    const files = fileEntries
      .filter((f: any) => !this.shouldExclude(f.path, privacy))
      .map((f: any) => {
        // Extract symbol names from symbol objects
        const symbolNames = (f.symbols || []).map((s: any) =>
          typeof s === 'string' ? s : s.name || ''
        ).filter(Boolean);

        return {
          path: f.path,
          hash: this.hashContent(f.path),
          symbols: privacy.anonymizeSymbols
            ? symbolNames.map((s: string) => this.anonymize(s))
            : symbolNames,
          modified: f.lastModified || f.modified || new Date().toISOString(),
        };
      });

    // Count total symbols
    const totalSymbols = indexData.totalSymbols ||
      files.reduce((sum: number, f: any) => sum + f.symbols.length, 0);

    return {
      version: '1.0.0',
      fileCount: files.length,
      symbolCount: totalSymbols,
      chunkCount: indexData.chunks?.length || 0,
      files,
    };
  }

  private async exportGraph(privacy: PrivacySettings): Promise<SerializedGraph | undefined> {
    const graphPath = path.join(this.uceDir, 'graph.json');

    try {
      if (!fs.existsSync(graphPath)) return undefined;

      const content = await fs.promises.readFile(graphPath, 'utf-8');
      const graphData = JSON.parse(content);

      let nodes = graphData.nodes || [];
      let edges = graphData.edges || [];

      // Filter nodes by privacy
      nodes = nodes.filter((n: any) => !this.shouldExclude(n.filePath, privacy));

      // Anonymize if needed
      if (privacy.anonymizeSymbols) {
        nodes = nodes.map((n: any) => ({
          ...n,
          name: this.anonymize(n.name),
          id: this.anonymize(n.id),
        }));

        edges = edges.map((e: any) => ({
          ...e,
          source: this.anonymize(e.source),
          target: this.anonymize(e.target),
        }));
      }

      return {
        version: '1.0.0',
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes,
        edges,
      };
    } catch {
      return undefined;
    }
  }

  private async exportLibraryDocs(): Promise<SerializedLibraryDocs | undefined> {
    const docsDir = path.join(this.uceDir, 'library-docs');

    try {
      if (!fs.existsSync(docsDir)) return undefined;

      const libraries: { name: string; version: string; summary: string }[] = [];
      const entries = await fs.promises.readdir(docsDir);

      for (const entry of entries) {
        const libPath = path.join(docsDir, entry);
        const stat = await fs.promises.stat(libPath);

        if (stat.isDirectory()) {
          // Read latest version
          const versions = await fs.promises.readdir(libPath);
          if (versions.length > 0) {
            const latestVersion = versions.sort().pop()!;
            const docPath = path.join(libPath, latestVersion);

            try {
              let content: string;
              if (docPath.endsWith('.gz')) {
                const compressed = await fs.promises.readFile(docPath);
                content = (await promisify(zlib.gunzip)(compressed)).toString();
              } else {
                content = await fs.promises.readFile(docPath, 'utf-8');
              }

              const doc = JSON.parse(content);
              libraries.push({
                name: entry,
                version: doc.version || latestVersion.replace('.json', ''),
                summary: doc.summary || '',
              });
            } catch {
              // Skip invalid docs
            }
          }
        }
      }

      return { libraries };
    } catch {
      return undefined;
    }
  }

  private async exportSummaries(): Promise<SerializedSummaries | undefined> {
    const memoryDir = path.join(this.uceDir, 'memory');
    const indexPath = path.join(memoryDir, 'index.json');

    try {
      if (!fs.existsSync(indexPath)) return undefined;

      const content = await fs.promises.readFile(indexPath, 'utf-8');
      const index = JSON.parse(content);

      const summaries = (index.sessions || []).map((s: any) => ({
        topics: s.topics || [],
        keyFindings: [],
        filesMentioned: s.files || [],
      }));

      return { summaries };
    } catch {
      return undefined;
    }
  }

  private createBundle(components: BundleComponents, opts: ExportOptions): ContextBundle {
    const projectName = opts.includeProjectName ? path.basename(this.projectRoot) : undefined;

    const source: BundleSource = {
      projectName,
      hash: this.hashBundle(components),
      gitBranch: this.getGitBranch(),
      gitCommit: this.getGitCommit(),
    };

    const includedComponents: string[] = [];
    let totalItems = 0;

    if (components.index) {
      includedComponents.push('index');
      totalItems += components.index.fileCount;
    }
    if (components.graph) {
      includedComponents.push('graph');
      totalItems += components.graph.nodeCount;
    }
    if (components.libraryDocs) {
      includedComponents.push('libraryDocs');
      totalItems += components.libraryDocs.libraries.length;
    }
    if (components.summaries) {
      includedComponents.push('summaries');
      totalItems += components.summaries.summaries.length;
    }

    const jsonContent = JSON.stringify({ components }, null, 2);
    const originalSize = Buffer.byteLength(jsonContent);

    const metadata: BundleMetadata = {
      fileCount: components.index?.fileCount || 0,
      symbolCount: components.index?.symbolCount || 0,
      compressed: opts.compress ?? true,
      compressionAlgorithm: opts.compress ? 'gzip' : 'none',
      originalSize,
      compressedSize: originalSize, // Will be updated after compression
      includedComponents,
      exportedAt: new Date().toISOString(),
    };

    return {
      version: '1.0.0',
      created: new Date().toISOString(),
      source,
      components,
      metadata,
    };
  }

  private async writeBundle(bundle: ContextBundle, opts: ExportOptions): Promise<void> {
    const jsonContent = JSON.stringify(bundle, null, 2);

    let outputPath = opts.outputPath;
    if (!path.isAbsolute(outputPath)) {
      outputPath = path.join(this.projectRoot, outputPath);
    }

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    if (opts.compress) {
      const compressed = await gzip(Buffer.from(jsonContent));
      bundle.metadata.compressedSize = compressed.length;

      // Update bundle with final compressed size and re-compress
      const finalContent = JSON.stringify(bundle, null, 2);
      const finalCompressed = await gzip(Buffer.from(finalContent));

      await fs.promises.writeFile(outputPath, finalCompressed);
    } else {
      await fs.promises.writeFile(outputPath, jsonContent);
    }
  }

  private getBundleInfo(bundle: ContextBundle): BundleInfo {
    return {
      version: bundle.version,
      created: bundle.created,
      source: bundle.source,
      metadata: bundle.metadata,
      components: [
        {
          name: 'index',
          present: !!bundle.components.index,
          itemCount: bundle.components.index?.fileCount,
        },
        {
          name: 'graph',
          present: !!bundle.components.graph,
          itemCount: bundle.components.graph?.nodeCount,
        },
        {
          name: 'libraryDocs',
          present: !!bundle.components.libraryDocs,
          itemCount: bundle.components.libraryDocs?.libraries.length,
        },
        {
          name: 'summaries',
          present: !!bundle.components.summaries,
          itemCount: bundle.components.summaries?.summaries.length,
        },
      ],
    };
  }

  private shouldExclude(filePath: string | undefined, privacy: PrivacySettings): boolean {
    if (!filePath) return false;

    // Check exclude patterns
    for (const pattern of privacy.excludePatterns) {
      if (this.matchPattern(filePath, pattern)) {
        return true;
      }
    }

    // Check exclude files
    if (privacy.excludeFiles.includes(filePath)) {
      return true;
    }

    return false;
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    // Simple glob-like matching
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    );
    return regex.test(filePath) || regex.test(path.basename(filePath));
  }

  private anonymize(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private hashBundle(components: BundleComponents): string {
    const content = JSON.stringify(components);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private getGitBranch(): string | undefined {
    try {
      const headPath = path.join(this.projectRoot, '.git', 'HEAD');
      if (fs.existsSync(headPath)) {
        const content = fs.readFileSync(headPath, 'utf-8').trim();
        const match = content.match(/ref: refs\/heads\/(.+)/);
        return match ? match[1] : undefined;
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  private getGitCommit(): string | undefined {
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
    return undefined;
  }
}

export default ContextExporter;

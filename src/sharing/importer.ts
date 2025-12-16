/**
 * Context Importer
 *
 * Imports context bundles from teammates.
 * Supports merge and replace modes with conflict handling.
 *
 * @module sharing/importer
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type {
  ContextBundle,
  ImportOptions,
  ImportResult,
  ImportConflict,
  BundleInfo,
  BundleComponentType,
} from './types.js';
import { DEFAULT_IMPORT_OPTIONS } from './types.js';

const gunzip = promisify(zlib.gunzip);

// ============================================================================
// CONTEXT IMPORTER
// ============================================================================

/**
 * Imports context bundles from external sources
 *
 * @example
 * ```ts
 * const importer = new ContextImporter('/project/root');
 *
 * // Preview import
 * const preview = await importer.preview('team-context.uce');
 *
 * // Import with merge
 * const result = await importer.import('team-context.uce', { merge: true });
 * ```
 */
export class ContextImporter {
  private projectRoot: string;
  private uceDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.uceDir = path.join(projectRoot, '.uce');
  }

  /**
   * Import a context bundle
   */
  async import(bundlePath: string, options: Partial<ImportOptions> = {}): Promise<ImportResult> {
    const opts: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...options };

    // Load bundle
    const bundle = await this.loadBundle(bundlePath);
    if (!bundle) {
      return {
        success: false,
        importedComponents: [],
        filesImported: 0,
        symbolsImported: 0,
        conflicts: [],
        errors: [`Failed to load bundle: ${bundlePath}`],
        dryRun: opts.dryRun,
      };
    }

    // Validate bundle
    const validationErrors = this.validateBundle(bundle);
    if (validationErrors.length > 0) {
      return {
        success: false,
        importedComponents: [],
        filesImported: 0,
        symbolsImported: 0,
        conflicts: [],
        errors: validationErrors,
        dryRun: opts.dryRun,
      };
    }

    // Determine components to import
    const componentsToImport = opts.components || this.getAvailableComponents(bundle);

    // Check for conflicts
    const conflicts = await this.detectConflicts(bundle, componentsToImport, opts);

    // Handle conflicts based on options
    const resolvedConflicts = this.resolveConflicts(conflicts, opts);

    if (opts.dryRun) {
      return {
        success: true,
        importedComponents: componentsToImport,
        filesImported: bundle.components.index?.fileCount || 0,
        symbolsImported: bundle.components.index?.symbolCount || 0,
        conflicts: resolvedConflicts,
        errors: [],
        dryRun: true,
      };
    }

    // Perform import
    const result = await this.performImport(bundle, componentsToImport, opts, resolvedConflicts);

    return result;
  }

  /**
   * Preview what would be imported
   */
  async preview(bundlePath: string): Promise<BundleInfo | null> {
    const bundle = await this.loadBundle(bundlePath);
    if (!bundle) return null;

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

  /**
   * Compare two bundles
   */
  async diff(bundlePath1: string, bundlePath2: string): Promise<BundleDiff> {
    const bundle1 = await this.loadBundle(bundlePath1);
    const bundle2 = await this.loadBundle(bundlePath2);

    if (!bundle1 || !bundle2) {
      throw new Error('Failed to load one or both bundles');
    }

    return {
      versionDiff: bundle1.version !== bundle2.version,
      createdDiff: {
        bundle1: bundle1.created,
        bundle2: bundle2.created,
      },
      componentsDiff: {
        index: this.diffComponent(bundle1.components.index, bundle2.components.index),
        graph: this.diffComponent(bundle1.components.graph, bundle2.components.graph),
        libraryDocs: this.diffComponent(
          bundle1.components.libraryDocs,
          bundle2.components.libraryDocs
        ),
        summaries: this.diffComponent(bundle1.components.summaries, bundle2.components.summaries),
      },
      metadataDiff: {
        fileCount: bundle1.metadata.fileCount - bundle2.metadata.fileCount,
        symbolCount: bundle1.metadata.symbolCount - bundle2.metadata.symbolCount,
      },
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async loadBundle(bundlePath: string): Promise<ContextBundle | null> {
    try {
      let fullPath = bundlePath;
      if (!path.isAbsolute(fullPath)) {
        fullPath = path.join(this.projectRoot, bundlePath);
      }

      if (!fs.existsSync(fullPath)) {
        return null;
      }

      const content = await fs.promises.readFile(fullPath);

      // Try to decompress
      let jsonContent: string;
      try {
        const decompressed = await gunzip(content);
        jsonContent = decompressed.toString();
      } catch {
        // Not compressed, treat as plain JSON
        jsonContent = content.toString();
      }

      return JSON.parse(jsonContent) as ContextBundle;
    } catch {
      return null;
    }
  }

  private validateBundle(bundle: ContextBundle): string[] {
    const errors: string[] = [];

    if (!bundle.version) {
      errors.push('Bundle missing version');
    }

    if (!bundle.components) {
      errors.push('Bundle missing components');
    }

    if (!bundle.metadata) {
      errors.push('Bundle missing metadata');
    }

    // Version compatibility check
    const majorVersion = parseInt(bundle.version.split('.')[0], 10);
    if (majorVersion > 1) {
      errors.push(`Bundle version ${bundle.version} may not be compatible`);
    }

    return errors;
  }

  private getAvailableComponents(bundle: ContextBundle): BundleComponentType[] {
    const components: BundleComponentType[] = [];

    if (bundle.components.index) components.push('index');
    if (bundle.components.graph) components.push('graph');
    if (bundle.components.libraryDocs) components.push('libraryDocs');
    if (bundle.components.summaries) components.push('summaries');

    return components;
  }

  private async detectConflicts(
    _bundle: ContextBundle,
    components: BundleComponentType[],
    _opts: ImportOptions
  ): Promise<ImportConflict[]> {
    const conflicts: ImportConflict[] = [];

    for (const component of components) {
      switch (component) {
        case 'index': {
          const existingPath = path.join(this.uceDir, 'index.json');
          const existingGzPath = path.join(this.uceDir, 'index.json.gz');

          if (fs.existsSync(existingPath) || fs.existsSync(existingGzPath)) {
            conflicts.push({
              component: 'index',
              type: 'hash_mismatch',
              description: 'Existing index will be modified',
            });
          }
          break;
        }

        case 'graph': {
          const existingPath = path.join(this.uceDir, 'graph.json');
          if (fs.existsSync(existingPath)) {
            conflicts.push({
              component: 'graph',
              type: 'hash_mismatch',
              description: 'Existing graph will be modified',
            });
          }
          break;
        }

        case 'libraryDocs': {
          const existingDir = path.join(this.uceDir, 'library-docs');
          if (fs.existsSync(existingDir)) {
            conflicts.push({
              component: 'libraryDocs',
              type: 'hash_mismatch',
              description: 'Library docs may be overwritten',
            });
          }
          break;
        }
      }
    }

    return conflicts;
  }

  private resolveConflicts(
    conflicts: ImportConflict[],
    opts: ImportOptions
  ): ImportConflict[] {
    return conflicts.map((conflict) => {
      if (opts.overwrite) {
        return { ...conflict, resolution: 'overwritten' as const };
      } else if (opts.merge) {
        return { ...conflict, resolution: 'merged' as const };
      } else {
        return { ...conflict, resolution: 'skipped' as const };
      }
    });
  }

  private async performImport(
    bundle: ContextBundle,
    components: BundleComponentType[],
    opts: ImportOptions,
    conflicts: ImportConflict[]
  ): Promise<ImportResult> {
    const errors: string[] = [];
    const importedComponents: BundleComponentType[] = [];
    let filesImported = 0;
    let symbolsImported = 0;

    // Ensure .uce directory exists
    await fs.promises.mkdir(this.uceDir, { recursive: true });

    for (const component of components) {
      const conflict = conflicts.find((c) => c.component === component);

      // Skip if conflict not resolved
      if (conflict && conflict.resolution === 'skipped') {
        continue;
      }

      try {
        switch (component) {
          case 'index':
            await this.importIndex(bundle, opts.merge);
            importedComponents.push('index');
            filesImported += bundle.components.index?.fileCount || 0;
            symbolsImported += bundle.components.index?.symbolCount || 0;
            break;

          case 'graph':
            await this.importGraph(bundle, opts.merge);
            importedComponents.push('graph');
            break;

          case 'libraryDocs':
            await this.importLibraryDocs(bundle, opts.merge);
            importedComponents.push('libraryDocs');
            break;

          case 'summaries':
            await this.importSummaries(bundle, opts.merge);
            importedComponents.push('summaries');
            break;
        }
      } catch (error) {
        errors.push(`Failed to import ${component}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      importedComponents,
      filesImported,
      symbolsImported,
      conflicts,
      errors,
      dryRun: false,
    };
  }

  private async importIndex(bundle: ContextBundle, merge: boolean): Promise<void> {
    if (!bundle.components.index) return;

    const indexPath = path.join(this.uceDir, 'index.json');

    if (merge && fs.existsSync(indexPath)) {
      // Merge with existing
      const existingContent = await fs.promises.readFile(indexPath, 'utf-8');
      const existing = JSON.parse(existingContent);

      // Merge files (bundle files take precedence)
      const existingFiles = new Map((existing.files || []).map((f: any) => [f.path, f]));

      for (const file of bundle.components.index.files || []) {
        existingFiles.set(file.path, file);
      }

      existing.files = [...existingFiles.values()];
      existing.fileCount = existing.files.length;

      await fs.promises.writeFile(indexPath, JSON.stringify(existing, null, 2));
    } else {
      // Replace
      await fs.promises.writeFile(
        indexPath,
        JSON.stringify(
          {
            version: bundle.components.index.version,
            files: bundle.components.index.files,
            fileCount: bundle.components.index.fileCount,
            symbolCount: bundle.components.index.symbolCount,
          },
          null,
          2
        )
      );
    }
  }

  private async importGraph(bundle: ContextBundle, merge: boolean): Promise<void> {
    if (!bundle.components.graph) return;

    const graphPath = path.join(this.uceDir, 'graph.json');

    if (merge && fs.existsSync(graphPath)) {
      // Merge with existing
      const existingContent = await fs.promises.readFile(graphPath, 'utf-8');
      const existing = JSON.parse(existingContent);

      // Merge nodes (by id)
      const existingNodes = new Map((existing.nodes || []).map((n: any) => [n.id, n]));
      for (const node of bundle.components.graph.nodes || []) {
        existingNodes.set((node as any).id, node);
      }

      // Merge edges (by source-target-type key)
      const existingEdges = new Map(
        (existing.edges || []).map((e: any) => [`${e.source}-${e.target}-${e.type}`, e])
      );
      for (const edge of bundle.components.graph.edges || []) {
        const key = `${(edge as any).source}-${(edge as any).target}-${(edge as any).type}`;
        existingEdges.set(key, edge);
      }

      existing.nodes = [...existingNodes.values()];
      existing.edges = [...existingEdges.values()];

      await fs.promises.writeFile(graphPath, JSON.stringify(existing, null, 2));
    } else {
      // Replace
      await fs.promises.writeFile(
        graphPath,
        JSON.stringify(
          {
            nodes: bundle.components.graph.nodes,
            edges: bundle.components.graph.edges,
          },
          null,
          2
        )
      );
    }
  }

  private async importLibraryDocs(bundle: ContextBundle, _merge: boolean): Promise<void> {
    if (!bundle.components.libraryDocs) return;

    const docsDir = path.join(this.uceDir, 'library-docs');
    await fs.promises.mkdir(docsDir, { recursive: true });

    // Just record the libraries (actual docs would need more data)
    const indexPath = path.join(docsDir, 'imported.json');
    await fs.promises.writeFile(
      indexPath,
      JSON.stringify(bundle.components.libraryDocs, null, 2)
    );
  }

  private async importSummaries(bundle: ContextBundle, _merge: boolean): Promise<void> {
    if (!bundle.components.summaries) return;

    const memoryDir = path.join(this.uceDir, 'memory');
    await fs.promises.mkdir(memoryDir, { recursive: true });

    const summariesPath = path.join(memoryDir, 'imported-summaries.json');
    await fs.promises.writeFile(
      summariesPath,
      JSON.stringify(bundle.components.summaries, null, 2)
    );
  }

  private diffComponent(comp1: any, comp2: any): ComponentDiff {
    return {
      inFirst: !!comp1,
      inSecond: !!comp2,
      itemCountDiff: (comp1?.fileCount || comp1?.nodeCount || 0) -
                     (comp2?.fileCount || comp2?.nodeCount || 0),
    };
  }
}

// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

interface BundleDiff {
  versionDiff: boolean;
  createdDiff: { bundle1: string; bundle2: string };
  componentsDiff: {
    index: ComponentDiff;
    graph: ComponentDiff;
    libraryDocs: ComponentDiff;
    summaries: ComponentDiff;
  };
  metadataDiff: {
    fileCount: number;
    symbolCount: number;
  };
}

interface ComponentDiff {
  inFirst: boolean;
  inSecond: boolean;
  itemCountDiff: number;
}

export default ContextImporter;

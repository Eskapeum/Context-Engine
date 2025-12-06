/**
 * Universal Context Memory (UCM)
 *
 * Auto-indexing memory for AI coding assistants - baked into your project.
 *
 * UCM indexes your codebase and generates context files that AI tools
 * like Claude Code, Cursor, and GitHub Copilot automatically read,
 * so they always understand your project structure.
 *
 * @packageDocumentation
 * @module universal-context-memory
 *
 * @example Basic Usage
 * ```ts
 * import { indexProject } from 'universal-context-memory';
 *
 * // Index a project and generate all context files
 * await indexProject('/path/to/your/project');
 * ```
 *
 * @example Advanced Usage
 * ```ts
 * import { Indexer, ContextGenerator } from 'universal-context-memory';
 *
 * // Create indexer with custom config
 * const indexer = new Indexer({
 *   projectRoot: '/path/to/project',
 *   maxFileSize: 2 * 1024 * 1024, // 2MB
 *   extractDocstrings: true,
 * });
 *
 * // Index the project
 * const index = await indexer.index();
 * await indexer.saveIndex(index);
 *
 * // Generate context files
 * const generator = new ContextGenerator({
 *   projectRoot: '/path/to/project',
 *   index,
 * });
 * generator.generateAll();
 * ```
 */

// Export Indexer and related types
export {
  Indexer,
  type ProjectIndex,
  type FileIndex,
  type CodeSymbol,
  type FileImport,
  type DependencyEdge,
  type IndexerConfig,
} from './indexer.js';

// Export Generator and related types
export {
  ContextGenerator,
  generateContextMd,
  generateClaudeMd,
  generateCursorRules,
  generateCopilotInstructions,
  type GeneratorConfig,
} from './generator.js';

import { Indexer } from './indexer.js';
import { ContextGenerator } from './generator.js';
import * as path from 'path';

/**
 * Quick function to index a project and generate all context files.
 *
 * This is the simplest way to use UCM - just call this function with
 * your project path and it will index everything and generate all
 * context files.
 *
 * @param projectRoot - Path to the project root (defaults to current directory)
 *
 * @example
 * ```ts
 * import { indexProject } from 'universal-context-memory';
 *
 * // Index current directory
 * await indexProject();
 *
 * // Index a specific project
 * await indexProject('/path/to/my/project');
 * ```
 */
export async function indexProject(projectRoot: string = process.cwd()): Promise<void> {
  const resolvedPath = path.resolve(projectRoot);

  const indexer = new Indexer({ projectRoot: resolvedPath });
  const index = await indexer.index();
  await indexer.saveIndex(index);

  const generator = new ContextGenerator({ projectRoot: resolvedPath, index });
  generator.generateAll();
}

/**
 * Load an existing project index from disk.
 *
 * Use this to read a previously created index without re-indexing.
 *
 * @param projectRoot - Path to the project root (defaults to current directory)
 * @returns The project index, or null if no index exists
 *
 * @example
 * ```ts
 * import { loadIndex } from 'universal-context-memory';
 *
 * const index = loadIndex('/path/to/project');
 * if (index) {
 *   console.log(`Found ${index.totalFiles} files with ${index.totalSymbols} symbols`);
 * }
 * ```
 */
export function loadIndex(projectRoot: string = process.cwd()) {
  const resolvedPath = path.resolve(projectRoot);
  const indexer = new Indexer({ projectRoot: resolvedPath });
  return indexer.loadIndex();
}

/**
 * Version of the UCM package.
 */
export const VERSION = '1.0.0';

// Default export for convenience
export default {
  Indexer,
  ContextGenerator,
  indexProject,
  loadIndex,
  VERSION,
};

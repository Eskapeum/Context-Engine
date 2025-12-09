/**
 * Universal Context Engine - CLI
 *
 * Command-line interface for UCE.
 * Provides commands for indexing, watching, querying, and managing context files.
 *
 * @module cli
 */

import { Command } from 'commander';
import { Indexer } from './indexer.js';
import { ContextGenerator } from './generator.js';
import { ContextEngine } from './context-engine.js';
import { FileWatcher } from './core/watcher.js';
import { KnowledgeGraph, GraphBuilder } from './graph/index.js';
import { loadConfig, validateConfig, generateDefaultConfig, type UCMConfig } from './config.js';
import * as fs from 'fs';
import * as path from 'path';

const VERSION = '2.1.0';

const program = new Command();

program
  .name('uce')
  .description('Universal Context Engine - Auto-indexing memory for AI coding assistants')
  .version(VERSION);

// ============================================================================
// INIT COMMAND
// ============================================================================

program
  .command('init')
  .description('Initialize UCE in the current project')
  .option('-s, --silent', 'Suppress output')
  .action(async (options) => {
    const projectRoot = process.cwd();

    if (!options.silent) {
      console.log('🚀 Initializing Universal Context Engine...\n');
    }

    // Create .contextignore if it doesn't exist
    const contextIgnorePath = path.join(projectRoot, '.contextignore');
    if (!fs.existsSync(contextIgnorePath)) {
      const defaultIgnore = `# Files to exclude from context indexing
# (in addition to .gitignore)

# Large generated files
*.min.js
*.bundle.js
*.chunk.js

# Test fixtures
__fixtures__/
__mocks__/

# Documentation builds
docs/build/
site/

# Add project-specific excludes below:
`;
      fs.writeFileSync(contextIgnorePath, defaultIgnore);
      if (!options.silent) {
        console.log('✅ Created .contextignore');
      }
    }

    // Run initial index
    const indexer = new Indexer({ projectRoot });
    const index = await indexer.index();
    await indexer.saveIndex(index);

    if (!options.silent) {
      console.log(`✅ Indexed ${index.totalFiles} files, ${index.totalSymbols} symbols`);
    }

    // Generate context file (UCE.md only by default)
    const generator = new ContextGenerator({ projectRoot, index });
    generator.generateAll();

    if (!options.silent) {
      console.log('✅ Generated UCE.md (universal context file)');
      console.log('\n📁 Index stored in .uce/');
      console.log('\n💡 Tip: Commit UCE.md to share context with your team!');
    }
  });

// ============================================================================
// INDEX COMMAND
// ============================================================================

program
  .command('index')
  .description('Re-index the codebase and regenerate context files')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-n, --no-generate', 'Index only, do not regenerate context files')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);

    console.log(`📇 Indexing ${projectRoot}...\n`);

    const startTime = Date.now();
    const indexer = new Indexer({ projectRoot });
    const index = await indexer.index();
    await indexer.saveIndex(index);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Indexed ${index.totalFiles} files, ${index.totalSymbols} symbols in ${elapsed}s`);

    // Show language breakdown
    console.log('\n📊 Language breakdown:');
    for (const [lang, stats] of Object.entries(index.languageStats)) {
      console.log(`   ${lang}: ${stats.files} files, ${stats.symbols} symbols`);
    }

    if (options.generate !== false) {
      const generator = new ContextGenerator({ projectRoot, index });
      generator.generateAll();
      console.log('\n✅ Generated UCE.md');
    }
  });

// ============================================================================
// GENERATE COMMAND
// ============================================================================

program
  .command('generate')
  .description('Generate context files from existing index')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--all', 'Generate all tool-specific files (CLAUDE.md, .cursorrules, etc.)')
  .option('--claude', 'Generate CLAUDE.md for Claude Code')
  .option('--cursor', 'Generate .cursorrules for Cursor IDE')
  .option('--copilot', 'Generate .github/copilot-instructions.md for GitHub Copilot')
  .option('--context', 'Generate CONTEXT.md (generic format)')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);

    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    const generator = new ContextGenerator({ projectRoot, index });
    generator.generateAll({
      all: options.all,
      claude: options.claude,
      cursor: options.cursor,
      copilot: options.copilot,
      context: options.context,
    });

    console.log('✅ Generated UCE.md');
    if (options.all) {
      console.log('   + CLAUDE.md, CONTEXT.md, .cursorrules, .github/copilot-instructions.md');
    } else {
      if (options.claude) console.log('   + CLAUDE.md');
      if (options.context) console.log('   + CONTEXT.md');
      if (options.cursor) console.log('   + .cursorrules');
      if (options.copilot) console.log('   + .github/copilot-instructions.md');
    }
  });

// ============================================================================
// WATCH COMMAND
// ============================================================================

program
  .command('watch')
  .description('Watch for file changes and auto-update context files')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-d, --debounce <ms>', 'Debounce delay in milliseconds', '500')
  .option('--no-regenerate', 'Skip regenerating context files on change')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const debounceMs = parseInt(options.debounce, 10);

    console.log(`👀 Watching ${projectRoot} for changes...\n`);

    // Initial index
    const indexer = new Indexer({ projectRoot });
    let index = await indexer.index();
    await indexer.saveIndex(index);

    if (options.regenerate !== false) {
      const generator = new ContextGenerator({ projectRoot, index });
      generator.generateAll();
    }

    console.log(`✅ Initial index: ${index.totalFiles} files, ${index.totalSymbols} symbols\n`);

    // Use our FileWatcher with smart dependency tracking
    const watcher = new FileWatcher(projectRoot, {
      debounceMs,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.context/**',
        '**/.uce/**',
        '**/CONTEXT.md',
        '**/CLAUDE.md',
        '**/.cursorrules',
        '**/.github/copilot-instructions.md',
      ],
    });

    watcher.on('change', async (event) => {
      const { filePath, type, affectedFiles } = event;
      const relativePath = path.relative(projectRoot, filePath);

      if (type === 'add') {
        console.log(`➕ Added: ${relativePath}`);
      } else if (type === 'change') {
        console.log(`📝 Changed: ${relativePath}`);
      } else if (type === 'unlink') {
        console.log(`➖ Removed: ${relativePath}`);
      }

      if (affectedFiles.length > 1) {
        console.log(`   → ${affectedFiles.length - 1} dependent files affected`);
      }

      console.log('🔄 Reindexing...');
      const startTime = Date.now();

      index = await indexer.index();
      await indexer.saveIndex(index);

      if (options.regenerate !== false) {
        const newGenerator = new ContextGenerator({ projectRoot, index });
        newGenerator.generateAll();
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Updated in ${elapsed}s (${index.totalFiles} files)\n`);
    });

    watcher.start();
    console.log('Press Ctrl+C to stop watching.\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping watch mode...');
      watcher.stop();
      process.exit(0);
    });
  });

// ============================================================================
// STATS COMMAND
// ============================================================================

program
  .command('stats')
  .description('Show index statistics')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action((options) => {
    const projectRoot = path.resolve(options.path);
    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    console.log(`\n📊 ${index.projectName} - Index Statistics`);
    console.log('──────────────────────────────────────────────────');
    console.log(`Files indexed:     ${index.totalFiles}`);
    console.log(`Symbols extracted: ${index.totalSymbols}`);

    // Count by kind
    const byKind: Record<string, number> = {};
    for (const file of Object.values(index.files)) {
      for (const sym of file.symbols) {
        byKind[sym.kind] = (byKind[sym.kind] || 0) + 1;
      }
    }

    for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${kind.padEnd(12)}: ${count}`);
    }

    console.log(`Dependencies:      ${index.dependencies.length}`);
    console.log(`Entry points:      ${index.entryPoints.length}`);

    console.log('\n📂 By Language:');
    for (const [lang, stats] of Object.entries(index.languageStats)) {
      console.log(`  ${lang.padEnd(12)}: ${stats.files} files, ${stats.symbols} symbols`);
    }

    console.log(`\n🕐 Indexed at: ${index.indexedAt}`);
    console.log(`📦 UCE version: ${index.uceVersion}`);
  });

// ============================================================================
// QUERY COMMAND
// ============================================================================

program
  .command('query <term>')
  .description('Search the index for symbols, files, or content')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action((term, options) => {
    const projectRoot = path.resolve(options.path);
    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    const termLower = term.toLowerCase();
    const results: Array<{ type: string; file: string; name: string; line?: number }> = [];

    // Search files
    for (const [filePath, fileIndex] of Object.entries(index.files)) {
      if (filePath.toLowerCase().includes(termLower)) {
        results.push({ type: 'file', file: filePath, name: filePath });
      }

      // Search symbols
      for (const sym of fileIndex.symbols) {
        if (sym.name.toLowerCase().includes(termLower)) {
          results.push({
            type: sym.kind,
            file: filePath,
            name: sym.name,
            line: sym.line,
          });
        }
      }
    }

    if (results.length === 0) {
      console.log(`\n❌ No results for "${term}"`);
      return;
    }

    console.log(`\n🔍 Found ${results.length} results for "${term}":\n`);

    for (const result of results.slice(0, 20)) {
      const loc = result.line ? `:${result.line}` : '';
      console.log(`  [${result.type.padEnd(10)}] ${result.name}`);
      console.log(`             ${result.file}${loc}\n`);
    }

    if (results.length > 20) {
      console.log(`  ... and ${results.length - 20} more results\n`);
    }
  });

// ============================================================================
// EXPORT COMMAND
// ============================================================================

program
  .command('export')
  .description('Export the index as JSON')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-o, --output <file>', 'Output file', 'context-export.json')
  .action((options) => {
    const projectRoot = path.resolve(options.path);
    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));
    console.log(`✅ Exported index to ${outputPath}`);
  });

// ============================================================================
// CLEAN COMMAND
// ============================================================================

program
  .command('clean')
  .description('Remove all generated context files')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action((options) => {
    const projectRoot = path.resolve(options.path);

    const filesToRemove = [
      '.uce',
      '.context',
      'UCE.md',
      'CONTEXT.md',
      'CLAUDE.md',
      '.cursorrules',
      '.github/copilot-instructions.md',
    ];

    for (const file of filesToRemove) {
      const fullPath = path.join(projectRoot, file);
      if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        console.log(`🗑️  Removed ${file}`);
      }
    }

    console.log('\n✅ Cleaned up context files');
  });

// ============================================================================
// DIFF COMMAND
// ============================================================================

program
  .command('diff')
  .description('Show changes since last index')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const indexer = new Indexer({ projectRoot });
    const oldIndex = indexer.loadIndex();

    if (!oldIndex) {
      console.log('❌ No previous index found. Run `uce index` first.');
      process.exit(1);
    }

    const newIndex = await indexer.index();

    // Compare files
    const oldFiles = new Set(Object.keys(oldIndex.files));
    const newFiles = new Set(Object.keys(newIndex.files));

    const added = [...newFiles].filter((f) => !oldFiles.has(f));
    const removed = [...oldFiles].filter((f) => !newFiles.has(f));
    const modified: string[] = [];

    for (const file of newFiles) {
      if (oldFiles.has(file)) {
        const oldFile = oldIndex.files[file];
        const newFile = newIndex.files[file];
        if (oldFile.lastModified !== newFile.lastModified) {
          modified.push(file);
        }
      }
    }

    console.log('\n📊 Changes since last index:\n');

    if (added.length > 0) {
      console.log(`➕ Added (${added.length}):`);
      added.forEach((f) => console.log(`   ${f}`));
      console.log();
    }

    if (removed.length > 0) {
      console.log(`➖ Removed (${removed.length}):`);
      removed.forEach((f) => console.log(`   ${f}`));
      console.log();
    }

    if (modified.length > 0) {
      console.log(`📝 Modified (${modified.length}):`);
      modified.forEach((f) => console.log(`   ${f}`));
      console.log();
    }

    if (added.length === 0 && removed.length === 0 && modified.length === 0) {
      console.log('No changes detected.');
    }

    console.log(`\nSymbols: ${oldIndex.totalSymbols} → ${newIndex.totalSymbols}`);
  });

// ============================================================================
// SEARCH COMMAND (Hybrid BM25 + Semantic)
// ============================================================================

program
  .command('search <query>')
  .description('Hybrid search using BM25 + semantic similarity')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-n, --limit <number>', 'Maximum results', '10')
  .option('-t, --tokens <number>', 'Max tokens in results', '8000')
  .option('-m, --mode <mode>', 'Search mode: hybrid, bm25, semantic', 'bm25')
  .option('-s, --score <number>', 'Minimum relevance score (0-1)', '0.1')
  .option('--show-content', 'Show matching content snippets')
  .action(async (query, options) => {
    const projectRoot = path.resolve(options.path);
    const limit = parseInt(options.limit, 10);
    const maxTokens = parseInt(options.tokens, 10);
    const minScore = parseFloat(options.score);

    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    console.log(`\n🔍 Searching for "${query}" (mode: ${options.mode})...\n`);

    const engine = new ContextEngine({ projectRoot, index });
    const startTime = Date.now();

    let results;
    if (options.mode === 'hybrid') {
      results = await engine.hybridRetrieve(query, maxTokens, minScore, { semanticWeight: 0.5, bm25Weight: 0.5 });
    } else if (options.mode === 'semantic') {
      results = await engine.retrieve(query, maxTokens, minScore);
    } else {
      results = await engine.bm25Retrieve(query, maxTokens, { minScore });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);

    if (results.chunks.length === 0) {
      console.log(`❌ No results found for "${query}"`);
      return;
    }

    console.log(`✅ Found ${results.chunks.length} results in ${elapsed}s (${results.tokenCount} tokens)\n`);

    const displayResults = results.chunks.slice(0, limit);
    for (let i = 0; i < displayResults.length; i++) {
      const chunk = displayResults[i];
      const score = chunk.metadata?.score || 0;
      const scoreStr = (score * 100).toFixed(1);

      console.log(`${i + 1}. [${scoreStr}%] ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`);
      console.log(`   Type: ${chunk.type} | Symbols: ${chunk.symbols.join(', ') || 'none'}`);

      if (options.showContent) {
        const preview = chunk.content.slice(0, 200).replace(/\n/g, ' ').trim();
        console.log(`   ${preview}${chunk.content.length > 200 ? '...' : ''}`);
      }
      console.log();
    }

    if (results.chunks.length > limit) {
      console.log(`... and ${results.chunks.length - limit} more results\n`);
    }
  });

// ============================================================================
// GRAPH COMMAND
// ============================================================================

program
  .command('graph')
  .description('Export the knowledge graph')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-f, --format <format>', 'Output format: json, dot, mermaid', 'json')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('--filter <type>', 'Filter by node type: file, class, function, etc.')
  .option('--max-nodes <number>', 'Maximum nodes to include', '500')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const maxNodes = parseInt(options.maxNodes, 10);

    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    // Build graph
    const graph = new KnowledgeGraph();
    const builder = new GraphBuilder(graph);
    builder.buildFromIndex(index);

    const stats = graph.getStats();
    console.error(`📊 Graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges\n`);

    // Get data
    let nodes = graph.getAllNodes();
    let edges = graph.getAllEdges();

    // Apply filter
    if (options.filter) {
      nodes = nodes.filter((n) => n.type === options.filter);
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    // Limit nodes
    if (nodes.length > maxNodes) {
      console.error(`⚠️  Limiting to ${maxNodes} nodes (from ${nodes.length})`);
      nodes = nodes.slice(0, maxNodes);
      const nodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    // Format output
    let output: string;
    if (options.format === 'dot') {
      output = graphToDot(nodes, edges);
    } else if (options.format === 'mermaid') {
      output = graphToMermaid(nodes, edges);
    } else {
      output = JSON.stringify({ nodes, edges }, null, 2);
    }

    // Write output
    if (options.output) {
      fs.writeFileSync(options.output, output);
      console.error(`✅ Exported to ${options.output}`);
    } else {
      console.log(output);
    }
  });

// Graph format helpers
function graphToDot(
  nodes: Array<{ id: string; type: string; name: string }>,
  edges: Array<{ source: string; target: string; type: string }>
): string {
  const lines: string[] = ['digraph KnowledgeGraph {', '  rankdir=LR;', '  node [shape=box];', ''];

  // Node styles by type
  const styles: Record<string, string> = {
    file: 'shape=folder,style=filled,fillcolor=lightyellow',
    class: 'shape=box,style=filled,fillcolor=lightblue',
    interface: 'shape=box,style=filled,fillcolor=lightgreen',
    function: 'shape=ellipse,style=filled,fillcolor=lightsalmon',
    method: 'shape=ellipse,style=filled,fillcolor=peachpuff',
  };

  for (const node of nodes) {
    const style = styles[node.type] || 'shape=box';
    const label = node.name.replace(/"/g, '\\"');
    lines.push(`  "${node.id}" [label="${label}" ${style}];`);
  }

  lines.push('');

  // Edge styles
  const edgeStyles: Record<string, string> = {
    calls: 'color=blue',
    extends: 'color=red,style=bold',
    implements: 'color=green,style=dashed',
    imports: 'color=gray',
    contains: 'color=black,style=dotted',
  };

  for (const edge of edges) {
    const style = edgeStyles[edge.type] || '';
    lines.push(`  "${edge.source}" -> "${edge.target}" [${style}];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function graphToMermaid(
  nodes: Array<{ id: string; type: string; name: string }>,
  edges: Array<{ source: string; target: string; type: string }>
): string {
  const lines: string[] = ['graph LR'];

  // Create safe IDs and track them
  const idMap = new Map<string, string>();
  let counter = 0;

  const getSafeId = (id: string): string => {
    if (!idMap.has(id)) {
      idMap.set(id, `n${counter++}`);
    }
    return idMap.get(id)!;
  };

  // Node shapes by type
  const shapes: Record<string, [string, string]> = {
    file: ['[(', ')]'],
    class: ['[[', ']]'],
    interface: ['{{', '}}'],
    function: ['([', '])'],
    method: ['([', '])'],
  };

  for (const node of nodes) {
    const [open, close] = shapes[node.type] || ['[', ']'];
    const safeId = getSafeId(node.id);
    const label = node.name.replace(/"/g, "'");
    lines.push(`  ${safeId}${open}"${label}"${close}`);
  }

  // Edge arrows
  const arrows: Record<string, string> = {
    calls: '-->',
    extends: '-.->',
    implements: '-.->',
    imports: '-->',
    contains: '-->',
  };

  for (const edge of edges) {
    const arrow = arrows[edge.type] || '-->';
    const sourceId = getSafeId(edge.source);
    const targetId = getSafeId(edge.target);
    if (idMap.has(edge.source) && idMap.has(edge.target)) {
      lines.push(`  ${sourceId} ${arrow}|${edge.type}| ${targetId}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// RELATED COMMAND
// ============================================================================

program
  .command('related <symbol>')
  .description('Find symbols related to the given symbol')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-d, --depth <number>', 'Maximum relationship depth', '2')
  .option('-t, --types <types>', 'Filter by relation types (comma-separated)')
  .action(async (symbol, options) => {
    const projectRoot = path.resolve(options.path);
    const depth = parseInt(options.depth, 10);
    const types = options.types?.split(',');

    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    const engine = new ContextEngine({ projectRoot, index });
    const related = engine.findRelated(symbol, { depth, types });

    if (related.length === 0) {
      console.log(`\n❌ No relations found for "${symbol}"`);
      console.log('   Make sure the symbol exists in your indexed codebase.');
      return;
    }

    console.log(`\n🔗 ${related.length} symbols related to "${symbol}":\n`);

    // Group by relation type
    const byRelation: Record<string, typeof related> = {};
    for (const rel of related) {
      const key = rel.relation;
      if (!byRelation[key]) byRelation[key] = [];
      byRelation[key].push(rel);
    }

    for (const [relation, items] of Object.entries(byRelation)) {
      console.log(`  ${relation}:`);
      for (const item of items) {
        const loc = item.file ? `  (${item.file}${item.line ? ':' + item.line : ''})` : '';
        console.log(`    • ${item.name} [${item.type}]${loc}`);
      }
      console.log();
    }
  });

// ============================================================================
// CALLERS COMMAND
// ============================================================================

program
  .command('callers <function>')
  .description('Find all callers of a function or method')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (functionName, options) => {
    const projectRoot = path.resolve(options.path);

    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    const engine = new ContextEngine({ projectRoot, index });
    const callers = engine.findCallers(functionName);

    if (callers.length === 0) {
      console.log(`\n❌ No callers found for "${functionName}"`);
      console.log('   The function may not be called, or may not be in the index.');
      return;
    }

    console.log(`\n📞 ${callers.length} callers of "${functionName}":\n`);

    for (const caller of callers) {
      const loc = caller.file ? `${caller.file}${caller.line ? ':' + caller.line : ''}` : '';
      console.log(`  • ${caller.name} [${caller.type}]`);
      if (loc) console.log(`    ${loc}`);
    }
    console.log();
  });

// ============================================================================
// INHERITANCE COMMAND
// ============================================================================

program
  .command('inheritance <class>')
  .description('Show class inheritance hierarchy')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (className, options) => {
    const projectRoot = path.resolve(options.path);

    const indexer = new Indexer({ projectRoot });
    const index = indexer.loadIndex();

    if (!index) {
      console.log('❌ No index found. Run `uce index` first.');
      process.exit(1);
    }

    const engine = new ContextEngine({ projectRoot, index });
    const hierarchy = engine.getInheritance(className);

    console.log(`\n🌳 Inheritance for "${className}":\n`);

    if (hierarchy.parents.length > 0) {
      console.log('  Parents (extends/implements):');
      for (const parent of hierarchy.parents) {
        console.log(`    ↑ ${parent}`);
      }
    } else {
      console.log('  No parents found.');
    }

    console.log();

    if (hierarchy.children.length > 0) {
      console.log('  Children (extended by):');
      for (const child of hierarchy.children) {
        console.log(`    ↓ ${child}`);
      }
    } else {
      console.log('  No children found.');
    }

    console.log();
  });

// ============================================================================
// SERVE COMMAND (MCP Server)
// ============================================================================

program
  .command('serve')
  .description('Start the UCE MCP server for Claude Code integration')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-w, --watch', 'Enable file watching')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const config = await loadConfig(projectRoot);

    console.error(`🚀 Starting UCE MCP Server for ${projectRoot}...`);

    // Dynamically import the server to avoid circular deps
    const { UCEServer } = await import('./mcp/server.js');

    const indexer = new Indexer({ projectRoot });
    let index = indexer.loadIndex();

    if (!index) {
      console.error('📇 No existing index, creating...');
      index = await indexer.index();
      await indexer.saveIndex(index);
    }

    const engine = new ContextEngine({
      projectRoot,
      index,
      enableEmbeddings: config.enableEmbeddings,
    });
    const server = new UCEServer(projectRoot, engine);

    if (options.watch || config.mcp?.watchMode) {
      server.startWatch();
      console.error('👀 File watching enabled');
    }

    console.error('✅ MCP Server ready. Waiting for connections...\n');

    // Run the server (stdio transport)
    await server.run();
  });

// ============================================================================
// CONFIG COMMAND
// ============================================================================

program
  .command('config')
  .description('Generate or show UCE configuration')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-i, --init', 'Generate a new config file')
  .option('-f, --format <format>', 'Config format: json or js', 'json')
  .option('-s, --show', 'Show current effective config')
  .option('-v, --validate', 'Validate existing config')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);

    if (options.init) {
      // Generate new config file
      const format = options.format as 'json' | 'js';
      const filename = format === 'json' ? '.ucerc.json' : 'uce.config.js';
      const configPath = path.join(projectRoot, filename);

      if (fs.existsSync(configPath)) {
        console.log(`❌ Config file already exists: ${filename}`);
        console.log('   Delete it first if you want to regenerate.');
        process.exit(1);
      }

      const content = generateDefaultConfig(format);
      fs.writeFileSync(configPath, content);
      console.log(`✅ Created ${filename}`);
      console.log('\nEdit this file to customize UCE behavior.');
      return;
    }

    if (options.validate) {
      // Validate existing config
      const config = await loadConfig(projectRoot);
      const { valid, errors } = validateConfig(config);

      if (valid) {
        console.log('✅ Configuration is valid');
      } else {
        console.log('❌ Configuration errors:');
        for (const error of errors) {
          console.log(`   - ${error}`);
        }
        process.exit(1);
      }
      return;
    }

    // Show current config (default action)
    const config = await loadConfig(projectRoot);
    console.log('📋 Current UCE Configuration:\n');
    console.log(JSON.stringify(config, null, 2));
  });

// ============================================================================
// HELLO COMMAND (Guided Onboarding)
// ============================================================================

program
  .command('hello')
  .description('Guided onboarding for new users')
  .option('-y, --yes', 'Auto-accept all prompts')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const readline = await import('readline');

    const ask = (question: string): Promise<string> => {
      if (options.yes) return Promise.resolve('y');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      return new Promise((resolve) => {
        rl.question(question, (answer) => {
          rl.close();
          resolve(answer.trim().toLowerCase());
        });
      });
    };

    console.log('\n👋 Welcome to Universal Context Engine (UCE)!\n');
    console.log('Your codebase in context. Let\'s get you set up.\n');

    // System requirements check
    console.log('Checking environment:');
    const nodeVersion = process.version;
    const [major] = nodeVersion.slice(1).split('.').map(Number);
    if (major >= 18) {
      console.log(`  ✓ Node.js ${nodeVersion} (>=18.0.0 required)`);
    } else {
      console.log(`  ✗ Node.js ${nodeVersion} - Please upgrade to v18+`);
      process.exit(1);
    }

    // Check for npm
    try {
      const { execSync } = await import('child_process');
      const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
      console.log(`  ✓ npm v${npmVersion}`);
    } catch {
      console.log('  ✗ npm not found');
    }

    console.log();

    // Detect project
    console.log('Detecting project:');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      console.log('  ✓ Found package.json');
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.name) console.log(`  ✓ Project: ${pkg.name}`);
      } catch {
        // ignore parse errors
      }
    } else {
      console.log('  ○ No package.json (not a Node.js project)');
    }

    // Count files
    const { glob } = await import('glob');
    const sourceFiles = await glob('**/*.{ts,js,tsx,jsx,py,go,rs,java,rb,php}', {
      cwd: projectRoot,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    });

    // Detect languages
    const extensions = new Set(sourceFiles.map((f) => path.extname(f)));
    const langMap: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
      '.java': 'Java', '.rb': 'Ruby', '.php': 'PHP',
    };
    const detectedLangs = [...new Set([...extensions].map((e) => langMap[e]).filter(Boolean))];

    if (detectedLangs.length > 0) {
      console.log(`  ✓ Detected languages: ${detectedLangs.join(', ')}`);
    }
    console.log(`  ✓ Found ${sourceFiles.length} source files to index`);

    console.log();

    // Prompt to index
    const proceed = await ask('Ready to index your codebase? [Y/n] ');
    if (proceed && proceed !== 'y' && proceed !== '') {
      console.log('\nNo problem! Run `uce hello` when you\'re ready.\n');
      return;
    }

    console.log('\nIndexing...');

    const startTime = Date.now();
    const indexer = new Indexer({ projectRoot });
    const index = await indexer.index();
    await indexer.saveIndex(index);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`  ✓ Indexed ${index.totalFiles} files (${index.totalSymbols} symbols) in ${elapsed}s`);

    // Show language breakdown
    const langEntries = Object.entries(index.languageStats);
    if (langEntries.length > 0) {
      console.log(`  ✓ Languages: ${langEntries.map(([l, s]) => `${l} (${s.files})`).join(', ')}`);
    }

    console.log('\n✅ Done! Your codebase is indexed.\n');

    console.log('Try these commands:');
    console.log('  uce query "authentication logic"   # Search your code');
    console.log('  uce status                         # View index status');
    console.log('  uce watch                          # Auto-update on changes');
    console.log('  uce serve                          # Start MCP server for AI tools');

    console.log('\n📚 Learn more: https://github.com/Eskapeum/Context-Engine\n');
  });

// ============================================================================
// VERSION INFO
// ============================================================================

program
  .command('info')
  .description('Show UCE version and system information')
  .action(async () => {
    console.log(`\n📦 Universal Context Engine (UCE) v${VERSION}\n`);
    console.log('System Information:');
    console.log(`  Node.js: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  Architecture: ${process.arch}`);
    console.log(`  Working Directory: ${process.cwd()}`);
    console.log('\nFeatures:');
    console.log('  ✓ Tree-sitter AST parsing (21 languages)');
    console.log('  ✓ Incremental indexing');
    console.log('  ✓ BM25 keyword search');
    console.log('  ✓ Knowledge graph analysis');
    console.log('  ✓ Semantic chunking');
    console.log('  ✓ MCP server for Claude Code');
    console.log('  ✓ Context file generation (CLAUDE.md, .cursorrules, etc.)');
    console.log('\nDocumentation: https://github.com/Eskapeum/Context-Engine');
  });

program.parse();

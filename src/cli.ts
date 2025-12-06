#!/usr/bin/env node
/**
 * Universal Context Memory - CLI
 *
 * Command-line interface for UCM.
 * Provides commands for indexing, watching, querying, and managing context files.
 *
 * @module cli
 */

import { Command } from 'commander';
import { Indexer } from './indexer.js';
import { ContextGenerator } from './generator.js';
import { watch } from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';

const VERSION = '1.0.0';

const program = new Command();

program
  .name('ucm')
  .description('Universal Context Memory - Auto-indexing memory for AI coding assistants')
  .version(VERSION);

// ============================================================================
// INIT COMMAND
// ============================================================================

program
  .command('init')
  .description('Initialize UCM in the current project')
  .option('-s, --silent', 'Suppress output')
  .action(async (options) => {
    const projectRoot = process.cwd();

    if (!options.silent) {
      console.log('🚀 Initializing Universal Context Memory...\n');
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

    // Generate context files
    const generator = new ContextGenerator({ projectRoot, index });
    generator.generateAll();

    if (!options.silent) {
      console.log('✅ Generated context files:');
      console.log('   - CONTEXT.md (generic LLM context)');
      console.log('   - CLAUDE.md (Claude Code specific)');
      console.log('   - .cursorrules (Cursor IDE)');
      console.log('   - .github/copilot-instructions.md (GitHub Copilot)');
      console.log('\n📁 Index stored in .context/');
      console.log('\n💡 Tip: Commit these files to share context with your team!');
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
      console.log('\n✅ Regenerated context files');
    }
  });

// ============================================================================
// WATCH COMMAND
// ============================================================================

program
  .command('watch')
  .description('Watch for file changes and auto-update context files')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);

    console.log(`👀 Watching ${projectRoot} for changes...\n`);

    // Initial index
    const indexer = new Indexer({ projectRoot });
    let index = await indexer.index();
    await indexer.saveIndex(index);
    const generator = new ContextGenerator({ projectRoot, index });
    generator.generateAll();

    console.log(`✅ Initial index: ${index.totalFiles} files, ${index.totalSymbols} symbols\n`);

    // Watch for changes
    const watcher = watch(projectRoot, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.context/**',
        '**/CONTEXT.md',
        '**/CLAUDE.md',
        '**/.cursorrules',
        '**/.github/copilot-instructions.md',
      ],
      persistent: true,
      ignoreInitial: true,
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const reindex = async () => {
      console.log('🔄 Reindexing...');
      const startTime = Date.now();

      index = await indexer.index();
      await indexer.saveIndex(index);

      const newGenerator = new ContextGenerator({ projectRoot, index });
      newGenerator.generateAll();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Updated in ${elapsed}s (${index.totalFiles} files)\n`);
    };

    const debouncedReindex = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(reindex, 1000);
    };

    watcher.on('add', debouncedReindex);
    watcher.on('change', debouncedReindex);
    watcher.on('unlink', debouncedReindex);

    console.log('Press Ctrl+C to stop watching.\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping watch mode...');
      watcher.close();
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
      console.log('❌ No index found. Run `ucm index` first.');
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
    console.log(`📦 UCM version: ${index.ucmVersion}`);
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
      console.log('❌ No index found. Run `ucm index` first.');
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
      console.log('❌ No index found. Run `ucm index` first.');
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
      '.context',
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
      console.log('❌ No previous index found. Run `ucm index` first.');
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

program.parse();

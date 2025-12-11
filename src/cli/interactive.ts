/**
 * Universal Context Engine - Interactive CLI Mode
 * @module cli/interactive
 *
 * REPL-style interactive interface for codebase exploration.
 */

import * as readline from 'readline';
import { ContextEngine } from '../context-engine.js';
import type { QAResult } from '../qa/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Interactive CLI configuration
 */
export interface InteractiveCLIConfig {
  /** Project root */
  projectRoot: string;
  /** Enable embeddings */
  enableEmbeddings?: boolean;
  /** Enable AI Q&A */
  enableQA?: boolean;
  /** QA provider */
  qaProvider?: 'anthropic' | 'openai';
  /** Show detailed output */
  verbose?: boolean;
}

/**
 * Command handler
 */
type CommandHandler = (args: string[]) => Promise<void>;

// =============================================================================
// Interactive CLI
// =============================================================================

/**
 * Interactive REPL-style CLI for UCE
 *
 * Usage:
 * ```typescript
 * const cli = new InteractiveCLI({ projectRoot: '/path/to/project' });
 * await cli.start();
 * ```
 */
export class InteractiveCLI {
  private config: Required<InteractiveCLIConfig>;
  private engine: ContextEngine;
  private rl: readline.Interface;
  private commands: Map<string, CommandHandler>;
  private running: boolean = false;

  constructor(config: InteractiveCLIConfig) {
    this.config = {
      projectRoot: config.projectRoot,
      enableEmbeddings: config.enableEmbeddings ?? false,
      enableQA: config.enableQA ?? true,
      qaProvider: config.qaProvider || 'anthropic',
      verbose: config.verbose ?? false,
    };

    this.engine = new ContextEngine({
      projectRoot: this.config.projectRoot,
      enableEmbeddings: this.config.enableEmbeddings,
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'uce> ',
    });

    this.commands = new Map();
    this.registerCommands();
  }

  /**
   * Start interactive mode
   */
  async start(): Promise<void> {
    this.printWelcome();

    // Initialize engine
    console.log('Initializing...');
    await this.engine.initialize();
    console.log('Ready! Type "help" for commands.\n');

    this.running = true;

    this.rl.on('line', async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      await this.handleInput(trimmed);

      if (this.running) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      process.exit(0);
    });

    this.rl.prompt();
  }

  /**
   * Stop interactive mode
   */
  stop(): void {
    this.running = false;
    this.rl.close();
  }

  // =============================================================================
  // Private Methods - Input Handling
  // =============================================================================

  private async handleInput(input: string): Promise<void> {
    try {
      // Check if it's a command (starts with /)
      if (input.startsWith('/')) {
        await this.handleCommand(input);
      } else {
        // Treat as question if Q&A is enabled
        if (this.config.enableQA) {
          await this.handleQuestion(input);
        } else {
          await this.handleSearch(input);
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(command);
    if (handler) {
      await handler(args);
    } else {
      console.log(`Unknown command: ${command}. Type "help" for available commands.`);
    }
  }

  private async handleQuestion(question: string): Promise<void> {
    console.log('\nThinking...\n');

    try {
      const result: QAResult = await this.engine.ask(question, {
        provider: this.config.qaProvider,
        maxContextTokens: 4000,
        maxResponseTokens: 2000,
      });

      console.log(result.answer);
      console.log(`\n[Confidence: ${result.confidence}, Sources: ${result.sources.length}, Tokens: ${result.usage.totalTokens}]\n`);

      if (this.config.verbose && result.sources.length > 0) {
        console.log('\nSources:');
        for (const source of result.sources) {
          console.log(`  - ${source.file}:${source.startLine}-${source.endLine} (score: ${source.relevanceScore.toFixed(2)})`);
        }
        console.log();
      }
    } catch (error) {
      console.error('Failed to answer question:', error instanceof Error ? error.message : error);
    }
  }

  private async handleSearch(query: string): Promise<void> {
    console.log(`\nSearching for: ${query}\n`);

    const context = await this.engine.retrieve(query, { maxTokens: 2000 });

    if (context.chunks.length === 0) {
      console.log('No results found.\n');
      return;
    }

    console.log(`Found ${context.chunks.length} results:\n`);
    for (const chunk of context.chunks.slice(0, 5)) {
      console.log(`${chunk.file}:${chunk.startLine}-${chunk.endLine}`);
      console.log(`  ${chunk.content.substring(0, 100)}...`);
      console.log();
    }
  }

  // =============================================================================
  // Private Methods - Commands
  // =============================================================================

  private registerCommands(): void {
    this.commands.set('help', this.cmdHelp.bind(this));
    this.commands.set('search', this.cmdSearch.bind(this));
    this.commands.set('ask', this.cmdAsk.bind(this));
    this.commands.set('stats', this.cmdStats.bind(this));
    this.commands.set('clear', this.cmdClear.bind(this));
    this.commands.set('verbose', this.cmdVerbose.bind(this));
    this.commands.set('quit', this.cmdQuit.bind(this));
    this.commands.set('exit', this.cmdQuit.bind(this));
  }

  private async cmdHelp(_args: string[]): Promise<void> {
    console.log(`
UCE Interactive Mode - Commands:

  /help              Show this help message
  /search <query>    Search for code matching query
  /ask <question>    Ask a question about the codebase
  /stats             Show index statistics
  /clear             Clear screen
  /verbose           Toggle verbose output
  /quit, /exit       Exit interactive mode

  Or just type a question or search term without any command.
`);
  }

  private async cmdSearch(args: string[]): Promise<void> {
    const query = args.join(' ');
    if (!query) {
      console.log('Usage: /search <query>');
      return;
    }
    await this.handleSearch(query);
  }

  private async cmdAsk(args: string[]): Promise<void> {
    const question = args.join(' ');
    if (!question) {
      console.log('Usage: /ask <question>');
      return;
    }
    await this.handleQuestion(question);
  }

  private async cmdStats(_args: string[]): Promise<void> {
    const stats = await this.engine.getStats();
    if (!stats) {
      console.log('No statistics available');
      return;
    }
    console.log(`
Index Statistics:
  Files indexed: ${stats.files}
  Symbols: ${stats.symbols}
  Chunks: ${stats.chunks}
  Embedded chunks: ${stats.embeddedChunks}
`);
  }

  private async cmdClear(_args: string[]): Promise<void> {
    console.clear();
    this.printWelcome();
  }

  private async cmdVerbose(_args: string[]): Promise<void> {
    this.config.verbose = !this.config.verbose;
    console.log(`Verbose mode: ${this.config.verbose ? 'ON' : 'OFF'}`);
  }

  private async cmdQuit(_args: string[]): Promise<void> {
    this.stop();
  }

  // =============================================================================
  // Private Methods - UI
  // =============================================================================

  private printWelcome(): void {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     Universal Context Engine - Interactive Mode v3.5      ║
╚═══════════════════════════════════════════════════════════╝

Type a question or search term, or use /help for commands.
`);
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create and start interactive CLI
 */
export async function startInteractiveCLI(config: InteractiveCLIConfig): Promise<void> {
  const cli = new InteractiveCLI(config);
  await cli.start();
}

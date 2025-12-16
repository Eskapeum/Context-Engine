# Changelog

All notable changes to Universal Context Memory (UCE) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

### Changed
- Nothing yet

### Fixed
- Nothing yet

## [4.0.0] - 2025-12-16

### Added
- **Library Documentation System** (`src/library-docs/`)
  - Local-first extraction from node_modules `.d.ts` files
  - Automatic caching in `.uce/library-docs/`
  - MCP tool: `uce_get_library_docs`

- **Sequential Thinking Engine** (`src/thinking/`)
  - Multi-step reasoning with revision and branching support
  - Thought graph tracking for lineage visualization
  - Confidence scoring per thought
  - MCP tool: `uce_sequential_think`

- **Persistent Memory** (`src/memory/`)
  - Q&A session history with file/symbol tracking
  - Extractive summarization (local-first, no LLM required)
  - Session statistics and cleanup
  - MCP tools: `uce_search_history`, `uce_get_file_discussion`, `uce_get_session_summary`, `uce_memory_stats`

- **Context Sharing** (`src/sharing/`)
  - Export/import portable context bundles for team collaboration
  - Privacy controls (anonymize symbols, exclude patterns)
  - Bundle comparison and diff
  - CLI commands: `uce share`, `uce share-import`, `uce share-info`
  - MCP tools: `uce_export_context`, `uce_import_context`, `uce_bundle_info`

- **cAST Chunking Algorithm** - AST-aware semantic chunking
  - Non-whitespace character sizing for accurate token estimation
  - Recursive node breaking at semantic boundaries
  - Greedy sibling merging for optimal chunks
  - +4.3 Recall@5 improvement over line-based chunking

- **Knowledge Graph Enhancements**
  - Query cache with LRU eviction (`src/graph/query-cache.ts`)
  - Cycle detection using Tarjan's SCC algorithm (`src/graph/cycle-detector.ts`)
  - Symbol-level dependency tracking (`src/graph/symbol-tracker.ts`)

### Changed
- Updated version to 4.0.0
- Updated README with v4.0 features and architecture diagram
- Updated INSTALLATION.md with new CLI commands
- MCP Server now exposes 18 tools (up from 9)

### Technical Details
- 5 new source modules (library-docs, thinking, memory, sharing, graph enhancements)
- 30 new files, 8574 lines of code added
- All 85 tests passing
- 100% local-first: no cloud services required

## [3.6.2] - 2025-12-14

### Fixed
- **Critical: Infinite loop in generateChunks** - Fixed lookback loop that could hang indefinitely
  - Added maximum iterations guard (10 iterations)
  - Loop now properly terminates when no better merge found

## [3.6.1] - 2025-12-13

### Fixed
- **Critical: MCP Server stdio transport** - Added missing `run()` method for Claude Code integration
  - Added `run()` method for stdio transport (stdin/stdout JSON-RPC)
  - Added `startWatch()` convenience method for file watching
  - Added `UCEServer` export alias for backward compatibility
- **CLI serve command** - Fixed constructor call to use personality config instead of engine
  - Removed redundant indexer/engine creation (server handles its own indexing)
  - Server now initializes lazily for faster Claude Code connection startup

### Technical Details
- `src/mcp/server.ts`: Added `run()`, `startWatch()`, and `UCEServer` export
- `src/cli.ts`: Simplified serve command to use `UCEServer(projectRoot, config.personality)`
- All 85 tests passing

## [3.6.0] - 2025-12-11

### Added
- **Auto-Context Personality System** - UCE now automatically guides LLMs to use context tools
  - "Childhood Friend" persona that knows your codebase intimately
  - Auto-context rules embedded directly in MCP server (no external config files needed)
  - Strong tool guidance: LLMs automatically use `uce_search` and `uce_get_context` before answering
- **MCP Server `instructions` Field** - Server info now includes personality instructions
  - Claude Code and other MCP clients receive auto-context rules on connection
  - Works without CLAUDE.md or .cursorrules files
- **Personality Resource** - New `uce://*/personality` resource with full instructions
  - LLMs can read detailed auto-context rules and tool usage guidelines
  - Marked as "IMPORTANT: Read this first" for visibility
- **Tool Description Wrapping** - Each tool description now includes auto-use guidance
  - `uce_search`: "ALWAYS use BEFORE answering ANY question about this codebase"
  - `uce_get_context`: "ALWAYS use BEFORE implementing features or making code changes"
  - And more per-tool instructions
- **Personality Configuration** - New `personality` section in `.ucerc.json`
  - Enabled by default (no action required for new installations)
  - Configurable: `{ "personality": { "enabled": true, "name": "..." } }`

### Technical Details
- New module: `src/mcp/personality.ts` - Personality definitions and helpers
- Extended `src/config.ts` with personality configuration
- Modified `src/mcp/server.ts`:
  - Added `instructions` field to serverInfo in initialize response
  - Tool descriptions wrapped with auto-use guidance
  - New personality resource endpoint
- All 85 tests passing

## [3.5.2] - 2025-12-11

### Changed
- Updated author email to tobi@lyceumaiacademy.com
- Updated documentation version references

## [3.5.1] - 2025-12-11

### Fixed
- **Critical: Daemon/Watch Command Crash** - Fixed crash bug preventing `uce watch` and `uce daemon` from working
  - Fixed FileWatcher constructor call: was passing `projectRoot` (string) instead of `IncrementalIndexer` instance
  - Fixed config key: changed `ignored:` to `ignore:` to match WatcherConfig interface
  - Fixed event listener: changed from non-existent `'change'` event to correct `'indexed'` event
  - Added `'error'` event listener for proper error handling
  - Background daemon now works correctly, watching files and auto-updating UCE.md on save

### Technical Details
- Added `IncrementalIndexer` import to CLI
- FileWatcher now receives properly initialized indexer with `initialIndex: false` to avoid double-indexing
- Event handlers now properly process `indexed` events with `changedFiles` and `affectedFiles` counts
- All 85 tests passing

## [3.5.0] - 2025-12-10

### Added
- **Parallel Indexing**: Multi-threaded indexing using worker threads for massive performance gains
  - `ParallelIndexer` class for concurrent file processing
  - Configurable worker pool size (defaults to CPU cores - 1)
  - Progress callbacks for real-time indexing status
  - Automatic batch splitting for optimal throughput
- **Interactive CLI Mode**: REPL-style interface for codebase exploration
  - `InteractiveCLI` class for interactive sessions
  - Commands: `/search`, `/ask`, `/stats`, `/clear`, `/verbose`, `/quit`
  - Natural language Q&A when enableQA is active
  - Intelligent command and search handling
- **Embedding Cache**: Persistent caching for embedding generation
  - SHA-256 content hashing for cache invalidation
  - LRU eviction policy with configurable max entries
  - Memory and file-based caching options
  - Cache statistics (hits, misses, hit rate)
- **Batch Embedding Processor**: Efficient batch embedding with rate limiting
  - Configurable batch sizes and concurrency control
  - Automatic rate limiting to avoid API throttling
  - Integration with embedding cache for performance
  - Detailed batch processing statistics

### Changed
- Updated version from 3.0.0 to 3.5.0
- Enhanced documentation with v3.5 features

### Technical Details
- New modules:
  - `src/core/parallel-indexer.ts` - Worker thread-based parallel indexing
  - `src/cli/interactive.ts` - Interactive REPL interface
  - `src/embeddings/embedding-cache.ts` - Persistent embedding cache
  - `src/embeddings/batch-processor.ts` - Batch embedding processor
- All tests passing (85 tests)

## [3.0.0] - 2025-12-10

### Added
- **Code Analytics & Intelligence**: Comprehensive code quality analysis
  - `ComplexityAnalyzer` - Cyclomatic and cognitive complexity metrics
  - `CodeSmellsDetector` - Pattern-based detection of maintainability issues
  - `PatternDetector` - Architectural and design pattern recognition
- **MCP Analytics Tools**: Three new Model Context Protocol tools
  - `uce_analyze_complexity` - Analyze code complexity metrics
  - `uce_detect_smells` - Detect code quality issues with severity levels
  - `uce_detect_patterns` - Identify architectural and design patterns
- **Enhanced Parser Types**: New types for analytics
  - `ParsedFile` - Complete file structure with functions and classes
  - `ParsedFunction` - Function metadata with parameters and return types
  - `ParsedClass` - Class structure with methods and properties
- **Analytics Configuration**: Configurable thresholds for all analyzers
  - Long method detection (default: 50 lines)
  - Long parameter list (default: 5 parameters)
  - God class detection (default: 20 methods)
  - Deep nesting (default: 4 levels)
  - Complexity thresholds (low: 5, medium: 10, high: 20)

### Changed
- Updated version from 2.4.1 to 3.0.0
- Enhanced MCP server with analytics integration
- Updated documentation with v3.0 highlights

### Technical Details
- New modules:
  - `src/analytics/complexity-analyzer.ts` - 340 lines
  - `src/analytics/code-smells.ts` - 408 lines
  - `src/analytics/pattern-detection.ts` - 694 lines
- All tests passing (85 tests)

## [1.0.0] - 2024-12-06

### Added
- Initial release of Universal Context Memory
- **Indexer**: Multi-language codebase indexing
  - Support for 10+ languages: TypeScript, JavaScript, Python, Rust, Go, Java, C#, Ruby, PHP, Swift, Kotlin, Scala, C/C++
  - Extracts functions, classes, interfaces, types, constants
  - Tracks import/export relationships
  - Builds dependency graph
- **Context Generator**: Tool-specific context file generation
  - `CONTEXT.md` - Generic LLM context
  - `CLAUDE.md` - Claude Code specific
  - `.cursorrules` - Cursor IDE rules
  - `.github/copilot-instructions.md` - GitHub Copilot
- **CLI Commands**:
  - `uce init` - Initialize UCE in a project
  - `uce index` - Re-index codebase
  - `uce watch` - Auto-update on file changes
  - `uce stats` - Show index statistics
  - `uce query <term>` - Search the index
  - `uce export` - Export index as JSON
  - `uce clean` - Remove generated files
  - `uce diff` - Show changes since last index
- **Programmatic API**:
  - `Indexer` class for custom indexing
  - `ContextGenerator` class for custom generation
  - `indexProject()` quick function
  - `loadIndex()` utility function
- **Configuration**:
  - `.contextignore` for excluding files
  - Respects `.gitignore` patterns
  - Configurable max file size
- **Documentation**:
  - Comprehensive README with examples
  - CONTRIBUTING guide
  - API documentation

### Technical Details
- Built with TypeScript
- ESM and CJS dual exports
- Zero runtime dependencies except:
  - `chokidar` for file watching
  - `commander` for CLI
  - `glob` for file patterns
  - `ignore` for ignore patterns

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 3.5.0 | 2025-12-10 | Parallel indexing, interactive CLI, embedding cache, batch processor |
| 3.0.0 | 2025-12-10 | Code analytics, complexity analysis, code smells detection, pattern recognition |
| 1.0.0 | 2024-12-06 | Initial release |

## Migration Guides

### Upgrading from 0.x to 1.0

This is the initial release, so no migration is needed.

---

[Unreleased]: https://github.com/Eskapeum/Context-Engine/compare/v3.5.0...HEAD
[3.5.0]: https://github.com/Eskapeum/Context-Engine/releases/tag/v3.5.0
[3.0.0]: https://github.com/Eskapeum/Context-Engine/releases/tag/v3.0.0
[1.0.0]: https://github.com/Eskapeum/Context-Engine/releases/tag/v1.0.0

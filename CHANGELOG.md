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

# Changelog

All notable changes to Universal Context Memory (UCM) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

### Changed
- Nothing yet

### Fixed
- Nothing yet

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
  - `ucm init` - Initialize UCM in a project
  - `ucm index` - Re-index codebase
  - `ucm watch` - Auto-update on file changes
  - `ucm stats` - Show index statistics
  - `ucm query <term>` - Search the index
  - `ucm export` - Export index as JSON
  - `ucm clean` - Remove generated files
  - `ucm diff` - Show changes since last index
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
| 1.0.0 | 2024-12-06 | Initial release |

## Migration Guides

### Upgrading from 0.x to 1.0

This is the initial release, so no migration is needed.

---

[Unreleased]: https://github.com/LyceumAI/universal-context-memory/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/LyceumAI/universal-context-memory/releases/tag/v1.0.0

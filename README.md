<p align="center">
  <img src="assets/uce-logo.svg" width="200" alt="Universal Context Engine Logo">
</p>

<h1 align="center">Universal Context Engine (UCE) v2.6</h1>

<p align="center">
  <strong>The most intelligent context engine for AI coding assistants</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/universal-context-engine"><img src="https://img.shields.io/npm/v/universal-context-engine.svg?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/Eskapeum/Context-Engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/Eskapeum/Context-Engine/actions"><img src="https://img.shields.io/github/actions/workflow/status/Eskapeum/Context-Engine/ci.yml?style=flat-square" alt="CI Status"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#api">API</a> •
  <a href="#mcp-server">MCP Server</a>
</p>

---

## What is UCE?

Universal Context Engine indexes your codebase and provides intelligent context retrieval for AI coding assistants. Unlike cloud-based solutions, UCE runs **100% locally** and stores everything in your project.

```bash
# Install and index your project
npm install universal-context-engine
npx universal-context-engine init

# That's it! Your codebase context is now in UCE.md
```

> **Note:** Use `npx universal-context-engine` (not `npx uce`) because there's an unrelated npm package named `uce`. After installing globally with `npm install -g universal-context-engine`, you can use `uce` directly.

## v2.6 Highlights 🚀

**New in v2.6 - AI-Powered Features:**
- **🤖 AI-Powered Q&A** - Ask natural language questions about your codebase and get intelligent answers with context
- **🌐 Multi-Source Indexing** - Index code from filesystem, APIs, GitHub, or in-memory sources
- **🔌 Enhanced MCP Tools** - New `uce_ask` tool for conversational codebase exploration

**Previous Updates (v2.5):**
- **💾 State Persistence** - 80% faster re-indexing by skipping unchanged files
- **📊 Enhanced Stats** - Detailed tracking: new/updated/cached file counts
- **🚫 .uceignore Support** - Fine-grained exclusion control alongside .gitignore

**Core Features:**
- **🔄 Auto-Indexing** - Git pre-commit hook and background daemon for automatic UCE.md updates
- **🔌 Auto-Install Integrations** - `uce install` command for one-click AI assistant setup
- **Tree-sitter AST Parsing** - 20+ languages with accurate symbol extraction
- **Incremental Indexing** - Only re-index changed files
- **Knowledge Graph** - Navigate code relationships (callers, inheritance, dependencies)
- **Hybrid Retrieval** - BM25 + semantic search for best results
- **MCP Server** - Direct integration with Claude Code and other AI tools
- **Watch Mode** - Auto-update on file changes
- **Single Universal Context File** - One UCE.md works with any AI assistant

## Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Q&A** | Ask questions about your codebase and get intelligent answers (v2.6+) |
| **Multi-Source Indexing** | Index from filesystem, GitHub, APIs, or in-memory code (v2.6+) |
| **Tree-sitter Parsing** | Accurate AST-based symbol extraction for 20+ languages |
| **Knowledge Graph** | Track function calls, class inheritance, and dependencies |
| **Hybrid Search** | BM25 lexical + semantic vector search |
| **Incremental Index** | Fast updates - only re-parse changed files |
| **State Persistence** | 80% faster re-indexing with file hash caching (v2.5+) |
| **MCP Server** | Model Context Protocol server for AI assistants |
| **Watch Mode** | Real-time index updates on file changes |
| **Universal Output** | Single UCE.md file works with Claude, Cursor, Copilot, any LLM |
| **100% Local** | No cloud, no uploads, complete privacy |

## Supported Languages

TypeScript, JavaScript, Python, Rust, Go, Java, C#, Ruby, PHP, Swift, Kotlin, Scala, C, C++, and more.

## Installation

```bash
# npm
npm install universal-context-engine

# yarn
yarn add universal-context-engine

# pnpm
pnpm add universal-context-engine

# global install
npm install -g universal-context-engine
```

See [INSTALLATION.md](INSTALLATION.md) for detailed setup instructions.

## Quick Start

### 1. Initialize

```bash
npx uce init
```

Creates:
```
your-project/
├── .uce/
│   ├── index.json       # Codebase index
│   └── state.json.gz    # State for fast re-indexing (v2.5+)
├── .contextignore       # File exclusion patterns (auto-created)
├── .uceignore           # UCE-specific exclusions (optional, v2.5+)
└── UCE.md               # Universal context file (works with any AI)
```

**Note:** UCE respects `.gitignore`, `.contextignore`, and `.uceignore` (v2.5+) for file exclusions.

### 2. View Stats

```bash
npx uce stats
```

### 3. Search Your Code

```bash
npx uce search "authentication"
```

### 4. Enable Auto-Indexing

Choose one of these options to keep UCE.md updated automatically:

**Option A: Git Hook (Recommended)**
```bash
npx universal-context-engine hook
```
Auto-indexes before every commit. No background process needed.

**Option B: Background Daemon**
```bash
npx universal-context-engine daemon
```
Watches files and updates UCE.md on every save.

**Option C: Watch Mode (Interactive)**
```bash
npx uce watch
```
Runs in foreground with live output.

## Commands

| Command | Description |
|---------|-------------|
| `uce init` | Initialize UCE in a project |
| `uce install` | Auto-install AI assistant integrations |
| `uce hello` | Guided onboarding for new users |
| `uce index` | Re-index the codebase |
| `uce generate` | Regenerate UCE.md from existing index |
| `uce watch` | Watch for changes and auto-update |
| `uce stats` | Show index statistics |
| `uce search <query>` | Search codebase with BM25 |
| `uce query <term>` | Query symbols and files |
| `uce graph` | Export knowledge graph (JSON/DOT/Mermaid) |
| `uce related <symbol>` | Find related symbols |
| `uce callers <function>` | Find function callers |
| `uce inheritance <class>` | Show class hierarchy |
| `uce serve` | Start MCP server |
| `uce config` | Manage configuration |
| `uce info` | Show version and system info |
| `uce clean` | Remove generated files |
| `uce export` | Export index as JSON |
| `uce diff` | Show changes since last index |
| `uce hook` | Install git pre-commit hook for auto-indexing |
| `uce daemon` | Start/stop background file watcher |

### Examples

```bash
# Search for authentication code
npx uce search "login validation"

# Find all callers of a function
npx uce callers handleSubmit

# Show class inheritance tree
npx uce inheritance BaseController

# Export graph as Mermaid diagram
npx uce graph --format mermaid > architecture.md

# Start MCP server on custom port
npx uce serve --port 4000

# Guided setup for new users
npx uce hello

# Auto-install AI assistant integrations (use full package name with npx)
npx universal-context-engine install                           # All assistants
npx universal-context-engine install --assistant claude        # Claude Code only
npx universal-context-engine install --assistant cursor        # Cursor IDE only
npx universal-context-engine install --assistant claude --global  # Global Claude commands

# Auto-indexing options
npx universal-context-engine hook                 # Install git pre-commit hook
npx universal-context-engine daemon               # Start background watcher
npx universal-context-engine daemon --stop        # Stop background watcher
```

## Configuration

Create `.ucerc.json`:

```json
{
  "projectName": "my-project",
  "ignore": ["**/dist/**", "**/*.min.js"],
  "priorityFiles": ["README.md", "src/index.ts"],
  "maxTokens": 50000,
  "enableEmbeddings": false,
  "output": {
    "uceMd": true
  },
  "state": {
    "enabled": true,
    "path": ".uce/state.json.gz",
    "autoExport": true
  },
  "qa": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "maxContextTokens": 4000,
    "maxResponseTokens": 2000
  }
}
```

**New in v2.6:** The `qa` configuration enables AI-powered question answering about your codebase.

**New in v2.5:** The `state` configuration enables state persistence for 80% faster re-indexing.

Generate default config:
```bash
npx uce config --init
```

## API

### Context Engine

```typescript
import { ContextEngine } from 'universal-context-engine';

const engine = new ContextEngine({
  projectRoot: '/path/to/project',
  enableEmbeddings: false,
});

await engine.initialize();
await engine.index();

// AI-powered Q&A (v2.6+)
const qaResult = await engine.ask('How does authentication work?');
console.log(qaResult.answer);
console.log(`Confidence: ${qaResult.confidence}`);
console.log(`Sources: ${qaResult.sources.length} files`);

// Retrieve context for a query
const context = await engine.retrieve('how does auth work?');

// Search symbols
const results = engine.searchSymbols('User');

// Knowledge graph queries
const callers = engine.findCallers('handleLogin');
const hierarchy = engine.getInheritance('BaseService');
const deps = engine.getDependencies('src/auth.ts');
```

### Legacy API (v1.x compatible)

```typescript
import { Indexer, ContextGenerator, indexProject } from 'universal-context-engine';

// Quick one-liner
await indexProject('/path/to/project');

// Or manual control
const indexer = new Indexer({ projectRoot: '/path/to/project' });
const index = await indexer.index();

const generator = new ContextGenerator({ projectRoot: '/path/to/project', index });
generator.generateAll();
```

## AI Assistant Integrations

UCE works with all major AI coding assistants. See [ai-integrations/](ai-integrations/) for configuration files and commands.

| Assistant | Integration |
|-----------|-------------|
| **Claude Code** | MCP server + slash commands |
| **Cursor** | .cursorrules + UCE.md |
| **GitHub Copilot** | copilot-instructions.md |
| **Cline** | Custom commands |
| **Continue** | Context provider |
| **Others** | Universal YAML spec |

### Quick Setup

```bash
# For Cursor - copy UCE.md as rules
cp UCE.md .cursorrules

# For Copilot - copy to instructions
mkdir -p .github && cp UCE.md .github/copilot-instructions.md
```

## MCP Server

UCE includes a Model Context Protocol server for direct AI assistant integration.

### Start Server

```bash
npx uce serve --port 3333
```

### Claude Code Integration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "uce": {
      "command": "npx",
      "args": ["uce", "serve"],
      "cwd": "/path/to/project"
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `uce_ask` | **NEW v2.6** - Ask natural language questions about the codebase |
| `uce_get_context` | Get relevant context for a query |
| `uce_search` | Search symbols |
| `uce_find_related` | Find related code |
| `uce_get_callers` | Find function callers |
| `uce_get_inheritance` | Get class hierarchy |
| `uce_get_dependencies` | Get file dependencies |
| `uce_graph_stats` | Knowledge graph statistics |
| `uce_health` | Server health check |

## Auto-Indexing

UCE v2.4 introduces automatic indexing so your UCE.md stays up-to-date without manual intervention.

### Git Pre-commit Hook (Recommended)

```bash
# Install the hook
npx universal-context-engine hook

# UCE.md will auto-update before every commit
git commit -m "your changes"  # UCE runs automatically!

# Remove the hook
npx universal-context-engine hook --uninstall
```

**Benefits:**
- No background process needed
- UCE.md is always committed with your code changes
- Works with any git workflow

### Background Daemon

```bash
# Start daemon
npx universal-context-engine daemon

# Check status
npx universal-context-engine daemon --status

# Stop daemon
npx universal-context-engine daemon --stop
```

**Benefits:**
- Real-time updates on every file save
- Logs stored in `.uce/daemon.log`
- Perfect for active development sessions

### Slash Commands (Claude Code)

After installing UCE integrations, use these slash commands:
- `/uce:hook` - Install git pre-commit hook
- `/uce:daemon` - Start background daemon
- `/uce:daemon-stop` - Stop the daemon

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Universal Context Engine v2.4 Architecture                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Tree-sitter  │───▶│ Incremental  │───▶│  Knowledge   │   │
│  │   Parser     │    │   Indexer    │    │    Graph     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                 │            │
│                                                 ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Context    │◀───│    Hybrid    │◀───│    BM25      │   │
│  │   Engine     │    │  Retriever   │    │    Index     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ MCP Server   │    │  Generator   │    │ Auto-Index   │   │
│  │              │    │  (UCE.md)    │    │ Hook/Daemon  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Comparison

| Feature | UCE | Cloud Alternatives |
|---------|-----|-------------------|
| Data location | **Your project** | Their cloud |
| Privacy | **100% local** | Code uploaded |
| Works offline | **Yes** | No |
| Open source | **Yes** | Usually no |
| Cost | **Free** | Paid |
| Any LLM support | **Yes** | Vendor locked |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/Eskapeum/Context-Engine.git
cd Context-Engine
npm install
npm run build
npm test
```

## License

MIT License - see [LICENSE](LICENSE)

## Links

- [Installation Guide](INSTALLATION.md)
- [AI Integrations](ai-integrations/)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [GitHub Issues](https://github.com/Eskapeum/Context-Engine/issues)

---

<p align="center">
  <strong>Built with care for the AI-native developer community</strong>
</p>

<p align="center">
  <sub>Part of the <a href="https://lyceumaiacademy.com">Lyceum AI Academy</a> mission</sub>
</p>

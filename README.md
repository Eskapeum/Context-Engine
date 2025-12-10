<p align="center">
  <img src="assets/uce-logo.svg" width="200" alt="Universal Context Engine Logo">
</p>

<h1 align="center">Universal Context Engine (UCE) v2.2</h1>

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
npx uce init

# That's it! Your codebase context is now in UCE.md
```

## v2.2 Highlights

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
| **Tree-sitter Parsing** | Accurate AST-based symbol extraction for 20+ languages |
| **Knowledge Graph** | Track function calls, class inheritance, and dependencies |
| **Hybrid Search** | BM25 lexical + semantic vector search |
| **Incremental Index** | Fast updates - only re-parse changed files |
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
├── .uce/index.json      # Codebase index
└── UCE.md               # Universal context file (works with any AI)
```

### 2. View Stats

```bash
npx uce stats
```

### 3. Search Your Code

```bash
npx uce search "authentication"
```

### 4. Start Watch Mode

```bash
npx uce watch
```

## Commands

| Command | Description |
|---------|-------------|
| `uce init` | Initialize UCE in a project |
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
  }
}
```

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
| `retrieve` | Get relevant context for a query |
| `search` | Search symbols |
| `related` | Find related code |
| `callers` | Find function callers |
| `inheritance` | Get class hierarchy |
| `dependencies` | Get file dependencies |
| `stats` | Index statistics |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Universal Context Engine v2.2 Architecture                  │
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
│  │ MCP Server   │    │  Generator   │    │    Watch     │   │
│  │              │    │  (UCE.md)    │    │    Mode      │   │
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

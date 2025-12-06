# Installation Guide

Complete installation and setup guide for Universal Context Memory (UCM) v2.0.

## Table of Contents

- [Requirements](#requirements)
- [Installation Methods](#installation-methods)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [MCP Server Setup](#mcp-server-setup)
- [IDE Integration](#ide-integration)
- [Troubleshooting](#troubleshooting)

## Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher (or yarn/pnpm)
- **Operating System**: macOS, Linux, or Windows

## Installation Methods

### NPM (Recommended)

```bash
# Install in your project
npm install universal-context-memory

# Or install globally
npm install -g universal-context-memory
```

### Yarn

```bash
yarn add universal-context-memory
```

### PNPM

```bash
pnpm add universal-context-memory
```

### From Source

```bash
# Clone the repository
git clone https://github.com/LyceumAI/universal-context-memory.git
cd universal-context-memory

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

### 1. Initialize Your Project

```bash
cd your-project
npx ucm init
```

This creates:
- `.context/index.json` - Full codebase index
- `CONTEXT.md` - Generic LLM context
- `CLAUDE.md` - Claude Code specific
- `.cursorrules` - Cursor IDE rules
- `.github/copilot-instructions.md` - GitHub Copilot

### 2. Verify Installation

```bash
npx ucm stats
```

### 3. Start Watch Mode (Optional)

```bash
npx ucm watch
```

## Configuration

### Configuration File

Create `.ucmrc.json` in your project root:

```json
{
  "projectName": "my-awesome-project",
  "ignore": [
    "**/dist/**",
    "**/build/**",
    "**/*.min.js"
  ],
  "priorityFiles": [
    "README.md",
    "package.json",
    "src/index.ts"
  ],
  "maxTokens": 50000,
  "enableEmbeddings": false,
  "output": {
    "contextMd": true,
    "claudeMd": true,
    "cursorRules": true,
    "copilotInstructions": true
  },
  "watch": {
    "debounceMs": 500
  },
  "chunking": {
    "targetTokens": 500,
    "maxTokens": 1000
  }
}
```

### Alternative: JavaScript Config

Create `ucm.config.js`:

```javascript
/** @type {import('universal-context-memory').UCMConfig} */
export default {
  projectName: 'my-project',
  ignore: ['**/dist/**'],
  enableEmbeddings: false,
  output: {
    contextMd: true,
    claudeMd: true,
  },
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectName` | string | auto | Project name override |
| `ignore` | string[] | [] | Additional patterns to ignore |
| `priorityFiles` | string[] | [] | Files to prioritize in context |
| `maxTokens` | number | 50000 | Maximum tokens for context output |
| `enableEmbeddings` | boolean | false | Enable semantic embeddings |
| `output.contextMd` | boolean | true | Generate CONTEXT.md |
| `output.claudeMd` | boolean | true | Generate CLAUDE.md |
| `output.cursorRules` | boolean | true | Generate .cursorrules |
| `output.copilotInstructions` | boolean | true | Generate copilot-instructions.md |
| `watch.debounceMs` | number | 500 | Debounce delay for watch mode |
| `chunking.targetTokens` | number | 500 | Target tokens per chunk |
| `chunking.maxTokens` | number | 1000 | Maximum tokens per chunk |

### Generate Default Config

```bash
npx ucm config --init
```

### Validate Config

```bash
npx ucm config --validate
```

## MCP Server Setup

UCM includes a Model Context Protocol (MCP) server for direct AI assistant integration.

### Start MCP Server

```bash
npx ucm serve --port 3333
```

### Claude Code Integration

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "ucm": {
      "command": "npx",
      "args": ["ucm", "serve", "--port", "3333"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `retrieve` | Retrieve relevant context for a query |
| `search` | Search symbols in the codebase |
| `related` | Find related symbols |
| `callers` | Find function callers |
| `inheritance` | Get class inheritance hierarchy |
| `dependencies` | Get file dependencies |
| `stats` | Get index statistics |

## IDE Integration

### Claude Code

UCM automatically generates `CLAUDE.md` which Claude Code reads on startup.

### Cursor IDE

UCM generates `.cursorrules` which Cursor automatically loads.

### GitHub Copilot

UCM generates `.github/copilot-instructions.md` which Copilot uses for context.

### VS Code

Install the UCM extension (coming soon) or use the MCP server integration.

## Programmatic Usage

### Basic Indexing

```typescript
import { Indexer, ContextGenerator } from 'universal-context-memory';

const indexer = new Indexer({ projectRoot: '/path/to/project' });
const index = await indexer.index();

const generator = new ContextGenerator({ projectRoot: '/path/to/project', index });
generator.generateAll();
```

### Context Engine (v2.0)

```typescript
import { ContextEngine } from 'universal-context-memory';

const engine = new ContextEngine({
  projectRoot: '/path/to/project',
  enableEmbeddings: false,
  autoIndex: true,
});

await engine.initialize();
await engine.index();

// Retrieve context for a query
const context = await engine.retrieve('authentication flow');
console.log(context.content);

// Search symbols
const results = engine.searchSymbols('login');

// Find related code
const related = engine.findRelated('AuthService');
```

### Knowledge Graph

```typescript
import { ContextEngine } from 'universal-context-memory';

const engine = new ContextEngine({ projectRoot: '/path/to/project' });
await engine.initialize();
await engine.index();

const graph = engine.getGraph();

// Find callers of a function
const callers = engine.findCallers('handleLogin');

// Get class inheritance
const hierarchy = engine.getInheritance('BaseController');

// Get file dependencies
const deps = engine.getDependencies('src/auth/index.ts');
```

## Troubleshooting

### Common Issues

#### "Cannot find module" Error

```bash
# Rebuild the project
npm run build

# Or reinstall
rm -rf node_modules
npm install
```

#### Index Not Updating

```bash
# Force re-index
npx ucm index --force

# Or clear cache
rm -rf .context .ucm
npx ucm init
```

#### Watch Mode Not Detecting Changes

Check that the file isn't in `.gitignore` or `.contextignore`.

#### MCP Server Connection Issues

```bash
# Check if port is available
lsof -i :3333

# Try a different port
npx ucm serve --port 4444
```

### Debug Mode

```bash
# Enable verbose logging
DEBUG=ucm:* npx ucm index
```

### Getting Help

- **GitHub Issues**: [Report a bug](https://github.com/LyceumAI/universal-context-memory/issues)
- **Discord**: [Join our community](https://discord.gg/lyceumacademy)
- **Documentation**: [Full docs](https://github.com/LyceumAI/universal-context-memory#readme)

## Next Steps

1. **Commit context files** to share with your team
2. **Enable watch mode** for automatic updates
3. **Configure MCP server** for direct AI integration
4. **Customize ignore patterns** for your project

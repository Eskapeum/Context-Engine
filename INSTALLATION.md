# Installation Guide

Complete installation and setup guide for Universal Context Engine (UCE) v2.2.

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
npm install universal-context-engine

# Or install globally
npm install -g universal-context-engine
```

### Yarn

```bash
yarn add universal-context-engine
```

### PNPM

```bash
pnpm add universal-context-engine
```

### From Source

```bash
# Clone the repository
git clone https://github.com/Eskapeum/Context-Engine.git
cd Context-Engine

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
npx uce init
```

This creates:
- `.uce/index.json` - Full codebase index
- `UCE.md` - Universal context file (works with any AI)

### 2. Verify Installation

```bash
npx uce stats
```

### 3. Start Watch Mode (Optional)

```bash
npx uce watch
```

## Configuration

### Configuration File

Create `.ucerc.json` in your project root:

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
    "uceMd": true
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

Create `uce.config.js`:

```javascript
/** @type {import('universal-context-engine').UCEConfig} */
export default {
  projectName: 'my-project',
  ignore: ['**/dist/**'],
  enableEmbeddings: false,
  output: {
    uceMd: true,
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
| `output.uceMd` | boolean | true | Generate UCE.md |
| `watch.debounceMs` | number | 500 | Debounce delay for watch mode |
| `chunking.targetTokens` | number | 500 | Target tokens per chunk |
| `chunking.maxTokens` | number | 1000 | Maximum tokens per chunk |

### Generate Default Config

```bash
npx uce config --init
```

### Validate Config

```bash
npx uce config --validate
```

## MCP Server Setup

UCE includes a Model Context Protocol (MCP) server for direct AI assistant integration.

### Start MCP Server

```bash
npx uce serve --port 3333
```

### Claude Code Integration

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "uce": {
      "command": "npx",
      "args": ["uce", "serve", "--port", "3333"],
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

UCE generates `UCE.md` which provides universal context. You can also use the MCP server for direct integration.

### Cursor IDE

Copy or symlink `UCE.md` to `.cursorrules` if you want Cursor to pick it up:

```bash
cp UCE.md .cursorrules
```

### GitHub Copilot

Copy `UCE.md` content to `.github/copilot-instructions.md`:

```bash
mkdir -p .github
cp UCE.md .github/copilot-instructions.md
```

### VS Code

Use the MCP server integration or reference `UCE.md` in your workflow.

## Programmatic Usage

### Basic Indexing

```typescript
import { Indexer, ContextGenerator } from 'universal-context-engine';

const indexer = new Indexer({ projectRoot: '/path/to/project' });
const index = await indexer.index();

const generator = new ContextGenerator({ projectRoot: '/path/to/project', index });
generator.generateAll();
```

### Context Engine (v2.x)

```typescript
import { ContextEngine } from 'universal-context-engine';

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
import { ContextEngine } from 'universal-context-engine';

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
npx uce index

# Or clear cache
rm -rf .uce
npx uce init
```

#### Watch Mode Not Detecting Changes

Check that the file isn't in `.gitignore` or `.contextignore`.

#### MCP Server Connection Issues

```bash
# Check if port is available
lsof -i :3333

# Try a different port
npx uce serve --port 4444
```

### Debug Mode

```bash
# Enable verbose logging
DEBUG=uce:* npx uce index
```

### Getting Help

- **GitHub Issues**: [Report a bug](https://github.com/Eskapeum/Context-Engine/issues)
- **Documentation**: [Full docs](https://github.com/Eskapeum/Context-Engine#readme)

## Next Steps

1. **Commit UCE.md** to share context with your team
2. **Enable watch mode** for automatic updates
3. **Configure MCP server** for direct AI integration
4. **Customize ignore patterns** for your project

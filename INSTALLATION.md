# Installation Guide

Complete installation and setup guide for Universal Context Engine (UCE) v2.4.

## Table of Contents

- [Requirements](#requirements)
- [Installation Methods](#installation-methods)
- [Quick Start](#quick-start)
- [Auto-Indexing Setup](#auto-indexing-setup)
- [AI Assistant Integration](#ai-assistant-integration)
- [Configuration](#configuration)
- [MCP Server Setup](#mcp-server-setup)
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

> **Note:** Use `npx universal-context-engine` (not `npx uce`) because there's an unrelated npm package named `uce`. After installing globally, you can use `uce` directly.

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
npx universal-context-engine init
```

This creates:
- `.uce/index.json` - Full codebase index
- `UCE.md` - Universal context file (works with any AI)
- `.contextignore` - File patterns to exclude

### 2. Verify Installation

```bash
npx universal-context-engine stats
```

### 3. Set Up Auto-Indexing (Recommended)

```bash
# Install git pre-commit hook
npx universal-context-engine hook
```

Now UCE.md will automatically update before every commit!

### 4. Install AI Assistant Integrations

```bash
# Install slash commands for Claude Code
npx universal-context-engine install --assistant claude --global

# Or install all integrations for your project
npx universal-context-engine install
```

## Auto-Indexing Setup

UCE v2.4 provides automatic indexing to keep your UCE.md always up-to-date.

### Option 1: Git Pre-commit Hook (Recommended)

The hook automatically indexes your codebase before every commit:

```bash
# Install the hook
npx universal-context-engine hook

# Test it - make a change and commit
git add .
git commit -m "test"  # UCE runs automatically!

# Remove the hook if needed
npx universal-context-engine hook --uninstall
```

**Benefits:**
- No background process needed
- UCE.md is always committed with your code changes
- Works with any git workflow
- Zero maintenance

### Option 2: Background Daemon

For real-time updates during active development:

```bash
# Start the daemon
npx universal-context-engine daemon

# Check status
npx universal-context-engine daemon --status

# Stop the daemon
npx universal-context-engine daemon --stop
```

**Benefits:**
- Instant updates on every file save
- Logs stored in `.uce/daemon.log`
- Perfect for live development sessions

### Option 3: Watch Mode (Interactive)

For manual watch sessions:

```bash
npx universal-context-engine watch
```

Runs in foreground with live output. Press Ctrl+C to stop.

### Comparison

| Feature | Git Hook | Daemon | Watch Mode |
|---------|----------|--------|------------|
| Background process | No | Yes | Yes (foreground) |
| Auto-commit staged | Yes | No | No |
| Real-time updates | No | Yes | Yes |
| Best for | Daily workflow | Active coding | Debugging |

## AI Assistant Integration

### Automatic Installation

```bash
# Install all supported integrations
npx universal-context-engine install

# Or install specific assistants
npx universal-context-engine install --assistant claude        # Claude Code
npx universal-context-engine install --assistant cursor        # Cursor IDE
npx universal-context-engine install --assistant copilot       # GitHub Copilot
npx universal-context-engine install --assistant cline         # Cline
npx universal-context-engine install --assistant continue      # Continue

# Install Claude commands globally (works in all projects)
npx universal-context-engine install --assistant claude --global
```

### What Gets Installed

| Assistant | Files Created | Location |
|-----------|---------------|----------|
| Claude Code | 15 slash commands | `.claude/commands/uce/` |
| Cursor | .cursorrules | Project root |
| Copilot | copilot-instructions.md | `.github/` |
| Cline | uce-commands.json | `.cline/` |
| Continue | uce-config.json | `.continue/` |

### Manual Setup

#### Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "uce": {
      "command": "npx",
      "args": ["universal-context-engine", "serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

#### Cursor IDE

```bash
cp UCE.md .cursorrules
```

#### GitHub Copilot

```bash
mkdir -p .github
cp UCE.md .github/copilot-instructions.md
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
  }
}
```

### Generate Default Config

```bash
npx universal-context-engine config --init
```

### Validate Config

```bash
npx universal-context-engine config --validate
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

## MCP Server Setup

UCE includes a Model Context Protocol (MCP) server for direct AI assistant integration.

### Start MCP Server

```bash
npx universal-context-engine serve --port 3333
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

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `init` | Initialize UCE in a project |
| `install` | Auto-install AI assistant integrations |
| `index` | Re-index the codebase |
| `generate` | Regenerate UCE.md from existing index |
| `hook` | Install/uninstall git pre-commit hook |
| `daemon` | Start/stop background file watcher |
| `watch` | Watch for changes (foreground) |
| `stats` | Show index statistics |
| `search <query>` | Search codebase with BM25 |
| `query <term>` | Query symbols and files |
| `callers <fn>` | Find function callers |
| `related <symbol>` | Find related symbols |
| `inheritance <class>` | Show class hierarchy |
| `graph` | Export knowledge graph |
| `serve` | Start MCP server |
| `config` | Manage configuration |
| `diff` | Show changes since last index |
| `clean` | Remove generated files |
| `info` | Show version and system info |
| `hello` | Guided onboarding |

## Troubleshooting

### Common Issues

#### "npx uce" runs wrong package

Use the full package name:
```bash
npx universal-context-engine <command>
```

Or install globally:
```bash
npm install -g universal-context-engine
uce <command>
```

#### Index Not Updating

```bash
# Force re-index
npx universal-context-engine index

# Or clear cache
rm -rf .uce
npx universal-context-engine init
```

#### Git Hook Not Running

```bash
# Check if hook exists
ls -la .git/hooks/pre-commit

# Reinstall hook
npx universal-context-engine hook --uninstall
npx universal-context-engine hook
```

#### Daemon Not Starting

```bash
# Check if already running
npx universal-context-engine daemon --status

# Check logs
cat .uce/daemon.log

# Stop and restart
npx universal-context-engine daemon --stop
npx universal-context-engine daemon
```

#### MCP Server Connection Issues

```bash
# Check if port is available
lsof -i :3333

# Try a different port
npx universal-context-engine serve --port 4444
```

### Getting Help

- **GitHub Issues**: [Report a bug](https://github.com/Eskapeum/Context-Engine/issues)
- **Documentation**: [Full docs](https://github.com/Eskapeum/Context-Engine#readme)

## Next Steps

1. **Commit UCE.md** to share context with your team
2. **Install git hook** for automatic updates on commit
3. **Install AI integrations** for Claude, Cursor, Copilot, etc.
4. **Configure ignore patterns** for your project
5. **Set up MCP server** for direct AI integration

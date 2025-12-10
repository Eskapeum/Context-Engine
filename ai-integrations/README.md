# UCE AI Integrations

This directory contains configuration files and commands for integrating Universal Context Engine (UCE) with various AI coding assistants.

## Quick Start

```bash
# Install UCE
npm install universal-context-engine

# Initialize in your project
npx uce init

# Auto-install all AI assistant integrations
npx universal-context-engine install
```

> **Note:** Use `npx universal-context-engine` (not `npx uce`) because there's an unrelated npm package named `uce`. After installing globally, you can use `uce` directly.

## Automatic Installation (Recommended)

UCE v2.3+ includes an `install` command that automatically sets up integrations:

```bash
# Install all supported integrations
npx universal-context-engine install

# Install specific assistant
npx universal-context-engine install --assistant claude      # Claude Code
npx universal-context-engine install --assistant cursor      # Cursor IDE
npx universal-context-engine install --assistant copilot     # GitHub Copilot
npx universal-context-engine install --assistant cline       # Cline
npx universal-context-engine install --assistant continue    # Continue

# Install Claude commands globally (user home)
npx universal-context-engine install --assistant claude --global
```

This creates the appropriate config files for each assistant automatically.

## Supported AI Assistants

### Claude Code

**Slash Commands:** Copy the files from `claude-code/` to your project's `.claude/commands/uce/` directory.

**MCP Server:** Add to your Claude Code configuration:
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

### Cursor IDE

**Option 1:** Copy `cursor/.cursorrules` to your project root.

**Option 2:** Copy/symlink UCE.md:
```bash
cp UCE.md .cursorrules
```

### GitHub Copilot

Copy `copilot/copilot-instructions.md` to `.github/copilot-instructions.md`:
```bash
mkdir -p .github
cp ai-integrations/copilot/copilot-instructions.md .github/
```

Or symlink UCE.md:
```bash
mkdir -p .github
ln -s ../UCE.md .github/copilot-instructions.md
```

### Cline

Use the configuration in `cline/cline-config.json` as reference for setting up UCE commands in Cline.

### Continue

Use the configuration in `continue/continue-config.json` as reference for your Continue setup.

### Other AI Assistants

The `universal/uce-commands.yaml` file contains a complete specification of all UCE commands that can be adapted for any AI assistant:

- **Antigravity**
- **Codex**
- **Trae**
- **Kiro**
- **Auggie**
- **Gemini Code Assist**
- **Amazon Q**
- **Tabnine**

## Available Commands

| Command | Description |
|---------|-------------|
| `npx uce init` | Initialize UCE in a project |
| `npx uce hello` | Guided onboarding for new users |
| `npx uce index` | Re-index the codebase |
| `npx uce generate` | Regenerate UCE.md |
| `npx uce watch` | Watch for changes |
| `npx uce search <query>` | Search codebase with BM25 |
| `npx uce query <term>` | Query symbols and files |
| `npx uce callers <function>` | Find function callers |
| `npx uce related <symbol>` | Find related symbols |
| `npx uce inheritance <class>` | Show class hierarchy |
| `npx uce graph` | Export knowledge graph |
| `npx uce serve` | Start MCP server |
| `npx uce stats` | Show index statistics |
| `npx uce diff` | Show changes since last index |
| `npx uce export` | Export index as JSON |
| `npx uce clean` | Remove generated files |
| `npx uce config` | Manage configuration |
| `npx uce info` | Show version info |

## Context File

UCE generates a single universal context file: `UCE.md`

This file contains:
- Project structure and file tree
- Key symbols (classes, functions, interfaces)
- Public API documentation
- Dependency relationships
- Development guidelines

**Commit UCE.md** to share context with your team and AI assistants!

## MCP Server

UCE includes a Model Context Protocol (MCP) server for direct integration:

```bash
npx uce serve --port 3333
```

MCP Tools:
- `retrieve` - Get relevant context for a query
- `search` - Search symbols
- `related` - Find related code
- `callers` - Find function callers
- `inheritance` - Get class hierarchy
- `dependencies` - Get file dependencies
- `stats` - Index statistics

## Directory Structure

```
ai-integrations/
├── README.md              # This file
├── claude-code/           # Claude Code slash commands
│   ├── uce-init.md
│   ├── uce-index.md
│   ├── uce-search.md
│   ├── uce-callers.md
│   ├── uce-related.md
│   └── ...
├── cursor/                # Cursor IDE configuration
│   └── .cursorrules
├── copilot/               # GitHub Copilot configuration
│   └── copilot-instructions.md
├── cline/                 # Cline configuration
│   └── cline-config.json
├── continue/              # Continue configuration
│   └── continue-config.json
└── universal/             # Universal YAML specification
    └── uce-commands.yaml
```

## Custom Integration

To integrate UCE with any AI assistant:

1. **Read the YAML spec:** `universal/uce-commands.yaml` contains all commands
2. **Use UCE.md as context:** Point your AI to read UCE.md
3. **Add command shortcuts:** Map UCE commands to your assistant's interface
4. **Use MCP if supported:** Connect to the UCE MCP server

## Links

- [UCE Documentation](https://github.com/Eskapeum/Context-Engine)
- [Installation Guide](../INSTALLATION.md)
- [npm Package](https://www.npmjs.com/package/universal-context-engine)

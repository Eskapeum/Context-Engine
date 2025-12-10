# Universal Context Engine (UCE) - Copilot Instructions

## Project Context

This project uses Universal Context Engine (UCE) for codebase indexing and context generation.

## Available Commands

Run these commands in the terminal to get better context:

| Command | Description |
|---------|-------------|
| `npx uce init` | Initialize UCE in a project |
| `npx uce index` | Re-index the codebase |
| `npx uce search "<query>"` | Search codebase with BM25 |
| `npx uce query "<term>"` | Query symbols and files |
| `npx uce callers <function>` | Find function callers |
| `npx uce related <symbol>` | Find related symbols |
| `npx uce inheritance <class>` | Show class hierarchy |
| `npx uce graph` | Export knowledge graph |
| `npx uce stats` | Show index statistics |
| `npx uce watch` | Watch for changes |
| `npx uce diff` | Show changes since last index |

## Context File

Read `UCE.md` in the project root for:
- Complete project structure
- Key symbols and APIs
- Dependency relationships
- Development guidelines

## Workflow

1. Before making changes, run `npx uce search "<topic>"` to find relevant code
2. Use `npx uce callers <function>` before modifying functions
3. Run `npx uce index` after major changes
4. Commit `UCE.md` to share context

## Installation

```bash
npm install universal-context-engine
npx uce init
```

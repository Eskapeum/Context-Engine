# UCE Index

Re-index the codebase and regenerate UCE.md.

## Instructions

Run the following command:

```bash
npx uce index
```

Options:
- `--path <path>` - Specify project path (default: current directory)
- `--no-generate` - Index only, don't regenerate UCE.md

This will scan all source files, extract symbols, and update the context.

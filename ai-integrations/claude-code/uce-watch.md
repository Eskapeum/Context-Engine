# UCE Watch

Watch for file changes and auto-update the index.

## Instructions

Run the following command:

```bash
npx uce watch
```

Options:
- `--path <path>` - Project path (default: current directory)
- `--debounce <ms>` - Debounce delay in milliseconds (default: 500)
- `--no-regenerate` - Skip regenerating UCE.md on change

This will:
1. Watch all source files for changes
2. Re-index modified files
3. Update UCE.md automatically
4. Track dependencies and re-index affected files

Press Ctrl+C to stop watching.

# UCE Related

Find symbols related to the given symbol.

## Instructions

Run the following command with the symbol name:

```bash
npx uce related "$ARGUMENTS"
```

Options:
- `--depth <n>` - Maximum relationship depth (default: 2)
- `--types <types>` - Filter by relation types (comma-separated)

This finds:
- Functions that call or are called by the symbol
- Classes that extend or implement the symbol
- Files that import/export the symbol
- Dependencies and dependents

Example:
```bash
npx uce related AuthService
npx uce related handleLogin --depth 3
```

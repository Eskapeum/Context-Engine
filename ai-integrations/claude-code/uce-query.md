# UCE Query

Query symbols and files in the index.

## Instructions

Run the following command with your search term:

```bash
npx uce query "$ARGUMENTS"
```

This performs a fast lookup in the index for:
- File paths matching the term
- Symbol names matching the term (classes, functions, interfaces, etc.)

Results include file location and line numbers.

Example:
```bash
npx uce query User
npx uce query authentication
npx uce query "src/auth"
```

# UCE Search

Search the codebase using BM25 hybrid search.

## Instructions

Run the following command with your search query:

```bash
npx uce search "$ARGUMENTS"
```

Options:
- `--limit <n>` - Maximum results (default: 10)
- `--tokens <n>` - Max tokens in results (default: 8000)
- `--mode <mode>` - Search mode: hybrid, bm25, semantic (default: bm25)
- `--show-content` - Show matching content snippets

Examples:
```bash
npx uce search "authentication logic"
npx uce search "error handling" --show-content
npx uce search "database queries" --limit 20
```

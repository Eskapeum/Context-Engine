# UCE Graph

Export the knowledge graph in various formats.

## Instructions

Run the following command:

```bash
npx uce graph
```

Options:
- `--format <format>` - Output format: json, dot, mermaid (default: json)
- `--output <file>` - Output file (default: stdout)
- `--filter <type>` - Filter by node type: file, class, function, etc.
- `--max-nodes <n>` - Maximum nodes to include (default: 500)

Examples:
```bash
# Export as Mermaid diagram
npx uce graph --format mermaid > architecture.md

# Export classes only as DOT
npx uce graph --format dot --filter class > classes.dot

# Export full graph as JSON
npx uce graph --output graph.json
```

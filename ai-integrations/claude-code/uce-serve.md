# UCE Serve

Start the UCE MCP server for direct AI integration.

## Instructions

Run the following command:

```bash
npx uce serve
```

Options:
- `--port <port>` - Port to listen on (default: 3333)
- `--path <path>` - Project path (default: current directory)
- `--watch` - Enable file watching

The MCP server provides these tools:
- `retrieve` - Get relevant context for a query
- `search` - Search symbols
- `related` - Find related code
- `callers` - Find function callers
- `inheritance` - Get class hierarchy
- `dependencies` - Get file dependencies
- `stats` - Index statistics

To integrate with Claude Code, add to your MCP configuration:
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

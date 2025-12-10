# UCE Callers

Find all callers of a function or method.

## Instructions

Run the following command with the function name:

```bash
npx uce callers "$ARGUMENTS"
```

This uses the knowledge graph to find all locations where the specified function is called.

Example:
```bash
npx uce callers handleLogin
npx uce callers "UserService.create"
```

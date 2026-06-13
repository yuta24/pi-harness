# Protected Paths Extension

Blocks write and edit operations to protected paths.

## Behavior

The extension watches `write` and `edit` tool calls. If the target path
contains one of the protected path patterns, the tool call is blocked.

Protected patterns:

- `.env`
- `.git/`
- `node_modules/`

When a protected path is blocked in interactive mode, Pi also shows a warning
notification.

## Usage

Enable the extension via `pi config`, or load it directly:

```sh
pi -e extensions/protected-paths.ts
```

No additional setup is required.

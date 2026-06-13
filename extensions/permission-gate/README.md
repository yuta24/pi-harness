# Permission Gate Extension

Prompts for confirmation before Pi runs potentially dangerous bash commands.

## Behavior

The extension watches `bash` tool calls and checks the command against a small
set of dangerous patterns:

- `rm -r`, `rm -rf`, and `rm --recursive`
- `sudo`
- `chmod` or `chown` commands that include `777`

When a matching command is detected:

- In interactive mode, Pi shows a confirmation prompt.
- In non-interactive mode, the command is blocked because no UI is available
  for confirmation.

## Usage

Enable the extension via `pi config`, or load it directly:

```sh
pi -e extensions/permission-gate.ts
```

No additional setup is required.

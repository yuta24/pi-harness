# Pi Statusline Extension

Project-local Pi extension that replaces the interactive footer with stdout
from a user-configurable statusline script.

## Configuration

Edit `.pi/statusline.json`:

```json
{
  "enabled": true,
  "command": ".pi/statusline.js",
  "args": [],
  "timeoutMs": 500,
  "maxOutputChars": 240
}
```

The configured script must be executable:

```sh
chmod +x .pi/statusline.js
```

## Security Model

- The command is executed with `spawn(command, args)`, never through a shell.
- The command must resolve inside the project root.
- Commands inside `.git` are rejected.
- The command must be an executable file.
- Timeout and output size are clamped.
- Refresh interval is fixed by the extension and is not user-configurable.
- ANSI and terminal control sequences are stripped from script output.
- The child receives a minimal environment: `PATH` plus `PI_*` statusline
  variables.
- Status context is also written to stdin as JSON.

This still runs local code as the current user. Treat `.pi/statusline.json` and
the configured script as trusted project configuration.

## Commands

- `/statusline` shows current status.
- `/statusline reload` reloads `.pi/statusline.json`.
- `/statusline on` enables the custom footer.
- `/statusline off` restores Pi's default footer.

## Script Input

Environment variables:

- `PI_PROVIDER`
- `PI_MODEL`
- `PI_CWD`
- `PI_GIT_BRANCH`
- `PI_CONTEXT_PERCENT`
- `PI_INPUT_TOKENS`
- `PI_OUTPUT_TOKENS`
- `PI_COST`
- `PI_EXTENSION_STATUSES` as JSON

The same data is sent to stdin as JSON for scripts that prefer structured input.

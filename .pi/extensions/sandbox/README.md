# Pi Sandbox Extension

Project-local Pi extension that wraps assistant `bash` tool calls with
`@anthropic-ai/sandbox-runtime`.

User shell commands entered with `!` or `!!` are intentionally not sandboxed.

## Setup

```sh
cd .pi/extensions/sandbox
npm install
```

Linux also requires `bubblewrap`, `socat`, and `ripgrep`. macOS uses
`sandbox-exec`.

## Usage

Run `pi` from the repository root. Pi auto-discovers project extensions under
`.pi/extensions/`.

Use `/sandbox` inside Pi to show the merged sandbox configuration and current
status.

Disable for one run:

```sh
pi --no-sandbox
```

## Configuration

Project settings live in `.pi/sandbox.json`. Global defaults can be placed at
`~/.pi/agent/extensions/sandbox.json`. Project settings override global
settings.

Invalid or unknown config keys are rejected at startup. If sandbox
initialization fails, assistant `bash` tool calls are blocked until the config
is fixed or `pi --no-sandbox` is used.

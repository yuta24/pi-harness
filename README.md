# pi-harness

Project-local Pi harness with a sandbox extension for assistant `bash` tool
calls.

## Sandbox extension

The extension is in `.pi/extensions/sandbox/` and is auto-discovered when `pi`
runs from this repository.

Install its runtime dependency once:

```sh
cd .pi/extensions/sandbox
npm install
```

Then run `pi` from the repository root. Use `/sandbox` inside Pi to inspect the
active config, or `pi --no-sandbox` to disable sandboxing for a run.

The sandbox applies to assistant `bash` tool calls only. User shell commands
entered with `!` or `!!` are intentionally left unsandboxed.

Sandbox policy lives in `.pi/sandbox.json`.

Invalid or unknown sandbox config keys are rejected at startup. If sandbox
initialization fails, assistant `bash` tool calls are blocked until the config
is fixed or `pi --no-sandbox` is used.

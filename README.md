# pi-harness

Project-local Pi harness with sandbox, subagent, and ask/plan mode extensions.

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

## Subagent extension

The extension is in `.pi/extensions/subagent/` and registers a `subagent` tool.
It runs isolated `pi --mode json -p --no-session` subprocesses using agent
definitions from `.pi/agents/*.md` by default.

Use `/agents` inside Pi to list available project agents.

Subagents do not inherit extension tools recursively. Child processes explicitly
reload the project sandbox extension when present, and custom `cwd` values must
stay inside the project root.

Each subagent has a 30-minute watchdog timeout by default. Pass
`timeoutSeconds: 0` to disable it for a specific invocation.

## Ask / plan mode extension

The extension is in `.pi/extensions/ask-plan/` and registers read-only `/ask`
and `/plan` modes.

Ask mode is for read-only Q&A. Plan mode is for read-only investigation and
numbered plan creation. In interactive sessions, Pi can then execute the
approved plan and track `[DONE:n]` markers.

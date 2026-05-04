# pi-harness

Project-local Pi harness with sandbox, subagent, ask/plan mode, model routing,
question, and statusline extensions.

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

## Model routing extension

The extension is in `.pi/extensions/model-routing/` and registers automatic
model route selection from `.pi/model-routing.json`.

Use `/route` inside Pi to inspect or pin a route. Routes can change the model,
thinking level, or both based on prompt keywords, regexes, and context usage.

## Question extension

The extension is in `.pi/extensions/question/` and registers an
`ask_user_question` tool.

The tool lets the assistant ask explicit text, yes/no, or option-based
clarifying questions before it proceeds with ambiguous work.

## Statusline extension

The extension is in `.pi/extensions/statusline/` and replaces the interactive
footer with stdout from `.pi/statusline.js`.

Configuration lives in `.pi/statusline.json`. The script is executed without a
shell, must stay inside the project root by default, has a timeout, and receives
Pi status data through `PI_*` environment variables and stdin JSON.

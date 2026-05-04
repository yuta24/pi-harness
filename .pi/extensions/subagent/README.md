# Pi Subagent Extension

Project-local Pi extension that adds a `subagent` tool for delegating bounded
tasks to isolated `pi` subprocesses.

## Modes

- Single: `{ "agent": "scout", "task": "Find the auth flow" }`
- Parallel: `{ "tasks": [{ "agent": "scout", "task": "Find models" }] }`
- Chain: `{ "chain": [{ "agent": "scout", "task": "Find X" }, { "agent": "planner", "task": "Plan from {previous}" }] }`

Each subagent has a watchdog timeout. Default is `timeoutSeconds: 1800`.
Set `timeoutSeconds: 0` to disable it.

## Agents

Agents are markdown files with frontmatter:

```markdown
---
name: scout
description: Fast codebase reconnaissance
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt goes here.
```

Locations:

- `.pi/agents/*.md` for project-local agents
- `~/.pi/agent/agents/*.md` for user-level agents

Default `agentScope` is `project`. Pass `user` or `both` when needed.

Use `/agents`, `/agents user`, `/agents project`, or `/agents both` inside Pi to
inspect discovered agents.

## Security

Project-local agents are repo-controlled prompts. The tool asks for confirmation
before running them in interactive mode. Set `confirmProjectAgents: false` only
for trusted repositories.

Each subagent runs as a separate `pi --mode json -p --no-session` process with
its own context window.

Child processes are started with `--no-extensions` and explicitly reload only
the project sandbox extension when present. This prevents recursive subagent
calls while keeping assistant `bash` tool calls sandboxed.

Agent `cwd` values must stay inside the project root. Project-local agents are
blocked in non-interactive mode unless `confirmProjectAgents: false` is set.

Tool restrictions come from the selected agent's frontmatter. Agents without a
`tools` frontmatter entry receive only Pi built-in tools (`read`, `bash`, `edit`,
`write`, `grep`, `find`, `ls`), not extension tools.

Unknown or extension tool names in agent frontmatter are ignored and reported in
the subagent result.

Large stderr and final outputs are truncated to keep tool results bounded.

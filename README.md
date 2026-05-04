# pi-harness

Project-local Pi harness with sandbox, subagent, ask/plan mode, model routing,
question, and statusline extensions.

## Installation

```sh
pi install git:github.com/yuta24/pi-harness
```

Use `-l` to install project-locally into `.pi/settings.json`. Omit `-l` for a
user-global install.

After installation, use `pi config` to enable or disable individual extensions.

The sandbox extension requires an additional setup step — see its
[README](extensions/sandbox/README.md) for details.

## Extensions

| Extension | Description |
|---|---|
| [sandbox](extensions/sandbox/README.md) | OS-level sandboxing for bash commands |
| [subagent](extensions/subagent/README.md) | Isolated `pi` subprocess delegation |
| [ask-plan](extensions/ask-plan/README.md) | Read-only ask and plan modes |
| [model-routing](extensions/model-routing/README.md) | Automatic model route selection |
| [question](extensions/question/README.md) | Interactive `ask_user_question` tool |
| [statusline](extensions/statusline/README.md) | Customizable interactive footer |

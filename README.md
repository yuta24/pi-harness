# pi-harness

Project-local Pi harness with sandbox, subagent, ask/plan mode, model routing,
question, and statusline extensions.

## Installation

```sh
pi install git:github.com/yuta24/pi-harness
```

Or install individual extensions:

```sh
pi install git:github.com/yuta24/pi-harness/extensions/sandbox
pi install git:github.com/yuta24/pi-harness/extensions/subagent
pi install git:github.com/yuta24/pi-harness/extensions/ask-plan
pi install git:github.com/yuta24/pi-harness/extensions/model-routing
pi install git:github.com/yuta24/pi-harness/extensions/question
pi install git:github.com/yuta24/pi-harness/extensions/statusline
```

Use `-l` to install project-locally into `.pi/settings.json`. Omit `-l` for a
user-global install.

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

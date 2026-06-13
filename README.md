# pi-harness

Project-local Pi harness with sandbox, subagent, plan mode, question,
statusline, and todo extensions.

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
| [sandbox](extensions/sandbox/README.md) | OS-level sandboxing for Pi bash commands |
| [subagent](extensions/subagent/README.md) | Delegation to isolated specialized Pi subprocesses |
| [plan-mode](extensions/plan-mode/README.md) | Read-only planning mode with tracked execution |
| [question](extensions/question/README.md) | Interactive option picker for assistant questions |
| [questionnaire](extensions/questionnaire/README.md) | Multi-question form for structured user input |
| [statusline](extensions/statusline/README.md) | Persistent footer status for turn progress |
| [todo](extensions/todo/README.md) | Branch-aware in-session todo tool with `/todos` viewer |

## Skills

| Skill | Description |
|---|---|
| [code-review](skills/code-review/SKILL.md) | Bug/security/quality review with confidence scoring |
| [feature-dev](skills/feature-dev/SKILL.md) | 7-phase guided feature development workflow |
| [fix-bug](skills/fix-bug/SKILL.md) | 6-phase systematic bug fixing workflow |

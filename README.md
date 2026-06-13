# pi-harness

Project-local Pi harness with sandbox, subagent, ask/plan mode, model routing,
question, statusline, and todo extensions.

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
| [ask-plan](extensions/ask-plan/README.md) | Read-only ask and planning modes with guarded execution |
| [model-routing](extensions/model-routing/README.md) | Prompt-based model and thinking-level route selection |
| [question](extensions/question/README.md) | Interactive clarification tool for assistant questions |
| [statusline](extensions/statusline/README.md) | Project-configurable interactive footer command |
| [todo](extensions/todo/README.md) | Branch-aware in-session todo tool with `/todos` viewer |

## Skills

| Skill | Description |
|---|---|
| [code-review](skills/code-review/SKILL.md) | Bug/security/quality review with confidence scoring |
| [feature-dev](skills/feature-dev/SKILL.md) | 7-phase guided feature development workflow |
| [fix-bug](skills/fix-bug/SKILL.md) | 6-phase systematic bug fixing workflow |

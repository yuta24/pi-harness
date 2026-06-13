# Ask Mode Extension

Read-only Q&A mode for Pi.

This extension is intentionally separate from `plan-mode`. Use ask mode when
you want explanation, investigation, or advice without implementation. Use plan
mode when you want a numbered implementation plan and tracked execution.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/ask-mode"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the
`ask-mode` extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/ask-mode/index.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/ask-mode/index.ts
```

## Commands And Flags

- `/ask` toggles ask mode.
- `pi --ask` starts in ask mode.
- `Ctrl+Alt+A` toggles ask mode.

## Behavior

Ask mode enables only these tools:

- `read`
- `bash`
- `grep`
- `find`
- `ls`
- `question`
- `questionnaire`

It blocks:

- `edit`
- `write`
- bash commands outside the read-only allowlist

Ask mode is a guardrail, not an OS security sandbox. Use the sandbox extension
for OS-level command restrictions.

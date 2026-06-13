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
- `/ask <question>` enables ask mode and sends a read-only question.
- `pi --ask` starts in ask mode.
- `Ctrl+Alt+A` toggles ask mode.

## Behavior

When enabled, the footer status shows `ask: read-only`.

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

## Follow-Up Questions

After each answer in interactive mode, ask mode opens a follow-up editor
directly.

Behavior:

- Enter a follow-up question to send it as the next user message.
- Submit an empty value to exit ask mode.
- Press Escape to exit ask mode.

This keeps consecutive Q&A fast: keep typing questions while you want to stay
in ask mode, then submit empty input or press Escape when done.

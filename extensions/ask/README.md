# Ask Extension

Read-only Q&A mode for Pi.

This extension registers `/ask` and `--ask`. Ask mode lets the assistant inspect
the project with read-only tools while blocking file modification tools and
non-read-only bash commands.

Use `ask` when you want analysis or answers without implementation. Use
`plan-mode` when you want a numbered implementation plan with tracked execution.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/ask.ts"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the `ask`
extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/ask.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/ask.ts
```

## Commands And Flags

- `/ask` toggles ask mode.
- `/normal` exits ask mode.
- `pi --ask` starts in ask mode.

## Behavior

Ask mode enables these tools:

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
- bash commands that are not on the read-only allowlist

This is a planning guard, not an OS security sandbox. Use the sandbox extension
for OS-level command restrictions.

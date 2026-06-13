# Todo Extension

Structured in-session todo management for Pi.

This extension registers a `todo` tool for the LLM and a `/todos` command for
interactive viewing. Todo state is stored in tool result details on the current
session branch, so branching or switching branches restores the todo list for
that point in the conversation.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/todo.ts"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the `todo`
extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/todo.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/todo.ts
```

## Tool

| Tool | Description |
|------|-------------|
| `todo` | Manage todos with `list`, `add`, `toggle`, and `clear` actions |

Tool parameters:

```json
{
  "action": "list | add | toggle | clear",
  "text": "Todo text for add",
  "id": 1
}
```

## Command

| Command | Description |
|---------|-------------|
| `/todos` | Open the interactive todo viewer |

Press Escape or Ctrl+C to close the viewer.

## Usage

Ask Pi to manage todos during multi-step work:

```text
Add todos for updating docs and running checks.
```

```text
Show the todo list.
```

```text
Mark todo #1 as done.
```

```text
Clear the todo list.
```

## State Model

The extension reconstructs state by scanning the current session branch for
`todo` tool results. It does not write todo state to external files.

This means:

- resuming a session restores todos from that session
- branching keeps each branch's todo state independent
- clearing todos is recorded as another session entry

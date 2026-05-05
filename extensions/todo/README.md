# Pi Todo Extension

Provides a `todo` tool for the LLM and a `/todos` command for interactive viewing.

## Tools

| Tool | Description |
|------|-------------|
| `todo` | Manage structured task list — `list`, `add`, `toggle`, `clear` |

## Commands

| Command | Description |
|---------|-------------|
| `/todos` | Open interactive todo viewer (Esc to close) |

## How It Works

State is stored in tool result details on the session branch. When you branch or
switch branches via `/tree`, the todo list automatically reflects the correct
state for that point in history — no external files needed.

## Usage

The LLM uses this automatically during multi-step workflows (feature-dev,
fix-bug). You can also ask directly:

- "Add a todo for updating the README"
- "What's on the todo list?"
- "Mark the refactoring task as done"

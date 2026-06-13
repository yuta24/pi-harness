# Question Extension

Interactive single-question picker for Pi.

This extension registers a `question` tool that lets the assistant ask the user
one question with a list of options. The UI also includes a `Type something.`
choice for custom free-form input.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/question.ts"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the
`question` extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/question.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/question.ts
```

## Tool

| Tool | Description |
|------|-------------|
| `question` | Ask one question and let the user choose from options or type a custom answer |

Tool parameters:

```json
{
  "question": "Which approach should I use?",
  "options": [
    {
      "label": "Small patch",
      "description": "Keep changes narrow and localized."
    },
    {
      "label": "Broader cleanup",
      "description": "Refactor nearby code while touching this area."
    }
  ]
}
```

## Behavior

- In TUI mode, the user navigates options with Up/Down and selects with Enter.
- The final option is `Type something.`, which opens an inline editor.
- Escape in the editor returns to the option list.
- Escape in the option list cancels the question.
- In non-interactive mode, the tool returns an error because UI input is not
  available.

## Result

The tool result records:

- the question text
- the option labels
- the selected answer, custom answer, or cancellation

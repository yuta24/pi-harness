# Questionnaire Extension

Interactive single- or multi-question form for Pi.

This extension registers a `questionnaire` tool that lets the assistant ask one
or more structured questions. For a single question, it shows a simple options
list. For multiple questions, it shows a tabbed interface and a final submit
step.

Use `question` for one quick, lightweight choice. Use `questionnaire` when the
assistant needs two or more answers, stable answer IDs, or explicit option
values for later processing.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/questionnaire.ts"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the
`questionnaire` extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/questionnaire.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/questionnaire.ts
```

## Tool

| Tool | Description |
|------|-------------|
| `questionnaire` | Ask one or more structured questions with option values and optional custom answers |

Tool parameters:

```json
{
  "questions": [
    {
      "id": "scope",
      "label": "Scope",
      "prompt": "What should this change cover?",
      "options": [
        {
          "value": "minimal",
          "label": "Minimal",
          "description": "Only the requested behavior."
        },
        {
          "value": "broad",
          "label": "Broad",
          "description": "Also clean up adjacent code."
        }
      ],
      "allowOther": true
    }
  ]
}
```

## Behavior

- One question shows a simple option list.
- Multiple questions show tabs for each question plus a Submit tab.
- Tab or Right moves forward; Shift+Tab or Left moves backward.
- Up/Down changes the selected option.
- Enter selects an option or submits when all questions are answered.
- `allowOther` defaults to true and adds a `Type something.` option.
- Escape cancels the questionnaire.
- In non-interactive mode, the tool returns an error because UI input is not
  available.

## Result

The tool result records:

- the normalized questions
- an `answers` array with `id`, `value`, `label`, and `wasCustom`
- whether the questionnaire was cancelled

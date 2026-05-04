# Pi Question Extension

Project-local Pi extension that registers an `ask_user_question` tool for
interactive clarification.

## Tool

`ask_user_question` lets the assistant ask one direct question when it needs
missing requirements, a decision, or confirmation before proceeding.

Supported question kinds:

- `text`: free-form user input.
- `confirm`: yes/no confirmation.
- `select`: choose from explicit options.

Example tool input:

```json
{
  "question": "Which API should this use?",
  "kind": "select",
  "options": [
    { "label": "OpenAI Responses API", "value": "responses" },
    { "label": "Anthropic Messages API", "value": "anthropic" }
  ],
  "defaultAnswer": "responses",
  "timeoutSeconds": 120
}
```

In non-interactive mode, the tool returns an unavailable result instead of
guessing. If `defaultAnswer` is set, that answer is included in the result.

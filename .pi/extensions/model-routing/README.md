# Pi Model Routing Extension

Project-local Pi extension that automatically selects a model route for each
turn from `.pi/model-routing.json`.

## Commands

- `/route` shows current routing state and configured routes.
- `/route auto` enables prompt-based routing.
- `/route off` disables routing.
- `/route <name>` pins a named route until `/route auto` or `/route off`.

CLI flags:

- `pi --model-route review`
- `pi --no-model-routing`

## Configuration

Routes are evaluated in order. The first matching route wins. If no route
matches, `defaultRoute` is used, then the first route without `match`, then the
first configured route.

```json
{
  "defaultRoute": "default",
  "routes": [
    {
      "name": "review",
      "provider": "openai",
      "model": "gpt-5.2",
      "thinkingLevel": "high",
      "match": {
        "keywords": ["review", "レビュー"],
        "regex": ["fix(es)?\\s+#\\d+"],
        "minContextPercent": 80
      }
    },
    {
      "name": "default",
      "thinkingLevel": "medium"
    }
  ]
}
```

`provider` and `model` are optional, but must be set together. A route can tune
only `thinkingLevel`, which is useful when the user keeps model selection on
Pi's built-in `--model` / Ctrl+P flow.

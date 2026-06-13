# Statusline Extension

Compact footer status for Pi sessions.

This extension is based on the official `status-line.ts` example, but adapted
as a practical status aggregator. It uses `ctx.ui.setStatus()` to show
cross-cutting session state in Pi's footer status area.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/statusline.ts"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the
`statusline` extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/statusline.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/statusline.ts
```

## Behavior

- Shows the current git branch when available.
- Shows the Pi session name when set.
- Shows the active provider/model in compact form.
- Shows context usage as a percentage or token count.
- Shows the current turn count.
- Shows whether the agent is running or ready.

Example:

```text
main · refactor auth · anthropic/sonnet-4 · ctx 42% · turn 3 · ● running
```

This extension does not replace mode-specific status segments from other
extensions. For example, `ask-mode`, `plan-mode`, and `sandbox` can still show
their own dedicated footer segments.

Git branch detection is cached briefly to avoid running `git` on every UI
render.

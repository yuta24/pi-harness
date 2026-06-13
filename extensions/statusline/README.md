# Statusline Extension

Persistent footer status demo for Pi.

This extension is based on the official `status-line.ts` example. It uses
`ctx.ui.setStatus()` to show turn progress in Pi's footer status area.

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

- On session start, the footer status shows `Ready`.
- On each turn start, it shows the current turn count.
- On each turn end, it marks that turn complete.

This extension does not run project-local scripts or replace the full footer.
For a full custom footer example, see the upstream `custom-footer.ts` example.

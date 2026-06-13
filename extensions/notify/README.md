# Notify Extension

Terminal notification when Pi finishes an agent turn and is ready for input.

This extension is based on the official `notify.ts` example. It listens for
`agent_end` and sends a native terminal notification using the best available
terminal protocol.

## Loading In This Harness

This repository registers the extension from the root `package.json`:

```json
{
  "pi": {
    "extensions": ["extensions/notify.ts"]
  }
}
```

After installing this harness, use `pi config` to enable or disable the
`notify` extension:

```sh
pi install git:github.com/yuta24/pi-harness
pi config
```

For local development, load this extension directly:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/notify.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/notify.ts
```

## Supported Notification Protocols

- OSC 777 for Ghostty, iTerm2, WezTerm, and rxvt-unicode
- OSC 99 for Kitty
- Windows toast notifications for Windows Terminal / WSL

## Behavior

On every `agent_end`, the extension sends:

```text
Pi: Ready for input
```

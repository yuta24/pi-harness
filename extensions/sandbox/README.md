# Sandbox Extension

OS-level sandboxing for Pi bash commands using `@anthropic-ai/sandbox-runtime`.

The extension replaces Pi's built-in `bash` tool with a sandboxed version after
session initialization. It also applies the same sandbox operations to user bash
commands when Pi emits the `user_bash` hook.

## Requirements

- macOS or Linux
- Node.js 18 or newer
- `@anthropic-ai/sandbox-runtime`
- Linux only: `bubblewrap`, `socat`, and `ripgrep`

## Install Dependencies

From this extension directory:

```sh
npm install
```

When loading the extension directly from this repository, installing from the
repository root also works because Node can resolve dependencies from the parent
`node_modules` directory:

```sh
cd /Users/yuta24/ghq/github.com/yuta24/pi-harness
npm install
```

## Load Locally

To test only this local sandbox extension:

```sh
pi --no-extensions -e /Users/yuta24/ghq/github.com/yuta24/pi-harness/extensions/sandbox/index.ts
```

From the repository root:

```sh
pi --no-extensions -e ./extensions/sandbox/index.ts
```

To load it in addition to normal extension discovery, omit `--no-extensions`:

```sh
pi -e ./extensions/sandbox/index.ts
```

## Disable For One Run

```sh
pi -e ./extensions/sandbox/index.ts --no-sandbox
```

Pi should show `Sandbox disabled via --no-sandbox` during startup.

## Configuration

Configuration is merged in this order, with later files taking precedence:

1. Built-in defaults
2. `~/.pi/agent/extensions/sandbox.json`
3. `<cwd>/.pi/sandbox.json`

Example `.pi/sandbox.json`:

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": [
      "github.com",
      "*.github.com",
      "api.github.com",
      "raw.githubusercontent.com"
    ],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.gnupg"],
    "allowWrite": [".", "/tmp"],
    "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
  }
}
```

## Verify It Is Active

Start Pi with the extension and check for these startup indicators:

- `Sandbox initialized`
- status text like `Sandbox: 10 domains, 2 write paths`

Inside Pi, run:

```text
/sandbox
```

When active, it prints the merged network and filesystem configuration. When
disabled, it prints `Sandbox is disabled`.

To verify enforcement, ask Pi to run a command that should be denied:

```text
ls ~/.ssh
```

or:

```text
echo test > .env
```

Then compare with an allowed write:

```text
echo ok > /tmp/pi-sandbox-check.txt
```

The denied examples should fail while the `/tmp` write should succeed.

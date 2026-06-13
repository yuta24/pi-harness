# Permission Gate Extension

Configurable allow/ask/deny gate for Pi tool calls.

By default, this extension does nothing. Add a config file to enable gates.

## Config Files

Config files are merged, with project-local config taking precedence:

- Global: `~/.pi/agent/extensions/permission-gate.json`
- Project-local: `.pi/permission-gate.json`

## Configuration

Rules are simple glob patterns. `*` matches any text, and `?` matches one
character.

Supported tools:

- `bash` matches the command text
- `edit` matches the target path
- `write` matches the target path

Actions:

- `deny`: always block
- `allow`: allow without asking
- `ask`: ask for confirmation in interactive mode; block in non-interactive mode

If multiple actions match, precedence is `deny` → `allow` → `ask`. If no rule
matches, the tool call is allowed.

Example `.pi/permission-gate.json`:

```json
{
  "bash": {
    "ask": ["sudo *", "rm -r *", "rm -rf *"],
    "deny": ["curl * | sh", "chmod 777 *"]
  },
  "edit": {
    "deny": [".env*", ".git/*", "node_modules/*"]
  },
  "write": {
    "deny": [".env*", ".git/*", "node_modules/*"]
  }
}
```

## Usage

Enable the extension via `pi config`, or load it directly:

```sh
pi -e extensions/permission-gate.ts
```

No additional setup is required.

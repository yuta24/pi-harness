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

For path-based tools, matching is done against multiple normalized forms of the
same path:

- the original path from the tool call
- an absolute path
- a path relative to the current working directory
- a `./`-prefixed relative path
- a `~`-relative path when the file is under the home directory

Supported tools:

- `bash` matches the command text
- `read` matches the target path
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
  "read": {
    "deny": [".env*", ".git/*", "node_modules/*"]
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

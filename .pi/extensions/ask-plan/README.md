# Pi Ask / Plan Mode Extension

Project-local Pi extension that adds read-only `ask` and `plan` modes.

## Commands

- `/ask` toggles ask mode for read-only Q&A.
- `/plan` toggles plan mode for read-only planning.
- `/execute-plan` executes the currently extracted plan.
- `/mode` shows current mode and plan progress.

CLI flags:

- `pi --ask`
- `pi --plan`

## Behavior

Ask and plan modes enable only `read`, `bash`, `grep`, `find`, and `ls`.
`edit` and `write` are blocked, and `bash` is restricted to read-only command
patterns.

Plan mode expects the assistant to produce numbered steps under a `Plan:`
header. In interactive sessions, Pi asks whether to execute, refine, or stay in
plan mode. Execution mode restores the previously active tools and tracks
`[DONE:n]` markers.

## Safety

This extension is a planning guard, not a security sandbox. It prevents common
write tools and destructive shell commands while ask/plan mode is active. The
project sandbox extension still provides OS-level restrictions for assistant
`bash` tool calls.

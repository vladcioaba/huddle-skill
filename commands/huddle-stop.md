---
description: Stop an active huddle session by id (kills the spawning process, marks stopped in state index).
argument-hint: <session-id>
---

# /huddle-stop

Cancel an active huddle session. Sends SIGTERM to the spawning shell process (if it's still alive), marks the session `stopped` in `~/.claude/state/huddle/index.json`. The editor window may remain open — closing it manually is fine; the bundle will not be persisted.

## Arguments

- `$1` (required): the session id, e.g. `huddle-1778362000-abc`. Get it from `/huddle-list`.

## Steps

1. If no id passed → tell user to provide one, suggest `/huddle-list` to find it. Exit.
2. Run:
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/state.js stop "$1"
   ```
3. If exit non-zero with "session not found" → confirm spelling, list active sessions.
4. Confirm to user: session `<id>` stopped. Mention editor window may still be open; closing it manually is harmless.

## Notes

- Stopping a session that already completed is a no-op (status updates from `done` → `stopped`; bundle file in the session dir is untouched).
- To purge a session from the registry entirely (delete the state dir contents):
  ```
  node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/state.js remove <id>
  ```
  This is destructive (loses the bundle.json archived in the session dir).

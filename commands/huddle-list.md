---
description: List active and recent huddle sessions tracked in ~/.claude/state/huddle/.
argument-hint: (no args, or --json for machine-readable)
---

# /huddle-list

Show all sessions registered by `lib/orchestrate.js` — active (`waiting_user`), completed (`done`), aborted (`stopped`), and orphaned (`stale`).

## Steps

1. Run:
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/state.js list
   ```
2. The output is a tab-separated table: `id | status | seq | Qs | title`. Render it back to the user as a readable list (one line per session, status-colored if you like).
3. If no sessions: tell the user the registry is empty and suggest `/huddle` to start one.
4. Mention `/huddle-stop <id>` to cancel an active session, `/huddle-show <id>` to inspect details (if/when that command exists).

## Notes

- Sessions marked `stale` had a `waiting_user` status but the spawning shell process is no longer alive. They were orphaned (terminal closed, crash, kill). Run `node …/lib/state.js prune` to refresh those before listing.
- Use `--json` (pass through to the underlying call) when the caller needs structured output.

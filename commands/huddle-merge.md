---
description: Mark a completed huddle session as merged into the main thread.
argument-hint: <session-id>
---

# /huddle-merge

Set `merged_at` on a `done` session. This is mostly bookkeeping — main Claude calls it after surfacing the bundle's answers in chat so the SessionStart hook doesn't keep reminding about already-handled bundles in future sessions.

## Arguments

- `$1` (required): the session id, e.g. `huddle-1778362000-abc`. Get from `/huddle-list`.

## Steps

1. If no id passed → tell user to provide one, suggest `/huddle-list`. Exit.
2. Run:
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/state.js merge "$1"
   ```
3. If exit non-zero with "session not found" → confirm spelling.
4. Confirm to user: session `<id>` marked merged.

## When main Claude should auto-invoke this

After `/huddle` returns a bundle and the answers are surfaced in chat (step 5 of `/huddle.md`), main Claude SHOULD invoke `state.js merge <id>` so the session no longer counts as "pending merge" in cross-session reminders.

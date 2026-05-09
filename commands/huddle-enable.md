---
description: Enable huddle auto-trigger (editor popup for large clarifications).
argument-hint: (no args)
---

# /huddle-enable

Sets `auto_trigger.enabled = true` in `~/.claude/skills/huddle/config.json`.

## Steps

1. Run `node ~/.claude/skills/huddle/lib/setup.js auto enable`.
2. If exit non-zero with "not configured" → tell user to run `/huddle-setup` first. Exit.
3. Confirm to user: auto-trigger ON. Show current threshold (default 4 questions / 800 chars).
4. Mention `/huddle-disable` to turn off, `/huddle-threshold N` to change cutoff.

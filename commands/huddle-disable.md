---
description: Disable huddle auto-trigger (always use inline terminal Q&A).
argument-hint: (no args)
---

# /huddle-disable

Sets `auto_trigger.enabled = false`. Main Claude will not spawn the editor popup automatically; it will ask questions inline (terminal/AskUserQuestion).

User can still invoke `/huddle` manually to force editor popup.

## Steps

1. Run `node ~/.claude/skills/huddle/lib/setup.js auto disable`.
2. Confirm to user: auto-trigger OFF.
3. Mention `/huddle-enable` to turn back on.

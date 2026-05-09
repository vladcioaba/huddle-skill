---
description: Force huddle routing — editor, inline, or off (use thresholds).
argument-hint: <editor|inline|off>
---

# /huddle-force

Override the threshold-based routing. Useful for one-off sessions where user wants:
- Always editor (e.g., expecting many sequential clarifications)
- Always inline (e.g., quick conversational mode, low-friction)
- Off / threshold-based (default)

## Arguments

- `$1` (required): one of `editor`, `inline`, `off` (or `none`).

## Examples

- `/huddle-force editor` → every clarification opens editor
- `/huddle-force inline` → every clarification stays in terminal
- `/huddle-force off` → revert to threshold-based decision

## Steps

1. Validate arg ∈ {editor, inline, off, none}. If invalid → error, show usage.
2. Run `node ~/.claude/skills/huddle/lib/setup.js auto force <arg>`.
3. Confirm to user: force mode set. Mention `/huddle-force off` to clear.

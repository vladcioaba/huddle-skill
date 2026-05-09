---
description: Set huddle auto-trigger threshold (questions count or total chars).
argument-hint: <questions:N> [chars:M]
---

# /huddle-threshold

Sets the threshold above which main Claude will route to the editor popup instead of inline terminal Q&A.

Two thresholds — either one fires:
- `threshold_questions`: question count (default 4)
- `threshold_chars`: sum of question + context characters (default 800)

## Arguments

- `$1` (required): question count threshold, integer ≥ 1.
- `$2` (optional): chars threshold, integer ≥ 1. Set with `chars:<N>` syntax for clarity.

## Examples

- `/huddle-threshold 6` → set question threshold to 6, leave chars unchanged
- `/huddle-threshold 3 chars:500` → set both
- `/huddle-threshold chars:1500` → set only chars threshold

## Steps

1. Parse args. Detect `chars:N` patterns. Plain integer = question threshold.
2. Validate each is positive integer.
3. Run as needed:
   - `node ~/.claude/skills/huddle/lib/setup.js auto threshold <N>` for questions
   - `node ~/.claude/skills/huddle/lib/setup.js auto chars <N>` for chars
4. Confirm to user: new thresholds applied. Show effective config via `/huddle-show-config`.

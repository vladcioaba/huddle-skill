---
description: Compute and display the assumption-vs-answer diff for a huddle session.
argument-hint: <session-id>
---

# /huddle-diff

Run after a huddle bundle returns. Diffs the user's answers against the assumptions main Claude snapshotted before spawning, classifies each into:

- `match` — assumption == answer. Silent merge.
- `refinement` — answer extends assumption without contradiction. Adopt.
- `rework` — answer contradicts assumption. Main thread may need to revisit code.
- `blocking` — answer contradicts AND the assumption drove an irreversible action (deploy, prod write). Halt + escalate.
- `unanswered` — no answer in bundle.

## Arguments

- `$1` (required): session id, get it from `/huddle-list`.

## Steps

1. If no id passed → tell user to provide one, suggest `/huddle-list`.
2. Run:
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/diff.js compute "$1"
   ```
3. If error like "bundle.json not found" — session is still active or wasn't tracked. Tell user.
4. If error like "assumptions.json not found" — main Claude didn't snapshot before spawning. The skill works without snapshots, but the diff requires them. Tell user `merge_clean` is the assumed action.
5. Parse the JSON `counts` and `recommend_action`:
   - `merge_clean` → answers align with assumptions, just proceed.
   - `rollback_and_revisit` → surface each `rework`/`blocking` item with `decisions_to_revisit` and `paths_affected`. Ask user how to rollback.
   - `ask_user` → some questions unanswered. Ask user whether to re-open the form, proceed with assumptions, or abort.
   - `noop` → nothing to do.
6. After the user decides, run `/huddle-merge <id>` to mark the session as resolved.

## Output rendering

Group items by severity. Example:

```
[match] Q1: JWT → JWT ✓
[refinement] Q2: weekly → weekly (rotate keys every 7 days exactly)
[rework] Q3: assumed "current only" but user answered "all device sessions"
   paths affected: src/auth/logout.ts
   decisions to revisit: src/auth/logout.ts:55 (single-session revoke)
[unanswered] Q4: typed /SKIP
```

End with the recommended action and ask the user.

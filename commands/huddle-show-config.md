---
description: Print the current huddle editor config.
argument-hint: (no args)
---

# /huddle-show-config

Print the current huddle configuration to the user.

## Steps

1. Run `~/.claude/skills/huddle/lib/setup.sh status`.
2. If output is `unconfigured` → tell user no config yet, suggest `/huddle-setup`. Exit.
3. Run `~/.claude/skills/huddle/lib/setup.sh show`.
4. Render the JSON in a readable form to the user:

```
Editor: <label>
Command: <cmd>
Kind: <gui|term>
Wait method: <native|mtime_poll>
Configured: <configured_at>
Config path: <output of `setup.sh path`>
```

5. Mention `/huddle-setup` to re-run picker, `/huddle-set-editor` for manual override.

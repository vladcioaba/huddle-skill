---
description: Configure preferred editor for huddle sessions (first-run or re-run).
argument-hint: (no args)
---

# /huddle-setup

Run editor probe. Present detected editors via `AskUserQuestion`. Validate selection with a dry-run timing test. Save to `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/config.json`.

## Steps

1. Run `node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js probe 4` — get top 4 detected editors as JSON.
2. Parse the JSON. Build an `AskUserQuestion` call with those editors as options. Each option label = `editor.label`, description = `editor.cmd` + kind. Cap at 4 options (the tool's max).
3. If JSON is empty array → tell user no supported editors found. Suggest installing one of: VSCode, Sublime, Neovim, Vim, Nano. Exit.
4. After user picks, optionally run `${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js validate "<cmd>"` to dry-run timing. If `wait_method` returned is `mtime_poll` and the editor's metadata says `native`, override to `mtime_poll` in the save call.
5. Run `node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js save "<cmd>" "<label>" "<kind>" "<wait_method>"`.
6. **Activate the [HUDDLE] statusline indicator** so the user can see when sessions are open or idle:
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js statusline install
   ```
   This patches `~/.claude/settings.json` `statusLine.command`. The installer auto-detects an existing caveman statusline and chains both (`[CAVEMAN] [HUDDLE]`); pass `--no-chain` to override. Backs up the prior settings file with a `.bak-pre-huddle-<ts>` suffix. Idempotent — skipping if already wired.
7. Confirm to user: editor configured + statusline activated. Mention:
   - `/huddle-set-editor` to change editor later.
   - `/huddle-statusline-uninstall` (or `node …/lib/setup.js statusline uninstall`) to remove the indicator.

## Skip validation step?

Validation opens the editor for real. Useful but slow. Default: skip unless user added `--validate` to the slash command. Can be added later.

## Idempotent

Running `/huddle-setup` again overwrites the saved editor. No backup needed (config is small + reproducible).

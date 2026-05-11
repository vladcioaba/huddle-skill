---
description: Install, uninstall, or show the [HUDDLE] statusline indicator in ~/.claude/settings.json.
argument-hint: install [--chain|--no-chain] | uninstall | show
---

# /huddle-statusline

Manage the `[HUDDLE]` statusline badge. The badge appears at the bottom of Claude Code (next to `[CAVEMAN]` if caveman is installed) and reflects current session state:

- `[HUDDLE]` blue — skill configured, idle
- `[HUDDLE:N]` yellow — N forms open and waiting for the user

## Arguments

- `install` (default if no arg) — patches `~/.claude/settings.json` `statusLine.command` to invoke `huddle-statusline.sh`. Auto-detects existing caveman statusline and chains both unless `--no-chain` is passed.
- `uninstall` — removes the `statusLine` entry if it currently points at huddle. Safe no-op if it points elsewhere.
- `show` — prints the current `statusLine` JSON.

## Steps

1. Default action (no arg or `install`): run
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js statusline install
   ```
   The installer creates a `~/.claude/settings.json.bak-pre-huddle-<ts>` backup before writing.
2. `--chain` forces chaining caveman regardless of detection. `--no-chain` forces huddle-only.
3. `uninstall` action: run
   ```
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js statusline uninstall
   ```
4. `show`: print current statusLine for verification.
5. Confirm to user. Note that the statusline refreshes on next Claude Code session start (or next statusline rerender within the current session).

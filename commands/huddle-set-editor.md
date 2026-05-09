---
description: Manually set the huddle editor command (power-user override).
argument-hint: <command> [label]
---

# /huddle-set-editor

Direct override of the huddle editor without running the picker. Use when:

- Editor is installed but not on the auto-probe list.
- Custom flags needed (e.g., `code --wait --new-window`).
- Scripted re-config.

## Arguments

- `$1` (required): full command including any wait/block flag, e.g. `code --wait`.
- `$2` (optional): human-readable label. If absent, use first word of the command.

## Steps

1. If no `$1` provided → tell user to pass a command, e.g. `/huddle-set-editor code --wait`. Exit.
2. Determine the binary: first whitespace-delimited token of `$1`. Verify with `command -v <bin>`. If missing → warn user, ask whether to save anyway. Default: refuse, exit.
3. Determine `kind`:
   - GUI hint: command contains `--wait`, `-w`, or known GUI binary names (`code`, `cursor`, `subl`, `zed`, `mate`, `bbedit`, `idea`, `gedit`, `kate`).
   - Otherwise → `term`.
4. Determine `wait_method`:
   - If command contains `--wait`, `-w`, `--block`, or binary is `vim/nvim/hx/nano/micro/emacs` → `native`.
   - If binary is `notepad++` or no wait flag detected on a GUI editor → `mtime_poll`.
5. Run `~/.claude/skills/huddle/lib/setup.sh save "<cmd>" "<label>" "<kind>" "<wait_method>"`.
6. Confirm to user: command saved + how to test (`/huddle-show-config`).

## Examples

- `/huddle-set-editor code --wait` → label "code", kind "gui", wait_method "native"
- `/huddle-set-editor "subl -w -n"` → label "subl", kind "gui", wait_method "native"
- `/huddle-set-editor nvim Neovim` → label "Neovim", kind "term", wait_method "native"
- `/huddle-set-editor "notepad++"` → label "notepad++", kind "gui", wait_method "mtime_poll"

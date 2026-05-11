# Huddle

Async clarification skill for Claude Code. When Claude needs many answers, spawn a sub-agent that opens your preferred editor with a Q&A markdown form. Answer inline, save+close, sub-agent validates and returns a structured bundle to the main thread.

Standalone — no dependency on caveman or any other skill.

## Requirements

- Node.js ≥ 18 (Claude Code already ships with Node)
- A text editor: VSCode, Sublime, Cursor, Zed, Neovim, Vim, Nano, etc. Auto-detected on first run.

## Install

### Option A — as a Claude Code plugin (recommended)

Plugins auto-register hooks and pre-allow internal Bash patterns, so you won't be prompted for permission on every `node` call inside the skill.

```bash
claude plugins install vladcioaba/huddle-skill
```

After install, restart Claude Code (or run `claude plugins list` to confirm).

### Option B — as a bare skill (symlink)

```bash
git clone https://github.com/vladcioaba/huddle-skill.git ~/code/huddle
ln -s ~/code/huddle ~/.claude/skills/huddle
```

Or symlink from wherever the source lives:

```bash
ln -s /path/to/huddle ~/.claude/skills/huddle
```

Restart Claude Code so the skill registry refreshes. Note: bare-skill installs will prompt for Bash permission on each internal `node` call unless you add the patterns from `.claude-plugin/plugin.json` (`permissions.allow`) to your `~/.claude/settings.json` manually.

## First run

```
/huddle-setup
```

Detects installed editors, asks which to use, validates, writes `config.json`. Idempotent — re-run anytime.

## Slash commands

| Command | Effect |
|---------|--------|
| `/huddle` | Spawn an editor session for current ambiguities (planned) |
| `/huddle-setup` | Pick editor (first-run or re-config) |
| `/huddle-show-config` | Print current config |
| `/huddle-set-editor <cmd>` | Manual editor override |
| `/huddle-enable` | Auto-trigger on (editor for big clarifications) |
| `/huddle-disable` | Auto-trigger off (always inline terminal) |
| `/huddle-threshold <N>` | Question count cutoff |
| `/huddle-force editor\|inline\|off` | Override threshold logic |

## Statusline badge

Show `[HUDDLE]` in the Claude Code statusline (like the `[CAVEMAN]` badge) so you know the skill is active and how many sessions are open.

States:
- `[HUDDLE]` (blue) — skill configured, no active or pending bundles
- `[HUDDLE:N]` (yellow) — N sessions are open and waiting for the user to fill the form
- `[HUDDLE:done]` (green) — one or more completed bundles haven't been merged back into the main thread yet

Add the following to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash $HOME/.claude/skills/huddle/hooks/huddle-statusline.sh"
  }
}
```

To **chain with the caveman badge** (recommended if both plugins are installed):

```json
{
  "statusLine": {
    "type": "command",
    "command": "HUDDLE_STATUSLINE_CHAIN_CAVEMAN=1 bash $HOME/.claude/skills/huddle/hooks/huddle-statusline.sh"
  }
}
```

Renders `[CAVEMAN] [HUDDLE]` side by side. The script auto-locates caveman under `~/.claude/plugins/marketplaces/` or `~/.claude/plugins/cache/`.

On native Windows (no WSL/Git Bash), use the PowerShell variant:

```json
{
  "statusLine": {
    "type": "command",
    "command": "pwsh -NoProfile -File %USERPROFILE%\\.claude\\skills\\huddle\\hooks\\huddle-statusline.ps1"
  }
}
```

## Auto-trigger logic

Before asking 2+ clarifying questions, main Claude consults:

```
node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/setup.js auto decide <question_count> <total_chars>
→ "editor" | "inline" | "disabled"
```

Defaults: 4+ questions OR 800+ total chars → editor; else inline.

## Question schema

```json
{
  "qid": "Q1",
  "question": "Use JWT or session tokens?",
  "context": "existing infra uses JWT",
  "assumed": "JWT",
  "panel": "text"
}
```

`panel` defaults to `text`. Future planned: `checkbox`, `radio`, `image_picker`, `diagram` — drop new files in `lib/panels/<type>.js` and register.

## Config

`~/.claude/skills/huddle/config.json` — written by `/huddle-setup`. Gitignored. Schema documented in `SKILL.md`.

## Status

| Component | Status |
|-----------|--------|
| Editor probe + first-run setup | ✓ shipped |
| Auto-trigger toggles | ✓ shipped |
| Template + parser + validator | ✓ shipped |
| Panel registry + text panel | ✓ shipped |
| Slash commands | ✓ 7 shipped |
| Sync `/huddle` runner | planned |
| Async background spawn | planned |
| Assumption snapshot + merge | planned |
| Hooks (Stop / SessionStart) | planned |
| Other panels (checkbox, image, diagram) | planned |

## Cross-platform

All code is Node.js (no bash, no jq). Tested on macOS. Designed for Linux + Windows (native or WSL). Editor probe checks PATH + macOS app bundles + Windows Program Files.

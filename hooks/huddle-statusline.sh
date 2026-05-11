#!/bin/bash
# huddle — statusline badge script for Claude Code.
# Reads ~/.claude/state/huddle/index.json and outputs a colored badge.
# Optionally chains the caveman statusline if HUDDLE_STATUSLINE_CHAIN_CAVEMAN=1.
#
# Usage in ~/.claude/settings.json:
#   "statusLine": {
#     "type": "command",
#     "command": "bash /path/to/huddle/hooks/huddle-statusline.sh"
#   }
#
# Chain with caveman (both badges visible) by setting in your environment or
# before the command:
#   HUDDLE_STATUSLINE_CHAIN_CAVEMAN=1 bash .../huddle-statusline.sh
# The script auto-detects the common caveman install paths.

# --- chain caveman if requested ---
if [ "${HUDDLE_STATUSLINE_CHAIN_CAVEMAN:-0}" = "1" ]; then
  CAVEMAN_PATH=""
  # 1. explicit override
  if [ -n "${CAVEMAN_STATUSLINE:-}" ] && [ -f "$CAVEMAN_STATUSLINE" ] && [ ! -L "$CAVEMAN_STATUSLINE" ]; then
    CAVEMAN_PATH="$CAVEMAN_STATUSLINE"
  fi
  # 2. known marketplace install path (stable)
  if [ -z "$CAVEMAN_PATH" ]; then
    p="$HOME/.claude/plugins/marketplaces/caveman/hooks/caveman-statusline.sh"
    [ -f "$p" ] && [ ! -L "$p" ] && CAVEMAN_PATH="$p"
  fi
  # 3. versioned cache path (hash-suffixed) — pick newest
  if [ -z "$CAVEMAN_PATH" ]; then
    p=$(ls -td "$HOME"/.claude/plugins/cache/caveman/*/*/hooks/caveman-statusline.sh 2>/dev/null | head -1)
    [ -n "$p" ] && [ -f "$p" ] && [ ! -L "$p" ] && CAVEMAN_PATH="$p"
  fi
  if [ -n "$CAVEMAN_PATH" ]; then
    bash "$CAVEMAN_PATH"
    printf ' '
  fi
fi

# --- huddle badge ---
STATE_DIR="${HUDDLE_STATE_DIR:-$HOME/.claude/state/huddle}"
INDEX="$STATE_DIR/index.json"

# Always render [HUDDLE] when the skill is configured, regardless of active sessions.
# Suppress entirely if neither the skill nor the state dir exists (avoids ghost badge
# on systems where the user hasn't enabled huddle yet).
CONFIG="$HOME/.claude/skills/huddle/config.json"
[ ! -f "$CONFIG" ] && [ ! -f "$INDEX" ] && exit 0

ACTIVE=0
if [ -f "$INDEX" ] && [ ! -L "$INDEX" ]; then
  # Count occurrences (handles compact and pretty JSON).
  ACTIVE=$(grep -oE '"status":[[:space:]]*"waiting_user"' "$INDEX" 2>/dev/null | wc -l | tr -d ' ')
  ACTIVE=${ACTIVE:-0}
fi

# Color: blue base (39) when idle, yellow (220) with count when sessions are live.
# No persistent "done" badge — completed bundles surface in chat once and don't need
# a lingering statusline indicator.
if [ "${ACTIVE:-0}" -gt 0 ]; then
  printf '\033[38;5;220m[HUDDLE:%d]\033[0m' "$ACTIVE"
else
  printf '\033[38;5;39m[HUDDLE]\033[0m'
fi

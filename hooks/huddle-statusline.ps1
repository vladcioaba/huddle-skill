# huddle — statusline badge script (PowerShell, for native Windows).
# Reads %USERPROFILE%\.claude\state\huddle\index.json and outputs a colored badge.
#
# Usage in %USERPROFILE%\.claude\settings.json:
#   "statusLine": {
#     "type": "command",
#     "command": "pwsh -NoProfile -File C:\\path\\to\\huddle\\hooks\\huddle-statusline.ps1"
#   }
#
# Chain with caveman by setting $env:HUDDLE_STATUSLINE_CHAIN_CAVEMAN = "1".

$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".claude" }
$stateDir  = if ($env:HUDDLE_STATE_DIR) { $env:HUDDLE_STATE_DIR } else { Join-Path $claudeDir "state\huddle" }
$indexPath = Join-Path $stateDir "index.json"
$configPath = Join-Path $claudeDir "skills\huddle\config.json"

# Chain caveman if requested.
if ($env:HUDDLE_STATUSLINE_CHAIN_CAVEMAN -eq "1") {
  $cavemanPath = Join-Path $claudeDir "plugins\caveman\hooks\caveman-statusline.ps1"
  if (Test-Path $cavemanPath -PathType Leaf) {
    & $cavemanPath
    Write-Host -NoNewline " "
  }
}

# Suppress entirely if neither config nor state dir exists.
if (-not (Test-Path $configPath -PathType Leaf) -and -not (Test-Path $indexPath -PathType Leaf)) {
  exit 0
}

$active = 0
$doneUnmerged = 0
if (Test-Path $indexPath -PathType Leaf) {
  try {
    $idx = Get-Content $indexPath -Raw -ErrorAction Stop | ConvertFrom-Json
    foreach ($s in $idx.sessions) {
      if ($s.status -eq "waiting_user") { $active++ }
      elseif ($s.status -eq "done" -and -not $s.merged_at) { $doneUnmerged++ }
    }
  } catch {
    # Malformed index → skip count, still emit base badge.
  }
}

# ANSI color via Write-Host -ForegroundColor (limited to base 16) — use raw escapes for 256-color match with bash script.
$ESC = [char]27
if ($active -gt 0) {
  Write-Host -NoNewline "$ESC[38;5;220m[HUDDLE:$active]$ESC[0m"
} elseif ($doneUnmerged -gt 0) {
  Write-Host -NoNewline "$ESC[38;5;40m[HUDDLE:done]$ESC[0m"
} else {
  Write-Host -NoNewline "$ESC[38;5;39m[HUDDLE]$ESC[0m"
}

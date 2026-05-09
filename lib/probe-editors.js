#!/usr/bin/env node
// probe-editors.js — detect installed editors with --wait capability.
// Output: JSON array on stdout. Exit 0 always (empty array if nothing found).
//
// Cross-platform: macOS / Linux / Windows. No external deps.

import { existsSync } from "node:fs";
import { platform } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const PLATFORM = platform(); // 'darwin' | 'linux' | 'win32' | ...
const IS_WIN = PLATFORM === "win32";
const IS_MAC = PLATFORM === "darwin";

// Editor catalog. `binCandidates` covers PATH lookup AND macOS app bundle paths.
// `cmd` is the saved-config form using the first detected location.
const CATALOG = [
  // GUI — cross-platform
  {
    label: "VSCode",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["code", "code.cmd"],
    macAppPaths: [
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    ],
    waitFlag: "--wait",
  },
  {
    label: "Cursor",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["cursor", "cursor.cmd"],
    macAppPaths: [
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    ],
    waitFlag: "--wait",
  },
  {
    label: "Sublime Text",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["subl", "subl.exe"],
    macAppPaths: [
      "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl",
    ],
    waitFlag: "-w",
  },
  {
    label: "Zed",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["zed"],
    macAppPaths: ["/Applications/Zed.app/Contents/MacOS/cli"],
    waitFlag: "--wait",
  },
  {
    label: "TextMate",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["mate"],
    macAppPaths: ["/Applications/TextMate.app/Contents/Resources/mate"],
    waitFlag: "-w",
    onlyOn: ["darwin"],
  },
  {
    label: "BBEdit",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["bbedit"],
    macAppPaths: ["/usr/local/bin/bbedit"],
    waitFlag: "-w",
    onlyOn: ["darwin"],
  },
  {
    label: "IntelliJ IDEA",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["idea", "idea.exe"],
    waitFlag: "--wait",
  },
  {
    label: "PyCharm",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["pycharm", "pycharm.exe"],
    waitFlag: "--wait",
  },
  {
    label: "WebStorm",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["webstorm", "webstorm.exe"],
    waitFlag: "--wait",
  },
  {
    label: "Notepad++",
    kind: "gui",
    waitMethod: "mtime_poll",
    binCandidates: ["notepad++", "notepad++.exe"],
    winAppPaths: [
      "C:\\Program Files\\Notepad++\\notepad++.exe",
      "C:\\Program Files (x86)\\Notepad++\\notepad++.exe",
    ],
    extraArgs: ["-multiInst", "-nosession"],
    onlyOn: ["win32"],
  },
  {
    label: "Notepad",
    kind: "gui",
    waitMethod: "mtime_poll",
    binCandidates: ["notepad.exe", "notepad"],
    onlyOn: ["win32"],
  },
  {
    label: "gedit",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["gedit"],
    waitFlag: "--standalone --wait",
    onlyOn: ["linux"],
  },
  {
    label: "Kate",
    kind: "gui",
    waitMethod: "native",
    binCandidates: ["kate"],
    waitFlag: "--block",
    onlyOn: ["linux"],
  },
  // Terminal — cross-platform
  { label: "Helix", kind: "term", waitMethod: "native", binCandidates: ["hx"] },
  {
    label: "Neovim",
    kind: "term",
    waitMethod: "native",
    binCandidates: ["nvim", "nvim.exe"],
  },
  {
    label: "Vim",
    kind: "term",
    waitMethod: "native",
    binCandidates: ["vim", "vim.exe"],
  },
  { label: "Micro", kind: "term", waitMethod: "native", binCandidates: ["micro"] },
  {
    label: "Nano",
    kind: "term",
    waitMethod: "native",
    binCandidates: ["nano", "nano.exe"],
  },
  {
    label: "Emacs",
    kind: "term",
    waitMethod: "native",
    binCandidates: ["emacs"],
    extraArgs: ["-nw"],
  },
];

function whichBin(name) {
  // Cross-platform `which`-style PATH walk. No shell invocation → no injection risk
  // even if CATALOG ever contains a name with shell metacharacters.
  const PATH = process.env.PATH || "";
  const sep = IS_WIN ? ";" : ":";
  const dirs = PATH.split(sep).filter(Boolean);
  const exts = IS_WIN
    ? [
        "",
        ...((process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((e) => e.toLowerCase())),
      ]
    : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        if (existsSync(candidate)) return candidate;
      } catch {
        // ignore permission errors and continue
      }
    }
  }
  return null;
}

function findEditor(entry) {
  if (entry.onlyOn && !entry.onlyOn.includes(PLATFORM)) return null;

  // 1. PATH probe
  for (const bin of entry.binCandidates) {
    const found = whichBin(bin);
    if (found) {
      return buildResult(entry, found, bin);
    }
  }

  // 2. macOS app bundle paths
  if (IS_MAC && entry.macAppPaths) {
    for (const p of entry.macAppPaths) {
      if (existsSync(p)) {
        return buildResult(entry, p, basename(p));
      }
    }
  }

  // 3. Windows app paths
  if (IS_WIN && entry.winAppPaths) {
    for (const p of entry.winAppPaths) {
      if (existsSync(p)) {
        return buildResult(entry, p, basename(p));
      }
    }
  }

  return null;
}

function buildResult(entry, fullPath, bin) {
  const parts = [];
  // Quote path if it contains spaces.
  parts.push(fullPath.includes(" ") ? `"${fullPath}"` : fullPath);
  if (entry.waitFlag) parts.push(entry.waitFlag);
  if (entry.extraArgs) parts.push(...entry.extraArgs);
  return {
    bin,
    path: fullPath,
    cmd: parts.join(" "),
    label: entry.label,
    kind: entry.kind,
    waitMethod: entry.waitMethod,
  };
}

export function probe() {
  const found = [];
  for (const entry of CATALOG) {
    const result = findEditor(entry);
    if (result) found.push(result);
  }

  // Re-rank: prefer $VISUAL/$EDITOR match, then GUI on display, then terminal.
  const hasDisplay =
    IS_MAC ||
    !!process.env.DISPLAY ||
    !!process.env.WAYLAND_DISPLAY ||
    IS_WIN;

  const preferredBin = (() => {
    const env = process.env.VISUAL || process.env.EDITOR || "";
    if (!env) return null;
    return basename(env.split(/\s+/)[0]).replace(/\.(exe|cmd)$/, "");
  })();

  return found.sort((a, b) => rank(a) - rank(b));

  function rank(item) {
    const itemBin = item.bin.replace(/\.(exe|cmd)$/, "");
    let r = 100;
    if (preferredBin && itemBin === preferredBin) r = 0;
    if (item.kind === "gui" && hasDisplay) r += 1;
    else if (item.kind === "term") r += 2;
    else r += 3;
    return r;
  }
}

function isCliEntry() {
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliEntry()) {
  const result = probe();
  console.log(JSON.stringify(result));
}

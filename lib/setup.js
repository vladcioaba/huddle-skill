#!/usr/bin/env node
// setup.js — huddle first-run config CRUD + orchestration.
//
// Modes:
//   setup.js probe [N]                       → top-N detected editors as JSON
//   setup.js validate <cmd>                  → dry-run editor; {waitMethod, elapsedSeconds}
//   setup.js save <cmd> <label> <kind> <waitMethod>
//                                            → write config.json (preserves existing subagent block)
//   setup.js show                            → print current config (or "{}" if none)
//   setup.js path                            → print config.json path
//   setup.js status                          → "configured" | "unconfigured"

import { spawn, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { probe } from "./probe-editors.js";

const SKILL_DIR =
  process.env.HUDDLE_SKILL_DIR ||
  join(homedir(), ".claude", "skills", "huddle");
const CONFIG_FILE = join(SKILL_DIR, "config.json");

const DEFAULT_SUBAGENT = {
  model: "haiku",
  max_iterations: 5,
  semantic_validation: true,
};

const DEFAULT_AUTO_TRIGGER = {
  enabled: true,
  threshold_questions: 4,
  threshold_chars: 800,
  force_inline: false,
  force_editor: false,
};

const DEFAULT_TEMPLATE = {
  wrap_width: 80,
  indent_width: 2,
  default_title: "Clarifications needed",
};

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function saveConfig({ cmd, label, kind, waitMethod }) {
  if (!existsSync(SKILL_DIR)) mkdirSync(SKILL_DIR, { recursive: true });
  const existing = loadConfig();
  const subagent = existing?.subagent ?? DEFAULT_SUBAGENT;
  const auto_trigger = existing?.auto_trigger ?? DEFAULT_AUTO_TRIGGER;
  const template = { ...DEFAULT_TEMPLATE, ...(existing?.template ?? {}) };
  const config = {
    version: 1,
    editor: {
      cmd,
      label,
      kind,
      wait_method: waitMethod,
      tty_check: existing?.editor?.tty_check ?? true,
      idle_warn_ms: existing?.editor?.idle_warn_ms ?? DEFAULT_IDLE_WARN_MS,
      idle_kill_ms: existing?.editor?.idle_kill_ms ?? DEFAULT_IDLE_KILL_MS,
      configured_at: new Date().toISOString(),
    },
    fallback: existing?.fallback ?? [],
    format: "markdown",
    subagent,
    auto_trigger,
    template,
    first_run_complete: true,
  };
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, CONFIG_FILE);
  return CONFIG_FILE;
}

export function configStatus() {
  const c = loadConfig();
  return c?.first_run_complete === true ? "configured" : "unconfigured";
}

export function setAutoTrigger(patch) {
  const existing = loadConfig();
  if (!existing) {
    throw new Error("huddle not configured — run /huddle-setup first");
  }
  const auto_trigger = { ...DEFAULT_AUTO_TRIGGER, ...existing.auto_trigger, ...patch };
  // force_inline + force_editor mutually exclusive — last write wins.
  if (patch.force_inline === true) auto_trigger.force_editor = false;
  if (patch.force_editor === true) auto_trigger.force_inline = false;
  const config = { ...existing, auto_trigger };
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, CONFIG_FILE);
  return auto_trigger;
}

export function decideRoute({ questionCount, totalChars }) {
  // Returns "editor" | "inline" | "disabled".
  const c = loadConfig();
  const at = c?.auto_trigger ?? DEFAULT_AUTO_TRIGGER;
  if (at.enabled === false) return "disabled";
  if (at.force_inline) return "inline";
  if (at.force_editor) return "editor";
  if (questionCount >= at.threshold_questions) return "editor";
  if (totalChars >= at.threshold_chars) return "editor";
  return "inline";
}

const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const HUDDLE_STATUSLINE_SCRIPT = "$HOME/.claude/skills/huddle/hooks/huddle-statusline.sh";
const HUDDLE_STATUSLINE_MARKER = "huddle-statusline.sh";

function readClaudeSettings() {
  if (!existsSync(CLAUDE_SETTINGS)) return {};
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
  } catch (e) {
    throw new Error(`failed to parse ${CLAUDE_SETTINGS}: ${e.message}`);
  }
}

function writeClaudeSettings(obj) {
  const tmp = `${CLAUDE_SETTINGS}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  renameSync(tmp, CLAUDE_SETTINGS);
}

function detectCavemanStatusline(currentCmd) {
  if (!currentCmd) return false;
  return /caveman-statusline\.(sh|ps1)/.test(currentCmd);
}

export function installStatusline({ chainCaveman = "auto" } = {}) {
  // chainCaveman: true | false | "auto" — "auto" detects from current statusLine.
  const settings = readClaudeSettings();
  const existingCmd = settings.statusLine?.command ?? null;

  let chain;
  if (chainCaveman === "auto") {
    chain = detectCavemanStatusline(existingCmd);
  } else {
    chain = Boolean(chainCaveman);
  }

  // Skip if already pointing at huddle's script.
  if (existingCmd && existingCmd.includes(HUDDLE_STATUSLINE_MARKER)) {
    return { skipped: true, reason: "statusLine already points at huddle script", current: existingCmd };
  }

  // Backup once per install attempt — only if file exists.
  if (existsSync(CLAUDE_SETTINGS)) {
    const backup = `${CLAUDE_SETTINGS}.bak-pre-huddle-${Date.now()}`;
    writeFileSync(backup, readFileSync(CLAUDE_SETTINGS));
  }

  const newCmd = chain
    ? `HUDDLE_STATUSLINE_CHAIN_CAVEMAN=1 bash "${HUDDLE_STATUSLINE_SCRIPT}"`
    : `bash "${HUDDLE_STATUSLINE_SCRIPT}"`;

  settings.statusLine = { type: "command", command: newCmd };
  writeClaudeSettings(settings);
  return { installed: true, chained: chain, previous: existingCmd, current: newCmd };
}

export function uninstallStatusline() {
  const settings = readClaudeSettings();
  const cmd = settings.statusLine?.command;
  if (!cmd || !cmd.includes(HUDDLE_STATUSLINE_MARKER)) {
    return { skipped: true, reason: "statusLine not pointing at huddle" };
  }
  delete settings.statusLine;
  writeClaudeSettings(settings);
  return { uninstalled: true, removed: cmd };
}

export function setTemplate(patch) {
  const existing = loadConfig();
  if (!existing) {
    throw new Error("huddle not configured — run /huddle-setup first");
  }
  const template = { ...DEFAULT_TEMPLATE, ...existing.template, ...patch };
  if (template.wrap_width < 20) template.wrap_width = 20;
  if (template.indent_width < 0) template.indent_width = 0;
  const config = { ...existing, template };
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, CONFIG_FILE);
  return template;
}

function tokenizeCommand(cmdString) {
  // Naive shell-like tokenizer that respects single/double quotes.
  // Sufficient for editor cmd strings; we control the input shape via probe/save.
  const tokens = [];
  let buf = "";
  let quote = null;
  for (let i = 0; i < cmdString.length; i++) {
    const ch = cmdString[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

const DEFAULT_IDLE_WARN_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_IDLE_KILL_MS = 30 * 60 * 1000; // 30 min
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 s

// Async editor launcher with three reliability guarantees:
//
//   1. TTY guard — refuses to launch a terminal-kind editor (vim, nano, etc.)
//      when stdin/stdout aren't real TTYs (Claude Code Bash tool, CI, pipe).
//      Without a TTY the editor hangs invisibly. Return `exitReason: "no_tty"`.
//
//   2. Exit listener — uses `spawn` (not spawnSync) + a Promise; resolves
//      cleanly when the editor process exits OR errors. No more silent
//      indefinite blocking on a dead editor.
//
//   3. Heartbeat — polls every 30s. If the file mtime hasn't advanced for
//      `idle_kill_ms` (default 30 min) AND the process is still alive, send
//      SIGTERM and resolve with `exitReason: "idle_timeout"`. After
//      `idle_warn_ms` (default 5 min) of idle, log a warning to stderr but
//      don't kill (user might be thinking).
//
// Opts: { editorKind, ttyCheck, idleWarnMs, idleKillMs }.
// Returns: { exitCode, elapsedSeconds, error, exitReason }.
//   exitReason ∈ "editor_closed" | "spawn_error" | "no_tty" | "idle_timeout"
export function launchEditor(cmdString, file, opts = {}) {
  const tokens = tokenizeCommand(cmdString);
  const bin = tokens[0];
  const args = [...tokens.slice(1), file];
  const editorKind = opts.editorKind ?? "gui";
  const ttyCheck = opts.ttyCheck !== false;
  const idleWarnMs = opts.idleWarnMs ?? DEFAULT_IDLE_WARN_MS;
  const idleKillMs = opts.idleKillMs ?? DEFAULT_IDLE_KILL_MS;

  // 1. TTY guard
  if (ttyCheck && editorKind === "term") {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return Promise.resolve({
        exitCode: null,
        elapsedSeconds: 0,
        error: `terminal editor "${bin}" requires an interactive TTY but stdin/stdout aren't TTYs. Likely launched under Claude Code Bash, an agent, CI, or a pipe. Switch to a GUI editor via /huddle-set-editor, or invoke from a real terminal.`,
        exitReason: "no_tty",
      });
    }
  }

  const start = Date.now();
  let initialMtime;
  try {
    initialMtime = statSync(file).mtimeMs;
  } catch {
    initialMtime = start;
  }
  let lastChangeMs = start;
  let warnedIdle = false;

  return new Promise((resolve) => {
    let settled = false;
    let interval = null;
    let child;

    const finish = (exitReason, exitCode, error = null) => {
      if (settled) return;
      settled = true;
      if (interval) clearInterval(interval);
      resolve({
        exitCode,
        elapsedSeconds: Math.round((Date.now() - start) / 1000),
        error,
        exitReason,
      });
    };

    try {
      child = spawn(bin, args, { stdio: "inherit" });
    } catch (e) {
      finish("spawn_error", null, String(e && e.message ? e.message : e));
      return;
    }

    child.on("exit", (code) => {
      finish("editor_closed", code);
    });
    child.on("error", (e) => {
      finish("spawn_error", null, String(e && e.message ? e.message : e));
    });

    // 3. Heartbeat — only run if at least one threshold is positive.
    if ((idleWarnMs && idleWarnMs > 0) || (idleKillMs && idleKillMs > 0)) {
      interval = setInterval(() => {
        if (settled) return;
        // process liveness — exit handler will fire if dead, but double-check
        try {
          process.kill(child.pid, 0);
        } catch {
          return;
        }
        let m;
        try {
          m = statSync(file).mtimeMs;
        } catch {
          return;
        }
        if (m !== initialMtime) {
          initialMtime = m;
          lastChangeMs = Date.now();
          warnedIdle = false;
        }
        const idleFor = Date.now() - lastChangeMs;
        if (idleKillMs > 0 && idleFor > idleKillMs) {
          try {
            process.kill(child.pid, "SIGTERM");
          } catch {}
          finish(
            "idle_timeout",
            null,
            `editor idle ${Math.round(idleFor / 60000)} min — SIGTERM sent`,
          );
        } else if (!warnedIdle && idleWarnMs > 0 && idleFor > idleWarnMs) {
          warnedIdle = true;
          process.stderr.write(
            `[huddle] editor idle ${Math.round(idleFor / 60000)} min (no save). Will SIGTERM at ${Math.round(idleKillMs / 60000)} min.\n`,
          );
        }
      }, HEARTBEAT_INTERVAL_MS);
      if (interval.unref) interval.unref();
    }
  });
}

// Sync variant for the /huddle-setup validation step where we measure the
// editor's --wait behavior before persisting config. Same spawnSync as before;
// no heartbeat (one-shot probe), no TTY guard (validation may probe terminal
// editors deliberately).
export function launchEditorSync(cmdString, file) {
  const tokens = tokenizeCommand(cmdString);
  const bin = tokens[0];
  const args = [...tokens.slice(1), file];
  const start = Date.now();
  const result = spawnSync(bin, args, { stdio: "inherit" });
  const elapsedSeconds = Math.round((Date.now() - start) / 1000);
  return { exitCode: result.status, elapsedSeconds, error: result.error };
}

function makeProbeFile() {
  const f = join(
    tmpdir(),
    `huddle-probe.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.md`,
  );
  writeFileSync(
    f,
    [
      "# Huddle editor probe",
      "",
      "Close this file (save not required) to confirm your editor blocks correctly.",
      "Window opening then closing immediately = editor doesn't block; we'll fall back to mtime polling.",
    ].join("\n"),
  );
  return f;
}

export function validateEditor(cmdString) {
  const f = makeProbeFile();
  const { exitCode, elapsedSeconds, error } = launchEditorSync(cmdString, f);
  try {
    unlinkSync(f);
  } catch {}
  if (error) return { error: String(error.message || error) };
  const waitMethod = elapsedSeconds < 2 ? "mtime_poll" : "native";
  return { waitMethod, elapsedSeconds, exitCode };
}

// CLI dispatch.
function cli() {
  const [, , action, ...args] = process.argv;
  switch (action) {
    case "probe": {
      const n = parseInt(args[0] || "4", 10);
      console.log(JSON.stringify(probe().slice(0, n)));
      break;
    }
    case "validate": {
      const cmd = args[0];
      if (!cmd) {
        console.error('usage: setup.js validate "<cmd>"');
        process.exit(1);
      }
      console.log(JSON.stringify(validateEditor(cmd)));
      break;
    }
    case "save": {
      const [cmd, label, kind, waitMethod] = args;
      if (!cmd || !label || !kind || !waitMethod) {
        console.error("usage: setup.js save <cmd> <label> <kind> <waitMethod>");
        process.exit(1);
      }
      console.log(saveConfig({ cmd, label, kind, waitMethod }));
      break;
    }
    case "show":
      console.log(JSON.stringify(loadConfig() ?? {}, null, 2));
      break;
    case "path":
      console.log(CONFIG_FILE);
      break;
    case "status":
      console.log(configStatus());
      break;
    case "auto": {
      const sub = args[0];
      const value = args[1];
      try {
        switch (sub) {
          case "enable":
            console.log(JSON.stringify(setAutoTrigger({ enabled: true })));
            break;
          case "disable":
            console.log(JSON.stringify(setAutoTrigger({ enabled: false })));
            break;
          case "threshold": {
            const n = parseInt(value, 10);
            if (!Number.isFinite(n) || n < 1) {
              console.error("threshold must be positive integer");
              process.exit(1);
            }
            console.log(JSON.stringify(setAutoTrigger({ threshold_questions: n })));
            break;
          }
          case "chars": {
            const n = parseInt(value, 10);
            if (!Number.isFinite(n) || n < 1) {
              console.error("chars threshold must be positive integer");
              process.exit(1);
            }
            console.log(JSON.stringify(setAutoTrigger({ threshold_chars: n })));
            break;
          }
          case "force": {
            const target = (value || "").toLowerCase();
            if (target === "editor") {
              console.log(JSON.stringify(setAutoTrigger({ force_editor: true, force_inline: false })));
            } else if (target === "inline") {
              console.log(JSON.stringify(setAutoTrigger({ force_inline: true, force_editor: false })));
            } else if (target === "off" || target === "none") {
              console.log(JSON.stringify(setAutoTrigger({ force_editor: false, force_inline: false })));
            } else {
              console.error("usage: setup.js auto force {editor|inline|off}");
              process.exit(1);
            }
            break;
          }
          case "decide": {
            const qc = parseInt(args[1] || "0", 10);
            const tc = parseInt(args[2] || "0", 10);
            console.log(decideRoute({ questionCount: qc, totalChars: tc }));
            break;
          }
          default:
            console.error(
              "usage: setup.js auto {enable|disable|threshold <n>|chars <n>|force editor|inline|off|decide <qcount> <chars>}",
            );
            process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }
    case "statusline": {
      const sub = args[0];
      try {
        switch (sub) {
          case "install": {
            const flag = args[1];
            let chain = "auto";
            if (flag === "--chain") chain = true;
            else if (flag === "--no-chain") chain = false;
            console.log(JSON.stringify(installStatusline({ chainCaveman: chain }), null, 2));
            break;
          }
          case "uninstall":
            console.log(JSON.stringify(uninstallStatusline(), null, 2));
            break;
          case "show":
            console.log(JSON.stringify(readClaudeSettings().statusLine ?? null, null, 2));
            break;
          default:
            console.error("usage: setup.js statusline {install [--chain|--no-chain]|uninstall|show}");
            process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }
    case "template": {
      const sub = args[0];
      const value = args[1];
      try {
        switch (sub) {
          case "wrap-width": {
            const n = parseInt(value, 10);
            if (!Number.isFinite(n) || n < 20) {
              console.error("wrap-width must be integer >= 20");
              process.exit(1);
            }
            console.log(JSON.stringify(setTemplate({ wrap_width: n })));
            break;
          }
          case "indent-width": {
            const n = parseInt(value, 10);
            if (!Number.isFinite(n) || n < 0) {
              console.error("indent-width must be non-negative integer");
              process.exit(1);
            }
            console.log(JSON.stringify(setTemplate({ indent_width: n })));
            break;
          }
          case "default-title": {
            if (!value) {
              console.error("default-title requires a non-empty string");
              process.exit(1);
            }
            console.log(JSON.stringify(setTemplate({ default_title: value })));
            break;
          }
          case "show": {
            const c = loadConfig();
            console.log(JSON.stringify(c?.template ?? DEFAULT_TEMPLATE, null, 2));
            break;
          }
          default:
            console.error(
              "usage: setup.js template {wrap-width <n>|indent-width <n>|default-title <text>|show}",
            );
            process.exit(1);
        }
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }
    default:
      console.error(
        "usage: setup.js {probe [N] | validate <cmd> | save <cmd> <label> <kind> <waitMethod> | show | path | status | auto <subcommand> | template <subcommand> | statusline <subcommand>}",
      );
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  cli();
}

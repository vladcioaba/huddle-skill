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

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
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
  const config = {
    version: 1,
    editor: {
      cmd,
      label,
      kind,
      wait_method: waitMethod,
      configured_at: new Date().toISOString(),
    },
    fallback: existing?.fallback ?? [],
    format: "markdown",
    subagent,
    auto_trigger,
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

export function launchEditor(cmdString, file) {
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
  const { exitCode, elapsedSeconds, error } = launchEditor(cmdString, f);
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
    default:
      console.error(
        "usage: setup.js {probe [N] | validate <cmd> | save <cmd> <label> <kind> <waitMethod> | show | path | status | auto <subcommand>}",
      );
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}

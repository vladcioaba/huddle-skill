#!/usr/bin/env node
// state.js — CRUD over ~/.claude/state/huddle/index.json for active sessions.
//
// Layout:
//   ~/.claude/state/huddle/
//   ├── index.json                # registry of active/completed sessions
//   └── <id>/
//       ├── meta.json             # session metadata
//       ├── questions.json        # original question set
//       ├── bundle.json           # orchestrator output when complete
//       └── status                # "waiting_user" | "done" | "stopped" | "stale"
//
// index.json schema:
//   {
//     "version": 1,
//     "sessions": [
//       {
//         "id": "huddle-<ts>-<rand>",
//         "seq": 1,
//         "title": "...",
//         "spawned_at": "ISO",
//         "status": "waiting_user|done|stopped|stale",
//         "pid": 1234,                  // bg shell PID if known
//         "file": "/tmp/...md",         // editor file path
//         "question_count": 7
//       }
//     ]
//   }
//
// CLI:
//   state.js dir                    → print state dir path
//   state.js list [--json]          → print active sessions (table or JSON)
//   state.js register <meta.json>   → add session to index, init session dir
//   state.js update <id> <patch.json>
//                                   → merge patch into session entry
//   state.js complete <id> <bundle.json>
//                                   → mark done, save bundle into session dir
//   state.js stop <id>              → mark stopped, kill PID if alive
//   state.js merge <id>             → mark merged_at (main thread surfaced bundle)
//   state.js prune                  → mark stale: status=waiting_user + pid dead
//   state.js get <id>               → print one session as JSON

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const STATE_DIR =
  process.env.HUDDLE_STATE_DIR ||
  join(homedir(), ".claude", "state", "huddle");
const INDEX_FILE = join(STATE_DIR, "index.json");

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function getStateDir() {
  return STATE_DIR;
}

export function loadIndex() {
  ensureDir();
  if (!existsSync(INDEX_FILE)) return { version: 1, sessions: [] };
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return { version: 1, sessions: [] };
  }
}

function saveIndex(idx) {
  ensureDir();
  const tmp = `${INDEX_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(idx, null, 2));
  renameSync(tmp, INDEX_FILE);
}

export function listSessions(filter = null) {
  const idx = loadIndex();
  if (!filter) return idx.sessions;
  return idx.sessions.filter((s) => s.status === filter);
}

export function getSession(id) {
  const idx = loadIndex();
  return idx.sessions.find((s) => s.id === id) ?? null;
}

export function registerSession(meta) {
  if (!meta.id) throw new Error("registerSession: meta.id required");
  ensureDir();
  const sessionDir = join(STATE_DIR, meta.id);
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, "meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(join(sessionDir, "status"), "waiting_user");

  const idx = loadIndex();
  // Replace if same id exists, else append.
  const existing = idx.sessions.findIndex((s) => s.id === meta.id);
  const entry = {
    id: meta.id,
    seq: meta.seq ?? 1,
    title: meta.title ?? "Clarifications needed",
    spawned_at: meta.spawned_at ?? new Date().toISOString(),
    status: "waiting_user",
    pid: meta.pid ?? null,
    file: meta.file ?? null,
    question_count: meta.question_count ?? 0,
  };
  if (existing >= 0) idx.sessions[existing] = entry;
  else idx.sessions.push(entry);
  saveIndex(idx);
  return entry;
}

export function updateSession(id, patch) {
  const idx = loadIndex();
  const i = idx.sessions.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`session not found: ${id}`);
  idx.sessions[i] = { ...idx.sessions[i], ...patch };
  saveIndex(idx);
  // Also persist status file if status changed.
  if (patch.status) {
    const sessionDir = join(STATE_DIR, id);
    if (existsSync(sessionDir)) {
      writeFileSync(join(sessionDir, "status"), patch.status);
    }
  }
  return idx.sessions[i];
}

export function completeSession(id, bundle) {
  const sessionDir = join(STATE_DIR, id);
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, "bundle.json"), JSON.stringify(bundle, null, 2));
  return updateSession(id, { status: "done", completed_at: new Date().toISOString() });
}

export function mergeSession(id) {
  const session = getSession(id);
  if (!session) throw new Error(`session not found: ${id}`);
  return updateSession(id, { merged_at: new Date().toISOString() });
}

export function stopSession(id) {
  const session = getSession(id);
  if (!session) throw new Error(`session not found: ${id}`);
  if (session.pid) {
    try {
      process.kill(session.pid, "SIGTERM");
    } catch {
      // process already gone — fine
    }
  }
  return updateSession(id, { status: "stopped", stopped_at: new Date().toISOString() });
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // EPERM = exists but not ours
  }
}

export function pruneOrphans() {
  const idx = loadIndex();
  let changed = 0;
  for (const s of idx.sessions) {
    if (s.status === "waiting_user" && s.pid && !isPidAlive(s.pid)) {
      s.status = "stale";
      s.pruned_at = new Date().toISOString();
      changed++;
    }
  }
  if (changed) saveIndex(idx);
  return changed;
}

export function removeSession(id) {
  const idx = loadIndex();
  const before = idx.sessions.length;
  idx.sessions = idx.sessions.filter((s) => s.id !== id);
  if (idx.sessions.length < before) saveIndex(idx);
  const sessionDir = join(STATE_DIR, id);
  if (existsSync(sessionDir)) rmSync(sessionDir, { recursive: true, force: true });
  return before - idx.sessions.length;
}

function cli() {
  const [, , action, ...args] = process.argv;
  switch (action) {
    case "dir":
      console.log(STATE_DIR);
      break;
    case "list": {
      const sessions = listSessions();
      if (args.includes("--json")) {
        console.log(JSON.stringify(sessions, null, 2));
        break;
      }
      if (!sessions.length) {
        console.log("(no sessions)");
        break;
      }
      const rows = sessions.map((s) =>
        [s.id, s.status, s.seq, s.question_count, s.title].join("\t"),
      );
      console.log("id\tstatus\tseq\tQs\ttitle");
      for (const r of rows) console.log(r);
      break;
    }
    case "register": {
      const metaPath = args[0];
      if (!metaPath) {
        console.error("usage: state.js register <meta.json>");
        process.exit(1);
      }
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      console.log(JSON.stringify(registerSession(meta)));
      break;
    }
    case "update": {
      const [id, patchPath] = args;
      if (!id || !patchPath) {
        console.error("usage: state.js update <id> <patch.json>");
        process.exit(1);
      }
      const patch = JSON.parse(readFileSync(patchPath, "utf8"));
      console.log(JSON.stringify(updateSession(id, patch)));
      break;
    }
    case "complete": {
      const [id, bundlePath] = args;
      if (!id || !bundlePath) {
        console.error("usage: state.js complete <id> <bundle.json>");
        process.exit(1);
      }
      const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
      console.log(JSON.stringify(completeSession(id, bundle)));
      break;
    }
    case "stop": {
      const id = args[0];
      if (!id) {
        console.error("usage: state.js stop <id>");
        process.exit(1);
      }
      console.log(JSON.stringify(stopSession(id)));
      break;
    }
    case "merge": {
      const id = args[0];
      if (!id) {
        console.error("usage: state.js merge <id>");
        process.exit(1);
      }
      console.log(JSON.stringify(mergeSession(id)));
      break;
    }
    case "prune": {
      const n = pruneOrphans();
      console.log(`pruned ${n} session(s)`);
      break;
    }
    case "get": {
      const id = args[0];
      if (!id) {
        console.error("usage: state.js get <id>");
        process.exit(1);
      }
      console.log(JSON.stringify(getSession(id), null, 2));
      break;
    }
    case "remove": {
      const id = args[0];
      if (!id) {
        console.error("usage: state.js remove <id>");
        process.exit(1);
      }
      const n = removeSession(id);
      console.log(`removed ${n} session(s)`);
      break;
    }
    default:
      console.error(
        "usage: state.js {dir|list [--json]|register <meta.json>|update <id> <patch.json>|complete <id> <bundle.json>|stop <id>|prune|get <id>|remove <id>}",
      );
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  cli();
}

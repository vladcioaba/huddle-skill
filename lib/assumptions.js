#!/usr/bin/env node
// assumptions.js — CRUD over ~/.claude/state/huddle/<id>/assumptions.json.
//
// File schema:
//   {
//     "snapshot_at": "ISO",
//     "items": [
//       {
//         "qid": "Q1",
//         "question": "...",
//         "assumption": "default value main thread used",
//         "confidence": "high|medium|low",
//         "code_paths_affected": ["src/x.ts"],
//         "decisions_taken": ["src/x.ts:42 wrote weekly cron"]
//       }
//     ]
//   }
//
// CLI:
//   assumptions.js init <id> <snapshot.json>
//                       → write the initial snapshot (overwrites)
//   assumptions.js append <id> <qid> <decision-text>
//                       → push a string into items[qid].decisions_taken
//   assumptions.js touch <id> <qid> <path>
//                       → add a path to items[qid].code_paths_affected (idempotent)
//   assumptions.js get <id>
//                       → print assumptions.json
//   assumptions.js path <id>
//                       → print absolute path to assumptions.json

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const STATE_DIR =
  process.env.HUDDLE_STATE_DIR ||
  join(homedir(), ".claude", "state", "huddle");

function sessionDir(id) {
  return join(STATE_DIR, id);
}
function assumptionsPath(id) {
  return join(sessionDir(id), "assumptions.json");
}

function ensureSession(id) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const d = sessionDir(id);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function readOrEmpty(id) {
  const f = assumptionsPath(id);
  if (!existsSync(f)) return { snapshot_at: null, items: [] };
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return { snapshot_at: null, items: [] };
  }
}

function writeAtomic(id, snapshot) {
  ensureSession(id);
  const f = assumptionsPath(id);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
  renameSync(tmp, f);
  return f;
}

export function initSnapshot(id, items) {
  if (!Array.isArray(items)) throw new Error("items must be an array");
  const normalized = items.map((it) => ({
    qid: it.qid,
    question: it.question ?? null,
    assumption: it.assumption ?? null,
    confidence: it.confidence ?? "medium",
    code_paths_affected: Array.isArray(it.code_paths_affected) ? [...it.code_paths_affected] : [],
    decisions_taken: Array.isArray(it.decisions_taken) ? [...it.decisions_taken] : [],
  }));
  const snapshot = { snapshot_at: new Date().toISOString(), items: normalized };
  writeAtomic(id, snapshot);
  return snapshot;
}

export function getSnapshot(id) {
  return readOrEmpty(id);
}

export function findItem(snapshot, qid) {
  return snapshot.items.find((it) => it.qid === qid) ?? null;
}

export function appendDecision(id, qid, decisionText) {
  const snapshot = readOrEmpty(id);
  const item = findItem(snapshot, qid);
  if (!item) throw new Error(`qid not found in assumptions: ${qid}`);
  if (!item.decisions_taken.includes(decisionText)) {
    item.decisions_taken.push(decisionText);
  }
  writeAtomic(id, snapshot);
  return item;
}

export function touchPath(id, qid, path) {
  const snapshot = readOrEmpty(id);
  const item = findItem(snapshot, qid);
  if (!item) throw new Error(`qid not found in assumptions: ${qid}`);
  if (!item.code_paths_affected.includes(path)) {
    item.code_paths_affected.push(path);
  }
  writeAtomic(id, snapshot);
  return item;
}

function cli() {
  const [, , action, ...args] = process.argv;
  switch (action) {
    case "init": {
      const [id, snapPath] = args;
      if (!id || !snapPath) {
        console.error("usage: assumptions.js init <id> <snapshot.json>");
        process.exit(1);
      }
      const items = JSON.parse(readFileSync(snapPath, "utf8"));
      console.log(JSON.stringify(initSnapshot(id, items.items ?? items), null, 2));
      break;
    }
    case "append": {
      const [id, qid, ...decisionParts] = args;
      const decision = decisionParts.join(" ");
      if (!id || !qid || !decision) {
        console.error("usage: assumptions.js append <id> <qid> <decision text>");
        process.exit(1);
      }
      console.log(JSON.stringify(appendDecision(id, qid, decision), null, 2));
      break;
    }
    case "touch": {
      const [id, qid, path] = args;
      if (!id || !qid || !path) {
        console.error("usage: assumptions.js touch <id> <qid> <path>");
        process.exit(1);
      }
      console.log(JSON.stringify(touchPath(id, qid, path), null, 2));
      break;
    }
    case "get": {
      const [id] = args;
      if (!id) {
        console.error("usage: assumptions.js get <id>");
        process.exit(1);
      }
      console.log(JSON.stringify(getSnapshot(id), null, 2));
      break;
    }
    case "path": {
      const [id] = args;
      if (!id) {
        console.error("usage: assumptions.js path <id>");
        process.exit(1);
      }
      console.log(assumptionsPath(id));
      break;
    }
    default:
      console.error(
        "usage: assumptions.js {init <id> <snapshot.json>|append <id> <qid> <text>|touch <id> <qid> <path>|get <id>|path <id>}",
      );
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  cli();
}

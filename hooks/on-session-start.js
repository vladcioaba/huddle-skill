#!/usr/bin/env node
// on-session-start.js — Claude Code SessionStart hook for huddle.
//
// Side effects:
//   1. Prune orphaned sessions: any waiting_user entry whose spawning pid
//      is no longer alive gets marked `stale`.
//   2. Emit a brief system-reminder block summarizing pending state so the
//      main thread knows about in-flight or recently-completed huddles
//      from prior sessions.
//
// stdout becomes injected context (per Claude Code hook convention).
// stderr is silent on success — anything written here goes to the user's
// terminal and would be noise.
//
// Exits 0 on any condition (including no state dir present).

import {
  pruneOrphans,
  listSessions,
  getStateDir,
} from "../lib/state.js";
import { existsSync } from "node:fs";

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const stateDir = getStateDir();

// Skip silently if state dir hasn't been created yet (huddle never used).
if (!existsSync(stateDir)) {
  process.exit(0);
}

const pruned = safe(() => pruneOrphans(), 0);
const sessions = safe(() => listSessions(), []);

const waiting = sessions.filter((s) => s.status === "waiting_user");
const doneRecent = sessions
  .filter((s) => s.status === "done" && !s.merged_at)
  .slice(-5);
const stale = sessions.filter((s) => s.status === "stale");

if (
  pruned === 0 &&
  waiting.length === 0 &&
  doneRecent.length === 0 &&
  stale.length === 0
) {
  process.exit(0);
}

const lines = ["[huddle session-start status]"];
if (pruned > 0) {
  lines.push(`Pruned ${pruned} orphan(s) (spawning shell no longer alive).`);
}
if (waiting.length > 0) {
  lines.push(`${waiting.length} huddle session(s) waiting for user:`);
  for (const s of waiting) {
    lines.push(
      `  - ${s.id} — "${s.title}" (${s.question_count}Q, spawned ${s.spawned_at})`,
    );
  }
}
if (doneRecent.length > 0) {
  lines.push(`${doneRecent.length} completed bundle(s) not yet merged:`);
  for (const s of doneRecent) {
    lines.push(`  - ${s.id} — "${s.title}" (status=done, run /huddle-list to inspect)`);
  }
}
if (stale.length > 0) {
  lines.push(
    `${stale.length} stale session(s) in registry (run "node ~/.claude/skills/huddle/lib/state.js remove <id>" to clean).`,
  );
}
lines.push("Use /huddle-list to inspect, /huddle-stop <id> to cancel.");

process.stdout.write(lines.join("\n"));
process.exit(0);

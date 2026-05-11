#!/usr/bin/env node
// on-user-prompt.js — Claude Code UserPromptSubmit hook.
//
// Fires before each user prompt is dispatched to the model. Emits a brief
// reminder if there are:
//   - completed sessions whose bundle has not been merged yet
//   - active waiting_user sessions still open
//
// Quiet otherwise. The goal is to nudge the main thread to surface pending
// answers before responding to the next user prompt — and to remind the user
// they have forms still open.
//
// Behavior knobs (env):
//   HUDDLE_USER_PROMPT_REMINDER=0   → disable hook output entirely
//   HUDDLE_USER_PROMPT_VERBOSE=1    → list each session id, not just counts
//
// Output goes to stdout and becomes UserPromptSubmit context.

import { listSessions, getStateDir } from "../lib/state.js";
import { existsSync } from "node:fs";

if (process.env.HUDDLE_USER_PROMPT_REMINDER === "0") {
  process.exit(0);
}

if (!existsSync(getStateDir())) {
  process.exit(0);
}

let sessions;
try {
  sessions = listSessions();
} catch {
  process.exit(0);
}

const active = sessions.filter((s) => s.status === "waiting_user");
const doneUnmerged = sessions.filter((s) => s.status === "done" && !s.merged_at);

if (active.length === 0 && doneUnmerged.length === 0) {
  process.exit(0);
}

const verbose = process.env.HUDDLE_USER_PROMPT_VERBOSE === "1";
const lines = ["[huddle pending]"];

if (active.length > 0) {
  lines.push(
    `${active.length} form(s) open in editor — user may still be answering.`,
  );
  if (verbose) {
    for (const s of active) {
      lines.push(`  - ${s.id} — ${s.title} (${s.question_count}Q)`);
    }
  }
}

if (doneUnmerged.length > 0) {
  lines.push(
    `${doneUnmerged.length} bundle(s) completed but not yet surfaced to user. Review with /huddle-list and call \`state.js merge <id>\` after surfacing.`,
  );
  if (verbose) {
    for (const s of doneUnmerged) {
      lines.push(`  - ${s.id} — ${s.title} (done at ${s.completed_at})`);
    }
  }
}

process.stdout.write(lines.join("\n"));
process.exit(0);

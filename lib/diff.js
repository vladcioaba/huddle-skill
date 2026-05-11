#!/usr/bin/env node
// diff.js — compare bundle.answers against assumptions snapshot, classify severity.
//
// Severity rules (per qid):
//   match       — answer text equals assumption (case + whitespace insensitive).
//   refinement  — answer contains the assumption substring, but is longer/more
//                 specific. No contradiction, just additional detail.
//   rework      — answer differs from assumption AND items[qid].code_paths_affected
//                 OR decisions_taken is non-empty. Main thread already acted.
//   blocking    — answer differs from assumption AND assumption is in a question
//                 marked "blocking-aware" (future: heuristic on irreversible
//                 decisions). For v1, we treat anything with decisions_taken
//                 containing "irreversible" or "deployed" as blocking.
//   unanswered  — no answer in bundle (qid in pending) OR answer is empty/null.
//
// Output JSON:
//   {
//     "computed_at": "ISO",
//     "items": [{ qid, assumption, answer, severity, notes,
//                 decisions_to_revisit: [...], paths_affected: [...] }],
//     "counts": { match, refinement, rework, blocking, unanswered },
//     "recommend_action": "merge_clean" | "rollback_and_revisit" | "ask_user" | "noop"
//   }
//
// CLI:
//   diff.js compute <id>            → compute + write merge_diff.json + print
//   diff.js show <id>               → print merge_diff.json (if computed)
//   diff.js path <id>               → print absolute path

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
function bundlePath(id) {
  return join(sessionDir(id), "bundle.json");
}
function assumptionsPath(id) {
  return join(sessionDir(id), "assumptions.json");
}
function diffPath(id) {
  return join(sessionDir(id), "merge_diff.json");
}

function readJSON(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function normalize(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const IRREVERSIBLE_RE = /(irreversible|deployed|production|merged|published|released)/i;

export function classifyItem(item, bundleAnswer) {
  const assumption = item?.assumption ?? null;
  const answer = bundleAnswer ?? null;
  const decisionsList = item?.decisions_taken ?? [];
  const pathsList = item?.code_paths_affected ?? [];

  if (!answer || !answer.toString().trim()) {
    return {
      qid: item?.qid,
      assumption,
      answer: null,
      severity: "unanswered",
      notes: null,
      decisions_to_revisit: decisionsList,
      paths_affected: pathsList,
    };
  }

  const a = normalize(assumption);
  const b = normalize(answer);
  if (a && a === b) {
    return {
      qid: item.qid,
      assumption,
      answer,
      severity: "match",
      notes: null,
      decisions_to_revisit: [],
      paths_affected: pathsList,
    };
  }

  // Refinement: answer contains the assumption text but extends it.
  if (a && b.includes(a) && b.length > a.length) {
    return {
      qid: item.qid,
      assumption,
      answer,
      severity: "refinement",
      notes: "answer extends the assumption without contradicting it",
      decisions_to_revisit: [],
      paths_affected: pathsList,
    };
  }

  // From here: answer contradicts assumption (or assumption was null).
  const acted = decisionsList.length > 0 || pathsList.length > 0;
  const irreversible = decisionsList.some((d) => IRREVERSIBLE_RE.test(d));

  if (acted && irreversible) {
    return {
      qid: item.qid,
      assumption,
      answer,
      severity: "blocking",
      notes: "answer contradicts assumption; main thread already took irreversible action",
      decisions_to_revisit: decisionsList,
      paths_affected: pathsList,
    };
  }
  if (acted) {
    return {
      qid: item.qid,
      assumption,
      answer,
      severity: "rework",
      notes: "answer contradicts assumption; main thread wrote code under wrong assumption",
      decisions_to_revisit: decisionsList,
      paths_affected: pathsList,
    };
  }

  // Contradicts, but no decisions/code touched yet → still mark as rework severity
  // with weaker notes (cheaper to handle but the model should still surface).
  return {
    qid: item.qid,
    assumption,
    answer,
    severity: "rework",
    notes: "answer contradicts assumption; nothing acted upon yet, just align before continuing",
    decisions_to_revisit: [],
    paths_affected: pathsList,
  };
}

function recommendAction(counts) {
  if (counts.blocking > 0) return "rollback_and_revisit";
  if (counts.rework > 0) return "rollback_and_revisit";
  if (counts.unanswered > 0 && counts.match + counts.refinement === 0) return "ask_user";
  if (counts.match + counts.refinement > 0 && counts.rework === 0 && counts.unanswered === 0) {
    return "merge_clean";
  }
  if (counts.unanswered > 0) return "ask_user";
  return "noop";
}

export function compute(id) {
  const bundle = readJSON(bundlePath(id));
  const snapshot = readJSON(assumptionsPath(id));
  if (!bundle) throw new Error(`bundle.json not found for ${id}`);
  if (!snapshot) throw new Error(`assumptions.json not found for ${id}`);

  const answersByQid = new Map();
  for (const a of bundle.answers ?? []) answersByQid.set(a.qid, a.answer);

  const items = [];
  for (const item of snapshot.items) {
    items.push(classifyItem(item, answersByQid.get(item.qid)));
  }

  const counts = { match: 0, refinement: 0, rework: 0, blocking: 0, unanswered: 0 };
  for (const it of items) counts[it.severity]++;

  const result = {
    computed_at: new Date().toISOString(),
    items,
    counts,
    recommend_action: recommendAction(counts),
  };

  if (!existsSync(sessionDir(id))) mkdirSync(sessionDir(id), { recursive: true });
  const tmp = `${diffPath(id)}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, 2));
  renameSync(tmp, diffPath(id));
  return result;
}

export function showDiff(id) {
  return readJSON(diffPath(id));
}

function cli() {
  const [, , action, ...args] = process.argv;
  switch (action) {
    case "compute": {
      const id = args[0];
      if (!id) {
        console.error("usage: diff.js compute <id>");
        process.exit(1);
      }
      try {
        console.log(JSON.stringify(compute(id), null, 2));
      } catch (e) {
        console.error(e.message);
        process.exit(1);
      }
      break;
    }
    case "show": {
      const id = args[0];
      if (!id) {
        console.error("usage: diff.js show <id>");
        process.exit(1);
      }
      const d = showDiff(id);
      console.log(d ? JSON.stringify(d, null, 2) : "{}");
      break;
    }
    case "path": {
      const id = args[0];
      if (!id) {
        console.error("usage: diff.js path <id>");
        process.exit(1);
      }
      console.log(diffPath(id));
      break;
    }
    default:
      console.error("usage: diff.js {compute <id>|show <id>|path <id>}");
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  cli();
}

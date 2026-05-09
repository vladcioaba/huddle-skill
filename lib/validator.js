#!/usr/bin/env node
// validator.js — classify parsed answers vs question set; decide reopen.
//
// Modes:
//   validator.js classify <answers-file> <questions.json>
//       → JSON {answered: [{qid, question, answer}], pending: [{qid, ...}], stop, summary}
//
//   validator.js shouldReopen <classification.json>
//       → "yes" | "no"   (no = all answered or stop signal)

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "./parser.js";

const FILLER = new Set([
  "",
  "?",
  "??",
  "idk",
  "i don't know",
  "dont know",
  "don't know",
  "no idea",
  "tbd",
  "n/a",
  "na",
]);

export function classify(parsed, questions) {
  const byQid = new Map(questions.map((q) => [q.qid, q]));
  const answered = [];
  const pending = [];

  for (const q of questions) {
    const raw = parsed.answers[q.qid] ?? "";
    const norm = raw.trim().toLowerCase();
    const isFiller = FILLER.has(norm);
    const looksAnswered = raw.trim().length > 0 && !isFiller;
    if (looksAnswered) {
      answered.push({ qid: q.qid, question: q.question, answer: raw.trim() });
    } else {
      pending.push({ ...q, fillerAnswer: isFiller ? raw.trim() : null });
    }
  }

  const summary =
    pending.length === 0
      ? "all_answered"
      : parsed.stop
        ? "user_stop"
        : "incomplete";

  return {
    answered,
    pending,
    stop: parsed.stop,
    summary,
    counts: { total: questions.length, answered: answered.length, pending: pending.length },
  };
}

export function shouldReopen(classification) {
  if (classification.stop) return false;
  if (classification.pending.length === 0) return false;
  return true;
}

function cli() {
  const [, , action, ...args] = process.argv;
  switch (action) {
    case "classify": {
      const [answersFile, questionsFile] = args;
      if (!answersFile || !questionsFile) {
        console.error("usage: validator.js classify <answers-file> <questions.json>");
        process.exit(1);
      }
      const text = readFileSync(answersFile, "utf8");
      const questions = JSON.parse(readFileSync(questionsFile, "utf8"));
      const parsed = parse(text, questions);
      console.log(JSON.stringify(classify(parsed, questions), null, 2));
      break;
    }
    case "shouldReopen": {
      const [classificationFile] = args;
      if (!classificationFile) {
        console.error("usage: validator.js shouldReopen <classification.json>");
        process.exit(1);
      }
      const c = JSON.parse(readFileSync(classificationFile, "utf8"));
      console.log(shouldReopen(c) ? "yes" : "no");
      break;
    }
    default:
      console.error(
        "usage: validator.js {classify <answers-file> <questions.json> | shouldReopen <classification.json>}",
      );
      process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}

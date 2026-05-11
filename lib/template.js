#!/usr/bin/env node
// template.js — generate Q&A markdown for huddle sessions.
//
// Output shape:
//
//   # <title>
//   # id:<id> seq:<n> [iter:<m>] questions:Q1,Q2 [answered:Q3,Q4]
//   <!-- tips: /STOP /CANCEL /ABORT on own line aborts • SKIP, N/A, default, YOU CHOOSE accepted as answers -->
//
//   # Q1: question text
//     wrapped continuation (2-space indent)
//
//   [3 blank lines for answer]
//
//   ---
//
//   # Q2: ...
//
// Modes:
//   template.js initial <id> <seq> <questions.json> [--title <text>]
//   template.js iteration <id> <seq> <iter> <pending.json> [<answeredQids.json>] [--title <text>]

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getPanel } from "./panels/registry.js";

const DEFAULT_TITLE = "Clarifications needed";
const TIPS_LINE =
  "<!-- tips: /STOP /CANCEL /ABORT on its own line aborts • SKIP, N/A, default, YOU CHOOSE are valid answers -->";
const SEPARATOR = "---";

function joinArr(arr) {
  return arr.join(",");
}

function emitHeader({ title, id, seq, iter, qids, answered }) {
  const out = [];
  out.push(`# ${title}`);
  const parts = [`id:${id}`, `seq:${seq}`];
  if (iter && iter > 1) parts.push(`iter:${iter}`);
  parts.push(`questions:${joinArr(qids)}`);
  if (answered && answered.length) parts.push(`answered:${joinArr(answered)}`);
  out.push(`# ${parts.join(" ")}`);
  out.push(TIPS_LINE);
  out.push("");
  return out.join("\n") + "\n";
}

function renderQuestions(questions, opts) {
  const parts = [];
  for (let i = 0; i < questions.length; i++) {
    const panel = getPanel(questions[i].panel ?? "text");
    parts.push(panel.render(questions[i], opts));
    if (i < questions.length - 1) parts.push(`${SEPARATOR}\n\n`);
  }
  return parts.join("");
}

export function buildInitial(id, seq, questions, options = {}) {
  const { title = DEFAULT_TITLE, wrapWidth, indentWidth } = options;
  let out = emitHeader({
    title,
    id,
    seq,
    qids: questions.map((q) => q.qid),
  });
  out += renderQuestions(questions, { wrapWidth, indentWidth });
  return out;
}

export function buildIteration(id, seq, iter, pending, answeredQids = [], options = {}) {
  const { title = DEFAULT_TITLE, wrapWidth, indentWidth } = options;
  let out = emitHeader({
    title,
    id,
    seq,
    iter,
    qids: pending.map((q) => q.qid),
    answered: answeredQids,
  });
  out += renderQuestions(pending, { wrapWidth, indentWidth });
  return out;
}

function parseCliFlags(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--title") flags.title = args[++i];
    else if (a === "--wrap-width") flags.wrapWidth = parseInt(args[++i], 10);
    else if (a === "--indent-width") flags.indentWidth = parseInt(args[++i], 10);
    else positional.push(a);
  }
  return { positional, flags };
}

function cli() {
  const [, , action, ...rest] = process.argv;
  const { positional, flags } = parseCliFlags(rest);
  switch (action) {
    case "initial": {
      const [id, seqStr, qfile] = positional;
      if (!id || !seqStr || !qfile) {
        console.error("usage: template.js initial <id> <seq> <questions.json> [--title <text>] [--wrap-width N] [--indent-width N]");
        process.exit(1);
      }
      const questions = JSON.parse(readFileSync(qfile, "utf8"));
      process.stdout.write(
        buildInitial(id, parseInt(seqStr, 10), questions, flags),
      );
      break;
    }
    case "iteration": {
      const [id, seqStr, iterStr, pfile, aqfile] = positional;
      if (!id || !seqStr || !iterStr || !pfile) {
        console.error(
          "usage: template.js iteration <id> <seq> <iter> <pending.json> [<answeredQids.json>] [--title <text>] [--wrap-width N] [--indent-width N]",
        );
        process.exit(1);
      }
      const pending = JSON.parse(readFileSync(pfile, "utf8"));
      const answeredQids = aqfile ? JSON.parse(readFileSync(aqfile, "utf8")) : [];
      process.stdout.write(
        buildIteration(
          id,
          parseInt(seqStr, 10),
          parseInt(iterStr, 10),
          pending,
          answeredQids,
          flags,
        ),
      );
      break;
    }
    default:
      console.error(
        "usage: template.js {initial <id> <seq> <questions.json> | iteration <id> <seq> <iter> <pending.json> [<answeredQids.json>]} [--title <text>] [--wrap-width N] [--indent-width N]",
      );
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}

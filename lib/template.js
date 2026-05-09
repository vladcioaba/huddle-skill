#!/usr/bin/env node
// template.js — generate minimal Q&A markdown for huddle sessions.
//
// Output shape (target):
//
//   <!-- huddle-meta
//   {"id":"X","seq":N,"created":"ISO","iter":1,"qids":["Q1","Q2"]}
//   -->
//
//   Q1: text
//
//
//
//   Q2: text
//
//
//
//   /STOP
//
// Modes:
//   template.js initial <id> <seq> <questions.json>
//   template.js iteration <id> <seq> <iter> <pending.json> [<answeredQids.json>]

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getPanel } from "./panels/registry.js";

function emitMeta(meta) {
  return `<!-- huddle-meta\n${JSON.stringify(meta)}\n-->\n\n`;
}

function emitFooter() {
  // HTML comment so parser ignores it. Editor with markdown render hides comments.
  return "\n<!-- type /STOP on its own line above to abort -->\n";
}

export function buildInitial(id, seq, questions) {
  const meta = {
    id,
    seq,
    created: new Date().toISOString(),
    iter: 1,
    qids: questions.map((q) => q.qid),
  };
  let out = emitMeta(meta);
  for (const q of questions) {
    const panel = getPanel(q.panel ?? "text");
    out += panel.render(q);
  }
  out += emitFooter();
  return out;
}

export function buildIteration(id, seq, iter, pending, answeredQids = []) {
  const meta = {
    id,
    seq,
    iter,
    qids: pending.map((q) => q.qid),
    answered: answeredQids,
  };
  let out = emitMeta(meta);
  for (const q of pending) {
    const panel = getPanel(q.panel ?? "text");
    out += panel.render(q);
  }
  out += emitFooter();
  return out;
}

function cli() {
  const [, , action, ...args] = process.argv;
  switch (action) {
    case "initial": {
      const [id, seqStr, qfile] = args;
      if (!id || !seqStr || !qfile) {
        console.error("usage: template.js initial <id> <seq> <questions.json>");
        process.exit(1);
      }
      const questions = JSON.parse(readFileSync(qfile, "utf8"));
      process.stdout.write(buildInitial(id, parseInt(seqStr, 10), questions));
      break;
    }
    case "iteration": {
      const [id, seqStr, iterStr, pfile, aqfile] = args;
      if (!id || !seqStr || !iterStr || !pfile) {
        console.error(
          "usage: template.js iteration <id> <seq> <iter> <pending.json> [<answeredQids.json>]",
        );
        process.exit(1);
      }
      const pending = JSON.parse(readFileSync(pfile, "utf8"));
      const answeredQids = aqfile ? JSON.parse(readFileSync(aqfile, "utf8")) : [];
      process.stdout.write(
        buildIteration(id, parseInt(seqStr, 10), parseInt(iterStr, 10), pending, answeredQids),
      );
      break;
    }
    default:
      console.error(
        "usage: template.js {initial <id> <seq> <questions.json> | iteration <id> <seq> <iter> <pending.json> [<answeredQids.json>]}",
      );
      process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}

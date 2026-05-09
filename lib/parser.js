#!/usr/bin/env node
// parser.js — parse minimal huddle markdown → JSON {meta, answers, qids, stop}.
//
// Recognized:
//   - Meta block: <!-- huddle-meta\n{JSON}\n-->   (anywhere; first match wins)
//   - Question header: ^Q\d+:\s+text$               (bare, no `##`)
//   - /STOP sentinel: line `/STOP` (trimmed) NOT inside an HTML comment
//
// Each section's body is dispatched to the panel.parse() based on the question's
// `panel` field (default "text"). Pass questions array to enable panel routing;
// otherwise everything uses the text panel.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getPanel } from "./panels/registry.js";

const META_BLOCK = /<!--\s*huddle-meta\s*\r?\n([\s\S]*?)\r?\n\s*-->/;
const Q_HEADER = /^(Q\d+):\s+(.*)$/;
const STOP_LINE = /^\s*\/STOP\s*$/;
const COMMENT_LINE = /^\s*<!--/;

export function extractMeta(text) {
  const m = text.match(META_BLOCK);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function parse(text, questions = null) {
  const meta = extractMeta(text);
  const panelByQid = new Map();
  if (Array.isArray(questions)) {
    for (const q of questions) panelByQid.set(q.qid, q.panel ?? "text");
  }

  const lines = text.split(/\r?\n/);
  const sections = [];
  let stop = false;
  let current = null;
  let inMetaComment = false;

  for (const raw of lines) {
    // Crude HTML-comment block tracking so /STOP inside meta doesn't trip stop flag.
    if (raw.includes("<!--")) inMetaComment = true;
    const wasInMeta = inMetaComment;
    if (raw.includes("-->")) inMetaComment = false;

    if (STOP_LINE.test(raw) && !wasInMeta && !COMMENT_LINE.test(raw)) {
      stop = true;
      continue;
    }
    if (wasInMeta) continue;

    const m = raw.match(Q_HEADER);
    if (m) {
      if (current) sections.push(current);
      current = { qid: m[1], body: [] };
      continue;
    }
    if (current) current.body.push(raw);
  }
  if (current) sections.push(current);

  const answers = {};
  const qids = [];
  for (const s of sections) {
    qids.push(s.qid);
    const panelType = panelByQid.get(s.qid) ?? "text";
    let panel;
    try {
      panel = getPanel(panelType);
    } catch {
      panel = getPanel("text");
    }
    const ans = panel.parse(s.body.join("\n"));
    answers[s.qid] = ans ?? "";
  }

  return { meta, answers, qids, stop };
}

function cli() {
  const [, , file, qfile] = process.argv;
  if (!file) {
    console.error("usage: parser.js <file> [questions.json]");
    process.exit(1);
  }
  const text = readFileSync(file, "utf8");
  const questions = qfile ? JSON.parse(readFileSync(qfile, "utf8")) : null;
  console.log(JSON.stringify(parse(text, questions), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}

#!/usr/bin/env node
// parser.js — parse huddle markdown → JSON {meta, title, answers, qids, stop}.
//
// Recognized:
//   - Title line: `# <text>` (no `id:` token) on line 1
//   - Meta line:  `# id:<id> seq:<n> questions:Q1,Q2 [answered:Q3,Q4]` (after title)
//   - Question header: `^#\s+(Q\d+):\s+text` (multi-line indented body allowed)
//   - /STOP sentinel: line `/STOP` (trimmed) anywhere
//
// Each section's body is dispatched to the panel.parse() based on the question's
// `panel` field (default "text").

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getPanel } from "./panels/registry.js";

const Q_HEADER = /^#\s+(Q\d+):\s+(.*)$/;
const META_HEADER = /^#\s+(id:\S.*)$/;
const STOP_LINE = /^\s*\/(STOP|CANCEL|ABORT)\s*$/i;

function parseMetaLine(payload) {
  // payload like "id:abc seq:1 questions:Q1,Q2 answered:Q3,Q4"
  const meta = {};
  // Split on whitespace, each token is key:value
  for (const tok of payload.split(/\s+/)) {
    const idx = tok.indexOf(":");
    if (idx < 1) continue;
    const key = tok.slice(0, idx);
    const val = tok.slice(idx + 1);
    if (key === "questions" || key === "answered" || key === "qids") {
      meta[key] = val ? val.split(",").filter(Boolean) : [];
    } else if (key === "seq" || key === "iter") {
      meta[key] = parseInt(val, 10);
    } else {
      meta[key] = val;
    }
  }
  // Normalize: prefer `qids` for downstream
  if (meta.questions && !meta.qids) meta.qids = meta.questions;
  return meta;
}

export function extractMeta(text) {
  const lines = text.split(/\r?\n/);
  let title = null;
  let meta = null;
  for (const raw of lines) {
    if (raw.trim() === "") continue;
    const metaMatch = raw.match(META_HEADER);
    if (metaMatch) {
      meta = parseMetaLine(metaMatch[1]);
      break;
    }
    if (raw.startsWith("# ") && !Q_HEADER.test(raw)) {
      // Treat first non-empty `# ...` (that isn't meta or a question header) as title.
      if (title === null) title = raw.slice(2).trim();
      continue;
    }
    // Reached a question header or non-comment content without finding meta — stop.
    break;
  }
  return { title, meta };
}

export function parse(text, questions = null) {
  const { title, meta } = extractMeta(text);
  const panelByQid = new Map();
  if (Array.isArray(questions)) {
    for (const q of questions) panelByQid.set(q.qid, q.panel ?? "text");
  }

  const lines = text.split(/\r?\n/);
  const sections = [];
  let stop = false;
  let current = null;

  for (const raw of lines) {
    if (STOP_LINE.test(raw)) {
      stop = true;
      continue;
    }
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

  return { title, meta, answers, qids, stop };
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

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  cli();
}

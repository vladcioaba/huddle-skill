// panels/image_picker.js — file path input panel (images, attachments, paths).
//
// Question schema:
//   { qid, question, panel: "image_picker",
//     accept?: ["png", "jpg", "jpeg", "gif", "webp"]   // optional extension whitelist
//   }
//
// Render output:
//   `# Qn: <question wrapped>`
//   ``
//   `    paths: <one absolute file path per line below>`
//   `    `
//   `    (one path per line — drag from Finder/Explorer into the editor)`
//
// Parse rules:
//   Lines starting with `/` or `~` or `<drive>:\\` = file paths.
//   Validates existence and (if accept[] given) extension match.
//   Returns array of resolved absolute paths joined by `\n`, or null if none.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const WRAP_WIDTH = 80;
const INDENT = "  ";

function wrapLine(text, indent, width) {
  const max = Math.max(20, width - indent.length);
  if (text.length <= max) return [text];
  const out = [];
  let buf = "";
  for (const word of text.split(/(\s+)/)) {
    if ((buf + word).length > max && buf.trim()) {
      out.push(buf.replace(/\s+$/, ""));
      buf = word.replace(/^\s+/, "");
    } else {
      buf += word;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

export function render(question, opts = {}) {
  const wrapWidth = opts.wrapWidth ?? WRAP_WIDTH;
  const indent = " ".repeat(opts.indentWidth ?? INDENT.length);
  const accept = Array.isArray(question.accept) ? question.accept : null;

  const header = `# ${question.qid}: `;
  const text = (question.question ?? "").toString();
  const paragraphs = text.split(/\n/);
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const isFirst = i === 0;
    if (para === "") {
      out.push("");
      continue;
    }
    const wrapped = wrapLine(para, indent, wrapWidth);
    for (let j = 0; j < wrapped.length; j++) {
      const line = wrapped[j];
      if (isFirst && j === 0) out.push(header + line);
      else out.push(indent + line);
    }
  }

  out.push("");
  out.push("");
  out.push(
    `${indent}(paste one absolute file path per line below — drag from Finder/Explorer)` +
      (accept ? `, accepted: .${accept.join(", .")}` : ""),
  );
  out.push("");
  return out.join("\n") + "\n";
}

const PATH_LINE = /^\s*(?:~|[\/])\S.*|^[A-Za-z]:\\.+$/;

function expandHome(p) {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

function extOf(p) {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i + 1).toLowerCase() : "";
}

export function parse(blockText, opts = {}) {
  const accept = Array.isArray(opts.accept) ? opts.accept.map((e) => e.toLowerCase()) : null;
  const lines = blockText.split(/\r?\n/);
  const accepted = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!PATH_LINE.test(trimmed)) continue;
    const expanded = expandHome(trimmed);
    if (!existsSync(expanded)) continue;
    try {
      if (!statSync(expanded).isFile()) continue;
    } catch {
      continue;
    }
    if (accept && !accept.includes(extOf(expanded))) continue;
    accepted.push(expanded);
  }
  return accepted.length > 0 ? accepted.join("\n") : null;
}

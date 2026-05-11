// panels/radio.js — single-select fixed-options panel.
//
// Question schema:
//   { qid, question, panel: "radio", options: ["A", "B", "C"] }
//
// Render output (per question):
//   `# Qn: <question wrapped>`
//   ``
//   `    ( ) A`
//   `    ( ) B`
//   `    ( ) C`
//   `    (single-select — mark exactly one with (x) or (X))`
//
// Parse rules:
//   `(x)` / `(X)` = selected option (text after the marker)
//   Multiple selections → first wins; we don't enforce single, just take first.
//   Returns the option text, or null if none selected.

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
  const options = Array.isArray(question.options) ? question.options : [];

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
  for (const opt of options) {
    out.push(`${indent}( ) ${opt}`);
  }
  out.push(`${indent}(single-select — mark exactly one with (x))`);
  out.push("");
  return out.join("\n") + "\n";
}

const PICK_LINE = /^\s*\(([ xX])\)\s+(.+?)\s*$/;

export function parse(blockText) {
  const lines = blockText.split(/\r?\n/);
  for (const raw of lines) {
    const m = raw.match(PICK_LINE);
    if (!m) continue;
    if (m[1] === "x" || m[1] === "X") return m[2];
  }
  return null;
}

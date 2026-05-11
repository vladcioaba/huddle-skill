// panels/checkbox.js — multi-select fixed-options panel.
//
// Question schema:
//   { qid, question, panel: "checkbox", options: ["A", "B", "C"] }
//
// Render output (per question):
//   `# Qn: <question text wrapped>`
//   `    `
//   `    [ ] A`
//   `    [ ] B`
//   `    [ ] C`
//   `    (multi-select — mark each chosen option with [x] or [X])`
//
// Parse rules:
//   `[x]` / `[X]` after the question prose = selected option (text after the box)
//   `[ ]` = unselected, skipped in output
//   Returns comma-separated list of selected option texts, or null if none picked.

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
    out.push(`${indent}[ ] ${opt}`);
  }
  out.push(`${indent}(multi-select — mark chosen options with [x])`);
  out.push("");
  return out.join("\n") + "\n";
}

const BOX_LINE = /^\s*\[([ xX])\]\s+(.+?)\s*$/;

export function parse(blockText) {
  const lines = blockText.split(/\r?\n/);
  const selected = [];
  for (const raw of lines) {
    const m = raw.match(BOX_LINE);
    if (!m) continue;
    if (m[1] === "x" || m[1] === "X") {
      selected.push(m[2]);
    }
  }
  return selected.length > 0 ? selected.join(", ") : null;
}

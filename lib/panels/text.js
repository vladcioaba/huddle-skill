// panels/text.js — free-form answer panel.
//
// Render:
//   `# Qn: <first wrapped line>`
//   `  <continuation indented 2 spaces (default; configurable)>`
//   `  <more continuation>`
//   ` `
//   ` `
//   ` `
//   (3 blank lines for answer area)
//
// Question text is word-wrapped at config.template.wrap_width (default 80)
// with config.template.indent_width spaces of continuation indent (default 2).
// Existing `\n` in question text starts a new paragraph (also indented).
// Code blocks (` ``` `) preserved verbatim but still indented.
//
// Parse:
//   Skip leading blank + indented lines (those are question prose).
//   First column-0 non-blank line that isn't `---` HR starts the answer.
//   Capture to end of block; strip leading/trailing blanks and trailing `---` HRs.

const DEFAULT_WRAP_WIDTH = 80;
const DEFAULT_INDENT_WIDTH = 2;

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
  const wrapWidth = opts.wrapWidth ?? DEFAULT_WRAP_WIDTH;
  const indentWidth = opts.indentWidth ?? DEFAULT_INDENT_WIDTH;
  const INDENT = " ".repeat(indentWidth);

  const header = `# ${question.qid}: `;
  const text = (question.question ?? "").toString();
  const paragraphs = text.split(/\n/);
  const out = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const isFirst = i === 0;
    if (para === "") {
      out.push(""); // blank line between paragraphs
      continue;
    }
    if (/^\s*```/.test(para)) {
      out.push(INDENT + para.replace(/^\s+/, ""));
      continue;
    }
    const wrapped = wrapLine(para, INDENT, wrapWidth);
    for (let j = 0; j < wrapped.length; j++) {
      const line = wrapped[j];
      if (isFirst && j === 0) {
        out.push(header + line);
      } else {
        out.push(INDENT + line);
      }
    }
  }

  // 3 blank lines for answer area.
  return out.join("\n") + "\n\n\n\n";
}

const HR_LINE = /^\s*---+\s*$/;

export function parse(blockText) {
  const lines = blockText.split(/\r?\n/);
  let state = "question";
  const answer = [];
  for (const raw of lines) {
    if (state === "question") {
      if (raw.trim() === "") continue;
      if (/^\s/.test(raw)) continue;
      if (HR_LINE.test(raw)) continue;
      state = "answer";
      answer.push(raw);
    } else {
      answer.push(raw);
    }
  }
  while (answer.length) {
    const last = answer[answer.length - 1];
    if (last.trim() === "" || HR_LINE.test(last)) {
      answer.pop();
    } else {
      break;
    }
  }
  const joined = answer.join("\n");
  return joined.length > 0 ? joined : null;
}

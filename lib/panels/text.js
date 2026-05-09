// panels/text.js — minimal free-form answer panel.
//
// Render: bare `Qn: question text` header + 3 blank lines.
//   No `##`, no `> Context:` quote lines, no `> Assumed:` quote lines.
//   Caller (main Claude) is expected to inline any context/assumption hint
//   into the question text itself.
//
// Parse: capture lines until next `Qn:` header or EOF, ignoring blank/comment lines.

export function render(question) {
  return `${question.qid}: ${question.question}\n\n\n\n`;
}

const COMMENT_LINE = /^\s*<!--/;

export function parse(blockText) {
  const lines = blockText.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    if (COMMENT_LINE.test(raw)) continue;
    if (raw.trim() === "" && out.length === 0) continue; // skip leading blanks
    out.push(raw);
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  const joined = out.join("\n");
  return joined.length > 0 ? joined : null;
}

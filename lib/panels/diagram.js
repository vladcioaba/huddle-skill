// panels/diagram.js — mermaid (or any code-fenced text) round-trip panel.
//
// Question schema:
//   { qid, question, panel: "diagram",
//     starter?: "graph LR\n  A --> B"   // optional seed inside the fence
//     lang?: "mermaid"                   // fence language tag (default: mermaid)
//   }
//
// Render output:
//   `# Qn: <question wrapped>`
//   ``
//   `    ```mermaid`
//   `    <starter content here>`
//   `    ```
//   `    (edit the fenced diagram above; lines outside fences are ignored)`
//
// Parse rules:
//   First fenced ``` block (with or without lang tag) is captured verbatim.
//   Returns the inner content (no fences), or null if empty / no fence found.

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
  const lang = question.lang || "mermaid";
  const starter = question.starter || "";

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
  out.push(`${indent}\`\`\`${lang}`);
  if (starter) {
    for (const line of starter.split(/\n/)) {
      out.push(`${indent}${line}`);
    }
  } else {
    out.push(`${indent}`);
    out.push(`${indent}`);
  }
  out.push(`${indent}\`\`\``);
  out.push(`${indent}(edit the diagram above; text outside the fence is ignored)`);
  out.push("");
  return out.join("\n") + "\n";
}

// Match a fenced block — must use 3+ backticks. Captures inner content.
const FENCE_OPEN = /^\s*```(\S*)\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;

export function parse(blockText) {
  const lines = blockText.split(/\r?\n/);
  let inFence = false;
  let baseIndent = "";
  const content = [];
  for (const raw of lines) {
    if (!inFence) {
      const m = raw.match(FENCE_OPEN);
      if (m) {
        inFence = true;
        baseIndent = raw.replace(/```.*$/, "");
        continue;
      }
    } else {
      if (FENCE_CLOSE.test(raw)) {
        // Stop at the FIRST closing fence; ignore everything after.
        break;
      }
      // Strip the base indent if present so the captured content has no extra prefix.
      const stripped = baseIndent && raw.startsWith(baseIndent) ? raw.slice(baseIndent.length) : raw;
      content.push(stripped);
    }
  }
  // Trim leading/trailing empty lines inside the fence.
  while (content.length && content[0].trim() === "") content.shift();
  while (content.length && content[content.length - 1].trim() === "") content.pop();
  const joined = content.join("\n");
  return joined.length > 0 ? joined : null;
}

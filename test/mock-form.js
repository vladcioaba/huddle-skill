#!/usr/bin/env node
// mock-form.js — manual end-to-end test of the editor roundtrip.
//
// Generates a 6-question Q&A markdown using the real template generator,
// launches the user's configured editor, blocks until close,
// parses + classifies the result, and prints a structured report.
//
// Usage: node test/mock-form.js [questions.json]
//   If no file given, uses built-in fixture.

import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInitial } from "../lib/template.js";
import { parse } from "../lib/parser.js";
import { classify } from "../lib/validator.js";
import { loadConfig, launchEditor } from "../lib/setup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE = [
  {
    qid: "Q1",
    question:
      "Use JWT or session tokens for the auth rewrite? Existing infra is JWT; sessions add server-side revocation. Default: keep JWT.",
  },
  {
    qid: "Q2",
    question:
      "Rotate signing keys daily or weekly? Compliance requires ≤ 7 days. Default: weekly.",
  },
  {
    qid: "Q3",
    question:
      "Should logout invalidate all device sessions, or only the current one? Users complain about lingering sessions on lost devices. Default: current only.",
  },
  {
    qid: "Q4",
    question:
      "Add rate limiting to /auth/refresh? Other auth endpoints have 10 req/min IP-based limits. Default: yes, same 10 req/min.",
  },
  {
    qid: "Q5",
    question:
      "Payload format for the audit log? JSON, msgpack, or protobuf — audit team consumes via Kafka. Default: JSON.",
  },
  {
    qid: "Q6",
    question:
      "Where should bcrypt cost factor be configurable? Currently hardcoded to 12 in src/auth/passwords.ts. Default: env var AUTH_BCRYPT_COST, default 12.",
  },
  {
    qid: "Q7",
    question:
      "Approve this fix?\n```js\nexport function isValid(token) {\n  return token.exp > Date.now();   // was token.exp >= Date.now()\n}\n```\nDefault: yes — `>=` allowed expired-on-the-second tokens to pass.",
  },
];

function color(code, str) {
  return process.stdout.isTTY ? `\x1b[${code}m${str}\x1b[0m` : str;
}
const dim = (s) => color("2", s);
const green = (s) => color("32", s);
const yellow = (s) => color("33", s);
const red = (s) => color("31", s);
const cyan = (s) => color("36", s);
const bold = (s) => color("1", s);

async function main() {
  const arg = process.argv[2];
  const questions = arg
    ? JSON.parse(readFileSync(arg, "utf8"))
    : FIXTURE;

  const cfg = loadConfig();
  if (!cfg) {
    console.error(red("✗ huddle not configured. Run: /huddle-setup"));
    process.exit(1);
  }

  console.log(bold(cyan("\n=== Huddle Mock Form ===\n")));
  console.log(`${dim("Editor:")}     ${cfg.editor.label} ${dim("(" + cfg.editor.cmd + ")")}`);
  console.log(`${dim("Wait mode:")}  ${cfg.editor.wait_method}`);
  console.log(`${dim("Questions:")}  ${questions.length}`);
  console.log(`${dim("Total chars:")} ${questions.reduce((acc, q) => acc + (q.question?.length || 0) + (q.context?.length || 0), 0)}`);
  console.log();

  const id = `mock-${Date.now()}`;
  const seq = 1;
  const file = join(tmpdir(), `huddle-${id}.md`);
  const content = buildInitial(id, seq, questions);
  writeFileSync(file, content);

  console.log(`${dim("File:")}       ${file}`);
  console.log(yellow("\n→ Launching editor. Fill in answers below each question, then save+close.\n"));
  console.log(dim("  (Empty answers will be reported as pending. /STOP on its own line aborts.)\n"));

  const t0 = Date.now();
  const result = launchEditor(cfg.editor.cmd, file);
  const elapsed = Math.round((Date.now() - t0) / 1000);

  console.log();
  console.log(`${dim("Editor closed after")} ${elapsed}s ${dim("(exit:")} ${result.exitCode}${dim(")")}`);
  if (result.error) {
    console.error(red(`✗ Editor error: ${result.error}`));
    process.exit(1);
  }

  const text = readFileSync(file, "utf8");
  const parsed = parse(text, questions);
  const classification = classify(parsed, questions);

  console.log(bold(cyan("\n--- Parsed answers ---\n")));
  for (const q of questions) {
    const a = parsed.answers[q.qid] ?? "";
    if (a.trim()) {
      console.log(green(`✓ ${q.qid}`) + ` ${dim(q.question)}`);
      for (const line of a.split("\n")) {
        console.log(`    ${line}`);
      }
    } else {
      console.log(yellow(`○ ${q.qid}`) + ` ${dim(q.question)}  ${dim("(pending)")}`);
    }
    console.log();
  }

  console.log(bold(cyan("--- Summary ---")));
  console.log(`Status:    ${summaryColor(classification.summary)}`);
  console.log(`Answered:  ${green(classification.counts.answered)} / ${classification.counts.total}`);
  console.log(`Pending:   ${classification.counts.pending > 0 ? yellow(classification.counts.pending) : classification.counts.pending}`);
  console.log(`Stop:      ${parsed.stop ? red("yes") : "no"}`);
  console.log();

  console.log(dim(`(file kept at ${file} for inspection — delete manually if desired)`));
}

function summaryColor(s) {
  if (s === "all_answered") return green(s);
  if (s === "user_stop") return red(s);
  return yellow(s);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

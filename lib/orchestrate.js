#!/usr/bin/env node
// orchestrate.js — single-call huddle session driver.
//
// Pipeline: questions.json → template → editor → parse → classify → (loop if pending) → bundle.
//
// Args:
//   --questions <path>           required. Path to questions.json
//   --id <string>                optional. Session ID (default: huddle-<timestamp>)
//   --seq <int>                  optional. Sequence number (default: 1)
//   --out <path>                 optional. Where to write final bundle JSON
//   --max-iterations <int>       optional. Override config.subagent.max_iterations
//   --no-loop                    optional. Single iteration only, never reopen
//
// Stdout: JSON bundle:
//   { id, iterations, summary, answers: [...], pending: [...], stop, file }
//
// Exit codes:
//   0  success (any summary)
//   1  config missing / editor not configured
//   2  invalid args / questions file
//   3  editor launch error

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildInitial, buildIteration } from "./template.js";
import { parse } from "./parser.js";
import { classify } from "./validator.js";
import { loadConfig, launchEditor } from "./setup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv) {
  const opts = {
    questions: null,
    id: null,
    seq: 1,
    out: null,
    maxIterations: null,
    noLoop: false,
    title: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--questions": opts.questions = argv[++i]; break;
      case "--id":        opts.id = argv[++i]; break;
      case "--seq":       opts.seq = parseInt(argv[++i], 10); break;
      case "--title":     opts.title = argv[++i]; break;
      case "--out":       opts.out = argv[++i]; break;
      case "--max-iterations": opts.maxIterations = parseInt(argv[++i], 10); break;
      case "--no-loop":   opts.noLoop = true; break;
      default:
        console.error(`unknown arg: ${a}`);
        process.exit(2);
    }
  }
  return opts;
}

function fail(code, msg) {
  console.error(msg);
  process.exit(code);
}

export async function orchestrate(opts) {
  const cfg = loadConfig();
  if (!cfg) fail(1, "huddle not configured. Run /huddle-setup first.");
  if (!cfg.editor?.cmd) fail(1, "huddle config has no editor. Run /huddle-setup.");

  if (!opts.questions || !existsSync(opts.questions)) {
    fail(2, `questions file not found: ${opts.questions}`);
  }

  let questions;
  try {
    questions = JSON.parse(readFileSync(opts.questions, "utf8"));
  } catch (e) {
    fail(2, `failed to parse questions JSON: ${e.message}`);
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    fail(2, "questions JSON must be non-empty array");
  }
  for (const q of questions) {
    if (!q.qid || !q.question) fail(2, `question missing qid/question: ${JSON.stringify(q)}`);
  }

  const id = opts.id || `huddle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const seq = opts.seq;
  const maxIter = opts.maxIterations ?? cfg.subagent?.max_iterations ?? 5;
  const file = join(tmpdir(), `${id}.md`);

  // Initial template
  let pending = [...questions];
  let answeredAccum = []; // [{qid, question, answer}]
  let stop = false;
  let iter = 0;

  // Template render options sourced from config (cfg.template) with safe defaults.
  const renderOpts = {
    title: opts.title ?? undefined,
    wrapWidth: cfg.template?.wrap_width,
    indentWidth: cfg.template?.indent_width,
  };

  // Initial render uses buildInitial; subsequent iterations use buildIteration.
  let content = buildInitial(id, seq, pending, renderOpts);
  writeFileSync(file, content);

  while (true) {
    iter++;
    const launchResult = launchEditor(cfg.editor.cmd, file);
    if (launchResult.error) {
      fail(3, `editor launch error: ${launchResult.error}`);
    }

    const text = readFileSync(file, "utf8");
    const parsed = parse(text, questions);

    // Classify against the *current pending set* so already-answered carry over.
    const classification = classify(parsed, pending);

    // Move newly-answered into accumulator.
    for (const a of classification.answered) {
      answeredAccum.push(a);
    }
    pending = classification.pending.map((p) => {
      const orig = questions.find((q) => q.qid === p.qid);
      return orig ?? p;
    });
    stop = parsed.stop || classification.stop;

    const done = pending.length === 0 || stop || opts.noLoop || iter >= maxIter;
    if (done) break;

    // Re-render with only pending Qs.
    content = buildIteration(
      id,
      seq,
      iter + 1,
      pending,
      answeredAccum.map((a) => a.qid),
      renderOpts,
    );
    writeFileSync(file, content);
  }

  const summary = pending.length === 0
    ? "all_answered"
    : stop
      ? "user_stop"
      : iter >= maxIter
        ? "max_iterations"
        : opts.noLoop
          ? "single_pass"
          : "incomplete";

  const bundle = {
    id,
    seq,
    iterations: iter,
    summary,
    stop,
    answers: answeredAccum,
    pending: pending.map((q) => ({ qid: q.qid, question: q.question })),
    file,
  };

  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify(bundle, null, 2));
  }
  return bundle;
}

async function cli() {
  const opts = parseArgs(process.argv);
  if (!opts.questions) {
    console.error(
      "usage: orchestrate.js --questions <path> [--id X] [--seq N] [--out <path>] [--max-iterations N] [--no-loop]",
    );
    process.exit(2);
  }
  const bundle = await orchestrate(opts);
  console.log(JSON.stringify(bundle, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

// smoke.test.js — node --test runner, exercises every lib module.
//
// Run: node --test test/smoke.test.js
//
// Covers: template + parser + validator + panels (text/checkbox/radio/
// image_picker/diagram) + state CRUD + setup decideRoute + auto-trigger.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildInitial, buildIteration } from "../lib/template.js";
import { parse } from "../lib/parser.js";
import { classify } from "../lib/validator.js";
import { getPanel, listPanels } from "../lib/panels/registry.js";

// Isolate state.js to a temp dir — must set env BEFORE importing.
const stateTmp = mkdtempSync(join(tmpdir(), "huddle-state-test-"));
process.env.HUDDLE_STATE_DIR = stateTmp;
const stateMod = await import("../lib/state.js");
const assumptionsMod = await import("../lib/assumptions.js");
const diffMod = await import("../lib/diff.js");

describe("template + parser round trip", () => {
  const questions = [
    { qid: "Q1", question: "Short question. Default: yes." },
    {
      qid: "Q2",
      question:
        "Long question that should wrap because it exceeds the configured wrap width of 80 chars per line. Default: keep current.",
    },
  ];

  test("buildInitial produces expected structure", () => {
    const md = buildInitial("test-id", 1, questions, { title: "Test" });
    assert.match(md, /^# Test\n/);
    assert.match(md, /^# id:test-id seq:1 questions:Q1,Q2$/m);
    assert.match(md, /^# Q1: Short question\. Default: yes\.$/m);
    assert.match(md, /^# Q2: Long question/m);
    assert.match(md, /^---$/m);
  });

  test("buildIteration includes iter and answered tokens", () => {
    const md = buildIteration("test-id", 1, 2, [questions[1]], ["Q1"], {
      title: "Test",
    });
    assert.match(md, /^# id:test-id seq:1 iter:2 questions:Q2 answered:Q1$/m);
    assert.doesNotMatch(md, /^# Q1:/m); // Q1 should not appear in iteration body
    assert.match(md, /^# Q2:/m);
  });

  test("parse extracts title + meta + qids", () => {
    const md = buildInitial("test-id", 1, questions, { title: "MyTitle" });
    const parsed = parse(md, questions);
    assert.equal(parsed.title, "MyTitle");
    assert.equal(parsed.meta.id, "test-id");
    assert.equal(parsed.meta.seq, 1);
    assert.deepEqual(parsed.qids, ["Q1", "Q2"]);
    assert.equal(parsed.stop, false);
  });

  test("parse captures filled answers and ignores question prose", () => {
    const filled = [
      "# Test",
      "# id:t1 seq:1 questions:Q1,Q2",
      "",
      "# Q1: Question one prose.",
      "",
      "my answer one",
      "",
      "---",
      "",
      "# Q2: Question two prose that wraps",
      "  with indented continuation line.",
      "",
      "answer two",
      "across multiple lines",
      "",
      "---",
      "",
    ].join("\n");
    const parsed = parse(filled, [
      { qid: "Q1", question: "x" },
      { qid: "Q2", question: "y" },
    ]);
    assert.equal(parsed.answers.Q1, "my answer one");
    assert.equal(parsed.answers.Q2, "answer two\nacross multiple lines");
  });

  test("STOP / CANCEL / ABORT sentinels (case-insensitive)", () => {
    for (const word of ["/STOP", "/CANCEL", "/ABORT", "/stop", "/Cancel"]) {
      const md = `# T\n# id:i seq:1 questions:Q1\n\n# Q1: x\n\n${word}\n`;
      assert.equal(parse(md).stop, true, `sentinel ${word} not detected`);
    }
    const noStop = "# T\n# id:i seq:1 questions:Q1\n\n# Q1: x\n\nyes\n";
    assert.equal(parse(noStop).stop, false);
  });
});

describe("validator.classify — filler vs valid answers", () => {
  const questions = [{ qid: "Q1", question: "?" }];

  test('"" empty → pending', () => {
    const parsed = { answers: { Q1: "" }, qids: ["Q1"], stop: false };
    assert.equal(classify(parsed, questions).pending.length, 1);
  });

  test('"?" → pending (filler)', () => {
    const parsed = { answers: { Q1: "?" }, qids: ["Q1"], stop: false };
    assert.equal(classify(parsed, questions).pending.length, 1);
  });

  test('"idk" → pending', () => {
    const parsed = { answers: { Q1: "idk" }, qids: ["Q1"], stop: false };
    assert.equal(classify(parsed, questions).pending.length, 1);
  });

  test('"N/A" → ANSWERED (valid intent)', () => {
    const parsed = { answers: { Q1: "N/A" }, qids: ["Q1"], stop: false };
    assert.equal(classify(parsed, questions).answered.length, 1);
  });

  test('"SKIP" → answered', () => {
    const parsed = { answers: { Q1: "SKIP" }, qids: ["Q1"], stop: false };
    assert.equal(classify(parsed, questions).answered.length, 1);
  });

  test('"default" → answered', () => {
    const parsed = { answers: { Q1: "default" }, qids: ["Q1"], stop: false };
    assert.equal(classify(parsed, questions).answered.length, 1);
  });

  test("normal text → answered", () => {
    const parsed = {
      answers: { Q1: "JWT, keep current" },
      qids: ["Q1"],
      stop: false,
    };
    assert.equal(classify(parsed, questions).answered.length, 1);
  });
});

describe("panels/registry", () => {
  test("lists all expected panels", () => {
    const panels = listPanels();
    assert.deepEqual(
      panels.sort(),
      ["checkbox", "diagram", "image_picker", "radio", "text"].sort(),
    );
  });
  test("unknown panel throws", () => {
    assert.throws(() => getPanel("nope"));
  });
});

describe("panels/text", () => {
  const p = getPanel("text");
  test("render wraps + indents", () => {
    const md = p.render({
      qid: "Q1",
      question:
        "A long question text that must wrap to multiple lines beyond the eighty character limit configured.",
    });
    assert.match(md, /^# Q1: A long/m);
    // continuation indented with 2 spaces
    assert.match(md, /\n {2}\S/m);
  });
  test("parse skips indented prose, captures column-0 answer", () => {
    const block = "  question prose indented\n  more prose\n\nmy answer here\n";
    assert.equal(p.parse(block), "my answer here");
  });
});

describe("panels/checkbox", () => {
  const p = getPanel("checkbox");
  test("render includes [ ] for each option", () => {
    const md = p.render({
      qid: "Q1",
      question: "Pick",
      options: ["A", "B", "C"],
    });
    assert.match(md, /\[ \] A/);
    assert.match(md, /\[ \] B/);
    assert.match(md, /\[ \] C/);
  });
  test("parse extracts [x]/[X] selected options", () => {
    const block = "[ ] A\n[x] B\n[X] C\n";
    assert.equal(p.parse(block), "B, C");
  });
  test("parse returns null when nothing selected", () => {
    assert.equal(p.parse("[ ] A\n[ ] B\n"), null);
  });
});

describe("panels/radio", () => {
  const p = getPanel("radio");
  test("render includes ( ) for each option", () => {
    const md = p.render({ qid: "Q1", question: "Pick", options: ["A", "B"] });
    assert.match(md, /\( \) A/);
    assert.match(md, /\( \) B/);
  });
  test("parse picks first (x)", () => {
    const block = "( ) A\n(x) B\n";
    assert.equal(p.parse(block), "B");
  });
});

describe("panels/diagram", () => {
  const p = getPanel("diagram");
  test("render emits fenced block with lang tag and starter", () => {
    const md = p.render({
      qid: "Q1",
      question: "Sketch",
      lang: "mermaid",
      starter: "graph LR\n  A --> B",
    });
    assert.match(md, /```mermaid/);
    assert.match(md, /graph LR/);
    assert.match(md, /A --> B/);
  });
  test("parse strips fences and indent", () => {
    const block = [
      "  ```mermaid",
      "  graph LR",
      "    A --> B",
      "  ```",
      "  (ignored after fence)",
    ].join("\n");
    const out = p.parse(block);
    assert.equal(out, "graph LR\n  A --> B");
  });
});

describe("panels/image_picker", () => {
  const p = getPanel("image_picker");
  test("render notes accepted extensions", () => {
    const md = p.render({
      qid: "Q1",
      question: "Pick photo",
      accept: ["png", "jpg"],
    });
    assert.match(md, /\.png/);
    assert.match(md, /\.jpg/);
  });
  test("parse keeps existing files only", () => {
    const tmp = mkdtempSync(join(tmpdir(), "img-test-"));
    const real = join(tmp, "real.png");
    writeFileSync(real, "x");
    const block = `${real}\n/nonexistent/file.png\n`;
    const out = p.parse(block, { accept: ["png"] });
    assert.equal(out, real);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("state.js CRUD", () => {
  test("register → list → complete → merge → stop → remove", () => {
    const meta = { id: "tx1", seq: 1, title: "T", question_count: 1, pid: process.pid };
    stateMod.registerSession(meta);
    assert.equal(stateMod.getSession("tx1").status, "waiting_user");

    stateMod.completeSession("tx1", { id: "tx1", summary: "all_answered" });
    assert.equal(stateMod.getSession("tx1").status, "done");

    stateMod.mergeSession("tx1");
    assert.ok(stateMod.getSession("tx1").merged_at);

    // remove cleans up
    stateMod.removeSession("tx1");
    assert.equal(stateMod.getSession("tx1"), null);
  });

  test("pruneOrphans marks dead-pid waiting_user as stale", () => {
    stateMod.registerSession({
      id: "ghost",
      seq: 1,
      title: "Ghost",
      pid: 9999999,
      question_count: 1,
    });
    const n = stateMod.pruneOrphans();
    assert.ok(n >= 1);
    assert.equal(stateMod.getSession("ghost").status, "stale");
    stateMod.removeSession("ghost");
  });
});

describe("assumptions.js + diff.js (merge protocol)", () => {
  const id = "merge-test";

  test("initSnapshot writes assumptions.json", () => {
    const snap = assumptionsMod.initSnapshot(id, [
      { qid: "Q1", question: "JWT or sessions?", assumption: "JWT", confidence: "high" },
      { qid: "Q2", question: "Daily or weekly?", assumption: "weekly", confidence: "medium" },
      { qid: "Q3", question: "Rate limit?", assumption: "yes 10rpm", confidence: "low" },
      { qid: "Q4", question: "Cost factor?", assumption: "12", confidence: "high" },
    ]);
    assert.equal(snap.items.length, 4);
  });

  test("appendDecision + touchPath stick to items", () => {
    assumptionsMod.appendDecision(id, "Q2", "src/auth/keystore.ts:42 wrote weekly cron");
    assumptionsMod.touchPath(id, "Q2", "src/auth/keystore.ts");
    const item = assumptionsMod.findItem(assumptionsMod.getSnapshot(id), "Q2");
    assert.ok(item.decisions_taken.includes("src/auth/keystore.ts:42 wrote weekly cron"));
    assert.ok(item.code_paths_affected.includes("src/auth/keystore.ts"));
  });

  test("diff.compute classifies match / refinement / rework / unanswered", () => {
    // Register session first (orchestrate.js does this on spawn).
    stateMod.registerSession({ id, seq: 1, title: "Merge test", pid: process.pid, question_count: 4 });
    // Simulate orchestrator bundle write.
    stateMod.completeSession(id, {
      id,
      summary: "all_answered",
      answers: [
        { qid: "Q1", question: "JWT or sessions?", answer: "JWT" }, // match
        { qid: "Q2", question: "Daily or weekly?", answer: "daily" }, // rework (acted)
        { qid: "Q3", question: "Rate limit?", answer: "yes 10rpm, return 429 with Retry-After header" }, // refinement
        // Q4 missing → unanswered
      ],
    });
    const d = diffMod.compute(id);
    const byQid = Object.fromEntries(d.items.map((i) => [i.qid, i.severity]));
    assert.equal(byQid.Q1, "match");
    assert.equal(byQid.Q2, "rework");
    assert.equal(byQid.Q3, "refinement");
    assert.equal(byQid.Q4, "unanswered");
    assert.equal(d.counts.match, 1);
    assert.equal(d.counts.refinement, 1);
    assert.equal(d.counts.rework, 1);
    assert.equal(d.counts.unanswered, 1);
    assert.equal(d.recommend_action, "rollback_and_revisit");
  });

  test("blocking when decision contains irreversible marker", () => {
    const bid = "block-test";
    stateMod.registerSession({ id: bid, seq: 1, title: "block", pid: process.pid, question_count: 1 });
    assumptionsMod.initSnapshot(bid, [
      { qid: "Q1", question: "X?", assumption: "A", confidence: "high" },
    ]);
    assumptionsMod.appendDecision(bid, "Q1", "deployed v1.0.0 to production with A");
    stateMod.completeSession(bid, {
      id: bid,
      summary: "all_answered",
      answers: [{ qid: "Q1", question: "X?", answer: "B" }],
    });
    const d = diffMod.compute(bid);
    assert.equal(d.items[0].severity, "blocking");
    assert.equal(d.recommend_action, "rollback_and_revisit");
  });

  test("merge_clean when everything matches", () => {
    const cid = "clean-test";
    stateMod.registerSession({ id: cid, seq: 1, title: "clean", pid: process.pid, question_count: 1 });
    assumptionsMod.initSnapshot(cid, [
      { qid: "Q1", question: "X?", assumption: "A", confidence: "high" },
    ]);
    stateMod.completeSession(cid, {
      id: cid,
      summary: "all_answered",
      answers: [{ qid: "Q1", question: "X?", answer: "a" }], // case-insensitive match
    });
    const d = diffMod.compute(cid);
    assert.equal(d.items[0].severity, "match");
    assert.equal(d.recommend_action, "merge_clean");
  });
});

describe("setup.launchEditor — reliability guards", () => {
  test("TTY guard: terminal editor refuses without TTY", async () => {
    const { launchEditor } = await import("../lib/setup.js");
    const tmp = mkdtempSync(join(tmpdir(), "huddle-tty-test-"));
    const f = join(tmp, "probe.md");
    writeFileSync(f, "x");
    const res = await launchEditor("vim", f, { editorKind: "term" });
    // Under `node --test`, stdin/stdout are not TTYs.
    assert.equal(res.exitReason, "no_tty");
    assert.match(res.error, /requires an interactive TTY/);
  });

  test("async spawn: exit listener resolves on child exit (GUI kind, /usr/bin/true)", async () => {
    const { launchEditor } = await import("../lib/setup.js");
    const tmp = mkdtempSync(join(tmpdir(), "huddle-async-test-"));
    const f = join(tmp, "probe.md");
    writeFileSync(f, "x");
    // /usr/bin/true exits immediately with 0 → tests the exit listener path.
    // GUI kind skips TTY guard.
    const res = await launchEditor("/usr/bin/true", f, {
      editorKind: "gui",
      idleWarnMs: 0,
      idleKillMs: 0,
    });
    assert.equal(res.exitReason, "editor_closed");
    assert.equal(res.exitCode, 0);
  });

  test("spawn_error: nonexistent binary reports exitReason=spawn_error", async () => {
    const { launchEditor } = await import("../lib/setup.js");
    const tmp = mkdtempSync(join(tmpdir(), "huddle-err-test-"));
    const f = join(tmp, "probe.md");
    writeFileSync(f, "x");
    const res = await launchEditor("/this/does/not/exist-xyz123", f, {
      editorKind: "gui",
      idleWarnMs: 0,
      idleKillMs: 0,
    });
    assert.equal(res.exitReason, "spawn_error");
    assert.match(res.error, /ENOENT|not found|no such/i);
  });
});

describe("setup.installStatusline (idempotent + chain detect)", () => {
  // Isolate ~/.claude/settings.json by setting HOME to a temp dir before importing.
  // setup.js already imported above against real HOME — re-import after env override.
  test("install creates statusLine, chain auto-detects caveman", async () => {
    const tmpHome = mkdtempSync(join(tmpdir(), "huddle-home-test-"));
    const claudeDir = join(tmpHome, ".claude");
    const fs = await import("node:fs");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: 'bash "/Users/x/.claude/hooks/caveman-statusline.sh"',
          },
        },
        null,
        2,
      ),
    );
    const prevHome = process.env.HOME;
    process.env.HOME = tmpHome;
    // Re-import setup.js with new HOME so module-level constants pick up the path.
    // node caches modules — bust with a query string.
    const mod = await import(`../lib/setup.js?t=${Date.now()}`);
    const result = mod.installStatusline();
    assert.equal(result.installed, true);
    assert.equal(result.chained, true); // detected caveman
    assert.match(result.current, /HUDDLE_STATUSLINE_CHAIN_CAVEMAN=1/);
    // Idempotent re-run
    const second = mod.installStatusline();
    assert.equal(second.skipped, true);
    // Uninstall
    const removed = mod.uninstallStatusline();
    assert.equal(removed.uninstalled, true);
    process.env.HOME = prevHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });
});

describe("setup.decideRoute", () => {
  // Avoid touching real config: directly probe DEFAULT_AUTO_TRIGGER thresholds.
  test("under threshold → inline", async () => {
    const { decideRoute } = await import("../lib/setup.js");
    assert.equal(decideRoute({ questionCount: 1, totalChars: 50 }), "inline");
  });
  test("at threshold → editor", async () => {
    const { decideRoute } = await import("../lib/setup.js");
    assert.equal(decideRoute({ questionCount: 4, totalChars: 50 }), "editor");
  });
  test("char threshold → editor", async () => {
    const { decideRoute } = await import("../lib/setup.js");
    assert.equal(decideRoute({ questionCount: 1, totalChars: 1000 }), "editor");
  });
});

// Cleanup: remove the isolated state dir on exit.
process.on("exit", () => {
  if (existsSync(stateTmp)) {
    try {
      rmSync(stateTmp, { recursive: true, force: true });
    } catch {}
  }
});

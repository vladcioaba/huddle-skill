---
description: Open editor with a Q&A form for many clarifications. User edits inline, results return as a structured bundle.
argument-hint: (no args — main Claude builds the question set from current ambiguities)
---

# /huddle

Run a clarification session by opening the user's configured editor with a Q&A markdown form. User answers inline, saves+closes, parser+validator returns a structured bundle. Loops if any questions remain unanswered (up to `subagent.max_iterations` from config, default 5).

## When to invoke

- User explicitly types `/huddle`.
- Main Claude has 4+ clarifications pending AND `setup.js auto decide` returned `editor`.
- User asked you to "open the editor" / "use the popup" / "I'll answer in Sublime".

## Steps

1. **Build the question set.** From the conversation, list the actual questions you'd ask. Each:
   - `qid`: `Q1`, `Q2`, ... (sequential, no gaps).
   - `question`: full self-contained text. Inline any context, tradeoffs, defaults — the user only sees the editor, not the surrounding chat. Markdown including code fences (` ``` `) is allowed.

2. **Write the questions JSON** to a temp file, e.g. `/tmp/huddle-questions-<timestamp>.json`:
   ```json
   [
     {"qid": "Q1", "question": "Use JWT or sessions? Existing infra is JWT; sessions add revocation. Default: JWT."},
     {"qid": "Q2", "question": "Rotate keys daily or weekly? Compliance requires ≤7 days. Default: weekly."}
   ]
   ```

3. **Run the orchestrator.** Single Bash call:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/orchestrate.js --questions /tmp/huddle-questions-<ts>.json
   ```
   Output is a JSON bundle on stdout.

4. **Parse the bundle.** Save the orchestrator's JSON output to a file
   (e.g. `/tmp/huddle-bundle-<ts>.json`) so the runner agent can Read it.

   Fields:
   - `summary`: `all_answered` | `user_stop` | `incomplete` | `max_iterations` | `single_pass`
   - `answers`: array of `{qid, question, answer}` — what the user provided.
   - `pending`: array of `{qid, question}` — anything still unanswered.
   - `stop`: boolean — user typed `/STOP`/`/CANCEL`/`/ABORT`.
   - `iterations`: how many times the editor reopened.

4b. **Run semantic triage via the huddle-runner sub-agent.** Spawn it
    with the Agent tool so the cheap Haiku model handles classification
    (clear/ambiguous/deferred/skip/invalidated/aborted), flags cross-
    question signals, and proposes follow-up text for any ambiguous
    answers. This keeps main-thread context light.

    ```
    Agent(
      subagent_type: "huddle-runner"   // or "huddle:huddle-runner" under plugin
      description: "Triage huddle bundle",
      prompt: "Read /tmp/huddle-bundle-<ts>.json and return the JSON triage per your spec."
    )
    ```

    Parse the runner's JSON. If `verdict: "needs_followup"`, you can
    optionally:
    - Build a fresh `questions.json` from each `per_question[].followup_question`
      (only for items where it's non-null).
    - Re-run `orchestrate.js` with that new question set (iteration is
      tracked inside the orchestrator).
    - Loop until verdict = `complete` or user aborts.

    If `verdict: "user_aborted"` or `"empty"`, do NOT silently retry —
    surface to the user, ask whether to redo, proceed with assumptions,
    or skip.

5. **Surface to user in chat.**
   - For each answered question: show `Q1: <question>\n→ <answer>`.
   - If `pending` non-empty + `stop=false`: tell user some questions remain, ask whether to retry (`/huddle` again) or proceed with assumptions.
   - If `stop=true`: user explicitly aborted; halt the clarification flow.
   - Then continue the original task using the answers.

6. **Cleanup.** The orchestrator leaves the markdown file in tmp for inspection. Remove if not needed:
   ```bash
   rm /tmp/huddle-questions-<ts>.json
   ```
   (Don't delete the answer markdown automatically — user may want to inspect.)

## Example invocation

```bash
TS=$(date +%s)
QFILE=/tmp/huddle-questions-${TS}.json
cat > "$QFILE" <<'JSON'
[
  {"qid":"Q1","question":"..."},
  {"qid":"Q2","question":"..."}
]
JSON
node ${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/skills/huddle}/lib/orchestrate.js --questions "$QFILE"
```

## Notes

- The orchestrator is synchronous — it blocks until the user closes the editor. Async (run-in-background) is planned for a future version.
- Concurrent `/huddle` sessions in the same chat are not yet supported (planned).
- If `huddle not configured` error: tell user to run `/huddle-setup` first.
- The orchestrator does NOT call any sub-agent yet (Haiku integration planned). Today it's pure shell pipeline.

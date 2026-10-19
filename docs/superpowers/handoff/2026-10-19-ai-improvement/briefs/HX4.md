# HX4: Small harness fixes (summary save, RESUME error case, copy retry, resummarize --date)

Dev harness only (`eval/novel`, `.claude/workflows`). No product code, no packages, no AI calls. Agent docs and CLI messages stay English (README is Korean). CLAUDE.md's Korean-copy and `AppError` rules cover product code under `src/`. `eval/novel` is a dev harness outside `src/`, so its messages and plain `Error` throws stay English; keep the CLI error text consistent with that.

## Goal

1. The summary agent writes into the run side (`eval/results/novel/<date>/summary.md`), and a node command copies it into `docs/eval/novel/<date>/summary.md` (same pattern as reviews). No agent writes under `docs/`.
2. `resume-note.md` handles status `error`.
3. A new CLI command `publish` copies a file with up to 3 attempts. The workflow uses it for review and summary copies. A rerun copies a missing docs review even when `review.md` already exists.
4. `resummarize --date` skips runs whose worker is alive, rebuilds the rest, and reports the skipped ones (exit 0).

## Evidence (numbers; all verified in code)

- Summary save: `summaryPrompt` (`.claude/workflows/novel-eval.js:188-202`) tells the agent to write `${REPO}/docs/eval/novel/${date}/summary.md`; `agents/summary.md:39` says "Write only docs/eval/novel/<date>/summary.md". The tool guard blocked it; the 2026-10-18 summary was saved by hand (`docs/eval/novel/follow-up-ai-improvement.md:150`, which says only "도구 안전장치"). The guard is not defined in the repo: `grep` over `.claude/settings*.json`, `.claude/hooks` and every file in this brief's file list finds no rule for it, so it is a harness or permission-layer rule outside the repo whose exact path and pattern are unknown. Whether `eval/results/novel/<date>/summary.md` is writable by the summary agent is therefore unverified (reviewers write `eval/results/novel/<date>/<run>/review.md` there, a different file); see the manual check in Tests. The summary call result is discarded (`novel-eval.js:369-375`). Current automatic success: 0 of 1.
- RESUME: `resume-note.md:10` lists 4 statuses (`paused-limit`, `paused-error`, `blocked`, `iteration-limit`); step 3 (`:22-27`) has 5 bullet lines (two for `paused-limit`) covering 4 statuses. The workflow also sends `error` in 3 places (`novel-eval.js:101` via `runnerStatus`, `:292` same-pending stop, `:318-320` runner error). `RunStatus` (`state.ts:18-19`) has no `error`, so `state.json` can still say `pending`/`running`.
- Copy: `copyPrompt` (`:169-178`) is one attempt; failure logs and returns null (`:242-245`). On rerun `reviewRun` returns `skipped` when `review.md` exists (`:210-221`) without checking docs. Retries: 0.
- Resummarize: `resummarizeRun` throws when `workerAlive(dir)` (`cli.ts:425`); `resummarizeDate` (`:451-459`) maps with no catch. The first live run aborts the date: earlier runs already rewritten, later ones skipped, CLI prints `{"error":...}` exit 1. No test covers the live-worker case (`cli.test.ts:58-123`).
- `docs/eval/novel/README.md:90` says the same pending item stops after 5 repeats; code says `MAX_SAME_PENDING = 30` (`novel-eval.js:41`). Doc is stale.
- No review of 2026-10-18 shows a harness failure (0 of 6 runs). Fixes are from code reading, not from failures.

## Files

Write (existing, verified):
- `eval/novel/cli.ts` (add `publish` command; `resummarizeDate` skip)
- `eval/novel/cli.test.ts` (new resummarize tests)
- `eval/novel/agents/summary.md`
- `eval/novel/agents/resume-note.md`
- `.claude/workflows/novel-eval.js`
- `docs/eval/novel/README.md` (lines ~85-110: resume section copy rule, 5 -> 30, resummarize bullets, publish)

Create (do not exist yet):
- `eval/novel/publish.ts`
- `eval/novel/publish.test.ts`
- `eval/novel/workflow-static.test.ts` (offline text checks of the workflow file)

Read-only: `eval/novel/worker-lock.ts` (`workerAlive`), `eval/novel/agents/reviewer.md` (writes only `<dir>/review.md`, line 12), `eval/novel/state.ts`, `eval/novel/steps/finish.ts` (no change), `docs/eval/novel/follow-up-ai-improvement.md`, `vitest.config.ts` (includes `eval/**/*.test.ts`).

Do NOT touch: `REPO` constant (`novel-eval.js:14`) and the 5 `/Users/taehyeong/...` agent-doc lines listed under Open questions. `worker-lock.ts`, `state.ts`, `finish.ts` stay unchanged.

## Design (do in this order)

1. TDD first: write `eval/novel/publish.test.ts` and the two new `cli.test.ts` cases (see Tests); add `workflow-static.test.ts` once the workflow edit is done. Run them, see them fail.
2. Create `eval/novel/publish.ts` with `publishFile` (see Interface). Rules:
   - `root = o.root ?? process.cwd()`; `src = path.resolve(root, o.src)`, `dest = path.resolve(root, o.dest)`.
   - Guard: `src` must be inside `<root>/eval/results/novel`, `dest` inside `<root>/docs/eval/novel` and end with `.md`. Use `rel = path.relative(base, abs)`; reject when `rel === ''` (the path is the base folder itself), `rel === '..'`, `rel.startsWith('..' + path.sep)`, or `path.isAbsolute(rel)`. Do not reject a name that merely starts with two dots (for example `..notes.md`); test 10b covers it. On violation `throw new Error('publish: src must be under eval/results/novel and dest under docs/eval/novel')` (CLI turns a throw into the usual `{error}` line).
   - If `!existsSync(src)` return `{ status: 'failed', dest, error: 'source not found: <src>', attempts: 0 }` (no retry, no dest written).
   - If `o.ifMissing && existsSync(dest)` return `{ status: 'skipped', dest, error: null, attempts: 0 }`.
   - Loop `attempts` (default 3, minimum 1): `mkdirSync(path.dirname(dest), { recursive: true })`, then `(o.copy ?? copyFileSync)(src, dest)`. On throw keep the message and try again. No sleep. After success return `{ status: 'copied', dest, error: null, attempts: n }`; after all fail return `{ status: 'failed', dest, error: <last message>, attempts }`. Never throws for copy errors.
   - `dest` in the result is the path as resolved (absolute).
3. `eval/novel/cli.ts`: import `publishFile`. In `dispatch` add `case 'publish'`:
   `return publishFile({ src: stringFlag(flags,'src'), dest: stringFlag(flags,'dest'), ifMissing: flags['if-missing'] === true, attempts: optionalNumber(flags,'attempts') })`.
   Update the header comment list (line 35) and the usage string (line 542) to include `publish`. `publish` exits 0 whenever it returns a `PublishResult` (status `copied`, `skipped` or `failed` lives in the JSON); it exits 1 only when a guard error is thrown (then the line is `{"error":...}`). Note `parseFlags` makes `--if-missing` a boolean only when the next token starts with `--` or is absent, so always put `--if-missing` last.
4. `eval/novel/cli.ts` `resummarizeDate`: change signature to return `ResummarizeOutcome[]` (type in Interface). In the final `.map`, for each run dir: `if (workerAlive(d)) return { dir: d, skipped: 'worker-running' }` else `resummarizeRun(d)`. Keep `resummarizeRun` unchanged (still throws on a live worker). Keep name-order and `dir` on every entry. Update the doc comment above it. No change to `dispatch` (it returns the array; exit stays 0).
5. `.claude/workflows/novel-eval.js`:
   a. Add `const summaryResultPath = () => \`eval/results/novel/${date}/summary.md\`` and `const docsSummaryPath = () => \`docs/eval/novel/${date}/summary.md\`` next to `docsReviewPath` (line 77).
   b. Replace `copyPrompt(run, dir)` (line 169) with `publishPrompt(src, dest, ifMissing)`: a runner prompt (Bash only, no file edits) that runs `cd ${REPO} && pnpm eval:novel publish --src ${src} --dest ${dest}${ifMissing ? ' --if-missing' : ''}` with Bash timeout 120000 ms, reads the last JSON line, returns `status` = its `status` value (`copied`, `skipped` or `failed`) and `detail` = the JSON line verbatim. Read the JSON `status` first: a line with `status` decides the result whatever the exit code. Use the exit code only when no JSON line exists or the line has only an `error` field (a thrown guard error exits 1): then return status `failed` with the error text or the command output.
   c. Add `async function publish(src, dest, ifMissing, label)`: loop at most 2 runner calls via `agentLogged(publishPrompt(...), { label: \`publish ${label}\`, phase: 'Review', model: 'haiku', schema: RUNNER_SCHEMA })`; stop when `runnerStatus(result)` is `copied` or `skipped`; log each failure with its detail; return the result on success, `null` after both fail. Log the final status it accepted (`publish <label>: copied|skipped`). A `skipped` answer is valid only when `ifMissing` is true: when `ifMissing` is false, treat `skipped` as a failure (log it, count it as an attempt, return `null` after the second). Never retry after a `failed` result whose `detail` JSON has `attempts` 0 and `error` containing `source not found` or after a thrown guard error (the retry cannot succeed); return `null` at once.
   d. `reviewRun`: keep the exists check (`reviewExistsPrompt`) but stop using it to skip the copy. Cases (`publish` returns null on failure in every case; log the failure and return `null`):
      - `rereview` false, check says `exists`: `publish(\`${dir}/review.md\`, docsReviewPath(run), true, label)` (copies only when the docs file is missing); log `review.md exists, reviewer skipped; docs copy: <status>`; return `'skipped'` when it did not return null.
      - `rereview` false, check says `missing`: run the reviewer (null result: log, return `null`), then `publish(..., false, label)`; return its `detail`.
      - `rereview` false, check is neither `exists` nor `missing`: log `could not check review.md, review skipped`, return `null` (unchanged).
      - `rereview` true: no exists check, run the reviewer, then `publish(..., false, label)` so the copy overwrites; return its `detail`.
      Keep existing log texts where possible; update the comment above `reviewRun`. `meta.whenToUse` wording is unchanged.
   e. Summary phase (lines 369-375): after `agentLogged(summaryPrompt(results), ...)` returns non-null, call `publish(summaryResultPath(), docsSummaryPath(), false, 'summary')` and log `summary copy: copied|failed`. If the agent returned null, log and skip the copy.
   f. `summaryPrompt` line 200: change to ``Write ${REPO}/${summaryResultPath()} as the instructions say. Do not write under docs/.`` Keep line 199 (read reviews under `docs/eval/novel/<date>/`).
6. `eval/novel/agents/summary.md`: line 9 and step 4 (line 19) and step 5 reply (line 27): output is `eval/results/novel/<date>/summary.md` (create the folder if missing); say a later step copies it into `docs/eval/novel/<date>/`. Rule line 39: "Write only `eval/results/novel/<date>/summary.md`. Do not write under `docs/`. Do not edit any other file." Reply line becomes `wrote eval/results/novel/<date>/summary.md`. Reading reviews from `docs/` stays.
7. `eval/novel/agents/resume-note.md`:
   - Line 10: add `error` to the status list: "(`paused-limit`, `paused-error`, `blocked`, `iteration-limit`, or `error`)".
   - Step 1: add "The passed `status` wins. `state.json` may still say `new`, `running` or `pending` because `error` and `iteration-limit` are workflow statuses that are never saved there."
   - Step 3: add bullet `error`: the workflow stopped the run, not the model. Two causes. (a) `detail` is an error text from `init`/`advance` or a missing runner result: quote it, call it transient (network, timeout, 5xx, no result) or structural (bad args, missing key, schema) as for `paused-error`; transient: rerun now. (b) `detail` starts with `the same pending item came back`: the author's answers do not clear the item. Do NOT say to rerun first. Read `<dir>/pending.json` and `<dir>/answer.error.txt` (if present), name the pending kind and why the answer is rejected, and say to fix `author.md` or answer by hand before rerunning.
   - Update the **When to retry** line in step 4 only if needed; The limit of 40 lines applies to the `RESUME.md` output (agent Rules section). The agent file itself (45 lines now) may grow; do not trim it to fit.
8. `docs/eval/novel/README.md` (Korean): (a) review skip sentence (line ~89): `review.md`가 있으면 검토는 건너뛰지만 `docs/eval/novel/<날짜>/` 복사본이 없으면 복사만 다시 한다; (b) line ~90 "다섯 번" -> "서른 번"; (c) resummarize bullets (lines 109-110; the worker-refusal bullet is line 110): replace its sentence with "`--dir <실행>`은 실행 하나를 다시 계산하고, 워커가 잡고 있으면 오류로 멈춘다. `--date <날짜>`는 날짜 폴더의 모든 실행을 다시 계산하고, 워커가 잡은 실행은 건너뛰어 `skipped: \"worker-running\"`으로 알린다."; (d) add a line on `pnpm eval:novel publish --src <실행 폴더 파일> --dest <docs 파일> [--attempts N] [--if-missing]`; (e) 요약은 `eval/results/novel/<날짜>/summary.md`에 쓰고 복사한다.
9. Run the Definition of done commands. Workflow JS and agent `.md` files cannot run under vitest, and `node --check` fails on the top-level `return`, so re-read the edited JS carefully for undefined names.

## Interface

```ts
// eval/novel/publish.ts
export type PublishOptions = {
  src: string // path relative to root (or absolute), must be under eval/results/novel
  dest: string // under docs/eval/novel, ends with .md
  root?: string // default process.cwd()
  attempts?: number // default 3
  ifMissing?: boolean // skip when dest exists
  copy?: (src: string, dest: string) => void // test seam, default fs.copyFileSync
}
export type PublishResult = {
  status: 'copied' | 'skipped' | 'failed'
  dest: string // absolute
  error: string | null
  attempts: number // copy attempts made
}
export function publishFile(o: PublishOptions): PublishResult

// eval/novel/cli.ts
export type ResummarizeOutcome = ResummarizeResult | { dir: string; skipped: 'worker-running' }
export function resummarizeDate(folder: string): ResummarizeOutcome[]
// CLI: pnpm eval:novel publish --src <p> --dest <p> [--attempts N] [--if-missing]   (one JSON line = PublishResult)
```

## Tests (TDD)

`eval/novel/publish.test.ts` (tmp root via `mkdtempSync`; create `<root>/eval/results/novel/2026-10-18/summary.md` and use `root`):
1. `copies the source and creates the date folder`: src text T, no docs folder. Expect `status 'copied'`, `attempts 1`, dest bytes equal T.
2. `replaces an existing destination`: dest has old text. Expect dest equals new text.
3. `ifMissing keeps an existing destination`: dest has old text, `ifMissing: true`. Expect `status 'skipped'`, dest unchanged, `attempts 0`.
4. `ifMissing copies when the destination is missing`: expect `copied`.
5. `retries a failing copy`: `copy` throws twice then writes. Expect `copied`, `attempts 3`.
6. `reports failure after all attempts`: `copy` always throws `Error('disk full')`. Expect `failed`, `attempts 3`, `error 'disk full'`, no throw.
7. `attempts option is honored`: `attempts: 1` with failing copy. Expect `attempts 1`.
8. `missing source fails without copying`: expect `failed`, `error` contains `source not found`, `attempts 0`, no dest file.
9. `rejects paths outside the allowed folders`: dest `docs/other.md`, and src `package.json`. Expect `toThrow(/publish:/)`.
10. `rejects a dest that escapes with ..`: `docs/eval/novel/../../x.md`. Expect throw.

`eval/novel/cli.test.ts` (add inside `describe('resummarize')`; import `workerAlive` not needed; use `acquireLock`/`releaseLock` already imported):
11. `skips a run whose worker is alive and rebuilds the others`: `initRun` run-01-ko and run-02-en under one folder; `acquireLock(run-01-ko)` (this pid, live); delete `run-02-en/run-summary.json` if present; call `resummarizeDate(folder)`. Expect no throw; result `[{ dir: run-01-ko, skipped: 'worker-running' }, { dir: run-02-en, chapters: 0, calls: 0 }]`; `run-02-en/run-summary.json` exists. Before the call, pre-write a sentinel `run-01-ko/run-summary.json` with the fixed string `SENTINEL`; after the call its content must still equal `SENTINEL` exactly (a wrongly rebuilt live run would overwrite it). `releaseLock` in `finally`.
10b. In `publish.test.ts`: `allows a name that starts with two dots`: src `eval/results/novel/2026-10-18/..notes.md` (create it) and dest `docs/eval/novel/2026-10-18/..notes.md`. Expect `copied`, no throw.
12. `a single run with a live worker is still refused`: `acquireLock(dir)` then `expect(() => resummarizeRun(dir)).toThrow(/a worker is running/)`; `releaseLock`.
13. Existing test `rebuilds every run dir under a date folder` must still pass unchanged (`results.map((r) => r.dir)`).

`eval/novel/workflow-static.test.ts` (new; offline proxy that reads the workflow as text, no import). Use an explicit, cwd-independent path: `const text = readFileSync(new URL('../../.claude/workflows/novel-eval.js', import.meta.url), 'utf8')` (two levels up from `eval/novel/` is the repo root), so the test passes when vitest runs from a subdirectory or an IDE:
14. `copyPrompt is gone`: text does not contain `copyPrompt`.
15. `publish and publishPrompt calls match the signatures`: calls contain nested parentheses (for example `publish(summaryResultPath(), docsSummaryPath(), false, 'summary')`), so a `publish\(([^)]*)\)` regex is NOT allowed. Use a small paren-depth scanner: for each match of `/\bpublish(Prompt)?\(/g` that is not preceded by `function ` or `async function `, start after the `(`, track depth (`(` +1, `)` -1, ignoring parens inside quotes and template-literal text is not needed for the planned call sites), split on commas at depth 0, and stop when depth returns to 0. Expect 3 arguments for `publishPrompt` and 4 for `publish`. Do not match `publish(` inside `publishPrompt(` or in the `label: \`publish ${label}\`` string (the `\b` plus the `(` right after the name excludes both). Also assert with `toContain` the exact summary call site `publish(summaryResultPath(), docsSummaryPath(), false, 'summary')`. Require at least 1 `publishPrompt(` call and at least 3 `publish(` calls so an empty scan cannot pass.
16. `summaryPrompt does not name a docs write path`: the body of `function summaryPrompt` (from its start to the next top-level `function` or `const`) does not contain ``docs/eval/novel/${date}/summary.md`` and does contain `summaryResultPath()`.
17. `docsSummaryPath is the only place that names the docs summary path`: the string `docs/eval/novel/${date}/summary.md` occurs exactly once in the file.

Manual check for the unidentified guard (cannot run offline): run the summary phase once (`/novel-eval` with `summary: true`, `runs: []`) on a date that has reviews, and confirm `eval/results/novel/<date>/summary.md` exists and `docs/eval/novel/<date>/summary.md` appears after the publish step. If the agent is blocked, see Risks.

These check text only. Live behavior (rerun copies a missing docs review, retries, summary copy) cannot be measured offline and is manual, see the metrics table. The agent `.md` files have no automated test. Manual check: after editing, `grep -n copyPrompt .claude/workflows/novel-eval.js` must print nothing, and every `publish(`/`publishPrompt(` call must match the signatures in Design step 5.

## Acceptance metrics

| Metric | Current | Target |
|---|---|---|
| Agent writes under `docs/` in summary phase (static proxy; real agent behavior needs a live run) | 1 (summary agent) | `grep -n 'docs/eval/novel/${date}/summary.md' .claude/workflows/novel-eval.js` prints exactly one line, the `docsSummaryPath` definition |
| Copy attempts per review copy (unit-tested in `publish.test.ts` tests 5-7; runner-call count is manual) | 1 | up to 3 inside CLI, up to 2 runner calls |
| Rerun with `review.md` present and docs copy missing | skipped, never copied | docs copy created (`publish --if-missing`) |
| `resummarize --date` with 1 live run of 2 | throws, exit 1, partial rewrite | no throw, 1 rebuilt, 1 `skipped` entry (test 11). Exit 0 is not unit-tested (`RESULTS_DIR` is cwd-relative); it follows from `main` returning 0 unless a throw occurs, checked by reading `dispatch`/`main` |
| Statuses covered by `resume-note.md` step 3 | 4 of 5 sent by workflow | 5 of 5 (`error` added) |
| New unit tests | 0 | 11 publish tests (1-10 and 10b) + 2 cli tests (11-12) + 4 static workflow tests (14-17) = 17 passing |
| Summary agent doc names a docs write path (static) | `agents/summary.md` says "Write only docs/eval/novel/<date>/summary.md" | `grep -n 'docs/eval/novel/<date>/summary.md' eval/novel/agents/summary.md` prints nothing (reading reviews from `docs/eval/novel/<date>/` is allowed only as a path without `summary.md`) |
| Workflow offline proxy | none | `eval/novel/workflow-static.test.ts` (new, see Tests) passes |
| Live-run behavior: rerun with `review.md` present and docs copy missing gives a docs copy; copy attempts per review copy; summary copy success | not measurable offline | manual check on the user's machine (where `REPO` points to a real checkout), after a rerun; not checkable in this environment |

## Dependencies on other tracks

None blocking. Same-file conflicts: HX1 (`reviewerPrompt`, `runDir`), HX3 (`authorPrompt`), F4 (`MODEL_QUEUES`, parallel queues, `cli.ts` advance/worker) edit `novel-eval.js` and `cli.ts`. Land HX4 first or rebase after them; do not run in parallel. If HX1 changes the review output path or `<model>-<lang>.md` name, `publishPrompt` call sites in `reviewRun` must follow `docsReviewPath`.

## Risks

- Workflow JS has no tests; a typo breaks every run. Re-read carefully, keep edits minimal, keep `agentLogged` pattern, do not use `Date.now`, `Math.random`, `new Date`.
- `--if-missing` swallowed value: always last flag in the prompt string.
- Guard prefixes are relative to cwd; the runner does `cd ${REPO}` first, so paths in prompts must stay repo-relative (`dir` from `runDir` is `eval/results/novel/<date>/run-NN-lang`).
- Do not weaken `workerAlive` or `acquireLock`. Do not change the `resummarizeRun` throw.
- `rereview: true` must keep overwriting the docs copy and must not skip it.
- The summary agent might still be blocked from `eval/results` (the guard that blocked `docs/` is unidentified and outside the repo). Reviewers already write under `eval/results/novel/<date>/<run>/`, so unlikely, but unproven for `<date>/summary.md`. Mitigation: the manual check in Tests (run the summary agent once and confirm the file appears); if it is blocked, fall back to having the workflow take the agent's returned text and save it with a node command, and report that in the handoff.
- Pid reuse can make a dead run look live in `resummarizeDate` (existing behavior, accepted).

## Open questions (defaults to use if nobody answers)

1. Hard-coded `REPO = '/Users/taehyeong/...'` (`novel-eval.js:14` and 5 agent-doc lines: `reviewer.md:14`, `summary.md:12`, `resume-note.md:16` and `:37`, `author.md:12`): leave unchanged; out of scope for HX4.
2. `error` in RESUME: retry now for transient errors, inspect first for the same-pending case (as in step 7).
3. `runOne` catch (`novel-eval.js:336-341`) records `error` without a RESUME.md: leave unchanged (not in the four items).
4. Copy attempts: 3 inside CLI, 2 runner calls.
5. Skipped live runs in `resummarize --date`: exit 0 with a `skipped` entry.

## Definition of done

```
pnpm vitest run eval/novel/publish.test.ts eval/novel/workflow-static.test.ts eval/novel/cli.test.ts eval/novel/steps/finish.test.ts eval/novel/state.test.ts eval/novel/run.test.ts --maxWorkers=2
pnpm exec tsc --noEmit 2>&1 | grep -E "eval/novel/(publish|cli)"   # expect no lines
pnpm eslint eval/novel/publish.ts eval/novel/publish.test.ts eval/novel/workflow-static.test.ts eval/novel/cli.ts eval/novel/cli.test.ts
pnpm prettier --check eval/novel/publish.ts eval/novel/publish.test.ts eval/novel/workflow-static.test.ts eval/novel/cli.ts eval/novel/cli.test.ts docs/eval/novel/README.md
grep -n "taehyeong" .claude/workflows/novel-eval.js   # still only line 14 (unchanged on purpose)
grep -n "copyPrompt" .claude/workflows/novel-eval.js   # no output (function replaced by publishPrompt)
grep -n 'docs/eval/novel/${date}/summary.md' .claude/workflows/novel-eval.js   # exactly one line (docsSummaryPath)
```

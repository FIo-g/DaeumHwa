# HX1 Brief: Reviewer blinding (cloud branch)

Reader: a small model implementing with TDD in an isolated worktree. Follow the steps in order. Do not touch anything outside the Files section. Repo root: `/home/xogud/documents/github/DaeumHwa`. All paths below are repo-relative.

## Goal

The Sonnet reviewer must never see which model produced a run before it writes its scores. Today it reads `calls/*.json` (field `model`) and the run dir. Fix: before review, the workflow builds a blinded copy of the run (`eval/results/novel/<date>/blind/run-NN-<lang>/`), the reviewer reads and writes only inside that copy, and a separate step afterwards adds the model id to the review header and copies it to `docs/`.

Decision (do not re-litigate): read-time blind copy ("Option A"). The stored `calls/*.json`, `config.json`, `eval-client.ts` and `CallRecord` stay unchanged (the plan's interface and comparability with the published 2026-10-18 reviews depend on it). `src/` is not touched.

## Evidence (numbers)

- 4 of 6 reviews of round 2026-10-18 admit seeing the `model` field before scoring: `docs/eval/novel/2026-10-18/summary.md:268`; `qwen3.8-27b-en.md:8`, `haiku-5.5-en.md:7`, `haiku-5.5-ko.md:353`, `luna-6-en.md:229`. (The two ko pilot reviews, qwen and luna, say nothing, so they are unverified.)
- Every call record has `model` (written at `eval/novel/eval-client.ts:486`, file write `:507-509`). qwen/ko had 32 call files, so 32 leaks in one run.
- Blinding today is prompt-only: `eval/novel/agents/reviewer.md:30-34` ("do not open config.json"). The reviewer can still `ls -R` the run dir (`reviewer.md:20`), which holds `config.json` (`modelId`), `db/`, `RESUME.md`.
- Other leaks in calls/: `effortRequested` (`eval-client.ts:487`, local `max`, cloud `high`), `maxTokens` (`:488`, floor 8192 for exaone vs 32000), `speed.source` (`'ollama'` vs `'wall'`, `:30-34`, `steps/finish.ts:73`), and `error.message` (may echo the model tag; `CONFIG_PATTERN` at `eval-client.ts:99` matches `model .*not found`). `reviewer.md:57` even orders the reviewer to report `source`.
- `productTimeoutMs` (`eval-client.ts:50`) also fingerprints the queue: `LOCAL_TIMEOUT_MS = 3_600_000` vs `CLOUD_TIMEOUT_MS = 900_000` (`models.ts:35-36`). It is deleted in the blind copy (`wouldTimeOut`, a boolean, stays).
- Provider words can leak through error text and logs: `CONFIG_PATTERN` (`eval-client.ts:98`) includes "not found, try pulling" (an Ollama message) and `worker.log` holds Ollama stderr. The needle list holds only model ids, so `ollama` and `opencode` are masked separately.
- The reviewer also reads files that are copied as-is today and may hold AI-written text: `reader/*.json` (written at `eval/novel/steps/chapter.ts:369`), `wiki-final.json`, `author-decisions.jsonl`. They are masked too (never `chapters/`).
- Reviewer-read docs name models: `docs/eval/novel-quality-criteria.md:3,5,134,156,164,171` (Haiku on 3, 134, 164; Luna on 134; Sonnet on 5, 156, 164; Opus on 3, 171) and `docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` section 9 (line 285 heading, ~301 "Haiku와 Luna"). The blind copy ships masked copies of both.
- No model field (checked): `run-summary.json` (but has `speed`), `wiki-final.json`, `metrics/`, `chapters/`, `author-decisions.jsonl`, `state.json` (only via `failed[].message`). They can still carry model words written by an AI, so every file except `chapters/` is masked anyway (cheap and safe: no needle can match ordinary story words).
- `eval/results/` and `node_modules/` do not exist in this checkout, so no real run was inspected. Tests build their own fixtures.

## Files

Write (existing, edit):
- `eval/novel/cli.ts`: add commands `blind` and `publish-review`; update usage text (line ~542) and the header comment (line 35).
- `eval/novel/agents/reviewer.md`: read only the blind dir; drop config.json and speed instructions.
- `.claude/workflows/novel-eval.js`: add the blind step, point the reviewer at the blind dir, publish with the header.
- `eval/novel/cli.test.ts`: add CLI tests (append a `describe`; do not change existing tests).

Create (new):
- `eval/novel/blind.ts`
- `eval/novel/blind.test.ts`

Setup (once, before the first test): the worktree has no `node_modules`. First check: if `node_modules` exists, skip the install. If it is missing, run `pnpm install --frozen-lockfile --offline` first (works only when the pnpm store has the packages). If that fails and the registry is unreachable (the install error mentions network, ENOTFOUND, or a blocked host), stop and report it as a setup problem (or ask for `registry.npmjs.org` to be added to the allowed domains). Do not try other ways to get the packages (no copying `node_modules` from another folder, no other package manager). The install is install only: do not add, remove or upgrade a package, `package.json` and the lockfile must stay unchanged. Without `node_modules` the Definition of done commands fail on setup, not on the code, so do not read such a failure as a code failure.

Read-only (do not edit): `eval/novel/eval-client.ts` (CallRecord, lines 36-60), `eval/novel/models.ts` (MODEL_PROFILES, lines 39-106), `eval/novel/state.ts` (`loadConfig`), `eval/novel/steps/util.ts` (`readCallRecords`, line 155), `eval/novel/steps/finish.ts` (`buildRunSummary`, line 101), `eval/novel/agents/summary.md` (line 22 reads `run-summary.json` of the REAL dir for the speed table, so removing speed from the blind copy loses nothing downstream), `docs/eval/novel-quality-criteria.md`, the spec file above.

Do NOT edit `eval-client.ts`, `steps/finish.ts`, `state.ts`, `run.ts`, `models.ts` (other tracks edit them).

## Design (ordered)

1. `eval/novel/blind.ts`, constants and `modelNeedles()`. `export const BLIND_LABEL = '[masked]'`. `modelNeedles(): string[]` builds, for every `MODEL_PROFILES` entry whose `id !== 'fake'`: `profile.id`, `profile.model`, `profile.id` with `.` replaced by `-` (for example `haiku-5-5`), and the base Ollama tag: `profile.model` with a trailing `-<variant>` removed when it ends with `-mlx` or `-gguf` (today only `qwen3.8:27b-mlx` gives `qwen3.8:27b`; `gpt-oss:20b` and `exaone3.5:32b` already are base tags). Ollama prints the base tag in stderr, `worker.log` and error text, so it must be a needle. Dedupe, sort by length descending. Never include `'fake'`, bare `haiku`, bare `luna` (a character may be called Luna).
2. `maskModelNames(text: string): string`: replace every needle (case-insensitive, regex-escaped, longest first) with `BLIND_LABEL`.
2b. `maskProviderNames(text: string): string`: replace the words `ollama` and `opencode` (case-insensitive, whole substring) with `BLIND_LABEL`. `maskBrandWords(text: string): string` replaces the words `Claude`, `Anthropic`, `Qwen`, `EXAONE`, `Sonnet`, `Opus`, `Haiku`, `gpt-oss` with `BLIND_LABEL`, case-insensitive, matched with `(?<![A-Za-z])word(?![A-Za-z])` (so `haikus` and `magnum opus`-style words inside longer letters are kept, `Qwen3` still matches). `Claude` is not masked when directly followed by ` v<digit>` (the criteria doc cites `Claude v1.3` as a literature benchmark at lines 42, 144, 224; use `Claude(?!\s+v\d)`). It never masks `Luna` or `루나`. A model can name itself in call output ("I am Claude Haiku"); the id needles alone would miss that. `maskOperationalText(text: string): string` = `maskBrandWords(maskProviderNames(maskModelNames(text)))`. `maskModelNames` stays id-only (test 3 depends on it). Use `maskOperationalText` (not `maskModelNames` alone) for everything under `calls/`, `state.json`, `run-summary.json`, `worker.log`, `reader/`, `wiki-final.json`, `author-decisions.jsonl` and `metrics/` text. Never for `chapters/`.
3. `maskReferenceText(text: string): string`: first `maskOperationalText`, then replace the words `Haiku`, `Luna`, `Sonnet`, `Opus`, `Qwen`, `EXAONE`, `gpt-oss` (case-insensitive) with `[모델]`. Because `maskOperationalText` already masks `Haiku`, `Sonnet`, `Opus`, `Qwen`, `EXAONE`, `gpt-oss`, `Claude` and `Anthropic` to `[masked]`, what `maskReferenceText` adds is `Luna` (and a second pass is harmless). Used only for the two reference docs, never for chapters. Leave `GPT-4`, `Claude v1.3` (literature citations) alone; the `Claude(?!\s+v\d)` rule in `maskBrandWords` keeps `Claude v1.3` intact.
4. `blindCallRecord(call: CallRecord): BlindedCall`: deep-map every string value through `maskOperationalText` (including `prompt`, `output` strings, `error.message`), set `model` to `BLIND_LABEL`, delete `effortRequested`, `maxTokens`, `productTimeoutMs` and `speed`. Keep everything else (`durationMs`, `firstTokenMs`, `usage`, `wouldTimeOut`, `contextOverflow`, `hangulLeft`, `error.kind`). `productTimeoutMs` goes because it is 3_600_000 for local and 900_000 for cloud profiles; `wouldTimeOut` (a boolean the reviewer needs for the operations score) stays. Do not mutate the input.
5. `blindJson(value: unknown): unknown`: deep-mask strings with `maskOperationalText`. `blindRunSummary(summary)`: `blindJson` then delete top-level `speed`. State goes through `blindJson` only.
6. `defaultBlindDir(runDir)`: `path.join(path.dirname(runDir), 'blind', path.basename(runDir))`. This folder has no `config.json`, so `resummarizeDate` (`cli.ts:451`) ignores it.
7. `writeBlindCopy(runDir, opts?)` returns `{ dir, files }`. `out = path.resolve(opts?.out ?? defaultBlindDir(runDir))`. Steps: throw `Error('not a run dir: ...')` if `runDir/config.json` is missing; throw `Error('unsafe blind output dir: ...')` if `out` equals `path.resolve(runDir)`, is an ancestor of it (for example `eval/results/novel/<date>`), or is inside it (check with `path.relative`); only then `rmSync(out, {recursive, force})` and `mkdirSync`. Allow-list only (never copy anything else, so `config.json`, `db/`, `pending.json`, `answer*.json`, `worker.pid`, `RESUME.md`, `review.md` are never copied):
   - `chapters/` copied verbatim and recursively (skip if missing). This is the only verbatim copy;
   - `metrics/`, `reader/` (recursive), `author-decisions.jsonl`, `wiki-final.json` (skip if missing; same for every item below except `config.json` and the two reference docs): `.json` files through `blindJson`, other text files (`.jsonl`, `.md`) through `maskOperationalText`. Masking is safe here because no needle can match ordinary story words;
   - `calls/*.json` each through `blindCallRecord`, written with `JSON.stringify(x, null, 2) + '\n'`, same file name (skip if `calls/` is missing: zero records, no `calls/` in the copy);
   - `run-summary.json` through `blindRunSummary`; `state.json` through `blindJson` (skip each if missing, no error: a partial or just-started run dir can still be copied and reviewed; only `config.json`, the allow-listed docs and the spec section are required);
   - `worker.log` through `maskOperationalText` (skip if missing);
   - `reference/criteria.md` = `maskReferenceText` of `docs/eval/novel-quality-criteria.md`; `reference/spec-section-9.md` = `maskReferenceText` of the spec text from the line starting `## 9.` up to (not including) the line starting `## 10.`. Both read from `opts.repoRoot ?? process.cwd()`. Throw if a doc or the section is missing.
   Finally run `findLeaks(out)`; if it returns anything, throw `Error('model name left in blind copy: <paths>')`. This guard is a backstop for future code; masking already runs on every file, so it normally never fires (see tests 12a and 8).
8. `findLeaks(blindDir: string): string[]`: walk every file under `blindDir` except `chapters/` and `review.md`, and return the relative paths (sorted, `/` separators) of those where the mask changes the text. Files under `reference/` are checked with `maskReferenceText(text) !== text` (so a bare `Haiku` or `Luna` left in a reference doc is a leak); every other file is checked with `maskOperationalText(text) !== text` (a model needle, a brand word, or `ollama`/`opencode` is still present). Do not scan `chapters/` (story text may legitimately say "luna"). Because no needle matches ordinary words, scanning everything else is safe.
9. `publishReview(runDir, docsPath, opts?: { blindDir?: string }): { docsPath: string; runReviewPath: string }`: `blindDir = opts?.blindDir ?? defaultBlindDir(runDir)` (the CLI passes no blind dir, so the default is what runs; never read `<runDir>/review.md`, which the reviewer no longer writes). Read `<blindDir>/review.md` (throw `Error('review.md missing in blind dir: ...')` if absent); read `config.json` with `loadConfig(runDir)` (the REAL run dir; the blind dir has no `config.json`, so `loadConfig(blindDir)` would throw); header line is `모델: <modelId> | 언어: <lang>` for `ko`, `Model: <modelId> | Language: <lang>` for `en`, then a blank line, then the review text. Write order: first `docsPath` (create parent dir), then `<runDir>/review.md` (so a failed docs write leaves no false "exists"; the run-dir file keeps the workflow's existing "review.md exists" check at `novel-eval.js:143-151, 211` and the `rereview` semantics working).
10. `eval/novel/cli.ts` `dispatch` (switch at line ~502): add `case 'blind'` returning `writeBlindCopy(path.resolve(stringFlag(flags,'dir')), ...)` (optional `--out`; resolve it too), and `case 'publish-review'` returning `publishReview(path.resolve(stringFlag(flags,'dir')), path.resolve(stringFlag(flags,'to')))`. Import from `./blind`. Update the usage string and the line 35 comment.
11. `eval/novel/agents/reviewer.md` edits:
    - Inputs (line 9): `dir` is now the blinded copy; contains `chapters/`, `metrics/`, `calls/`, `reader/`, `author-decisions.jsonl`, `run-summary.json`, `state.json`, `worker.log`, `wiki-final.json`, `reference/criteria.md`, `reference/spec-section-9.md`.
    - Line 12: you write `<dir>/review.md` only; a later step adds the model header and copies it.
    - Delete line 14 (hardcoded `/Users/taehyeong/...`). Replace "Read these first" items 1 and 2 (lines 18-19) with `<dir>/reference/criteria.md` and `<dir>/reference/spec-section-9.md` (same section numbers inside; criteria sections 3.1 to 3.4 and 4).
    - Replace "Order of work" (lines 28-34) with: score chapters, then the whole run. Add: "Read nothing outside `dir`. Do not open `config.json`, any `docs/` file, any other run folder or `eval/results/novel/<date>/run-*`. Do not try to identify the model. Model fields, effort, token caps and speed are removed on purpose."
    - Delete the Speed bullet (line 57) and the "Model identity" section (line 62). Operations (line 56) stays as is (tokens and time per step are kept).
    - Add a last required section "Blinding note" (one sentence): whether anything in `dir` identified the model; if yes, what.
    - Rule at line 69 stays (final reply one line, no model name).
12. `.claude/workflows/novel-eval.js` edits (keep function names `reviewerPrompt`, `copyPrompt`, `reviewExistsPrompt` and their order, because track HX4 also edits `copyPrompt`):
    - Near line 73-77 factor a helper: `const runName = (run) => 'run-' + String(CANONICAL_MODELS.indexOf(run.model) + 1).padStart(2, '0') + '-' + run.lang`; keep `runDir` output identical; add `const blindDir = (run) => 'eval/results/novel/' + date + '/blind/' + runName(run)`.
    - New `blindPrompt(dir)`: runner (Bash only, no edits, no reads) runs `cd ${REPO} && pnpm eval:novel blind --dir ${dir}`; the command prints one JSON line. Exact runner instructions: if the JSON line has no `error` field, return status `"blinded"` and detail = the `dir` value; otherwise return status `"failed"` and detail = the `error` text (reuse `RUNNER_SCHEMA`). `reviewRun` compares `runnerStatus()` to `'blinded'`.
    - `reviewerPrompt(dir, lang)`: callers now pass the blind dir; text stays "Inputs: dir = ${REPO}/${dir}"; the third line says write `<dir>/review.md` (unchanged wording OK).
    - `copyPrompt(run, dir)` (line 169): command becomes `cd ${REPO} && pnpm eval:novel publish-review --dir ${dir} --to ${docsReviewPath(run)}`; the command prints one JSON line `{"docsPath":...,"runReviewPath":...}`, not a bare path. Exact runner instructions: if the JSON line has no `error` field, return status `"copied"` and detail = the `docsPath` value (not the whole JSON); otherwise return status `"failed"` and detail = the `error` text. `reviewRun` keeps comparing to `'copied'` and returning `copied.detail`; keep `RUNNER_SCHEMA`.
    - `reviewRun` (line 209): after the existence check (ends line 226) and before the reviewer call (line 227): run `blindPrompt(dir)` with `model: 'haiku'`, `phase: 'Review'`, label `blind ${label}`; if status is not `blinded` log and return null. Then `reviewerPrompt(blindDir(run), run.lang)`. The copy call keeps passing the real `dir`.

## Interface

```ts
// eval/novel/blind.ts
import type { CallRecord } from './eval-client'
export const BLIND_LABEL: '[masked]'
export type BlindedCall = Omit<CallRecord, 'model' | 'effortRequested' | 'maxTokens' | 'productTimeoutMs' | 'speed'> & { model: typeof BLIND_LABEL }
export function modelNeedles(): string[]
export function maskModelNames(text: string): string
export function maskProviderNames(text: string): string
export function maskBrandWords(text: string): string
export function maskOperationalText(text: string): string
export function maskReferenceText(text: string): string
export function blindCallRecord(call: CallRecord): BlindedCall
export function blindJson(value: unknown): unknown
export function blindRunSummary(summary: unknown): unknown
export function defaultBlindDir(runDir: string): string
export function writeBlindCopy(runDir: string, opts?: { out?: string; repoRoot?: string }): { dir: string; files: number }
export function findLeaks(blindDir: string): string[]
export function publishReview(runDir: string, docsPath: string, opts?: { blindDir?: string }): { docsPath: string; runReviewPath: string }
```
CLI: `pnpm eval:novel blind --dir <run> [--out <dir>]` prints `{"dir":...,"files":N}`; `pnpm eval:novel publish-review --dir <run> --to <docs/...md>` prints `{"docsPath":...,"runReviewPath":...}`.

## Tests (TDD; write first, watch fail)

`eval/novel/blind.test.ts` (node env, temp dirs via `mkdtempSync`, clean in `afterEach`; build a run dir by hand: `config.json` with `modelId`, `chapters/01.md`, `calls/001-draft-chapter.json`, etc.). Pass `repoRoot: process.cwd()` (vitest runs at repo root) so the real docs are used.
1. `maskModelNames removes every id`: text with `qwen3.8-27b qwen3.8:27b-mlx qwen3.8:27b gpt-oss-20b gpt-oss:20b exaone3.5-32b exaone3.5:32b haiku-5.5 claude-haiku-5-5 haiku-5-5 luna-6 gpt-6-luna`, upper and lower case. Expected: no needle (case-insensitive) remains.
2. `longest first`: input `claude-haiku-5-5` gives `[masked]`, no leftover `claude-` or `haiku`.
3. `ordinary words stay` (for `maskModelNames` only): `Luna is a ship captain; fake data; 루나; Haiku poem` unchanged (uses neither `ollama` nor `opencode`). Add: `maskOperationalText('Luna 루나 haikus')` is unchanged (Luna, 루나 and letters-inside-words stay). Add `maskProviderNames('Ollama / OpenCode')` has no `ollama|opencode`.
4. `blindCallRecord`: input record with `model: 'claude-haiku-5-5'`, `effortRequested: 'high'`, `maxTokens: 32000`, `speed: {..., source: 'wall'}`, `durationMs: 5`, `error: { kind: 'model', message: "model 'gpt-oss:20b' not found" }`; one more whose `error.message` is `pull qwen3.8:27b failed` (base Ollama tag, must come out without `qwen3.8`); also a second record whose `error.message` is `Ollama model not found, try pulling` (and one with `OpenCode`). Expected: `model === '[masked]'`; keys `effortRequested`, `maxTokens`, `productTimeoutMs`, `speed` absent (give the input `productTimeoutMs: 3_600_000`); `wouldTimeOut` kept; `durationMs === 5`; `error.kind === 'model'`; message has no `gpt-oss` and the qwen message no `qwen3.8`; the Ollama/OpenCode messages come out without `ollama`/`opencode` (case-insensitive); input object unchanged.
5. `blindRunSummary`: input `{ speed: {overall: {source: 'ollama'}}, failed: [{message: 'qwen3.8:27b-mlx down'}], calls: {total: 3} }`. Expected: no `speed`; failed message masked; `calls.total === 3`.
5b. `brand words in call output`: a call record whose `output` is `I am Claude Haiku, made by Anthropic; also Qwen and EXAONE, Sonnet, Opus, gpt-oss` (upper and lower case variants). After `blindCallRecord`, none of those words remains (case-insensitive), and `Luna` / `루나` placed in the same output are still there.
6. `writeBlindCopy copies only the allow-list`: run dir also holds `config.json` (modelId `haiku-5.5`), `db/x`, `RESUME.md`, `review.md`, `pending.json`, `answer.json`, `worker.pid`. Expected: blind dir lacks all of those; has `chapters/01.md` byte-identical, `calls/001-draft-chapter.json` blinded, `run-summary.json` without `speed`, `state.json`, `worker.log` masked (including an `Ollama` stderr line), `reference/criteria.md`, `reference/spec-section-9.md`.
7. `reference docs are masked`: read both reference files from the blind dir. Expected: neither matches `/haiku|luna|sonnet|opus|qwen|exaone|ollama|opencode/i`; `spec-section-9.md` starts with `## 9.` and does not contain `## 10.`; `criteria.md` still contains `Claude v1.3` and `GPT-4`.
8. `no leak in a full copy` (a regression check on the masking, not a detector test; it can only fail if masking code is removed): all calls carry `claude-haiku-5-5`; after copy `findLeaks(dir)` equals `[]`, and a recursive text search of calls/, state.json, run-summary.json, worker.log for `claude-haiku-5-5` finds nothing.
9. `rebuild replaces the old copy`: run `writeBlindCopy` twice with a stale `review.md` in the blind dir between runs. Expected: second call removes the stale file.
10. `writeBlindCopy throws on a non run dir` (no `config.json`): message contains `not a run dir`.
11. `publishReview adds the header`: blind `review.md` = `# Review\nbody`, config `modelId: 'haiku-5.5', lang: 'en'`. Expected: docs file starts with `Model: haiku-5.5 | Language: en`, followed by blank line and the review; `<runDir>/review.md` has identical content. For `lang: 'ko'` the header is `모델: haiku-5.5 | 언어: ko`. Build the blind dir with `writeBlindCopy` (then add `review.md` by hand) and assert `<blindDir>/config.json` does not exist, so the test fails if the implementation calls `loadConfig(blindDir)`.
12. `publishReview throws without review`: message contains `review.md missing`.
12a. `findLeaks detects a planted leak` (negative test, the only test that proves the detector works): hand-build a blind dir (not via `writeBlindCopy`) with `calls/001-x.json` containing `claude-haiku-5-5`, `reference/criteria.md` containing `Haiku`, `reference/spec-section-9.md` containing `Luna`, `reader/01.json` containing `qwen3.8:27b` (flagged because the base tag is a needle), `worker.log` containing `Ollama`, `state.json` containing `I am Claude`, and `chapters/01.md` containing `Luna`. Expected: `findLeaks` returns exactly `calls/001-x.json`, `reader/01.json`, `reference/criteria.md`, `reference/spec-section-9.md`, `state.json`, `worker.log` (sorted; `chapters/01.md` not listed). `reference/spec-section-9.md` is flagged only because reference files use `maskReferenceText`. A clean hand-built dir (`reference/criteria.md` containing `[모델]`) returns `[]`.
10b. `writeBlindCopy on a partial run dir`: run dir holds only `config.json` and `chapters/01.md` (no `calls/`, `run-summary.json`, `state.json`, `worker.log`). Expected: no throw; the copy has `chapters/01.md` and both `reference/` files, and no `calls/`, `run-summary.json` or `state.json`.
12b. `writeBlindCopy refuses an unsafe out`: `{ out: runDir }`, `{ out: path.dirname(runDir) }` and `{ out: path.join(runDir, 'x') }` each throw (message contains `unsafe blind output dir`) and `runDir/config.json` still exists with its content.
12c. `reader, wiki and decisions are masked`: run dir holds `reader/01.json` with `claude-haiku-5-5`, `wiki-final.json` with `gpt-oss:20b`, `author-decisions.jsonl` with `exaone3.5:32b`. Expected: blind copies carry `[masked]`; `chapters/01.md` containing `Luna` stays byte-identical.
12d. `publishReview uses the default blind dir`: only `defaultBlindDir(runDir)/review.md` exists (no `<runDir>/review.md`); `publishReview(runDir, docs)` without `opts` succeeds, and the docs file is written before the run-dir file Build the failing case like this: create a regular file `x` in the temp dir and pass `docsPath = path.join(tmp, 'x', 'sub', 'a.md')`; `mkdirSync` then fails with `ENOTDIR`. `publishReview` throws, and `<runDir>/review.md` does not exist afterwards (assert with `existsSync`). Do not pick a path that can be created on this machine.

`eval/novel/cli.test.ts` (append `describe('blind commands')`):
13. `main(['blind','--dir',dir])` returns 0 (spy on `console.log`, last JSON line has `dir` ending `/blind/<basename>` and `files > 0`).
14. `main(['publish-review','--dir',dir,'--to',docs])` (no blind-dir flag) returns 0 when only the blind `review.md` (at `defaultBlindDir(dir)`) exists, and writes both the docs file and `<dir>/review.md`; returns 1 with `error` when the blind `review.md` is missing.
14b. `main(['blind','--dir',dir,'--out',dir])` returns 1 with `error` and `config.json` is still in `dir`.
15. (regression check; it may pass before any implementation, but it must exercise the path) build `folder` with the real runs the existing tests use, then create `folder/blind/run-01-ko/review.md` (a blind dir with no `config.json`) before calling `resummarizeDate(folder)`. Expected: no throw and the result length equals the number of real runs (the blind folder is ignored). Assert the blind `review.md` exists before the call, so the test is not vacuous.
Tests 8 and 15 are regression checks; the red-first rule applies to the others. Existing tests, especially `cli.test.ts:105` (calls byte-identical after resummarize), must pass untouched.

## Acceptance metrics

| Metric | Current | Target |
|---|---|---|
| Model-id and provider strings (every needle plus `ollama`/`opencode`, case-insensitive) in every file of the blind copy except `chapters/` (`findLeaks`) | not measured (`findLeaks` does not exist yet; no run dir here). Evidence: every call file has a `model` field, 32 in qwen/ko | 0 on the fixture copy (test 8 regression) and `findLeaks` returns exactly the six planted paths on the planted-leak fixture (test 12a) |
| Files in the blind copy outside the allow-list (config.json, db/, RESUME.md, pending/answer files) | all readable | 0 (test 6) |
| Profile fingerprints in calls (`effortRequested`, `maxTokens`, `productTimeoutMs`, `speed.source`) | present in all | absent (tests 4, 5) |
| Provider words in error text and logs | not measured | masked (tests 4, 6) |
| Brand words (Claude, Anthropic, Qwen, EXAONE, Sonnet, Opus, Haiku, gpt-oss) and the base Ollama tag in call output, errors, logs | not masked | masked (tests 1, 4, 5b) |
| Reference docs given to the reviewer that name Haiku/Luna/Sonnet/Opus | 2 (criteria.md has 6 mention lines: 3,5,134,156,164,171) | 0 (test 7) |
| Unsafe `--out` (run dir, its parent, or inside it) deletes real run data | possible by design | throws, data intact (tests 12b, 14b) |
| Reviews that self-report seeing the model | 4 of 6 (2026-10-18 reviews) | 0 of 6. Next-round check that needs a real run (not testable in this checkout); a weak check, because isolation is prompt-only (see Risks) |
| Existing eval tests | pass | still pass |

## Dependencies on other tracks

- HX4 (summary save, resume, copy retry, resummarize) edits `.claude/workflows/novel-eval.js` (`copyPrompt`, reviewRun) and `eval/novel/cli.ts` (`resummarizeRun`). Merge order: HX1 first or rebase carefully; this brief changes `copyPrompt`'s command only and adds new switch cases, not `resummarizeRun`.
- HX2 edits `eval-client.ts`; HX1 does not, so no conflict. A new field HX2 adds to call records is not masked by name; keep `blindCallRecord` generic (deep string mask), so nothing breaks.
- F4 (profile effort/timeouts) changes values that HX1 deletes anyway.
- Any track that adds new files under the run dir (F1 to F3: reader, extract) must be added to the allow-list in `writeBlindCopy` to be visible to the reviewer. `reader/` and `chapters/` are copied recursively, so new files inside them already pass.

## Risks

- Reviewer-side isolation is prompt-only: the reviewer still has Read and Bash, and "read nothing outside `dir`" is a rule in `reviewer.md`, not a sandbox. It could still open `docs/`, a `config.json` or another run dir. The blind copy removes what the reviewer meets by default; it cannot stop a deliberate look. So the "0 of 6 self-report" metric is a weak check. Optionally, if the workflow supports a working directory for an agent, start the reviewer with its cwd set to the blind dir; otherwise leave it and say so in the final note.
- Remaining fingerprints that are not names (`productTimeoutMs` is deleted on purpose, `wouldTimeOut` is kept): call durations, `usage` token counts (reasoning tokens), `contextOverflow: true` (local only), error kinds (`external-limit` is cloud only). Not masked on purpose: the reviewer needs them for the operations score. Blinding is strong but not perfect; say so in the final note.
- The reviewer no longer reports speed. `agents/summary.md:22` already builds the speed table from the real `run-summary.json`, so the summary is unchanged. Confirm that line still holds after HX4.
- A model could print its own name in chapter text ("I am Claude Haiku 5"). Chapter text is copied verbatim on purpose, so this is not masked; say so in the final note. In `calls/`, `reader/`, `wiki-final.json`, logs and the other masked files, brand words are masked (`maskBrandWords`). Side effect: a story that uses a brand word as ordinary text (a character named Claude, a poem called Haiku) shows `[masked]` in `reader/`, `wiki-final.json` and `author-decisions.jsonl`; accepted, because chapters stay intact and the reviewer scores from chapters.
- `publish-review` writes `<runDir>/review.md`; if the copy to docs fails after that, the next invocation skips the review (existing behavior). Order in `publishReview`: write the docs file first, then the run-dir file, so a failure leaves no false "exists".
- `rereview: true` rebuilds the blind dir from scratch (step 7 deletes it), which also removes the old blind `review.md`; the run-dir `review.md` is overwritten by `publish-review`.
- Workflow JS has no tests. After editing, read it once for syntax and run `node --input-type=module --check < .claude/workflows/novel-eval.js` only if it parses (the file uses top-level `return`, so it may not; then skip and review by eye).
- Pre-existing, out of scope: `REPO` constant in `novel-eval.js:14` is a macOS path; `cli.ts:108` default dir name contains the model (workflow always passes `--dir`).

## Open questions (defaults chosen; implement the default)

1. Mask or drop `speed`? Default: drop (`speed`, `effortRequested`, `maxTokens` removed). Alternative of keeping numbers with `source` masked still reveals local vs cloud through `promptTokensPerSec: null`.
2. Re-review the 6 reviews of 2026-10-18? Default: no code for it. The user can pass `rereview: true`; it needs real run dirs, which are not in this checkout.
3. Model header format (`Model: ... | Language: ...`) is new; `agents/summary.md` reads files by name, not by header, so it is safe.
4. Backfill of old runs is not needed: the blind copy is built from whatever is on disk.

## Definition of done

```
pnpm vitest run eval/novel/blind.test.ts eval/novel/cli.test.ts eval/novel/eval-client.test.ts eval/novel/run.test.ts eval/novel/steps/finish.test.ts --maxWorkers=2
pnpm exec tsc --noEmit 2>&1 | grep -E "eval/novel/(blind|cli)" || echo "no type errors in HX1 files"
pnpm eslint eval/novel/blind.ts eval/novel/blind.test.ts eval/novel/cli.ts eval/novel/cli.test.ts
pnpm exec prettier --check eval/novel/blind.ts eval/novel/blind.test.ts eval/novel/cli.ts
grep -n "Users/taehyeong\|Speed\|Model identity" eval/novel/agents/reviewer.md   # expect no hit (config.json may appear only in the "do not open" rule)
grep -n "blindDir\|publish-review\|pnpm eval:novel blind" .claude/workflows/novel-eval.js   # expect 3+ hits
```
All must pass. Do not run the real AI or `pnpm eval:novel advance`. Do not commit unless asked.

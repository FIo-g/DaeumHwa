# HX5: Measurement wiring (G1, G2, J, H counters and per-task timeouts into the run summary)

Dev harness plus one additive product field. No packages, no migrations, no new AI calls, no speech metrics (B's speech feature is off in the eval, spec 8). Agent docs and CLI messages stay English. `eval/novel` is outside `src/`, so plain `Error` throws are fine there; the product edit (`src/server/chapter-check.ts`) is a type and a return field only. Wave 4, size S, runs next to B.

## Goal

1. The run summary (`run-summary.json`, built by `buildRunSummary` in `eval/novel/steps/finish.ts`) gets a zod schema, `RunSummarySchema`, and four new OPTIONAL blocks. Saved runs without them still parse.
   - `extraction`: G2 `stats {fragmentNamesFixed, relationsDropped}` and G1 `dropped {duplicateFacts, unverifiedEvidence}`, summed over the chapter checks.
   - `proofread`: J `ProofreadStats` (AI items only), summed over chapters.
   - `continuity`: H context hit (share of wiki cards named in a chapter that the continuity prompt really contained) computed from the run itself, plus H fixture recall when its results file is present.
   - `timeouts`: `{ total, byTask }`, calls whose duration exceeds their product timeout (120 s for object calls), counted per task, from the call records.
2. A block that was not measured is OMITTED, never written as zeros. Only `timeouts` is always present (it needs only the call records).
3. `resummarize` (`cli.ts`) rebuilds the new blocks from disk like the old ones. `metrics.ts` is not edited.

## Evidence (all verified in code at the cloud-w0 tree; wave 1-3 files marked)

- `buildRunSummary(calls, state, lang)` (`finish.ts:101-121`) returns an inferred object with `calls`, `speed`, `wouldTimeOut`, `contextOverflow`, `hangulLeft`, `failed`, `pauses`, `drafts`, `focusCounts`. There is NO zod schema for the summary today (grep: `run-summary` is only written in `finish.ts:154` and `cli.ts:446`). zod is already used in `eval/novel/author-io.ts` and `bible.ts`.
- `wouldTimeOut` (`finish.ts:113`) is one total: `call.wouldTimeOut` is `durationMs > call.productTimeoutMs` (`eval-client.ts:489-490`); `productTimeoutMs` is the task's own timeout or `DEFAULT_AI_TIMEOUT_MS = 120_000` (object) / `STREAM_AI_TIMEOUT_MS = 280_000` (stream) (`eval-client.ts:440-452`, `src/ai/run.ts:28-30`). No per-task breakdown exists, so a slow task (extract, continuity on local models) cannot be named.
- `buildRunSummary` is pure on purpose: `resummarizeRun` (`cli.ts:425-449`) rebuilds it from `calls/` and `state.json` without the database. The new inputs must therefore come from run-dir files, not from the DB.
- G2 and G1 counters exist only as return values: `extractionToProposals` returns `{ proposals, pendingThreadEvents, stats }` after G2 (G2 brief step 7, "no caller reads it yet; eval wiring out of scope", open question 4) and `{ ..., stats, dropped }` after G1 (G1 brief, open question "wiring is for HX tracks"). `runChapterCheck` (`src/server/chapter-check.ts:126`) destructures only `proposals` (`const { proposals: items } = extractionToProposals(...)`, line ~238) and `ChapterCheckResult` (`:27-32`) has no counters. The eval `check` step (`eval/novel/steps/chapter.ts:262-277`) therefore cannot see them.
- J: `ProofreadStats` and `proofreadStats(items, decisions)` are written by J into `eval/novel/metrics-proofread.ts` (J brief step 6 as amended by plan Task 0.2; the file is first created empty by the seam commit, plan Task 0.4, and `metrics.ts` re-exports it). The inputs exist today: `chapters/NN.proofread.json` is the raw `ProofreadSuggestion[]` (`source`, `quote`, `replacement`, `kind`, `reason`, `start`, `end`, NO id; `chapter.ts:197-199`), decision ids are array indexes (`chapter.ts:206-210` builds `id: String(i)`), and `author-decisions.jsonl` has one line per decision: `{ at, step, kind, answer }` with `answer.decisions = [{ id, accept, reason }]` for `kind: 'proofread'` and `step = 'chN:proofread'` (`author-io.ts:249-253`, answer schema `:121-124`).
- H: `eval/coverage.ts` (`packCoverage(text, cards, renderedPack) -> { named, missing, rate }`) and the continuity results JSON are written by H (H brief steps 11-12, wave 1). Today `eval/coverage.ts` does not exist and `eval/run-continuity.ts` writes `eval/results/continuity-<stamp>.json` with `{ mode, model, createdAt, expected, notDefects, totals, runs }` (`run-continuity.ts:346-361`); H adds `trapHits`, `coverage {named, inPack, rate}` and `overBudgetChapters`. `totals` is `scoreIssues` output: `hits`, `misses[]`, `falsePositives[]`, `precision`, `recall`. `eval:continuity` runs on fixtures, not on a novel run, so its recall is not a property of one run.
- The continuity prompt of a novel run is in the call records: the `continuity-check` call of step `chN:check` has the rendered pack (`[E<n>] <name> (...)` lines) in `prompt`. `wiki-final.json` (written by `finish`, `finish.ts:132-149`) has every active card with `name`, `aliases`, `createdAt`; `chapters/NN.md` is the final text the check ran on.
- `eval/novel/steps/finish.test.ts` tests `speedSummary` only. `eval/novel/run.test.ts:154-196` ("fake run reaches done") reads `run-summary.json` as an untyped object.

## Files

Write (existing, verified):
- `eval/novel/steps/finish.ts` (schema, new aggregators, `readSummaryInputs`, `buildRunSummary` 4th argument, `finish` passes inputs)
- `eval/novel/cli.ts` (`resummarizeRun` only: pass `readSummaryInputs(dir)` as the 4th argument, one line plus one import)
- `eval/novel/steps/chapter.ts` (`check` step only, lines ~262-277: write `chapters/NN.extraction.json`)
- `src/server/chapter-check.ts` (additive: optional `extraction` field on `ChapterCheckResult`, keep `stats` and `dropped` from `extractionToProposals`)
- `eval/novel/run.test.ts` (extend "fake run reaches done" with the new blocks)

Create (do not exist yet):
- `eval/novel/steps/finish.HX5.test.ts`
- `src/server/chapter-check.HX5.test.ts` (own file: B edits `chapter-check.test.ts` in the same wave)

Read-only: `eval/novel/state.ts` (`RunState`: `failed`, `pauses`, `data.drafts`, `data.focusCounts`; no change), `eval/novel/steps/util.ts` (`readCallRecords`, `writeRunFile`), `eval/novel/eval-client.ts` (`CallRecord`), `eval/novel/author-io.ts`, `eval/novel/metrics.ts` (NOT edited: the seam commit already has `export *` from `metrics-proofread.ts` and `metrics-interview.ts`; import from `./metrics-proofread` directly), `eval/novel/metrics-proofread.ts` (J, wave 2), `eval/coverage.ts` (H, wave 1), `eval/run-continuity.ts`, `src/ai/extraction.ts` (G2/G1 types), `src/ai/run.ts` (timeout constants).

Do NOT touch: `src/server/interview.ts` and `src/server/known-entries.ts` (B writes them in this wave; interview-extraction counters are therefore not wired, see Open questions), `src/server/imports.ts`, `eval/novel/metrics.ts`, `eval/novel/metrics-interview.ts` (I), `eval/novel/agents/*.md` (HX1, HX4 own them), `docs/eval/novel/README.md`.

Check before editing (grep, do not trust line numbers): after G2 and G1 `extractionToProposals` must return `stats` and `dropped`; `eval/novel/metrics-proofread.ts` must export `proofreadStats` and `ProofreadStats`; `eval/coverage.ts` must export `packCoverage`. If one is missing, stop and report; do not write a stand-in.

## Design (do in this order)

1. TDD first: write `finish.HX5.test.ts`, `chapter-check.HX5.test.ts` and the `run.test.ts` additions (see Tests). Run them, see them fail.
2. `src/server/chapter-check.ts`: add `export type ExtractionCounts = ExtractionStats & ExtractionDropStats` (types from `@/ai/extraction`; all four numbers) and `extraction?: ExtractionCounts` on `ChapterCheckResult`. At the `extractionToProposals` call keep the whole result: `const extracted = extractionToProposals(...)`, `const items = extracted.proposals`, and return `extraction: { ...extracted.stats, ...extracted.dropped }`. Nothing else changes (transaction, issues, proposals). Callers (`actions/checks.ts`, the check route) ignore the field.
3. `eval/novel/steps/chapter.ts` `check` step: after `runChapterCheck` returns non-null and before `mark`, `if (checked.extraction) writeRunFile(ctx.dir, 'chapters/' + pad(n) + '.extraction.json', JSON.stringify(checked.extraction) + '\n')` (use the file's template-literal style). The file is overwritten if the step reruns (idempotent). Do not change the proposal ids logic.
4. `finish.ts` schema. Define with zod (`import { z } from 'zod'`): `ExtractionCountsSchema` (4 non-negative ints), `ProofreadStatsSchema` (mirrors J's `ProofreadStats`; ratios `number | null`), `RunSummarySchema` with the existing keys exactly as today's output (`calls {total, byTask: record of {count, tokens, totalMs}}`, `speed` as built by `speedSummary`, `wouldTimeOut`, `contextOverflow`, `hangulLeft: number | null`, `failed [{step, message}]`, `pauses: record number`, `drafts: record of array of {runId, usable, quality, reason}`, `focusCounts: record number`) and the new keys, all `.optional()`: `extraction`, `proofread`, `continuity`, `timeouts`. Export `type RunSummary = z.infer<typeof RunSummarySchema>`. Annotate `buildRunSummary` as returning `RunSummary` (this makes tsc check the builder against the schema).
5. Timeouts (pure, from calls). Add and export `timeoutSummary(calls)`: threshold per call is `call.productTimeoutMs ?? DEFAULT_AI_TIMEOUT_MS` (import the constant from `@/ai/run`, as `eval-client.ts` does; records written before `productTimeoutMs` existed use 120_000); a call counts when `call.durationMs > threshold`. Return `{ total, byTask }` where `byTask` has only tasks with at least one timeout (count per task), and `total` is the sum. A stream call (280 s product timeout) is NOT counted at 120 s; this keeps `timeouts.total` equal to the existing `wouldTimeOut` for records that have `productTimeoutMs` (assert that in a test). Keep `wouldTimeOut` unchanged.
6. Extraction aggregate: `sumExtraction(byChapter: Record<string, ExtractionCounts>)` returns `{ chapters, totals, byChapter }` (`chapters` = number of chapter files read); totals are plain sums of the four numbers.
7. Proofread aggregate: `proofreadSummary(perChapter: Record<string, { items; decisions }>)`. Per chapter: `items = suggestions.map((s, i) => ({ id: String(i), quote: s.quote, replacement: s.replacement, kind: s.kind }))` filtered to `source === 'ai'` while KEEPING the original index as id (J's caller contract); `decisions` as read. Call `proofreadStats(items, decisions)` for each chapter. Totals: sum the six counts (`total`, `accepted`, `awkward`, `sameQuoteItems`, `distinctQuotes`, `acceptedQuotes`) and recompute both ratios from the sums (null when the denominator is 0). Do not call `proofreadStats` once over all chapters: the same quote in two chapters would merge into one distinct quote. Chapters with no AI items are skipped from `byChapter` but a chapter whose file exists counts in `chapters`.
8. Context hit: `contextHitSummary({ cards, chapterTexts, calls })`. For each chapter n with a text and a `continuity-check` call whose `step` is `chN:check` and `error` is null (take the LAST such call): `cards` = cards with `createdAt <= call.startedAt` (a card created after the check could not be in its pack; `wiki-final.json` is the end state), mapped to `{ name, aliases }`; `packCoverage(text, cards, call.prompt)` gives `named` and `missing` name lists; the English run prompt is the translated scaffold but card lines keep the `[E<n>] <name> ` prefix, so the same call works for `en`. Result: `{ chapters, named, inPack, rate, byChapter: { '3': { named, inPack } } }` with `inPack = named - missing`, `rate = inPack / named` or null when `named` is 0. Chapters without a usable call are skipped, not counted as 0. Omit the block when `chapters` is 0.
9. Fixture recall: `parseContinuityResults(json: unknown)` (zod, tolerant: unknown keys ignored) reads an `eval/run-continuity.ts` results file and returns `{ createdAt, mode, model, expected, hits, misses, falsePositives, precision, recall, trapHits?, coverage?, overBudgetChapters? }` (`expected` = `expected.length`, `misses`/`falsePositives` = array lengths, `trapHits` = array length, `coverage` = H's `{named, inPack, rate}`). A file that does not parse yields no block (never throws). `continuity.fixture` holds it. The run summary never copies the file's text.
10. Inputs from disk: `readSummaryInputs(dir): SummaryInputs` (exported; reads only, never throws on a missing or broken file, skips that item):
    - `chapters/NN.extraction.json` for every NN: parsed with `ExtractionCountsSchema`.
    - `chapters/NN.proofread.json` and `author-decisions.jsonl`: per chapter the LAST line with `kind === 'proofread'` and the step key `chN:proofread` (a redo can log twice); `answer.decisions` mapped to `{ id, accept }`. A chapter with a suggestions file but no decision line is skipped (not decided yet, not 0% accepted).
    - `chapters/NN.md`, `wiki-final.json` (`entries[].name/aliases/createdAt`), call records for context hit.
    - `continuity-eval.json` in the run dir (optional; the user copies one `eval/results/continuity-*.json` there to attach fixture recall to a run). Nothing writes it automatically.
11. `buildRunSummary(calls, state, lang, inputs?: SummaryInputs)`: existing fields unchanged and in the same order, then `timeouts` always, then `extraction`, `proofread`, `continuity` only when the matching input gives data. `finish` step: `buildRunSummary(calls, state, ctx.config.lang, readSummaryInputs(ctx.dir))`. NOTE the order in `finish`: `wiki-final.json` is written before the summary, so `readSummaryInputs` sees it. `cli.ts` `resummarizeRun`: same call, `readSummaryInputs(dir)`.
12. Run the Definition of done commands.

## Interface

```ts
// eval/novel/steps/finish.ts
export type ExtractionCounts = {
  fragmentNamesFixed: number // G2 stats
  relationsDropped: number // G2 stats
  duplicateFacts: number // G1 dropped
  unverifiedEvidence: number // G1 dropped
}
export type SummaryInputs = {
  extraction?: Record<string, ExtractionCounts> // key: chapter number as a string
  proofread?: Record<string, { suggestions: { source: string; quote: string; replacement: string; kind: string }[]; decisions: { id: string; accept: boolean }[] }>
  contextHit?: { cards: { name: string; aliases: string[]; createdAt: string }[]; chapterTexts: Record<string, string> }
  continuityFixture?: ContinuityFixture
}
export type ContinuityFixture = {
  createdAt: string; mode: string; model: string
  expected: number; hits: number; misses: number; falsePositives: number
  precision: number | null; recall: number | null
  trapHits?: number; coverage?: { named: number; inPack: number; rate: number }; overBudgetChapters?: number
}
export function timeoutSummary(calls: CallRecord[]): { total: number; byTask: Record<string, number> }
export function readSummaryInputs(dir: string): SummaryInputs
export function parseContinuityResults(json: unknown): ContinuityFixture | null
export function buildRunSummary(calls: CallRecord[], state: RunState, lang: 'ko' | 'en', inputs?: SummaryInputs): RunSummary
export const RunSummarySchema: z.ZodType<RunSummary> // new keys all optional
// RunSummary new keys:
//   timeouts?: { total: number; byTask: Record<string, number> }
//   extraction?: { chapters: number; totals: ExtractionCounts; byChapter: Record<string, ExtractionCounts> }
//   proofread?: { chapters: number; totals: ProofreadStats; byChapter: Record<string, ProofreadStats> }
//   continuity?: { contextHit?: { chapters: number; named: number; inPack: number; rate: number | null; byChapter: Record<string, { named: number; inPack: number }> }; fixture?: ContinuityFixture }

// src/server/chapter-check.ts (additive)
export type ChapterCheckResult = { /* existing */ extraction?: ExtractionStats & ExtractionDropStats }
```

## Tests (TDD; name | input | expected)

`eval/novel/steps/finish.HX5.test.ts` (reuse the `call()` helper style of `finish.test.ts`; tmp run dir via `mkdtempSync` for the disk tests; `newState` from `../state` for the state argument):
1. old summary still parses | JSON literal with exactly today's keys (`calls`, `speed`, `wouldTimeOut`, `contextOverflow`, `hangulLeft: null`, `failed`, `pauses`, `drafts`, `focusCounts`) and none of the new keys | `RunSummarySchema.parse` succeeds and the result has no `extraction`, `proofread`, `continuity`, `timeouts` keys.
2. builder output without inputs matches the schema | `JSON.parse(JSON.stringify(buildRunSummary([call({})], newState(config), 'ko')))` | parses; has `timeouts {total 0, byTask {}}`; has NO `extraction`, `proofread`, `continuity`.
3. timeouts count per task | calls: 2 `extract` at 130000 ms and 1 at 119000, 1 `continuity-check` at 121000, 1 `proofread` at exactly 120000 (all `productTimeoutMs: 120000`, `kind: 'object'`) | `byTask {extract: 2, 'continuity-check': 1}`, `total 3` (120000 is not over).
4. stream threshold is its own product timeout | a `draft-chapter` stream with `productTimeoutMs 280000` at 200000 ms and one at 290000 ms | counts 1.
5. legacy record without `productTimeoutMs` | `durationMs 130000`, no `productTimeoutMs` | counted (fallback 120000).
6. total equals wouldTimeOut | mixed calls with `wouldTimeOut` set from `durationMs > productTimeoutMs` | `timeouts.total === summary.wouldTimeOut`.
7. extraction counters flow | `inputs.extraction = { '1': {1,2,0,3}, '2': {0,1,4,0} }` (order fragmentNamesFixed, relationsDropped, duplicateFacts, unverifiedEvidence) | `extraction.chapters 2`, totals `{1,3,4,3}`, `byChapter['1']` equal to the input.
8. extraction zero is kept | one chapter all zeros | block present with zeros (measured and clean); with `inputs.extraction` undefined or `{}` the block is absent.
9. proofread filters AI items and keeps indexes | suggestions `[rule, ai, ai]`, decisions `[{id:'1',accept:true},{id:'2',accept:false},{id:'0',accept:true}]` | totals `total 2`, `accepted 1` (rule item 0 ignored), `acceptanceRatio 0.5`.
10. proofread totals sum chapters, not merge quotes | the same AI quote in chapters 1 and 2, both accepted | `distinctQuotes 2`, `acceptedQuotes 2`, `quoteAcceptanceRatio 1`.
11. context hit | cards 서윤 (`createdAt` before the call) and 민준; chapter text names both; call prompt has `[E1] 서윤 (인물)` only | `named 2`, `inPack 1`, `rate 0.5`; a card created after `call.startedAt` is not counted.
12. context hit skips chapters without a call | chapter text 2 but no `continuity-check` call | `chapters 1` (only chapter 1); with no usable chapter the `continuity` block is absent.
13. fixture results parse | a literal shaped like an `eval:continuity` file (`expected` array of 4, `totals {hits 3, misses [1], falsePositives [], precision 1, recall 0.75}`), once with H's `trapHits`/`coverage`/`overBudgetChapters`, once without | `ContinuityFixture` with `expected 4`, `recall 0.75`; optional fields undefined in the second case; `parseContinuityResults({})` is `null`.
14. `readSummaryInputs` on a missing/empty dir | empty tmp dir | `{}` (no throw); a corrupt `chapters/01.extraction.json` is skipped while `02` is read.
15. `readSummaryInputs` reads the last proofread decision | `author-decisions.jsonl` with two `ch1:proofread` lines (second differs) plus a `ch1:draft` line of another kind | the second line's decisions are used.

`src/server/chapter-check.HX5.test.ts` (scripted client like `chapter-check.test.ts`'s `scriptedClient` helper; read that test first):
16. `runChapterCheck` returns the counters | extract output with a relation whose end matches no card and a repeated wiki fact (G2 test 8 and G1 test 6 inputs) | `result.extraction` has `relationsDropped >= 1` and `duplicateFacts >= 1`, all four numbers are integers.
17. proposals unchanged | same run | `result.proposals` equals what the existing test expects (no behavior change).

`eval/novel/run.test.ts` "fake run reaches done" (add assertions, do not remove): the summary parses with `RunSummarySchema`; `chapters/01.extraction.json` exists after the check step; `summary.timeouts` is present with `total 0`; `summary.extraction.chapters` equals the number of checked chapters; read `src/test/ai-fakes/proofread.ts` first: if the fake proofread returns AI items and the auto author decides them, assert `summary.proofread.chapters >= 1`; if it returns none, assert `summary.proofread` is absent (not zeros).

## Acceptance metrics

| Metric | Current | Target |
|---|---|---|
| Run summary has a zod schema | none | `RunSummarySchema`, saved summaries without new keys parse (tests 1-2) |
| Extraction counters in the summary (G1, G2) | returned by the service, read by no one | 4 counters per chapter and total in `run-summary.json` (tests 7-8, 16, run.test.ts) |
| Proofread stats in the summary (J) | `proofreadStats` exists, not wired | AI-only totals and per chapter (tests 9-10, 15) |
| Context hit rate (H) | none | rate per chapter and run (tests 11-12) |
| Timeouts per task | one total (`wouldTimeOut`) | `timeouts.byTask` (tests 3-6) |
| New unit tests | 0 | 15 finish tests + 2 chapter-check tests + run.test.ts assertions pass |
| Real values (what the counters show on the models) | not measurable offline | needs an API key or a local model: fill in the follow-up eval, not in this track |

## Dependencies on other tracks

- Needs, all merged before wave 4: G2 (`stats`, wave 2), G1 (`dropped`, wave 3), J (`proofreadStats`, wave 2), H (`packCoverage`, results JSON, wave 1), HX4 (finish.ts and cli.ts edits come first, wave 3), the seam commit (`metrics-proofread.ts`, plan Task 0.4). Verify with the grep checks in Files.
- Same wave: B writes `src/server/interview.ts`, `known-entries.ts` and `chapter-check.test.ts`. HX5 touches none of them (own test file `chapter-check.HX5.test.ts`). If B's chapter-check test change breaks nothing here, no rebase needed.
- Later (local branch): F2 splits chapter extraction in `chapter-check.ts` into three calls and must merge three `ExtractionCounts` into `result.extraction`; F1 splits proofread into three parts (the proofread stats then count per part). Note both in the local-branch re-pointing task (plan Task L0, step 3).
- `cli.ts` write order is HX1, E2, HX4, F4 (spec 8); HX5 adds one line after HX4 and before F4.

## Risks

- `ChapterCheckResult` is returned by `actions/checks.ts` and the check route; read both: if they pass the result to the client as is, the new `extraction` field (four integers, no user text) is accepted. If they pick fields, nothing leaks.
- `wiki-final.json` is the final wiki, so a card renamed or archived after chapter n could be judged against the wrong name. The `createdAt` filter removes later cards; rename drift is accepted and written in a code comment. Archived cards are not in `wiki-final.json` (active entries only), so they are not counted either.
- Hand-written `RunSummarySchema` can drift from `speedSummary`'s shape. The `RunSummary` return type on `buildRunSummary` makes tsc catch that; keep `speed` as a precise object, not `z.any()`.
- A decision line missing for a proofread chapter means the author never answered; skipping (not 0%) keeps the ratio honest. A redo logs twice; the last line wins.
- `continuity-eval.json` is manual. A wrong file (another model's fixture run) attaches wrong recall; the block carries `model` and `createdAt` so a reader can see it.
- Do not use `Date.now`/`new Date` in new pure functions (tests pass fixed timestamps).

## Open questions (defaults to use if nobody answers)

1. Timeout threshold: spec says "120 s product timeout". Default: each call against its own `productTimeoutMs` (120 s for object calls, 280 s for streams), fallback 120 s for old records. If the owner wants a flat 120 s for streams too, change one line in `timeoutSummary` and test 4.
2. Interview extraction counters (`interview.ts:216`, G1 `dropped` and G2 `stats` there): not wired, because B writes `interview.ts` in this wave and `submitAnswer` returns no counters. Default: chapter check only; add the interview path in a follow-up once B is merged.
3. Fixture recall attachment (`continuity-eval.json` copied by hand): default manual. An automatic copy would need `cli.ts` or the workflow to run `eval:continuity`, which needs an API key and is not part of a run.
4. Do the summary and reviewer agent docs need to mention the new blocks? Default: no (HX1 and HX4 own those files); the cross-run summary can read `run-summary.json` keys directly later.
5. Per-chapter breakdown size: default keep `byChapter` for all three blocks (small numbers). Drop it only if a summary file grows noticeably.

## Definition of done

```
pnpm vitest run eval/novel src/server/chapter-check.HX5.test.ts src/server/chapter-check.test.ts --maxWorkers=2
pnpm exec tsc --noEmit 2>&1 | grep -E "eval/novel/(steps/(finish|chapter)|cli|run)|src/server/chapter-check"   # expect no lines
pnpm eslint eval/novel/steps/finish.ts eval/novel/steps/finish.HX5.test.ts eval/novel/steps/chapter.ts eval/novel/cli.ts eval/novel/run.test.ts src/server/chapter-check.ts src/server/chapter-check.HX5.test.ts
git diff --name-only <wave-base>   # only the Write and Create files above; eval/novel/metrics.ts must NOT appear
```

## Addendum (wave-0 review): A's continuation warning

A's brief (policy in spec 7) stores a `DraftWarning { kind: 'continue-failed', reason, detail }` in the first run row when the continuation fails. Nobody else wires it into the eval, so HX5 owns this:

- In the eval draft step read `warnings` from the first run row; clear the stale `takeLastFailure()` of the failed `draft-continue` call; classify `reason`/`detail` that are external limit or network failures as external (same classification the eval uses for other calls).
- Add an optional `draft.continueFailed` count (and the reasons) to `run-summary.json` via `buildRunSummary`, mark "이어쓰기 실패" in the per-chapter record. Optional field; old summaries still parse.
- Test: a run row with a `continue-failed` warning yields `continueFailed: 1` in the summary; a row without warnings yields 0/absent.
- Files: `eval/novel/steps/chapter.ts` (draft step), `eval/novel/steps/finish.ts`. Both are also in HX5's write list or disjoint from B in wave 4; check before editing.

# Track C brief: foreign-script block (T5), local branch

Repo: /home/xogud/documents/github/DaeumHwa. Work in your own worktree on the LOCAL branch (spec 2: `feat/ai-improvement-local`, wave L3, after E2 and D). TDD: write each test first, watch it fail, then implement. All paths below were checked on 2026-10-19 (HEAD 1c4393e); paths marked "(E2)", "(GUARDS)", "(seam)" or "(A)" are created or changed by those tracks before C starts and do not exist in the repo yet. Line numbers are hints; search for the named symbol. Spec sections 6 to 8 (`docs/superpowers/specs/2026-10-19-ai-improvement-design.md`) are binding; where this brief differs, the spec wins.

Ownership (spec 6): E2 owns the `draft-repair` task (`src/ai/tasks/draft-repair.ts`: `draftRepairTask`, `DRAFT_REPAIR_SYSTEM`, `DraftRepairSchema`, `applyDraftEdits`; `repairDraft`; `repairBestEffort`). GUARDS owns the foreign-script detector (`foreignScriptSpans`, `foreignScriptRuns` in `src/ai/guards`) and the `foreignRuns` metric. C creates NO second draft-repair file, NO second schema, NO detector of its own and does NOT edit `eval/novel/metrics.ts`. C only extends E2's files: `repairDraftForeignScript` and `DraftAttempt.foreign`.

## Goal

Find Han, kana and Cyrillic spans in a finished chapter draft with the GUARDS detector, and rewrite only the sentences that contain them (not the whole draft) by sending them to E2's `draft-repair` task as a new flag kind `'foreign-script'`. Wire this into the eval draft step so qwen ko drafts are repaired before the author reviews them. Add a labeled lower-temperature qwen profile for a later comparison run. This branch is LOCAL: it cannot be measured now (no Ollama run), it is only unit-tested with `FakeAiClient`. Never call a real model.

## Evidence (numbers)

- qwen3.8-27b ko, 1 chapter: 3 of 3 draft attempts contained Han: attempt 1 `以上是`, attempt 2 `三楼` and `接到了`, attempt 3 `嬷嬷` and `样的` (docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md line 69).
- The final saved text kept `원장嬷嬷가` (same file, lines 52 and 298). Proofread fixed `样的` but missed `嬷嬷`. The proofread prompt (src/ai/tasks/proofread.ts) has no script rule.
- The recorded `foreignRuns` was `[]` because that run used the old metric. Han detection entered eval/novel/metrics.ts in commit 9bf7bdd, so the current metric already flags these (eval/novel/metrics.test.ts has the 嬷嬷 case). GUARDS later moves that metric onto `foreignScriptRuns` without changing its output.
- `pickAttempt` (eval/novel/steps/util.ts) picked attempt 3 over attempt 1 on a quality tie (2 vs 2), with no foreign-script gate.
- Author review scored the three attempts 2, 1, 2 and rejected all (3 draft calls, about 84 minutes per chapter for qwen ko (`perChapterMs` median 83.8 min, summary.md section 3; qwen en is 97.8 min)). Cloud runs (haiku, luna) had no Han. Cause of Han is untested (summary.md:204 marks the cause as "추정" (estimated): temperature 1.0 or training data).
- Sampling today: eval/novel/models.ts qwen profile `temperature: 1.0, topP: 0.95, topK: 20` (vendor thinking-mode values, docs/eval/novel/model-setup.md). `OllamaAiClient` has no default temperature; it forwards `settings.temperature` to `options.temperature` (src/ai/ollama.ts `chatBody`).
- The product never builds an Ollama client (src/ai/index.ts only builds Anthropic or OpenCode). Decision in the eval spec: local models stay out of product. So this track changes the eval harness plus product-neutral code. Do NOT wire repair into the product route, panel or `startDraft`.

## Files

Write (existing, or created by E2/seam/GUARDS before C; edit):
- src/lib/korean/style-copy.ts (E2) : widen `DraftFlagKind` with `'foreign-script'`; nothing else.
- src/ai/tasks/draft-repair.ts (E2) : add `repairableForeignSpans`, one rule line in `DRAFT_REPAIR_SYSTEM`, extra `postProcess` checks for `'foreign-script'` flags.
- src/test/ai-fakes/draft-repair.ts (E2, seam) : make `fakeDraftRepair` answer foreign-script flags. The seam already registered `'draft-repair'` in `FAKE_OUTPUTS`, `AI_TASKS` and `EN_SYSTEMS`; do NOT edit `src/db/types.ts`, `src/test/ai-fakes/index.ts` or `eval/novel/localize/en-systems.ts`.
- eval/novel/localize/en/draft-repair.ts (E2, seam) : the English twin of the new rule line.
- src/server/ai-features.ts : add `repairDraftForeignScript` (new exported function after E2's `repairDraft`; do not change `startDraft`, `createChapterFromDraft` or `repairDraft` logic).
- eval/novel/state.ts : add optional field `foreign?` to `DraftAttempt`.
- eval/novel/steps/chapter.ts : add the foreign-script block in the `draft` step (lang `ko` only), next to E2's `repairBestEffort(repairDraft)` hook.
- eval/novel/models.ts : add profile `qwen3.8-27b-t06` and its id.
- docs/eval/novel/model-setup.md : add one note under the settings table (see Design step 9).

Create (new; shared test files stay untouched, new tests go in `<name>.C.test.ts`, spec 5.3):
- src/ai/tasks/draft-repair.C.test.ts, src/server/ai-features.C.test.ts, src/server/exports.C.test.ts, eval/novel/run.C.test.ts, eval/novel/models.C.test.ts

Not touched by C (owned by others): `eval/novel/metrics.ts` and `metrics.test.ts` (GUARDS), `src/lib/korean/index.ts`, `localize.test.ts` (seam), `src/ai/guards/**`.

Read only: src/server/exports.ts (decision in Risks), src/lib/korean/sentences.ts (`sentenceIn`), src/ai/guards (GUARDS: `foreignScriptSpans`, `foreignScriptRuns`, `splitSentencesFor`, type `ForeignSpan`), src/ai/prompt-utils.ts, src/ai/run.ts (`runAiTask`), src/lib/draft-stream.ts (`DRAFT_ERROR_MARK`, imported, not edited), src/test/fake-ai.ts, eval/novel/eval-client.ts, eval/novel/steps/util.ts (`withModelRetry`, `pickAttempt`), eval/novel/steps/finish.ts (`buildRunSummary` already emits `drafts`).

## Design (do in this order)

0. Pre-conditions (check first, stop and report if one is missing): GUARDS has merged (`src/ai/guards` exports `foreignScriptSpans`, `foreignScriptRuns`, `ForeignSpan`; `eval/novel/metrics.ts` already uses `foreignScriptRuns`); E2 has merged (`draftRepairTask`, `applyDraftEdits`, `repairDraft`, `repairBestEffort`, `DraftFlag` exist); the seam registered `'draft-repair'`. C must not write a regex for Han, kana or Cyrillic anywhere in non-test code.
1. `src/lib/korean/style-copy.ts`: `DraftFlagKind = 'sample-copy' | 'repeated-word' | 'foreign-script'`. `findDraftFlags` is unchanged (it never returns the new kind).
2. `src/ai/tasks/draft-repair.ts`:
   - `repairableForeignSpans(text): ForeignSpan[]` = `foreignScriptSpans(text, 'ko').filter(s => s.script !== 'latin' && s.script !== 'hangul')`. GUARDS also returns Latin spans for ko; repair is only for Han, kana, Cyrillic and U+FFFD, so Latin never counts as repairable.
   - In `DRAFT_REPAIR_SYSTEM`, add right after E2's flags-explanation bullet (change nothing else): `- foreign-script는 한글이 아닌 글자(한자, 일본어 가나, 키릴 문자)가 섞인 문장이다. 섞인 부분만 같은 뜻의 자연스러운 한글 표현으로 바꾸고, 바꾼 부분에는 한글과 문장부호만 쓴다. 섞인 부분 밖의 숫자와 영문은 그대로 두고, 줄바꿈은 넣지 않는다.` English twin in `en/draft-repair.ts`: `- foreign-script marks a sentence that mixes in non-Hangul characters (Han, kana, Cyrillic). Replace only the mixed-in part with a natural Hangul expression, using only Hangul and punctuation in the replaced part. Keep digits and Latin letters outside the mixed-in part as they are, and add no line breaks.` (the English module is not used on ko runs; it exists so `EN_SYSTEMS` stays complete and Hangul-free).
   - `postProcess(output, input)`: keep E2's checks. For an edit whose matching flag (the first flag whose trimmed quote contains the edit quote) has kind `'foreign-script'`, also drop it when: the replacement contains `\n`; it contains `DRAFT_ERROR_MARK` (import from `@/lib/draft-stream`; never write the control character literally); `repairableForeignSpans(replacement).length > 0`; or any ASCII digit run or Latin letter run (`/[0-9A-Za-z]+/g`) of `edit.quote` no longer appears in the replacement (a fix that drops `3일` or `OK` is rejected). Other flag kinds keep E2's behavior exactly.
3. `src/test/ai-fakes/draft-repair.ts`: `fakeDraftRepair(input)` keeps returning no edit for sample-copy and repeated-word flags (E2's tests stay green). For each flag of kind `'foreign-script'` it returns `{ quote: flag.quote, replacement }` where `replacement` is the quote with every `repairableForeignSpans` run removed (collapse double spaces, trim).
4. `src/server/ai-features.ts`: add `repairDraftForeignScript` (signature below). Steps: `await requireWorkRole(db, workId, actor.userId, 'editor')` first. Load the run with the same checks as `createChapterFromDraft` (missing, other work, other user or task not `draft-chapter` gives `AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')`; status not `done` gives `AppError('BAD_STATE', '초안 작성이 끝난 뒤에 고칠 수 있습니다.')`; unreadable output gives `BAD_STATE '저장된 초안을 읽을 수 없습니다.'`). Call it only after the draft has finished (`await run.done`): with A, `done` is the joined text and the first run's row holds it (A's `replaceRunOutput`), and `runId` stays that run; never repair a run whose `done` has not resolved.
   - Start text: `input.text` when given (the eval passes the text left after E1's trim), else `draftText(run.output)`. `stored = draftText(run.output)`. Idempotency: if `run.output` is an object whose `rawText` is a string, keep it as `storedRaw` (an already repaired run keeps its first raw draft); otherwise `storedRaw` is `null`.
   - Loop `round` from 1 to `MAX_REPAIR_ROUNDS = 2`: `spans = repairableForeignSpans(text)`; stop if none. Map each span to its sentence with `sentenceIn(splitSentencesFor(text, 'ko'), span.start)`, distinct, ordered by start, at most `MAX_REPAIR_SENTENCES = 30` per round, each as a `DraftFlag { kind: 'foreign-script', start, end, quote: <sentence text>, reason: '한글이 아닌 글자가 섞여 있다.' }`. Call `runAiTask(db, { userId: actor.userId, workId, chapterId: run.chapterId, signal }, draftRepairTask, { text, flags }, client)`, then `applyDraftEdits(text, flags, output.edits)` (E2's function: it guarantees nothing outside a flagged sentence changes). Add `applied` to `replaced`.
   - After the loop, if `text !== stored`, `db.update(aiRuns).set({ output: { ...(run.output as object), text, rawText: storedRaw ?? stored } }).where(eq(aiRuns.id, runId))` (spread keeps A's `warnings` and E2's `repair` keys). `createChapterFromDraft` reads `output.text`, so it saves the repaired text. Return `unresolved = repairableForeignSpans(text)`. If there is no span at the start, make no AI call and no db write.
5. eval/novel/state.ts: `DraftAttempt` gets `foreign?: { found: number; replaced: number; unresolved: number }` (optional, so old state.json files still load; spec 8). `buildRunSummary` already writes `drafts`, so the figures come out of run-summary.json with no change to finish.ts. `ChapterMetrics` is NOT changed by C.
6. eval/novel/steps/chapter.ts, in `draft`. Order inside the hook (spec 7): A (continuation, inside `startDraft`) then E1 paragraph trim (if landed) then foreign-script repair (this step) then E2 `repairBestEffort(repairDraft)`, each once on the final text of the step before. Let `current` be the attempt text after A and E1 (`generated.text` before E1 exists). If `ctx.config.lang === 'ko'` and `repairableForeignSpans(current).length > 0` (`found` = that count): write `current` to `chapters/NN.attempt-K.pre-repair.md` (a name no other track uses; E1 writes `.raw.md`, E2 writes `draft.repaired.txt`; C never overwrites another track's file), then call E2's `repairBestEffort(ctx, state, key + ':foreign-repair', async () => (result = await repairDraftForeignScript(ctx.db, ctx.actor, { workId, runId: generated.runId, text: current }, ctx.client)), current)` with `result` captured in a closure; on success `current` becomes the repaired text. On failure `repairBestEffort` records `state.failed` (step `ch{n}:draft:foreign-repair`) and returns `current`; `replaced` is then 0. External failures (billing, limit) still pause the run through `repairBestEffort`'s routing.
   - Then E2's hook runs with `text: current` added to its `repairDraft` input (a one-line change to E2's call; E2 made `text` optional for this). The attempt file gets E2's output text, so `chapterMetrics` for the author review sees the final text. After E2, set `foreign = { found, replaced, unresolved: repairableForeignSpans(finalText).length }` on the pushed attempt (count from the FINAL text, because E2's rewrite could bring back foreign characters; E1's trim cannot, it runs before). No span at the start: no `foreign` field set and no extra call. Do not add a second regenerate loop: a still-dirty attempt is shown to the author through `foreignRuns` and is rejected as before.
   - Single source of the saved text: after E1 lands, the saved chapter text is the final attempt file text passed to `createChapterFromDraft` through E1's `body` argument; the run-row rewrite from step 4 is the fallback path when `body` is absent. Either way `chapters/NN.attempt-K.md` and the saved chapter agree.
7. eval/novel/models.ts: add `'qwen3.8-27b-t06'` to `MODEL_IDS` and a profile equal to the qwen3.8-27b one (spread it, set `id`, `ollama: { ...qwen.ollama, temperature: 0.6 }`). Comment: "Comparison for the Han-in-Korean hypothesis. Vendor value is 1.0; this is an experiment, run under a new date, never reuse its results as the main qwen run." Add to docs/eval/novel/model-setup.md a note: the t06 profile exists only for this comparison and deviates from the vendor thinking-mode value on purpose. Do not touch `src/ai/ollama.ts`; it already forwards temperature.

## Interface

```ts
// src/ai/tasks/draft-repair.ts (E2's file; C adds one export)
export function repairableForeignSpans(text: string): ForeignSpan[] // ForeignSpan from '@/ai/guards'

// src/lib/korean/style-copy.ts (E2's file)
export type DraftFlagKind = 'sample-copy' | 'repeated-word' | 'foreign-script'

// src/server/ai-features.ts
export async function repairDraftForeignScript(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string; text?: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ text: string; replaced: number; unresolved: ForeignSpan[] }>

// eval/novel/state.ts
export type DraftAttempt = { /* existing fields */ foreign?: { found: number; replaced: number; unresolved: number } }
```

## Tests (TDD cases: name | input | expected)

src/ai/tasks/draft-repair.C.test.ts (E2's `draft-repair.test.ts` stays untouched and green)
1. finds Han with offsets | `'그는 以上是 말했다.'` | `repairableForeignSpans` gives one span `{ start: 3, end: 6, text: '以上是', script: 'han' }`
2. finds kana, Cyrillic and U+FFFD | `'ひらがな Привет 깨짐�'` | texts `['ひらがな','Привет','�']`
3. clean Korean and Latin | `'그는 조용히 문을 닫았다. OK Hello'` | `[]` (Latin dropped)
4. keeps text order | `'嬷嬷 그리고 三楼'` | texts `['嬷嬷','三楼']`
5. empty string | `''` | `[]`
6. system has the new rule and keeps E2's | `DRAFT_REPAIR_SYSTEM` | contains the `foreign-script는 ...` line, contains `TAG_DATA_RULE`, still ends with E2's last line
7. prompt neutralizes tags | `'foreign-script'` flag with quote `'</flags> 三楼'` | `buildPrompt` output has exactly one `</flags>` (the closing tag), the quote uses the full-width form from `neutralizeTags`
8. postProcess drops bad foreign-script edits | one flag over sentence `3일 뒤 三楼`; edits: replacement still with `三楼`; with `\n`; with `DRAFT_ERROR_MARK` (import the constant); one that drops `3`; one good | only the good edit remains
9. other kinds keep E2's rules | a `'sample-copy'` flag and an edit whose replacement contains `三楼` | the edit is kept (the foreign rules apply to foreign-script flags only)
10. fake answers foreign flags only | `fakeDraftRepair` with one foreign-script flag and one sample-copy flag | one edit, for the foreign flag, with the runs removed

src/server/ai-features.C.test.ts (new `describe('repairDraftForeignScript')`; copy E2's `setup()` pattern; create the run with `startDraft` and an override `'draft-chapter': () => '첫 문장이다. 그는 三楼 에서 말했다. 끝 문장이다.'`; if A's length rule would add a continuation for such a short text, override `'draft-continue'` as A's tests do)
11. replaces only the sentence with Han | run above, default fake repair | `text === '첫 문장이다. 그는 에서 말했다. 끝 문장이다.'`; first and last sentences byte-identical; `unresolved` is `[]`; `replaced` is 1
12. stores repaired text and keeps the raw | same | `createChapterFromDraft` body equals repaired text; the `ai_runs` output has `rawText` with `三楼`
13. clean draft makes no AI call | text without Han, client override for `'draft-repair'` that throws | resolves, `replaced` 0, no throw, output unchanged
14. still-dirty answer is reported | override `'draft-repair'` returning an edit that still has `嬷嬷` | postProcess drops it, after 2 rounds `unresolved` has 1 span, text unchanged, `replaced` 0, no `rawText` written
15. second round fixes the rest | two Han sentences. Override with a call counter reads `input.flags`: round 1 gets two flags and answers only the first; round 2 gets one flag and answers it | `unresolved` is `[]`, `replaced` 2, exactly 2 `draft-repair` calls
16. rejects a non-member | other user's actor | `AppError` code `NOT_FOUND`
17. rejects a run that is not a draft or not done | id of an error run, random uuid | `BAD_STATE` for not done, `NOT_FOUND` for unknown. Build the error run by inserting an `ai_runs` row directly (`db.insert(aiRuns).values({ ... status: 'error', task: 'draft-chapter', workId, userId })`, columns from `src/db/schema.ts`). Do not try to make `startDraft` fail.
18. repairing twice keeps the first raw draft | 3 Han sentences; override fixes one flag per call. Call twice | after call 1 one span is left; after call 2 `unresolved` is `[]`; `rawText` is still the first original draft
19. explicit `text` and other keys | seed the output with `warnings: []` and `repair: { flagged: 0, applied: 0 }`; call with `text` holding a Han sentence while the stored text is clean | the repaired given text is stored, `warnings` and `repair` survive, `rawText` is the stored text

eval/novel/run.C.test.ts (copy the 'draft redo' pattern from `run.test.ts`; `makeRun(dir, 1, 2)`, `inner: new FakeAiClient({ overrides: { 'draft-chapter': () => <Korean text of 600+ chars with 三楼 in one sentence> } })`, `autoAuthor: true`; after A, E1 and E2 are merged, also override `'draft-continue'` if a continuation fires)
20. repairs Han before review and saves the clean text | as above | state `done`; `01.attempt-1.md` has no Han; `01.attempt-1.pre-repair.md` has `三楼`; the saved chapter body equals `01.attempt-1.md`; `state.data.drafts[1][0].foreign` is `{ found: 1, replaced: 1, unresolved: 0 }`; `metrics/01.json` has `foreignRuns: []` and `foreignScriptRuns(finalText, 'ko')` is `[]`
21. a failed repair keeps the raw draft and records it | `'draft-repair'` override that throws `new AppError('AI_ERROR', 'x')` | state `done`; chapter saved with the raw text; `state.failed` has an entry with step `ch1:draft:foreign-repair`; `foreign` is `{ found: 1, replaced: 0, unresolved: 1 }`. If a throwing override is not recorded as a model failure by `EvalClient`, wrap `FakeAiClient` like `draftsFailingAfter` in run.test.ts does.
22. English run is not repaired | `lang: 'en'` run (see how cli.test.ts builds one) with the same Han draft | no foreign-script `draft-repair` call, no `foreign` field

eval/novel/models.C.test.ts
23. t06 profile differs only in temperature | `MODEL_PROFILES['qwen3.8-27b-t06']` vs qwen | `ollama.temperature === 0.6`, every other `ollama` field and `model`, `effort`, `maxTokensFloor` equal; `queue === 'local'`; `createModelClient` returns `OllamaAiClient`

src/server/exports.C.test.ts
24. rawText is exported | insert a done `draft-chapter` run with output `{ text: 'a', rawText: 'b' }` | `payload.aiRuns` has that row and its output keeps both keys

Existing tests that must stay green: src/ai/ollama.test.ts, src/ai/tasks/draft-chapter.test.ts and draft-repair.test.ts (do not edit `DRAFT_SYSTEM`), eval/novel/localize tests including the seam snapshot (after step 2), eval/novel/metrics.test.ts and metrics.foreign.test.ts (not edited), eval/novel/cli.test.ts, the `repairDraft` tests of E2.

## Acceptance metrics

| metric | current | target |
|---|---|---|
| `foreignRuns` in the saved final text, ko | qwen ko run: `嬷嬷` present (old metric recorded `[]`) | 0 after repair (checked by unit test 20; real measurement later) |
| draft attempts with foreign spans that reach the author review | 3 of 3 | 0 when repair resolves them |
| extra model calls caused by foreign script | 0 (none existed) | 2 rounds per attempt, plus at most 1 retry per round (so at most 4 foreign-script `draft-repair` calls per attempt). `calls.byTask['draft-repair']` in run-summary.json is a run total that also counts E2's calls; separate them per chapter from `calls/*.json` records with task `draft-repair` whose `step` ends with `:foreign-repair` (E2's end with `:repair`), grouped by chapter and divided by the number of attempts in `drafts[n]` |
| author draft rewrites caused by Han | 2 (3 attempts) | 0 to 1 (source: the harness records no author rewrites; count the `draft_review` answers in `author-decisions.jsonl` with `usable: false` whose reason names 한자 or foreign script, manually after the later qwen ko rerun) |
| `chapterMetrics` output for existing inputs | see metrics.test.ts | unchanged (C does not edit it) |
| qwen temperature 0.6 vs 1.0 Han attempt rate | 3 of 3 at 1.0 | later run only; 3 samples cannot decide, note this |

Only the unit-test items can pass now. The rest need a qwen run (about 84 minutes per chapter, qwen ko); do not claim them as measured.

## Dependencies on other tracks

- GUARDS (wave 1, hard): supplies `foreignScriptSpans`/`foreignScriptRuns`/`ForeignSpan` and the `foreignRuns` metric. C imports them from `@/ai/guards`; no foreign-script detector or `metrics.ts` edit in C (spec 6). If GUARDS changes how a script is classified, only `repairableForeignSpans` needs a look.
- E2 (wave 2, hard): C extends E2's `draft-repair.ts`, `style-copy.ts`, fake and English module, and calls `repairBestEffort`/`draftRepairTask`/`applyDraftEdits`. E2's wording rule is 베껴 쓰지 않는다 (not C's concern). Keep E2's tests green.
- A (wave 1): `startDraft` is a continuation driver; the repair runs on the final joined text after `await run.done`, on the first run's row A rewrites with `replaceRunOutput` (step 4 and 6). A also edits `DRAFT_SYSTEM` and `responders.ts` first; C changes neither.
- E1 (wave 3, cloud, merged before the local branch): paragraph trim runs before C's hook and its `body` argument is the saved-text source (step 6). File names stay separate: C `NN.attempt-K.pre-repair.md`, E1 `.raw.md`, E2 `draft.repaired.txt`.
- D (L2, local): the beats step runs before the draft and the two-step draft produces its final text from several calls; the same rule applies (repair the final text once, after all draft calls are finished). D's scene rewrite runs later (after proofread and continuity check, spec 7), outside this hook; C does not repair text that rewrite produces, so a Han span it brings back shows only in `foreignRuns` of the final metrics. Read D's merged code and place the C block after D's draft calls and before E2's hook.
- Seam (wave 0): task name `'draft-repair'`, `EN_SYSTEMS`, `FAKE_OUTPUTS` and sample prompt are registered; C edits only the contents of the `draft-repair` files.

## Risks

- Crash window: the repair rewrites the stored run output before the attempt file is written. A crash in between redrafts on resume (same as today's behavior), at the cost of one more draft call.
- A sentence rewrite can drift in meaning. The prompt limits the change to the foreign words, `applyDraftEdits` blocks changes outside the flagged sentence, and unit tests check unchanged neighbors, but real quality is unmeasured.
- A Han word can be intentional (a hanja term or a name). There is no opt-out. This matches the T5 metric, which flags any length.
- Two repairs (foreign script, then E2) are two model calls on a slow local model; each is capped by `draftRepairTask.timeoutMs` and by the eval timeout override (`setAiTimeoutOverride`). Product default 120 s would be too short for local models, which is why the repair stays eval-only.
- `ai_runs.output` for the draft changes shape to `{ text, rawText, ... }` after repair. `draftText` only reads `text`. Decision: `src/server/exports.ts` selects whole `ai_runs` rows for `draft-chapter` (`EXPORTED_AI_TASKS`), so `rawText` goes into the backup and export on purpose, as the author's own raw draft. No edit to exports.ts; test 24 pins this behavior.
- Widening `DRAFT_REPAIR_SYSTEM` moves E2's prompt; the seam's byte-identical snapshot test covers only pre-existing tasks, so a stale pinned-text test for `draft-repair` is fixed by the integrator, not by reverting the line.

## Open questions (answered with defaults; do not block on them)

1. Repair also in the product? Default no. Local models are out of product; the function is product-neutral and can be called from a button later.
2. Word-level or sentence-level? Default sentence-level (reliable locating).
3. Does repair count as an author rewrite? Default no. It is recorded as `foreign` on the attempt and as `draft-repair` calls.
4. Opt-out for intentional Han? Default none. Revisit if a real chapter needs it.
5. Should `pickAttempt` avoid attempts that still have foreign runs? Default not in this track (needs the author's call); the `foreign.unresolved` field makes it a one-line change later.
6. Value 0.6 for the comparison? Default 0.6 (the plan's first value and the test fixture). Change it only if the author says so.
7. One merged repair call (foreign-script flags plus E2's flags) or two sequential calls? Default two sequential calls: E2's `repairDraft` stays unchanged and independently testable. Revisit if call counts matter.

## Definition of done

Run from the worktree root. Use `--maxWorkers=2` and `pnpm exec tsc --noEmit` (no typegen) when other agents run in parallel; filter tsc output to your files.

```
pnpm vitest run src/ai/tasks/draft-repair.test.ts src/ai/tasks/draft-repair.C.test.ts src/ai/tasks/draft-chapter.test.ts src/ai/tasks/proofread.test.ts src/ai/guards src/server/ai-features.test.ts src/server/ai-features.E2.test.ts src/server/ai-features.C.test.ts src/server/exports.test.ts src/server/exports.C.test.ts eval/novel/metrics.test.ts eval/novel/models.test.ts eval/novel/models.C.test.ts eval/novel/run.test.ts eval/novel/run.C.test.ts eval/novel/cli.test.ts eval/novel/localize eval/novel/eval-client.test.ts src/ai/ollama.test.ts --maxWorkers=2
pnpm exec tsc --noEmit
pnpm eslint src/lib/korean src/ai/tasks src/server/ai-features.ts src/test eval/novel
pnpm exec prettier --write <each touched or created file listed under Files>
```
Do not run `pnpm format`: it is `prettier --write .` and rewrites the whole repository, including other tracks' files and the untracked handoff folder. Run prettier only on the files in the Files lists.
All tests green, no new tsc or eslint errors in touched files, no package changes, `git diff --name-only` lists only files from Files, no edit to `src/ai/ollama.ts`, `DRAFT_SYSTEM`, `src/db/types.ts`, `metrics.ts`, the draft route or the draft panel, and no new Han/kana/Cyrillic regex in non-test code. Create the worktree and local branch first: `git worktree add ../DaeumHwa-track-c -b track/local/C feat/ai-improvement-local` (run in /home/xogud/documents/github/DaeumHwa, after E2 and D are merged into the local branch; the path is the sibling directory `/home/xogud/documents/github/DaeumHwa-track-c`). The branch is local only: do not push. Commit on that branch with a message starting `feat(ai):`.

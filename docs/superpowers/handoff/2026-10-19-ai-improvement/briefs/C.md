# Track C brief: foreign-script block (T5), local branch

Repo: /home/xogud/documents/github/DaeumHwa. Work in your own worktree on the LOCAL branch (spec 2: `feat/ai-improvement-local`, wave L3, after D; E2 is already merged). TDD: write each test first, watch it fail, then implement. All paths below were re-checked on 2026-10-19 against the local branch (cloud tag `cloud-final`, HEAD 26bc2c1) with the cloud tracks GUARDS, A, E1, E2, J and the rest merged. Only D (wave L2) and the L0 seam additions (`draft-beats`, `scene-rewrite`, `chapter-extract-facts|threads|relations`) are not in the tree yet; paths marked "(D)" come from D. Line numbers are hints; search for the named symbol. Spec sections 6 to 8 (`docs/superpowers/specs/2026-10-19-ai-improvement-design.md`) are binding; where this brief differs, the spec wins.

Ownership (spec 6): E2 owns the `draft-repair` task (`src/ai/tasks/draft-repair.ts`: `draftRepairTask`, `DRAFT_REPAIR_SYSTEM`, `DraftRepairSchema`, `applyDraftEdits`; `repairDraft` in `src/server/ai-features.ts`; `repairBestEffort`, exported from `eval/novel/steps/chapter.ts`). GUARDS owns the foreign-script detector (`foreignScriptSpans`, `foreignScriptRuns` in `src/ai/guards`, barrel `index.ts`) and `foreignRuns` in `eval/novel/metrics.ts`. C creates NO second draft-repair file, NO second schema, NO detector of its own (no Han, kana or Cyrillic regex in non-test code; import from `@/ai/guards`) and does NOT edit `eval/novel/metrics.ts`. C only extends E2's files: `repairDraftForeignScript` and `DraftAttempt.foreign`. The L0 seam owner registers the task names; the owning track of a seam task fills its files. C owns none of them and edits none of `AI_TASKS` (`src/db/types.ts`), `EN_SYSTEMS`, `eval/novel/localize/en-systems.ts`, `localize.test.ts`.

## Goal

Find Han, kana, Cyrillic and U+FFFD spans in a finished chapter draft with the GUARDS detector, and rewrite only the sentences that contain them (not the whole draft) by sending them to E2's `draft-repair` task as a new flag kind `'foreign-script'`. Wire this into the eval draft step so qwen ko drafts are repaired before the author reviews them. Add a labeled lower-temperature qwen profile for a later comparison run. This branch is LOCAL: it cannot be measured now (no Ollama run), it is only unit-tested with `FakeAiClient`. Never call a real model.

## Evidence (numbers)

- qwen3.8-27b ko, 1 chapter: 3 of 3 draft attempts contained Han: attempt 1 `以上是`, attempt 2 `三楼` and `接到了`, attempt 3 `嬷嬷` and `样的` (docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md line 69).
- The final saved text kept `원장嬷嬷가` (same file, lines 52 and 298). Proofread fixed `样的` but missed `嬷嬷`. `src/ai/tasks/proofread.ts` has no script rule (checked).
- The recorded `foreignRuns` was `[]` because that run used the old metric. Han detection entered `eval/novel/metrics.ts` in commit 9bf7bdd (`eval/novel/metrics.test.ts` line 92 has the 嬷嬷 case). GUARDS has since moved the metric onto `foreignScriptRuns` without changing its output (`eval/novel/metrics.foreign.test.ts` pins it).
- `pickAttempt` (eval/novel/steps/util.ts) picks the first usable attempt, else the highest quality, the latest on ties. It picked attempt 3 over attempt 1 on a quality tie (2 vs 2), with no foreign-script gate.
- Author review scored the three attempts 2, 1, 2 and rejected all (3 draft calls, about 84 minutes per chapter for qwen ko: `perChapterMs` median 83.8 min, summary.md lines 159 and 160; qwen en is 97.8 min). Cloud runs (haiku, luna) had no Han. Cause of Han is untested (summary.md:204 marks the cause as "추정" (estimated): training data or temperature 1.0).
- Sampling today: `eval/novel/models.ts` profile `qwen3.8-27b` has `ollama: { numCtx: 262144, temperature: 1.0, topP: 0.95, topK: 20, minP: 0, think: true }` (vendor thinking-mode values, docs/eval/novel/model-setup.md). `OllamaAiClient` has no default temperature; it forwards `settings.temperature` to `options.temperature` (src/ai/ollama.ts `chatBody`).
- The product never builds an Ollama client (src/ai/index.ts only builds Anthropic or OpenCode). Local models stay out of product. So this track changes the eval harness plus product-neutral code. Do NOT wire repair into the product route, panel, action or `startDraft`.

## Files

Write (existing; edit):
- src/lib/korean/style-copy.ts (E2) : widen `DraftFlagKind` with `'foreign-script'`; nothing else.
- src/ai/tasks/draft-repair.ts (E2) : add `repairableForeignSpans`, one rule line in `DRAFT_REPAIR_SYSTEM`, extra `postProcess` checks for `'foreign-script'` flags.
- src/test/ai-fakes/draft-repair.ts (E2) : `fakeDraftRepair` takes the input and answers foreign-script flags (today it takes no argument and returns no edits). `FAKE_OUTPUTS` already maps `'draft-repair'` to it; do NOT edit `src/test/ai-fakes/index.ts`.
- eval/novel/localize/en/draft-repair.ts (E2) : the English twin of the new rule line. Do not touch `samples/draft-repair.ts` (it builds a sample-copy prompt, still valid).
- src/server/ai-features.ts : add `repairDraftForeignScript` (new exported function right after `repairDraft`, before `draftText`) and two constants in the top constants block. Do not change `startDraft`, `completeDraft`, `createChapterFromDraft` or `repairDraft` logic.
- eval/novel/state.ts : add optional field `foreign?` to `DraftAttempt` (`state.ts` has no zod schema, so old state.json files load unchanged).
- eval/novel/steps/chapter.ts : add the foreign-script block in the `draft` step (lang `ko` only), between E1's `trimStage` call and E2's `repairBestEffort(repairDraft)` call; add one name to the stale-file list.
- eval/novel/steps/finish.ts : in `RunSummarySchema`, add `foreign: z.object({ found: CountSchema, replaced: CountSchema, unresolved: CountSchema }).optional()` to the `drafts` element object. `buildRunSummary` already copies `state.data.drafts` as it is, so the file has `foreign`; without this line `RunSummarySchema.parse` strips it. Nothing else in finish.ts.
- eval/novel/models.ts : add profile `qwen3.8-27b-t06` and its id.
- docs/eval/novel/model-setup.md : add one bullet to the "설명" list (after the `주의(Qwen)` bullet), see Design step 7.

Create (new; shared test files stay untouched, new tests go in `<name>.C.test.ts`, spec 5.3):
- src/ai/tasks/draft-repair.C.test.ts, src/server/ai-features.C.test.ts, src/server/exports.C.test.ts, eval/novel/run.C.test.ts, eval/novel/models.C.test.ts, eval/novel/steps/finish.C.test.ts

Not touched by C (owned by others): `eval/novel/metrics.ts` and its tests (GUARDS, E1, E2), `src/lib/korean/index.ts` (already re-exports style-copy), `localize.test.ts`, `src/ai/guards/**`, `.claude/workflows/novel-eval.js` (its `ALL_MODELS` list stays; start a t06 run with the CLI `--model qwen3.8-27b-t06`, `parseModel` in cli.ts reads `MODEL_IDS`).

Read only: src/server/exports.ts (decision in Risks), src/lib/korean/sentences.ts (`splitSentences`, `sentenceIn`), src/ai/guards (`foreignScriptSpans`, `foreignScriptRuns`, type `ForeignSpan { start, end, text, script }`, `script` is `'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul'`), src/ai/prompt-utils.ts, src/ai/run.ts (`runAiTask`, `replaceRunOutput`, `throwIfCancelled`), src/lib/draft-stream.ts (`DRAFT_ERROR_MARK`, imported, not edited), src/test/fake-ai.ts, eval/novel/eval-client.ts (`setStep`, `takeLastFailure`; `draftRepairTask` is already in its `TASK_DEFS`, so its 180 s limit applies to C's calls), eval/novel/steps/util.ts (`withModelRetry`, `pickAttempt`, `writeRunFile`, `readRunFile`).

## Design (do in this order)

0. Pre-conditions (check first, stop and report if one is missing): D has merged (the draft step passes D's two-step options and writes D's beats file; C's block goes after D's draft calls). Already true on this branch, re-check anyway: `@/ai/guards` exports `foreignScriptSpans`, `foreignScriptRuns`, `ForeignSpan`; `eval/novel/metrics.ts` imports `foreignScriptRuns`; `draftRepairTask`, `applyDraftEdits`, `repairDraft` (input `{ workId, runId, lang?, text? }`), `DraftFlag` and `repairBestEffort` exist. Note there is NO `splitSentencesFor` in the guards barrel; split sentences with `splitSentences` from `@/lib/korean/sentences`.
1. `src/lib/korean/style-copy.ts`: `DraftFlagKind = 'sample-copy' | 'repeated-word' | 'foreign-script'`. `findDraftFlags` is unchanged (it never returns the new kind).
2. `src/ai/tasks/draft-repair.ts`:
   - `repairableForeignSpans(text): ForeignSpan[]` = `foreignScriptSpans(text, 'ko').filter(s => s.script !== 'latin' && s.script !== 'hangul')`. For ko GUARDS also returns Latin runs of 4+ letters; repair is only for Han, kana, Cyrillic and U+FFFD, so Latin never counts as repairable. (`foreignScriptRuns` keeps its Latin-first order and is not used here.)
   - In `DRAFT_REPAIR_SYSTEM`, add right after the first rule bullet (the one that explains sample-copy and repeated-word; change nothing else): `- foreign-script는 한글이 아닌 글자(한자, 일본어 가나, 키릴 문자)가 섞인 문장이다. 섞인 부분만 같은 뜻의 자연스러운 한글 표현으로 바꾸고, 바꾼 부분에는 한글과 문장부호만 쓴다. 섞인 부분 밖의 숫자와 영문은 그대로 두고, 줄바꿈은 넣지 않는다.` English twin in `en/draft-repair.ts` after its first rule bullet: `- foreign-script marks a sentence that mixes in non-Hangul characters (Han, kana, Cyrillic). Replace only the mixed-in part with a natural Hangul expression, using only Hangul and punctuation in the replaced part. Keep digits and Latin letters outside the mixed-in part as they are, and add no line breaks.` (not used on ko runs; it keeps `EN_SYSTEMS` complete and Hangul-free, which `localize.test.ts` checks).
   - `postProcess(output, input)`: keep E2's checks (blank, same as quote, quote inside some flag). For an edit whose matching flag (the first flag whose trimmed quote contains the edit quote) has kind `'foreign-script'`, also drop it when: the replacement contains `\n`; it contains `DRAFT_ERROR_MARK` (import from `@/lib/draft-stream`; never write the control character literally); `repairableForeignSpans(replacement).length > 0`; or any ASCII digit run or Latin letter run (`/[0-9A-Za-z]+/g`) of `edit.quote` no longer appears in the replacement (a fix that drops `3일` or `OK` is rejected). Other flag kinds keep E2's behavior exactly. The prompt shows only `[kind] quote` per flag (never the Korean reason), so no prompt code changes.
3. `src/test/ai-fakes/draft-repair.ts`: `fakeDraftRepair(input: DraftRepairInput)` keeps returning no edit for sample-copy and repeated-word flags (E2's tests stay green). For each flag of kind `'foreign-script'` it returns `{ quote: flag.quote, replacement }` where `replacement` is the quote with every `repairableForeignSpans` run removed (collapse double spaces, trim).
4. `src/server/ai-features.ts`: add constants `MAX_REPAIR_ROUNDS = 2`, `MAX_REPAIR_SENTENCES = 30` and `repairDraftForeignScript` (signature below). `await requireWorkRole(db, workId, actor.userId, 'editor')` first (a viewer gets `FORBIDDEN`, a non-member `NOT_FOUND`). Load the run with the same checks as `repairDraft` (missing, other work, other user or task not `draft-chapter` gives `AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')`; status not `done` gives `AppError('BAD_STATE', '초안 작성이 끝난 뒤에 고칠 수 있습니다.')`; unreadable output gives `BAD_STATE '저장된 초안을 읽을 수 없습니다.'`). Call it only after `await run.done`: with A, `done` is the joined text and `completeDraft` has already stored it in the first run's row with `replaceRunOutput(db, first.runId, { text: joined })`; `runId` stays that first run.
   - Start text: `input.text` when given (the eval passes the text left after E1's trim), else `draftText(run.output)`. `stored = draftText(run.output)`. Idempotency: if `run.output` is an object whose `rawText` is a string, keep it as `storedRaw` (an already repaired run keeps its first draft); otherwise `storedRaw` is `null`.
   - Loop `round` from 1 to `MAX_REPAIR_ROUNDS`: `spans = repairableForeignSpans(text)`; stop if none. Map each span to its sentence with `sentenceIn(splitSentences(text), span.start)`, distinct, ordered by start, at most `MAX_REPAIR_SENTENCES` per round, each as a `DraftFlag { kind: 'foreign-script', start, end, quote: <sentence text>, reason: '한글이 아닌 글자가 섞여 있다.' }`. Call `runAiTask(db, { userId: actor.userId, workId, chapterId: run.chapterId, signal }, draftRepairTask, { text, flags }, client)`, `throwIfCancelled(signal)`, then `applyDraftEdits(text, flags, output.edits)` (E2's function: it guarantees nothing outside a flagged sentence changes). Add `applied` to `replaced`. A throw in any round leaves the run row untouched (no partial write, no retry here).
   - After the loop, if `text !== stored`, `await replaceRunOutput(db, runId, { ...(run.output as object), text, rawText: storedRaw ?? stored })` (the spread keeps A's `warnings` and E2's `repair` and `originalText` keys, and E2 itself tolerates a `rawText` key). `createChapterFromDraft` reads `output.text`, so it saves the repaired text. Return `unresolved = repairableForeignSpans(text)`. If there is no span at the start, make no AI call and no db write. `rawText` is the text C started from; in the eval that is the E1-trimmed text, while the true raw draft is the file `draft.raw.txt`. E2's `originalText` is what E2 received, i.e. the text after C.
5. eval/novel/state.ts: `DraftAttempt` gets `foreign?: { found: number; replaced: number; unresolved: number }`. `ChapterMetrics` is NOT changed by C (spec 8 lists a foreign-repair field there; this brief puts it on the attempt instead, and `foreignRuns` already shows leftovers).
6. eval/novel/steps/chapter.ts, in `draft`. Order inside the step (spec 7): D beats (if any) then A (continuation, inside `startDraft`) then E1 `trimStage` then foreign-script repair (this block) then E2 `repairBestEffort(repairDraft)`, each once on the final text of the step before. Today the code after the `generated` closure is: stale-file removal, `draft.raw.txt` write, `recordContinueFailure`, `trimStage` (returns `trimmedText`), E2's `repairBestEffort(ctx, state, `${key}:repair`, () => repairDraft(..., { text: trimmedText }), trimmedText)`, `draft.repaired.txt` write when changed, `NN.attempt-K.md` write, `attempts.push`.
   - After `trimStage`, let `current = trimmedText`. If `ctx.config.lang === 'ko'` and `repairableForeignSpans(current).length > 0` (`found` = that count): `ctx.client.setStep(`${key}:foreign-repair`)` in a `try`, run `repairBestEffort(ctx, state, `${key}:foreign-repair`, async () => (result = await repairDraftForeignScript(ctx.db, ctx.actor, { workId, runId: generated.runId, text: current }, ctx.client)), current)` with `result` captured in a closure, and in `finally` `ctx.client.setStep(key)`. The call records (`calls/*.json`) take `step` from `setStep`, so C's calls carry `chN:draft:foreign-repair` and E2's keep `chN:draft`. On a change, write `chapters/NN.attempt-K.draft.foreign-repaired.txt` (a name no other track uses; E1 `.draft.trimmed.txt`, E2 `.draft.repaired.txt`; C never overwrites another track's file) and set `current` to the repaired text. On failure `repairBestEffort` records `state.failed` (step `chN:draft:foreign-repair`) and returns `current`, so `replaced` is 0; an external failure (billing, limit) still pauses the run through its routing, and a resume redrafts (same as E2's).
   - Add `'draft.foreign-repaired.txt'` to the stale-file list next to `continue.json`, `trim.json`, `draft.trimmed.txt`, `draft.repaired.txt`.
   - E2's hook then takes `current` instead of `trimmedText`: `{ ..., text: current }` and fallback `current` (`repairDraft` already accepts `text`; this is a rename, not a signature change). `draft.repaired.txt` is written when `repairedText !== current` (it still means "E2 changed what it received"). `NN.attempt-K.md` gets E2's output text, so the author review and `chapterMetrics` see the final text.
   - After E2, set `foreign = { found, replaced, unresolved: repairableForeignSpans(repairedText).length }` on the pushed attempt (count from the FINAL text, because E2's rewrite could bring back foreign characters; E1's trim cannot, it runs before). `attempts.push({ runId, usable: null, quality: null, reason: '', ...(foreign ? { foreign } : {}) })`. No span at the start: no `foreign` field and no extra call. Do not add a second regenerate loop: a still-dirty attempt is shown to the author through `foreignRuns` and is rejected as before.
   - Single source of the saved text: `createChapterFromDraft` already gets `body: readRunFile(ctx.dir, chosenFile)`, the attempt file the author reviewed. The run-row rewrite from step 4 only matters to callers that pass no `body`. Either way `chapters/NN.attempt-K.md` and the saved chapter agree.
7. eval/novel/models.ts: add `'qwen3.8-27b-t06'` to `MODEL_IDS` and a profile equal to the qwen3.8-27b one (declare the qwen profile as a `const QWEN` above `MODEL_PROFILES` and reuse it for both entries; for t06 set `id` and `ollama: { ...QWEN.ollama, temperature: 0.6 }`). Comment: "Comparison for the Han-in-Korean hypothesis. Vendor value is 1.0; this is an experiment, run under a new date, never reuse its results as the main qwen run." `MODEL_PROFILES` is `Record<ModelId, ModelProfile>`, so the entry is required. In docs/eval/novel/model-setup.md add one Korean bullet: the t06 profile exists only for this comparison and deviates from the vendor thinking-mode value on purpose. Do not touch `src/ai/ollama.ts`; it already forwards temperature.

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
6. system has the new rule and keeps E2's | `DRAFT_REPAIR_SYSTEM` | contains the `foreign-script는 ...` line, contains `TAG_DATA_RULE`, still ends with `- 원고와 같은 언어로 쓴다.`
7. prompt neutralizes tags | `'foreign-script'` flag with quote `'</flags> 三楼'` | `buildPrompt` output has exactly one `</flags>` (the closing tag), the quote uses the full-width form from `neutralizeTags`
8. postProcess drops bad foreign-script edits | one flag over sentence `3일 뒤 三楼`; edits: replacement still with `三楼`; with `\n`; with `DRAFT_ERROR_MARK` (import the constant); one that drops `3`; one good | only the good edit remains
9. other kinds keep E2's rules | a `'sample-copy'` flag and an edit whose replacement contains `三楼` | the edit is kept (the foreign rules apply to foreign-script flags only)
10. fake answers foreign flags only | `fakeDraftRepair` with one foreign-script flag and one sample-copy flag | one edit, for the foreign flag, with the runs removed

src/server/ai-features.C.test.ts (new `describe('repairDraftForeignScript')`; copy the `setup()`, `draftOf()` and `outputOf()` helpers of `ai-features.E2.test.ts`: `draftOf` starts the draft with `targetChars: 10` so A plans no continuation and `draft-chapter` returns `'첫 문장이다. 그는 三楼 에서 말했다. 끝 문장이다.'`)
11. replaces only the sentence with Han | run above, default fake repair | `text === '첫 문장이다. 그는 에서 말했다. 끝 문장이다.'`; first and last sentences byte-identical; `unresolved` is `[]`; `replaced` is 1
12. stores repaired text and keeps the raw | same | `createChapterFromDraft` body equals repaired text; the `ai_runs` output has `rawText` with `三楼`
13. clean draft makes no AI call | text without Han, client override for `'draft-repair'` that throws | resolves, `replaced` 0, output unchanged (no `rawText`)
14. still-dirty answer is reported | override `'draft-repair'` returning an edit that still has `嬷嬷` | postProcess drops it, after 2 rounds `unresolved` has 1 span, text unchanged, `replaced` 0, no `rawText` written
15. second round fixes the rest | two Han sentences. Override with a call counter reads `input.flags`: round 1 gets two flags and answers only the first; round 2 gets one flag and answers it | `unresolved` is `[]`, `replaced` 2, exactly 2 `draft-repair` calls
16. access | other user's actor; a viewer (`addTestMember` role viewer, as E2's test does) | `NOT_FOUND`; `FORBIDDEN`
17. rejects a run that is not a draft or not done | id of an error run, random uuid | `BAD_STATE` for not done, `NOT_FOUND` for unknown. Build the error run by inserting an `ai_runs` row directly (`db.insert(aiRuns).values({ ... status: 'error', task: 'draft-chapter', workId, userId })`, columns from `src/db/schema.ts`). Do not try to make `startDraft` fail.
18. repairing twice keeps the first raw draft | 3 Han sentences; override fixes one flag per call. Call twice | after call 1 one span is left; after call 2 `unresolved` is `[]`; `rawText` is still the first original draft
19. explicit `text` and other keys | seed the output with `warnings: []` and `repair: { flagged: 0, applied: 0 }`; call with `text` holding a Han sentence while the stored text is clean | the repaired given text is stored, `warnings` and `repair` survive, `rawText` is the stored text
20. a failing round writes nothing | override that throws on the first call | rejects, the output is unchanged

eval/novel/run.C.test.ts (copy `makeRun`, `open`, `newDir`, `afterEach` from `run.draft-stages.test.ts`, whose `faultyClient` also fits test 22; `makeRun(dir)` there is 1 chapter, 2 questions, lang ko; for an en run call `createRun` with `lang: 'en'`)
21. repairs Han before review and saves the clean text | `inner: new FakeAiClient({ overrides: { 'draft-chapter': () => <Korean text of 600+ chars, no paragraph over 3 sentences, with 三楼 in one short sentence of its own paragraph> } })`, `autoAuthor: true` (targetChars is 5000 so A's continuation fires and the default `'draft-continue'` fake appends clean text) | state `done`; `01.attempt-1.md` has no Han; `01.attempt-1.draft.raw.txt` has `三楼`; `01.attempt-1.draft.foreign-repaired.txt` equals `01.attempt-1.md` when E2 changes nothing; the saved chapter body equals `01.attempt-1.md`; `state.data.drafts[1][0].foreign` is `{ found: 1, replaced: 1, unresolved: 0 }`; `metrics/01.json` has `foreignRuns: []` and `foreignScriptRuns(finalText, 'ko')` is `[]`; `readCallRecords(dir)` has one `draft-repair` record with step `ch1:draft:foreign-repair`
22. a failed repair keeps the raw draft and records it | `'draft-repair'` made to fail through `faultyClient` with `new AppError('AI_ERROR', 'x')` (the throw must come from the wrapped inner client, as `faultyClient` does, so `EvalClient` records it as a model failure) | state `done`; chapter saved with the raw text; `state.failed` has an entry with step `ch1:draft:foreign-repair`; `foreign` is `{ found: 1, replaced: 0, unresolved: 1 }`; no `draft.foreign-repaired.txt`
23. English run is not repaired | `lang: 'en'` run with the same Han draft | no `draft-repair` call with step ending `:foreign-repair`, no `foreign` field
24. a resumed draft drops the old stage file | pause the first draft on a 429 in `'draft-repair'` after C wrote its file, resume with a clean draft | no `draft.foreign-repaired.txt` left (pattern of the stage-file test in `run.draft-stages.test.ts`)

eval/novel/steps/finish.C.test.ts
25. summary keeps foreign | `RunSummarySchema.parse` of a summary whose `drafts['1'][0]` has `foreign` | the parsed value keeps it; an attempt without `foreign` still parses

eval/novel/models.C.test.ts
26. t06 profile differs only in temperature | `MODEL_PROFILES['qwen3.8-27b-t06']` vs qwen | `ollama.temperature === 0.6`, every other `ollama` field and `model`, `effort`, `maxTokensFloor` equal; `queue === 'local'`; `createModelClient` returns `OllamaAiClient`

src/server/exports.C.test.ts
27. rawText is exported | insert a done `draft-chapter` run with output `{ text: 'a', rawText: 'b' }` | `payload.aiRuns` has that row and its output keeps both keys

Existing tests that must stay green: src/ai/ollama.test.ts, src/ai/tasks/draft-chapter.test.ts and draft-repair.test.ts (do not edit `DRAFT_SYSTEM`), eval/novel/localize tests including the seam snapshot (after step 2), eval/novel/metrics.test.ts and metrics.foreign.test.ts (not edited), eval/novel/cli.test.ts, the `repairDraft` tests of E2, eval/novel/run.draft-stages.test.ts and run.E1.test.ts, finish.HX5.test.ts.

## Acceptance metrics

| metric | current | target |
|---|---|---|
| `foreignRuns` in the saved final text, ko | qwen ko run: `嬷嬷` present (old metric recorded `[]`) | 0 after repair (checked by unit test 21; real measurement later) |
| draft attempts with foreign spans that reach the author review | 3 of 3 | 0 when repair resolves them |
| extra model calls caused by foreign script | 0 (none existed) | at most 2 per attempt (2 rounds, no retry: `repairBestEffort` does not retry). Count them per chapter from `calls/*.json` records with task `draft-repair` and step `chN:draft:foreign-repair` (E2's calls keep step `chN:draft`); `calls.byTask['draft-repair']` in run-summary.json is a run total that counts both |
| author draft rewrites caused by Han | 2 (3 attempts) | 0 to 1 (source: the harness records no author rewrites; count the `draft_review` answers in `author-decisions.jsonl` with `usable: false` whose reason names 한자 or foreign script, manually after the later qwen ko rerun) |
| `chapterMetrics` output for existing inputs | see metrics.test.ts | unchanged (C does not edit it) |
| qwen temperature 0.6 vs 1.0 Han attempt rate | 3 of 3 at 1.0 | later run only; 3 samples cannot decide, note this |

Only the unit-test items can pass now. The rest need a qwen run (about 84 minutes per chapter, qwen ko); do not claim them as measured.

## Dependencies on other tracks

- GUARDS (merged): supplies `foreignScriptSpans`/`foreignScriptRuns`/`ForeignSpan` and the `foreignRuns` metric. C imports them from `@/ai/guards`. If GUARDS changes how a script is classified, only `repairableForeignSpans` needs a look.
- E2 (merged): C extends E2's `draft-repair.ts`, `style-copy.ts`, fake and English module, and calls `repairBestEffort`/`draftRepairTask`/`applyDraftEdits`. Keep E2's tests green.
- A (merged): `startDraft` is a continuation driver (`completeDraft`); the repair runs on the final joined text after `await run.done`, on the first run's row that A rewrites with `replaceRunOutput` (steps 4 and 6). A owns `DRAFT_SYSTEM` and `responders.ts`; C changes neither.
- E1 (merged): `trimStage` runs before C's block and returns the text C starts from; the saved chapter is the attempt file passed as `body`. File names stay separate: C `NN.attempt-K.draft.foreign-repaired.txt`, `.draft.raw.txt` is the raw draft the step writes for every draft, `.draft.trimmed.txt` is E1's, `.draft.repaired.txt` is E2's.
- D (L2, local): the beats step runs before the draft and the two-step draft produces its final text from several calls (D passes `twoStep: true` to `startDraft` and the closure also returns `beats`). The same rule applies: repair the final text once, after all draft calls are finished. D's scene rewrite runs later in the continuity step, outside this hook; C does not repair text that rewrite produces, so a Han span it brings back shows only in `foreignRuns` of the final metrics. Read D's merged code and place the C block after D's draft calls and before E2's hook.
- Seam (L0): task names for D and F2 are registered by the integrator and are not C's; `'draft-repair'` was registered in wave 0.

## Risks

- Crash window: the repair rewrites the stored run output before the attempt file is written. A crash in between redrafts on resume (same as today's behavior), at the cost of one more draft call.
- A sentence rewrite can drift in meaning. The prompt limits the change to the foreign words, `applyDraftEdits` blocks changes outside the flagged sentence, and unit tests check unchanged neighbors, but real quality is unmeasured.
- A Han word can be intentional (a hanja term or a name). There is no opt-out. This matches the T5 metric, which flags any length.
- Two repairs (foreign script, then E2) are two model calls on a slow local model; each is capped by `draftRepairTask.timeoutMs` and by the eval timeout override (`setAiTimeoutOverride`). Product default 120 s would be too short for local models, which is why the repair stays eval-only.
- `ai_runs.output` for the draft changes shape to `{ text, rawText, ... }` after repair. `draftText` only reads `text`. Decision: `src/server/exports.ts` selects whole `ai_runs` rows for `draft-chapter` (`EXPORTED_AI_TASKS`), so `rawText` goes into the backup and export on purpose, as the author's own draft text. No edit to exports.ts; test 27 pins this behavior.
- Widening `DRAFT_REPAIR_SYSTEM` moves E2's prompt; the seam's byte-identical snapshot test covers only pre-existing tasks, so a stale pinned-text test for `draft-repair` is fixed by the integrator, not by reverting the line.
- The run summary: without the `finish.ts` schema line `RunSummarySchema.parse` strips `foreign` (the written file still has it), which would hide the figures from anything that parses the summary.

## Open questions (answered with defaults; do not block on them)

1. Repair also in the product? Default no. Local models are out of product; the function is product-neutral and can be called from a button later.
2. Word-level or sentence-level? Default sentence-level (reliable locating).
3. Does repair count as an author rewrite? Default no. It is recorded as `foreign` on the attempt and as `draft-repair` calls.
4. Opt-out for intentional Han? Default none. Revisit if a real chapter needs it.
5. Should `pickAttempt` avoid attempts that still have foreign runs? Default not in this track (needs the author's call); the `foreign.unresolved` field makes it a one-line change later.
6. Value 0.6 for the comparison? Default 0.6 (the plan's first value and the test fixture). Change it only if the author says so.
7. One merged repair call (foreign-script flags plus E2's flags) or two sequential calls? Default two sequential calls: E2's `repairDraft` stays unchanged and independently testable. Revisit if call counts matter.
8. Should the t06 profile also be listed in `.claude/workflows/novel-eval.js` `ALL_MODELS`? Default no: it is a one-off comparison started by hand, and that file belongs to HX1 and HX4.

## Definition of done

Run from the worktree root. Use `--maxWorkers=2` and `pnpm exec tsc --noEmit` (no typegen) when other agents run in parallel; filter tsc output to your files.

```
pnpm vitest run src/ai/tasks/draft-repair.test.ts src/ai/tasks/draft-repair.C.test.ts src/ai/tasks/draft-chapter.test.ts src/ai/tasks/proofread.test.ts src/ai/guards src/server/ai-features.test.ts src/server/ai-features.E2.test.ts src/server/ai-features.C.test.ts src/server/exports.test.ts src/server/exports.C.test.ts eval/novel/metrics.test.ts eval/novel/metrics.foreign.test.ts eval/novel/models.test.ts eval/novel/models.C.test.ts eval/novel/run.test.ts eval/novel/run.E1.test.ts eval/novel/run.draft-stages.test.ts eval/novel/run.C.test.ts eval/novel/cli.test.ts eval/novel/localize eval/novel/eval-client.test.ts eval/novel/steps src/ai/ollama.test.ts --maxWorkers=2
pnpm exec tsc --noEmit
pnpm eslint src/lib/korean src/ai/tasks src/server/ai-features.ts src/test eval/novel
pnpm exec prettier --write <each touched or created file listed under Files>
```
Do not run `pnpm format`: it is `prettier --write .` and rewrites the whole repository, including other tracks' files and the untracked handoff folder. Run prettier only on the files in the Files lists.
All tests green, no new tsc or eslint errors in touched files, no package changes, `git diff --name-only` lists only files from Files, no edit to `src/ai/ollama.ts`, `DRAFT_SYSTEM`, `src/db/types.ts`, `metrics.ts`, the draft route or the draft panel, and no new Han/kana/Cyrillic regex in non-test code. Create the worktree and local branch first: `git worktree add ../DaeumHwa-track-c -b track/local/C feat/ai-improvement-local` (run in /home/xogud/documents/github/DaeumHwa, after D is merged into the local branch; the path is the sibling directory `/home/xogud/documents/github/DaeumHwa-track-c`). The branch is local only: do not push. Commit on that branch with a message starting `feat(ai):`.

# Track C brief: foreign-script block (T5), local branch

Repo: /home/xogud/documents/github/DaeumHwa. Work in your own worktree. TDD: write each test first, watch it fail, then implement. All paths below are repo-relative and were checked against the code on 2026-10-19 (HEAD b4d49a9). Line numbers are hints; search for the named symbol.

## Goal

Detect Han, kana and Cyrillic spans in a finished chapter draft with code, and rewrite only the sentences that contain them (not the whole draft). Wire this into the eval draft step so qwen ko drafts are repaired before the author reviews them. Add a labeled lower-temperature qwen profile for a later comparison run. This branch is LOCAL: it cannot be measured now (no Ollama run), it is only unit-tested with `FakeAiClient`. Never call a real model.

## Evidence (numbers)

- qwen3.8-27b ko, 1 chapter: 3 of 3 draft attempts contained Han: attempt 1 `以上是`, attempt 2 `三楼` and `接到了`, attempt 3 `嬷嬷` and `样的` (docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md line 69).
- The final saved text kept `원장嬷嬷가` (same file, lines 52 and 298). Proofread fixed `样的` but missed `嬷嬷`. The proofread prompt (src/ai/tasks/proofread.ts) has no script rule.
- The recorded `foreignRuns` was `[]` because that run used the old metric. Han detection entered eval/novel/metrics.ts in commit 9bf7bdd, so the current metric already flags these (eval/novel/metrics.test.ts has the 嬷嬷 case).
- `pickAttempt` (eval/novel/steps/util.ts) picked attempt 3 over attempt 1 on a quality tie (2 vs 2), with no foreign-script gate.
- Author review scored the three attempts 2, 1, 2 and rejected all (3 draft calls, about 84 minutes per chapter for qwen ko (`perChapterMs` median 83.8 min, summary.md section 3; qwen en is 97.8 min)). Cloud runs (haiku, luna) had no Han. Cause of Han is untested (summary.md:204 marks the cause as "추정" (estimated): temperature 1.0 or training data).
- Sampling today: eval/novel/models.ts qwen profile `temperature: 1.0, topP: 0.95, topK: 20` (vendor thinking-mode values, docs/eval/novel/model-setup.md). `OllamaAiClient` has no default temperature; it forwards `settings.temperature` to `options.temperature` (src/ai/ollama.ts `chatBody` at line 384, temperature forwarded at line 401).
- The product never builds an Ollama client (src/ai/index.ts only builds Anthropic or OpenCode). Decision in the eval spec: local models stay out of product. So this track changes the eval harness plus pure, product-neutral code. Do NOT wire repair into the product route, panel or `startDraft`.

## Files

Write (existing, edit):
- src/db/types.ts : add `'draft-repair'` to `AI_TASKS`.
- src/server/exports.test.ts : add one test that `rawText` is exported (Risks, decision 3).
- src/server/ai-features.ts : add `repairDraftForeignScript` (new exported function, do not change `startDraft` or `createChapterFromDraft`).
- src/lib/korean/index.ts : add `export * from '@/lib/korean/foreign-script'`.
- src/test/ai-fakes/index.ts : register `'draft-repair'` in `FAKE_OUTPUTS`.
- eval/novel/metrics.ts : use `foreignScriptRunTexts` instead of the local `OTHER_SCRIPT_RUN` (output must not change).
- eval/novel/state.ts : add optional field `foreign?` to `DraftAttempt`.
- eval/novel/steps/chapter.ts : call the repair in the `draft` step (lang `ko` only).
- eval/novel/models.ts : add profile `qwen3.8-27b-t06` and its id.
- eval/novel/localize/en-systems.ts : add `'draft-repair'` English system text (required: `EN_SYSTEMS` is `Record<AiTaskName, string>`).
- eval/novel/localize/localize.test.ts : add `'draft-repair'` to `PROMPTS` (also `Record<AiTaskName, string>`).
- eval/novel/models.test.ts, eval/novel/run.test.ts, src/server/ai-features.test.ts : add tests.
- docs/eval/novel/model-setup.md : add one note under the settings table (see Design step 9).

Create (new):
- src/lib/korean/foreign-script.ts, src/lib/korean/foreign-script.test.ts
- src/ai/tasks/draft-repair.ts, src/ai/tasks/draft-repair.test.ts
- src/test/ai-fakes/draft-repair.ts

Read only: src/server/exports.ts (decision in Risks), src/lib/korean/sentences.ts (`splitSentences`, `sentenceIn`), src/ai/tasks/proofread.ts (pattern to copy), src/ai/prompt-utils.ts (`neutralizeTags`, `TAG_DATA_RULE`), src/ai/run.ts (`runAiTask`), src/lib/draft-stream.ts (`DRAFT_ERROR_MARK`, imported, not edited), src/test/fake-ai.ts, eval/novel/eval-client.ts, eval/novel/steps/util.ts (`guarded`, `withModelRetry`, `pickAttempt`), eval/novel/steps/finish.ts (`buildRunSummary` already emits `drafts`).

## Design (do in this order)

0. Owner decision (read first). The GUARDS track (briefs/GUARDS.md sections 5, 8 and 10) also plans a foreign-script detector, `foreignScriptSpans(text, lang)` and `foreignScriptRuns(text, lang)` in `src/ai/guards/scripts.ts`, and its step 10 edits the same `OTHER_SCRIPT_RUN` lines of `eval/novel/metrics.ts` as C step 2. Rule for the integrator, default GUARDS merges first:
   - GUARDS owns the detector and the `eval/novel/metrics.ts` edit. If GUARDS has landed, skip C steps 1 and 2 as written: instead `src/lib/korean/foreign-script.ts` stays a thin adapter that exports only `findForeignScriptSpans(text): ForeignScriptSpan[]` and `foreignScriptRunTexts(text): string[]`, built on `foreignScriptSpans(text, 'ko')` from `@/ai/guards` filtered to scripts `han`, `kana`, `cyrillic` and `replacement` (drop `latin` and `hangul`, because the repair is only for Han, kana, Cyrillic and U+FFFD). Do not touch `metrics.ts` (GUARDS already did it); C's tests 1 to 5 then check the adapter and stay valid.
   - If C lands first, C does steps 1 and 2 as written and GUARDS step 10 is rebased onto C (GUARDS removes its own metrics edit and turns the module of step 1 into a re-export or an adapter).
   - Names: C's helper is `foreignScriptRunTexts` (not `foreignScriptRuns`) on purpose, so the two modules never export the same name with different signatures. `foreignScriptRuns(text, lang)` belongs to GUARDS only. Until the integrator confirms the order, mark steps 1 and 2 as an integration step and do not merge C ahead of GUARDS.

1. `src/lib/korean/foreign-script.ts` (pure, no imports from server or ai). Use exactly the regex now in eval/novel/metrics.ts line 37, with U+FFFD written as the escape `\uFFFD` (never paste the literal replacement character; it is invisible and easy to drop): `/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\uFFFD]+/gu`. Export `findForeignScriptSpans(text)` (offsets via `matchAll`, original text, not trimmed) and `foreignScriptRunTexts(text)` (the `.text` of each span). Do not include Latin (Latin stays a ko-only metric rule in metrics.ts). Export from src/lib/korean/index.ts.
2. eval/novel/metrics.ts: delete the local `OTHER_SCRIPT_RUN`, import `foreignScriptRunTexts` from `@/lib/korean/foreign-script`. In `chapterMetrics`, keep the group order: ko = Latin runs first then `foreignScriptRunTexts(trimmed)`; en = Hangul runs first then `foreignScriptRunTexts(trimmed)`. Existing metrics tests must pass unchanged.
3. `src/db/types.ts`: add `'draft-repair'` to `AI_TASKS`. No DB migration: `ai_runs.task` is a plain text column (drizzle/0000_fast_black_widow.sql, `"task" text NOT NULL`).
4. `src/ai/tasks/draft-repair.ts`: `draftRepairTask: AiTaskDef<DraftRepairInput, DraftRepairOutput>` modeled on proofread.ts. `name: 'draft-repair'`, `effort: 'low'`, `maxTokens: 8000`, no `timeoutMs`. Schema has no min, max, regex, default or optional (interview reliability rule): `z.object({ fixes: z.array(z.object({ id: z.number(), text: z.string() })) })`. `buildPrompt` writes `<sentences>` then one line per sentence `[id] text` with `neutralizeTags` on each text. System prompt (Korean, copy exactly):
   ```
   당신은 한국어 웹소설 교정자다. <sentences>의 각 문장에 한글이 아닌 글자(한자, 일본어 가나, 키릴 문자)가 섞여 있다.
   규칙:
   - 섞인 부분만 같은 뜻의 자연스러운 한글 표현으로 바꾸고, 문장 전체를 돌려준다.
   - id는 입력 그대로 쓴다. 바꾸지 않은 부분은 한 글자도 고치지 않는다.
   - 바꾼 부분에는 한글과 문장부호만 쓴다. 한자, 가나, 키릴 문자를 다시 쓰지 않는다.
   - 섞인 부분 밖의 숫자와 영문은 그대로 둔다.
   - 줄바꿈을 넣지 않는다. 한 문장은 한 줄로 쓴다.
   ${TAG_DATA_RULE}
   - 모든 출력은 한국어로 쓴다.
   ```
   `postProcess(output, input)` keeps a fix only if: its id is in `input.sentences`; `text.trim() !== ''`; text differs from the original sentence; text has no `\n`; text does not contain `DRAFT_ERROR_MARK` (import it from `@/lib/draft-stream`; do not write the control character as a literal); `findForeignScriptSpans(text)` is empty; and every ASCII digit run and Latin letter run of the original sentence (`/[0-9A-Za-z]+/g`) still appears in the fix text (a fix that drops `3일` or `OK` is rejected). Keep the first fix per id. Return `{ fixes }` with the kept ones.
5. `src/test/ai-fakes/draft-repair.ts`: `fakeDraftRepair(input)` returns one fix per sentence whose text is the sentence with every foreign run removed (collapse double spaces, trim). Register in FAKE_OUTPUTS under `'draft-repair'`.
6. `src/server/ai-features.ts`: add `repairDraftForeignScript` (signature below). Steps inside: `await requireWorkRole(db, workId, actor.userId, 'editor')` first. Load the run with the same checks as `createChapterFromDraft` (missing, other work, other user or task not `draft-chapter` gives `AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')`; status not `done` gives `AppError('BAD_STATE', '초안 작성이 끝난 뒤에 고칠 수 있습니다.')`; unreadable output gives `BAD_STATE '저장된 초안을 읽을 수 없습니다.'`). Idempotency: if `run.output` is an object whose `rawText` is a string, keep that string as `storedRaw` and use the current `text` as the repair input (a run that is already repaired keeps its first raw draft); otherwise `storedRaw` is `null`. `original = draftText(run.output)` (the current text). Loop `round` from 1 to `MAX_REPAIR_ROUNDS = 2`: `spans = findForeignScriptSpans(text)`; stop if none. Map spans to distinct sentences with `splitSentences` and `sentenceIn`, ordered by start, at most `MAX_REPAIR_SENTENCES = 30` per round, id = 1-based index. Call `runAiTask(db, { userId: actor.userId, workId, chapterId: run.chapterId, signal }, draftRepairTask, { sentences }, client)`. Apply fixes right to left on the sentence offsets (`text.slice(0, s.start) + fix.text + text.slice(s.end)`). Count `replaced` by fixes applied. After the loop, if `text !== original`, `db.update(aiRuns).set({ output: { text, rawText: storedRaw ?? original } }).where(eq(aiRuns.id, runId))`. This makes `createChapterFromDraft` save the repaired text (it reads `output.text`). Call it only after the draft has finished (`await run.done`), on the final joined text: once track A lands, `startDraft` may run a continuation and then writes the joined text into the first run's row via `replaceRunOutput` (A.md step 3 and 6), and `runId` stays that first run, so the repair reads and rewrites that one row. Never repair a run whose `done` has not resolved. Return `unresolved = findForeignScriptSpans(text)`. If no span at the start, make no AI call and no db write.
7. eval/novel/state.ts: `DraftAttempt` gets `foreign?: { found: number; replaced: number; unresolved: number }` (optional, so old state.json files still load). `buildRunSummary` already writes `drafts`, so T5-b and T5-c come out of run-summary.json with no change to finish.ts.
8. eval/novel/steps/chapter.ts, in `draft` after `generated` is known (that is, after `await run.done`, so with track A the text is the joined text) and before `writeRunFile`: if `ctx.config.lang === 'ko'` and `foreignScriptRunTexts(generated.text).length > 0`, call `guarded(ctx, state, key, () => repairDraftForeignScript(ctx.db, ctx.actor, { workId, runId: generated.runId }, ctx.client))`. On a non-null result: write the pre-repair text to `chapters/NN.attempt-K.pre-repair.md` (a name that no other track uses; E1 writes `NN.attempt-K.raw.md` for its own pre-trim text), then use `result.text` as the attempt text; set `foreign` on the pushed attempt. On null (failure already recorded in `state.failed`): keep the raw text and set `foreign` to `{ found, replaced: 0, unresolved: found }`. `found` is the span count before repair. The repaired text goes to `chapters/NN.attempt-K.md`, so `chapterMetrics` for the author review sees the repaired text. Do not add a second regenerate loop: an attempt that is still dirty is shown to the author through `foreignRuns` and is rejected as before.
   Order and single source of the saved text. Foreign repair runs first; if track E1 has landed, its paragraph trim runs second and takes the repaired text (not `generated.text`) as its input, and its `.raw.md` then holds the repaired, untrimmed text. After E1, the saved chapter text is the final attempt file text, passed to `createChapterFromDraft` through E1's `body` argument; C's rewrite of the run output stays as the fallback path when `body` is absent (before E1 lands). So the saved text always comes from one place: the final attempt file once E1 exists, the repaired run output until then. If E1's trim changes the text, compute `foreign.unresolved` from the final text (`foreignScriptRunTexts(finalText).length`) instead of the repair result, because a trim call can bring back foreign characters.
9. eval/novel/models.ts: add `'qwen3.8-27b-t06'` to `MODEL_IDS` and a profile equal to the qwen3.8-27b one (spread it, set `id`, `ollama: { ...qwen.ollama, temperature: 0.6 }`). Comment: "Comparison for the Han-in-Korean hypothesis. Vendor value is 1.0; this is an experiment, run under a new date, never reuse its results as the main qwen run." Add to docs/eval/novel/model-setup.md a note: the t06 profile exists only for this comparison and deviates from the vendor thinking-mode value on purpose. Do not touch `src/ai/ollama.ts`; it already forwards temperature.
10. eval/novel/localize/en-systems.ts: add `DRAFT_REPAIR_SYSTEM` (English, same rules, same order, no Hangul, `EN_TAG_DATA_RULE`, last line "- Write all output in English."). It is not used on ko runs and the step skips `en`. localize.test.ts: add `'draft-repair': draftRepairTask.buildPrompt({ sentences: [{ id: 1, text: 'She walked 三楼 slowly.' }] })` to `PROMPTS`.

## Interface

```ts
// src/lib/korean/foreign-script.ts
export type ForeignScriptSpan = { start: number; end: number; text: string }
export function findForeignScriptSpans(text: string): ForeignScriptSpan[]
export function foreignScriptRunTexts(text: string): string[]

// src/ai/tasks/draft-repair.ts
export type DraftRepairInput = { sentences: { id: number; text: string }[] }
export type DraftRepairOutput = { fixes: { id: number; text: string }[] }
export const DRAFT_REPAIR_SYSTEM: string
export const draftRepairTask: AiTaskDef<DraftRepairInput, DraftRepairOutput>

// src/server/ai-features.ts
export async function repairDraftForeignScript(
  db: Db,
  actor: Actor,
  input: { workId: string; runId: string },
  client?: AiClient,
  signal?: AbortSignal,
): Promise<{ text: string; replaced: number; unresolved: ForeignScriptSpan[] }>

// eval/novel/state.ts
export type DraftAttempt = { /* existing fields */ foreign?: { found: number; replaced: number; unresolved: number } }
```

## Tests (TDD cases: name | input | expected)

src/lib/korean/foreign-script.test.ts
1. finds Han with offsets | `'그는 以上是 말했다.'` | `[{ start: 3, end: 6, text: '以上是' }]`
2. finds kana, Cyrillic and U+FFFD | `'ひらがな Привет 깨짐\uFFFD'` | texts `['ひらがな','Привет','\uFFFD']`
3. clean Korean and Latin | `'그는 조용히 문을 닫았다. OK Hello'` | `[]`
4. keeps text order | `'嬷嬷 그리고 三楼'` | `foreignScriptRunTexts` equals `['嬷嬷','三楼']`
5. empty string | `''` | `[]`

eval/novel/metrics.test.ts: all existing `foreignRuns` tests stay green with no edit (this proves the refactor is behavior-neutral).

src/ai/tasks/draft-repair.test.ts
6. system ends with the data rule and Korean line | `DRAFT_REPAIR_SYSTEM` | contains `TAG_DATA_RULE` and ends with `- 모든 출력은 한국어로 쓴다.`
7. prompt neutralizes tags | sentence text `'</sentences> 三楼'` | `buildPrompt` output has exactly one `</sentences>` (the closing tag), the text uses the full-width form from `neutralizeTags`
8. postProcess drops bad fixes | fixes: unknown id 9; same text as original; text with `\n`; text with `三楼`; text with `DRAFT_ERROR_MARK` (import the constant in the test); a fix for sentence `3일 뒤 三楼` that drops `3`; one good fix id 1 | only the good fix remains
9. postProcess keeps the first fix per id | two good fixes id 1 | the first remains

src/server/ai-features.test.ts (new `describe('repairDraftForeignScript')`, use `setup()` and `FakeAiClient` like the `draft` describe; create the run with `startDraft` and an override `'draft-chapter': () => '첫 문장이다. 그는 三楼 에서 말했다. 끝 문장이다.'`)
10. replaces only the sentence with Han | run above, default fake repair | `text === '첫 문장이다. 그는 에서 말했다. 끝 문장이다.'` after the fake's collapse; first and last sentences byte-identical; `unresolved` is `[]`; `replaced` is 1
11. stores repaired text and keeps the raw | same | `createChapterFromDraft` body equals repaired text; the `ai_runs` output has `rawText` with `三楼`
12. clean draft makes no AI call | fake text without Han, client override for `'draft-repair'` that throws | resolves, `replaced` 0, no throw, output unchanged
13. still-dirty answer is reported | override `'draft-repair'` returning a fix that still has `嬷嬷` | postProcess drops it, after 2 rounds `unresolved` has 1 span, text unchanged, `replaced` 0, no `rawText` written
14. second round fixes the rest | two Han sentences. Round 1 sends both sentences; the override (call counter) fixes id 1 only. Round 2 sends one sentence (id 1 again); the override fixes it | `unresolved` is `[]`, `replaced` 2, exactly 2 `draft-repair` calls
15. rejects a non-member | other user's actor | `AppError` code `NOT_FOUND`
16. rejects a run that is not a draft or not done | id of an error run, random uuid | `BAD_STATE` for not done, `NOT_FOUND` for unknown. Build the error run by inserting an `ai_runs` row directly with `db.insert(aiRuns).values({ ... status: 'error', task: 'draft-chapter', workId, userId })` (use the columns of `src/db/schema.ts`; no stream is needed). Do not try to make `startDraft` fail.

eval/novel/run.test.ts (copy the 'draft redo' pattern; `makeRun(dir, 1, 2)`, `inner: new FakeAiClient({ overrides: { 'draft-chapter': () => <Korean text of 600+ chars with 三楼 in one sentence> } })`, `autoAuthor: true`)
17. repairs Han before review and saves the clean text | as above | state `done`; `01.attempt-1.md` has no Han; `01.attempt-1.pre-repair.md` has `三楼`; the saved chapter body equals `01.attempt-1.md`; `state.data.drafts[1][0].foreign` is `{ found: 1, replaced: 1, unresolved: 0 }`; `metrics/01.json` has `foreignRuns: []`
18. a failed repair keeps the raw draft and records it | add `'draft-repair'` override that throws `new AppError('AI_ERROR', 'x')` | state `done`; chapter saved with the raw text; `state.failed` has an entry with step `ch1:draft`; `foreign` is `{ found: 1, replaced: 0, unresolved: 1 }`. If a throwing override is not recorded as a model failure by `EvalClient`, wrap `FakeAiClient` like `draftsFailingAfter` in run.test.ts does.
19. English run is not repaired | `lang: 'en'` run (see how cli.test.ts builds one) with the same Han draft | no `draft-repair` call

eval/novel/models.test.ts
20. t06 profile differs only in temperature | `MODEL_PROFILES['qwen3.8-27b-t06']` vs qwen | `ollama.temperature === 0.6`, every other `ollama` field and `model`, `effort`, `maxTokensFloor` equal; `queue === 'local'`; `createModelClient` returns `OllamaAiClient`

src/server/ai-features.test.ts (more)
21. repairing twice keeps the first raw draft | draft with 3 Han sentences; override `'draft-repair'` fixes id 1 only on every call. Call `repairDraftForeignScript` twice | after call 1 one span is left (2 rounds, 1 fix each round, `unresolved` has 1); after call 2 `unresolved` is `[]`; the `ai_runs` output `rawText` is still the first original draft (with all three Han sentences), not the text after call 1
src/server/exports.test.ts
22. rawText is exported | insert a done `draft-chapter` run with output `{ text: 'a', rawText: 'b' }` | `payload.aiRuns` has that row and its output keeps both keys

Existing tests that must stay green: src/ai/ollama.test.ts, src/ai/tasks/draft-chapter.test.ts (do not edit `DRAFT_SYSTEM`), eval/novel/localize/localize.test.ts (after step 10), eval/novel/cli.test.ts.

## Acceptance metrics

| metric | current | target |
|---|---|---|
| `foreignRuns` in the saved final text, ko | qwen ko run: `嬷嬷` present (old metric recorded `[]`) | 0 after repair (checked by unit test 17; real measurement later) |
| draft attempts with foreign spans that reach the author review | 3 of 3 | 0 when repair resolves them |
| extra model calls caused by foreign script | 0 (none existed) | 2 rounds per attempt, plus at most 1 retry per round (so at most 4 `draft-repair` calls per attempt). `calls.byTask['draft-repair']` in run-summary.json is a run total only; measure per chapter from `calls/*.json` records with task `draft-repair`, grouped by `step` (`ch{n}:draft` for every attempt of that chapter), and divide by the number of attempts in `drafts[n]` |
| author draft rewrites caused by Han | 2 (3 attempts) | 0 to 1 (source: the harness records no author rewrites; count the `draft_review` answers in `author-decisions.jsonl` with `usable: false` whose reason names 한자 or foreign script, manually after the later qwen ko rerun) |
| `chapterMetrics` output for existing inputs | see metrics.test.ts | unchanged |
| qwen temperature 0.6 vs 1.0 Han attempt rate | 3 of 3 at 1.0 | later run only; 3 samples cannot decide, note this |

Only the first row of unit-test items can pass now. The rest need a qwen run (about 84 minutes per chapter, qwen ko); do not claim them as measured.

## Dependencies on other tracks

- Track A (min length and retry) and track D (two-step draft) also edit src/server/ai-features.ts near `startDraft`. This brief only appends a new function after `createChapterFromDraft` and touches no existing lines there, so conflicts in that file should be limited to import lines. The semantic overlap is bigger than that:
  - A: `startDraft` becomes a continuation driver. The repair must run on the final joined text, after `await run.done`, on the first run's row that A rewrites with `replaceRunOutput` (see Design step 6 and 8). Never repair between the first call and the continuation.
  - E1: its `draft` step hook and its `body` argument for `createChapterFromDraft` sit in the same place as C step 8. Order: foreign repair first, then paragraph trim on the repaired text; the saved text is the final attempt file through `body`, with the run-output rewrite as fallback (step 8). File names are separate: C `NN.attempt-K.pre-repair.md`, E1 `NN.attempt-K.raw.md`. E1.md still names `.raw.md` only for its own file; no change is needed there, but the integrator should keep both names when merging the two draft-step hooks.
  - D: two-step draft produces its final text from several calls; the same rule applies (repair the final text once, after all draft calls finish).
  - GUARDS: owns the foreign-script detector and the metrics edit by default (Design step 0).
- Any other track that adds an AI task (for example a split proofread) also edits `AI_TASKS`, `EN_SYSTEMS`, `PROMPTS` in localize.test.ts and `FAKE_OUTPUTS`. Expect small conflicts in those lists; keep your entries on their own lines.
- The shared guard library is planned in briefs/GUARDS.md (`src/ai/guards`) and does not exist yet. Design step 0 fixes who owns what. Until it lands, keep `src/lib/korean/foreign-script.ts` free of other imports.

## Risks

- Crash window: the repair rewrites the stored run output before the attempt file is written. A crash in between redrafts on resume (same as today's behavior), at the cost of one more draft call.
- A sentence rewrite can drift in meaning. The prompt limits the change to the foreign words and unit tests check unchanged neighbors, but real quality is unmeasured.
- A Han word can be intentional (a hanja term or a name). There is no opt-out. This matches the T5 metric, which flags any length.
- `AI_TASKS` gets a new name, so `EN_SYSTEMS` and `PROMPTS` must be extended in the same commit or `pnpm exec tsc --noEmit` fails.
- Local calls time out at the product default 120 s for structured tasks; the eval sets its own override (`setAiTimeoutOverride`), so the repair call is fine in the harness only.
- `ai_runs.output` for the draft changes shape to `{ text, rawText }` after repair. `draftText` only reads `text`. Decision: `src/server/exports.ts` selects whole `ai_runs` rows for `draft-chapter` (`EXPORTED_AI_TASKS`, line 29), so `rawText` goes into the backup and export on purpose, as the author's own raw draft. No edit to exports.ts; test 22 pins this behavior.

## Open questions (answered with defaults; do not block on them)

1. Repair also in the product? Default no. Local models are out of product; the function is product-neutral and can be called from a button later.
2. Word-level or sentence-level? Default sentence-level (reliable locating).
3. Does repair count as an author rewrite? Default no. It is recorded as `foreign` on the attempt and as `draft-repair` calls.
4. Opt-out for intentional Han? Default none. Revisit if a real chapter needs it.
5. Should `pickAttempt` avoid attempts that still have foreign runs? Default not in this track (needs the author's call); the `foreign.unresolved` field makes it a one-line change later.
6. Value 0.6 for the comparison? Default 0.6 (the plan's first value and the test fixture). Change it only if the author says so.

## Definition of done

Run from the worktree root. Use `--maxWorkers=2` and `pnpm exec tsc --noEmit` (no typegen) when other agents run in parallel; filter tsc output to your files.

```
pnpm vitest run src/lib/korean/foreign-script.test.ts src/ai/tasks/draft-repair.test.ts src/ai/tasks/draft-chapter.test.ts src/ai/tasks/proofread.test.ts src/server/ai-features.test.ts src/server/exports.test.ts eval/novel/metrics.test.ts eval/novel/models.test.ts eval/novel/run.test.ts eval/novel/cli.test.ts eval/novel/localize/localize.test.ts eval/novel/eval-client.test.ts src/ai/ollama.test.ts --maxWorkers=2
pnpm exec tsc --noEmit
pnpm eslint src/lib/korean src/ai/tasks src/server/ai-features.ts src/test eval/novel
pnpm exec prettier --write <each touched file listed under Files>
```
Do not run `pnpm format`: it is `prettier --write .` and rewrites the whole repository, including other tracks' files and the untracked handoff folder. Run prettier only on the files in the Files lists.
All tests green, no new tsc or eslint errors in touched files, no package changes, no edit to `src/ai/ollama.ts`, `DRAFT_SYSTEM`, the draft route or the draft panel. Create the worktree and local branch first: `git worktree add ../DaeumHwa-track-c -b feat/ai-track-c-foreign-script main` (run in /home/xogud/documents/github/DaeumHwa; the path is the sibling directory `/home/xogud/documents/github/DaeumHwa-track-c`). The branch is local only: do not push. Commit on that branch with a message starting `feat(ai):`.

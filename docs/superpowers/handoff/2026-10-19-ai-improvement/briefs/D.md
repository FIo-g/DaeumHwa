# Track D brief: scene consistency self-review (two-step draft + scene-only rewrite)

Reader: a small model implementing with TDD in an isolated worktree. Follow the steps in order. Repo root: /home/xogud/documents/github/DaeumHwa. Paths below are repo-relative. Read CLAUDE.md first (Korean user copy, English identifiers, `AppError`, no new packages, tests colocated, no real API in tests). This brief was re-pointed at the merged cloud tracks (A, B, E1, E2, G1, G2, H, I, J, GUARDS, HX1-HX5) on `feat/ai-improvement-local`: names and signatures below were checked against that code. Line numbers move, so find code by name.

## 1. Goal

Two changes, shipped as two commits (Part 1 then Part 2). Each commit must pass `pnpm exec tsc --noEmit` and its own tests on its own. The task names `'draft-beats'` and `'scene-rewrite'` are both pre-registered by the Wave L0 seam (`AI_TASKS`, `EN_SYSTEMS`, `FAKE_OUTPUTS`, the sample strings, with placeholder files), so D does not edit those registrations: Part 1 fills the `draft-beats` placeholders and the scaffold rules for the beat list, Part 2 fills the `scene-rewrite` placeholders and its scaffold rules:

1. Two-step draft. `startDraft` can first ask for a per-scene beat list (place, characters, objects with their location, ordered actions) as a separate structured AI task `draft-beats`, then write the prose with that list in the prompt. Opt-in through `twoStep: true`.
2. Scene-only rewrite. When the continuity check reports a `high` severity issue and the author marks it valid, only the scene around the quote is rewritten (prompt: scene + finding + wiki sentence), then the chapter is saved. Everything outside that scene stays byte-identical.

D is wired in the eval only, never in the product: the draft route does not pass `twoStep`, and the scene rewrite has no route or UI (service plus eval hook; see Risks and Open questions). Stage order (spec 7): D beats (before the draft) -> A continuation (inside `startDraft`) -> E1 trim -> E2 repair -> proofread -> continuity check -> D scene rewrite.

Hook for the eval: `eval/novel/steps/chapter.ts`, step `continuity`. Today it only calls `resolveIssue`; it never changes the body, so correct findings never reach the text. Plan order per chapter (`buildPlan`, unchanged): `draft`, `proofread`, `check`, `continuity`, `proposals`, `reader`.

## 2. Evidence (numbers, from docs/eval/novel/2026-10-18/*)

- Q2 (consistency) per run: qwen ko 2, qwen en 2, haiku ko 3, haiku en 3, luna ko 3, luna en 4 (summary.md lines 39-46).
- qwen en: the check flagged the biggest error (Yunseo on the hill instead of the tower stairs, qwen3.8-27b-en.md lines 131-133) and it stayed in the text (line 221). Basket moved gate -> fifth landing -> west bin (line 59). That flag was recorded with an EMPTY `suggestion` ("sensibly leaves `suggestion` empty", line 132); see Open question 8.
- qwen ko: gate "철문으로 막혀 있었다" then "문이 열려 있었다" with no passing scene (qwen3.8-27b-ko.md lines 100-102). Its only flag was a false positive (line 275, severity `medium`). Cloud runs flagged 0 issues (summary.md line 112), so the trigger fires rarely. Never rewrite on an author-dismissed flag.
- Cost: qwen continuity call 1,290.9 s (ko, 21.5 min) and 2,136 s (en, 35.6 min, partly queued behind chapter-extract, summary.md line 116); each extra local call is about 21-36 min (the upper end includes queue time). Cloud 6.8-25.8 s.
- Verified in code at the local tip:
  - `DraftPromptInput` (`src/ai/tasks/draft-chapter.ts`) has `instructions, targetChars, styleCards, packText, previousSummary, previousTail, chapterLabel` and optional `voices` (B); no beat/scene/position/prop field. `buildDraftPrompt(raw)` emits, in order: `<chapter>`, `<target_length>`, `<scene_budget>` (A), `<instructions>`, optional `<voices>`, `<style_cards>`, `<wiki>`, `<previous_summary>`, `<previous_tail>`. `buildContinuationPrompt(raw, draftSoFar)` calls `buildDraftPrompt(raw)` and appends `<draft_so_far>` and `<continue_length>`.
  - `startDraft` (`src/server/ai-features.ts`) builds `promptInput` (a `DraftPromptInput`), computes `firstTimeoutMs` from the budget that starts at its first statement (`DRAFT_TOTAL_BUDGET_MS` 290 s), makes one `startAiStream` call (`'draft-chapter'`), then returns `{ runId, textStream, done }` where `done` is `completeDraft` (A: at most one `draft-continue` call, `replaceRunOutput`, a failed or empty continuation keeps the first text and stores a `DraftWarning` from `src/lib/draft-length.ts`; only an abort rejects). `completeDraft` builds its continuation prompt from `ctx.promptInput`.
  - Issues: `runChapterCheck` (`src/server/chapter-check.ts`) stores `[...namingIssues, ...aiIssues]` with `replaceOpenIssues`. `aiIssues` come from `resolveContinuityIssues` (`src/ai/tasks/continuity-check.ts`): `quote` is the exact body slice at check time (`locateQuote`, first occurrence) and `quoteStart/quoteEnd` are its offsets, so `body.slice(quoteStart, quoteEnd) === quote` holds until the body changes. `suggestion` is a complete replacement sentence for the quote (H prompt), blanked in code for `thread` and `timeline` issues and when it equals the quote. Code-made numeric issues (age mismatches) are always `medium`, naming issues always `low`, so only model issues can be `high`. J's `locateAllQuotes`/`expandQuote` serve the proofread quotes, not continuity issues.
  - No scene splitter exists. `src/lib/import/split.ts` `SEPARATOR` (line 16, `/^(?:\*\s*\*\s*\*|＊＊＊|---)$/`) is chapter level; do not reuse or change it. `src/lib/korean/paragraphs.ts` `splitParagraphs(text)` (E1) returns the non-empty trimmed lines with offsets `{ index, text, start, end }`; the no-marker mode of `sceneRangeAt` reuses it. `src/lib/scene.ts` does not exist yet; this track creates it.
  - Eval files: `eval/novel/run.ts` sets `AI_SPEECH_STYLE=''` (no `<voices>` in eval prompts), `AI_DAILY_TOKEN_LIMIT=0` and `setAiTimeoutOverride(profile.timeoutMs)` for the whole run. `eval/novel/steps/finish.ts` `RunSummarySchema` has optional blocks (`interview`, `timeouts`, `extraction`, `proofread`, `continuity`, `draft`); `calls.byTask` and `speed.byTask` are keyed by task name, so the two new tasks appear without a change. D adds no summary block.

## 3. Files

Write (existing):
- `src/ai/tasks/draft-chapter.ts` (add optional `beats` field to `DraftPromptInput`, `<beats>` section, exported `BEATS_RULE`, `omitTargetLength` option; A owns `DRAFT_SYSTEM` and the length rules, D does not edit them)
- `src/server/ai-features.ts` (`startDraft` and its `DraftContext` use only)
- `src/test/ai-fakes/draft-beats.ts`, `src/test/ai-fakes/scene-rewrite.ts` (L0 placeholders already registered in `FAKE_OUTPUTS`: `fakeDraftBeats` returns `{ scenes: [] }`, `fakeSceneRewrite` returns `{ text: '' }`; replace the body, keep the export name)
- `eval/novel/localize/en/draft-beats.ts` (exports `DRAFT_BEATS_SYSTEM`), `eval/novel/localize/en/scene-rewrite.ts` (exports `SCENE_REWRITE_SYSTEM`): L0 placeholder texts, keep the export names
- `eval/novel/localize/samples/draft-beats.ts` (exports the string `draftBeatsSample`), `eval/novel/localize/samples/scene-rewrite.ts` (exports the string `sceneRewriteSample`): L0 placeholders, keep the export names; `localize.test.ts` already imports them
- `eval/novel/localize/scaffold.ts` (`RULES`; spec 8 order A -> I -> HX2 -> B -> D: insert D's block as one group just before the bare label rule `['인물', 'character']`, after the interview topic rules and after the `장면 (\d+)개, 장면마다 …` rule)
- `eval/novel/steps/chapter.ts` (draft step passes `twoStep` and writes `chapters/NN.attempt-K.beats.json`; continuity step calls the rewrite and writes `chapters/NN.pre-rewrite.md`, `metrics/NN.pre-rewrite.json`, `rewrites/NN.json`)
- `eval/novel/steps/util.ts` (add `pickRewriteIssueIds`)

Create (do not exist yet):
- `src/ai/tasks/draft-beats.ts`, `src/ai/tasks/draft-beats.test.ts`
- `src/ai/tasks/scene-rewrite.ts`, `src/ai/tasks/scene-rewrite.test.ts`
- `src/lib/scene.ts`, `src/lib/scene.test.ts`
- `src/server/scene-rewrite.ts`, `src/server/scene-rewrite.test.ts`
- `eval/novel/steps/util.test.ts`
- New tests for shared test files go into their own files (spec 5): `src/ai/tasks/draft-chapter.D.test.ts`, `src/server/ai-features.D.test.ts`, `eval/novel/localize/localize.D.test.ts`, and `eval/novel/run.D.test.ts` (only if cheap, section 6). Do not add cases to `draft-chapter.test.ts`, `ai-features.test.ts`, `localize.test.ts` or `run.test.ts`; fixing a stale expectation there is the only allowed edit.

Read-only (do not edit): `src/ai/run.ts` (`runAiTask`, `startAiStream`, `replaceRunOutput`), `src/ai/types.ts` (`AiTaskDef`), `src/ai/prompt-utils.ts` (`neutralizeDeep`, `TAG_DATA_RULE`), `src/ai/tasks/continuity-check.ts`, `src/server/issues.ts` (`listIssues`, `resolveIssue`), `src/server/chapters.ts` (`getChapter`, `saveChapter`; `SaveChapterInput` has `expectedVersion` and `keepHistory`), `src/server/access.ts` (`requireRowWork`, `requireWorkRole`; `'chapters'` is a `RowTable`), `src/db/schema.ts` (`issues` has `quoteStart`, `quoteEnd`, `severity`, `status`, `wikiExcerpt`, `explanation`, `suggestion`), `src/lib/korean/paragraphs.ts`, `src/lib/korean/sentences.ts` (`locateAllQuotes`), `src/test/fake-ai.ts`, `src/test/factories.ts`, `src/app/api/works/[workId]/draft/route.ts` (leave it unchanged: it does not pass `twoStep`), `e2e/ai-stub/responders.ts` (D adds no row: the app never reaches the new tasks), `eval/novel/eval-client.ts` (`TASK_DEFS` lists only tasks that set their own `timeoutMs`; D sets none, so no entry), `eval/novel/metrics.ts`, `eval/novel/fake-author.ts`, `eval/novel/steps/finish.ts`, `eval/novel/blind.ts`, `eval/novel/cli.ts`.

Do NOT change: `DRAFT_SYSTEM` or A's length rules in `draft-chapter.ts`, `src/db/types.ts`, `src/test/ai-fakes/index.ts`, `eval/novel/localize/en-systems.ts`, `eval/novel/localize/localize.test.ts` (seam registrations), the `createChapterFromDraft` rule that the run task is `draft-chapter`, `buildPlan` in `eval/novel/state.ts` (no new step key), `docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` (see Open question 9).

## 4. Design (ordered steps)

Part 1: two-step draft

1. Registration is done by the L0 seam: check `grep -n "draft-beats\|scene-rewrite" src/db/types.ts src/test/ai-fakes/index.ts eval/novel/localize/en-systems.ts` (all three show both names) and that the six placeholder files named in section 3 exist. If missing, stop and report (D does not edit `AI_TASKS`, `FAKE_OUTPUTS` or `EN_SYSTEMS`). `ai_runs.task` is plain text, so no migration.
2. Create `src/ai/tasks/draft-beats.ts`: `DraftBeatsSchema` (zod, no min/max/default, all fields required), `DRAFT_BEATS_SYSTEM` (Korean; exact line order: the intro line, the rule lines, then `TAG_DATA_RULE` as the second-to-last line, then `- 모든 출력은 한국어로 쓴다.` as the final line; the test pins both positions), `renderBeats(beats): string`, a re-export `export { BEATS_RULE } from '@/ai/tasks/draft-chapter'` (the constant itself lives in `draft-chapter.ts`, see step 4), `draftBeatsTask: AiTaskDef<DraftPromptInput, DraftBeats>` (name `'draft-beats'`, effort `'medium'`, maxTokens 4000, `buildPrompt: (input) => buildDraftPrompt({ ...input, beats: null }, { omitTargetLength: true })`, importing `buildDraftPrompt` from `draft-chapter.ts`; do not copy the section list, so the two prompts cannot drift). System rules: split the instructed events into 1-6 scenes in story order; per scene give place, characters present, objects with where they are or who holds them, and the ordered actions (one short sentence each); use only the instructions and `<wiki>`; never invent events; keep names as written in the wiki.
3. `renderBeats` output format (exact, tests pin it): per scene `장면 N` / `장소: X` / `인물: a, b` / `물건: o1; o2` / `순서:` / `1. ...` lines. Empty `scenes` array renders `(없음)`. An empty `characters` renders the line `인물: (없음)`, an empty `objects` renders the line `물건: (없음)` (the line is always kept), and an empty `sequence` renders `순서:` followed by one line `(없음)`. Scenes separated by one blank line. `BEATS_RULE` (defined in `draft-chapter.ts`, step 4) = `위 장면 목록의 장소, 인물, 물건의 위치, 사건 순서를 그대로 지키고 목록에 없는 장소 이동은 쓰지 않는다.`
4. `src/ai/tasks/draft-chapter.ts`: add `beats?: string | null` to `DraftPromptInput`. Export `BEATS_RULE` here (so `draft-chapter.ts` imports nothing from `draft-beats.ts` and there is no import cycle; `draft-beats.ts` imports `buildDraftPrompt`, `BEATS_RULE` and the `DraftPromptInput` type from here). Change the signature to `buildDraftPrompt(raw: DraftPromptInput, options?: { omitTargetLength?: boolean })`: when `omitTargetLength` is true, leave out BOTH the `<target_length>` line and the `<scene_budget>` line (the two length lines of the current builder), nothing else changes. Only when `input.beats` is a non-empty string, append `''`, `<beats>`, `BEATS_RULE`, the beats text, `</beats>` after `</previous_tail>`. Without `beats` and without options the output must equal the output at the local tip before D exactly (`<voices>` stays where B put it). `buildContinuationPrompt` needs no change: it calls `buildDraftPrompt(raw)`, so the `<beats>` section lands before `<draft_so_far>`; D's test pins that.
5. `src/server/ai-features.ts` `startDraft`: add optional `twoStep?: boolean` to `input` (default false) and extend the declared return type with `beats?: DraftBeats; beatsRunId?: string`. `promptInput` is already built before the first AI call (it carries `voices`). Insert, right after that object and BEFORE `firstTimeoutMs` is computed (so the first stream's budget already counts the beat call, which started after `startedAt`):
   - (a) if `input.twoStep`: `const beatsRun = await runAiTask(db, { userId: actor.userId, workId, chapterId, signal }, draftBeatsTask, promptInput, client)`; if `beatsRun.output.scenes.length === 0` throw `new AppError('AI_ERROR', '장면 목록을 만들지 못했습니다. 다시 시도해 주세요.')`. No `timeoutMs` (the task default 120 s applies in the product; the eval overrides every limit). Import `runAiTask` from `@/ai/run` (already imports `replaceRunOutput`, `startAiStream`, ...).
   - (b) `const finalInput: DraftPromptInput = beatsRun ? { ...promptInput, beats: renderBeats(beatsRun.output) } : promptInput`. Use `finalInput` for `buildDraftPrompt` in the `startAiStream` call AND pass it as `promptInput` into `completeDraft`'s context, so A's continuation prompt sees the same beats. Without `twoStep` nothing changes (same object, no `beats`).
   - (c) return `{ runId: first.runId, textStream: pipe.iterable, done, beats: beatsRun?.output, beatsRunId: beatsRun?.runId }`. `runId` stays the `draft-chapter` run (what `createChapterFromDraft`, `repairDraft` and the eval use). A beat-call failure rejects `startDraft` before any prose run exists (an `error` row for `draft-beats`, no `draft-chapter` row).
6. `src/test/ai-fakes/draft-beats.ts`: `fakeDraftBeats(input)` returns up to 3 scenes built from `input.instructions` split on `[.!?\n]+` (place `'장소 N'`, characters `['등장인물']`, objects `[]`, sequence = that sentence). Always at least 1 scene. Do this first: with the placeholder's empty list every eval run through the draft step would fail once step 8 sets `twoStep`.
7. Part 1 localize (draft-beats only; the scene-rewrite parts are step 10b). `eval/novel/localize/en/draft-beats.ts`: replace the placeholder text with the `DRAFT_BEATS_SYSTEM` English text (no Hangul; keep `EN_TAG_DATA_RULE`, rule by rule in the same order); do not edit `en-systems.ts`. `scaffold.ts` `RULES`, one block before the bare label rules `'인물'`, `'장소'`, `'물건'`: `[BEATS_RULE, '<English translation of the rule>']` first (import `BEATS_RULE` from `@/ai/tasks/draft-chapter`; it contains the shorter labels), then `[/장면 (\d+)(?![\d개])/g, 'Scene $1']` (the lookahead keeps `<scene_budget>` safe even if its rule changes), `['인물: ', 'Characters: ']`, `['물건: ', 'Objects: ']`, `['장소: ', 'Place: ']`, `['순서:', 'Sequence:']`. `(없음)` is already translated by the existing rule. `eval/novel/localize/samples/draft-beats.ts`: add an exported English `draftBeatsInput: DraftPromptInput` const (no Hangul) and set `draftBeatsSample = draftBeatsTask.buildPrompt(draftBeatsInput)`; do not edit `samples/draft-chapter.ts` (A owns it; its `draftSample` is a built prompt string, not an input).
8. `eval/novel/steps/chapter.ts` `draft` step: pass `twoStep: true` in the `startDraft` input; the closure returns `{ runId: run.runId, text: await run.done, beats: run.beats }`; add `'beats.json'` to the list of stale stage files removed before the stage files are written (a resumed draft reuses the attempt number); right after `writeRunFile(... draft.raw.txt ...)` write `${stem}.beats.json` (`JSON.stringify(generated.beats, null, 2)`) when `generated.beats` exists. Stage files of the attempt stay: `draft.raw.txt` (A), `draft.trimmed.txt` (E1, written by `trimStage`), `draft.repaired.txt` (E2), then `attempt-K.md`.

Part 2: scene rewrite

9. Create `src/lib/scene.ts` (pure): `sceneRangeAt(text, start, end): SceneRange | null`. A scene break line matches `/^\s*(\*\s*\*\s*\*|\*{3,}|-{3,}|◇+|◆+|#)\s*$/`. If the text has break lines: the scenes are the segments between consecutive break lines, plus the segment before the first break line and the segment after the last break line (so the first and last scenes count and can be rewritten). Every scene range is trimmed: `start` is the first non-whitespace char of the segment and `end` (exclusive) is just after its last non-whitespace char, so the break lines, the blank lines around a marker and the newline before/after are never inside the range. Segments that are empty after trimming are not scenes. Return null when `[start, end)` is not inside one trimmed scene range. If no break line exists: `paras = splitParagraphs(text)` (from `@/lib/korean/paragraphs`); take the paragraph holding `start` and the one holding `end - 1`, extend by `SCENE_WINDOW_LINES = 6` paragraphs each way (clamped); the range runs from the first extended paragraph's `start` to the last one's `end`. Return null for empty text or offsets outside the text.
10. Create `src/ai/tasks/scene-rewrite.ts`: `SceneRewriteSchema = z.object({ text: z.string() })`, `SCENE_REWRITE_SYSTEM` (Korean, `TAG_DATA_RULE`), `sceneRewriteTask: AiTaskDef<SceneRewriteInput, { text: string }>` (name `'scene-rewrite'`, effort `'medium'`, maxTokens 8000). Prompt sections `<scene>`, `<findings>` (per finding lines `- 문제 문장: …`, `  이유: …`, `  위키: …`, `  제안: …`; omit the 제안 line when empty), optional `<beats>`; use `neutralizeDeep` on the whole input. System rules: rewrite only this scene; fix each finding so it agrees with the wiki sentence; keep event order, dialogue, voice and paragraph breaks everywhere else; add no new events; keep the length close to the original; keep paragraphs short (at most 3 sentences, E1's rule); output only the rewritten scene in `text`. Export `isAcceptableRewrite(original: string, rewritten: string, quotes: string[]): boolean`: true only when `rewritten.trim()` is non-empty, its length is between 0.6x and 1.5x of `original.trim()` length, and for every distinct non-empty quote the number of non-overlapping occurrences in `rewritten.trim()` is strictly smaller than in `original.trim()` (count with `locateAllQuotes(text, quote, Number.MAX_SAFE_INTEGER).length` from `@/lib/korean/sentences`). A short quote that also appears elsewhere in the scene is therefore fine as long as the rewrite removed at least one occurrence; a quote that is still there as often as before means the finding was not fixed.
10b. Part 2 localize and sample (same commit as step 10, before `tsc` is run): replace the placeholder in `eval/novel/localize/en/scene-rewrite.ts` with the `SCENE_REWRITE_SYSTEM` English text (no Hangul; keep `EN_TAG_DATA_RULE`); in `scaffold.ts` `RULES` add, inside D's block of step 7 (before the bare labels): `['문제 문장: ', 'Problem sentence: ']`, `['이유: ', 'Reason: ']`, `['위키: ', 'Wiki: ']`, `['제안: ', 'Suggestion: ']`; set `sceneRewriteSample` in `samples/scene-rewrite.ts` to `sceneRewriteTask.buildPrompt({ sceneText: 'Mina stood at the gate.', findings: [{ quote: 'the gate', explanation: 'The gate was locked.', wikiExcerpt: 'The gate is locked at night.', suggestion: 'Mina waited at the locked gate.' }], beats: null })`.
11. `src/test/ai-fakes/scene-rewrite.ts`: `fakeSceneRewrite(input)` returns `{ text }` = `sceneText` with each finding quote replaced by its `suggestion` (when non-empty and different from the quote) or by the first half of the quote plus `…`.
12. Create `src/server/scene-rewrite.ts` `rewriteFlaggedScenes`. First two lines: `const workId = await requireRowWork(db, 'chapters', input.chapterId)` then `await requireWorkRole(db, workId, actor.userId, 'editor')`. Then `getChapter(db, actor, input.chapterId)`. If `input.issueIds` is empty return `{ chapter, rewritten: [], skipped: [] }` without querying. Load the rows with exactly `db.select().from(issues).where(and(inArray(issues.id, input.issueIds), eq(issues.chapterId, chapter.id)))` (drizzle `and`, `inArray`, `eq`; `listIssues` only filters by status, do not use it); an id that is not returned (unknown, or an issue of another chapter) is skipped `'not-found'`. Author validity is enforced here, not trusted from the caller (CLAUDE.md: changes come from author actions): an issue whose `status !== 'accepted'` is skipped `'not-accepted'` (the eval calls `resolveIssue(accepted)` before the rewrite, step 14). Skip (put in `skipped` with a reason), in this order: `'not-found'`, `'not-accepted'`, an issue with an empty `suggestion.trim()` (`'no-suggestion'`, see Open question 8), null offsets (`'no-span'`), `body.slice(quoteStart, quoteEnd) !== quote` (`'span-mismatch'`), no scene (`'no-scene'`). Group the rest by scene range (sort by start; overlapping ranges merge, findings concatenated, union range). Process at most `input.maxScenes ?? 2` groups (extra groups skipped with `'over-limit'`). Per group call `runAiTask(db, { userId, workId, chapterId, signal }, sceneRewriteTask, { sceneText, findings, beats: input.beats ?? null }, client)`. Findings use the issue row's own `quote`, `explanation`, `wikiExcerpt`, `suggestion` (no new context pack). The check is exactly `isAcceptableRewrite(sceneText, output.text, findings.map((f) => f.quote))` with `sceneText = body.slice(start, end)` (the trimmed scene range); when it returns false every issue of the group is skipped `'rejected'`. Do not catch AI errors: they propagate (the eval retry wrapper needs them). Apply accepted replacements from the last range to the first (`body.slice(0,start) + rewritten.trim() + body.slice(end)`), then one `saveChapter(db, actor, { chapterId, body, expectedVersion: chapter.version, keepHistory: true })` only when the body changed. Never touch wiki tables.
13. `eval/novel/steps/util.ts`: add `pickRewriteIssueIds(items, decisions)`.
14. `eval/novel/steps/chapter.ts` `continuity` step (add `copyFileSync`, `existsSync`, `readFileSync` to the `node:fs` import, and `rewriteFlaggedScenes` plus `pickRewriteIssueIds` imports). Let `rewrittenKey = `${key}:rewritten``. The rewrite stage runs AFTER the `resolveIssue` loop (the service only rewrites issues whose status is `accepted`, step 12, so accepting must come first) and BEFORE `mark(ctx, state, key)` and `settle`.
    - Early return: change `if (open.length === 0) { mark; return 'done' }` to `if (open.length === 0 && !pendingFor(ctx.dir, key, 'continuity'))`. The pending review is cleared only by `settle`, so a rerun after a crash between the resolve loop and the end of the step still has it; `review` then comes from `pendingFor(...)` (already the first choice in the existing code), `openIds` is empty and the resolve loop skips every decision. The rerun then reaches the rewrite stage (skipped when `rewrittenKey` is marked), `mark(key)` and `settle`.
    - After the resolve loop, if `!isMarked(state, rewrittenKey)`: `ids = pickRewriteIssueIds(review.items, answer.decisions)` (no `openIds` filter: an issue accepted on an earlier attempt stays eligible, a dismissed one is never in `ids` and the service would skip it as `'not-accepted'` anyway). If `ids` is non-empty: `body` = `getChapter(...).body`; write `chapters/NN.pre-rewrite.md` (that body) BEFORE calling the service, only when the file does not exist yet; copy `metrics/NN.json` to `metrics/NN.pre-rewrite.json` the same way (only when the target does not exist yet and the source does; this is the baseline for the Section 7 "unchanged vs before" row). Then `const result = await guarded(ctx, state, key, () => rewriteFlaggedScenes(ctx.db, ctx.actor, { chapterId, issueIds: ids }, ctx.client))`.
    - If `result` is null (a content error: `guarded` already recorded it in `state.failed`; other errors are rethrown and pause the run), skip the rewrite writes and still mark. Intended behaviour: the rewrite is not retried on resume.
    - Reconcile rule (crash safety): the service saves the DB body first, the files after. So whenever `chapters/NN.pre-rewrite.md` exists, always (re)write from the current DB body, before marking: `chapters/NN.md`, `metrics/NN.json` = `chapterMetrics(newBody, ctx.config.lang, ctx.bible.targetChars, [ctx.bible.workStyle.examples], bibleExempt(ctx.bible))` (exactly the five arguments of the `proofread` step and of `resummarizeRun` in `cli.ts`, which rebuilds `metrics/NN.json` from `chapters/NN.md`; with fewer arguments a later resummarize would change the numbers), and `rewrites/NN.json` = `{ rewritten, skipped }`, except that `rewrites/NN.json` is written only when `result.rewritten.length > 0` or the file does not exist yet (after a crash between save and file writes, the resumed call skips the scene as `'span-mismatch'` because the body is already rewritten, and that must not overwrite the first call's record). All these writes are idempotent.
    - Then `mark(ctx, state, rewrittenKey)` always. The existing `mark(ctx, state, key)` and `settle` stay last.
15. No spec edit (Open question 9).

## 5. Interface (TypeScript)

```ts
// src/ai/tasks/draft-beats.ts
export const DraftBeatsSchema: z.ZodType<DraftBeats>
export type DraftBeats = { scenes: { place: string; characters: string[]; objects: string[]; sequence: string[] }[] }
export { BEATS_RULE } from '@/ai/tasks/draft-chapter' // defined in draft-chapter.ts
export function renderBeats(beats: DraftBeats): string
export const draftBeatsTask: AiTaskDef<DraftPromptInput, DraftBeats>
// src/ai/tasks/draft-chapter.ts: DraftPromptInput gains `beats?: string | null`; `export const BEATS_RULE: string`;
// `export function buildDraftPrompt(raw: DraftPromptInput, options?: { omitTargetLength?: boolean }): string`
// src/lib/scene.ts
export type SceneRange = { start: number; end: number }
export const SCENE_WINDOW_LINES = 6
export function sceneRangeAt(text: string, start: number, end: number): SceneRange | null
// src/ai/tasks/scene-rewrite.ts
export type SceneFinding = { quote: string; explanation: string; wikiExcerpt: string; suggestion: string }
export type SceneRewriteInput = { sceneText: string; findings: SceneFinding[]; beats: string | null }
export const sceneRewriteTask: AiTaskDef<SceneRewriteInput, { text: string }>
export function isAcceptableRewrite(original: string, rewritten: string, quotes: string[]): boolean
// src/server/scene-rewrite.ts
export type SkipReason =
  | 'not-found' | 'not-accepted' | 'no-suggestion' | 'no-span' | 'span-mismatch' | 'no-scene' | 'over-limit' | 'rejected'
export type RewrittenScene = { issueIds: string[]; start: number; end: number; runId: string }
export async function rewriteFlaggedScenes(
  db: Db, actor: Actor,
  input: { chapterId: string; issueIds: string[]; maxScenes?: number; beats?: string | null },
  client?: AiClient, signal?: AbortSignal,
): Promise<{ chapter: ChapterRow; rewritten: RewrittenScene[]; skipped: { issueId: string; reason: SkipReason }[] }>
// src/server/ai-features.ts startDraft: input gains `twoStep?: boolean`; return type gains `beats?: DraftBeats; beatsRunId?: string`
// eval/novel/steps/util.ts
export function pickRewriteIssueIds(items: { id: string; severity: string }[], decisions: { id: string; valid: boolean }[]): string[]
```

## 6. Tests (write first, see them fail, then implement)

`src/ai/tasks/draft-beats.test.ts`
- renders beats: input 2 scenes (one with `objects: []`) -> exact `renderBeats` text incl. `(없음)` and blank line between scenes.
- schema accepts a full list, rejects a scene missing `place` (ZodError).
- `draftBeatsTask.system` contains `TAG_DATA_RULE`; prompt contains `<instructions>`, wiki pack text, previous tail, and neither `<target_length>` nor `<scene_budget>`.
- prompt isolation: instructions containing `</instructions>` stay inside one section (same style as the `draft-chapter prompt isolation` describe in `draft-chapter.test.ts`).
- shared sections: `draftBeatsTask.buildPrompt(sample)` equals `buildDraftPrompt(sample, { omitTargetLength: true })` (same wiki and instructions sections, no drift).

`src/ai/tasks/draft-chapter.D.test.ts` (new file; the existing `draft-chapter.test.ts` is not edited and stays green)
- no `beats` -> output `toBe` a literal expected string pinned in the test: capture it from the local tip BEFORE changing `buildDraftPrompt` (fixed `DraftPromptInput` fixture, full output written out, so it holds `<target_length>` and `<scene_budget>`), never by calling the new code; assert it for `beats` omitted, `beats: undefined` and `beats: null`.
- `omitTargetLength: true` -> output equals the pinned string with only the `<target_length>…</target_length>` and `<scene_budget>…</scene_budget>` lines removed.
- `beats: '장면 1\n장소: 탑'` -> output contains `<beats>`, `BEATS_RULE`, the beats text, and `<beats>` comes after `</previous_tail>`; `buildContinuationPrompt` with the same input has `<beats>` before `<draft_so_far>`.
- beats containing `</beats>` is neutralized (one `</beats>` only).

`src/lib/scene.test.ts`
- 3 scenes separated by `\n\n* * *\n\n`; offsets inside scene 2 -> `text.slice(range.start, range.end)` equals the trimmed scene 2 text exactly (no marker, no blank line, no outer newline). Add a case with extra blank lines around the marker (`\n\n\n* * *\n\n\n`): the range is still the trimmed scene.
- a quote in scene 1 (before the first marker) and a quote in scene 3 (after the last marker) each return that scene's trimmed range (not null).
- quote spanning two scenes -> null.
- no marker, 20 lines, quote on line 10 -> range covers lines 4..16 (window 6).
- no marker, quote on line 1 -> range starts at 0 (clamped).
- empty text and out-of-range offsets -> null.
- `---` and `◇` lines count as breaks.

`src/ai/tasks/scene-rewrite.test.ts`
- prompt has the scene, each finding field, wiki sentence; no beats section when `beats: null`; system has `TAG_DATA_RULE`.
- `isAcceptableRewrite`: ok case true; empty false; 0.5x length false; 1.6x false; a quote whose count did not drop false; a quote that occurs twice in the original and once in the rewrite true; empty quote ignored.

`src/server/ai-features.D.test.ts` (new file, copy the small `setup()` helper from `ai-features.E1.test.ts`; existing cases stay unchanged and green because `twoStep` defaults off). Use `targetChars: 10` so no continuation runs, except in the last-but-one case.
- `twoStep: true` -> beat call happens before the prose call (spy on `FakeAiClient.generateObject` and `streamText`), prose prompt contains `<beats>` and a beat line, two `ai_runs` rows: `draft-beats` done and `draft-chapter` done; result has `beats` and `beatsRunId`. The test must drain `textStream` and `await run.done` BEFORE asserting row statuses (`startAiStream` finishes its row only when the stream is consumed; before that the row is `running`).
- `twoStep` omitted -> only one `draft-chapter` row, no `draft-beats` row, prompt has no `<beats>`.
- beat override throws -> `startDraft` rejects with code `AI_ERROR`; no `draft-chapter` row.
- beat override returns `{ scenes: [] }` -> rejects with `AI_ERROR` and the Korean message.
- short draft override with a large `targetChars` and `twoStep: true` -> the `draft-continue` prompt (spy on `streamText`, override `'draft-continue'`) contains the same `<beats>` text.
- `createChapterFromDraft` still works on the prose run of a two-step draft (after `await run.done`).

`src/server/scene-rewrite.test.ts` (`createTestDb`, factories; `FakeAiClient` with overrides)
- chapter of 3 scenes split by `* * *`; one `high` issue (inserted directly into `issues` with `quoteStart`/`quoteEnd`, `status: 'accepted'` and a non-empty `suggestion`) in scene 2; override `scene-rewrite` returns scene 2 changed -> saved body has scenes 1 and 3 byte-identical, scene 2 replaced, version +1, a history row exists (`keepHistory`), `rewritten[0].issueIds` has the id, one `ai_runs` row `scene-rewrite`.
- rewrite prompt (spy `calls[0][0].prompt`) contains scene 2 and the wikiExcerpt and does not contain scenes 1 or 3.
- two issues in the same scene -> one AI call, both findings in the prompt.
- 3 scenes flagged with `maxScenes` default -> 2 calls, the third issue skipped `over-limit`.
- quote not equal to `body.slice(start, end)` -> skipped `span-mismatch`, no AI call, chapter version unchanged.
- null offsets -> `no-span`. Unknown issue id -> `not-found`; an issue id of another chapter -> `not-found`; empty `issueIds` -> empty result, no AI call.
- issue with status `open` or `dismissed` -> skipped `not-accepted`, no AI call, body unchanged (the service itself checks author validity).
- `high` issue with empty `suggestion` -> skipped `no-suggestion`, no AI call.
- override returns text that still contains the quote as often as before -> skipped `rejected`, body unchanged, no save. Quote that also appears elsewhere in the scene: override removes one occurrence -> accepted.
- override throws -> `rewriteFlaggedScenes` rejects `AI_ERROR`, body unchanged.
- viewer role -> `FORBIDDEN`; non-member -> `NOT_FOUND`.

`eval/novel/steps/util.test.ts`
- `pickRewriteIssueIds([{id:'a',severity:'high'},{id:'b',severity:'medium'},{id:'c',severity:'high'}], [{id:'a',valid:true},{id:'b',valid:true},{id:'c',valid:false}])` -> `['a']`. Unknown decision ids are ignored; empty -> `[]`.

`eval/novel/localize/localize.test.ts` already loops `AI_TASKS` over `EN_SYSTEMS` and the `PROMPTS` samples (`draftBeatsSample`, `sceneRewriteSample`), so the two English systems and the two samples are checked once D fills them (no Hangul, tag order); D does not edit it. New case in `eval/novel/localize/localize.D.test.ts` (Part 1): `translateScaffold(buildDraftPrompt({ ...draftBeatsInput, beats: renderBeats(sampleScene) }))` has no Hangul left, with `draftBeatsInput` imported from `samples/draft-beats.ts` and `sampleScene` an English `DraftBeats` const defined in the test; and the translated `<scene_budget>` line is still the A form `N scenes, about M characters per scene including spaces`.

`eval/novel/run.test.ts`: run the existing suite plus `run.draft-stages.test.ts` and `run.E1.test.ts`; if a case counts calls per task, `draft-beats` calls now appear because the eval draft step passes `twoStep: true`. Fix the expectation in place, not the product code. Add one case, in the new `eval/novel/run.D.test.ts`, only if cheap (copy the `makeRun`/`open`/`afterEach` helpers of `run.draft-stages.test.ts`, which are self-contained): a `continuity-check` override returning one `high` issue plus fake author (`fakeAnswer` accepts every item) -> `chapters/01.pre-rewrite.md` and `rewrites/01.json` exist. The override must copy `quote` from `input.chapterText`, use a real `entryRef` from `input.pack.entries[0]` and give a non-empty `suggestion`; otherwise `locateIssues` drops the issue or the service skips it. If the pack has no entry in the fake run, skip the case and say so in the final report.

## 7. Acceptance metrics

| Metric | Current | Target | How measured |
|---|---|---|---|
| Unit tests for the new code | 0 | all listed cases pass | `pnpm vitest run` (section 11) |
| Existing draft tests as A, B, E1, E2 left them (`draft-chapter.test.ts` incl. A's `DRAFT_SYSTEM` test, `ai-features.test.ts`, `ai-features.E1/E2.test.ts`, `route.test.ts`, `responders.test.ts`, `run.draft-stages.test.ts`, `run.E1.test.ts`) | green | green; D's diff edits none of them except a stale call-count expectation in `run.test.ts` | vitest |
| Bytes changed outside the rewritten scene | not measured | 0 (first `scene-rewrite.test.ts` case in section 6: scenes 1 and 3 byte-identical) | `scene-rewrite.test.ts` |
| High + author-valid flags that reach the text (post-merge eval, not a DoD gate) | 0% (qwen en C1 caught, not fixed) | 100% of those whose quote is located, scene found, suggestion non-empty and rewrite accepted | `rewrites/NN.json` `rewritten` vs `skipped` counts in a real run. Offline proxy for the DoD: the `scene-rewrite.test.ts` cases plus the `pickRewriteIssueIds` test |
| Rewrites on author-dismissed flags | n/a | 0 | `pickRewriteIssueIds` test and the service `not-accepted` test |
| Reviewer Q2 (post-merge eval, not a DoD gate; manual review, needs 2+ reruns, n=1 chapter each) | qwen ko 2, qwen en 2, haiku 3, luna 3-4 | no run at 2 or below | next eval round reviews, not part of this track's code check. Offline proxy: the `scene-rewrite.test.ts` cases (the fix reaches the text, nothing else changes) |
| `lengthOk`, `foreignRuns`, `metaHits`, `overlongParagraphs`, `sampleCopyHits`, `repeatedWords` after rewrite | in `metrics/NN.json` | no worse than before | `metrics/NN.json` recomputed by the continuity step, compared with the baseline `metrics/NN.pre-rewrite.json` (step 14) |
| Added calls per chapter | 0 | +1 per draft attempt (beats), +1 per flagged scene, max 2 scenes | `calls/*.json`; local cost per call of about 21-36 min is documented |

## 8. Dependencies on other tracks

- A, B, E1, E2 are merged. `startDraft`, `completeDraft`, `DraftContext`, `DRAFT_SYSTEM`, `responders.ts` and the `draft` step stages are A/E1/E2's result; D's edits stay additive (new optional field, new section appended last, `scaffold.ts` rules in one block). B's voices stay optional and off in the eval; they may later feed `draft-beats` characters, not in this track.
- A's `draftLengthPlan`/`continuationPlan` and the continuation run inside `startDraft` after the beat call; D passes the same beats to both (step 5). The scene rewrite sits after E1 trim, E2 repair and proofread, so it edits the final saved body.
- Wave L0 seam owns `AI_TASKS`, `EN_SYSTEMS`, `FAKE_OUTPUTS` and the sample registrations for `draft-beats` and `scene-rewrite`; D only fills the placeholders.
- H owns `continuity-check.ts` and the issue shape (numeric issues first and `medium`, `usableSuggestion`). J's `chapter-check.ts` keeps `runChapterCheck(db, actor, { chapterId }, client?, signal?)` and writes the issues; D only reads the `issues` row. If a later track renames the columns, adapt `src/server/scene-rewrite.ts` only.
- GUARDS: `src/ai/guards/index.ts` exports `foreignScriptSpans` and `foreignScriptRuns` (and `repeatedWords`, `sampleCopies`, `isNearDuplicateFact`); `metrics.ts` already uses `foreignScriptRuns`. D uses none of them. C (wave L3, after D) must import them and extends E2's `draft-repair.ts`; it needs none of D's files. The rewrite uses only a mark `chN:continuity:rewritten`, never a new plan key.
- HX4/HX5: no D block in `RunSummarySchema`; `readSummaryInputs` reads `chapters/` only by exact patterns (`NN.md`, `NN.extraction.json`, `NN.proofread.json`, `NN.attempt-K.continue.json`), so `NN.pre-rewrite.md` and `NN.attempt-K.beats.json` are ignored. `writeBlindCopy` copies `chapters/` whole (the reviewer sees `NN.pre-rewrite.md`) and `metrics/`, but not `rewrites/`; leave it.
- J/F1 (proofread split) is unaffected: the rewrite runs after proofread, in the continuity step. F4 (local serialization) decides how local calls queue. No code dependency.

## 9. Risks

- Local time: each of beats, scene rewrite costs one call of about 21-36 min on qwen. Beats are per draft attempt (up to 3). Do not add re-check calls.
- Timeout: the product limit is 120 s for structured calls (`DEFAULT_AI_TIMEOUT_MS`). The harness overrides every limit with `setAiTimeoutOverride`; `EvalClient` only reports `wouldTimeOut`. Do not set `timeoutMs` on the new tasks.
- The app route is unchanged (no `twoStep`): beats (120 s) plus stream (280 s) would exceed `maxDuration = 300`. Enabling it in the product needs a separate decision.
- A's budget is wall-clock and not eval-aware: `completeDraft` skips the continuation when under 30 s of the 290 s budget remain, which a 20+ min local draft always trips, and the beat call adds to the elapsed time. D does not change this (report it, do not fix it here); it only affects whether A's continuation runs in local evals.
- A false-positive flag rewrites correct text. Guard: only author-valid (the service requires issue status `accepted`) + severity `high` + non-empty suggestion, quote span check, `isAcceptableRewrite`, max 2 scenes, history row kept (`keepHistory`), `chapters/NN.pre-rewrite.md` saved.
- The rewritten text is not re-checked by continuity (cost) nor by the foreign-script, repeat or paragraph detectors; the only verification is that the quote is gone. The metrics row in section 7 shows regressions after the fact.
- The `check` step (extraction proposals) and the `continuity` issues were computed on the body before the rewrite; the `proposals` step then runs on the rewritten body, so a proposal's evidence quote can point at a replaced sentence. Accepted; not re-extracted.
- No-marker text: scene = window of 13 paragraphs, so a rewrite may touch lines unrelated to the finding. Accepted trade-off; the window constant is in one place.
- Prompt injection: every new prompt goes through `neutralizeDeep` and the system has `TAG_DATA_RULE`.
- A crash between the DB save and the file writes is reconciled by the step 14 rule (files are rewritten from the DB body whenever `chapters/NN.pre-rewrite.md` exists).
- `fake-author.ts` marks every item valid, so tests that produce a `high` issue will trigger a rewrite. `fakeContinuity` never produces `high` (hand and age issues are `medium`, non-confirmed facts `low`), so no existing run test reaches the rewrite; only an explicit override does.

## 10. Open questions (defaults chosen; implement the default)

1. Run the rewrite automatically in the app? Default: no, eval and service only (no route, no UI).
2. Re-check after rewrite? Default: no.
3. "High importance" means `severity === 'high'` only.
4. Is the beat list shown to the author? Default: stored as an `ai_runs` row (`draft-beats`) and as `chapters/NN.attempt-K.beats.json` in the eval; not shown in the draft panel.
5. Which wiki sentences go into the rewrite prompt? Default: the issue's own `wikiExcerpt` only.
6. New version source for a rewrite? Default: none, uses `'save'` with `keepHistory: true`.
7. Does the beat step fall back to one-step on failure? Default: no, it fails (keeps the eval measurement clean).
8. The 2026-10-18 qwen en flag that motivated D had an empty `suggestion`. H's prompt now asks for a complete replacement sentence for contradictions and blanks it only for `thread`/`timeline` issues (or by the model when a sentence cannot fix it). Default: keep the `no-suggestion` skip (a rewrite without a proposed fix has to invent one). If the next eval shows valid `high` contradictions skipped for this reason (`rewrites/NN.json`), allow `kind === 'contradiction'` with an empty suggestion, since the `wikiExcerpt` fixes the target.
9. Add `draft-beats` and `scene-rewrite` rows to table 7.3 of the MVP spec? Default: no. The cloud tracks added none for `draft-continue`, `paragraph-trim` or `draft-repair`, and D's tasks never run in the product; the improvement spec is the record.

## 11. Definition of done (commands, all must pass)

```
pnpm vitest run src/ai/tasks src/lib/scene.test.ts src/server/ai-features src/server/scene-rewrite.test.ts src/test/fake-ai.test.ts "src/app/api/works/[workId]/draft/route.test.ts" src/lib/draft-stream.test.ts src/components/writing/panels/draft-panel.test.tsx --maxWorkers=2
pnpm vitest run eval/novel e2e/ai-stub --maxWorkers=2
pnpm exec tsc --noEmit   # no errors in the files listed in section 3
pnpm eslint src/ai/tasks src/lib/scene.ts src/lib/scene.test.ts src/server/scene-rewrite.ts src/server/scene-rewrite.test.ts src/server/ai-features.ts src/test/ai-fakes eval/novel
pnpm format   # only if the repo formats on commit; do not reformat unrelated files
```
Also confirm `git diff --stat` shows no change to A's `DRAFT_SYSTEM` text or its test, `e2e/ai-stub/responders.ts`, `eval/novel/state.ts`, `eval/novel/steps/finish.ts`, `eval/novel/blind.ts`, the draft route, `src/db/types.ts`, `src/test/ai-fakes/index.ts`, `eval/novel/localize/en-systems.ts`, `eval/novel/localize/localize.test.ts`, the MVP spec, and that `src/app/api/works/[workId]/draft/route.ts` still passes no `twoStep`. Final report lists what was skipped (for example the optional `run.D.test.ts` case).

## Decision (local review)
D gates on the local queue profile (`MODEL_PROFILES[modelId].queue === 'local'`, same rule as C's decision). In the eval, the two-step draft (`twoStep`, the beat list in the prose and continuation prompts) and the scene rewrite after an accepted high-severity issue run for local profiles only. Cloud profiles (haiku, luna) keep the one-step draft and never rewrite the body, so the cloud baseline stays comparable and A's 290 s draft budget is not spent on beats. `eval/novel/run.D.test.ts` pins this (cloud run: no `draft-beats` or `scene-rewrite` call, no `beats.json`, no `pre-rewrite` or `rewrites/` files). The product route and the `startDraft` default path are unchanged.

D overwrites `chapters/NN.md` (written by proofread) and `metrics/NN.json` (written by check) by design, keeping `chapters/NN.pre-rewrite.md` and `metrics/NN.pre-rewrite.json` as backups. This departs from spec 7 "no overwriting of other stages' files" and is accepted.

## Decision (local check, 2026-10-19)
The `continuity` early return now also waits for a pending review (`!pendingFor(ctx.dir, key, 'continuity')`) on every profile, as design step 14 wrote it. It matters only when a run resumes after a crash between resolve and settle: the step then reads the existing answer and settles instead of leaving a stale pending file. A normal run, cloud or local, makes the same calls as before. Accepted without a profile gate.
- Full review (2026-10-19): `DraftBeatsSchema.scenes` now has `.min(1)`, against step 2's "no min/max". An empty list used to pass the client parse, so the eval stopped the run as a harness error (`paused-error`) instead of retrying it as a model failure. With the minimum, the Ollama client rejects it and the eval retries and records it. The beat task runs only on local eval profiles, so no cloud request changes; the empty-list check in `startDraft` stays as a guard.
- Full review (2026-10-19): `rewriteStage` skips the service when `chapters/NN.pre-rewrite.md` exists and differs from the stored body (the save already happened before a crash), and records the rewrite as recovered. `resummarize` recomputes `metrics/NN.pre-rewrite.json` from `chapters/NN.pre-rewrite.md`, and the summary's context-hit figure uses the pre-rewrite text, which is what the `chN:check` continuity call saw.

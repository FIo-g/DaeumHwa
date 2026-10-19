# Track D brief: scene consistency self-review (two-step draft + scene-only rewrite)

Reader: a small model implementing with TDD in an isolated worktree. Follow the steps in order. Repo root: /home/xogud/documents/github/DaeumHwa. Paths below are repo-relative. Read CLAUDE.md first (Korean user copy, English identifiers, `AppError`, no new packages, tests colocated, no real API in tests).

## 1. Goal

Two changes, shipped as two commits (Part 1 then Part 2). Each commit must pass `pnpm exec tsc --noEmit` and its own tests on its own, so everything keyed by the task name `'scene-rewrite'` (the `AI_TASKS` entry, its `EN_SYSTEMS` entry, its `PROMPTS` entry, its scaffold rules, its task file) belongs to Part 2 only; Part 1 only knows `'draft-beats'`:

1. Two-step draft. `startDraft` can first ask for a per-scene beat list (place, characters, objects with their location, ordered actions) as a separate structured AI task `draft-beats`, then write the prose with that list in the prompt. Opt-in through `twoStep: true`.
2. Scene-only rewrite. When the continuity check reports a `high` severity issue and the author marks it valid, only the scene around the quote is rewritten (prompt: scene + finding + wiki sentence), then the chapter is saved. Everything outside that scene stays byte-identical.

Hook for the eval: `eval/novel/steps/chapter.ts` `continuity` step. Today it only calls `resolveIssue`; it never changes the body, so correct findings never reach the text.

## 2. Evidence (numbers, from docs/eval/novel/2026-10-18/*)

- Q2 (consistency) per run: qwen ko 2, qwen en 2, haiku ko 3, haiku en 3, luna ko 3, luna en 4 (summary.md lines 39-46).
- qwen en: the check flagged the biggest error (Yunseo on the hill instead of the tower stairs, qwen3.8-27b-en.md lines 131-133) and it stayed in the text (line 221). Basket moved gate -> fifth landing -> west bin (line 59).
- qwen ko: gate "철문으로 막혀 있었다" then "문이 열려 있었다" with no passing scene (qwen3.8-27b-ko.md lines 100-102). Its only flag was a false positive (line 275). Cloud runs flagged 0 issues (summary.md line 112), so the trigger fires rarely. Never rewrite on an author-dismissed flag.
- Cost: qwen continuity call 1,290.9 s (ko) and 2,136 s (en, partly queued behind chapter-extract, summary.md line 116); each extra local call is about 21-36 min (qwen ko 1,290.9 s is 21.5 min, qwen en 2,136 s is 35.6 min; the upper end includes queue time, so the pure per-call cost may be lower). Cloud 6.8-25.8 s.
- Verified in code: no beat/scene/position/prop field in `src/ai/tasks/draft-chapter.ts` (`DraftPromptInput`, lines 20-34); `startDraft` (`src/server/ai-features.ts` line 259) makes one `startAiStream` call; the eval continuity step (`eval/novel/steps/chapter.ts` ~line 280) has no body write; no scene splitter exists (`src/lib/korean/sentences.ts` is sentence level only). `src/lib/import/split.ts` `splitChapters` already treats `***` and `---` lines as chapter separators (`SEPARATOR` regex at line 16); it is chapter level and is the only existing separator logic. `src/lib/scene.ts` does not exist yet; this track creates it (section 3). Do not reuse or change `split.ts`.

## 3. Files

Write (existing):
- `src/ai/tasks/draft-chapter.ts` (add optional `beats` field to `DraftPromptInput`, `<beats>` section, exported `BEATS_RULE`, `omitTargetLength` option; `DRAFT_SYSTEM` stays unchanged)
- `src/ai/tasks/draft-chapter.test.ts`
- `src/server/ai-features.ts` (`startDraft`)
- `src/server/ai-features.test.ts`
- `src/db/types.ts` (`AI_TASKS`, line 142)
- `src/test/ai-fakes/index.ts` (`FAKE_OUTPUTS`)
- `eval/novel/localize/en-systems.ts` (`EN_SYSTEMS` is `Record<AiTaskName,string>`, so one entry per new task name is required: `draft-beats` in Part 1, `scene-rewrite` in Part 2)
- `eval/novel/localize/scaffold.ts` (`RULES`, labels of the beat list)
- `eval/novel/localize/localize.test.ts` (`PROMPTS`, `Record<AiTaskName, string>` at line 167: one new entry per part, a new `draftSample` const above it, plus one new no-Hangul case)
- `eval/novel/steps/chapter.ts` (draft step writes beats file; continuity step calls the rewrite and writes `chapters/NN.pre-rewrite.md`, `metrics/NN.pre-rewrite.json`, `rewrites/NN.json`)
- `eval/novel/steps/util.ts` (add `pickRewriteIssueIds`)
- `docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` (table 7.3, add 2 rows; small edit)

Create (do not exist yet):
- `src/ai/tasks/draft-beats.ts`, `src/ai/tasks/draft-beats.test.ts`
- `src/ai/tasks/scene-rewrite.ts`, `src/ai/tasks/scene-rewrite.test.ts`
- `src/lib/scene.ts`, `src/lib/scene.test.ts`
- `src/server/scene-rewrite.ts`, `src/server/scene-rewrite.test.ts`
- `src/test/ai-fakes/draft-beats.ts`, `src/test/ai-fakes/scene-rewrite.ts`
- `eval/novel/steps/util.test.ts`

Read-only (do not edit): `src/ai/run.ts` (`runAiTask` line 82, `startAiStream` line 135), `src/ai/types.ts` (`AiTaskDef`), `src/ai/prompt-utils.ts` (`neutralizeDeep`, `TAG_DATA_RULE`), `src/ai/tasks/continuity-check.ts`, `src/server/issues.ts` (`listIssues`, `resolveIssue`), `src/server/chapters.ts` (`saveChapter` line 321, `SaveChapterInput` has `keepHistory`), `src/server/access.ts` (`requireRowWork`, `requireWorkRole`), `src/db/schema.ts` (`issues` has `quoteStart`, `quoteEnd`, `severity`, `wikiExcerpt`, `explanation`, `suggestion`), `src/test/fake-ai.ts`, `src/test/factories.ts`, `src/app/api/works/[workId]/draft/route.ts` (leave it unchanged: it does not pass `twoStep`), `e2e/ai-stub/responders.ts` (unchanged: the app never reaches the new tasks), `eval/novel/metrics.ts`, `eval/novel/fake-author.ts`.

Do NOT change: `DRAFT_SYSTEM` text (pinned by `draft-chapter.test.ts` lines 26-39, `e2e/ai-stub/responders.ts` line 45), the `createChapterFromDraft` rule that the run task is `draft-chapter`, `buildPlan` in `eval/novel/state.ts` (no new step key).

## 4. Design (ordered steps)

Part 1: two-step draft

1. `src/db/types.ts`: append `'draft-beats'` to `AI_TASKS` (Part 1 only; `'scene-rewrite'` is appended in step 10b). `ai_runs.task` is plain text, so no migration.
2. Create `src/ai/tasks/draft-beats.ts`: `DraftBeatsSchema` (zod, no min/max/default, all fields required), `DRAFT_BEATS_SYSTEM` (Korean; exact line order: the intro line, the rule lines, then `TAG_DATA_RULE` as the second-to-last line, then `- 모든 출력은 한국어로 쓴다.` as the final line; the test pins both positions), `renderBeats(beats): string`, a re-export `export { BEATS_RULE } from '@/ai/tasks/draft-chapter'` (the constant itself lives in `draft-chapter.ts`, see step 4), `draftBeatsTask: AiTaskDef<DraftPromptInput, DraftBeats>` (name `'draft-beats'`, effort `'medium'`, maxTokens 4000, `buildPrompt: (input) => buildDraftPrompt({ ...input, beats: null }, { omitTargetLength: true })`, importing `buildDraftPrompt` from `draft-chapter.ts`; do not copy the section list, so the two prompts cannot drift). System rules: split the instructed events into 1-6 scenes in story order; per scene give place, characters present, objects with where they are or who holds them, and the ordered actions (one short sentence each); use only the instructions and `<wiki>`; never invent events; keep names as written in the wiki.
3. `renderBeats` output format (exact, tests pin it): per scene `장면 N` / `장소: X` / `인물: a, b` / `물건: o1; o2` / `순서:` / `1. ...` lines. Empty `scenes` array renders `(없음)`. An empty `characters` renders the line `인물: (없음)`, an empty `objects` renders the line `물건: (없음)` (the line is always kept), and an empty `sequence` renders `순서:` followed by one line `(없음)`. Scenes separated by one blank line. `BEATS_RULE` (defined in `draft-chapter.ts`, step 4) = `위 장면 목록의 장소, 인물, 물건의 위치, 사건 순서를 그대로 지키고 목록에 없는 장소 이동은 쓰지 않는다.`
4. `src/ai/tasks/draft-chapter.ts`: add `beats?: string | null` to `DraftPromptInput`. Export `BEATS_RULE` here (so `draft-chapter.ts` imports nothing from `draft-beats.ts` and there is no import cycle; `draft-beats.ts` imports `buildDraftPrompt`, `BEATS_RULE` and the `DraftPromptInput` type from here). Change the signature to `buildDraftPrompt(raw: DraftPromptInput, options?: { omitTargetLength?: boolean })`: when `omitTargetLength` is true, leave out the `<target_length>` line, nothing else changes. Only when `input.beats` is a non-empty string, append `''`, `<beats>`, `BEATS_RULE`, the beats text, `</beats>` after `</previous_tail>`. Without `beats` and without options the output must equal today's output exactly.
5. `src/server/ai-features.ts` `startDraft`: add optional `twoStep?: boolean` to `input` (default false). After building the pack and style cards, do the following in exactly this order. Today the code builds `const prompt = buildDraftPrompt({...})` before any AI call; change the order exactly like this: (a) `const promptInput: DraftPromptInput = { instructions, targetChars, styleCards, packText: renderContextPack(pack), previousSummary, previousTail, chapterLabel: promptLabel }` (the object currently passed to `buildDraftPrompt`, without `beats`); (b) if `twoStep`, `const beatsRun = await runAiTask(db, { userId: actor.userId, workId, chapterId, signal }, draftBeatsTask, promptInput, client)`; `const beats = beatsRun.output` and `beatsRunId = beatsRun.runId`; if `beats.scenes.length === 0` throw `new AppError('AI_ERROR', '장면 목록을 만들지 못했습니다. 다시 시도해 주세요.')`; (c) only now `const prompt = buildDraftPrompt({ ...promptInput, beats: beats ? renderBeats(beats) : undefined })` (the prose prompt must be built after the beat call, otherwise it never contains `<beats>`); (d) the stream call as before with that `prompt` (task `'draft-chapter'`). Return `{ ...stream, beats, beatsRunId }` (both only set when `twoStep`; type `{ ...stream, beats?: DraftBeats, beatsRunId?: string }`) (extend the declared return type with these two optional fields). A beat-call failure rejects `startDraft` before any prose run exists (no `draft-chapter` row).
6. `src/test/ai-fakes/draft-beats.ts`: `fakeDraftBeats(input)` returns up to 3 scenes built from `input.instructions` split on `[.!?\n]+` (place `'장소 N'`, characters `['등장인물']`, objects `[]`, sequence = that sentence). Always at least 1 scene. Register under `'draft-beats'` in `FAKE_OUTPUTS` (`src/test/ai-fakes/index.ts`).
7. Part 1 localize (draft-beats only; the scene-rewrite parts are step 10b). `eval/novel/localize/en-systems.ts`: add a `DRAFT_BEATS_SYSTEM` English text (no Hangul; include `EN_TAG_DATA_RULE`) to the file and to `EN_SYSTEMS`. `eval/novel/localize/scaffold.ts` `RULES`: put new rules before the bare label rules `'장소'`, `'물건'`: `[/장면 (\d+)/g, 'Scene $1']`, `['인물: ', 'Characters: ']`, `['물건: ', 'Objects: ']`, `['장소: ', 'Place: ']`, `['순서:', 'Sequence:']`, `[BEATS_RULE, '<English translation of the rule>']` (import `BEATS_RULE` from `@/ai/tasks/draft-chapter`; the `BEATS_RULE` rule must come before the shorter rules it contains, such as `'장소'`, `'인물'`, `'물건'`). In `eval/novel/localize/localize.test.ts`: extract the English object literal passed to `buildDraftPrompt` in the `'draft-chapter'` entry (line 298) into a new const `draftSample: DraftPromptInput` declared above `PROMPTS` (it does not exist today; the test has no `promptInput` identifier), use `buildDraftPrompt(draftSample)` for `'draft-chapter'`, and add `'draft-beats': draftBeatsTask.buildPrompt(draftSample)` at the end of the map (otherwise `tsc` fails on the `Record<AiTaskName, string>` and the loops at lines 324-347 call `translateScaffold(undefined)`). Use English-only sample text (no Hangul).
8. `eval/novel/steps/chapter.ts` `draft` step: pass `twoStep: true` to `startDraft`; the closure returns `{ runId, text, beats: run.beats }`; after `writeRunFile(... attempt-N.md ...)` also write `chapters/NN.attempt-N.beats.json` (`JSON.stringify(generated.beats, null, 2)`) when `generated.beats` exists.

Part 2: scene rewrite

9. Create `src/lib/scene.ts` (pure): `sceneRangeAt(text, start, end): SceneRange | null`. A scene break line matches `/^\s*(\*\s*\*\s*\*|\*{3,}|-{3,}|◇+|◆+|#)\s*$/`. If the text has break lines: the scenes are the segments between consecutive break lines, plus the segment before the first break line and the segment after the last break line (so the first and last scenes count and can be rewritten). Every scene range is trimmed: `start` is the first non-whitespace char of the segment and `end` (exclusive) is just after its last non-whitespace char, so the break lines, the blank lines around a marker and the newline before/after are never inside the range. Segments that are empty after trimming are not scenes. Return null when `[start, end)` is not inside one trimmed scene range. If no break line exists: use non-empty lines; take the line holding `start` and the line holding `end - 1`, extend by `SCENE_WINDOW_LINES = 6` lines each way (clamped); the range starts at the first non-whitespace char of the first line and ends just after the last non-whitespace char of the last line. Return null for empty text or offsets outside the text.
10. Create `src/ai/tasks/scene-rewrite.ts`: `SceneRewriteSchema = z.object({ text: z.string() })`, `SCENE_REWRITE_SYSTEM` (Korean, `TAG_DATA_RULE`), `sceneRewriteTask: AiTaskDef<SceneRewriteInput, { text: string }>` (name `'scene-rewrite'`, effort `'medium'`, maxTokens 8000). Prompt sections `<scene>`, `<findings>` (per finding lines `- 문제 문장: …`, `  이유: …`, `  위키: …`, `  제안: …`; omit the 제안 line when empty), optional `<beats>`; use `neutralizeDeep` on the whole input. System rules: rewrite only this scene; fix each finding so it agrees with the wiki sentence; keep event order, dialogue, voice and paragraph breaks everywhere else; add no new events; keep the length close to the original; output only the rewritten scene in `text`. Export `isAcceptableRewrite(original: string, rewritten: string, quotes: string[]): boolean`: true only when `rewritten.trim()` is non-empty, its length is between 0.6x and 1.5x of `original.trim()` length, and for every distinct non-empty quote the number of (non-overlapping) occurrences in `rewritten.trim()` is strictly smaller than in `original.trim()`. A short quote that also appears elsewhere in the scene is therefore fine as long as the rewrite removed at least one occurrence; a quote that is still there as often as before means the finding was not fixed.
10b. Part 2 registration of the new task name (do this in the same commit as step 10, before `tsc` is run): append `'scene-rewrite'` to `AI_TASKS` in `src/db/types.ts`; add a `SCENE_REWRITE_SYSTEM` English text (no Hangul; include `EN_TAG_DATA_RULE`) to `eval/novel/localize/en-systems.ts` and to `EN_SYSTEMS`; in `eval/novel/localize/scaffold.ts` `RULES` add the label rules before the bare label rules: `['문제 문장: ', 'Problem sentence: ']`, `['이유: ', 'Reason: ']`, `['위키: ', 'Wiki: ']`, `['제안: ', 'Suggestion: ']`; in `eval/novel/localize/localize.test.ts` append the entry `'scene-rewrite': sceneRewriteTask.buildPrompt({ sceneText: 'Mina stood at the gate.', findings: [{ quote: 'the gate', explanation: 'The gate was locked.', wikiExcerpt: 'The gate is locked at night.', suggestion: 'Mina waited at the locked gate.' }], beats: null })` at the end of `PROMPTS`.
11. `src/test/ai-fakes/scene-rewrite.ts`: `fakeSceneRewrite(input)` returns `{ text }` = `sceneText` with each finding quote replaced by its `suggestion` (when non-empty and different from the quote) or by the first half of the quote plus `…`. Register under `'scene-rewrite'` in `FAKE_OUTPUTS`.
12. Create `src/server/scene-rewrite.ts` `rewriteFlaggedScenes`. First two lines: `const workId = await requireRowWork(db, 'chapters', input.chapterId)` then `await requireWorkRole(db, workId, actor.userId, 'editor')`. Then `getChapter`. If `input.issueIds` is empty return `{ chapter, rewritten: [], skipped: [] }` without querying. Load the rows with exactly `db.select().from(issues).where(and(inArray(issues.id, input.issueIds), eq(issues.chapterId, chapter.id)))` (drizzle `and`, `inArray`, `eq`; `listIssues` only filters by status, do not use it); an id that is not returned (unknown, or an issue of another chapter) is skipped `'not-found'`. Author validity is enforced here, not trusted from the caller (CLAUDE.md: changes come from author actions): an issue whose `status !== 'accepted'` is skipped `'not-accepted'` (the eval calls `resolveIssue(accepted)` before the rewrite, step 14). Skip (put in `skipped` with a reason), in this order: `'not-found'`, `'not-accepted'`, an issue with an empty `suggestion.trim()` (`'no-suggestion'`; continuity-check leaves `suggestion` empty for thread, timeline and wiki-fix issues, and a rewrite there would have to invent a resolution), null offsets (`'no-span'`), `body.slice(quoteStart, quoteEnd) !== quote` (`'span-mismatch'`), no scene (`'no-scene'`). Group the rest by scene range (sort by start; overlapping ranges merge, findings concatenated, union range). Process at most `input.maxScenes ?? 2` groups (extra groups skipped with `'over-limit'`). Per group call `runAiTask(db, { userId, workId, chapterId, signal }, sceneRewriteTask, { sceneText, findings, beats: input.beats ?? null }, client)`. Findings use the issue row's own `quote`, `explanation`, `wikiExcerpt`, `suggestion` (no new context pack). The check is exactly `isAcceptableRewrite(sceneText, output.text, findings.map((f) => f.quote))` with `sceneText = body.slice(start, end)` (the trimmed scene range); when it returns false every issue of the group is skipped `'rejected'`. Do not catch AI errors: they propagate (the eval retry wrapper needs them). Apply accepted replacements from the last range to the first (`body.slice(0,start) + rewritten.trim() + body.slice(end)`), then one `saveChapter(db, actor, { chapterId, body, expectedVersion: chapter.version, keepHistory: true })` only when the body changed. Never touch wiki tables.
13. `eval/novel/steps/util.ts`: add `pickRewriteIssueIds(items, decisions)`.
14. `eval/novel/steps/chapter.ts` `continuity` step. Let `rewrittenKey = `${key}:rewritten``. The rewrite stage runs AFTER the `resolveIssue` loop (the service only rewrites issues whose status is `accepted`, step 12, so accepting must come first) and BEFORE `mark(ctx, state, key)` and `settle`.
    - Early return: change `if (open.length === 0) { mark; return 'done' }` to `if (open.length === 0 && (isMarked(state, rewrittenKey) || !pendingFor(ctx.dir, key, 'continuity')))`. The pending review is cleared only by `settle`, so a rerun after a crash between the resolve loop and the end of the step still has it, `review` then comes from `pendingFor(...)` (already the first choice in the existing code), `openIds` is empty and the resolve loop skips every decision.
    - After the resolve loop, if `!isMarked(state, rewrittenKey)`: `ids = pickRewriteIssueIds(review.items, answer.decisions)` (no `openIds` filter: an issue accepted on an earlier attempt stays eligible, a dismissed one is never in `ids` and the service would skip it as `'not-accepted'` anyway). If `ids` is non-empty: `body` = `getChapter(...).body`; write `chapters/NN.pre-rewrite.md` (that body) BEFORE calling the service, only when the file does not exist yet; copy `metrics/NN.json` to `metrics/NN.pre-rewrite.json` the same way (only when the target does not exist yet and the source does; this is the baseline for the Section 7 "unchanged vs before" row). Then `const result = await guarded(ctx, state, key, () => rewriteFlaggedScenes(ctx.db, ctx.actor, { chapterId, issueIds: ids }, ctx.client))`.
    - If `result` is null (a content error: `guarded` already recorded it in `state.failed`; other errors are rethrown and pause the run), skip the rewrite writes and still mark. Intended behaviour: the rewrite is not retried on resume.
    - Reconcile rule (crash safety): the service saves the DB body first, the files after. So whenever `chapters/NN.pre-rewrite.md` exists, always (re)write from the current DB body, before marking: `chapters/NN.md`, `metrics/NN.json` = `chapterMetrics(newBody, ctx.config.lang, ctx.bible.targetChars)` (same format as `proofread`), and `rewrites/NN.json` = `{ rewritten, skipped }`, except that `rewrites/NN.json` is written only when `result.rewritten.length > 0` or the file does not exist yet (after a crash between save and file writes, the resumed call skips the scene as `'span-mismatch'` because the body is already rewritten, and that must not overwrite the first call's record). All these writes are idempotent.
    - Then `mark(ctx, state, rewrittenKey)` always. Order matters: with the changed early return the rewrite is reached on a rerun after the resolve loop; the existing `mark(ctx, state, key)` and `settle` stay last.
15. Spec table 7.3: add rows `draft-beats | F13 | medium | { scenes[] }` and `scene-rewrite | F7 | medium | { text }` (Korean cells as in the table).

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
- `draftBeatsTask.system` contains `TAG_DATA_RULE`; prompt contains `<instructions>`, wiki pack text, previous tail, and no `<target_length>`.
- prompt isolation: instructions containing `</instructions>` stay inside one section (same style as `draft-chapter.test.ts` lines 87-112).
- shared sections: `draftBeatsTask.buildPrompt(sample)` equals `buildDraftPrompt(sample, { omitTargetLength: true })` (same wiki and instructions sections, no drift).

`src/ai/tasks/draft-chapter.test.ts` (add; keep existing cases green)
- no `beats` -> output `toBe` a literal expected string pinned in the test: capture it from HEAD BEFORE changing `buildDraftPrompt` (fixed `DraftPromptInput` fixture, full output written out), never by calling the new code; assert it for `beats` omitted, `beats: undefined` and `beats: null`.
- `omitTargetLength: true` -> output equals the pinned string with only the `<target_length>…</target_length>` line removed.
- `beats: '장면 1\n장소: 탑'` -> output contains `<beats>`, `BEATS_RULE`, the beats text, and `<beats>` comes after `</previous_tail>`.
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

`src/server/ai-features.test.ts` (new cases in the draft describe; existing cases stay unchanged and green because `twoStep` defaults off)
- `twoStep: true` -> beat call happens before the prose call (spy on `FakeAiClient.generateObject` and `streamText`), prose prompt contains `<beats>` and a beat line, two `ai_runs` rows: `draft-beats` done and `draft-chapter` done; result has `beats` and `beatsRunId`. The test must drain `textStream` and `await run.done` BEFORE asserting row statuses (`startAiStream` finishes its row only when the stream is consumed; before that the row is `running`).
- `twoStep` omitted -> only one `draft-chapter` row, no `draft-beats` row, prompt has no `<beats>`.
- beat override throws -> `startDraft` rejects with code `AI_ERROR`; no `draft-chapter` row.
- beat override returns `{ scenes: [] }` -> rejects with `AI_ERROR` and the Korean message.
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

`eval/novel/localize/localize.test.ts` already loops `AI_TASKS`, so the two new `EN_SYSTEMS` entries are checked (no Hangul). Add the `PROMPTS` entries described in step 7 (`draft-beats`, Part 1) and step 10b (`scene-rewrite`, Part 2); both are required, or `tsc` and the loops fail. Add one case in Part 1: `translateScaffold(buildDraftPrompt({ ...draftSample, beats: renderBeats(sampleScene) }))` has no Hangul left, where `draftSample` is the const created in step 7 above `PROMPTS` and `sampleScene` is an English `DraftBeats` const defined in the test.

`eval/novel/run.test.ts`: run the existing suite; if a case counts calls per task, `draft-beats` calls now appear because the eval draft step passes `twoStep: true`. Fix the expectation, not the product code. Add one case only if the harness helpers make it cheap: a high-severity continuity override plus fake author -> `chapters/01.pre-rewrite.md` and `rewrites/01.json` exist. Otherwise skip it and say so in the final report.

## 7. Acceptance metrics

| Metric | Current | Target | How measured |
|---|---|---|---|
| Unit tests for the new code | 0 | all listed cases pass | `pnpm vitest run` (section 10) |
| Existing draft tests unchanged and green (`draft-chapter.test.ts` 26-39, `ai-features.test.ts`, `route.test.ts`, `responders.test.ts`) | green | green, edits only additive | vitest |
| Bytes changed outside the rewritten scene | not measured | 0 (first `scene-rewrite.test.ts` case in section 6: scenes 1 and 3 byte-identical) | `scene-rewrite.test.ts` |
| High + author-valid flags that reach the text (post-merge eval, not a DoD gate) | 0% (qwen en C1 caught, not fixed) | 100% of those whose quote is located, scene found, suggestion non-empty and rewrite accepted | `rewrites/NN.json` `rewritten` vs `skipped` counts in a real run. Offline proxy for the DoD: the `scene-rewrite.test.ts` cases plus the `pickRewriteIssueIds` test |
| Rewrites on author-dismissed flags | n/a | 0 | `pickRewriteIssueIds` test and the service `not-accepted` test |
| Reviewer Q2 (post-merge eval, not a DoD gate; manual review, needs 2+ reruns, n=1 chapter each) | qwen ko 2, qwen en 2, haiku 3, luna 3-4 | no run at 2 or below | next eval round reviews, not part of this track's code check. Offline proxy: the `scene-rewrite.test.ts` cases (the fix reaches the text, nothing else changes) |
| T3 lengthOk, T5 foreignRuns, T4 metaHits after rewrite | in `metrics/NN.json` | unchanged vs before | `metrics/NN.json` recomputed by the continuity step, compared with the baseline `metrics/NN.pre-rewrite.json` (step 14) |
| Added calls per chapter | 0 | +1 per draft attempt (beats), +1 per flagged scene, max 2 scenes | `calls/*.json`; local cost per call of about 21-36 min is documented |

## 8. Dependencies on other tracks

- A (length) and B (voice) edit `src/ai/tasks/draft-chapter.ts` and `startDraft`. Keep my edits additive (new optional field, new section appended last) to ease merging. B's voice list may later feed `draft-beats` characters; not in this track.
- H (continuity rules/context) owns `continuity-check.ts` and the issue shape. This track only reads `severity`, `quote`, `quoteStart`, `quoteEnd`, `wikiExcerpt`, `explanation`, `suggestion` from the `issues` row. If H renames them, adapt `src/server/scene-rewrite.ts` only.
- C (foreign script) and HX (harness) touch the same eval draft/continuity code. The rewrite uses only a mark `chN:continuity:rewritten`, never a new plan key, so resume keys of `buildPlan` do not change.
- J/F1 (proofread split) is unaffected: the rewrite runs after proofread, in the continuity step.
- F4 (local serialization) decides how local calls queue. No code dependency.

## 9. Risks

- Local time: each of beats, scene rewrite costs one call of about 21-36 min on qwen. Beats are per draft attempt (up to 3). Do not add re-check calls.
- Timeout: the product limit is 120 s for structured calls (`DEFAULT_AI_TIMEOUT_MS`). `EvalClient` only reports `wouldTimeOut`; the harness overrides the limit. Do not set `timeoutMs` on the new tasks.
- The app route is unchanged (no `twoStep`): beats (120 s) plus stream (280 s) would exceed `maxDuration = 300`. Enabling it in the product needs a separate decision.
- A false-positive flag rewrites correct text. Guard: only author-valid (the service requires issue status `accepted`) + severity `high` + non-empty suggestion, quote span check, `isAcceptableRewrite`, max 2 scenes, history row kept (`keepHistory`), `chapters/NN.pre-rewrite.md` saved.
- The rewritten text is not re-checked by continuity (cost). The only verification is that the quote is gone.
- No-marker text: scene = window of 13 lines, so a rewrite may touch lines unrelated to the finding. Accepted trade-off; the window constant is in one place.
- Prompt injection: every new prompt goes through `neutralizeDeep` and the system has `TAG_DATA_RULE`.
- A crash between the DB save and the file writes is reconciled by the step 14 rule (files are rewritten from the DB body whenever `chapters/NN.pre-rewrite.md` exists).
- `fake-author.ts` marks every item valid, so tests that produce a `high` issue will trigger a rewrite. `fakeContinuity` produces `medium` mostly; check before assuming.

## 10. Open questions (defaults chosen; implement the default)

1. Run the rewrite automatically in the app? Default: no, eval and service only (no route, no UI).
2. Re-check after rewrite? Default: no.
3. "High importance" means `severity === 'high'` only.
4. Is the beat list shown to the author? Default: stored as an `ai_runs` row (`draft-beats`) and as `chapters/NN.attempt-K.beats.json` in the eval; not shown in the draft panel.
5. Which wiki sentences go into the rewrite prompt? Default: the issue's own `wikiExcerpt` only.
6. New version source for a rewrite? Default: none, uses `'save'` with `keepHistory: true`.
7. Does the beat step fall back to one-step on failure? Default: no, it fails (keeps the eval measurement clean).

## 11. Definition of done (commands, all must pass)

```
pnpm vitest run src/ai/tasks src/lib/scene.test.ts src/server/ai-features.test.ts src/server/scene-rewrite.test.ts src/test/fake-ai.test.ts "src/app/api/works/[workId]/draft/route.test.ts" src/lib/draft-stream.test.ts src/components/writing/panels/draft-panel.test.tsx --maxWorkers=2
pnpm vitest run eval/novel e2e/ai-stub --maxWorkers=2
pnpm exec tsc --noEmit   # no errors in the files listed in section 3
pnpm eslint src/ai/tasks src/lib/scene.ts src/lib/scene.test.ts src/server/scene-rewrite.ts src/server/scene-rewrite.test.ts src/server/ai-features.ts src/db/types.ts src/test/ai-fakes eval/novel
pnpm format   # only if the repo formats on commit; do not reformat unrelated files
```
Also confirm `git diff --stat` shows no change to `DRAFT_SYSTEM`, `e2e/ai-stub/responders.ts`, `eval/novel/state.ts`, or the draft route. Final report lists what was skipped (for example the optional `run.test.ts` case).

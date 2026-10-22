# Lean Serial Harness, Stage 2 (author request ledger, context discipline, cache order) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is a dynamic workflow: haiku implements each task (TDD), sonnet reviews it, opus reviews the stage, then the orchestrator measures.

**Goal:** What the author asks once keeps being applied: a request ledger whose active requests go into every writing prompt, code checks that flag where a draft breaks a checkable request, per-entry context tiers and a spoiler lock, and a prompt order that lets the stable part be read from cache.

**Architecture:** A new table `author_directives` holds requests (scope work, character or one chapter; kind style, speech, ban, length or content). AI suggestions are never stored as rows: they live in the plan run's output and become rows only when the author presses a button. Writing prompts are split into a cached prefix (requests, voices, style cards, always-tier entries; then previous summary and tail) and the per-call rest (chapter, length, instructions or plan, mentioned wiki). Clients send the prefix as separate content blocks with cache marks.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite, Vitest, `FakeAiClient`, shadcn on Base UI, novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md` sections 6.3, 6.4 (context and cache), 6.5 item 1 (request checks only), 8 and the stage 2 row of section 9. Earlier plans: `docs/superpowers/plans/2026-10-20-lean-harness-stage0.md`, `docs/superpowers/plans/2026-10-20-lean-harness-stage1.md` (their interfaces are used here).

**Branch:** `feat/lean-harness`. Tasks 1–3 do not touch the plan flow and may start before the M1 decision; tasks 4–8 start after it (reverted stage 1 parts stay reverted; then skip the steps below that touch them).

## Global Constraints

- User-facing copy is Korean, short and plain; the exact strings below are fixed. Identifiers and comments are English.
- Services throw `AppError(code, koreanMessage)`; actions return `ActionResult`. Ledger rows are written only by author actions, each with a `change_log` row in the same transaction (`targetTable: 'author_directives'`). Rows are archived, never deleted.
- AI never writes `author_directives`. The plan task may suggest requests; they stay in `ai_runs.output` until the author adds one.
- No package changes. One migration (`pnpm db:generate` → `drizzle/0006_*.sql`).
- This stage intentionally changes the draft prompt layout for every path (quick and plan). The stage 1 golden test and the `src/ai/speech-off.test.ts` snapshots are updated to the new layout in task 4 and nowhere else. `DRAFT_SYSTEM` and `DRAFT_PLAN_SYSTEM` keep their text except the one `requests` rule added in task 6.
- With no active request, no always-tier entry and speech off, the prompt has no `<author_requests>`, `<core_wiki>` or `<voices>` block (no empty blocks).
- Requests without a prefix (every non-writing task) are sent byte-identically to before on every client.
- English eval runs need every new Korean scaffold string translated (`eval/novel/localize/scaffold.ts` rules and the task samples), with no Hangul left.
- Tests never call a real AI API. New tests go in new files `<name>.<topic>.s2.test.ts(x)`.
- Implementer commands, commit rules and README rule: as in the stage 0 plan.

## Review Focus

1. An archived or `off` request is never sent; a character request is sent only when that character's entry is in this chapter's context (selected, mentioned or always-tier), and not when the entry is archived. Test: tasks 1 and 4.
2. Ban patterns: a Korean dictionary-form phrase matches its inflections (`고개를 끄덕이다` → 끄덕였다, 끄덕이며) and an English word matches its inflections but not other words (`nod` → nods, nodded, nodding; not node). Test: task 1.
3. A failure in the request check or its usage event never fails or changes the stored draft. Test: task 5.
4. Spoiler lock: a fact with reveal chapter 5 is absent from the draft and plan prompts of chapter 4, present from chapter 5, and present in the chapter 4 continuity check. Test: task 2.
5. A request with no prefix is byte-identical on Anthropic (content stays a string) and Responses; with a prefix, an Anthropic request carries at most three cache marks. Test: task 3.

---

## Task 1: Ledger table, services and pure request helpers

**Files:**
- Create: `src/server/directives.ts`, `src/lib/directives.ts`, `drizzle/0006_*.sql` (generated)
- Modify: `src/db/schema.ts` (`authorDirectives`; `wikiEntries.contextTier`; `facts.revealAtPosition` — the two columns are used in task 2 but land in this one migration), `src/db/types.ts` (unions, row type, `CHANGE_TARGETS`, `USAGE_EVENT_KINDS` gains `'directive_added'`, `'directive_violation'`, `ExportPayload.authorDirectives`), `src/server/access.ts` (`RowTable` and `findWorkId` case), `src/server/changes.ts` (snapshot read and `writeRow` cases), `src/server/exports.ts`, `src/server/actions/wiki.ts` (actions), `src/db/schema.test.ts` (`DOMAIN_TABLES`), `src/server/exports.test.ts` (a row in the new table)
- Test: `src/server/directives.s2.test.ts`, `src/lib/directives.s2.test.ts`

**Interfaces:**
- Produces in `src/db/schema.ts`: table `author_directives` — `id` uuid pk, `work_id` (cascade), `entry_id` (→ `wiki_entries`, set null), `scope` text, `kind` text, `text` text, `pattern` text null, `speech_level` text null, `target_chars` integer null, `chapter_position` integer null, `source` text, `status` text default `'active'`, `created_by` text (→ `user.id`, set null, as `chapter_versions.created_by`), `createdAtColumn`, `updatedAtColumn`, `archivedAtColumn()`, index on `work_id`. `wiki_entries.context_tier` text not null default `'mention'`. `facts.reveal_at_position` integer null.
- Produces in `src/db/types.ts`: `DIRECTIVE_SCOPES = ['work','character','chapter']`, `DIRECTIVE_KINDS = ['style','speech','ban','length','content']`, `DIRECTIVE_SOURCES = ['author','instruction','revision','suggested']`, `DIRECTIVE_STATUSES = ['active','off']`, `SPEECH_LEVELS = ['banmal','jondaet']`, `CONTEXT_TIERS = ['always','mention','never']`, their types, `AuthorDirectiveRow`.
- Produces in `src/server/directives.ts`:
  - `type DirectiveInput = { workId: string; scope: DirectiveScope; kind: DirectiveKind; text: string; entryId?: string | null; chapterPosition?: number | null; pattern?: string | null; speechLevel?: SpeechLevel | null; targetChars?: number | null; source: DirectiveSource }`
  - `listDirectives(db, actor, workId, o: { includeArchived?: boolean } = {}): Promise<(AuthorDirectiveRow & { entryName: string | null })[]>` — viewer; active first, then off; each by `createdAt`.
  - `createDirective(db, actor, input: DirectiveInput, o: ChangeOpts = {})`, `updateDirective(db, actor, id, patch: Partial<Omit<DirectiveInput,'workId'|'source'>> & { status?: DirectiveStatus }, o)`, `archiveDirective(db, actor, id, o)` — editor; transaction with `logChange` (`create`/`update`/`archive`); update of an archived row throws `BAD_STATE`.
  - `activeDirectivesFor(db, workId, o: { position: number; entryIds: string[] }): Promise<DirectiveForPrompt[]>` — no actor (callers already checked); `status='active'`, not archived; scope `work`, or `character` with `entryId` in `o.entryIds` and that entry not archived, or `chapter` with `chapterPosition === o.position`; ordered by `createdAt`.
  - Validation (`AppError('VALIDATION', …)`): trimmed text empty → `요청 내용을 적어 주세요.`; over 300 → `요청은 300자까지 적을 수 있습니다.`; `character` without a character entry of this work → `인물을 골라 주세요.`; `chapter` without a position ≥ 1 → `몇 화에 적용할지 골라 주세요.`; `ban` with an empty pattern after defaulting → `쓰지 않을 말을 적어 주세요.`; `speechLevel` set on a non-`character` scope → `말투는 인물 요청에만 정할 수 있습니다.`; `length` without `targetChars` in 500–20000 → `분량은 500자에서 20,000자 사이로 적어 주세요.`. `ban` with no pattern defaults to `banPatternFor(text)`.
  - `createDirective` records `directive_added` (value 1, `extra: { [source]: 1 }`) with the stage 0 `recordUsageEvent`; a recording failure is swallowed.
- Produces in `src/server/actions/wiki.ts`: `listDirectivesAction`, `createDirectiveAction`, `updateDirectiveAction`, `archiveDirectiveAction` in the style-card action pattern (zod `DirectiveFields` with the same limits; `revalidateWork`).
- Produces in `src/lib/directives.ts` (pure):
  - `type DirectiveForPrompt = { id: string; scope: DirectiveScope; kind: DirectiveKind; text: string; pattern: string | null; speechLevel: SpeechLevel | null; targetChars: number | null; chapterPosition: number | null; entryId: string | null; entryName: string | null }`
  - `banPatternFor(text: string): string` — the first quoted span (`'…'`, `"…"`, `‘…’`, `“…”`, `「…」`) or else the whole trimmed text; then, if it ends with `다` and has at least 4 non-space characters, drop its last two characters (`고개를 끄덕이다` → `고개를 끄덕`; `입꼬리` and `심장이 쿵` stay).
  - `matchBan(text: string, pattern: string): number[]` — start offsets. A pattern with Hangul matches as a substring after collapsing runs of whitespace to one space in both. A Latin pattern `p` matches case-insensitively with `\bp(?:s|es|d|ed|ing|Xed|Xing)?\b`, where `X` is `p`'s last letter (doubled consonant), and multi-word patterns keep their inner spaces flexible (`\s+`).
  - `renderRequestsBlock(directives: DirectiveForPrompt[]): string` — `''` for none, else exactly:

```
<author_requests>
작가가 계속 지켜 달라고 한 요청이다. 이번 화 지시와 부딪치면 지시를 따르고, 그 밖에는 모든 장면에서 지킨다.
- [작품 전체] {text}
- [인물 {entryName}] {text} (말투: 반말|존댓말)
- [{n}화만] {text}
- [작품 전체] {text} (쓰지 않을 말: {pattern})
- [작품 전체] {text} (분량: 공백 포함 {targetChars}자)
</author_requests>
```

  (the suffix appears only for that kind or level; texts pass through `neutralizeTags`).

- [ ] **Step 1: Write the failing tests.** `src/lib/directives.s2.test.ts`: `banPatternFor` on `"'고개를 끄덕이다'는 쓰지 않는다."` → `고개를 끄덕`, on `'입꼬리'라는 말은 쓰지 않는다.` → `입꼬리`, on `웃다` → `웃다`; `matchBan` finds 끄덕였다, 끄덕이며 and `고개를  끄덕` (two spaces) for `고개를 끄덕`, finds nods, nodded, Nodding but not node or nodule for `nod`, finds `For a moment` for `for a moment`; `renderRequestsBlock([])` is `''`; a mixed list renders the exact lines above in input order. `src/server/directives.s2.test.ts`: create, update, off, archive each write one `change_log` row with `targetTable 'author_directives'`; every validation message above; a viewer gets `FORBIDDEN` on create and a non-member `NOT_FOUND` on list and create; `activeDirectivesFor` returns work + matching character + matching chapter rows and drops off, archived, other-chapter, other-character and archived-character rows; `createDirective` writes one `directive_added` event and still succeeds when the event insert throws (spy). Export test: the new table appears in the payload. Revert of a `create` change archives the row.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/directives.s2.test.ts src/server/directives.s2.test.ts src/server/exports.test.ts src/db/schema.test.ts --maxWorkers=2`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the schema change, `pnpm db:generate`, then the types, services, actions and helpers above.
- [ ] **Step 4: Run** the same command and `pnpm vitest run src/server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(directives): add the author request ledger`.

## Task 2: Context tiers and the spoiler lock

**Files:**
- Modify: `src/ai/context.ts`, `src/server/wiki.ts` (`createEntry`/`updateEntry` accept `contextTier`), `src/server/facts.ts` (`createFact`/`updateFact` accept `revealAtPosition`), their zod schemas in `src/server/actions/*`
- Test: `src/ai/context.tiers.s2.test.ts`, `src/server/wiki.tiers.s2.test.ts`

**Interfaces:**
- Consumes: the task 1 columns.
- Produces: `buildContextPack` options gain `hideUnrevealed?: boolean` and `splitCore?: boolean`. `ContextPack` gains `core: PackEntry[]` (empty unless `splitCore`).
  - `never` entries are not chosen by mention; they are still chosen through `extraEntryIds`.
  - `always` entries are chosen even when not mentioned. With `splitCore`, they go to `core` in name order until their rendered size reaches `CORE_BUDGET_CHARS = 4000`; the rest stay in `entries`. Core entries are outside the pack budget and are never cut; the pack's cut order is unchanged.
  - With `hideUnrevealed`, a fact with `revealAtPosition > position` is left out (of `core` and `entries`).
- Produces: `renderCoreEntries(pack: ContextPack): string` — the entries in the same format `renderContextPack` uses for `<entries>`, `''` when `core` is empty.
- Produces: `contextTier` in entry create/update (`CONTEXT_TIERS`), `revealAtPosition` in fact create/update (`null` or an integer ≥ 1, else `AppError('VALIDATION', '공개 회차는 1 이상으로 적어 주세요.')`); both appear in `change_log` `before`/`after` like any other field.

- [ ] **Step 1: Write the failing tests:** an unmentioned `always` entry is in `entries` without `splitCore` and in `core` with it; a mentioned `never` entry is absent, and present when passed in `extraEntryIds`; with `splitCore`, core entries past 4000 rendered characters stay in `entries`; a fact with reveal 5 is absent at position 4 with `hideUnrevealed`, present at 5, and present at 4 without the option; `renderCoreEntries` is `''` for an empty core; `updateEntry` with `contextTier: 'always'` logs one change; `updateFact` with `revealAtPosition: 0` throws the message above.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/context.tiers.s2.test.ts src/server/wiki.tiers.s2.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Continuity, extraction and the other existing callers pass neither option, so their output is unchanged except for tiers.
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run src/ai/context.test.ts src/ai/context.r2.test.ts src/server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(context): add context tiers and a reveal chapter for facts`.

## Task 3: Prompt prefix and cache plumbing

**Files:**
- Modify: `src/ai/types.ts`, `src/ai/run.ts`, `src/ai/anthropic.ts`, `src/ai/responses.ts`, `src/ai/ollama.ts`, `src/test/fake-ai.ts`, `eval/novel/eval-client.ts`, `eval/replay-calls.ts`, `eval/probe-gateway.ts`
- Test: `src/ai/prefix.s2.test.ts`, `eval/novel/eval-client.prefix.s2.test.ts`, `eval/probe-gateway.key.s2.test.ts`, the e2e stub test if its parser needs a case

**Interfaces:**
- Produces in `src/ai/types.ts`: `GenerateObjectArgs` and `StreamTextArgs` gain `promptPrefix?: string[]` (0–2 blocks; what the model reads is the blocks, then `prompt`) and `cacheKey?: string`. `AiTaskDef` gains `buildPromptPrefix?(input: I): string[]`.
- Produces in `src/ai/run.ts`: `runAiTask` and `runAiTaskSplit` send `task.buildPromptPrefix?.(input)` (omitted when undefined or empty); `StreamRunArgs` gains `promptPrefix?: string[]`; every call with a `meta.workId` sends `cacheKey: cacheKeyFor(meta.workId)` (none when it is null); `cacheKeyFor(workId: string): string` = `'w' + sha256(workId) hex, first 16 characters` (node `crypto`).
- Anthropic: without a prefix the user `content` stays the plain `prompt` string. With a prefix it is `[...prefix.map((text) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } })), { type: 'text', text: prompt }]`; the JSON-instruction fallback appends to the last block's text. `cacheKey` is not sent.
- Responses: the user content parts are the prefix blocks then the prompt, each `input_text`. `prompt_cache_key: cacheKey` is sent only when `cacheKey` is set and `isPromptCacheKeyEnabled()` (`AI_PROMPT_CACHE_KEY` is `1`/`true`/`on`; default off, exported from `src/ai/responses.ts`).
- Ollama and `FakeAiClient`: the model text is `[...prefix, prompt].join('\n\n')`; `FakeAiClient` also keeps `promptPrefix` in its recorded call.
- `EvalClient`: translates each prefix block with `translateScaffold` on English runs, counts their Hangul in `hangulLeft`, and stores `promptPrefix` on the `CallRecord` only when present. `blindCallRecord` is an allow-list; confirm `promptPrefix` is not copied. `replay-calls` sends a record's `promptPrefix`.
- `probe-gateway --cache-key`: the Responses-path probe also sends `prompt_cache_key: 'daeumhwa-probe'` and reports `cacheKeyAccepted` (true when the request did not fail with a 4xx naming the field, from the response status and body).

- [ ] **Step 1: Write the failing tests:** request-body snapshots (captured `fetch` or SDK spy, as the s0 cache tests do) for Anthropic and Responses with and without a prefix; without a prefix both bodies equal the bodies built before this task for the same args (compare to an inline literal); with two prefix blocks the Anthropic body has exactly three `cache_control` marks (system plus two); `prompt_cache_key` appears only with the env on; `FakeAiClient` exposes `promptPrefix`; `runAiTask` with a task that defines `buildPromptPrefix` passes it and `cacheKey`; EvalClient English run translates a prefix block holding `작품 전체` and records `promptPrefix`; `blindCallRecord` output has no `promptPrefix`; the probe's `cacheKeyAccepted` is false for a 400 whose body names `prompt_cache_key` and true for a 200.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/prefix.s2.test.ts eval/novel/eval-client.prefix.s2.test.ts eval/probe-gateway.key.s2.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run src/ai eval e2e/ai-stub --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): send a cached prompt prefix as separate blocks`.

## Task 4: Writing prompts use the ledger, core entries and the cache order

**Files:**
- Modify: `src/ai/tasks/draft-chapter.ts`, `src/ai/tasks/draft-plan.ts`, `src/ai/tasks/draft-beats.ts`, the `draft-scene` prompt (stage 1 task 4), `src/ai/tasks/scene-rewrite.ts`, `src/ai/tasks/draft-repair.ts`, `src/server/ai-features.ts` (`buildDraftContext`), `src/server/draft-refine.ts`, `src/server/scene-rewrite.ts`, `eval/novel/localize/en/*` and `scaffold.ts`, `src/ai/speech-off.test.ts` (snapshots), the stage 1 golden test
- Test: `src/ai/tasks/draft-chapter.prefix.s2.test.ts`, `src/server/ai-features.ledger.s2.test.ts`, `eval/novel/localize/localize.ledger.s2.test.ts`

**Interfaces:**
- Consumes: tasks 1–3.
- Produces: `DraftPromptInput` gains `requests: DirectiveForPrompt[]` and `coreText: string` (`''` when none).
- Produces: `buildDraftPrefix(input: DraftPromptInput): string[]` returns two blocks:
  - block A, in this order, each part only when non-empty: `renderRequestsBlock(requests)`, the `<voices>` section, `<style_cards>…</style_cards>` (as today), `<core_wiki>\n{coreText}\n</core_wiki>`; parts joined by a blank line;
  - block B: `<previous_summary>…</previous_summary>`, blank line, `<previous_tail>…</previous_tail>` (as today).
- Produces: `buildDraftPrompt(input, options?)` now returns only the rest: `<chapter>`, the length lines, `<instructions>`, `<wiki>`, then `<beats>`, in today's text. `buildContinuationPrompt` keeps appending to it. `draft-chapter`, `draft-continue`, `draft-beats`, `draft-plan` and `draft-scene` define `buildPromptPrefix: buildDraftPrefix`; the streaming draft and scene calls pass `promptPrefix: buildDraftPrefix(promptInput)`.
- Produces: `buildDraftContext` builds the pack with `hideUnrevealed: true, splitCore: true`, sets `coreText = renderCoreEntries(pack)`, and `requests = await activeDirectivesFor(db, workId, { position, entryIds: [...selected entry ids, ...pack entry ids, ...core entry ids] })`. In stage 1's `scenes` mode the plan card's scene characters do not change the set (one set per chapter; builder's call, recorded here).
- Produces: `scene-rewrite`, `draft-repair` and stage 1b's `draft-expand` prompts start with `renderRequestsBlock(requests)` and a blank line when there are requests; their services load `activeDirectivesFor` for the chapter's position and the entries their prompt already names (`draft-expand` reuses the draft's own `requests`).

- [ ] **Step 1: Write the failing tests:** with no requests, empty core and speech off, `buildDraftPrefix` block A is exactly today's `<style_cards>` section and the joined `[...prefix, prompt]` contains every tag of today's prompt once; with requests and core the order is `<author_requests>`, `<voices>`, `<style_cards>`, `<core_wiki>`, then block B; `startDraft` with an active work request, an off request and a character request for an unselected, unmentioned character sends only the first (`FakeAiClient` `promptPrefix`); a request added after the draft started is not in that draft; the plan task receives the same prefix; `draft-repair` receives the requests block; English localization of a prefix with every new line leaves no Hangul. Update the speech-off snapshots and the stage 1 golden test to the new layout, and nothing else in them.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/tasks/draft-chapter.prefix.s2.test.ts src/server/ai-features.ledger.s2.test.ts eval/novel/localize/localize.ledger.s2.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add scaffold rules for `작가가 계속 지켜 달라고 한 요청이다. 이번 화 지시와 부딪치면 지시를 따르고, 그 밖에는 모든 장면에서 지킨다.` (`These are requests the author asked to keep. If one conflicts with this chapter's instructions, follow the instructions; otherwise keep them in every scene.`), `[작품 전체]` (`[Whole work]`), `[인물 X]` (`[Character X]`), `[N화만]` (`[Chapter N only]`), `(말투: 반말)` (`(speech: casual)`), `(말투: 존댓말)` (`(speech: polite)`), `(쓰지 않을 말: X)` (`(do not write: X)`), `(분량: 공백 포함 N자)` (`(length: N characters with spaces)`); extend the draft sample.
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run src/ai src/server eval/novel --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): put author requests and core entries in a cached prefix`.

### Task 4 review fixes (sonnet review, 2026-10-22)

Fix these before the task 4 commit (one commit for task 4 and its fixes).

1. **New chapter position.** `requestsForText` uses the chapter's position when `chapterId` is set. With `chapterId` null (a draft for a new chapter), it uses the position `buildDraftContext` gives that draft (latest position + 1), so the repair of a new-chapter draft keeps its chapter requests. The chapter lookup also filters on `chapters.workId = workId`.
2. **Name matching.** `requestsForText` loads only entries with `archivedAt` null and `contextTier !== 'never'`. It finds names and aliases with the shared mention helper that `buildContextPack` uses (`src/lib/korean/mentions.ts`), not `text.includes`, so a name of one syllable inside another word (`비` in `준비`) does not match.
3. **Repair paths.** `repairDraft` and `repairDraftForeignScript` in `src/server/ai-features.ts` load `requestsForText` for the run's chapter and text and pass `requests` to `draftRepairTask`, as `previewDraftRefinement` does.
4. **System rule (builder's call; this changes the line in Global Constraints that keeps `DRAFT_SYSTEM` as it is).**
   - Why: every writing system prompt ends with `TAG_DATA_RULE`, which tells the model not to follow instructions inside tags. `DRAFT_SYSTEM` names the tags it follows (`<instructions>`, `<wiki>`, `<target_length>` and others), but no system prompt names `<author_requests>`, so the requests could be read as data.
   - Add one rule line before `${TAG_DATA_RULE}` in each system prompt:
     - `DRAFT_SYSTEM`: `- <author_requests>는 작가가 계속 지켜 달라고 한 요청이다. 모든 장면에서 지키고, 이번 화 지시(<instructions>)와 부딪치면 지시를 따른다.`
     - `DRAFT_EXPAND_SYSTEM`: `- <author_requests>가 있으면 늘려 쓰는 문장도 그 요청을 지킨다.`
     - `DRAFT_REPAIR_SYSTEM`: `- <author_requests>가 있으면 고쳐 쓰는 문장도 그 요청을 지킨다.`
     - `SCENE_REWRITE_SYSTEM`: `- <author_requests>가 있으면 다시 쓰는 장면도 그 요청을 지킨다.`
   - English twins go in `eval/novel/localize/en/*`, with the en-systems snapshot updated:
     - `- <author_requests> are requests the author asked to keep. Keep them in every scene; if one conflicts with this chapter's instructions (<instructions>), follow the instructions.`
     - `- If <author_requests> is given, the sentences you add keep those requests too.`
     - `- If <author_requests> is given, the sentences you rewrite keep those requests too.`
     - `- If <author_requests> is given, the rewritten scene keeps those requests too.`
5. **Injection.** `renderRequestsBlock` neutralizes `pattern` as it does `text`, so a pattern holding `</author_requests>` cannot close the block on paths that do not run `neutralizeDeep`. `EXPAND_NOTE_MARKERS` also treats an echoed `<author_requests>` or `</author_requests>` line as a note.
6. **Tests.**
   - `src/server/directives.requests-text.s2.test.ts` covers `requestsForText`:
     - a name and an alias hit;
     - no hit inside another word;
     - an archived entry, a `never` entry and another work's entry give nothing;
     - a chapter request matches by `chapterId`, and a null `chapterId` gives the new chapter position;
     - work requests are always present.
   - A service test checks that `previewDraftRefinement` (or `repairDraft`) and `rewriteFlaggedScenes` send the requests block.
   - The "request added after the draft started" test asserts that no recorded call has `<author_requests>` in its prefix or prompt, and that the expand calls exist.
   - Wiring tests:
     - the continuation call and the scenes-mode calls (scene 0 and later) send `promptPrefix`;
     - an always-tier entry lands in `<core_wiki>`;
     - a fact revealed in a later chapter is hidden;
     - an always-tier character's request is sent although the character is not mentioned.
   - The system rule lines are asserted.

## Task 5: Code checks for checkable requests

**Files:**
- Create: `src/lib/directive-check.ts`
- Modify: `src/server/ai-features.ts` (where the final draft text and its `warnings` are stored: the stream end, `completeDraft`, and stage 1's scenes path), `src/components/writing/panels/draft-panel.tsx`
- Test: `src/lib/directive-check.s2.test.ts`, `src/server/ai-features.check.s2.test.ts`, `src/components/writing/panels/draft-panel.check.s2.test.tsx`

**Interfaces:**
- Produces in `src/lib/directive-check.ts`:
  - `type DirectiveFinding = { directiveId: string; kind: 'ban' | 'speech' | 'length'; count: number; paragraphs: number[] }` (paragraph indexes, first 5)
  - `speechLevelOf(line: string): SpeechLevel | null` — the last sentence of a quoted line (quotes `"` `“ ”` `「 」` `『 』` stripped, trailing `.?!…~` stripped): `jondaet` when it ends in 요, 니다, 니까, 세요, 십시오, 습니까, 죠; `banmal` when it ends in another Hangul syllable; else `null`.
  - `checkDraftDirectives(text: string, directives: DirectiveForPrompt[], names: Record<string, string[]>): DirectiveFinding[]` (`names` maps entry id to name and aliases):
    - `ban`: `matchBan` per paragraph.
    - `speech` with a level: a paragraph counts only when it holds exactly one quoted line, names this character (name or alias) and names no other character from `names`; it is a finding when `speechLevelOf` gives the other level.
    - `length` with `targetChars`: one finding when `draftCharCount(text)` is outside 85–115% of it (`paragraphs: []`).
    - Kinds `style` and `content` and speech requests without a level give nothing (stage 3's check call covers them).
- Produces: the stored draft output gains `directiveFindings: DirectiveFinding[]` (only when non-empty), computed from the requests the draft was sent; a non-empty result records `directive_violation` (value = sum of counts, `extra: { ban, speech, length }`). Both are wrapped so any throw is logged and ignored.
- Produces: the draft panel shows, under the draft when findings exist, the title `요청과 다른 곳` and one line per finding: ban `'{pattern}' {count}곳`, speech `{name}의 말투가 요청과 다른 대사 {count}곳`, length `분량이 요청한 {targetChars}자와 다릅니다`.

- [ ] **Step 1: Write the failing tests:** `speechLevelOf` on `"알겠어요."` → jondaet, `“그만해.”` → banmal, `"…"` → null; a paragraph with two quoted lines or two character names is skipped; a draft with two `입꼬리` gives one ban finding with count 2 and their paragraph indexes; a 4000-character draft with a 5000 length request gives a length finding; `startDraft` stores `directiveFindings` and one `directive_violation` event; when `checkDraftDirectives` is mocked to throw, the draft text and status are stored as without it; the panel renders the three line shapes.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/directive-check.s2.test.ts src/server/ai-features.check.s2.test.ts src/components/writing/panels/draft-panel.check.s2.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run src/server src/components/writing --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): flag where a draft breaks a checkable author request`.

## Task 6: Plan card request suggestions and "앞으로도 이렇게"

**Files:**
- Modify: `src/ai/tasks/draft-plan.ts`, `eval/novel/localize/en/draft-plan.ts` (and the en-systems snapshot), `src/components/writing/panels/draft-plan-card.tsx`, `src/components/writing/panels/draft-panel.tsx`
- Test: `src/ai/tasks/draft-plan.requests.s2.test.ts`, `src/components/writing/panels/draft-plan-card.requests.s2.test.tsx`, `src/components/writing/panels/draft-panel.ledger.s2.test.tsx`

**Interfaces:**
- Consumes: `createDirectiveAction`, `listDirectivesAction` (task 1).
- Produces: `DraftPlanSchema` gains `requests: z.array(z.string().max(120)).max(3).default([])`; `DRAFT_PLAN_SYSTEM` gains one rule line: `requests: 작가 지시나 메모 가운데 이번 화를 넘어 계속 지켜야 할 요청만 한 문장씩 적는다(최대 3개). <author_requests>에 이미 있는 것, 이번 화의 사건, "더 재미있게" 같은 막연한 말은 넣지 않는다. 없으면 []` (English twin: `requests: from the author's instructions or notes, only requests that must be kept beyond this chapter, one sentence each (at most 3). Leave out anything already in <author_requests>, this chapter's events, and vague asks such as "make it more fun". If none, [].`). `renderPlanInstructions` ignores `requests`.
- Produces (UI copy, exact):
  - Plan card section, shown when `requests` is non-empty: title `계속 지킬 요청으로 보이는 것`; per item a button `앞으로도 지키기` that calls `createDirectiveAction({ scope: 'work', kind: 'content', text, source: 'suggested' })` and then shows `장부에 넣었습니다`.
  - Under the plan card's revise note: checkbox `앞으로도 이렇게`; when checked, revising also creates `{ scope: 'work', kind: 'content', text: note, source: 'revision' }`.
  - Under the instruction box: checkbox `이 지시를 앞으로도 지키기`; when checked, either 계획 세우기 or 바로 쓰기 also creates `{ scope: 'work', kind: 'content', text: instructions, source: 'instruction' }`, then unchecks it.
  - A line above the instruction box: `적용 중인 요청 {n}개` with a link `보기` to `/works/{workId}/wiki?tab=requests` (hidden when n is 0).
  - A failed create shows its error with `toast.error` and never blocks the plan or the draft.

- [ ] **Step 1: Write the failing tests:** the schema accepts a plan without `requests` (`[]`) and rejects 4; the system has the rule line; the card renders the section and calls the action with `source: 'suggested'`; checking `앞으로도 이렇게` and revising calls it with `source: 'revision'` and the note; the instruction checkbox calls it once with `source: 'instruction'` and the plan still starts when the action fails; the count line shows `적용 중인 요청 2개` for two active rows.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/tasks/draft-plan.requests.s2.test.ts src/components/writing/panels/draft-plan-card.requests.s2.test.tsx src/components/writing/panels/draft-panel.ledger.s2.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run src/components/writing src/ai/tasks eval/novel/localize --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(plan): suggest lasting requests and keep them in one click`.

## Task 7: Ledger screen, entry tier and fact reveal fields

**Files:**
- Create: `src/components/wiki/directive-list.tsx`
- Modify: `src/app/(app)/works/[workId]/wiki/page.tsx` (tab `requests`), `src/components/wiki/wiki-tabs.tsx`, `src/components/wiki/entry-form.tsx`, `src/components/wiki/fact-form.tsx`
- Test: `src/components/wiki/directive-list.s2.test.tsx`, `src/components/wiki/entry-form.tier.s2.test.tsx`, `src/components/wiki/wiki-tabs.s2.test.tsx`

**Interfaces:**
- Consumes: task 1 actions, task 2 fields.
- Produces: `DirectiveList({ workId, directives, characters, styleCards, canEdit })` — `characters: { id, name, speech: string | null }[]`, `styleCards: { name, rules }[]`.
- Copy (exact):
  - Tab label `요청` (after the style tab).
  - Section `적용 중인 요청`; empty `아직 요청이 없습니다. AI가 계속 지켜야 할 것을 적어 두세요.`; section `꺼 둔 요청` (hidden when empty).
  - Each row: scope badge `작품 전체` / `인물 {name}` / `{n}화만`, kind badge `문체` / `말투` / `쓰지 않을 말` / `분량` / `내용`, the text, buttons `끄기` (or `켜기`) and `보관`.
  - Add form: textarea placeholder `예: 세린은 누구에게나 반말을 한다.`; select `범위` (`작품 전체`, `인물`, `한 회차만`) with a character select or a `회차` number; select `종류`; for `쓰지 않을 말` an input `찾을 말` prefilled from `banPatternFor(text)` and editable; for `말투` a select `정하지 않음` / `반말` / `존댓말`; for `분량` a number `공백 포함 글자 수`; button `요청 추가`.
  - Read-only section `함께 적용되는 문체와 말투`: each style card `{name}: {rules}` and each character with speech `{name}: {speech}`, plus a link `문체 카드 고치기` to `?tab=styles`.
  - Entry form: select `AI 문맥` with `항상 넣기` / `이름이 나오면 넣기` / `넣지 않기`; under the summary field the hint `짧게 쓸수록 AI가 같은 묘사를 덜 반복합니다.`
  - Fact form: number `공개 회차` with the hint `이 회차 전에는 AI 초안에 넣지 않습니다.`
- Viewers see the lists without edit controls.

- [ ] **Step 1: Write the failing tests:** the list renders both sections and badges; the add form sends the chosen scope, kind and fields (ban pattern prefilled from the text and edited); `끄기` sends `status: 'off'`; a viewer sees no buttons; the read-only section lists style rules and speech; the tab list includes `요청`; the entry form sends `contextTier`.
- [ ] **Step 2: Run** `pnpm vitest run src/components/wiki --maxWorkers=2`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/components/wiki --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(wiki): show and edit the author request ledger`.

## Task 8: Eval — ledger planting, cache share and workflow

**Files:**
- Modify: `eval/novel/cli.ts`, `eval/novel/state.ts` (`RunConfig`), `eval/novel/run.ts`, `eval/novel/instructions.ts`, `eval/novel/steps/chapter.ts`, `eval/novel/directives.ts`, `eval/novel/harness-summary.ts`, `eval/novel/steps/finish.ts`, `eval/novel/agents/summary.md`, `.claude/workflows/novel-eval.js`, `docs/eval/novel/README.md`
- Test: `eval/novel/cli.ledger.s2.test.ts`, `eval/novel/run.ledger.s2.test.ts`, `eval/novel/harness-summary.cache.s2.test.ts`, `eval/novel/workflow-static.ledger.s2.test.ts`

**Interfaces:**
- Produces: `--directives` accepts `on` (stage 0, block in ch1 instructions) or `ledger`. `RunConfig` gains `directivesMode?: 'ledger'` (absent means instructions; `directives: true` in both). The dir suffix is `-ledger` instead of `-directives`. A mismatch with an existing run throws as for other flags.
- Produces: in ledger mode `chapterInstructions` appends nothing; before chapter 1's first plan or draft call, `plantLedger(ctx)` creates the probes through `createDirective` as the author user, once (skips when rows with `source: 'author'` and the same text exist):
  - `tic` → kind `speech`, scope `character` with the entry named 도윤서 / Do Yunseo (name or alias) when it exists, else scope `work`
  - `ban-1` → kind `ban`, pattern ko `고개를 끄덕`, en `nod`
  - `ban-2` → kind `ban`, pattern ko `입꼬리`, en `for a moment`
  - `end-dialogue` → kind `style`, scope `work`
  `directives.json` gains `planted: { mode: 'ledger', rows: { id: DirectiveId; scope: DirectiveScope }[] }`. Retention checks are unchanged.
- Produces: `ChapterHarness` gains `cacheReadShare` (sum of `cacheReadTokens` ÷ sum of `inputTokens` over the chapter's calls, 0 when none) and `ledgerChars` (chapter 1 only: the planted texts' characters in ledger mode, else 0); `total` gets the same. Old runs give 0.
- Produces: `ALLOWED_RUN_FLAGS` gains `'--directives ledger'`; `summary.md` gains the column `캐시 읽기 비율` and notes that ledger runs count `ledgerChars` with instruction characters when comparing intervention.

- [ ] **Step 1: Write the failing tests:** `init --directives ledger` stores the mode and the `-ledger` suffix; `--directives ledger` on an existing `on` run throws; a fake ledger run plants four rows once (advancing chapter 1 twice still leaves four), with the tic row scoped to the character when the entry exists and to the work otherwise, and chapter 1's instructions hold no probe text; the draft call's `promptPrefix` contains `<author_requests>` in chapters 1–3; `cacheReadShare` from two records (100 of 400 cached) is 0.25; the workflow allowlist has the new flag.
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/cli.ledger.s2.test.ts eval/novel/run.ledger.s2.test.ts eval/novel/harness-summary.cache.s2.test.ts eval/novel/workflow-static.ledger.s2.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** README: one bullet for `--directives ledger` under the stage 0 flags.
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run eval --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(eval): plant author requests in the ledger and report cache share`.

## Gate S2 (sonnet)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`. Only stale pinned tests are fixed here; defects go back to the owning task.

## Stage review (opus)

- [ ] Review the stage 2 range along: ledger rules (only author actions write rows, change_log, archive, permissions), request selection per chapter and character, ban and speech check false positives on real chapters in `eval/results` (read-only), prompt layout and localization, the prefix on every client and in eval records and replays, and spoiler-lock reach. Each finding goes to an opus skeptic; confirmed ones are fixed with the task procedure, then Gate S2 again.

## Measurement M2 (orchestrator)

Worktree `../DaeumHwa-s2` detached at the reviewed commit, set up as in M0. `D` is the default model picked in M0, `O` the other one.

- [ ] **Cache key probe:** `node --env-file=.env.local --import tsx eval/probe-gateway.ts --model luna-6 --cache-key`. If `cacheKeyAccepted`, run M2 with `AI_PROMPT_CACHE_KEY=on` in the runner environment and record that; else leave it off.
- [ ] **Runs** (flags on every run: `['--deploy-settings', '--directives ledger', '--speech on']`, plan flow as adopted in M1):

  | Invocation | date | chapters | runs |
  |---|---|---|---|
  | A | `2026-10-2x-s2m` | 3 | D ko |
  | B | `2026-10-2x-s2` | 1 | D ko, D en |
  | C | `2026-10-2x-s2r` | 1 | D ko (repeat) |
  | E | `2026-10-2x-s2f` | 1 | D ko with `--few-instructions` |
  | F | `2026-10-2x-s2` | 1 | O ko (separate invocation per model) |

- [ ] **Decide:** the stage 0/1 adoption rule against M1 (chapter 1 of A counts as a comparison run), plus directive retention in chapters 2–3 of A against M0 run D. If the stage fails the rule, run one ablation of A without `--speech on` before reverting anything; revert per feature (ledger in prompts, cache order, speech) by which one the ablation implicates.
- [ ] **If adopted:** `isSpeechStyleEnabled` defaults to on (an unset env means on; `off` turns it off), with its test updated; if the cache key was accepted and the cache share rose, `isPromptCacheKeyEnabled` defaults to on. One commit each.
- [ ] **Results doc (sonnet, Korean):** `docs/eval/harness/2026-10-2x-stage2-ledger.md` — per run the stage 0 columns plus cache share; retention per chapter against M0; the decisions above with numbers.
- [ ] Copy the worktree's `docs/eval/novel/2026-10-2x-s2*/` into the main checkout and commit by name. Remove `../DaeumHwa-s2` after the copy.

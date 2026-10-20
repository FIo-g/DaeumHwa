# Lean Serial Harness, Stage 0 (measurement base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is a dynamic workflow: haiku implements each task (TDD), sonnet reviews it, opus reviews the stage, then the orchestrator runs the measurement.

**Goal:** Measure the round 2 code the way the service actually runs it (per-task effort and limits), with cost, time, author-intervention, must-fix and directive-retention numbers, and start counting the same things in the service.

**Architecture:** Eval-side options and summary blocks (`--deploy-settings`, `--directives on`, `--few-instructions`, a `harness` block), cache and first-token fields in the product's usage records and `ai_runs`, small task-level tools (continuity `--effort`, call replay, gateway probe), and a numbers-only usage event table in the service. Nothing changes what the product sends to a model.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite (migrations allowed), Vitest, `FakeAiClient`, novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md` (sections 6.6, 8 and the stage 0 row of section 9). Research: `docs/superpowers/handoff/2026-10-20-lean-serial-harness/research.md`.

**Branch:** `feat/lean-harness`, created from `feat/ai-improvement-round2` at a6e6515. One working tree, one task at a time.

## Global Constraints

- User-facing copy is Korean, short and plain. Identifiers and comments are English. Eval CLI operator messages may stay English.
- Services throw `AppError(code, koreanMessage)`; actions return `ActionResult`. AI never writes wiki tables.
- No package add/remove/upgrade. `package.json` is not edited. DB migrations are allowed (`pnpm db:generate`, commit the SQL and `drizzle/meta` files it writes).
- Stage 0 changes no prompt and no request body. Every request the product or the eval sends with the new options off is byte-identical to a6e6515.
- New eval options default off. Old saved runs (`eval/results/novel/2026-10-18/*`, `2026-10-19-r2a/*`) still load, `resummarize` and `blind`.
- Blind copies (`eval/novel/blind.ts`) never carry price, cost, settings mode or directive results.
- Usage events store numbers only, never text.
- Tests never call a real AI API. New tests go in new files named `<name>.<topic>.s0.test.ts`; existing tests are changed only where a task says so.
- Implementers run only: `pnpm vitest run <paths> --maxWorkers=2`, `pnpm exec tsc --noEmit` (report own files), `pnpm eslint <files>`, `pnpm exec prettier --write <own files>`, and `pnpm db:generate` in tasks 1 and 9. Never `pnpm format`, `git add -A` or `git add .`; commit files by name; never push.
- Before editing `docs/eval/novel/README.md`, run `pnpm exec prettier --check` on it; add bullets only.

## Review Focus

1. Old runs: `resummarize` over `eval/results/novel/2026-10-19-r2a/run-04-ko` works with no cache fields, no `effortRule`, no new config keys; `harness` is computed with cache tokens 0 and `usd` from the price table. Test: task 4.
2. Blind copies: `effortRule` is absent from `blindCallRecord`; `harness` and `directives` are absent from `blindRunSummary`. Tests: tasks 2 and 4.
3. Anthropic usage: a response with `cache_read_input_tokens`/`cache_creation_input_tokens` adds them to `inputTokens` and fills the cache fields; a response without them gives exactly `{ inputTokens, outputTokens }` as before. Test: task 1.
4. A chapter save never fails because of usage counting (AI text missing, huge, or the update throwing). Test: task 9.
5. Few-instruction runs: the author agent is not asked to judge `mustInclude` items it never gave, so drafts are not rejected for them. Test: task 3.

---

## Task 1: Cache tokens and first-token time in usage and `ai_runs`

**Files:**
- Modify: `src/ai/types.ts` (`AiUsage`), `src/ai/anthropic.ts` (`ResponseUsage`, `usageOf`, `addUsage`), `src/ai/responses.ts` (`usageOf`, `addUsage`), `src/ai/run.ts` (`finishRun`, `startAiStream`), `src/db/schema.ts` (`aiRuns`), `eval/novel/eval-client.ts` (`billedUsageOf` only)
- Create: `drizzle/0004_*.sql` and `drizzle/meta/*` via `pnpm db:generate`
- Test: `src/ai/anthropic.cache.s0.test.ts`, `src/ai/responses.cache.s0.test.ts`, `src/ai/run.cache.s0.test.ts`, `eval/novel/eval-client.cache.s0.test.ts`

**Interfaces:**
- Produces: `AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }`. `inputTokens` is every input token the request processed, cached or not. The cache keys are present only when the provider reported them.
- Produces: `ai_runs.cache_read_tokens` (integer, not null, default 0), `ai_runs.cache_write_tokens` (integer, not null, default 0), `ai_runs.first_token_ms` (integer, nullable). Drizzle names `cacheReadTokens`, `cacheWriteTokens`, `firstTokenMs`.

- [ ] **Step 1: Write the failing tests**
  - `anthropic.cache.s0.test.ts`, test `adds cache reads and writes to input tokens`: a fake SDK `messages.parse` result with `usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 300 }` → `generateObject(...).usage` equals `{ inputTokens: 1300, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 300 }`. Same for a stream final message. Test `keeps the old shape without cache fields`: `{ input_tokens: 100, output_tokens: 50 }` → `toEqual({ inputTokens: 100, outputTokens: 50 })` (no extra keys). Copy the fake-SDK helpers from `src/ai/anthropic.test.ts`.
  - `responses.cache.s0.test.ts`: body `usage: { input_tokens: 1200, output_tokens: 40, input_tokens_details: { cached_tokens: 1024 } }` → `{ inputTokens: 1200, outputTokens: 40, cacheReadTokens: 1024 }`; without `input_tokens_details` → `{ inputTokens: 1200, outputTokens: 40 }`. Copy the fetch stub from `src/ai/responses.test.ts`.
  - `run.cache.s0.test.ts` (`createTestDb`, `FakeAiClient`): `runAiTask` with a fake usage `{ inputTokens: 10, outputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 2 }` → the `ai_runs` row has `cacheReadTokens 7`, `cacheWriteTokens 2`, `firstTokenMs null`. `startAiStream` whose fake stream yields `''` then `'가'` → row `firstTokenMs` is a number ≥ 0 after `done`; a stream that throws before any text → `firstTokenMs null`, status `error`.
  - `eval-client.cache.s0.test.ts`: an inner client throws `new AppError('AI_ERROR', 'x', { usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 2 } })` → the call record `usage` keeps `cacheReadTokens: 2`.
- [ ] **Step 2: Run them and see them fail** — `pnpm vitest run src/ai/anthropic.cache.s0.test.ts src/ai/responses.cache.s0.test.ts src/ai/run.cache.s0.test.ts eval/novel/eval-client.cache.s0.test.ts --maxWorkers=2`. Expected: FAIL (cache keys missing, columns missing).
- [ ] **Step 3: Implement.**
  - Anthropic `usageOf`: `inputTokens = input_tokens + (cache_read_input_tokens ?? 0) + (cache_creation_input_tokens ?? 0)`; set each cache key only when its field is a number in the response (0 included).
  - Responses `usageOf`: `cacheReadTokens` from `input_tokens_details.cached_tokens` when it is a number.
  - Both `addUsage`: sum the cache keys; keep a key when either side has it.
  - `aiRuns`: add the three columns, then `pnpm db:generate` (writes `drizzle/0004_*.sql`). Do not hand-edit the generated SQL.
  - `finishRun`: write `cacheReadTokens`/`cacheWriteTokens` (`?? 0`) on done and error; accept an optional `firstTokenMs`.
  - `startAiStream`: wrap `stream.textStream` in an async generator that records `Date.now() - startedAt` at the first non-empty chunk; pass it to `finishRun` on done and on error. The consumer still receives every chunk unchanged.
  - `billedUsageOf`: return the cache keys too when they are numbers.
  - `getTodayUsage` is not changed (it now counts cached input for Anthropic, which is intended).
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/ai src/db eval/novel/eval-client --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add` the four tests, the six source files, `drizzle/0004_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0004_snapshot.json`; message `feat(ai): record cache tokens and first-token time per run`.

## Task 2: Deploy-setting eval mode (`--deploy-settings`)

**Files:**
- Modify: `eval/novel/eval-client.ts` (`EvalClientOptions`, `CallRecord`, `Prepared`, `prepare`, `generateObject`, `streamText`, `settle`), `eval/novel/state.ts` (`RunConfig`), `eval/novel/run.ts` (`RunCreateOptions`, `createRun`, `openRun`), `eval/novel/cli.ts` (`InitOptions`, `initRun`, `dispatch` case `'init'`), `eval/novel/blind.ts` (`blindCallRecord`), `eval/novel/models.ts` (comment on `maxTokensFloor` and `effort`), `docs/eval/novel/README.md` (one bullet in the init-options list)
- Test: `eval/novel/eval-client.deploy.s0.test.ts`, `eval/novel/cli.deploy.s0.test.ts`, `eval/novel/blind.deploy.s0.test.ts`

**Interfaces:**
- Produces: `RunConfig.deploySettings?: boolean`; `EvalClientOptions.deploySettings?: boolean`; `CallRecord.effortRule?: 'profile' | 'task'`; `deploySettingsFlag(flags: Flags): boolean | undefined` exported from `cli.ts`.

- [ ] **Step 1: Write the failing tests**
  - `eval-client.deploy.s0.test.ts`: with `deploySettings: true` and a spy inner client, an object call made with task `effort: 'medium'`, `maxTokens: 4000` reaches the inner client with `effort: 'medium'`, `maxTokens: 4000`; the record has `effortRule: 'task'`, `maxTokensRule: 'product'`, `effortRequested: 'medium'`. A stream call with `effort: 'high'`, `maxTokens: 16000` reaches it as `'high'`/16000. Without the option the same object call reaches it with the profile's effort and `max(4000, floor)`, and the record has `effortRule: 'profile'`. Copy helpers from `eval/novel/eval-client.m4.r2.test.ts`.
  - `cli.deploy.s0.test.ts`: `init --model fake --lang ko --deploy-settings` writes `config.json` with `deploySettings: true` and `productLimits: true`; the default dir ends with `-deploy`; `deploySettingsFlag({ 'deploy-settings': 'off' })` is `false`, `'maybe'` throws; `--deploy-settings --helper-think low` throws `--deploy-settings cannot be combined with --helper-think`; re-running `init` on that dir without the flag throws `run exists with another deploySettings`. Copy temp-dir helpers from `eval/novel/cli.m4.r2.test.ts`.
  - `blind.deploy.s0.test.ts`: `blindCallRecord` output has no `effortRule` key.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Under `deploySettings`, `prepare` uses the task's effort and the task's maxTokens (the `--product-limits` path); `openRun` passes `config.deploySettings` to the client; `createRun` stores `deploySettings: true` and `productLimits: true` together. Every new record gets `effortRule`. Dir suffix order: existing suffixes, then `-deploy`. README bullet (Korean): `--deploy-settings`: 서비스와 같은 작업별 effort와 출력 한도로 보낸다. 단계 0 이후 비교는 모두 이 모드로 한다.
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run eval/novel --maxWorkers=2`.
- [ ] **Step 5: Commit** — files by name; `feat(eval): add --deploy-settings to send the task's own effort and limits`.

## Task 3: Chapter instructions — directive probes and few-instruction mode

**Files:**
- Create: `eval/novel/instructions.ts`, `eval/novel/directives.ts`
- Modify: `eval/novel/steps/chapter.ts` (`chapterSpec` callers: draft instructions, `selectDraftEntries`, the `draft_review` pending, the advice step's `nextInstructions`), `eval/novel/steps/finish.ts` (write `directives.json`, add the `directives` summary block), `eval/novel/state.ts`, `eval/novel/run.ts`, `eval/novel/cli.ts` (flags, dir suffixes, existing-run checks), `docs/eval/novel/README.md` (two bullets)
- Test: `eval/novel/instructions.s0.test.ts`, `eval/novel/directives.s0.test.ts`, `eval/novel/cli.instructions.s0.test.ts`, `eval/novel/steps/finish.directives.s0.test.ts`, `eval/novel/run.few.s0.test.ts`

**Interfaces:**
- Produces: `RunConfig.directives?: boolean`, `RunConfig.fewInstructions?: boolean`.
- Produces: `chapterInstructions(bible: Bible, n: number, o: { lang: 'ko' | 'en'; directives?: boolean; fewInstructions?: boolean }): string` and `firstSentence(text: string): string` in `instructions.ts`.
- Produces in `directives.ts`: `type DirectiveId = 'tic' | 'ban-1' | 'ban-2' | 'end-dialogue'`, `type DirectiveStatus = 'kept' | 'broken' | 'n/a'`, `DIRECTIVE_PROBES: Record<'ko' | 'en', { id: DirectiveId; text: string }[]>`, `directiveBlock(lang): string`, `checkDirectives(text: string, lang): { id: DirectiveId; status: DirectiveStatus }[]`.
- Produces: `<run>/directives.json` = `{ lang, chapters: { n: number; results: { id; status }[] }[] }` and run-summary block `directives: { chapters: { n: number; kept: number; broken: number; na: number }[] }`, both only when `config.directives`.

The probes (exact text; they do not overlap the bible's style rules):

| id | ko text | en text | check |
|---|---|---|---|
| tic | `도윤서는 대화를 마칠 때 꼭 "조심하십시오."라고 말한다.` | `Do Yunseo always ends a conversation by saying "Watch your step."` | `n/a` when neither name (`도윤서`, `윤서` / `Do Yunseo`, `Yunseo`) appears; else `kept` when the text contains `조심하십시오` / `watch your step` (case-insensitive), else `broken` |
| ban-1 | `'고개를 끄덕이다'는 쓰지 않는다.` | `Never use the word "nod" (nod, nods, nodded, nodding).` | `broken` on `/고개[를만도]?\s*(?:[^\s.!?…"“”]{1,4}\s+){0,2}(끄덕\|주억)/` (up to two short words between 고개 and 끄덕; 끄떡없었다 is kept) / `/\bnod(s\|ded\|ding)?\b/i`, else `kept` |
| ban-2 | `'입꼬리'라는 말은 쓰지 않는다.` | `Never use the phrase "for a moment".` | `broken` on `입꼬리` / `/\bfor a moment\b/i`, else `kept` |
| end-dialogue | `회차는 인물의 대사 한 줄로 끝낸다.` | `End each chapter on a single line of dialogue.` | last non-empty line, trimmed: `kept` when it starts with one of and ends with one of the language's quote marks, else `broken`. ko: openers `“ " 「 『`, closers `” " 」 』` (single quotes are inner thoughts, not dialogue). en: openers `“ " 「 『 ‘ '`, closers `” " 」 』 ’ '`. An end punctuation mark may sit inside the quote. |

`directiveBlock('ko')` = `앞으로 모든 회차에서 지켜 주세요.` + one `- <text>` line per probe; `directiveBlock('en')` = `Keep these in every chapter from now on:` + the same lines.

- [ ] **Step 1: Write the failing tests**
  - `instructions.s0.test.ts` (load `eval/fixtures/novel/{ko,en}/bible.json` through the existing bible loader): full mode ch1 equals the bible text; `firstSentence` of ko ch1 is `입춘 아침, 고아원 심부름으로 종루에 빨래를 배달하러 간 한세린이 처음으로 9층 꼭대기까지 올라간다.`; of en ch1 is `On the first morning of spring, Han Serin, sent by the orphanage to deliver laundry to the bell tower, climbs all the way to the top of the nine-story tower for the first time.`; `directives: true` appends `\n\n` + `directiveBlock(lang)` to ch1 only (ch2 equals the bible text); few + directives on ch1 is the first sentence plus the block.
  - `directives.s0.test.ts`: one kept and one broken case per probe per language, the `n/a` case for `tic`, and an ending `"…조심하십시오."` that is kept for both `tic` and `end-dialogue`. A last line `세린은 대답하지 않았다.` is `broken` for `end-dialogue`.
  - `cli.instructions.s0.test.ts`: `--directives on` stores `directives: true`, a bare `--directives` throws; `--few-instructions` (bare or `on`) stores `fewInstructions: true`; dir suffixes `-directives` and `-few`; reopening with a different value throws.
  - `finish.directives.s0.test.ts`: a run dir with `chapters/01.md` (ending in narration, containing `입꼬리`) and `config.directives` → `directives.json` and the summary block `{ chapters: [{ n: 1, kept: 1, broken: 2, na: 1 }] }` (tic `n/a`, ban-1 kept, ban-2 broken, end broken). Without `config.directives` neither exists.
  - `run.few.s0.test.ts` (fake profile, `--fake-author`, as in `eval/novel/run.speech-off.test.ts`): in a few-instruction run the `draft_review` pending carries `mustInclude: []` and `instructions` equal to `firstSentence(...)`; in a full run it carries the bible's list.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** `chapter.ts` calls `chapterInstructions(ctx.bible, n, ctx.config)` wherever it used `spec.instructions`; `mustInclude` in the pending is `[]` when `fewInstructions`. The chapter text checked is the saved final `chapters/NN.md`. README bullets (Korean): `--directives on`: 1화 지시에 시험용 작가 요청 4개를 한 번만 넣고 회차마다 지켰는지 센다(`directives.json`). `--few-instructions`: 회차 지시를 설정집 지시의 첫 문장만 준다.
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run eval/novel --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(eval): plant author directives and add a few-instruction mode`.

## Task 4: Chapter cost, time and intervention block (`harness`)

**Files:**
- Create: `eval/novel/harness-summary.ts`
- Modify: `eval/novel/models.ts` (`ModelPrice`, `ModelProfile.price?`, values for `haiku-5.5` and `luna-6`), `eval/novel/steps/finish.ts` (`RunSummarySchema.harness` optional, `buildRunSummary`), `eval/novel/blind.ts` (`blindRunSummary` drops `harness` and `directives`), `docs/eval/novel/README.md` (one bullet in the summary section)
- Test: `eval/novel/harness-summary.s0.test.ts`, `eval/novel/blind.harness.s0.test.ts`, `eval/novel/steps/finish.harness.s0.test.ts`

**Interfaces:**
- Consumes: `AiUsage` cache keys (task 1), `RunConfig.deploySettings` (task 2), `chapterInstructions` (task 3).
- Produces: `type ModelPrice = { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok: number; cacheWritePerMTok: number; source: string }`. Both cloud profiles: `0.10`, `0.50`, `0.01`, `0.125`, source `'official pricing pages, 2026-10-20'`. Local and fake profiles have no price.
- Produces: `callCostUsd(usage: AiUsage, price: ModelPrice): number` and `harnessSummary(records: CallRecord[], o: HarnessInput): HarnessSummary` where
  ```ts
  type HarnessInput = { chapters: number; drafts: Record<number, DraftAttempt[]>; instructions: (n: number) => string; price?: ModelPrice; settings: 'deploy' | 'eval' }
  type ChapterHarness = { n: number; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; usd: number | null; firstCharMs: number | null; writeMs: number; afterSaveMs: number; totalMs: number; regenerations: number; instructionChars: number }
  type HarnessSummary = { settings: 'deploy' | 'eval'; priceSource: string | null; chapters: ChapterHarness[]; interview: { calls: number; inputTokens: number; outputTokens: number; usd: number | null; totalMs: number }; total: { calls: number; usd: number | null; totalMs: number } }
  ```

Rules (the design's time definitions, section 6.6):
- Cost: `uncached = max(0, inputTokens − cacheRead − cacheWrite)`; `usd = (uncached·in + cacheRead·cacheReadPrice + cacheWrite·cacheWritePrice + outputTokens·out) / 1e6`. A failed call counts its billed usage and its duration.
- A chapter's calls: `step` starts with `ch<n>:`. Write calls: `step` is `ch<n>:draft` or starts with `ch<n>:draft:`. `writeMs` sums write-call durations; `afterSaveMs` sums the chapter's other calls; `totalMs` both.
- `firstCharMs`: take the write calls in `seq` order; find the first `task === 'draft-chapter'` stream record; sum `durationMs` of the write calls before it except `task === 'draft-plan'` (the stage 1 plan call, which the design times separately), then add its `firstTokenMs`. `null` when there is no such record or its `firstTokenMs` is null.
- `regenerations = max(0, drafts[n].length − 1)`. `instructionChars = Array.from(instructions(n)).length`.
- Interview calls: `step === 'interview'` or starts with `interview`. `total` covers every record.

- [ ] **Step 1: Write the failing tests**
  - `harness-summary.s0.test.ts`: `callCostUsd({ inputTokens: 10000, outputTokens: 2000, cacheReadTokens: 4000, cacheWriteTokens: 1000 }, HAIKU_PRICE)` is `0.001665` (`toBeCloseTo(0.001665, 9)`). A chapter with records `ch1:draft` draft-beats 3000 ms, `ch1:draft` draft-chapter stream 20000 ms with `firstTokenMs` 1200, `ch1:draft` draft-continue 8000 ms, `ch1:proofread` proofread 5000 ms → `firstCharMs` 4200, `writeMs` 31000, `afterSaveMs` 5000, `totalMs` 36000. The same without beats → `firstCharMs` 1200. A `draft-plan` record of 2500 ms before the stream does not change `firstCharMs`. `drafts: { 1: [a, b] }` → `regenerations` 1. No price → every `usd` is `null` and `priceSource` `null`.
  - `finish.harness.s0.test.ts`: `resummarize` (or `buildRunSummary`) over a copy of `eval/results/novel/2026-10-19-r2a/run-04-ko` when it exists (skip otherwise, `it.skipIf`) gives `harness.chapters[0].calls > 0`, `cacheReadTokens` 0, `usd > 0`, `settings` `'eval'`. Also a synthetic run dir from the test's own records.
  - `blind.harness.s0.test.ts`: `blindRunSummary({ harness: {...}, directives: {...}, calls: {...} })` has no `harness` or `directives` key and keeps `calls`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** `harness-summary.ts`, the price table, the optional schema block, and the blind drop. `settings` is `'deploy'` when `config.deploySettings`, else `'eval'`. README bullet (Korean): `harness`: 회차별 비용(달러), 본문 첫 글자까지 시간, 쓰기 시간, 저장 뒤 시간, 호출 수, 다시 쓰기 수, 지시 글자 수.
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run eval/novel --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(eval): summarize chapter cost, time and author intervention`.

## Task 5: Must-fix count in reviews

**Files:**
- Modify: `eval/novel/agents/reviewer.md` (a new per-chapter list and the verdict key), `docs/eval/novel-quality-criteria.md` (a new subsection defining must-fix), `eval/novel/review-verdict.ts` (`chapterSchema.mustFix` optional; `ReviewGateResult.mustFix`)
- Test: `eval/novel/review-verdict.mustfix.s0.test.ts`, `eval/novel/agents.mustfix.s0.test.ts`

**Interfaces:**
- Produces: verdict chapter key `mustFix: number` (integer ≥ 0, optional so old reviews parse); `reviewGate(runDir)` result gains `mustFix: number | null` (sum over chapters, `null` when any chapter lacks it).

Definition to add to the criteria doc (Korean, section 3.6 `작가가 반드시 고칠 곳`) and to `reviewer.md` (in the review's language):
- One place is one sentence or one paragraph that a working web-novel author would surely rewrite before publishing. Count each place once even if it has several problems.
- Counted: a contradiction with the bible or approved wiki, a wrong name; a broken or ungrammatical sentence (not a typo the spelling checker would catch); speech that does not fit the character's set voice; meta text or foreign script; a violation of the chapter instruction other than a missing `mustInclude` item (T1 counts those); a key moment summarized instead of shown; a repeat of an earlier beat or sentence with no new information.
- Not counted: taste-level style choices, things the reviewer would merely like better.
- The reviewer lists each place under a heading `작가가 반드시 고칠 곳` / `Places the author must fix` with the exact quote and a one-line reason, and writes the count as `mustFix` in the verdict block.

- [ ] **Step 1: Write the failing tests** — a verdict block with `"mustFix": 4` parses and keeps 4; one without it parses (old reviews); `-1` and `1.5` fail; `reviewGate` returns `mustFix` 4 for one chapter, `null` when absent. The agents test asserts `reviewer.md` contains `작가가 반드시 고칠 곳`, `Places the author must fix` and `"mustFix"`, and the criteria doc contains `3.6`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run eval/novel --maxWorkers=2` (the existing agents and verdict tests must still pass).
- [ ] **Step 5: Commit** — `feat(eval): count the places an author must fix in each review`.

## Task 6: Workflow per-run init flags and summary columns

**Files:**
- Modify: `.claude/workflows/novel-eval.js` (`runs[i].flags`, `runnerPrompt`, `meta.description`, the summary agent prompt), `eval/novel/agents/summary.md` (new columns)
- Test: `eval/novel/workflow-static.flags.s0.test.ts`

**Interfaces:**
- Consumes: init flags from tasks 2 and 3; `harness` (task 4); `mustFix` (task 5); `directives` (task 3).
- Produces: workflow arg `runs: { model, lang, flags?: string[] }[]`. Allowed flags exactly: `--deploy-settings`, `--directives on`, `--few-instructions`, `--product-limits`, `--speech on`, `--two-step on`, and `--helper-think <off|low|medium|high>`. Anything else makes the workflow return `{ error: 'unknown flag: <flag>' }` before any agent starts.

- [ ] **Step 1: Write the failing test** (static, reading the script text, as in `eval/novel/workflow-static.test.ts`): the allowlist array appears; `runnerPrompt` interpolates the run's flags after `--dir ${dir}` in the init command; the description mentions `flags`; `summary.md` mentions `harness`, `firstCharMs`, `mustFix` and `directives`.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.** Summary columns to add in `summary.md` (Korean table headers): 한 화 비용(달러, `harness.chapters[].usd`), 본문 첫 글자(초, `firstCharMs`), 쓰기 시간(초, `writeMs`), 저장 뒤 시간(초, `afterSaveMs`), 고칠 곳(1,000자당, verdict `mustFix` / `chars` × 1000), 요청 준수(회차별 kept/(kept+broken), `directives`). Leave a cell `—` when the block is absent (older runs).
- [ ] **Step 4: Run the test and see it pass**, plus `pnpm vitest run eval/novel/workflow-static --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(eval): pass per-run init flags and report cost, time and must-fix`.

## Task 7: Task-level effort tools

**Files:**
- Modify: `eval/run-continuity.ts` (`--effort`; output keys `effort`, `model`)
- Create: `eval/effort-client.ts` (`withEffort`), `eval/replay-calls.ts` (CLI), `eval/replay-compare.ts` (pure)
- Test: `eval/effort-client.s0.test.ts`, `eval/replay-compare.s0.test.ts`, `eval/replay-calls.s0.test.ts`

**Interfaces:**
- Produces: `withEffort(client: AiClient, effort: AiEffort): AiClient` — same provider and model; every `generateObject`/`streamText` call is passed through with `effort` replaced.
- Produces: `compareExtraction(ref: Extraction, out: Extraction): { refFacts: number; facts: number; matchedFacts: number; refThreads: number; threads: number; matchedThreads: number }`. A fact matches when `bigramDice(normalizeForCompare(a.content), normalizeForCompare(b.content)) >= 0.6` (from `src/ai/guards/similarity.ts`) and the subject names are equal after `normalizeForCompare`; a thread matches on `title` with the same Dice rule. Each reference item matches at most once (greedy, best score first).
- Produces: `replayCalls(o: { runs: string[]; task: 'chapter-extract'; effort: AiEffort; client: AiClient; model: string }): Promise<ReplayReport>`; the CLI `node --env-file=.env.local --import tsx eval/replay-calls.ts --run <dir> [--run <dir>…] --task chapter-extract --model <haiku-5.5|luna-6> --effort <low|medium|high>` writes `eval/results/replay/<ISO stamp>-<task>-<model>-<effort>.json` = `{ task, model, effort, createdAt, items: { source, usage, durationMs, output, error?, compare }[], totals: { outputTokens, inputTokens, durationMs } }`. It re-sends each saved `calls/*-chapter-extract.json` record's `system` and `prompt` with `ExtractionSchema`, the record's `taskMaxTokens` (fallback 16000) and the given effort; `compare` is `compareExtraction(record.output, newOutput)`.
- `run-continuity.ts --effort <low|medium|high>` wraps the client with `withEffort`; an invalid value throws `--effort 값이 올바르지 않습니다: <v>`; without the flag the output has `effort: 'task'`.

- [ ] **Step 1: Write the failing tests** — `withEffort` replaces effort for both methods and leaves every other arg identical (spy client); `compareExtraction` on two hand-made extractions (3 ref facts, 2 matching with different wording and the same subject, 1 with another subject) gives `matchedFacts: 2`; one ref fact never matches two outputs; `replayCalls` over a temp run dir with two saved records and a `FakeAiClient` returns two items with the requested effort recorded and `compare` filled.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** The CLI builds the client with `createModelClient` for the profile id (`eval/novel/models.ts`).
- [ ] **Step 4: Run the tests and see them pass.**
- [ ] **Step 5: Commit** — `feat(eval): replay saved calls and run continuity at a chosen effort`.

## Task 8: Gateway cache and batch probe

**Files:**
- Create: `eval/probe-gateway.ts`
- Test: `eval/probe-gateway.s0.test.ts`

**Interfaces:**
- Produces: `probeCache(client: AiClient, o: { model: string; system: string; repeats: number }): Promise<{ calls: { usage: AiUsage; durationMs: number }[]; cacheHit: boolean }>` — sends the same `streamText` request `repeats` times in sequence (task name `draft-chapter`, prompt `한 문장으로만 답하세요: 1 더하기 1은?`, effort `low`, maxTokens 200); `cacheHit` is true when any call after the first has `cacheReadTokens > 0`.
- Produces: `probeBatch(fetchImpl: typeof fetch, o: { urls: string[]; apiKey: string }): Promise<{ url: string; status: number | null; note: string }[]>` — one `GET` per URL with the same auth headers `src/ai/opencode.ts` uses, recording only the status and the first 200 characters of the body as `note`; a network error gives `status: null`.
- CLI: `node --env-file=.env.local --import tsx eval/probe-gateway.ts --model <haiku-5.5|luna-6>`. System text: the ko bible JSON (`eval/fixtures/novel/ko/bible.json`) stringified, at least 2,048 tokens. Batch URLs: `${OPENCODE_BASE_URL}/v1/messages/batches` and `${OPENCODE_OPENAI_BASE_URL}/batches`. Writes `eval/results/probe-gateway-<model>-<ISO stamp>.json`.

- [ ] **Step 1: Write the failing tests** — a stub client whose second call reports `cacheReadTokens: 1800` gives `cacheHit: true`; all zeros gives false; `probeBatch` with a stub fetch returning 404 and one throwing gives `[{status: 404}, {status: null}]`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** No request is sent at import time; only the CLI entry calls the network.
- [ ] **Step 4: Run the tests and see them pass.**
- [ ] **Step 5: Commit** — `feat(eval): probe whether the gateway passes cache and batch`.

## Task 9: Service usage counts (numbers only) and the notice

**Files:**
- Modify: `src/db/schema.ts` (`aiUsageEvents`), `src/db/types.ts` (`USAGE_EVENT_KINDS`, `UsageEventKind`), `src/server/ai-features.ts` (`startDraft`, `createChapterFromDraft`), `src/server/chapters.ts` (`saveChapter`), `src/server/actions/ai-features.ts` (new `recordDraftUseAction`), `src/components/writing/panels/draft-panel.tsx` (append button calls the action; notice line)
- Create: `src/server/usage-events.ts`, `drizzle/0005_*.sql` via `pnpm db:generate`
- Test: `src/server/usage-events.s0.test.ts`, `src/server/ai-features.usage.s0.test.ts`, `src/server/chapters.usage.s0.test.ts`, `src/components/writing/panels/draft-panel.usage.s0.test.tsx`

**Interfaces:**
- Produces table `ai_usage_events`: `id uuid pk default random`, `work_id uuid not null → works (cascade)`, `user_id text not null → user (cascade)`, `chapter_id uuid → chapters (set null)`, `run_id uuid → ai_runs (set null)`, `kind text not null`, `value real not null default 0`, `extra jsonb $type<Record<string, number>> not null default {}`, `created_at`; index `(work_id, kind, created_at)`.
- Produces `USAGE_EVENT_KINDS = ['draft_started', 'draft_used', 'draft_edit_ratio'] as const` (stages 1–3 add kinds).
- Produces in `usage-events.ts`:
  - `recordUsageEvent(db: Db, actor: Actor, input: { workId: string; chapterId?: string | null; runId?: string | null; kind: UsageEventKind; value: number; extra?: Record<string, number> }): Promise<void>` — `requireWorkRole(…, 'editor')` first; a `chapterId` that is missing or belongs to another work throws `NOT_FOUND`; validates `extra` with `z.record(z.string(), z.number())`.
  - `recordDraftUse(db, actor, input: { workId: string; chapterId: string; runId: string; priorChars: number }): Promise<void>` — reads the run's `output.text` length, records `draft_used` with `value` = AI chars and `extra: { mode: 1, priorChars }` (`mode` 0 = new chapter, 1 = appended).
  - `updateDraftEditRatio(db: Db, workId: string, chapterId: string, body: string): Promise<void>` — finds the latest `draft_used` event of the chapter in that work with `extra.priorChars === 0`; loads that run's `output.text`; skips when either text is longer than 40,000 characters or the text is missing; `ratio = (inserted + deleted) / max(1, aiChars)` from `diffStats(diffTexts(aiText, body, 'words'))`; updates the chapter's single `draft_edit_ratio` row or inserts it (`value` = ratio, `extra: { aiChars, bodyChars }`).
  - Event value meanings: `draft_started` value = instruction characters, `extra: { targetChars }`.
- `recordDraftUseAction({ workId, chapterId, runId, priorChars })` in `src/server/actions/ai-features.ts`, zod-parsed, through `withAction`.

- [ ] **Step 1: Write the failing tests**
  - `usage-events.s0.test.ts`: a member records an event; a non-member gets `NOT_FOUND`; `extra: { note: 'x' }` (cast) is rejected; `updateDraftEditRatio` after a `draft_used` with `priorChars 0` on AI text `세린은 문을 열었다. 안개가 들어왔다.` and body `세린은 문을 활짝 열었다. 안개가 들어왔다.` writes one row with `0 < value < 1`; a second call updates the same row (count stays 1); `priorChars 5` writes nothing; a missing run writes nothing.
  - `ai-features.usage.s0.test.ts`: `startDraft` with instructions `종이 떤다` (5 characters) records `draft_started` value 5 and `extra.targetChars`; `createChapterFromDraft` records `draft_used` with `extra.mode 0` and `extra.priorChars 0` for the new chapter.
  - `chapters.usage.s0.test.ts`: `saveChapter` resolves and saves the body when `updateDraftEditRatio` throws (`vi.spyOn` on the module export, or a test seam the implementer adds); the ratio row is updated after a normal save of a chapter created from a draft.
  - `draft-panel.usage.s0.test.tsx` (`// @vitest-environment jsdom`): the panel shows exactly `초안 품질을 높이려고 초안을 쓴 횟수와 고친 글자 비율 같은 숫자만 셉니다. 원고 내용은 모으지 않습니다.`; clicking "현재 원고 끝에 붙이기" calls `recordDraftUseAction` with `priorChars` = the current manuscript length (`api.getText()`).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** `saveChapter` keeps its transaction as is; after it resolves, call `updateDraftEditRatio` inside `try/catch` that only `console.warn`s. `startDraft` records `draft_started` after the run row exists, before the text is read (after the chapter check and after `startAiStream` returns, with that `runId` and the resolved chapter id), so a start blocked by the limit, the concurrency cap or the chapter check is not counted; a recording failure must not block the draft (same `try/catch`). Add the table, then `pnpm db:generate`.
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/server src/components/writing --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(usage): count draft use and edit ratio as numbers only`.

---

## Gate S0 (sonnet)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`. Only stale pinned tests are fixed here; defects go back to the owning task.

## Stage review (opus)

- [ ] Review `a6e6515..HEAD` along: request parity (nothing sent changed), blind fingerprints, old-run compatibility, usage numbers-only and save safety, cost and time arithmetic against the design definitions. Each finding goes to an opus skeptic; confirmed ones are fixed with the task procedure, then Gate S0 again.

## Measurement M0 (orchestrator)

Worktree: `git worktree add --detach ../DaeumHwa-s0 <gate commit>`, `pnpm install --frozen-lockfile`, link `eval/results` and `.env.local` to the main checkout. Every command below runs in `../DaeumHwa-s0`.

- [ ] **Gateway probe:** `node --env-file=.env.local --import tsx eval/probe-gateway.ts --model haiku-5.5`, then `--model luna-6`.
- [ ] **R2c "after":** `AI_PROVIDER=opencode OPENCODE_MODEL=claude-haiku-5-5 node --env-file=.env.local --import tsx eval/run-continuity.ts --fixture continuity-numeric`. Fill the 후 column of `docs/eval/continuity/2026-10-19-pending-P13.md`.
- [ ] **Effort, continuity:** for `OPENCODE_MODEL` in `claude-haiku-5-5`, `gpt-6-luna`; fixture in `continuity`, `continuity-planted`, `continuity-numeric`; `--effort` in `low`, `medium`, `high` (18 runs, one model per shell).
- [ ] **Effort, extraction:** `eval/replay-calls.ts --task chapter-extract` at `low`, `medium`, `high`: haiku over `2026-10-19-r2a/run-04-{ko,en}`, luna over `run-05-{ko,en}`.
- [ ] **Baseline novel runs** (workflow `scriptPath` = main checkout `.claude/workflows/novel-eval.js`, `repo` = the worktree; flags on every run: `['--deploy-settings', '--directives on']`):

  | Invocation | date | chapters | runs |
  |---|---|---|---|
  | A | `2026-10-20-s0` | 1 | haiku-5.5 ko, haiku-5.5 en |
  | B | `2026-10-20-s0` | 1 | luna-6 ko, luna-6 en |
  | C | `2026-10-20-s0r` | 1 | luna-6 ko (repeat) |
  | D | `2026-10-20-s0m` | 3 | haiku-5.5 ko (chapter 1 doubles as the haiku ko repeat; chapters 2–3 are the directive-retention baseline) |

  Then a summary invocation per date folder.
- [ ] **P10 cross-check:** `python3 docs/superpowers/handoff/2026-10-19-ai-improvement-round2/tools/weak_evidence.py` over the new runs vs the `extraction` block in each `run-summary.json`.
- [ ] **Results doc (sonnet, Korean):** `docs/eval/harness/2026-10-20-stage0-baseline.md` — per run: verdict, Q mean, failed T, must-fix per 1,000 characters, chapter cost, first-char time, write time, after-save time, calls; directive retention per chapter (run D); R2a (effort high) vs s0 (deploy settings) for the same model and language, with this caveat: R2a Anthropic (Haiku) runs did not record cached system prompts, so their input tokens and usd are lower (`cacheRecorded` false), and the input-token rise against s0 is partly a recording difference; the effort-test tables; the gateway result; R2c after; and the default model the orchestrator picks with its reason.
- [ ] Copy the worktree's `docs/eval/novel/2026-10-20-s0*/` into the main checkout and commit by name.
- [ ] Keep `../DaeumHwa-s0` until stage 1 is measured: the few-instruction baseline (`--few-instructions`, the default model, ko) runs there as part of stage 1's measurement.

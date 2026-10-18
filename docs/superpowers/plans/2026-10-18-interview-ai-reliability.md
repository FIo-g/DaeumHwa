# Interview, AI Reliability and UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project the orchestrator (Opus) dispatches each task to a Haiku implementer through Claude Code Workflows; Sonnet reviews the whole branch at the end.

**Goal:** Make the interview generate questions forever without regressing to old topics (AI picks setting-gap vs. next-chapter/storyline questions), stop duplicate/mis-parsed cards, delete demo mode, give every AI call a timeout and a cancel button, investigate the server crash, and fix four UX issues.

**Architecture:** AI calls carry `task: { name, input }` (so a test-only fake can answer) plus `signal`/`timeoutMs`. Route handlers pass `request.signal` down to `runAiTask`, which records cancelled/timed-out runs as `error`. The interview's question task gets the full covered-question list across sessions plus story material and returns a `focus`. Extraction dedup also checks pending `entry_create` proposals, aliases and the last word of a name. E2E runs against a local HTTP stub that mimics the Anthropic Messages API.

**Tech Stack:** Next.js 16.4 (App Router, route handlers), React 19.3, TypeScript 5.9, Drizzle 0.45 + drizzle-kit 0.31 (PGlite locally), @anthropic-ai/sdk 0.135, zod 4, Vitest 5 + Testing Library, Playwright 1.64, tsx.

**Spec:** `docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` (Korean). Section letters (§A–§F) point into it.

## Global Constraints

- No package added, removed or upgraded.
- User-facing copy is Korean, short and plain; identifiers and comments English. Copy strings below are exact.
- AI never writes wiki tables; wiki changes only via author actions or approved proposals, with `change_log` in the same transaction.
- Services throw `AppError(code, message)`; actions and route handlers return `ActionResult`; non-members always get `NOT_FOUND`.
- Route handlers that call AI: `export const runtime = 'nodejs'`, `export const maxDuration = 300`; `params` is a Promise typed inline.
- Structured-output zod schemas: only object/array/string/number/integer/boolean/enum/nullable — no min/max/regex/default/optional.
- Tests never call a real AI API. Service tests use `createTestDb()` and `@/test/factories`; component tests start with `// @vitest-environment jsdom`.
- Parallel agents: run `pnpm vitest run <paths> --maxWorkers=2` and `pnpm exec tsc --noEmit 2>&1 | grep <your files>`; never run `pnpm build`, `pnpm e2e` or `next dev` except in Tasks 9 and 10.
- Do not commit. The orchestrator commits after each wave.
- Exact messages: no key `AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.`; timeout `AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.`; cancel `취소했습니다.`

## Review Focus

1. **Cancel at the edge** — the user cancels right as the AI answers. The run must end `done` or `error`, never stay `running`, and the panel must not show both the cancel toast and the result. Test in Task 3 (`run.test.ts`: signal aborted after `generateObject` resolved → run `done`, output returned).
2. **Interview with no chapters yet** — a brand-new work has no chapters, summaries or reader runs. The question input must still build with empty story material, and the prompt must say `(없음)`. Test in Task 8 (`interview.test.ts`: work without chapters → `story.latestPosition === null`, prompt contains `최신 회차: (없음)`).
3. **Very long interview** — 150 turns across many sessions. The covered list is capped at 120 with the dropped count stated, and the prompt stays bounded. Test in Task 8 (`covered.length === 120`, `coveredDropped === 30`).
4. **Legacy titles** — existing rows titled `1화` or `3화 재회` must display as `1화` and `3화 재회` before and after the migration, and a title like `12화살의 비밀` must stay untouched. Tests in Task 4.
5. **Name collisions in one answer** — one answer names `노은하` and `전직 시계탑 수리공 노은하` together, or an alias equals an existing card. Exactly one card candidate. Tests in Task 7.

---

## Execution Model (orchestrator notes)

| Wave | Tasks (parallel inside a wave) | Why this order |
|---|---|---|
| 1 | Task 1 (demo removal), Task 2 (E2E stub + docs) | Task 1 changes `AiClient`/`AiTaskDef` that every later task touches; Task 2 touches only `e2e/`, `package.json`, `playwright.config.ts`, docs |
| 2 | Task 3 (timeouts/cancel), Task 4 (titles), Task 5 (length warning) | Disjoint files; Task 4 owns the only migration of this wave |
| 3 | Task 6 (advice/style routes), Task 7 (extraction dedup) | Both build on Task 3; Task 6 owns `ai-features.ts` + new routes, Task 7 owns extraction + `interview.ts` + `chapter-check.ts` |
| 4 | Task 8 (continuous interview) | Builds on Tasks 3 and 7; owns the second migration |
| 5 | Task 9 (crash investigation) | Needs the finished app and the stub |
| 6 | Task 10 (verification gate) | Full lint/typecheck/test/build/e2e |
| 7 | Sonnet review → Haiku fixes → Task 10 again | |


---

### Task 1: Remove demo mode; move fake AI output into test code (§A)

**Files:**
- Modify: `src/ai/types.ts`, `src/ai/run.ts`, `src/ai/index.ts`, `src/ai/models.ts`, `src/lib/ai-mode.ts`, every `src/ai/tasks/*.ts` (delete `fake*` functions and the `fake:` property), `src/server/ai-features.ts` (`startDraft`: `input` instead of `fake`), `src/app/(app)/layout.tsx`, `src/app/(app)/works/[workId]/chapters/[chapterId]/writing-data.ts`, `src/components/writing/types.ts` (drop `demo`), `eval/run-continuity.ts` (import path only), `eslint.config.mjs`
- Delete: `src/ai/fake.ts`, `src/ai/fake.test.ts`, `src/components/app/demo-banner.tsx`
- Create: `src/test/fake-ai.ts`, `src/test/fake-ai.test.ts`, `src/test/ai-fakes/<task>.ts` (one per task, the moved fake functions with their helpers) and `src/test/ai-fakes/index.ts`, `src/components/app/ai-setup-banner.tsx`
- Modify tests: every test that imports `@/ai/fake` or a `fake*` function from a task file

**Interfaces:**
- Produces (`src/ai/types.ts`):
  ```ts
  export type AiTaskRef = { name: AiTaskName; input: unknown }
  export interface GenerateObjectArgs<T> { task: AiTaskRef; system: string; prompt: string; schema: z.ZodType<T>; effort: AiEffort; maxTokens: number; model?: string }
  export interface StreamTextArgs { task: AiTaskRef; system: string; prompt: string; effort: AiEffort; maxTokens: number; model?: string }
  export interface AiClient { provider: string; defaultModel: string; generateObject…; streamText… } // provider is a label
  export interface AiTaskDef<I, O> { name; effort; maxTokens; system; buildPrompt; schema; postProcess?; model? } // no fake
  ```
- Produces (`src/ai/run.ts`): `StreamRunArgs` = `{ task: AiTaskName; input: unknown; effort; maxTokens; system; prompt; model? }`.
- Produces (`src/lib/ai-mode.ts`): `type AiProvider = 'anthropic' | 'opencode'`; `getAiProvider(): AiProvider | null`; `isAiConfigured(): boolean`; `AI_KEY_MISSING_MESSAGE = 'AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.'`. `isDemoMode` is removed.
- Produces (`src/test/fake-ai.ts`): `class FakeAiClient implements AiClient` (`provider = 'test'`, `defaultModel = 'fake'`), answering `generateObject` with `schema.parse(FAKE_OUTPUTS[args.task.name](args.task.input))` and `streamText` with `FAKE_TEXT[args.task.name](args.task.input)` split into 40-code-point chunks (same as today). Constructor option `overrides?: Partial<Record<AiTaskName, (input: unknown) => unknown>>` for per-test outputs. Throws `Error('No fake output for task <name>')` when neither exists.
- Produces (`src/test/ai-fakes/index.ts`): `FAKE_OUTPUTS: Partial<Record<AiTaskName, (input: any) => unknown>>`, `FAKE_TEXT: Partial<Record<AiTaskName, (input: any) => string>>`.

- [ ] **Step 1: Write failing tests**
  - `src/lib/ai-mode.test.ts`: no keys and `AI_PROVIDER` unset → `getAiProvider()` is `null` and `isAiConfigured()` is `false`; `AI_PROVIDER=fake` with no keys → `null`; `AI_PROVIDER=fake` with `OPENCODE_API_KEY=k` → `'opencode'`; `ANTHROPIC_API_KEY=k` → `'anthropic'`.
  - `src/ai/index.test.ts`: with no keys, `getAiClient()` throws an `AppError` with code `'AI_ERROR'` and message `AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.`.
  - `src/test/fake-ai.test.ts`: `generateObject({ task: { name: 'interview-question', input: <empty history input> }, … })` returns the first core topic question; `overrides` win over the registry; an unknown task throws.
- [ ] **Step 2: Run them; expect failures** — `pnpm vitest run src/lib/ai-mode.test.ts src/ai/index.test.ts src/test/fake-ai.test.ts --maxWorkers=2`
- [ ] **Step 3: Implement the type, runner, provider and client changes above.** `runAiTask` sends `task: { name: task.name, input }`; `startAiStream` sends `task: { name: args.task, input: args.input }`. `getAiClient()` throws `new AppError('AI_ERROR', AI_KEY_MISSING_MESSAGE)` when `getAiProvider()` is `null` (the client is not cached in that case).
- [ ] **Step 4: Move every `fake*` function (and helpers only they use) from `src/ai/tasks/*.ts` and `src/server/ai-features.ts` (`fakeDraft`) into `src/test/ai-fakes/`, unchanged in behavior.** Keep exported non-fake constants such as `INTERVIEW_TOPICS` in the task files.
- [ ] **Step 5: Replace `DemoBanner` with `AiSetupBanner`** (renders nothing when `isAiConfigured()`; otherwise `role="status"` text `AI 키가 설정되지 않았습니다. ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY를 설정하면 AI 기능을 쓸 수 있습니다.`). Drop `demo` from `WritingData`.
- [ ] **Step 6: Point every test at `@/test/fake-ai` / `@/test/ai-fakes`.**
- [ ] **Step 7: ESLint guard** — in `eslint.config.mjs` add `no-restricted-imports` with pattern `@/test/*` (message `테스트 전용 코드입니다.`) for `src/**/*.{ts,tsx}`, ignoring `**/*.test.{ts,tsx}` and `src/test/**`.
- [ ] **Step 8: Verify**
  - `pnpm vitest run src/ai src/server src/lib src/test src/components src/app eval --maxWorkers=2` → all pass
  - `pnpm exec tsc --noEmit` → no errors
  - `pnpm eslint src eval` → no errors
  - `rg -n -i "fake|demo|데모" src -g '!src/test/**' -g '!*.test.*'` → no matches (rename any surviving identifier)

### Task 2: E2E AI stub server, e2e wiring and docs (§A)

**Files:**
- Create: `e2e/ai-stub/server.ts`, `e2e/ai-stub/responders.ts`, `e2e/ai-stub/responders.test.ts`
- Modify: `package.json` (scripts), `playwright.config.ts`, `vitest.config.ts` (add `'e2e/ai-stub/**/*.test.ts'` to `include`), `.env.example`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: task definitions in `src/ai/tasks/*` (`system`, `buildPrompt`, `schema`, `name`) and the draft system prompt in `src/server/ai-features.ts`. Do not depend on Task 1's types; read `system` strings only.
- Produces: `respond(body: { system: string | { type: 'text'; text: string }[]; messages: { role: string; content: string }[]; model: string; stream?: boolean }): { task: string; text: string; delayMs: number }` in `responders.ts`; HTTP server on `E2E_AI_STUB_PORT` (default `3199`) with `GET /health` → 200 `ok` and `POST /v1/messages`.
- Produces scripts: `"e2e:ai-stub": "tsx e2e/ai-stub/server.ts"`; `e2e:server` uses `AI_PROVIDER=anthropic ANTHROPIC_API_KEY=e2e-stub ANTHROPIC_BASE_URL=http://127.0.0.1:3199` instead of `AI_PROVIDER=fake` (all three commands in the chain).

- [ ] **Step 1: Write `responders.test.ts`** — for every task, build a prompt with `task.buildPrompt(sampleInput)` and assert `task.schema.safeParse(JSON.parse(respond({ system: [{ type: 'text', text: task.system }], messages: [{ role: 'user', content: prompt }], model: 'm' }).text)).success === true`. Scenario assertions: continuity-check prompt containing a confirmed fact `서윤은 왼손잡이다.` and manuscript `서윤은 오른손으로 검을 쥐었다.` → one issue with `quote === '서윤은 오른손으로 검을 쥐었다.'` and the fact's ref from the prompt; chapter-extract/import-extract → `summary` non-null (so the approval dialog opens); interview-question with N covered/history items → question text contains `(${N + 1})` so consecutive questions differ.
- [ ] **Step 2: Run; expect failure** — `pnpm vitest run e2e/ai-stub --maxWorkers=2`
- [ ] **Step 3: Implement `responders.ts`** — identify the task by exact match of the system text against imported task `system` strings; parse scenario values from the prompt with the section tags the task's `buildPrompt` writes (read `renderContextPack` in `src/ai/context.ts` for the fact/entry ref format). Unknown system → HTTP 400 with an Anthropic-style error body. `delayMs` is 30000 when the user prompt contains `[느리게]`, else 0.
- [ ] **Step 4: Implement `server.ts`** — non-stream reply `{ id: 'msg_stub_<n>', type: 'message', role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }`; when `stream: true`, send SSE `message_start`, `content_block_start`, one `content_block_delta` (`text_delta`) per 40 code points (waiting `delayMs` before the first delta), `content_block_stop`, `message_delta` (`stop_reason: 'end_turn'`, usage), `message_stop`.
- [ ] **Step 5: Wire Playwright** — `webServer` becomes an array: first `{ command: 'pnpm e2e:ai-stub', url: 'http://127.0.0.1:3199/health', reuseExistingServer: false, timeout: 30000 }`, then the existing app server entry.
- [ ] **Step 6: Docs** — `.env.example` and `README.md`: remove demo-mode text; `AI_PROVIDER` accepts `anthropic | opencode`; without keys AI features show `AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.`; README gets a short "E2E와 AI 스텁" note (E2E answers come from `e2e/ai-stub`, no model). `CLAUDE.md`: `src/ai` line drops "or Fake"/"fake output"; Tests section says `FakeAiClient` lives in `@/test/fake-ai` and fixed outputs in `@/test/ai-fakes`.
- [ ] **Step 7: Verify** — `pnpm vitest run e2e/ai-stub --maxWorkers=2` passes; `pnpm eslint e2e playwright.config.ts` clean; start `pnpm e2e:ai-stub` in the background, `curl -s localhost:3199/health` prints `ok`, then stop it.

### Task 3: AI timeouts and cancel (§D)

**Files:**
- Modify: `src/lib/errors.ts`, `src/ai/types.ts`, `src/ai/anthropic.ts`, `src/ai/opencode.ts`, `src/ai/responses.ts`, `src/ai/run.ts`, `src/server/chapter-check.ts` (`runChapterCheck`, `runProofread`), `src/server/ai-features.ts` (`runReaderSimulation`, `startDraft`), `src/server/imports.ts` (pass `timeoutMs: 240_000` in meta), `src/app/api/works/[workId]/chapters/shared.ts`, the `check`, `proofread`, `reader-sim` and `draft` routes, `src/lib/client/post-json.ts`, `src/lib/client/run-action.ts`, `src/components/writing/panels/{check,proofread,reader,draft}-panel.tsx`
- Create: `src/lib/client/use-ai-run.ts`, `src/components/app/ai-run-status.tsx`
- Test: `src/ai/anthropic.test.ts`, `src/ai/responses.test.ts`, `src/ai/run.test.ts`, `src/lib/client/post-json.test.ts`, `src/lib/client/run-action.test.ts`, `src/lib/client/use-ai-run.test.tsx`, `src/components/writing/panels/check-panel.test.tsx` (create if missing)

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `ErrorCode` gains `'CANCELLED'`. `src/ai/run.ts` exports `AI_CANCELLED_MESSAGE = '취소했습니다.'`, `AI_TIMEOUT_MESSAGE = 'AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.'`, `DEFAULT_AI_TIMEOUT_MS = 120_000`, `STREAM_AI_TIMEOUT_MS = 280_000`.
  - `GenerateObjectArgs`/`StreamTextArgs` gain `signal?: AbortSignal; timeoutMs?: number`; `AiTaskDef` gains `timeoutMs?: number`.
  - `AiRunMeta` gains `signal?: AbortSignal; timeoutMs?: number` (meta overrides task, task overrides default).
  - Service signatures gain a trailing `signal?: AbortSignal`: `runChapterCheck(db, actor, input, client?, signal?)`, `runProofread(db, actor, input, client?, signal?)`, `runReaderSimulation(db, actor, input, client?, signal?)`, `startDraft(db, actor, input, client?, signal?)`.
  - `postAction<T>(url: string, body: unknown, options?: { signal?: AbortSignal }): Promise<ActionResult<T>>` — an aborted fetch resolves to `{ ok: false, error: { code: 'CANCELLED', message: '취소했습니다.' } }`.
  - `runAction` shows no toast for `CANCELLED` and resolves `null`.
  - `useAiRun(): { running: boolean; elapsedSec: number; run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | null>; cancel(): void }` — `cancel()` aborts, sets `running=false` at once and shows `toast('취소했습니다.')`; `run` resolves `null` when cancelled.
  - `<AiRunStatus label="점검 중" elapsedSec={n} onCancel={fn} />` renders `점검 중… {n}초` and a `취소` button (`variant="outline" size="sm"`).

- [ ] **Step 1: Write failing tests**
  - `anthropic.test.ts`: `generateObject` forwards `{ signal, timeout: timeoutMs }` as request options to `messages.parse`/`create`/`stream`; an `APIUserAbortError` becomes `AppError('CANCELLED', '취소했습니다.')`; an `APIConnectionTimeoutError` becomes `AppError('AI_ERROR', AI_TIMEOUT_MESSAGE)`; the default SDK is built with `maxRetries: 1`.
  - `responses.test.ts`: an external abort mid-request becomes `CANCELLED`; the timeout still applies when no signal is given.
  - `run.test.ts`: (a) signal aborted before the call → `CANCELLED` thrown and the run row is `error` with error `취소했습니다.`; (b) client rejects with the timeout error → run `error` with `AI_TIMEOUT_MESSAGE`; (c) signal aborted after `generateObject` resolved → run `done` and output returned (Review Focus 1); (d) `timeoutMs` passed to the client is `meta.timeoutMs ?? task.timeoutMs ?? 120000`; (e) stream aborted → run `error`, `done` rejects with `CANCELLED`.
  - `post-json.test.ts`: aborted signal → `CANCELLED` result. `run-action.test.ts`: `CANCELLED` → no `toast.error` call.
  - `use-ai-run.test.tsx` (fake timers): `elapsedSec` reaches 3 after 3 s; `cancel()` aborts the signal passed to `fn` and `run` resolves `null`.
  - `check-panel.test.tsx`: while the check runs, `점검 중… 0초` and `취소` are visible; clicking `취소` brings back the `회차 점검` button.
- [ ] **Step 2: Run; expect failures** — `pnpm vitest run src/ai src/lib/client src/components/writing/panels --maxWorkers=2`
- [ ] **Step 3: Implement clients and runner.** Responses client: `signal: AbortSignal.any([args.signal, AbortSignal.timeout(ms)].filter(Boolean))`; distinguish user abort (`args.signal?.aborted`) from timeout. `runAiTask`/`startAiStream`: when `meta.signal` is already aborted, record the run as `error` (`취소했습니다.`) and throw `CANCELLED`.
- [ ] **Step 4: Plumb `request.signal`** from the four routes into the services (`runChapterRoute` gives `fn` the request signal as a 4th argument). In the draft route, the `ReadableStream`'s `cancel()` aborts an internal controller that is linked to `request.signal`.
- [ ] **Step 5: Panels.** Check, proofread (AI only) and reader panels use `useAiRun` + `AiRunStatus` with labels `점검 중`, `교정 중`, `독자 반응 보는 중`. Draft panel: `AbortController` on the fetch; while streaming show `AiRunStatus label="쓰는 중"`; on cancel keep the partial text, set `cancelled`, show only `현재 원고 끝에 붙이기` (no `새 회차로 만들기`), and show `중간에 멈춘 초안입니다.` under the preview.
- [ ] **Step 6: Verify** — `pnpm vitest run src/ai src/lib src/server src/components/writing src/app/api --maxWorkers=2` all pass; `pnpm exec tsc --noEmit` clean for touched files.

### Task 4: Chapter titles without a duplicated number (§F)

**Files:**
- Modify: `src/lib/labels.ts`, `src/server/chapters.ts` (`createChapter`, `appendImportChapters`, and the chapter title save path — find every service that writes `chapters.title`, including the manuscript save in `src/server/manuscript.ts` if it writes the title)
- Create: `drizzle/0001_strip_chapter_title_prefix.sql` via `pnpm drizzle-kit generate --custom --name=strip_chapter_title_prefix`
- Test: `src/lib/labels.test.ts`, `src/server/chapters.test.ts`, `src/db/migrations.test.ts` (create)

**Interfaces:**
- Produces: `stripEpisodePrefix(title: string): string` in `src/lib/labels.ts` — removes a leading `(제\s*)?\d+\s*화` only when followed by end of string or one of `\s . : · - – — ) ]`, then trims leading separators/spaces. `chapterLabel(position, title)` uses it.

- [ ] **Step 1: Failing tests**
  - `labels.test.ts`: `stripEpisodePrefix('1화') === ''`; `('1화 00:00 멈춘 종') === '00:00 멈춘 종'`; `('제3화: 재회') === '재회'`; `('12화살의 비밀') === '12화살의 비밀'`; `('재회') === '재회'`. `chapterLabel(1, '1화') === '1화'`; `chapterLabel(1, '1화 멈춘 종') === '1화 멈춘 종'`; `chapterLabel(3, '재회') === '3화 재회'`; `chapterLabel(2, '') === '2화'`.
  - `chapters.test.ts`: `createChapter` without a title stores `''`; `appendImportChapters` with titles `['2화 재회', '3화']` stores `['재회', '']`; saving a chapter title `5화 끝` stores `끝`.
  - `migrations.test.ts`: on a fresh test DB insert chapters titled `1화`, `2화 재회`, `재회`, `12화살의 비밀`, run the SQL of `drizzle/0001_strip_chapter_title_prefix.sql`, expect `''`, `재회`, `재회`, `12화살의 비밀`.
- [ ] **Step 2: Run; expect failures** — `pnpm vitest run src/lib/labels.test.ts src/server/chapters.test.ts src/db/migrations.test.ts --maxWorkers=2`
- [ ] **Step 3: Implement** `stripEpisodePrefix`, use it in every title write, default title `''`. Fill the custom migration with one `UPDATE chapters SET title = …` using `regexp_replace` with the same rule. Check that UI spots showing a raw `chapter.title` render well when it is empty (prefer `chapterLabel`).
- [ ] **Step 4: Verify** — same command passes; `pnpm db:migrate` on a scratch dir (`PGLITE_DATA_DIR=$(mktemp -d)/db pnpm db:migrate`) succeeds.

### Task 5: Warn before completing a chapter under the target length (§F)

**Files:**
- Create: `src/lib/chapter-length.ts`, `src/lib/chapter-length.test.ts`, `src/components/chapters/complete-confirm-dialog.tsx`
- Modify: `src/components/writing/writing-workspace.tsx` (`changeStatus`), `src/components/chapters/chapter-table.tsx`, the chapters page that renders `ChapterTable` (pass `targetChars` from work settings via `resolveWorkSettings`/`DEFAULT_WORK_SETTINGS` in `src/db/types.ts`)
- Test: `src/components/chapters/chapter-table.test.tsx` (create or extend)

**Interfaces:**
- Produces: `lengthShortfall(charCount: number, targetChars: number): { percent: number } | null` (`null` when `targetChars <= 0` or `charCount >= targetChars`; `percent = Math.round(charCount / targetChars * 100)`); `shortfallMessage(charCount: number, targetChars: number): string` → `` `목표 ${targetChars.toLocaleString('ko-KR')}자 중 ${charCount.toLocaleString('ko-KR')}자(${percent}%)입니다. 그래도 완료할까요?` ``.
- Produces: `<CompleteConfirmDialog open message onConfirm onOpenChange />` built on `src/components/ui/alert-dialog.tsx`, title `분량이 목표보다 적습니다`, confirm `완료하기`, cancel `계속 쓰기`.

- [ ] **Step 1: Failing tests** — `shortfallMessage(4265, 5500) === '목표 5,500자 중 4,265자(78%)입니다. 그래도 완료할까요?'`; `lengthShortfall(5500, 5500) === null`; `lengthShortfall(100, 0) === null`. Chapter table: marking a 4,265-char draft as done with target 5,500 opens the dialog with that message and calls `setChapterStatusAction` only after `완료하기`; a 6,000-char chapter calls it directly.
- [ ] **Step 2: Run; expect failures** — `pnpm vitest run src/lib/chapter-length.test.ts src/components/chapters --maxWorkers=2`
- [ ] **Step 3: Implement.** Writing screen uses the live count with spaces (same as the editor's progress). Only the `draft → done` direction asks; the server is unchanged.
- [ ] **Step 4: Verify** — same command passes.

### Task 6: Direction advice and style suggestion as cancellable routes (§D)

**Files:**
- Create: `src/app/api/works/[workId]/work-route.ts`, `src/app/api/works/[workId]/advice/route.ts`, `src/app/api/works/[workId]/style-suggest/route.ts`, route tests next to them
- Modify: `src/server/ai-features.ts` (`runDirectionAdvice`, `suggestStyleCard` gain trailing `signal?`), `src/server/actions/ai-features.ts` (remove `runDirectionAdviceAction`, `suggestStyleCardAction`), `src/components/advice/advice-view.tsx`, `src/components/wiki/style-cards.tsx`

**Interfaces:**
- Consumes: Task 3 (`useAiRun`, `AiRunStatus`, `postAction(…, { signal })`, `AiRunMeta.signal`).
- Produces: `runWorkRoute<I, T>(request: Request, workId: string, schema: z.ZodType<I>, fn: (db: Db, actor: Actor, input: I, signal: AbortSignal) => Promise<T>): Promise<Response>` — same contract as `runChapterRoute` (session check, body parse, `withAction`, `revalidateWork(workId)`, `Cache-Control: no-store`, HTTP 200 with `ActionResult`). Task 8 uses it.
- Routes: `POST /api/works/[workId]/advice` body `{}` → `ActionResult<{ runId: string; result: AdviceResult }>`; `POST /api/works/[workId]/style-suggest` body `{ entryId: uuid }` → `ActionResult<ProposalRow>`.

- [ ] **Step 1: Failing tests** — route tests (pattern of `chapters/[chapterId]/check/route.test.ts`): non-member → `NOT_FOUND`; `style-suggest` with an entry of another work → `NOT_FOUND`; success returns the result with a `FakeAiClient`. Component: while advice runs, `조언 만드는 중… 0초` and `취소` are visible.
- [ ] **Step 2: Run; expect failures** — `pnpm vitest run src/app/api/works src/components/advice src/components/wiki --maxWorkers=2`
- [ ] **Step 3: Implement** the helper, routes (`runtime = 'nodejs'`, `maxDuration = 300`, pass the signal) and UI (`useAiRun` + `AiRunStatus`, labels `조언 만드는 중`, `문체 제안 만드는 중`).
- [ ] **Step 4: Verify** — Step 2 command passes; `pnpm exec tsc --noEmit` clean for touched files.

### Task 7: Extraction dedup and naming rules (§C)

**Files:**
- Create: `src/ai/extraction-rules.ts`, `src/server/known-entries.ts`, `src/server/known-entries.test.ts`
- Modify: `src/ai/extraction.ts`, `src/ai/tasks/interview-extract.ts`, `src/ai/tasks/chapter-extract.ts` (both the chapter and the import extract task system prompts), `src/server/interview.ts` (`answerTurn` only), `src/server/chapter-check.ts` (known entries for chapter extraction), `src/test/ai-fakes/interview-extract.ts` (accepts the new input fields)
- Test: `src/ai/extraction.test.ts`, `src/ai/tasks/interview.test.ts`, `src/server/interview.test.ts`

**Interfaces:**
- Produces (`extraction-rules.ts`): `ROLE_WORDS = ['주인공', '남주', '여주', '남자 주인공', '여자 주인공', '악역', '조연', '화자', '나', '그', '그녀', '그들'] as const`; `ENTITY_NAME_RULES: string` — rule lines appended to every extraction system prompt, containing these two examples verbatim: `"전직 시계탑 수리공 노은하" → name "노은하", summary "전직 시계탑 수리공"` and `"한기준은 전전대 관리자였고 한시우는 그의 아들이다" → 한기준 summary "전전대 관리자", 한시우 summary "한기준의 아들"`, plus: role words and pronouns are never names, never fact subjects and never relation ends (use the person's name); no name in the answer → no card; `<known>` names marked `(승인 대기)` are already proposed and must be reused.
- Produces (`known-entries.ts`): `type KnownEntries = { active: { id: string; name: string; aliases: string[]; kind: EntryKind }[]; pending: { name: string; aliases: string[]; kind: EntryKind }[]; threads: { id: string; title: string; status: ThreadStatus }[]; pendingThreadTitles: string[] }`; `loadKnownEntries(db: Db, workId: string, opts?: { excludePostChapterOf?: string }): Promise<KnownEntries>` — `active` = non-archived wiki entries; `pending` = `status = 'pending'` `entry_create` proposals of the work; `threads` = non-archived threads; `pendingThreadTitles` = titles of pending `thread_create` proposals; pending items exclude `post_chapter` proposals of chapter `excludePostChapterOf`.
- Produces (`extraction.ts`): `ExtractionContext.pendingEntries?: { name: string; aliases: string[] }[]`; `ExtractionContext.pendingThreadCreateTitles?: Set<string>` (a planted thread whose collapsed title matches one is not created again).
- Produces: `InterviewExtractInput.known` items gain `pending: boolean` (rendered as `- 노은하 (인물, 승인 대기)`); `InterviewExtractInput.threads: { title: string; pending: boolean }[]` rendered in a `<threads>` section (`(없음)` when empty) with the rule that a plan matching a listed title reuses that exact title.

- [ ] **Step 1: Failing tests (`extraction.test.ts`)**
  1. `pendingEntries: [{ name: '노은하', aliases: [] }]`, extraction entry `노은하` → no `entry_create`.
  2. existing `{ id: 'e1', name: '주인공', aliases: [] }`, extraction entry `{ name: '한시우', aliases: ['주인공'] }` → no `entry_create`; one `entry_update` `{ entryId: 'e1', entryName: '주인공', patch: { aliases: ['한시우'] } }`.
  3. existing `{ id: 'e2', name: '노은하' }`, extraction entry `시계탑 수리공 노은하` → no `entry_create`; fact with `subjectName: '전직 시계탑 수리공 노은하'` → `entryId: 'e2'`.
  4. extraction entries `주인공` and `주인공은` with nothing existing → no `entry_create`.
  5. one extraction with entries `노은하` and `전직 시계탑 수리공 노은하` → exactly one `entry_create`, named `노은하` (Review Focus 5).
  6. a pending entry's name as a fact subject → `entryId: null`.
  7. fact with `subjectName: '주인공'` and relation `{ sourceName: '그녀', targetName: '한시우' }` → neither proposed.
  8. existing place `{ id: 'p1', name: '시계탑', kind: 'place' }`, extraction entry `{ name: '북쪽 시계탑', kind: 'place' }` → one `entry_create` `북쪽 시계탑` (last-word matching is for characters only).
  9. case 3 produces no `entry_update` (the long name is not added as an alias).
  10. `pendingThreadCreateTitles: new Set(['멈춘 종의 비밀'])`, planted thread `멈춘 종의 비밀` → no `thread_create`; `existingThreads` with that title → no `thread_create` (already the rule).
- [ ] **Step 2: Failing tests (prompts and services)** — `buildInterviewExtractPrompt` renders `(인물, 승인 대기)` for a pending known item; the interview, chapter and import extract `system` strings contain `ENTITY_NAME_RULES`; `known-entries.test.ts` covers active/pending/excluded; `interview.test.ts`: two answers whose fake extraction (via `FakeAiClient` `overrides`) both propose `노은하` → exactly one pending `entry_create` named `노은하`.
- [ ] **Step 3: Run; expect failures** — `pnpm vitest run src/ai/extraction.test.ts src/ai/tasks/interview.test.ts src/server/interview.test.ts src/server/known-entries.test.ts --maxWorkers=2`
- [ ] **Step 4: Implement.** In `extractionToProposals`: match order for an incoming name is exact → particle-stripped → last whitespace word (particle-stripped) against wiki entries, then pending entries, then names created earlier in this extraction. Last-word matching only applies when the matched entry is a character and, for incoming entries, the incoming kind is `character`; it never adds an alias. Drop entries whose stripped name is in `ROLE_WORDS`, and facts/relations whose subject or either end is a role word. Alias hit on a wiki entry → `entry_update` adding the incoming name and its other aliases that the entry lacks (skip when nothing new); alias hit on a pending entry → skip. `answerTurn` and `runChapterCheck` use `loadKnownEntries` (chapter check passes `excludePostChapterOf: chapterId`); `answerTurn` also fills `existingThreads`, `pendingThreadCreateTitles` and the extract input's `threads`. Import keeps its own job-state dedup; only its prompt changes.
- [ ] **Step 5: Verify** — the Step 3 command plus `pnpm vitest run src/server/chapter-check.test.ts src/server/imports.test.ts --maxWorkers=2` pass.

### Task 8: Continuous interview (§B, §F copy)

**Files:**
- Modify: `src/db/schema.ts` (`interviewTurns.focus`), `src/db/types.ts`, `src/ai/tasks/interview-question.ts`, `src/ai/tasks/interview-extract.ts` (focus), `src/server/interview.ts`, `src/server/actions/interview.ts` (remove `askNextQuestionAction` and `answerTurnAction`), `src/components/interview/interview-session.tsx`, `src/components/interview/question-card.tsx`, `src/app/(app)/works/[workId]/interview/page.tsx`, `src/test/ai-fakes/interview-question.ts` and `interview-extract.ts` (new shapes), `e2e/ai-stub/responders.ts` (interview-question output gets `focus`)
- Create: `drizzle/0002_*.sql` via `pnpm db:generate`; `src/app/api/works/[workId]/interview/next/route.ts`, `src/app/api/works/[workId]/interview/answer/route.ts`, `src/app/api/works/[workId]/interview/shared.ts`, route tests next to them
- Test: `src/server/interview.test.ts`, `src/ai/tasks/interview.test.ts`, `src/components/interview/interview-session.test.tsx` (create or extend)

**Interfaces:**
- Consumes: Task 3 (`useAiRun`, `AiRunStatus`, `postAction` with signal, `AiRunMeta.signal`), Task 7 (`loadKnownEntries`).
- Produces (`src/db/types.ts`): `INTERVIEW_FOCUSES = ['setting', 'story'] as const`, `type InterviewFocus`; `interview_turns.focus text not null default 'setting'`.
- Produces (`interview-question.ts`):
  ```ts
  export type InterviewQuestionInput = {
    work: { title: string; genre: string; logline: string; synopsis: string }
    wiki: { counts: Record<EntryKind, number>; entries: { name: string; kind: EntryKind; factCount: number; summary: string }[]; openThreads: { title: string; targetChapterPosition: number | null }[] }
    story: { latestPosition: number | null; recentSummaries: { position: number; title: string; summary: string }[]; readerReactions: { position: number; digest: string }[]; openIssueCount: number }
    covered: { topic: string; question: string; answer: string | null; skipped: boolean; focus: InterviewFocus }[]
    coveredDropped: number
    recent: { topic: string; question: string; answer: string | null; skipped: boolean }[]
    rejected: string | null
  }
  export type InterviewQuestion = { focus: InterviewFocus; topic: string; question: string; rationale: string }
  ```
  Caps: entries 80 (summary cut to 40 chars; `factCount` = non-archived facts of the entry), openThreads 30, recentSummaries 5 (newest chapters with a non-empty summary), readerReactions 3 (newest done `reader-sim` runs of the work; digest ≤ 200 chars built from persona `overall` texts and the count of `dropOffRisk: 'high'`), covered 120 newest of all the work's turns across sessions in chronological order (question cut to 120 chars, answer cut to 80 chars), recent 6 newest answered/skipped turns of the current session (answer cut to 600 chars).
- Produces (`interview-extract.ts`): `InterviewExtractInput.focus: InterviewFocus`.
- Produces (`interview.ts`): `askNextQuestion(db, actor, sessionId, client?, signal?)`, `answerTurn(db, actor, input, client?, signal?)`, `normalizeQuestion(text: string): string` (removes whitespace and punctuation).
- Produces routes: `POST /api/works/[workId]/interview/next` body `{ sessionId: uuid }` → `ActionResult<InterviewTurnRow>`; `POST /api/works/[workId]/interview/answer` body `{ turnId: uuid, answer: string ≤ 5000 }` → `ActionResult<{ turn; proposals }>`. A session/turn of another work → `NOT_FOUND`.

- [ ] **Step 1: Failing service tests (`interview.test.ts`)** with a capturing client (a `FakeAiClient` whose `overrides['interview-question']` records its input):
  - after 8 answered turns in session 1 (completed) and 4 in session 2, the question input for session 2 has `covered.length === 12` with session 1's first topic first, and `recent.length === 4`.
  - 150 turns → `covered.length === 120`, `coveredDropped === 30` (Review Focus 3).
  - work without chapters → `story.latestPosition === null`, `recentSummaries` empty (Review Focus 2).
  - chapters 1–6 with summaries → `recentSummaries` holds positions 2–6.
  - duplicate guard: the first answer repeats an earlier question (different spacing/punctuation) and the second differs → the stored question is the second one, and the second call's input has `rejected` equal to the repeated text; both answers duplicates → the second is stored anyway.
  - the stored turn has `focus: 'story'` when the output says so; `answerTurn` sends that focus to the extract input.
- [ ] **Step 2: Failing prompt tests (`src/ai/tasks/interview.test.ts`)** — the prompt has `<covered>` listing every covered question, `생략한 이전 질문: 30개` when `coveredDropped` is 30, `<story>` with `최신 회차: (없음)` when there are no chapters, and `<rejected>` only when `rejected` is set. The system prompt names the eight core topics (`INTERVIEW_TOPICS`), the rule to judge whether the settings are enough (`setting` vs `story`), the rule never to repeat a covered question (the same topic only with a new angle that builds on the earlier answer), and the rule that `story` questions cite concrete material (chapter numbers, thread titles, reader reactions).
- [ ] **Step 3: Failing route and component tests** — routes: non-member → `NOT_FOUND`, a session of another work → `NOT_FOUND`, success returns the turn. `interview-session.test.tsx`: question generation failure shows `질문을 만들지 못했습니다.` and `다시 시도`, which retries; a failed answer keeps the typed text; a `story` turn shows the `다음 전개` badge and a `setting` turn shows `설정 채우기`.
- [ ] **Step 4: Run; expect failures** — `pnpm vitest run src/server/interview.test.ts src/ai/tasks/interview.test.ts src/app/api/works src/components/interview --maxWorkers=2`
- [ ] **Step 5: Implement** the schema change (+ `pnpm db:generate`), the task, `buildQuestionInput`, the duplicate guard (compare `normalizeQuestion` against all the work's earlier questions; retry once with `rejected`), the routes (pass `request.signal`), and the UI (`postAction` + `useAiRun`; labels `질문 만드는 중`, `답 정리하는 중`). Update the test fakes and the stub responder to the new output shape. Extract prompt for `story`: decided future events become `threads` with kind `planted` (they land as `planned`), `targetChapterPosition` filled when the answer names a chapter; ideas the author is unsure about become `facts` with `suggestedStatus: 'undecided'` whose subject is the involved character's card name; a plan matching a `<threads>` title reuses that title.
- [ ] **Step 6: Copy (exact)** — page description `질문에 답하면 설정 카드와 떡밥 후보가 만들어집니다. 답 아래에서 바로 승인하거나 거절할 수 있고, 처리하지 않은 후보는 승인 대기에 남습니다.`; empty-state description `질문에 답하면 설정 카드 후보가 만들어집니다. 설정이 충분하면 다음 화와 스토리 방향을 함께 정합니다.`; end-confirm description `지금까지 답한 내용은 남습니다. 처리하지 않은 후보는 승인 대기에 남습니다.`; finished text `처리하지 않은 후보는 승인 대기에 남아 있습니다.`, link label `승인 대기 보기`; badges `설정 채우기` / `다음 전개`.
- [ ] **Step 7: Verify** — the Step 4 command passes; `pnpm exec tsc --noEmit` clean; `pnpm eslint src/server src/components/interview src/app/api/works` clean.

### Task 9: Server crash investigation (§E)

**Files:**
- Create: `scripts/stress/interview-stress.ts` (Playwright script run with `pnpm exec tsx`), `docs/superpowers/reports/2026-10-18-server-crash-investigation.md`
- Modify: only what a reproduced root cause requires, plus a regression test for it

- [ ] **Step 1:** Start the stub (`pnpm e2e:ai-stub`) and the app on port 3200 with `PGLITE_DATA_DIR=.data/stress`, `AI_PROVIDER=anthropic ANTHROPIC_API_KEY=stub ANTHROPIC_BASE_URL=http://127.0.0.1:3199 AUTH_RATE_LIMIT=off BETTER_AUTH_URL=http://localhost:3200`, once with `next start` (after `next build`) and once with `next dev -p 3200`. Log the server's stdout/stderr to `.data/stress/server.log`.
- [ ] **Step 2:** The script signs up, creates a work, writes a chapter, then runs 35 interview turns (every 5th skipped, every 7th cancelled mid-generation using a `[느리게]` answer), starts a chapter check during turn 10, types in the editor during turns 15–20, and ends and restarts the interview at turn 25. Every 5 turns it records server liveness (`curl` on `/`) and RSS (`ps -o rss= -p <pid>`).
- [ ] **Step 3:** If the server dies or a request fails unexpectedly, find the root cause from the log, fix it with a regression test, and rerun. If nothing breaks, record that.
- [ ] **Step 4:** Write the report: scenarios, both modes, liveness/RSS table, findings, fix (or "재현 안 됨"). Stop all processes and delete `.data/stress`.

### Task 10: Verification gate (§F graph, e2e coverage)

**Files:**
- Modify: `e2e/graph-and-export.spec.ts`, `e2e/core-flow.spec.ts` (title assertion)
- Create: `e2e/interview.spec.ts`

- [ ] **Step 1: Graph** — in `graph-and-export.spec.ts`, after the graph renders assert `await expect(page.locator('canvas[data-id="layer2-node"]')).toHaveCount(1)`; navigate to the wiki and back with the sidebar and assert again. (Check the attribute name in `node_modules/cytoscape`.) If the count is not 1, fix `src/components/graph/relation-graph.tsx` so one instance mounts.
- [ ] **Step 2: Title** — in `core-flow.spec.ts`, after `바로 쓰기` the page never shows the text `1화 1화`.
- [ ] **Step 3: Interview e2e** — start the interview, answer the first question, see `이 답에서 나온 제안`, approve one inline, press `다음 질문`, and assert that the second question text differs from the first; end the interview and see `승인 대기 보기`.
- [ ] **Step 4: Full run** — `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. All must pass; fix what fails (root cause, not the assertion) and rerun until green. Report the final command outputs.

---

## Self-Review Notes (orchestrator)

- Spec coverage: §A → Tasks 1–2; §B → Task 8; §C → Task 7; §D → Task 3, Task 6 (advice/style), interview in Task 8; §E → Task 9; §F copy → Task 8, titles → Task 4, length → Task 5, graph → Task 10.
- Type names used across tasks: `AiTaskRef`, `AiRunMeta.signal/timeoutMs`, `useAiRun`, `AiRunStatus`, `postAction(…, { signal })`, `loadKnownEntries`, `KnownEntries`, `InterviewFocus`, `stripEpisodePrefix`, `lengthShortfall`, `shortfallMessage`.

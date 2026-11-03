# Finals Demo (sample work, evidence text, small UI gaps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution (2026-11-03): a Sonnet agent drives OpenCode per task in its own worktree (models in order: `opencode/deepseek-v4.1-flash-free`, `opencode/glm-5.3-flash-free`, then `opencode-go/muse-spark-1.3-contributor` on rate limit or error); Sonnet reviews the integrated branch at the end.

**Goal:** Fix the production server-action crash, then let a judge try 다음화 with one button: a 3-chapter sample work with 3 planted setting errors opens on chapter 3 and runs the chapter check by itself, with wiki evidence shown as the original wiki text.

**Architecture:** T0 moves a zod schema out of a `'use server'` file and adds a static guard test. T1 adds sample data constants, one service that builds the work through the existing domain services, one action, a button on `/works`, and an `autoCheck` path through the chapter page, workspace, side panel and check panel. T2 rewrites `wikiExcerpt` from the pack's original text in `resolveContinuityIssues`. T3–T5 are small UI and doc changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle + PGlite, Vitest, Playwright, shadcn on Base UI. No package changes, no migration.

**Spec:** `docs/superpowers/specs/2026-11-03-finals-demo-design.md`

**Branches:** integration branch `feat/finals-demo` from `main` (de76da9). Each task: worktree `../DaeumHwa-demo-t<N>`, branch `demo/t<N>`. Wave 1: T0 alone, merged first. Wave 2: T1–T5 in parallel from the updated `feat/finals-demo`.

## Global Constraints

- Read `CLAUDE.md` and `AGENTS.md` first. User-facing copy is Korean, short and plain; the exact strings below are fixed. Identifiers and comments are English.
- No package changes. No migration. Do not touch `pnpm-lock.yaml`.
- Wiki rows are written only through the existing services in `src/server/{works,wiki,facts,chapters,threads}.ts`, so every change records `change_log`. AI never writes wiki tables.
- Services throw `AppError(code, koreanMessage)`; actions never throw and return `ActionResult` via `withAction`.
- Tests never call a real AI API. Service tests: `const db = await createTestDb()` in `beforeEach`, data via `@/test/factories`. Component tests start with `// @vitest-environment jsdom`.
- Commands inside a worktree (other agents run in parallel): `pnpm vitest run <paths> --maxWorkers=2`, `pnpm exec tsc --noEmit 2>&1 | grep -E '<your files>'`, `pnpm eslint <your files>`. Only T0 and T1 run `pnpm e2e`, never at the same time (fixed ports 3100/3199).
- Next.js 16: `params` and `searchParams` are Promises, typed inline. Base UI composition uses `render`, not `asChild`. Toasts via `runAction` from `@/lib/client/run-action`.

## Review Focus

1. A `'use server'` file that exports anything but async functions or types. Expected: the guard test in T0 fails. (T0, `use-server-exports.test.ts`)
2. A refresh of the demo chapter page right after the auto check started. Expected: no second AI call, because `demo` was removed from the URL. (T1, `check-panel.auto.test.tsx` asserts `history.replaceState` was called)
3. An AI issue that quotes a fact with leaked tags (`[F1][확정] …`) or an excerpt that is not in the wiki. Expected: the stored `wikiExcerpt` is the fact's `content` verbatim. (T2)
4. A fact range with end before start, or 0. Expected: `VALIDATION` with the fixed message, from the form and from the service. (T4)
5. Pressing the sample button twice. Expected: two separate works, both complete; no name clash error, because entries are per work. (T1, service test creates two samples for one user)

---

### Task 0: Production server-action crash and e2e stub env

**Files:**
- Create: `src/server/actions/ai-features-schemas.ts`
- Modify: `src/server/actions/ai-features.ts:42-55` (remove the exported `PlanDraftSchema`, import it)
- Modify: `src/server/ai-features.notes.s3.test.ts` (import the schema from the new module)
- Create: `src/server/actions/use-server-exports.test.ts`
- Modify: `package.json` script `e2e:ai-stub`

**Interfaces:**
- Produces: `PlanDraftSchema` exported from `@/server/actions/ai-features-schemas` (same zod definition, moved verbatim, file has no `'use server'`).

- [ ] **Step 1: Write the failing guard test** `src/server/actions/use-server-exports.test.ts`
  - Walk every `.ts`/`.tsx` file under `src/` (skip `*.test.*`). A file is a server-action file when its first statement is the directive `'use server'` or `"use server"`.
  - For each such file, collect every line that starts with `export `. Allowed: `export async function`, `export default async function`, `export type `, `export interface `. Everything else is a violation.
  - `it('exports only async functions and types from use server files')`: `expect(violations).toEqual([])`, where each violation is `` `${relativePath}: ${line}` ``.
- [ ] **Step 2: Run it and see it fail** — `pnpm vitest run src/server/actions/use-server-exports.test.ts --maxWorkers=2`. Expected: FAIL listing `src/server/actions/ai-features.ts: export const PlanDraftSchema = z.object({`.
- [ ] **Step 3: Move the schema.** Create `ai-features-schemas.ts` with `PlanDraftSchema` (move the definition and its `DraftPlanCardSchema` import as is). In `ai-features.ts`, `import { PlanDraftSchema } from './ai-features-schemas'` and delete the old definition. Update `ai-features.notes.s3.test.ts` so it reads `PlanDraftSchema` from the new module. Its assertions stay the same.
- [ ] **Step 4: e2e stub env.** In `package.json`, set `"e2e:ai-stub": "AI_SPEECH_STYLE=off tsx e2e/ai-stub/server.ts"`. Reason: the stub matches system prompts exactly, and the server already runs with `AI_SPEECH_STYLE=off`.
- [ ] **Step 5: Verify.**
  - `pnpm vitest run src/server/actions src/server/ai-features.notes.s3.test.ts --maxWorkers=2` → PASS.
  - `pnpm exec tsc --noEmit` → no errors.
  - `pnpm e2e` → 7 passed. Before this task `core-flow`, `editor-scroll` and `interview` failed.
- [ ] **Step 6: Commit** — `fix(actions): keep use server files to async exports; pin e2e stub speech style off`

### Task 1: Sample work with one click

**Files:**
- Create: `src/lib/sample-work.ts` (data only), `src/lib/sample-work.test.ts`
- Create: `src/server/sample-work.ts`, `src/server/sample-work.test.ts`
- Create: `src/server/actions/sample-work.ts`
- Create: `src/components/works/sample-work-button.tsx`, `src/components/works/sample-work-button.test.tsx`
- Create: `src/components/writing/sample-banner.tsx`
- Modify: `src/app/(app)/works/page.tsx` (header actions and empty state)
- Modify: `src/app/(app)/works/[workId]/chapters/[chapterId]/page.tsx` (read `searchParams.demo`)
- Modify: `src/components/writing/writing-workspace.tsx`, `src/components/writing/types.ts` (`WritingSidePanelProps`), `src/components/writing/side-panel.tsx`, `src/components/writing/panels/check-panel.tsx`
- Create: `src/components/writing/panels/check-panel.auto.test.tsx`
- Create: `e2e/sample-work.spec.ts`

**Interfaces:**
- Consumes: T0 (the chapter screen's server actions work again).
- Produces:
  - `SAMPLE_WORK` in `@/lib/sample-work`:
    ```ts
    export const SAMPLE_WORK: {
      title: string // '잿빛 종루 (샘플)'
      genre: string // '판타지'
      logline: string // '어머니의 편지를 쫓아 항구 도시에 온 소녀 세린의 이야기.'
      entries: { key: string; name: string; kind: EntryKind; aliases: string[]; summary: string }[]
      facts: { entryKey: string; content: string }[] // all confirmed, sourceType 'author'
      chapters: { title: string; body: string }[] // positions 1..3
      threads: { title: string; description: string; status: 'planned' | 'planted'; plantedChapter: number | null; targetChapterPosition: number; importance: Importance }[]
      plantedErrors: { chapter: number; quote: string }[] // exactly 3
      landingChapter: 3
    }
    ```
  - `createSampleWork(db: Db, actor: Actor): Promise<{ workId: string; chapterId: string }>` in `@/server/sample-work` (`chapterId` is the landing chapter).
  - `createSampleWorkAction(): Promise<ActionResult<{ workId: string; chapterId: string }>>` in `@/server/actions/sample-work`.
  - `WritingWorkspace` prop `autoCheck?: boolean`. `WritingSidePanelProps.autoCheck?: boolean`. `CheckPanel` prop `autoRun?: boolean`.

**Sample data (exact):**
- entries, aliases, summaries and the 5 facts: copy from `eval/fixtures/continuity-planted/work.json`. The keys are serin, doyunseo, jongru, key and harbor.
- chapters: titles `청해항 입항`, `잿빛 종루 아래`, `열한 층`; bodies are the trimmed text of `eval/fixtures/continuity-planted/chapters/01.md`–`03.md`, copied verbatim.
- plantedErrors:
  - 2: `19살의 세린은 말없이 고개를 숙였다`
  - 3: `종루지기가 열한 층 꼭대기에서 손을 흔들었다`
  - 3: `윤서는 왼손에 단검을 쥐고 문 앞에 섰다`
- threads:
  1. `어머니의 편지`: '세린이 품은 편지. 봉인은 아직 뜯지 않았다.', planted 1화, target 5, high.
  2. `불 꺼진 종루`: '종루는 밤이 되어도 불을 켜지 않는다. 이유는 아직 모른다.', planted 2화, target 2, medium. This one must come out overdue once 3화 exists; if `isOverdue` in `src/server/threads.ts` needs another target, use the smallest target that makes it overdue.
  3. `탑 벽의 표식`: '탑 입구 벽에 누군가 긁어 놓은 표식.', planned, target 6, low.

**Fixed copy:**
- Button: `샘플 작품으로 체험하기`. While pending: `만드는 중…`.
- Toast on success: `샘플 작품을 만들었습니다.`
- Banner title: `샘플 작품`.
- Banner body: `1~3화 원고에 설정 오류 3곳을 심어 두었습니다. 2화에 1곳, 3화에 2곳입니다. 점검 결과에서 원고 문장과 위키 근거를 나란히 확인해 보세요.`
- Banner links: `2화 점검하기` (on chapter 3) or `3화 점검하기` (on chapter 2), each to that chapter with `?demo=1`, plus `설정 보드 보기` to `/works/{workId}/wiki`.

- [ ] **Step 1: Data test** `src/lib/sample-work.test.ts`:
  - `it('copies chapters 1-3 and the facts of the planted eval set verbatim')`: read the fixture files and compare. Each `SAMPLE_WORK.chapters[i].body` equals the trimmed `0{i+1}.md`. Each fact content equals the fixture fact for that entry.
  - `it('quotes each planted error verbatim in its chapter')`: there are 3 errors, and each `chapters[chapter-1].body` contains its `quote`.
- [ ] **Step 2:** Run it and see it fail (module missing). Write `src/lib/sample-work.ts` and run it again (PASS).
- [ ] **Step 3: Service test** `src/server/sample-work.test.ts` (the test users come from `@/test/factories`):
  - `it('builds the sample work with cards, confirmed facts, 3 chapters and 3 threads')`. Assert:
    - `listEntries` gives 5 entries.
    - `listFacts` gives 5 facts, all with status `confirmed`.
    - `listChapters` gives positions [1,2,3], and chapter 3's body contains `윤서는 왼손에 단검을 쥐고`.
    - `listThreads` gives 3 threads, and the one titled `불 꺼진 종루` has `overdue === true`.
    - The returned `chapterId` is chapter 3's id.
  - `it('records change_log for the wiki rows')`: at least 5 rows with `entityType` for entries exist in `change_log` for the work. Use the change log reader that `src/server/changes.ts` exposes.
  - `it('makes a second sample work for the same user without errors')`.
  - `it('lets only the creator see the work')`: another user gets `NOT_FOUND` from `getWork`.
- [ ] **Step 4: Implement `createSampleWork`.** Steps:
  1. `createWork` with title, genre and logline.
  2. `createEntry` for each entry, keeping a key → id map.
  3. `createFact` with `status: 'confirmed'`, `sourceType: 'author'`, `entryId`.
  4. `createChaptersBulk` with `status: 'done'` and `versionSource: 'import'`.
  5. `createThread` with `plantedChapterId` from the position → id map.
  6. Return the id of chapter 3.

  Sequential calls are fine: each service owns its transaction.
- [ ] **Step 5: Action.** In `src/server/actions/sample-work.ts`: `'use server'`, then `withAction(async (db, actor) => { const r = await createSampleWork(db, actor); revalidateWork(r.workId); return r })`. There is no input to parse.
- [ ] **Step 6: Button.**
  - Create `SampleWorkButton` (client, `variant` prop passed to `Button`). On click it calls `runAction(createSampleWorkAction(), { success: '샘플 작품을 만들었습니다.' })`.
  - On success it calls `router.push(`/works/${workId}/chapters/${chapterId}?demo=1`)`.
  - It is disabled while pending.
  - Place it on `/works` in the `PageHeader` actions before `새 작품` (variant `outline`), and in the empty state next to `새 작품 만들기`.
  - Test `sample-work-button.test.tsx`: mock the action module and `next/navigation`. Click, then expect `push` to be called with `/works/w1/chapters/c3?demo=1`.
- [ ] **Step 7: Auto check path.**
  - Chapter page: add `searchParams: Promise<{ demo?: string }>`, `const demo = (await searchParams).demo === '1'`.
  - When `demo` is on, render `<SampleBanner workId chapterPosition chapters />` above the workspace. Use `data`'s chapter list; read `loadWritingData` for the field name. Pass `autoCheck={demo}` to `WritingWorkspace`.
  - `WritingWorkspace` passes `autoCheck` to `WritingSidePanel`. That sets the initial tab to `'check'` when `autoCheck`, and passes `autoRun={autoCheck}` to `CheckPanel`.
  - `CheckPanel` with `autoRun`:
    - Runs `runCheck({ openApproval: false })` once after mount (guard with a ref), and only when `editable`.
    - Then calls `window.history.replaceState(null, '', window.location.pathname)`.
    - `runCheck` gains an `opts?: { openApproval?: boolean }` (default true). With `openApproval: false` the approval dialog is not opened.
- [ ] **Step 8: Panel test** `check-panel.auto.test.tsx`. Render `CheckPanel` with `autoRun` and a stubbed `postAction`/`api.saveNow` (follow the mocking style of existing `check-panel*.test.tsx`).
  - `it('runs the check once on mount and drops demo from the URL')`: the check POST is called exactly once, even after a rerender, and `history.replaceState` is called.
  - `it('does not open the approval dialog in auto mode')`: the result has 1 proposal, and no `dialog` role is present.
  - `it('does not run without autoRun')`.
- [ ] **Step 9: e2e** `e2e/sample-work.spec.ts`:
  - `signUp`, then click `샘플 작품으로 체험하기`.
  - Expect the URL to match `/works/[^/]+/chapters/[^/]+` and the banner text `샘플 작품` to be visible.
  - Expect `region` `회차 점검` to show `윤서는 왼손에 단검을 쥐고 문 앞에 섰다.` and `도윤서는 단검을 오른손에 쥔다.` within 60 s. The e2e stub flags hand contradictions only.
  - Expect no `dialog` to be visible.
  - Reload, wait 3 s, and expect the stub to have received no second check call. Assert that the panel still shows the same single issue and no `점검을 마쳤습니다.` toast appears again.
  - Run `pnpm e2e e2e/sample-work.spec.ts` → PASS.
- [ ] **Step 10: Verify** — `pnpm vitest run src/lib/sample-work.test.ts src/server/sample-work.test.ts src/components/works src/components/writing --maxWorkers=2` → PASS; tsc and eslint clean on the touched files.
- [ ] **Step 11: Commit** — `feat(demo): one-click sample work that opens chapter 3 and runs the check`

### Task 2: Wiki evidence is the original wiki text

**Files:**
- Create: `src/ai/pack-refs.ts`, `src/ai/pack-refs.test.ts`
- Modify: `src/ai/tasks/continuity-check.ts` (`resolveContinuityIssues`, and `locateIssues` so it keeps the resolved fact and entry objects)
- Test: `src/ai/tasks/continuity-check.evidence.test.ts`

**Interfaces:**
- Produces: `stripPackRefs(text: string): string` in `@/ai/pack-refs`.
- `ResolvedContinuityIssue.wikiExcerpt` keeps its type; only its value changes.

- [ ] **Step 1: Tests for `stripPackRefs`:**
  - `'[F1][확정] 서윤은 왼손잡이다.'` → `'서윤은 왼손잡이다.'`
  - `'[E2] 잿빛 종루'` → `'잿빛 종루'`
  - `'위키 F1에 따르면 서윤은 왼손잡이로 확정되어 있는데'` → `'위키에 따르면 서윤은 왼손잡이로 확정되어 있는데'`
  - `'설정 F12와 다릅니다'` → `'설정과 다릅니다'`. The particle follows the word before the ref, so `와` becomes `과` after `설정`. Keep it simple: when the ref sits between a noun and a particle, drop the ref and pick the particle form for the noun's last syllable with `es-hangul` (`josa`), which is already a dependency.
  - Text without refs comes back unchanged, e.g. `'F1 레이스를 봤다'` stays as is: a bare ref with no wiki word before it is not touched.
- [ ] **Step 2: Implement** `stripPackRefs`. Rules:
  - Remove bracketed tokens `[F\d+]`, `[E\d+]`, `[T\d+]`, `[확정]`, `[가정]`, `[미정]` and the spaces after them.
  - Rewrite `(위키|설정|사실|카드) [FET]\d+<particle>` to the word plus the right particle form.
  - Trim.
- [ ] **Step 3: Evidence tests** `continuity-check.evidence.test.ts` with a hand-built `ContextPack` (one entry `E1` 서윤 with summary `왼손잡이 검사.` and fact `F1` `서윤은 왼손잡이다.`):
  - An issue with `factRef: 'F1'` and `wikiExcerpt: '[F1][확정] 서윤은 왼손잡이다'` resolves to `wikiExcerpt === '서윤은 왼손잡이다.'`.
  - An issue with `factRef: 'F1'` and a paraphrase `'서윤은 왼손을 쓴다'` also resolves to `'서윤은 왼손잡이다.'`.
  - An issue with only `entryRef: 'E1'` and excerpt `'왼손잡이 검사.'` keeps it, because it appears in the summary.
  - An issue with only `entryRef: 'E1'` and excerpt `'오른손잡이'` (not in the card) resolves to the summary `'왼손잡이 검사.'`.
  - `explanation: '위키 F1에 따르면 다릅니다'` resolves to `'위키에 따르면 다릅니다'`.
- [ ] **Step 4: Implement** in `resolveContinuityIssues`:
  - `wikiExcerpt = fact ? fact.content : entry ? (entryText(entry).includes(stripPackRefs(ai)) && stripPackRefs(ai) ? stripPackRefs(ai) : entry.summary || stripPackRefs(ai)) : stripPackRefs(ai)`
  - `entryText` joins the name, aliases, summary and field values.
  - `explanation = stripPackRefs(explanation)`.
  - Leave `postProcess`'s output shape alone; the stored run output may keep the AI text.
- [ ] **Step 5: Verify** — `pnpm vitest run src/ai --maxWorkers=2` and `pnpm vitest run src/server/chapter-check --maxWorkers=2` → PASS. Update existing expectations only where they asserted the AI-copied excerpt, and say so in the commit body.
- [ ] **Step 6: Commit** — `fix(check): show the wiki's own text as evidence and drop leaked refs`

### Task 3: Edit a schedule item

**Files:**
- Modify: `src/components/schedule/schedule-item-form.tsx`, `src/components/schedule/schedule-item-list.tsx`
- Test: `src/components/schedule/schedule-item-form.edit.test.tsx`

**Interfaces:**
- `ScheduleItemForm` gains `item?: ScheduleItemView` and `onDone?: () => void`. `ScheduleItemView` is exported by `schedule-item-list.tsx`; extend it only if it lacks `kind`, `title`, `date`, `endDate`, `chapterId` or `note`.

- [ ] **Step 1: Test** `it('saves changes to an existing item through updateScheduleItemAction')`.
  - Render the form with an item `{ id: 'i1', kind: 'deadline', title: '마감', date: '2026-11-10', … }`.
  - Change the title to `3화 마감` and press `저장`.
  - Expect `updateScheduleItemAction` to be called with `expect.objectContaining({ itemId: 'i1', title: '3화 마감' })`, and `onDone` to be called.
  - A second test: without `item`, the submit button reads `추가` and calls `createScheduleItemAction` as before.
- [ ] **Step 2: Implement.**
  - With `item`, the fields start from it, the submit label is `저장`, the action is `updateScheduleItemAction({ itemId, kind, title, date, endDate, chapterId, note })`, and the toast is `일정을 고쳤습니다.`.
  - In the list, when `canEdit`, each item gets a `수정` button that opens a `Dialog` (title `일정 수정`) holding the form with `item` and `today={item.date}`. `onDone` closes it.
- [ ] **Step 3: Verify** — `pnpm vitest run src/components/schedule --maxWorkers=2` → PASS.
- [ ] **Step 4: Commit** — `feat(schedule): edit an existing schedule item`

### Task 4: Fact valid range inputs

**Files:**
- Modify: `src/components/wiki/fact-form.tsx`, `src/server/facts.ts` (`createFact`, `updateFact`)
- Test: `src/server/facts.valid-range.test.ts`, `src/components/wiki/fact-form.valid-range.test.tsx`

**Fixed copy:** labels `유효 시작 회차`, `유효 끝 회차`; help text `비워 두면 처음부터 끝까지 유효합니다.`. Errors:
- `유효 회차는 1 이상으로 적어 주세요.`
- `끝 회차는 시작 회차보다 앞설 수 없습니다.`

- [ ] **Step 1: Service tests:**
  - `createFact` with `validFromPosition: 3` stores 3 and leaves `validToPosition` null.
  - `validFromPosition: 0` → `AppError` `VALIDATION` with the first message.
  - `validFromPosition: 5, validToPosition: 2` → `VALIDATION` with the second message.
  - `updateFact` checks the merged range: changing only `validToPosition` to 1 on a fact that starts at 3 → second message.
- [ ] **Step 2: Implement** `assertValidRange(from, to)` in `facts.ts` and call it from both services. `updateFact` merges the patch with the stored row first.
- [ ] **Step 3: Form test:**
  - Fill `유효 시작 회차` with `3`, then save. Expect `createFactAction` to be called with `validFromPosition: 3, validToPosition: null`.
  - Editing a fact that has `validFromPosition: 2` shows `2` in the input.
- [ ] **Step 4: Implement the inputs.** Use two `type="number"` inputs with `min={1}`; an empty input means null. The form checks the range before calling the action and shows the error with `toast.error`. The props type gains `validFromPosition`/`validToPosition` where `fact` is described.
- [ ] **Step 5: Verify** — `pnpm vitest run src/server/facts src/components/wiki --maxWorkers=2` → PASS.
- [ ] **Step 6: Commit** — `feat(wiki): set the chapter range a fact holds for`

### Task 5: README

**Files:** Modify: `README.md`

- [ ] **Step 1:** Rename the heading `### AI 연재 보조 (\`feat/lean-harness\` 브랜치, 작업 중)` to `### AI 연재 보조`.
- [ ] **Step 2:** Replace `아래 기능은 아직 main에 합쳐지지 않았습니다.` with `2026-10-30에 main에 합쳐졌습니다(de76da9).`
- [ ] **Step 3:** Replace `` `feat/lean-harness` 브랜치에서 더한 AI 설정입니다. `` with `AI 연재 보조에 쓰는 설정입니다.`
- [ ] **Step 4:** Under `## 주요 기능`, add as the first item: `- **샘플 작품 체험**: \`내 작품\` 의 \`샘플 작품으로 체험하기\` 를 누르면 인물·설정 카드와 설정 오류 3곳을 심은 원고 3화가 든 작품이 만들어지고, 3화 회차 점검이 바로 돌아갑니다.`
- [ ] **Step 5:** `grep -n "feat/lean-harness\|합쳐지지" README.md` → no line that still says the harness is unmerged. Run `pnpm exec prettier --check README.md`; if the check fails, run `pnpm exec prettier --write README.md`.
- [ ] **Step 6: Commit** — `docs(readme): harness is merged; add the sample work`

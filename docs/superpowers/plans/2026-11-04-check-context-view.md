# Check Context View and Korean Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The check tab can show exactly which wiki settings the chapter check sends to the AI. No English text leaks into the UI.

**Architecture:**
- The check's context-pack call moves into one exported function, `buildCheckPack`. Two places use it:
  - `runChapterCheck`
  - a new read-only service, `describeCheckContext`. It turns the pack into a display view.
- A server action exposes the view. A collapsible section in the check panel loads it on demand.
- The copy fixes are separate:
  - two shadcn UI files
  - a root `not-found.tsx`
  - an e2e scan that fails on English words in the main screens

**Tech Stack:** Next.js 16 App Router, Drizzle on PGlite in tests, Vitest + Testing Library, Playwright e2e with the AI stub.

**Spec:** `docs/superpowers/specs/2026-11-04-check-context-view-design.md`

## Global Constraints

- User-facing copy is Korean, exactly as written in this plan. Identifiers and comments are English.
- No new packages, no lockfile change, no DB migration.
- Services throw `AppError`. Actions never throw; they return `ActionResult` through `withAction`. A `'use server'` file exports only async functions, plus `export type`.
- Non-members always get `NOT_FOUND`.
- Service tests use `const db = await createTestDb()` in `beforeEach`, with data from `@/test/factories`. Component tests start with `// @vitest-environment jsdom`. Never call a real AI API.
- Tests: `pnpm vitest run <paths> --maxWorkers=2`. Types: `pnpm exec tsc --noEmit` (only your files). Lint: `pnpm eslint <files>`. Format with `pnpm exec prettier --write <files>`.
- Do not delete or weaken existing tests.

## Review Focus

1. **The view drifts from what the check sends.** A card in the view must be in the check's prompt. A card not named in the manuscript must be in neither. Pinned by Task 1, `lists the same cards the check sends`.
2. **Facts outside their valid range.** A fact valid from chapter 5 must not show for chapter 3. Pinned by Task 1, `shows only facts valid at the chapter`.
3. **Budget trim.** A work with many long cards must list the cut cards under the trimmed names, not drop them silently. Pinned by Task 1, `names the cards the budget cut`.
4. **Viewer and outsider.** A viewer can read the view. A non-member gets `NOT_FOUND`. Pinned by Task 1, `lets a viewer read it and hides it from outsiders`.
5. **Stale view after a check.** When the section is open and a check finishes, it reloads. Pinned by Task 2, `reloads when a check finishes while open`.

---

### Task 1: One check pack and a read-only view of it

**Files:**
- Modify: `src/server/chapter-check.ts` (extract `buildCheckPack`, use it in `runChapterCheck`)
- Create: `src/server/check-context.ts`
- Create: `src/server/check-context.test.ts`
- Modify: `src/server/actions/checks.ts` (add `getCheckContextAction`)

**Interfaces:**
- Consumes:
  - `buildContextPack(db, workId, { text, position, keepNamed, budgetChars })`
  - `ContextPack` and `CONTINUITY_BUDGET_CHARS` from `@/ai/context`
  - `requireRowWork` and `requireWorkRole` from `@/server/access`
- Produces:

```ts
// src/server/chapter-check.ts
/** The context pack the chapter check sends to the continuity check. One source for the check and its view. */
export async function buildCheckPack(
  db: Db,
  workId: string,
  chapter: { body: string; position: number },
): Promise<ContextPack>

// src/server/check-context.ts
export type CheckContextFact = {
  id: string
  content: string
  status: FactStatus
  validFromPosition: number | null
  validToPosition: number | null
}
export type CheckContextEntry = { id: string; name: string; kind: EntryKind; facts: CheckContextFact[] }
export type CheckContextThread = {
  id: string
  title: string
  status: ThreadStatus
  targetPosition: number | null
  overdue: boolean
}
export type CheckContextView = {
  position: number
  entries: CheckContextEntry[]
  /** Names of chosen cards that the budget cut, in pack order. */
  trimmedEntryNames: string[]
  threads: CheckContextThread[]
  previousSummaries: { position: number; title: string }[]
  relationCount: number
  namingRuleCount: number
  /** Active cards in the work. */
  totalEntries: number
}
/** What the chapter check would send for the saved chapter text. Any member may read it. Never calls the AI. */
export async function describeCheckContext(
  db: Db,
  actor: Actor,
  input: { chapterId: string },
): Promise<CheckContextView>

// src/server/actions/checks.ts
export async function getCheckContextAction(input: unknown): Promise<ActionResult<CheckContextView>>
```

Rules:
- `describeCheckContext`:
  - Calls `requireRowWork(db, 'chapters', chapterId)`, then `requireWorkRole(db, workId, actor.userId, 'viewer')`.
  - Loads the chapter. A missing or archived chapter throws `AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')`.
  - Calls `buildCheckPack`.
- `trimmedEntryNames` are the ids in `pack.chosenEntryIds` that are not in `pack.entries`. Look up their names in `wiki_entries`, in `chosenEntryIds` order.
- `totalEntries` is `pack.stats.totalEntries`.
- `getCheckContextAction` parses `{ chapterId: z.uuid() }` and calls the service inside `withAction`. It does not revalidate, because it only reads.

- [ ] **Step 1: Write the failing tests** in `src/server/check-context.test.ts`. Each one sets up a work, an owner and chapter 3 through the factories.
  - `it('lists the same cards the check sends')`:
    - Cards `서윤` (with a confirmed fact `서윤은 왼손잡이다.`) and `한세린` (no mention).
    - Chapter 3 body: `서윤은 오른손으로 검을 쥐었다.`
    - The view has one entry, named `서윤`. Its fact has content `서윤은 왼손잡이다.` and status `confirmed`.
    - Run `runChapterCheck(db, actor, { chapterId }, fake)` with a `FakeAiClient`. Its recorded `continuity-check` prompt contains `서윤` and not `한세린`.
  - `it('shows only facts valid at the chapter')`:
    - Facts on `서윤`: one with `validFromPosition: 5`, one with `validToPosition: 2`, and one with no range.
    - Only the fact with no range is in the view for chapter 3.
    - It keeps `validFromPosition: null` and `validToPosition: null`.
  - `it('names the cards the budget cut')`:
    - Create enough named cards with long summaries and facts to pass `CONTINUITY_BUDGET_CHARS`. All of them are named in the body.
    - If `keepNamed` keeps every named card, assert `trimmedEntryNames` is `[]` instead. In that case also give the work non-named always-tier cards (`contextTier: 'always'`, if the factory supports it) that get cut, and assert their names appear.
    - Read `buildContextPack`'s trim rules in `src/ai/context.ts` first, and write whichever case the rules produce. Assert exact names.
  - `it('lists open threads, previous summaries and counts')`:
    - An open thread `어머니의 편지` with target 2 at chapter 3 shows `overdue: true` and `targetPosition: 2`.
    - A resolved thread is absent.
    - Chapters 1 and 2 with summaries give `previousSummaries` of `[{ position: 1, … }, { position: 2, … }]`, in the order the pack gives.
    - `relationCount` and `namingRuleCount` match the rows created.
  - `it('lets a viewer read it and hides it from outsiders')`:
    - A `viewer` member gets the view.
    - A user with no membership gets `AppError` with code `NOT_FOUND`.
    - An archived chapter gives `NOT_FOUND`.
  - Add a short action test to the existing `src/server/actions` tests, or a new `checks.context.test.ts`. Follow how other action tests mock the session. An invalid `chapterId` resolves `{ ok: false }` with code `VALIDATION`.

- [ ] **Step 2: Run them and see them fail**
  - Run: `pnpm vitest run src/server/check-context.test.ts --maxWorkers=2`
  - Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement** `buildCheckPack`, then `describeCheckContext`, then `getCheckContextAction`. `runChapterCheck` must call `buildCheckPack(db, workId, chapter)` in place of its inline `buildContextPack` call, with no other change to its behavior.

- [ ] **Step 4: Run the new tests and the existing check tests**
  - Run: `pnpm vitest run src/server/check-context.test.ts src/server/chapter-check src/server/actions --maxWorkers=2`
  - Expected: PASS. Do not change any existing chapter-check test.
  - tsc and eslint on the touched files: clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/chapter-check.ts src/server/check-context.ts src/server/check-context.test.ts src/server/actions/checks.ts src/server/actions/*.test.ts
git commit -m "feat(check): read-only view of the settings the chapter check sends"
```

### Task 2: `AI가 참고한 설정` section in the check panel

**Files:**
- Modify: `src/lib/labels.ts` (add `factValidityText`)
- Modify: `src/lib/labels.test.ts`, or create it if missing
- Modify: `src/components/wiki/fact-list.tsx` (use `factValidityText`, delete its local `validityText`)
- Create: `src/components/writing/panels/check-context.tsx`
- Create: `src/components/writing/panels/check-context.test.tsx`
- Modify: `src/components/writing/panels/check-panel.tsx`

**Interfaces:**
- Consumes:
  - `getCheckContextAction`
  - `CheckContextView` (type-only, from `@/server/check-context`)
  - `ENTRY_KIND_LABEL`, `FACT_STATUS_LABEL`, `THREAD_STATUS_LABEL` and `chapterLabel` from `@/lib/labels`
  - `runAction`
- Produces:

```ts
// src/lib/labels.ts
/** Valid range of a fact: "3화부터 ~5화", "3화부터", "~5화", or null when open on both ends. */
export function factValidityText(from: number | null, to: number | null): string | null

// src/components/writing/panels/check-context.tsx ('use client')
export function CheckContext(props: {
  workId: string
  chapterId: string
  position: number
  /** Changes when a check finishes; an open section reloads then. */
  refreshKey: unknown
}): JSX.Element
```

UI rules and exact copy for `CheckContext`:
- **Closed:** an outline small button `AI가 참고한 설정 보기`. When open, the same button reads `접기`. It has `aria-expanded`.
- **Opening:** calls `runAction(getCheckContextAction({ chapterId }))`.
  - While waiting, show `불러오는 중…`.
  - A failure shows the toast (from runAction), and the section shows `불러오지 못했습니다.`
- **While open:** a change of `refreshKey` reloads. Closing and opening again also reloads.
- **Content** is inside `<section aria-label="AI가 참고한 설정">`.
  - The intro line: `회차 점검은 저장된 원고에 나온 카드와 ${position}화에 유효한 사실, 열린 떡밥, 앞 회차 요약만 AI에 보냅니다.`
  - **Cards:**
    - Heading `설정 카드 ${entries.length}개 (전체 ${totalEntries}개 중)`.
    - Each card shows its name as a link to `/works/${workId}/wiki/entries/${id}`, a `Badge` with `ENTRY_KIND_LABEL[kind]`, and a list of facts.
    - Each fact shows its content, a `Badge` with `FACT_STATUS_LABEL[status]`, and `factValidityText(...)` when it is not null.
    - With no entries, show `원고에 이름이 나온 설정 카드가 없습니다.` in place of the list.
  - **Trimmed cards:** only when the list is not empty, `분량 한도로 빠진 카드: ${names.join(', ')}`.
  - **Threads:** only when there are threads.
    - Heading `열린 떡밥 ${threads.length}개`.
    - Each row: the title, `THREAD_STATUS_LABEL[status]`, `회수 목표 ${t}화` when the target is set, and a destructive `Badge` `회수 목표 지남` when overdue.
  - **Previous summaries:** only when there are any. Heading `앞 회차 요약`, then each item as `chapterLabel(position, title)`.
  - **Counts:** only when either count is above 0, `관계 ${relationCount}개, 이름 규칙 ${namingRuleCount}개도 함께 보냅니다.`
- **CheckPanel** renders `<CheckContext workId={data.workId} chapterId={data.chapter.id} position={data.chapter.position} refreshKey={checkedKey} />`.
  - Place it right under the controls row, above the issue list.
  - `checkedKey` is a state counter. It goes up when a manual `runCheck` finishes (successfully) and when a new auto-check `result` arrives (in the existing previous-value block).
  - Show it for every role, since viewers may read the view.

- [ ] **Step 1: Write the failing tests**
  - `src/lib/labels.test.ts`, `it('formats a fact validity range')`:
    - `(3, 5)` gives `'3화부터 ~5화'`.
    - `(3, null)` gives `'3화부터'`.
    - `(null, 5)` gives `'~5화'`.
    - `(null, null)` gives `null`.
  - `src/components/writing/panels/check-context.test.tsx`, which mocks `@/server/actions/checks` and `sonner`:
    - `it('loads the view when opened and lists cards, facts and threads')`:
      - The view has one entry `서윤` (`character`) with a fact `서윤은 왼손잡이다.` (`confirmed`, range 3 to null), plus `trimmedEntryNames: ['한세린']`.
      - It has one overdue thread `어머니의 편지` (`planted`, target 2), previous summaries `[{ position: 2, title: '잿빛 종루 아래' }]`, `relationCount: 1`, `namingRuleCount: 0` and `totalEntries: 5`.
      - Nothing loads before the click.
      - After clicking `AI가 참고한 설정 보기`, all of these show:
        - the intro sentence for position 3
        - `설정 카드 1개 (전체 5개 중)`
        - a link `서윤` with href `/works/w1/wiki/entries/e1`
        - `인물`, `서윤은 왼손잡이다.`, `확정` and `3화부터`
        - `분량 한도로 빠진 카드: 한세린`
        - `열린 떡밥 1개`, `회수 목표 2화` and `회수 목표 지남`
        - `앞 회차 요약`, plus the label `chapterLabel(2, '잿빛 종루 아래')` produces
        - `관계 1개, 이름 규칙 0개도 함께 보냅니다.`
      - Use the real label constants for kind, status and thread status, not hard-coded guesses.
    - `it('shows the empty card message')`: with `entries: []`, `원고에 이름이 나온 설정 카드가 없습니다.` shows.
    - `it('reloads when a check finishes while open')`: open the section. Rerender with a new `refreshKey`. The action was called twice. Rerender while closed with another key, and it was not called again.
    - `it('shows an error line when loading fails')`: the action resolves `{ ok: false, error: { code: 'NOT_FOUND', message: '회차를 찾을 수 없습니다.' } }`, so the section shows `불러오지 못했습니다.`
  - In an existing check-panel test file (for example `check-panel.test.tsx`), add `it('renders the check context toggle')`. The button `AI가 참고한 설정 보기` is present. Mock `@/server/actions/checks` if the file does not already.

- [ ] **Step 2: Run them and see them fail**
  - Run: `pnpm vitest run src/lib/labels.test.ts src/components/writing/panels/check-context.test.tsx --maxWorkers=2`
  - Expected: FAIL.

- [ ] **Step 3: Implement** `factValidityText`, then switch `fact-list.tsx` to it with no visible change, then build `CheckContext` and wire it into `CheckPanel`.

- [ ] **Step 4: Run the tests**
  - Run: `pnpm vitest run src/lib/labels.test.ts src/components/writing src/components/wiki --maxWorkers=2`
  - Expected: PASS. Existing fact-list tests still pass unchanged.
  - tsc and eslint on the touched files: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labels.ts src/lib/labels.test.ts src/components/wiki/fact-list.tsx src/components/writing/panels/check-context.tsx src/components/writing/panels/check-context.test.tsx src/components/writing/panels/check-panel.tsx src/components/writing/panels/check-panel.test.tsx
git commit -m "feat(check): show the settings the AI gets in the check tab"
```

### Task 3: Korean copy, with an e2e guard

Independent of Tasks 1–2: different files. It may run in its own worktree at the same time.

**Files:**
- Modify: `src/components/ui/dialog.tsx` (`Close` → `닫기`, twice)
- Modify: `src/components/ui/sheet.tsx` (`Close` → `닫기`)
- Create: `src/app/not-found.tsx`
- Create: `e2e/korean-copy.spec.ts`
- Modify: any user-facing copy the e2e finds, but only the copy text itself. List each one in the report.

**Interfaces:** none shared with other tasks.

- [ ] **Step 1: Copy fixes**
  - `dialog.tsx` and `sheet.tsx`: the `sr-only` text of the X button becomes `닫기`. In `dialog.tsx` the footer close button's visible `Close` also becomes `닫기`.
  - Grep `e2e/` and `src/` for tests that look for a button named `Close`, and update them.
  - `src/app/not-found.tsx` (root): a server component that mirrors `src/app/(app)/not-found.tsx`.
    - `EmptyState` title `페이지를 찾을 수 없습니다`, description `주소가 바뀌었거나 볼 수 없는 페이지입니다.`
    - A `Link` styled `buttonVariants({ variant: 'outline' })` to `/` with the text `처음으로 가기`. `/` redirects to `/works` or `/login`.

- [ ] **Step 2: E2E guard** `e2e/korean-copy.spec.ts`, `test('main screens show no English words')`, with `test.setTimeout(180_000)`.
  - **Setup:**
    - `signUp` with a unique email.
    - Click `샘플 작품으로 체험하기`.
    - Wait for the chapter URL and for the check to finish. The issue list shows, as in `e2e/sample-work.spec.ts`.
    - Read `workId` from the URL.
  - **Pages to visit:**
    - `/works`
    - `/works/{id}`
    - `/works/{id}/chapters`
    - the chapter page with the `점검` tab, with `AI가 참고한 설정 보기` clicked once Task 2 has merged. Before that, skip the click if the button is absent.
    - `/works/{id}/wiki`, plus each tab inside it, including the thread ledger
    - `/works/{id}/approvals`
    - `/works/{id}/history`
    - `/works/{id}/schedule`
    - `/works/{id}/settings`
    - `/works/{id}/import`
    - `/works/{id}/interview`
    - `/no-such-page-e2e` (the root 404)
  - **Per page:**
    - Wait for the main content.
    - Collect `document.body.innerText`, plus every `aria-label`, `title` and `placeholder` attribute value.
    - Remove the signed-up email.
    - Find words with `/[A-Za-z][A-Za-z'’.-]*[A-Za-z]/g` of length ≥ 3.
    - Drop words on the allowlist: `txt`, `md`, `docx`, `zip`, `HWP`, `PDF`, `json`. Compare case-insensitively.
    - Collect `{ page, word }` pairs.
    - Run `expect(found, JSON.stringify(found, null, 2)).toEqual([])` once at the end, so one run lists every leak.
  - The AI stub's sample-check output and the manuscript are Korean, so they should not produce hits. If AI-written text does produce hits, scope the text read to exclude the issue explanation paragraphs, and say so in the report.
  - The spec does not cover AI text.

- [ ] **Step 3: Run it, fix real leaks, and run it again**
  - Run: `pnpm e2e e2e/korean-copy.spec.ts`. Set a throwaway `BETTER_AUTH_SECRET`, and never copy `.env.local`.
  - For every word found:
    - if it is user-facing copy, replace it with plain short Korean in the source
    - if it is a file format or a proper name, add it to the allowlist with a comment
  - Do not add ordinary English words to the allowlist.
  - Expected: 1 passed.

- [ ] **Step 4: Run the touched unit tests and the other e2e specs**
  - Run: `pnpm vitest run src/components/ui src/app --maxWorkers=2`, plus the unit tests of any file whose copy changed.
  - Run: `pnpm e2e e2e/korean-copy.spec.ts e2e/core-flow.spec.ts e2e/sample-work.spec.ts`.
  - Expected: PASS. tsc and eslint on the touched files: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(copy): Korean close labels and 404 page, e2e guard against English UI text"
```

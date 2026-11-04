# Auto Check On Done Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an author changes a chapter from `초안` to `완료`, the chapter check runs once by itself. Its candidates land in 승인 대기 as usual.

**Architecture:**
- A client module `src/lib/client/auto-check.ts` owns the auto runs, keyed by chapter id. It is not a React component, so leaving the page does not abort a run.
- Each run calls the existing check route through `postAction`. Results are reported with toasts.
- The two status controls start it after a successful draft → done change:
  - the writing screen toolbar, in `WritingWorkspace`
  - the chapter list, in `ChapterTable`
- The check panel and the side panel read its running state.

**Tech Stack:** Next.js 16 client components, sonner toasts, Vitest + Testing Library (jsdom), Playwright e2e with the AI stub.

**Spec:** `docs/superpowers/specs/2026-11-04-auto-check-on-done-design.md`

## Global Constraints

- User-facing copy is Korean, exactly as written in this plan. Identifiers and comments are English.
- No new packages, no lockfile change, no DB migration, no server code change.
- The check route stays `POST /api/works/{workId}/chapters/{chapterId}/check` with body `{}`. The response is an `ActionResult<ChapterCheckResult>` (`@/server/chapter-check`).
- Component tests start with `// @vitest-environment jsdom`. Mock `sonner` the way `src/components/writing/writing-workspace.narrow.test.tsx` does.
- Tests: `pnpm vitest run <paths> --maxWorkers=2`. Types: `pnpm exec tsc --noEmit` (only your files). Lint: `pnpm eslint <files>`. Format with `pnpm exec prettier --write <files>`.
- Do not delete or weaken existing tests.

## Review Focus

1. **Leaving right after 완료.** The author marks a chapter done and opens the next chapter at once. The check keeps running and its finish toast still appears. Pinned by Task 2, `keeps running after the workspace unmounts`.
2. **Unsaved keystrokes at 완료.** The last edit must be saved before the check reads the chapter. Pinned by Task 2, `saves and starts the auto check after a draft is marked done` (call order).
3. **Double start.** A double click, or 완료 from both screens in one tab, runs one check. Pinned by Task 1, `runs one check per chapter at a time`.
4. **Usage limit or server error.** The author sees which chapter failed and why. The panel does not stay on `자동 점검 중`. Pinned by Task 1, `shows the server message when the check fails`.
5. **Back to 초안, or a failed status change.** Neither one runs a check. Pinned by Task 2's negative tests in both components.

---

### Task 1: Auto check runner and its panel state

**Files:**
- Create: `src/lib/client/auto-check.ts`
- Create: `src/lib/client/auto-check.test.ts`
- Modify: `src/components/writing/panels/check-panel.tsx`
- Create: `src/components/writing/panels/check-panel.auto-done.test.tsx`
- Modify: `src/components/writing/side-panel.tsx`
- Create: `src/components/writing/side-panel.auto-done.test.tsx`

**Interfaces:**
- Consumes:
  - `postAction<T>(url, body, { signal })` from `@/lib/client/post-json`. It never throws. An aborted signal resolves to `{ ok: false, error: { code: 'CANCELLED', … } }`.
  - `ChapterCheckResult` from `@/server/chapter-check` (type-only import).
- Produces (file `src/lib/client/auto-check.ts`, first line `'use client'`):

```ts
export type AutoCheckInput = {
  workId: string
  chapterId: string
  /** Chapter number shown in the toasts. */
  position: number
  /** Runs after a finished check, e.g. router.refresh. Not called on failure or cancel. */
  onDone?: () => void
  /** Opens a path for the toast's approvals button, e.g. router.push. */
  navigate?: (href: string) => void
}
/** Starts the check after a chapter was marked done, unless one already runs for that chapter. Returns whether it started. */
export function startAutoCheck(input: AutoCheckInput): boolean
/** Aborts the chapter's running auto check and shows `취소했습니다.`; no-op when none runs. */
export function cancelAutoCheck(chapterId: string): void
/** Running state for one chapter. elapsedSec counts whole seconds since the start, updated every second. */
export function useAutoCheck(chapterId: string): { running: boolean; elapsedSec: number }
/** Tests only: aborts every run and clears the state without toasts. */
export function resetAutoChecksForTests(): void
```

Behavior of `startAutoCheck`:
- If a run for `chapterId` exists, return `false` and do nothing else.
- Otherwise:
  - Store `{ controller: new AbortController(), startedAt: Date.now() }` under `chapterId` and notify subscribers.
  - Show `toast(`${position}화를 완료로 바꿨습니다. 회차 점검을 시작합니다.`)`.
  - Call `postAction<ChapterCheckResult>(`/api/works/${workId}/chapters/${chapterId}/check`, {}, { signal })`.
  - Return `true`.
- When the call settles, remove the entry only if it is still this run, and notify. Then:
  - **ok:**

    ```ts
    toast.success(`${position}화 점검을 마쳤습니다.`, {
      description: `지적 ${issues.length}건, 승인 대기 후보 ${proposals.length}건`,
      duration: 10_000,
    })
    ```

    - When `proposals.length > 0`, also add `action: { label: '승인 대기 보기', onClick: () => navigate?.(`/works/${workId}/approvals`) }`.
    - Then call `onDone?.()`.
  - **error code `CANCELLED`:** no toast. The cancel already showed one.
  - **any other error:** `toast.error(`${position}화 자동 점검을 하지 못했습니다.`, { description: error.message })`.
- `useAutoCheck` uses `useSyncExternalStore`. The server snapshot is "not running". Keep a one-second interval only while running.

- [ ] **Step 1: Write the failing tests** in `src/lib/client/auto-check.test.ts` (jsdom; mock `sonner` and `@/lib/client/post-json`; `afterEach(resetAutoChecksForTests)`):
  - `it('posts to the check route and reports the counts')`
    - `postAction` resolves `{ ok: true, data: { issues: [i1, i2], proposals: [p1, p2, p3], runIds: [], namingIssueCount: 0 } }`.
    - `startAutoCheck({ workId: 'w1', chapterId: 'c1', position: 3, onDone, navigate })` returns `true`.
    - `toast` was called with `'3화를 완료로 바꿨습니다. 회차 점검을 시작합니다.'`.
    - `postAction` was called with `'/api/works/w1/chapters/c1/check'`, `{}` and `{ signal: expect.any(AbortSignal) }`.
    - After it settles:
      - `toast.success` was called with `'3화 점검을 마쳤습니다.'` and an object whose `description` is `'지적 2건, 승인 대기 후보 3건'` and whose `action.label` is `'승인 대기 보기'`.
      - Calling `action.onClick()` calls `navigate('/works/w1/approvals')`.
      - `onDone` was called once.
  - `it('adds the approvals button only when there are candidates')`: with `proposals: []`, the options have no `action`, and the description is `'지적 0건, 승인 대기 후보 0건'` (with `issues: []`).
  - `it('runs one check per chapter at a time')`:
    - `postAction` stays pending. A second `startAutoCheck` for `c1` returns `false`, and `postAction` was called once.
    - A start for `c2` returns `true`.
  - `it('shows the server message when the check fails')`:
    - `postAction` resolves `{ ok: false, error: { code: 'AI_LIMIT', message: '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.' } }`.
    - `toast.error` was called with `'3화 자동 점검을 하지 못했습니다.'` and `{ description: '오늘 AI 사용량 한도를 넘었습니다. 내일 다시 시도해 주세요.' }`.
    - `onDone` was not called. A new `startAutoCheck` for `c1` returns `true`.
  - `it('cancels without an error toast')`:
    - Make `postAction` resolve CANCELLED when its signal aborts.
    - `cancelAutoCheck('c1')` aborts the signal, calls `toast('취소했습니다.')` once, and `toast.error` is never called.
  - `it('reports running and elapsed seconds through useAutoCheck')`:
    - Use fake timers and `renderHook`, with the call pending.
    - Before the start: `{ running: false, elapsedSec: 0 }`.
    - After the start and `vi.advanceTimersByTime(2000)` inside `act`: `{ running: true, elapsedSec: 2 }`.
    - After the call resolves: `running: false`.

- [ ] **Step 2: Run them and see them fail**
  - Run: `pnpm vitest run src/lib/client/auto-check.test.ts --maxWorkers=2`
  - Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement `src/lib/client/auto-check.ts`** as specified above. Keep module state in a `Map<string, { controller: AbortController; startedAt: number }>` and a `Set` of listeners.

- [ ] **Step 4: Run them and see them pass.** Same command. Expected: PASS.

- [ ] **Step 5: Write the failing panel tests**
  - `src/components/writing/panels/check-panel.auto-done.test.tsx`. Mock `@/lib/client/auto-check`, so `useAutoCheck` returns a value the test controls. Build the props the way `check-panel.auto.test.tsx` does.
    - `it('shows the auto check status instead of the check button while it runs')`:
      - With `{ running: true, elapsedSec: 5 }`, the text `자동 점검 중… 5초` is shown, and there is no button named `회차 점검`.
      - With `{ running: false, elapsedSec: 0 }`, the `회차 점검` button is shown.
    - `it('cancels the auto check from the panel')`: clicking `취소` calls `cancelAutoCheck` with the chapter id.
  - The empty state: with no issues, the text `회차 점검을 누르거나 회차를 완료로 바꾸면 설정과 어긋나는 문장을 찾아 줍니다.` is shown. Add the assertion to the first test.
  - `src/components/writing/side-panel.auto-done.test.tsx`. Mock `@/lib/client/auto-check`, and stub heavy panels if `side-panel.sample.test.tsx` does.
    - `it('switches to the check tab when an auto check starts')`:
      - Render with `running: false`. The `관련 카드` tab is selected.
      - Rerender with `running: true`. The `점검` tab is selected (`aria-selected="true"`).

- [ ] **Step 6: Run them and see them fail**
  - Run: `pnpm vitest run src/components/writing/panels/check-panel.auto-done.test.tsx src/components/writing/side-panel.auto-done.test.tsx --maxWorkers=2`
  - Expected: FAIL.

- [ ] **Step 7: Implement the panel changes**
  - `check-panel.tsx`:
    - `const auto = useAutoCheck(data.chapter.id)`.
    - In the editable controls: `ai.running` shows the existing status. Otherwise `auto.running` shows `<AiRunStatus label="자동 점검 중" elapsedSec={auto.elapsedSec} onCancel={() => cancelAutoCheck(data.chapter.id)} />`. Otherwise the `회차 점검` button.
    - Change the empty-state description to the string above.
  - `side-panel.tsx`:
    - Read `useAutoCheck(data.chapter.id).running`.
    - When it changes from false to true, set the tab to `'check'`. Use the render-time "previous value" state pattern, not an effect.

- [ ] **Step 8: Run all Task 1 tests and the existing writing tests**
  - Run: `pnpm vitest run src/lib/client src/components/writing --maxWorkers=2`
  - Expected: all pass.
  - Then run tsc and eslint on the touched files: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/client/auto-check.ts src/lib/client/auto-check.test.ts src/components/writing/panels/check-panel.tsx src/components/writing/panels/check-panel.auto-done.test.tsx src/components/writing/side-panel.tsx src/components/writing/side-panel.auto-done.test.tsx
git commit -m "feat(check): auto check runner with panel status"
```

### Task 2: Start the auto check when a chapter is marked done

**Files:**
- Modify: `src/components/writing/writing-workspace.tsx` (`applyStatus`)
- Create: `src/components/writing/writing-workspace.done-check.test.tsx`
- Modify: `src/components/chapters/chapter-table.tsx` (status button and `CompleteConfirmDialog` confirm)
- Modify: `src/components/chapters/chapter-table.test.tsx`
- Create: `e2e/auto-check.spec.ts`
- Modify: `README.md` (주요 기능)

**Interfaces:**
- Consumes: `startAutoCheck(input: AutoCheckInput): boolean` from Task 1.
- Produces: nothing new.

Rules for both callers:
- Start only when the chapter was `draft` before the change, the target is `done`, and the status action succeeded.
- Pass `workId`, `chapterId`, `position`, `onDone: () => router.refresh()` and `navigate: (href) => router.push(href)`.
- `WritingWorkspace.applyStatus`:
  - After success, keep the existing `fireDirectiveInfer` and `router.refresh()`.
  - Then, for draft → done, `await saveNow()`, then call `startAutoCheck({ …, position: chapter.position })`.
  - Read the draft state from `chapter.status` when `applyStatus` starts. The confirm dialog path still sees `draft` there.
- `ChapterTable`:
  - Both the row's status button and the short-draft confirm call `startAutoCheck` after `perform(…)` resolves `true`.
  - Turn the inline `onClick` into a small async function, so the result can be awaited.

- [ ] **Step 1: Write the failing tests**
  - `src/components/writing/writing-workspace.done-check.test.tsx`:
    - Copy the mocks from `writing-workspace.narrow.test.tsx`.
    - Mock `@/lib/client/auto-check` (`startAutoCheck`, `useAutoCheck → { running: false, elapsedSec: 0 }`, `cancelAutoCheck`).
    - Make `autosave.saveNow` a `vi.fn` that records its call order.
    - `it('saves and starts the auto check after a draft is marked done')`:
      - Draft chapter `{ id: 'c1', position: 4 }`, work `w1`, body long enough to meet `targetChars` (or `targetChars: 0`). `setChapterStatusAction` resolves ok.
      - Click the `완료` button in the group `회차 상태`.
      - `setChapterStatusAction` was called with `{ chapterId: 'c1', status: 'done' }`.
      - Then `saveNow`, then `startAutoCheck` with `expect.objectContaining({ workId: 'w1', chapterId: 'c1', position: 4 })`, in that order (compare `mock.invocationCallOrder`).
    - `it('starts the auto check after the short-draft confirmation')`:
      - A short body with `targetChars: 5000`. Click `완료`.
      - `startAutoCheck` is not called yet.
      - Click `완료하기`. `startAutoCheck` was called once.
    - `it('does not start a check when the status change fails')`: `setChapterStatusAction` resolves `{ ok: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }`, so `startAutoCheck` is not called.
    - `it('does not start a check when a done chapter goes back to draft')`: a done chapter. Click `초안`, so `startAutoCheck` is not called.
    - `it('keeps running after the workspace unmounts')`:
      - Do **not** mock `@/lib/client/auto-check` in this test. Use `vi.doMock` or a separate `describe` file section, whichever is simpler. Mock `@/lib/client/post-json` with a deferred promise.
      - Click `완료` and `unmount()`.
      - Resolve the deferred promise with an ok result. `toast.success` was called with `'4화 점검을 마쳤습니다.'`.
      - Call `resetAutoChecksForTests` in `afterEach`.
      - If one file cannot hold both mock setups cleanly, put this test in `writing-workspace.done-check.unmount.test.tsx`.
  - `src/components/chapters/chapter-table.test.tsx`: mock `@/lib/client/auto-check` and add:
    - `it('starts the auto check after a draft row is marked done')`:
      - The row of draft chapter 2 meets the length.
      - Click `2화 상태 바꾸기`. `startAutoCheck` was called with `expect.objectContaining({ workId, chapterId, position: 2 })`.
    - `it('starts the auto check after confirming a short draft')`: click the button, then `완료하기`, so `startAutoCheck` is called once.
    - `it('does not start a check when a done row goes back to draft')`.

- [ ] **Step 2: Run them and see them fail**
  - Run: `pnpm vitest run src/components/writing/writing-workspace.done-check.test.tsx src/components/chapters/chapter-table.test.tsx --maxWorkers=2`
  - Expected: the new tests FAIL; the old chapter-table tests still pass.

- [ ] **Step 3: Implement the two callers** as described above.

- [ ] **Step 4: Run them and see them pass.** Same command, plus `src/components/writing`. Expected: PASS.

- [ ] **Step 5: README.** In `## 주요 기능`, add this bullet right after the `**회차 점검**` bullet:

```markdown
- **완료하면 자동 점검**: 회차를 `완료` 로 바꾸면 회차 점검이 저절로 돕니다. 찾은 설정·떡밥 후보는 `회차 점검` 출처로 승인 대기에 올라오고, 작가가 승인해야 위키와 떡밥 장부에 들어갑니다. 저장할 때마다 돌지는 않습니다.
```

- [ ] **Step 6: E2E** `e2e/auto-check.spec.ts`, `test('marking a chapter done runs the check and queues candidates')`, with `test.setTimeout(180_000)`. Follow `e2e/core-flow.spec.ts` for the setup:
  - `signUp`, then `createWork`.
  - Open `/works/{id}/write`. Fill `서윤은 오른손으로 검을 쥐었다.` and wait for `저장됨`.
  - Create the character `서윤` with the confirmed fact `서윤은 왼손잡이다.`.
  - Go back to the chapter. Click the `완료` button in the group `회차 상태`. The draft is short, so click `완료하기` in the dialog.
  - The text `1화 점검을 마쳤습니다.` becomes visible (timeout 60 s).
  - The region `회차 점검` shows the sentence and the fact. The heading `이 회차에서 찾은 위키 후보` is not visible.
  - Click the toast's `승인 대기 보기`. The URL matches `/works/{id}/approvals`, and `승인 대기 중인 제안이 없습니다.` is not visible.
  - If the stub's extraction yields no candidate, skip the toast-button step and say so in the report instead of weakening other assertions.

- [ ] **Step 7: Verify**
  - Run: `pnpm vitest run src/lib/client src/components/writing src/components/chapters --maxWorkers=2`. Expected: PASS.
  - Run tsc and eslint on the touched files: clean.
  - Run `pnpm e2e e2e/auto-check.spec.ts e2e/core-flow.spec.ts e2e/sample-work.spec.ts`, with a throwaway `BETTER_AUTH_SECRET` and never a copy of `.env.local`. Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add src/components/writing/writing-workspace.tsx src/components/writing/writing-workspace.done-check*.test.tsx src/components/chapters/chapter-table.tsx src/components/chapters/chapter-table.test.tsx e2e/auto-check.spec.ts README.md
git commit -m "feat(check): run the chapter check when a chapter is marked done"
```

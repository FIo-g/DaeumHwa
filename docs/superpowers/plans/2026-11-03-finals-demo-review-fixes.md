# Finals Demo — Review Fixes

Follow-up to `docs/superpowers/plans/2026-11-03-finals-demo.md`. A Sonnet review of `de76da9..feat/finals-demo` found no blockers but the items below. A merged-branch e2e run also showed a timing race in the interview screen. Same Global Constraints as the main plan. Two independent groups with disjoint files: **Group A** (check evidence and demo path) and **Group B** (forms and interview).

## Group A — check evidence and the demo path

**Files:** `src/ai/tasks/continuity-check.ts`, `src/ai/pack-refs.ts` (+ tests), `src/components/writing/panels/check-panel.tsx`, `src/components/writing/writing-workspace.tsx`, `src/lib/client/sample-session.ts`, `src/server/sample-work.ts` (+ tests), `src/app/(app)/works/page.tsx`, and the related test files.

### A1. Evidence for an entry-only citation can come from the card's facts

In `evidenceText`, an issue with only `entryRef` currently searches the name, aliases, summary and field values, and falls back to the summary.

Change it:
- Also search the entry's fact contents.
- If the stripped model excerpt is contained in one fact's content (or that fact's content is contained in the excerpt), return **that fact's full content**.
- Otherwise keep the current rules.

Tests in `continuity-check.evidence.test.ts`:
- An entry `E1` 잿빛 종루 with summary `항구 북쪽 언덕 위의 석조 탑.` and fact `잿빛 종루는 9층 높이의 석조 건물이다.`. An issue with `factRef: null`, `entryRef: 'E1'` and excerpt `'[F3][확정] 잿빛 종루는 9층 높이의 석조 건물이다.'` resolves to `'잿빛 종루는 9층 높이의 석조 건물이다.'`.
- The same issue with excerpt `'9층 높이의 석조 건물'` resolves to the same full fact content.

### A2. `stripPackRefs` must not eat copula endings, and drops parenthesised refs

- A particle after a ref counts only when the next character is whitespace, punctuation (`.,!?;:)]}'"…`) or the end. Use a lookahead.
- Remove parenthesised ref lists such as `(F1)`, `(F1, F2)` and `(E3)`, together with any space before them.

Tests:
- `'위키 F1이다.'` → `'위키이다.'`
- `'위키 F1이고 원고는'` → `'위키이고 원고는'`
- `'위키(F1)와 다릅니다'` → `'위키와 다릅니다'`
- `'설정(F1, F2)과 어긋납니다'` → `'설정과 어긋납니다'`
- All earlier tests still pass.

### A3. Auto check runs on narrow screens too

`CheckPanel` mounts only when the side panel is mounted. Below the wide breakpoint the panel sits in a closed Sheet.

In `WritingWorkspace`, when `autoCheck` is true (or `isSampleChapter(chapter.id)`) and the layout is narrow, the Sheet must start **open**, so the panel mounts on the `점검` tab and the auto run starts. Read how the Sheet's open state is held before you change it.

Test: render `WritingWorkspace` (or the smallest unit that owns the Sheet state) in narrow mode with `autoCheck`, and expect the check region to be in the document.

### A4. The auto run survives React StrictMode and never reruns after it succeeded

In `check-panel.tsx`:
- The auto effect returns a cleanup that resets the guard ref (`autoRan.current = false`). Under StrictMode's double mount, the first run is aborted by `useAiRun`'s unmount cleanup and the second mount starts a fresh run.
- Add `markAutoChecked(chapterId)` / `wasAutoChecked(chapterId)` to `src/lib/client/sample-session.ts`. They use sessionStorage and try/catch, like the existing helpers, with key prefix `daeumhwa:sample-checked:`.
- The effect skips when `wasAutoChecked(chapter.id)` is true. Call `markAutoChecked` only after a run **finishes successfully**. An aborted or failed run leaves it unmarked.

Tests in `check-panel.auto.test.tsx`:
- `it('runs once under StrictMode and finishes')`: wrap the panel in `<StrictMode>`. Exactly one request completes, the issue renders, and nothing stays stuck on `점검 중`.
- `it('does not run again after a successful auto check when remounted')`.
- `it('does not auto run when the chapter is not editable')`.
- `it('shows the error and does not mark the chapter when the check fails')`.

### A5. The sample work is built atomically

In `createSampleWork`:
- Wrap the whole build in `db.transaction(async (tx) => { … })` and pass `tx` to the services. `Db` is `PgDatabase`, so nested service transactions become savepoints. If the types disagree, cast `tx as unknown as Db` with a one-line comment.
- Add an optional third parameter `data: SampleWorkData = SAMPLE_WORK`, so tests can pass broken data. Export the type `SampleWorkData` from `@/lib/sample-work`.

Test `it('leaves no work behind when a step fails')`: pass data whose two entries have the same kind and name, so `createEntry` throws the name clash. Expect `createSampleWork` to reject and `listMyWorks(db, actor)` to be empty afterwards.

### A6. One sample button on the empty works page

On `/works`, render the header `SampleWorkButton` only when the user already has at least one active work. The empty state keeps its own button.

Test: extend the existing works page test, or add one. With no works there is exactly one `샘플 작품으로 체험하기` button.

**Verify A:** `pnpm vitest run src/ai src/components/writing src/lib/client src/server/sample-work.test.ts src/app/\(app\)/works --maxWorkers=2` passes. Also tsc and eslint on touched files.

**Commit A:** `fix(demo): evidence from card facts, safer ref strip, auto check on narrow screens and under StrictMode, atomic sample`

## Group B — forms and interview

**Files:** `src/components/schedule/schedule-item-form.tsx` (+ test), `src/components/wiki/fact-form.tsx` (+ test), `src/components/interview/interview-session.tsx` (+ test).

### B1. Unique ids in the schedule form

Build every element id in `ScheduleItemForm` from `useId()`, so the always-mounted add form and the edit dialog never share an id. Labels keep pointing at their own inputs.

Test: render the add form and an edit form together. Every `id` in the container is unique, and each label's `htmlFor` resolves to an input inside the same form.

### B2. The fact form sends the range only when it changed

When editing, include `validFromPosition`/`validToPosition` in the `updateFactAction` payload only if the value differs from the fact's stored value. Run the client range check only on changed values. A superseded fact stored with `validToPosition: 0` can then be edited (content or status) without an error.

Tests:
- Editing such a fact's content calls `updateFactAction` without the range keys and shows no error.
- Changing the start from 2 to 3 sends `validFromPosition: 3`.
- Creating a fact still sends both keys, as before.

### B3. Interview answer is not overwritten by a late refresh

In `interview-session.tsx`, `ask()` ends with a fire-and-forget `router.refresh()`. If its response lands after `answer()` succeeds, the props-sync block resets `current` to the stale unanswered turn and the `이 답에서 나온 제안` region disappears. This is seen in e2e under load.

Fix: at the end of a successful `answer()`, call `router.refresh()` once more, so the last applied server state already contains the answer. Do the same at the end of a successful `skip()` (after `ask`) only if `ask` does not already cover it; read the code to decide.

Test in the existing interview session test file (or a new `interview-session.refresh.test.tsx`): after a successful answer, `router.refresh` was called after the answer request resolved. Mock `next/navigation` and `postAction`, and assert the call order.

**Verify B:** `pnpm vitest run src/components/schedule src/components/wiki src/components/interview --maxWorkers=2` passes. Also tsc and eslint on touched files.

**Commit B:** `fix: unique schedule form ids, send fact range only when changed, refresh after interview answer`

## Accepted, not fixed

- `?demo=1` on any chapter shows the sample banner and auto-runs a real check (review #7). It is author-driven and goes through the normal usage limit. Without a migration there is no server-side sample marker. Accepted for the demo.

# Lean Serial Harness, Stage 1b (length by scene expansion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is a dynamic workflow: haiku implements each task (TDD), sonnet reviews it, opus reviews the stage, then the orchestrator measures.

**Goal:** Drafts reach the target length without filler: when the first draft is short, the scenes that fell short are rewritten longer in place (in parallel, cheap effort), instead of appending text after the chapter's ending.

**Why (M1, 2026-10-21):**
- Every one of 14 Korean runs ended under 5,000 characters, so T3 (length) failed everywhere. First drafts reach 63–86% of the target.
- The append-style continuation then fills the tail with repeated actions. When the draft already ends on its final line, which the plan card makes common, it writes a note to the author instead. That cost 4 regenerations and pushed two runs over the 2× cost cap (guarded since 0dc287c).
- Asking for 1.3× the length added only about 20%.
- A probe on run C's three scenes, asking 2,000 characters each, gave this (`scratchpad/m0/expand-probe.ts`):
  - effort low: 2,202, 2,079 and 2,379 characters, about 12 s and 2,300–2,900 output tokens per scene, no repeated sentence, the original sentences and the closing line kept;
  - effort medium: 2,013–2,539 characters at about 18 s per scene.

**Architecture:** `completeDraft` measures the first draft. When it is short, it splits the draft into scene spans: break lines, or, with no break line, the plan's scene count (`draftLengthPlan(target).sceneCount` without a plan) as paragraph runs. Each span under 90% of its share is rewritten by a new `draft-expand` task at effort low, all at once. Accepted rewrites are spliced back, stored, and sent to the panel as one replace record in the draft stream. The old append continuation stays behind `AI_DRAFT_LENGTH_MODE=continue`.

**Tech Stack:** as stage 1. No package changes, no migration.

**Spec:** design sections 6.4 (length), 8; stage 1 plan; M1 results in `docs/eval/harness/2026-10-21-stage1.md` (written after this stage's measurement).

## Global Constraints

- User-facing copy Korean; identifiers and comments English. Services throw `AppError`; actions return `ActionResult`.
- The first streamed text is unchanged; only what happens after it changes. Stored and finally shown text must match (the replace record carries the stored text).
- A failed, rejected or timed-out expansion never makes the draft worse: that span keeps its original text; any failure is recorded as a `continue-failed` warning whose `reason` starts with `EXPAND_`.
- `AI_DRAFT_LENGTH_MODE=continue` gives exactly today's behaviour (append continuation with the commentary guard). Unset or anything else means `expand`.
- Scenes mode (`AI_DRAFT_MODE=scenes`) is unchanged.
- English eval runs need the new system and scaffold strings translated, with no Hangul left.
- Tests never call a real AI API. New tests go in new files `<name>.<topic>.s1b.test.ts(x)`.

## Review Focus

1. A draft with no break line (quick path) still splits into spans that cover every paragraph once, and splicing keeps every untouched span byte-identical. Test: task 1.
2. When the user aborts during expansion, the stream rejects as it does today and nothing half-spliced is stored. Test: task 2.
3. An expansion that is a note to the author, holds a break line, repeats a sentence, or comes back shorter than its span is rejected. Test: task 1.
4. The replace record cannot be confused with draft text or the error record, and an old panel build that only knows the error record still shows the first text (the record is skipped). Test: task 3.
5. The expansion respects the overall draft budget (`DRAFT_TOTAL_BUDGET_MS`): spans whose call would start with less than 20 s left are not expanded. Test: task 2.

---

## Task 1: `draft-expand` task and pure span helpers

**Files:**
- Create: `src/ai/tasks/draft-expand.ts`, `eval/novel/localize/en/draft-expand.ts`, `eval/novel/localize/samples/draft-expand.ts`
- Modify: `src/lib/scene.ts` (`sceneSpans`, `spliceSpans`), `src/db/types.ts` (`AI_TASKS` gains `'draft-expand'`), `eval/novel/localize/en-systems.ts`, `eval/novel/localize/scaffold.ts`, the en-systems snapshot, `eval/novel/models.ts` (`PROSE_TASKS` gains `'draft-expand'`)
- Test: `src/lib/scene.spans.s1b.test.ts`, `src/ai/tasks/draft-expand.s1b.test.ts`

**Interfaces:**
- `sceneSpans(text: string, fallbackCount: number): SceneRange[]`: spans between break lines (break lines and the blank lines around them excluded); with none, the paragraphs (blank-line separated) split into `max(1, fallbackCount)` runs of nearly equal paragraph counts, earlier runs one larger; spans are in order and cover every paragraph exactly once.
- `spliceSpans(text: string, replacements: { span: SceneRange; text: string }[]): string`: applies back to front; everything outside the given spans is unchanged.
- `type DraftExpandInput = { before: string; scene: string; after: string; targetChars: number; styleCards: DraftPromptInput['styleCards']; instructions: string }`.
- `DRAFT_EXPAND_SYSTEM`: the probe's system text (the last line stays last), with the added lines below:

```
너는 웹소설 장면을 늘려 다시 쓰는 보조 작가다.
- <scene>의 사건, 인물, 장소, 순서, 대사의 뜻을 그대로 두고 새 사건을 더하지 않는다.
- 감각 묘사, 인물의 몸짓과 표정, 짧은 대사 주고받기, 장면 안의 머뭇거림을 더해 <length>의 분량까지 늘린다.
- 같은 문장, 같은 동작, 같은 묘사를 되풀이해 분량을 채우지 않는다.
- <before>의 끝에서 자연스럽게 이어지고 <after>의 시작으로 넘어가게 쓴다. <before>와 <after>는 다시 쓰지 않는다.
- 문체와 시점, 문단 길이는 <scene>을 따른다. 장면 구분선은 쓰지 않는다.
- 해설이나 질문 없이 늘린 장면 본문만 출력한다.
```

  Plus these lines placed before the last line, in this order: `- <style_cards>가 있으면 그 말투와 규칙을 지킨다.`; `- <instructions>는 작가가 이 회차 전체에 준 지시다. 금지 표현, 말투, 회차 끝 방식 같은 규칙을 지킨다. <instructions>에 있어도 <scene>에 없는 사건은 더하지 않는다.`; the shared `TAG_DATA_RULE`. (Review fix F10: the author's instructions reach the expansion.)
- `buildExpandPrompt(input)`: `<style_cards>` (rendered as the draft renders them, `(없음)` when empty), `<instructions>` (`(없음)` when empty), `<before>` (the last two paragraphs of the previous span, or `(없음)`), `<scene>`, `<after>` (the first paragraph of the next span, or `(없음)`), `<length>공백 포함 약 {targetChars}자 (지금 {draftCharCount(scene)}자)</length>`, joined by blank lines, every block neutralized.
- Constants: `EXPAND_EFFORT = 'low'`, `EXPAND_MAX_TOKENS = 8000`.
- `expansionRejection(original, expanded): null | 'short' | 'break' | 'note' | 'repeat'`, the first check that fails, in this order; `acceptExpansion(original, expanded): boolean` is `expansionRejection(...) === null`:
  - `'short'`: `expanded` is not longer than `original` by at least 5%;
  - `'break'`: it holds a break line;
  - `'note'`: a note to the author, read only in the sentences of `expanded` that are not sentences of `original`, outside quoted dialogue: `isContinuationCommentary` or a local `EXPAND_NOTE_MARKERS` (echoed input tags, a line announcing the text, a bare length note, the English forms). The shared `COMMENTARY_MARKERS` are unchanged;
  - `'repeat'`: any sentence of 8 or more characters appears twice in `expanded` but at most once in `original`.
  The EXPAND_REJECTED warning's `detail` is `"<check>: "` plus the first 300 characters of the rewrite. (Review fixes F2, F3.)

- [ ] **Step 1: Write the failing tests:**
  - spans with two `***` lines give three spans without the break lines;
  - 10 paragraphs and no break with fallback 3 give runs of 4, 3 and 3 paragraphs;
  - `spliceSpans` keeps the text between spans byte-identical;
  - the prompt holds the tags in order and `(없음)` for the first span's `<before>`;
  - `acceptExpansion` rejects a shorter text, a text with `***`, a commentary note, and a text that repeats a sentence;
  - it accepts the probe-like expansion (a 1,453-character scene grown to 2,200 characters);
  - the English localization leaves no Hangul.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/scene.spans.s1b.test.ts src/ai/tasks/draft-expand.s1b.test.ts eval/novel/localize --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/lib src/ai/tasks --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): add a scene expansion task and span helpers`.

## Task 2: Expansion in `completeDraft`

**Files:**
- Modify: `src/server/ai-features.ts` (`completeDraft`; `draftLengthModeFromEnv`), `src/lib/draft-length.ts` (doc of the `EXPAND_` reasons)
- Test: `src/server/ai-features.expand.s1b.test.ts`

**Interfaces:**
- `type DraftLengthMode = 'expand' | 'continue'`; `draftLengthModeFromEnv(env = process.env)` reads `AI_DRAFT_LENGTH_MODE`.
- In `expand` mode, after the first text, with `count = draftCharCount(firstText)`:
  1. Stop when `count >= targetChars` or the budget rule below fails.
  2. Find the spans with `sceneSpans(firstText, card?.scenes.length ?? draftLengthPlan(targetChars).sceneCount)` (card = the draft's plan, when present).
  3. A span's share is the card scene's `targetChars` when the span count equals the card's scene count, else `targetChars / spans.length`.
  4. Pick the spans whose length is under 90% of their share, at most 4, most short first.
  5. Expand the picked spans in parallel with `startAiStream` (task `'draft-expand'`, `EXPAND_EFFORT`, `EXPAND_MAX_TOKENS`, each with the run meta's signal and the remaining budget as timeout). Ask each span for its share.
  6. Keep each span that `acceptExpansion` passes; splice them in.
  7. When anything changed, store the spliced text with `replaceRunOutput` and push it to the pipe as one replace record (task 3).
  8. Record one `continue-failed` warning per failed or rejected span (reasons `EXPAND_ERROR` with the error code in `detail`, or `EXPAND_REJECTED`).
- Budget: skip expansion entirely when less than `MIN_CONTINUATION_MS` remains (as the continuation does today).
- A user abort during expansion rejects the stream (as the continuation does). Nothing is stored for the abort.
- In `continue` mode nothing changes.

- [ ] **Step 1: Write the failing tests** (`FakeAiClient` with a `draft-expand` override):
  - a 3-span 3,000-character draft with target 5,000 makes 3 `draft-expand` runs. The stored text is the spliced text, and the streamed result ends with it.
  - A draft at target makes none.
  - A span returned shorter keeps its text and records one `EXPAND_REJECTED` warning.
  - A thrown expansion records `EXPAND_ERROR` and keeps the rest.
  - An abort during expansion rejects and leaves the first text stored.
  - `AI_DRAFT_LENGTH_MODE=continue` makes a `draft-continue` call and no `draft-expand` call.
  - With a plan card of 3 scenes and 3 break-separated spans, each span is asked for its card target.
- [ ] **Step 2: Run** `pnpm vitest run src/server/ai-features.expand.s1b.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update existing continuation tests only by setting `AI_DRAFT_LENGTH_MODE=continue` in their setup (they test the continue path); no assertion changes.
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run src/server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): fill a short draft by expanding its short scenes`.

## Task 3: Replace record in the draft stream and the panel

**Files:**
- Modify: `src/lib/draft-stream.ts`, `src/app/api/works/[workId]/draft/route.ts` (if the route frames records), `src/components/writing/panels/draft-panel.tsx`
- Test: `src/lib/draft-stream.replace.s1b.test.ts`, `src/components/writing/panels/draft-panel.expand.s1b.test.tsx`

**Interfaces:**
- `DRAFT_REPLACE_MARK = '\u001d'`; `draftReplaceRecord(text: string): string` = mark + `JSON.stringify({ text })` + mark (closing mark so text may follow).
- `parseDraftStream(raw)` returns `{ text, error }`. The text is the content of the last complete replace record when there is one, else the streamed text with any records removed. An incomplete trailing replace record is ignored until it is complete, and the error record behaves as today.
- How the server sends it: the pipe gets a `replace(text)` method. The route writes the record bytes through the same body stream.
- Panel: while the stream is open after the first text, a muted line `분량을 채우는 중` shows when no new text has arrived for 3 seconds. It goes away when the stream ends.

- [ ] **Step 1: Write the failing tests:**
  - `parseDraftStream('첫 글' + draftReplaceRecord('바뀐 글'))` gives `바뀐 글`;
  - with a half record it gives `첫 글`;
  - an error record after a replace record gives the replaced text with the error;
  - two replace records give the last;
  - the panel shows the replaced text after the stream ends.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/draft-stream.replace.s1b.test.ts src/components/writing/panels/draft-panel.expand.s1b.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/lib src/components/writing "src/app/api" --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): show the expanded draft when it replaces the first text`.

## Task 4: Eval

**Files:**
- Modify: `eval/novel/cli.ts`, `eval/novel/state.ts`, `eval/novel/run.ts`, `eval/novel/harness-summary.ts` (expansion calls count in `writeMs`; `expandCalls` per chapter), `.claude/workflows/novel-eval.js` (`ALLOWED_RUN_FLAGS` gains `'--length-mode continue'`), `docs/eval/novel/README.md`
- Test: `eval/novel/run.expand.s1b.test.ts`, `eval/novel/workflow-static.expand.s1b.test.ts`

**Interfaces:**
- Flag `--length-mode continue`: config `lengthMode: 'continue'`, dir suffix `-cont`. The run sets `AI_DRAFT_LENGTH_MODE` from the config. Absent means expand.
- A fake run's chapter 1 records `draft-expand` calls and no `draft-continue` call. With `--length-mode continue` it is the reverse.

- [ ] **Steps 1–5** as usual. Commit: `feat(eval): measure scene expansion and keep the continuation as an option`.

## Gate S1b (sonnet), stage review (opus)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`.
- [ ] Opus review of the stage 1b range along: stream framing and the panel, splice offsets on real drafts from `eval/results` (read-only), abort and budget handling, the expansion prompt as a model reads it in Korean and English, and cost. Skeptic per finding. Fix the confirmed findings, then gate again.

## Task 5 (addendum after the review fixes): reach the floor, not just the share

**Why (probe, 2026-10-21, haiku cloud, product prompt after the review fixes, `scratchpad/m0/expand-probe2.ts`):**
- On four saved Korean first drafts (s1, s1r, s0fix, s0few run-04), picking spans under 90% and asking each for its share ended at 105%, 93%, 105% of the target. s1r stayed at 4,671 characters, under the 5,000 floor (T3), because its 91% span was not picked and its 652-character span only doubled.
- Picking every span under its share and asking 1.1× the share ended at 101%, 111%, 96%, 99%, then 109% and 111% on a rerun. Expansions take 10–16 s each, with no banned phrase added and the span's last line kept in most cases.
- 2 of 13 expansions came back as `note`. One ended with an echoed `</scene>` line around otherwise good text. The other did not reproduce.

**Files:** `src/server/ai-features.ts`, `src/ai/tasks/draft-expand.ts`, `src/lib/draft-length.ts` (export only). Tests: `src/ai/tasks/draft-expand.fx5.s1b.test.ts`, `src/server/ai-features.expand-ask.s1b.test.ts`; update existing tests that pin the 90% pick or the share-sized ask.

**Interfaces:**
- `EXPAND_SHORT_RATIO = 1` (a span under its share is picked, when the whole draft is under target). `EXPAND_ASK_RATIO = 1.1`: a picked span's `<length>` asks `Math.round(share * 1.1)`, the middle of the draft's "target 이상, 1.2×target 이하" range. Picking order and `MAX_EXPAND_SPANS` stay.
- `unwrapExpansion(text: string): string` in draft-expand.ts drops a first line that is exactly `<scene>` and a last line that is exactly `</scene>` (after trimming each line). `expandDraft` applies it to each expansion before `expansionRejection` and splicing. A tag anywhere else still rejects as `note`.
- The expansion note check uses its own list: every `COMMENTARY_MARKERS` entry (exported from draft-length.ts, unchanged) except `/덧붙이지\s*않았/` and `/이어\s*쓰지\s*않았/`, which count only in the polite form (`/덧붙이지\s*않았습니다/`, `/이어\s*쓰지\s*않았습니다/`). Continue mode keeps the full list.
- The announcing-line marker (`다음은|아래는|여기 … 장면|본문 … 입니다|이다`) is tested only against the first non-blank line of the expansion, not against every new sentence.

- [ ] **Step 1: Write the failing tests:**
  - A 3-span short draft whose span 0 is at 95% of its share now sends 3 `draft-expand` calls, and each prompt's `<length>` starts `공백 포함 약 ${Math.round(share * 1.1)}자`.
  - An expansion wrapped as `<scene>\n…\n</scene>` is spliced without the tag lines; `…\n</scene>\n더 쓴 문장.` is still rejected as `note`.
  - A new sentence `그는 아무것도 덧붙이지 않았다.` passes; a new `이어 쓸 내용이 없어 덧붙이지 않았습니다.` is `note`; `isContinuationCommentary('그는 아무것도 덧붙이지 않았다.')` is still true.
  - `여기가 바로 그가 기다리던 장면이다.` as a middle sentence passes; `다음은 분량을 늘린 장면입니다.` as the first line is `note`.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/tasks/draft-expand.fx5.s1b.test.ts src/server/ai-features.expand-ask.s1b.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the new tests and `src/ai/tasks src/server/ai-features* src/lib/draft-length* eval/novel/run*`. Expected: PASS.
- [ ] **Step 5: Commit:** `fix(draft): expand every short scene toward the middle of the range`.

## Measurement M1b (orchestrator)

Worktree `../DaeumHwa-s1b` detached at the reviewed commit. Flags on every run: `--deploy-settings --directives on`.

| Invocation | date | runs |
|---|---|---|
| A | `2026-10-21-s1b` | haiku ko (plan flow) |
| B | `2026-10-21-s1br` | haiku ko (plan flow, repeat) |
| C | `2026-10-21-s1bq` | haiku ko `--quick` |
| D | `2026-10-21-s1bqr` | haiku ko `--quick` (repeat) |
| E | `2026-10-21-s1bfew` | haiku ko `--few-instructions` |

**Decide:**
- **Expansion:** quick runs against s0 and s0fix on T3, Q and must-fix.
- **Plan card:** plan runs against quick runs, and the few-instruction run against s0few, under the stage 1 adoption rule.
- **Writing it up:** the stage 1 results doc (sonnet, Korean) `docs/eval/harness/2026-10-21-stage1.md` covers M1 and M1b.

## Task 6 (addendum after M1b): a second expansion round

**Why (M1b, 2026-10-22, haiku cloud, first two finished runs):**
- First drafts came out shorter than in M1: 3,256 (s1br, plan flow) and 2,881 (s1bq, quick) characters, 65% and 58% of 5,000.
- Every expansion was accepted, but each delivered less than it was asked when the span was far under its share: 740→1,322 and 727→1,303 (72% and 71% of the 1,834 ask, about 1.8× growth), 1,004→1,689, 1,150→1,563 and 1,239→1,663 (85–92%), 1,271→1,876 (102%).
- The drafts after expansion were 4,867 and 4,547, so both runs failed T3 again. Trimming and repair changed less than 60 characters.
- A larger single ask does not fix it. Delivery falls with the growth asked (about 72% of a 2.5× ask, 85–102% of a ≤1.5× ask), so a ratio high enough for the shortest span overshoots spans near their share.
- Replaying the saved product prompts three times each gave the same lengths (740→1,188–1,381), so this is not noise. The earlier probes behind Task 5 left the style cards out (`styleCards: []`), and without cards the model writes longer. Their 96–111% finals were too optimistic.
- Probe with the cards (`scratchpad/m0/expand-probe-rounds.ts`, six saved first drafts: s1br, s1bq, s1, s1r, s0fix, s1few, twice each):
  - Round 1 as today ended at 81–105%.
  - Five drafts ended round 1 at 100–101%, where trimming can still push them under 5,000.
  - With the round-2 rules below, all 12 finals were 100–117% of target. No banned phrase was added, and each round-2 call took 8–14 s.
  - In one trial round 1 lost two of three spans (`note`, `short`) at 81%. Round 2 still reached 102%.

**Files:** `src/server/ai-features.ts`. Test: `src/server/ai-features.expand-round.s1b.test.ts`; update existing expansion tests only where they pin a single round.

**Interfaces:**
- `EXPAND_ROUNDS = 2`. `expandDraft` runs round 1 exactly as today.
- Round 2 runs on the spliced text when it is under `targetChars * EXPAND_AGAIN_RATIO`, with `EXPAND_AGAIN_RATIO = 1.05`. The 5% is a margin for trimming and repair, which cut up to 60 characters in M1b.
- Like round 1, round 2 needs the author not to have aborted and at least `MIN_CONTINUATION_MS` left.
- Round 2 recomputes `sceneSpans(current, sceneCount)` and the shares. `<before>` and `<after>` come from the current text. The pool, the per-span clock check, `MAX_EXPAND_SPANS`, the order (shortest relative to share first) and `expansionRejection` are the same as in round 1.
- Round 2 picks spans under `share * EXPAND_ASK_RATIO`.
- Round 2 asks each picked span for `max(round(len * EXPAND_MIN_GROWTH_ASK), round(len + (targetChars * EXPAND_ASK_RATIO - total) / picked.length))`:
  - `EXPAND_MIN_GROWTH_ASK = 1.2`;
  - `len` is the span's current length and `total` is the current draft length;
  - the second term spreads the gap to the middle of the range over the picked spans;
  - the 1.2 floor keeps every ask clear of `MIN_GROWTH` (1.05).
- A round with at least one accepted rewrite stores its text with `replaceRunOutput` (with the warnings so far) and sends one replace record. The last record always equals the stored text.
- Warnings from every round are kept. A round with no accepted rewrite stores nothing new and records its warnings the way a single round does today.
- An abort during either round rejects as today. Text a finished round 1 already stored stays stored, as any completed write does.
- Extract the round into a helper (for example `expandRound(ctx, text): Promise<{ text: string; accepted: number; warnings: DraftWarning[] }>`) so both rounds share one code path. The name and shape are the builder's call.

- [ ] **Step 1: Write the failing tests** (`FakeAiClient`; the expansions are returned short on purpose):
  - A 3-span first draft whose round-1 rewrites leave the total under 1.05× target sends round-2 `draft-expand` calls only for the spans under 1.1× their share.
    - Each round-2 `<scene>` is the current text of its span, and each `<length>` asks the larger of 1.2× the span and the span plus its part of the gap to 1.1× target.
    - The stored text is the round-2 splice.
  - A draft whose round 1 reaches 1.05× target sends no round-2 call. A draft at exactly target after round 1 still gets round 2.
  - With less than `MIN_CONTINUATION_MS` left after round 1 (fake clock), no round-2 call is made and the round-1 text is stored.
  - An `acceptsReplace` client gets one replace record per round with an accepted rewrite, and `parseDraftStream` of the whole body equals the stored text.
  - A round-1 `EXPAND_REJECTED` warning is still stored after round 2 succeeds.
  - At most `2 × MAX_EXPAND_SPANS` expansion calls are made per draft.
- [ ] **Step 2: Run** `pnpm vitest run src/server/ai-features.expand-round.s1b.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the new test plus `pnpm vitest run src/server/ai-features* src/ai/tasks/draft-expand* --maxWorkers=2`. Expected: PASS.
  - Then the orchestrator runs the cloud probe (`scratchpad/m0/expand-probe2.ts`, extended to two rounds) on the five M1b first drafts.
  - Expected: every final is between 105% and 130% of target, with no banned phrase added.
- [ ] **Step 5: Commit:** `fix(draft): run a second expansion round when the draft is still short`.

### Task 6b: a third round with the round-2 rules

**Why (probe with the product rules, 2026-10-22, `scratchpad/m0/expand-rounds3.log`, eight saved first drafts, one try each):**
- Six finals were 110–114% of target and one was 104%.
- s1bq ended at 99%. In round 2 only two spans were under 1.1× share, and one of the two rewrites came back as `repeat`.
- A rejection in the last round is the gap left. One more round with the same rules covers it and runs only when the draft is still under 1.05× target.

**Interfaces:**
- `EXPAND_ROUNDS = 3`. Round 3 uses the round-2 rules unchanged (trigger, pick, ask), on the text after round 2.
- At most `3 × MAX_EXPAND_SPANS` expansion calls are made per draft.
- Round 3 obeys the same budget, abort, replace-record and warning rules as rounds 1 and 2.

- [ ] **Step 1: Write the failing tests** in `src/server/ai-features.expand-round.s1b.test.ts`:
  - A round-2 rewrite refused as `repeat` leaves the draft under 1.05× target, so round 3 runs. Round 3 asks only spans under 1.1× share, and its `<scene>` comes from the text after round 2.
  - A draft that reaches 1.05× target in round 2 makes no round-3 call.
  - Replace the "at most `2 × MAX_EXPAND_SPANS`" assertion with `3 × MAX_EXPAND_SPANS`.
- [ ] **Step 2–4:** run, implement, run as in Task 6. `pnpm vitest run src/server/ai-features src/ai/tasks/draft-expand src/app/api/works eval/novel/run.expand-fake.s1b.test.ts src/test/ai-fakes --maxWorkers=2`.
- [ ] **Step 5: Commit:** `fix(draft): allow a third expansion round after a refused rewrite`.

## Measurement M1c (orchestrator)

Worktree at the Task 6 commit, with stage 2 changes left out. Flags on both runs: `--deploy-settings --directives on`.

| date | runs |
|---|---|
| `2026-10-22-s1c` | haiku ko (plan flow) |
| `2026-10-22-s1cq` | haiku ko `--quick` |
| `2026-10-22-s1cfew` | haiku ko `--few-instructions` (replaces M1b's s1bfew, which was not run) |

**Decide:**
- **Expansion:** M1c with the finished M1b runs, on T3, Q, must-fix, cost and time after first character, against s0 and s0fix.
- **Plan card:** plan against quick runs, and s1cfew against s0few and s1few.

# Lean Serial Harness, Stage 1 (plan card and scene length) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is a dynamic workflow: haiku implements each task (TDD), sonnet reviews it, opus reviews the stage, then the orchestrator measures.

**Goal:** Make "plan, then write" the default chapter flow in the service: the AI proposes a chapter plan card (scenes with goal, decision, stake, emotional trigger, role and length, plus an ending device), the author approves or corrects it in one line, and the draft follows it scene by scene in length; the old "write now" path stays as a button.

**Architecture:** A new structured task `draft-plan` builds the card from the same context as the draft. The approved card becomes the draft's instructions (so every existing draft rule applies to it) and sets the scene count and per-scene length. A `scenes` draft mode (one call per scene with a running length countdown) exists behind `AI_DRAFT_MODE` for comparison; `single` stays the default. The eval runs the plan flow by default, with a `plan_review` author step in few-instruction runs.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite, Vitest, `FakeAiClient`, shadcn on Base UI, novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md` sections 6.1, 6.2, 6.4 (length part), 8 and the stage 1 row of section 9. Stage 0 plan: `docs/superpowers/plans/2026-10-20-lean-harness-stage0.md` (its interfaces are used here).

**Branch:** `feat/lean-harness`, after stage 0's gate and review fixes.

## Global Constraints

- User-facing copy is Korean, short and plain; the exact strings below are fixed. Identifiers and comments are English.
- Services throw `AppError(code, koreanMessage)`; actions return `ActionResult`. AI never writes wiki tables; the plan card is stored only in `ai_runs.output`.
- No package changes. Migrations allowed but none is expected in this stage (`AiTaskName` is a TS union over a text column).
- The quick path ("바로 쓰기") sends exactly what a60f93a's `startDraft` sends for the same input. Only the plan flow and the `scenes` mode change prompts.
- `DRAFT_SYSTEM` is not changed. New rules live in the plan render and the scene prompt.
- English eval runs need every new Korean scaffold string translated (`eval/novel/localize`), with no Hangul left in the translated prompt.
- Tests never call a real AI API. New tests go in new files `<name>.<topic>.s1.test.ts(x)`.
- Implementer commands, commit rules and README rule: as in the stage 0 plan.

## Review Focus

1. An empty instruction is allowed with a plan and refused without one (quick path keeps `무슨 일이 일어나야 하는지 적어 주세요.`). Test: task 3.
2. An author-edited card that the server receives is re-validated (scene count 1–8, string lengths) and per-scene targets are recomputed on the server, never trusted from the client. Test: task 3.
3. In `scenes` mode a failure after some scenes keeps the scenes already written and stored, with a warning, and the stream ends cleanly; a user abort still rejects. Test: task 4.
4. A plan that names a thread marked `지시에 있을 때만 쓴다` makes that thread count as instructed for the draft (the plan is the instruction), and the plan task itself is told not to propose such threads unless the author's line names them. Test: tasks 1 and 3.
5. Old eval runs and `--quick` runs keep their harness numbers: `planMs` 0, `planEdits` 0. Test: task 6.

---

## Task 1: `draft-plan` task and pure plan helpers

**Files:**
- Create: `src/ai/tasks/draft-plan.ts`, `src/lib/draft-plan.ts`, `eval/novel/localize/en/draft-plan.ts`, `eval/novel/localize/samples/draft-plan.ts`
- Modify: `src/db/types.ts` (`AI_TASKS` gains `'draft-plan'` and `'draft-scene'`), `eval/novel/localize/en-systems.ts`, `eval/novel/localize/scaffold.ts` (translations for every new Korean scaffold string)
- Test: `src/ai/tasks/draft-plan.s1.test.ts`, `src/lib/draft-plan.s1.test.ts`, `eval/novel/localize/localize.plan.s1.test.ts`

**Interfaces:**
- Produces in `src/ai/tasks/draft-plan.ts`:
  - `type SceneRole = 'opening' | 'turn' | 'rise' | 'ending'`, `type EndingDevice = 'question' | 'crisis' | 'twist'`
  - `type DraftPlan = { scenes: { summary: string; goal: string; decision: string; stake: string; trigger: string; role: SceneRole; place: string; characters: string[] }[]; ending: { device: EndingDevice; line: string }; threads: string[] }` and `DraftPlanSchema` (scenes `min(1).max(8)`).
  - `type DraftPlanInput = DraftPromptInput & { sceneCount: number; advice: string | null; revision: { card: DraftPlanCard; note: string } | null }`
  - `draftPlanTask: AiTaskDef<DraftPlanInput, DraftPlan>` — name `'draft-plan'`, effort `'low'`, maxTokens `4000`, system `DRAFT_PLAN_SYSTEM`.
- Produces in `src/lib/draft-plan.ts` (pure):
  - `type DraftPlanCard = DraftPlan & { scenes: (DraftPlan['scenes'][number] & { targetChars: number })[] }`
  - `withSceneTargets(plan: DraftPlan, targetChars: number): DraftPlanCard` — every scene gets `draftLengthPlan(targetChars, plan.scenes.length).charsPerScene`.
  - `planWarnings(card: DraftPlanCard): string[]`
  - `renderPlanInstructions(authorLine: string, card: DraftPlanCard): string`
  - `SCENE_ROLE_LABELS: Record<SceneRole, string>` = `{ opening: '도입', turn: '전환', rise: '고조', ending: '회차 끝' }`; `ENDING_DEVICE_LABELS` = `{ question: '질문', crisis: '위기', twist: '반전' }`.

`DRAFT_PLAN_SYSTEM` content (Korean, write it in the style of `DRAFT_BEATS_SYSTEM`):
- You are an assistant writer who proposes the plan of one web-novel chapter before it is written.
- If `<instructions>` has events, put every one of them into the scenes, in order. If it is short or empty, propose this chapter's events from `<wiki>` threads, `<previous_summary>`, `<previous_tail>` and `<direction_advice>`; continue directly from the previous chapter.
- Exactly `<scene_count>` scenes.
- Per scene: `summary` (what happens, one or two sentences), `goal` (what the point-of-view character wants in this scene), `decision`, `stake` (as in the beats task), `trigger` (when a character's feeling changes in the scene, the concrete event that causes it; `""` when no feeling changes), `role`, `place`, `characters` (names exactly as in the wiki).
- The first scene's role is `opening`, the last is `ending`; never the same role twice in a row.
- `ending.device` is one of question, crisis, twist; `ending.line` says in one sentence how the last scene ends, as a moment in the scene, never a summary or a moral.
- `threads`: titles of `<wiki>` threads this chapter moves; only titles that exist there.
- A thread marked `지시에 있을 때만 쓴다` goes into the plan only when `<instructions>` names it.
- Do not invent important settings (new powers, relations, deaths) that the wiki does not have.
- With `<revision>`: change the current plan as the author's note says and keep every scene the note does not touch.
- `TAG_DATA_RULE`; all output in Korean.

`buildPrompt`: `buildDraftPrompt({ ...input, beats: null }, { omitTargetLength: true })`, then `<scene_count>N</scene_count>`, then `<direction_advice>` (text or `(없음)`), then, only with a revision, `<revision>` holding `renderPlanInstructions('', card)` under `현재 계획:` and the note under `작가 메모:`.

`renderPlanInstructions(authorLine, card)` (exact layout; this is what the draft receives as `<instructions>`):

```
작가 메모: <authorLine, or (없음)>
아래 회차 계획을 따라 쓴다. 장면이 바뀔 때는 빈 줄, *** 한 줄, 빈 줄을 둔다. 장면마다 적힌 분량을 채운다. 마지막 장면은 요약이나 교훈으로 닫지 말고 "회차 끝"에 적힌 장면으로 끝낸다.
장면 1 (도입, 공백 포함 약 1,250자)
- 일어나는 일: …
- 목표: …
- 결정 상태: …        (omitted when empty)
- 기대한 것과 잃은 것: … (omitted when empty)
- 감정의 계기: …      (omitted when empty)
- 장소: … / 인물: a, b
…
회차 끝 (위기): <ending.line>
움직일 떡밥: <threads joined by ', ', or (없음)>
```

`planWarnings` (exact copy): for each `i` where scenes `i` and `i+1` have the same role, `장면 ${i+1}과 ${i+2}이 둘 다 '${label}'입니다. 같은 박자가 이어질 수 있어요.`; when the last scene's role is not `ending`, `마지막 장면이 '회차 끝'이 아닙니다.`

- [ ] **Step 1: Write the failing tests**
  - `draft-plan.s1.test.ts`: the task has name `'draft-plan'`, effort `'low'`, maxTokens 4000; `buildPrompt` contains `<scene_count>3</scene_count>`, `<direction_advice>\n(없음)` when advice is null, no `<target_length>`, and, with a revision, `작가 메모: 2장면에서 윤서가 먼저 말을 건다`; `DraftPlanSchema` rejects 0 and 9 scenes and an unknown role; the system text contains `지시에 있을 때만 쓴다` and `<scene_count>`.
  - `src/lib/draft-plan.s1.test.ts`: `withSceneTargets` on 4 scenes and target 5000 gives 1250 each; `renderPlanInstructions('세린이 먼저 묻는다', card)` equals a pinned golden string built from a two-scene card (one scene with empty decision/stake/trigger, so those lines are omitted); `planWarnings` gives the two exact messages for `[opening, rise, rise]`, and `[]` for `[opening, turn, ending]`.
  - `localize.plan.s1.test.ts`: `EN_SYSTEMS['draft-plan']` exists and has no Hangul; `translateScaffold` of the sample prompt and of `renderPlanInstructions('', sampleCard)` leaves no Hangul outside the sample's data values (follow `localize.D.test.ts`).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Add `'draft-plan'` and `'draft-scene'` to `AI_TASKS`.
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/ai eval/novel/localize --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(draft-plan): add the chapter plan card task`.

## Task 2: `planDraft` service and action

**Files:**
- Modify: `src/server/ai-features.ts` (extract `buildDraftContext` from `startDraft`; add `planDraft`), `src/server/actions/ai-features.ts` (`planDraftAction`), `src/db/types.ts` (`USAGE_EVENT_KINDS` gains `'plan_shown'`, `'plan_edited'`)
- Test: `src/server/draft-plan.s1.test.ts`, `src/server/actions/draft-plan-action.s1.test.ts`

**Interfaces:**
- Consumes: task 1; `recordUsageEvent` (stage 0 task 9).
- Produces: `buildDraftContext(db, actor, input: { workId; chapterId?; instructions; targetChars?; entryIds }): Promise<{ promptInput: DraftPromptInput; chapterId: string | null; position: number; targetChars: number }>` — exactly the context code `startDraft` runs today, moved, with no behaviour change.
- Produces: `planDraft(db, actor, input: { workId: string; chapterId?: string | null; instructions: string; targetChars?: number; entryIds: string[]; revision?: { card: DraftPlanCard; note: string } }, client?, signal?): Promise<{ runId: string; card: DraftPlanCard; warnings: string[] }>`. Editor role. Empty `instructions` is allowed. `sceneCount` = `draftLengthPlan(targetChars).sceneCount`, or the revision card's scene count. `advice` = the `text` (or the joined advice fields; read `AdviceResult`) of the newest done `direction-advice` run of the work whose chapter position is the previous chapter, else `null`. Records `plan_shown` (value = scene count, `extra: { revision: 0|1 }`); a recording failure never fails the plan.
- Produces: `planDraftAction(input)` → `ActionResult<{ runId; card; warnings }>`; zod: `instructions` ≤ 5000, `targetChars` 500–20000 optional, `entryIds` ≤ 50, `revision.note` 1–300 characters, `revision.card` parsed with the card schema of task 3 (`DraftPlanCardSchema`, defined in `src/lib/draft-plan.ts` there; define it here if task 3 has not, and task 3 reuses it).

- [ ] **Step 1: Write the failing tests** (`createTestDb`, factories, `FakeAiClient` with a fixed `DraftPlan` added to `@/test/ai-fakes`):
  - `planDraft` with empty instructions returns a card whose scenes each have `targetChars` and records one `plan_shown` event; a non-member gets `NOT_FOUND`; with a revision of a 3-scene card the fake receives a prompt containing `작가 메모:` and `<scene_count>3</scene_count>`; with an earlier `direction-advice` run for the previous chapter the prompt contains its text.
  - The prompt passed to the plan call equals `buildDraftPrompt` of the same context without length lines (proves `buildDraftContext` is shared).
  - The existing `startDraft` tests still pass unchanged (run `src/server/ai-features*.test.ts`).
  - Action: invalid note (empty, 301 chars) gives the validation `ActionResult`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/server --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(draft-plan): plan a chapter from the draft context`.

## Task 3: Draft from an approved plan (single mode)

**Files:**
- Modify: `src/server/ai-features.ts` (`startDraft`), `src/ai/tasks/draft-chapter.ts` (`DraftPromptInput.sceneCount?`; `buildDraftPrompt` uses it for `<scene_budget>`), `src/lib/draft-plan.ts` (`DraftPlanCardSchema`, `normalizeCard`), `src/app/api/works/[workId]/draft/route.ts` (body schema)
- Test: `src/server/draft-from-plan.s1.test.ts`, `src/app/api/works/[workId]/draft/route.plan.s1.test.ts`

**Interfaces:**
- Consumes: tasks 1 and 2.
- Produces: `startDraft` input gains `plan?: DraftPlanCard`, `planRunId?: string`, `planEdits?: { revisions: number; removed: number; moved: number; textEdits: number }`. With `plan`: `instructions` may be empty; `promptInput.instructions = renderPlanInstructions(instructions, card)`; `promptInput.sceneCount = card.scenes.length`; the draft run's stored output gains `plan: card` and `planRunId` (keep every other key; the continuation join and warnings still work). Records `plan_edited` (value = sum of `planEdits`, `extra` = `planEdits`) when `plan` is given.
- Produces: `DraftPlanCardSchema` (zod for an incoming card: 1–8 scenes; every string ≤ 400 characters; `characters` ≤ 12 names; `threads` ≤ 12) and `normalizeCard(card, targetChars): DraftPlanCard` (trims strings, recomputes every `targetChars` with `withSceneTargets`).
- `DraftPromptInput.sceneCount?: number`: when set, `<scene_budget>` uses it (as `beatSceneCount` does for beats). Without `plan` the prompt is byte-identical to before.

- [ ] **Step 1: Write the failing tests**
  - `startDraft` without `plan` and with empty instructions still throws `무슨 일이 일어나야 하는지 적어 주세요.`; with `plan` and empty instructions it starts, and the fake stream receives a prompt whose `<instructions>` equals `renderPlanInstructions('', normalizedCard)` and whose `<scene_budget>` says `장면 3개`.
  - A client card with `targetChars: 99999` on every scene is normalized to the server's per-scene value.
  - A card naming a planned thread title (marked `지시에 있을 때만 쓴다` in the pack) puts that title inside `<instructions>`.
  - The stored run output has `text`, `plan` and `planRunId`; one `plan_edited` event with value 3 for `planEdits { revisions: 1, removed: 1, moved: 0, textEdits: 1 }`.
  - Golden: for a fixed input without `plan`, `buildDraftPrompt` output equals the string produced at a60f93a (pin it in the test from the current code before changing anything).
  - Route: a body with an invalid card (0 scenes, a 401-character summary) gets 400 with a Korean message; a valid card reaches `startDraft`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/server src/ai src/app --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(draft): write the chapter from an approved plan card`.

## Task 4: `scenes` draft mode (comparison arm)

**Files:**
- Create: `src/ai/draft-mode.ts`
- Modify: `src/server/ai-features.ts` (`startDraft`, a scene driver beside `completeDraft`), `src/ai/tasks/draft-chapter.ts` (`buildScenePrompt`), `eval/novel/localize/scaffold.ts` (scene prompt strings)
- Test: `src/server/draft-scenes.s1.test.ts`, `src/ai/tasks/draft-scene-prompt.s1.test.ts`

**Interfaces:**
- Produces: `type DraftMode = 'single' | 'scenes'`; `draftModeFromEnv(env = process.env): DraftMode` reads `AI_DRAFT_MODE` (`scenes` → `'scenes'`, anything else `'single'`).
- Produces: `startDraft` input `mode?: DraftMode` (default `draftModeFromEnv()`); `scenes` applies only with `plan`.
- Produces: `buildScenePrompt(input: DraftPromptInput, card: DraftPlanCard, index: number, soFar: string): string` = `buildDraftPrompt(input)` + `<draft_so_far>` (neutralized, `(없음)` for the first scene) + `<scene_now>` with this exact text: `장면 ${index+1}만 쓰고 멈춘다. 이 장면은 공백 포함 약 ${target}자. 지금까지 ${count}자를 썼고 회차 목표까지 ${remaining}자 남았다.${last ? ' 이 장면이 마지막 장면이다.' : ''}` (`count` = `draftCharCount(soFar)`, `remaining` = `max(0, targetChars − count)`). Scenes after the first start with the separator `\n\n***\n\n` added by code, not by the model.
- Scene 1 runs through `startAiStream` as task `'draft-chapter'` (that run is the draft run); later scenes are `startAiStream` runs with task `'draft-scene'`, effort `DRAFT_EFFORT`, maxTokens `DRAFT_MAX_TOKENS`, each streamed to the pipe as it arrives. After all scenes, the joined text replaces the first run's output (`text`, `plan`, `planRunId`). The total budget is `DRAFT_TOTAL_BUDGET_MS` as today; a scene that would start with less than `MIN_CONTINUATION_MS` left is skipped with a warning `{ code: 'SCENES_CUT', scenesWritten }`. No `draft-continue` runs in `scenes` mode.

- [ ] **Step 1: Write the failing tests** — 3-scene card with a fake streaming `가`, `나`, `다`: the pipe yields `가\n\n***\n\n나\n\n***\n\n다`, the first run's stored text equals it, three runs exist (`draft-chapter`, `draft-scene`, `draft-scene`); the second call's prompt has `<draft_so_far>\n가` and `장면 2만 쓰고 멈춘다`; when the third call throws (not an abort), the stored text is `가\n\n***\n\n나` with a `SCENES_CUT` warning and `done` resolves; an abort rejects. `draftModeFromEnv({ AI_DRAFT_MODE: 'scenes' })` is `'scenes'`, `{}` is `'single'`. The scene prompt translates with no Hangul outside data (localize test).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/server src/ai eval/novel/localize --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(draft): add a scene-by-scene draft mode for comparison`.

## Task 5: Plan card in the draft panel

**Files:**
- Create: `src/components/writing/panels/draft-plan-card.tsx`
- Modify: `src/components/writing/panels/draft-panel.tsx`
- Test: `src/components/writing/panels/draft-plan-card.s1.test.tsx`, `src/components/writing/panels/draft-panel.plan.s1.test.tsx`

**Interfaces:**
- Consumes: `planDraftAction` (task 2), the draft route's `plan`, `planRunId`, `planEdits` (task 3), `SCENE_ROLE_LABELS`, `ENDING_DEVICE_LABELS`, `planWarnings` (task 1).
- Produces: `DraftPlanCardView({ card, warnings, busy, onChange, onRevise, onWrite })` — `onChange(card, edit: 'removed' | 'moved' | 'textEdits')`, `onRevise(note: string)`, `onWrite()`.

Exact copy:
- Instruction placeholder: `무슨 일이 일어나야 하나요? 비워 두면 위키와 지난 화를 보고 계획을 제안해요.`
- Buttons: `계획 세우기` (primary), `바로 쓰기` (outline; disabled while the instruction is empty), `이 계획으로 쓰기` (primary), `다시 계획`, per scene `위로`, `아래로`, `빼기` (icon buttons; these strings are their `aria-label`s).
- Card heading `이번 화 계획`; per scene a line `장면 N · <role label> · 약 1,250자`, the summary in an editable textarea (label `일어나는 일`), then `목표`, `결정`, `대가`, `감정의 계기`, `장소`, `인물` rows (omit empty ones); ending row `회차 끝 (<device label>): <line>`; threads row `움직일 떡밥: …`.
- Revision input placeholder `계획을 한 줄로 고쳐 주세요 (예: 2장면에서 윤서가 먼저 말을 걸게)`.
- Warnings render as muted lines under the heading. A failed plan call shows the action's error with `toast.error`.

Behaviour: `계획 세우기` calls `planDraftAction`; editing counts `textEdits` once per scene edited, `removed` per removal (at least one scene must remain; `빼기` is disabled on the last one), `moved` per move; `다시 계획` sends the current card and the note and adds 1 to `revisions`, then replaces the card; `이 계획으로 쓰기` posts the draft with `plan`, `planRunId`, `planEdits`, then the existing preview, append, new-chapter and refine UI is unchanged. `바로 쓰기` is today's request.

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`; mock the action and `fetch`): placeholder and button copy; a card renders `장면 2 · 고조 · 약 1,250자` and omits an empty `결정`; removing a scene then writing posts `planEdits.removed 1`; `빼기` disabled with one scene; `다시 계획` with `윤서가 먼저` calls the action with `revision.note`; `바로 쓰기` posts no `plan`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Read `src/components/ui/*` before using a component (Base UI, `render` prop).
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run src/components/writing --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(draft): plan card in the draft panel, with write-now kept`.

## Task 6: Eval plan flow, few-instruction plan review and metrics

**Files:**
- Modify: `eval/novel/steps/chapter.ts` (draft step), `eval/novel/state.ts` (`RunConfig.quick?`, `RunConfig.draftMode?`, `RunData.plans`), `eval/novel/run.ts`, `eval/novel/cli.ts` (`--quick`, `--draft-mode scenes`, suffixes `-quick`, `-scenes`), `eval/novel/author-io.ts` (`plan_review` pending and answer), `eval/novel/agents/author.md` (the `plan_review` judgment), `eval/novel/harness-summary.ts` (`planMs`, `planEdits`, `planEditChars`), `eval/novel/metrics.ts` (`sceneLengths`), `src/lib/scene.ts` (export `splitScenes`), `eval/novel/steps/chapter.ts` `sceneLocationsOf` (read the plan's scenes when a plan exists), `docs/eval/novel/README.md`
- Test: `eval/novel/run.plan.s1.test.ts`, `eval/novel/author-io.plan.s1.test.ts`, `eval/novel/harness-summary.plan.s1.test.ts`, `eval/novel/metrics.scenes.s1.test.ts`, `src/lib/scene.split.s1.test.ts`, `eval/novel/cli.plan.s1.test.ts`

**Interfaces:**
- Consumes: `planDraft`, `startDraft` with `plan`/`mode` (tasks 2–4); `chapterInstructions` (stage 0).
- Produces: `RunData.plans: Record<number, { runId: string; card: DraftPlanCard; notes: string[] }>`; pending kind `plan_review` = `{ kind: 'plan_review', chapter: n, card: string (renderPlanInstructions('', card)), intention: string (the bible chapter instructions, full), mustInclude: string[], round: number }`; answer `{ approve: true } | { approve: false, note: string }` (note 1–150 characters).
- Produces: `ChapterHarness` gains `planMs` (sum of `draft-plan` durations in `ch<n>:draft`), `planEdits` (`notes.length`), `planEditChars` (sum of note lengths); old runs give 0.
- Produces: `splitScenes(text: string): string[]` (segments between break lines, trimmed; one segment when there is no break line) and `metrics/NN.json.sceneLengths = { scenes: number; targets: number[] | null; chars: number[]; within: number | null }` where `within` counts scenes whose chars are 70–130% of their target (null without a plan).

Flow in the draft step (per attempt):
1. Unless `config.quick`: `planDraft` with `chapterInstructions(...)` as the author line (the full bible text in comparison runs, the first sentence in few-instruction runs).
2. Comparison runs: approve the card as is. Few-instruction runs: post a `plan_review` pending; on `approve: false`, call `planDraft` with `revision { card, note }` and post the next round; stop after 3 notes and use the last card. Store the plan state in `state.data.plans[n]` so a resumed worker continues from it.
3. `startDraft` with `plan`, `planRunId`, `planEdits { revisions: notes.length, removed: 0, moved: 0, textEdits: 0 }`, `instructions` = the author line, and `mode: config.draftMode ?? 'single'`.
4. `config.quick`: today's call (with `twoStep` as today).

`author.md` `plan_review` rule: treat `intention` and `mustInclude` as what you, the author, want in this chapter. Approve when the card covers them in a sensible order and nothing contradicts them. Otherwise write one note of at most 150 characters asking for the single most important fix. Do not ask for style changes.

- [ ] **Step 1: Write the failing tests** — fake-profile run (`--fake-author`): a comparison run makes one `draft-plan` record before the `draft-chapter` stream in `ch1:draft`, and the stored draft output has `plan`; a few-instruction run posts a `plan_review` pending with `intention` = the full bible ch1 text and, on a `{ approve: false, note: '종이 혼자 떠는 장면을 넣어 주세요' }` answer, a second `draft-plan` call whose prompt contains that note; after 3 notes the draft starts anyway. `--quick` makes no `draft-plan` call. `harness` gives `planMs` from the plan records, `planEdits` 1 and `planEditChars` 17 for one 17-character note, and 0s for a quick run. `splitScenes('a\n\n***\n\nb')` is `['a', 'b']`; `sceneLengths.within` is 1 for chars `[1000, 400]` against targets `[1000, 1000]`. CLI: `--draft-mode scenes` stores `draftMode: 'scenes'`, `--draft-mode x` throws, `--quick` stores `quick: true`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** README bullets (Korean): 기본 흐름은 계획 카드 뒤 본문 쓰기다. `--quick`은 계획 없이 바로 쓴다. `--draft-mode scenes`는 장면마다 따로 쓴다. 적은 지시 실행에서는 작가 에이전트가 계획 카드를 한 줄씩 고친다(최대 3번).
- [ ] **Step 4: Run the tests and see them pass**, plus `pnpm vitest run eval/novel src/lib --maxWorkers=2`.
- [ ] **Step 5: Commit** — `feat(eval): run the plan card flow and count plan edits and scene lengths`.

## Task 7: Workflow flags and summary columns for stage 1

**Files:**
- Modify: `.claude/workflows/novel-eval.js` (allowlist adds `--quick`, `--draft-mode scenes`; the author agent handles `plan_review`, which it does through `author.md`), `eval/novel/agents/summary.md` (columns `계획 시간(초)`, `계획 수정(번)`, `장면 분량 맞음(개/전체)`)
- Test: `eval/novel/workflow-static.plan.s1.test.ts`

- [ ] **Step 1: Write the failing test** — the allowlist contains `'--quick'` and `'--draft-mode scenes'`; `summary.md` mentions `planMs`, `planEdits` and `sceneLengths`.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and see it pass.**
- [ ] **Step 5: Commit** — `feat(eval): stage 1 flags and summary columns`.

## Task 8 (after M0 results): helper-task effort

Written by the orchestrator after the M0 effort tests, as a short addendum to this plan: for `continuity-check` and `chapter-extract`, the lowest effort whose result stays within the decision rule below becomes the task's `effort`, with a test pinning the value.
- Continuity: hits not lower than `high` minus 1 over the three fixtures together, trap false positives not higher, coverage unchanged.
- Extraction: matched facts at least 85% of the `high` replay's count against the reference on average, threads at least 80%.
- If no lower effort passes, the task keeps its value and the addendum says so.

---

## Gate S1 (sonnet)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`.

## Stage review (opus)

- [ ] Review the stage 1 diff along: quick-path request parity, plan validation and trust boundary (Review Focus 2), scenes-mode failure handling, eval resume safety of the plan state, UI copy and edit counting, English scaffold coverage. Skeptic-verify each finding; fix confirmed ones; Gate S1 again.

## Measurement M1 (orchestrator)

Worktree `../DaeumHwa-s1` detached at the gate commit, set up as in M0. Every run uses `--deploy-settings --directives on`. `<D>` is the default model chosen in the M0 results doc; `<O>` is the other one.

| Invocation | date | chapters | runs and extra flags |
|---|---|---|---|
| A | `2026-10-2x-s1` | 1 | `<D>` ko, `<D>` en |
| B | `2026-10-2x-s1` | 1 | `<O>` ko |
| C | `2026-10-2x-s1r` | 1 | `<D>` ko (repeat) |
| D | `2026-10-2x-s1few` | 1 | `<D>` ko `--few-instructions` |
| E | `2026-10-2x-s1scenes` | 1 | `<D>` ko `--draft-mode scenes` |
| F (in `../DaeumHwa-s0`) | `2026-10-2x-s0few` | 1 | `<D>` ko `--few-instructions` (baseline: one line, written directly) |

- [ ] Summaries per date folder; results doc (sonnet, Korean) `docs/eval/harness/<date>-stage1.md`: s1 vs s0 for `<D>` ko (two each), plan time against the 20-second target, first-char time against the s0 baseline (G5: must not grow), cost against 2× s0, few-instruction run vs its baseline (plan edits, T1 misses), scenes vs single, `<O>` and English as checks.
- [ ] Adoption (design 8.2): Q mean not more than 0.1 lower, no new threshold failures, at least one of quality, interventions, must-fix, cost or time better, cost and time within G5. The orchestrator records the decision for the plan flow and for `scenes` mode in the results doc; a change that fails is reverted (or left off by default) before stage 2.

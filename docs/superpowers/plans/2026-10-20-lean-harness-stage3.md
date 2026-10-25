# Lean Serial Harness, Stage 3 (cheap checks and flagged-scene fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution (from 2026-10-25, user decision):**
> - The orchestrator (Claude, opus) plans, dispatches and reviews the stage.
> - OpenCode (`opencode-go/muse-spark-1.3-contributor`) implements each task with TDD in one session.
> - A separate OpenCode session reviews the task against this plan.
> - Measurement reviews are also written by Muse Spark.

**Goal:** Fewer places the author must fix: right after a draft finishes, free code checks and one cheap AI check find the weak scenes, and at most two of them are rewritten once into a candidate the author applies or discards in one click.

**Architecture:** A pure check module finds per-scene problems in code (requests, clichés, repeated phrases, scene length, a summary-like ending). A new structured task `draft-check` reads the draft with scene numbers against a short rubric and returns scene numbers and reasons only. A new task `scene-fix` rewrites one flagged scene with its reasons and neighbours. The service keeps the result as a candidate in the draft run's output, like 다듬기 (P6); apply promotes it only while the draft is unchanged. The draft panel starts the check by itself when a draft finishes.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite, Vitest, `FakeAiClient`, shadcn on Base UI, novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md` sections 6.1 (flow), 6.5, 8 and the stage 3 row of section 9. Earlier plans: stage 0, 1 and 2 in `docs/superpowers/plans/2026-10-20-lean-harness-stage{0,1,2}.md`.

**Branch:** `feat/lean-harness`, after stage 2's M2 decision (`docs/eval/harness/2026-10-24-stage2-ledger.md`, 4c9720b). That decision adopted the ledger and kept speech (`AI_SPEECH_STYLE`) and the cache key off by default.

## Global Constraints

- User-facing copy is Korean, short and plain; the exact strings below are fixed. Identifiers and comments are English.
- Services throw `AppError(code, koreanMessage)`; actions and routes return `ActionResult` or JSON errors as the refine route does. The manuscript is never touched by the check or the fix; only the draft run's `ai_runs.output` changes, and only through keys this stage owns (`check`, `sceneFix`, and from task 7 `instructions`, `planNotes`) plus `text` on apply.
- No package changes. No migration.
- Draft prompts are unchanged. The quick path and the plan path both get the check.
- No best-of-N. One check and at most one fix round per draft run (a second request returns the stored result).
- English eval runs need every new Korean scaffold string translated, with no Hangul left; `EN_SYSTEMS` gets `draft-check` and `scene-fix`.
- Tests never call a real AI API. New tests go in new files `<name>.<topic>.s3.test.ts(x)`.
- Implementer commands, commit rules and README rule: as in the stage 0 plan.

## Review Focus

1. A draft with no scene break lines still gets scene numbers (paragraph chunks), and a fixed scene is spliced back at the right offsets without touching the other scenes. Test: tasks 1 and 4.
2. Apply after the draft changed (다듬기 applied, or a new continuation) is refused with `초안이 바뀌어 적용할 수 없습니다.` and changes nothing. Test: task 4.
3. A check or fix call that fails, times out or returns an unusable scene leaves the draft as it was and shows a short notice; the append and new-chapter buttons keep working. Test: tasks 4 and 5.
4. A rewritten scene that adds a banned request phrase, adds a break line, or is outside 70–140% of the original length is rejected and the scene is left as it was. Test: task 3.
5. A cliché or repeated phrase that appears once is not a finding; the thresholds below hold. Test: task 1.
6. A voice line rewrite is kept only when its speech level is the speaker's level and it keeps the line's words (bigram Dice ≥ 0.5). A line the model attributes to someone outside `<voices>` is ignored. Test: task 8.
7. An earlier plan revision note is never lost: every note of the current card chain reaches the next plan prompt and the draft check. Test: task 7.
8. A stalled cloud call in the eval is cut and retried once, and the stall is recorded; local runs are never cut. Test: task 9.

## Additions from M1 and M2 (2026-10-25)

These come from `docs/eval/harness/2026-10-21-stage1.md` and `docs/eval/harness/2026-10-24-stage2-ledger.md`. Tasks 1, 2 and 4 below already include their parts. Tasks 7–9 are new.

| Finding (runs) | Where it lands |
|---|---|
| An instructed event the plan holds is missing from the draft: "처음으로 9층 꼭대기" in s1cq and s2r. | New reason `missing-event`, first in priority. The check reads `<instructions>`. Tasks 1, 2 and 4. |
| A plan revision note is lost in the next card. In s1few, s1cfew and s2fb the author's first note asked for "열쇠를 목에 건다", and the final card and the draft lack it. | Earlier notes are carried into every revision and into the check. Task 7. |
| 한세린 (반말 in the wiki 말투) spoke 해요체 in 16–17 lines (s2, s2r; also s0m chapter 3). Lines are mostly bare paragraphs, so the stage 2 code attribution catches 0 of 17. | The AI names the speaker and rewrites the line; code verifies the level and the overlap. This runs whether or not `AI_SPEECH_STYLE` is on. Task 8. |
| Expansion added a banned phrase ("for a moment", s2 en). The stage 2 check only shows it. | Already covered: a `request` finding picks the scene and `acceptSceneFix` refuses more ban hits. Task 1 adds the English test. |
| Repetition after heavy expansion (s1cq, s2 scene 3: 785 → 1,866 characters). | Already covered by `repeat` (code) and `repeated-beat` (check). Measured in M3. |
| Repair (다듬기) wrote broken sentences (s1c 2, s1cq 1, s2f 1). | Counted in M3 from the reviews; no change in this stage. |
| Gateway calls hung for 16–27 min with no first token and broke 3 M2 runs. | Eval stall guard. Task 9. |

---

## Task 1: Pure scene checks

**Files:**
- Create: `src/lib/draft-check.ts`, `src/lib/korean/cliches.ts`
- Modify: `src/lib/scene.ts` (export `sceneSpans`)
- Test: `src/lib/draft-check.s3.test.ts`, `src/lib/scene.spans.s3.test.ts`

**Interfaces:**
- Consumes: stage 2 `matchBan`, `checkDraftDirectives`, `DirectiveForPrompt`; stage 1 `DraftPlanCard`.
- Produces in `src/lib/scene.ts`: `sceneSpans(text: string, fallbackCount: number): SceneRange[]` — spans between break lines (the existing `BREAK_LINE`, break lines excluded from the spans); with no break line, the paragraphs split into `fallbackCount` (at least 1) runs of nearly equal paragraph counts, in order. Spans cover every paragraph exactly once.
- Produces in `src/lib/korean/cliches.ts`: `CLICHES: Record<'ko' | 'en', { phrase: string; pattern: RegExp }[]>` — ko at least: 고개를 끄덕, 입꼬리가 올라, 심장이 쿵, 침을 꿀꺽, 등골이 서늘/오싹, 머릿속이 하얘, 눈시울이 붉어, 입술을 깨물, 주먹을 꽉 쥐, 숨을 들이켰, 한숨을 내쉬, 시간이 멈춘 듯, 가슴이 먹먹, 눈을 질끈 감, 미간을 찌푸; en at least: for a moment, a beat, nodded, let out a breath, heart pounded, eyes widened, jaw clenched, a shiver ran down, swallowed hard, time seemed to stop. Each `pattern` tolerates inflection the way stage 2's `matchBan` does. `textLang(text): 'ko' | 'en'` — `ko` when Hangul is at least 30% of the letters.
- Produces in `src/lib/draft-check.ts`:
  - `type SceneReason = 'missing-event' | 'request' | 'leak' | 'skipped-moment' | 'unmotivated-feeling' | 'flat-ending' | 'summary-ending' | 'repeated-beat' | 'cliche' | 'repeat' | 'scene-length'`
  - `REASON_PRIORITY: SceneReason[]` in exactly that order (first is most severe).
  - `REASON_LABELS: Record<SceneReason, string>` = missing-event `지시한 사건이 빠짐`, request `요청과 다름`, leak `공개 전 비밀이 드러남`, skipped-moment `중요한 순간을 설명으로 넘김`, unmotivated-feeling `계기 없는 감정 변화`, flat-ending `회차 끝이 밋밋함`, summary-ending `요약으로 끝남`, repeated-beat `같은 흐름 반복`, cliche `상투 표현 반복`, repeat `같은 표현 반복`, scene-length `장면 분량이 계획과 다름`.
  - `type SceneFinding = { scene: number; reason: SceneReason; note: string }` (scene is 1-based)
  - `codeSceneFindings(text: string, o: { spans: SceneRange[]; requests: DirectiveForPrompt[]; names: Record<string, string[]>; card: DraftPlanCard | null }): SceneFinding[]`:
    - `request`: each stage 2 ban or speech finding, in the scene holding its paragraph; note `'{pattern}'` or `{name} 말투`.
    - `cliche`: a scene with 2 or more cliché hits (any phrases); note the phrases joined by `, `.
    - `repeat`: an eojeol 3-gram (whitespace tokens, punctuation trimmed, dialogue included) that occurs 3 or more times in the chapter; a finding in each scene that holds its second or later occurrence; note the 3-gram.
    - `scene-length`: only with a card whose scene count equals the span count; a scene outside 60–140% of its `targetChars`; note `{chars}/{target}자`.
    - `summary-ending`: the last paragraph has no quote and at least two of these markers: `결국`, `마침내`, `그렇게`, `이렇게`, `앞으로`, `깨달았다`, `다짐했다`, `것이다.`, `시작이었다`, `알 수 있었다` (en: `finally`, `in the end`, `realized`, `would never`, `was only the beginning`, `knew that`); a finding in the last scene.
  - `pickScenes(findings: SceneFinding[], max = 2): number[]` — scenes ordered by their most severe reason (by `REASON_PRIORITY`), then by finding count, then by scene number; `cliche`, `repeat` and `scene-length` alone never pick a scene.

- [ ] **Step 1: Write the failing tests:** `sceneSpans` with two `***` lines gives three spans that exclude the break lines; with none and 10 paragraphs, `fallbackCount` 3 gives runs of 4, 3, 3 paragraphs; one cliché in a scene gives nothing and two give one `cliche` finding; `고개를 한 번 끄덕였다` counts as a cliché hit; a 3-gram seen twice gives nothing and three times gives `repeat` findings in the scenes of the 2nd and 3rd; a card with targets 1000 and a 500-character scene gives `scene-length`; a last paragraph `결국 그렇게 모든 것이 시작이었다.` gives `summary-ending` and a last line of dialogue does not; `pickScenes` puts a `missing-event` scene before a `request` scene, a `request` scene before a `skipped-moment` scene, and returns `[]` for only `cliche` and `repeat` findings; `textLang` on English prose is `en`; an English draft with `She stopped for a moment` in scene 2 under a ban request with pattern `for a moment` gives a `request` finding in scene 2 (the M2 English case).
- [ ] **Step 2: Run** `pnpm vitest run src/lib/draft-check.s3.test.ts src/lib/scene.spans.s3.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/lib --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(check): find weak scenes in code`.

## Task 2: `draft-check` task

**Files:**
- Create: `src/ai/tasks/draft-check.ts`, `eval/novel/localize/en/draft-check.ts`, `eval/novel/localize/samples/draft-check.ts`
- Modify: `src/db/types.ts` (`AI_TASKS` gains `'draft-check'`, `'scene-fix'`), `eval/novel/localize/en-systems.ts`, `eval/novel/localize/scaffold.ts`, the en-systems snapshot
- Test: `src/ai/tasks/draft-check.s3.test.ts`, `eval/novel/localize/localize.check.s3.test.ts`

**Interfaces:**
- Produces: `type DraftCheckInput = { numbered: string; sceneCount: number; plan: string | null; instructions: string | null; requests: DirectiveForPrompt[]; hiddenFacts: string[] }` and `DraftCheckSchema` = `{ scenes: { scene: number (int 1..sceneCount checked in postProcess), reasons: { code: 'missing-event' | 'skipped-moment' | 'unmotivated-feeling' | 'repeated-beat' | 'flat-ending' | 'request' | 'leak'; note: string (max 80) }[] (max 3) }[] }`; `postProcess` drops scenes out of range and empty reason lists, and keeps at most 4 scenes.
- Produces: `draftCheckTask: AiTaskDef<DraftCheckInput, DraftCheckOutput>` — effort `'low'`, maxTokens `2000`, system `DRAFT_CHECK_SYSTEM`.
- Produces: `numberScenes(text: string, spans: SceneRange[]): string` — each span prefixed with a line `[장면 N]`, spans joined by a blank line, break lines dropped.
- Prompt (`buildPrompt`): `<draft>` (the numbered text, neutralized), then `<instructions>` (the author's instruction text and plan revision notes, neutralized, from task 7's `output.instructions` and `output.planNotes`) when there are any, then `<plan>` (stage 1 `renderPlanInstructions('', card)`) when there is a plan, then `renderRequestsBlock` of the `style` and `content` requests only when there are any, then `<hidden_facts>` (one `- ` line each) only when there are any.
- `DRAFT_CHECK_SYSTEM` (Korean; English twin in `localize/en/draft-check.ts`) says, in this order:
  - You check one web-novel chapter draft. Do not rewrite or quote long passages.
  - Flag a scene only for these, each with a short note (80 characters at most): `missing-event` (an event that `<instructions>` or the plan's scene asks for does not happen in the scene where it belongs; the note names the event; an event the plan moved to another scene is judged in that scene), `skipped-moment` (a key moment of the plan or the scene is told in summary instead of shown), `unmotivated-feeling` (a character's feeling changes with no event that causes it), `repeated-beat` (the scene repeats the previous scene's beat or exchange), `flat-ending` (only the last scene: the chapter ends without a question, crisis or twist), `request` (breaks one of `<author_requests>`), `leak` (reveals or strongly hints at one of `<hidden_facts>`).
  - Flag only clear cases. A scene without a clear problem is left out. Return `{"scenes": []}` when nothing is clear.

- [ ] **Step 1: Write the failing tests:** the prompt holds `[장면 1]`…`[장면 3]` and no break line; `<instructions>`, `<plan>`, `<author_requests>` and `<hidden_facts>` appear only when given, in that order; the system holds `missing-event`; ban and speech requests are not in the check prompt (code checks cover them); `postProcess` drops scene 5 of 3, drops empty reasons and keeps 4 of 6 scenes; the system holds the six codes; the English localization leaves no Hangul.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/tasks/draft-check.s3.test.ts eval/novel/localize/localize.check.s3.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run eval/novel/localize src/ai/tasks --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): add a cheap rubric check that names weak scenes`.

## Task 3: `scene-fix` task

**Files:**
- Create: `src/ai/tasks/scene-fix.ts`, `eval/novel/localize/en/scene-fix.ts`, `eval/novel/localize/samples/scene-fix.ts`
- Modify: `eval/novel/localize/en-systems.ts`, `eval/novel/localize/scaffold.ts`, the en-systems snapshot
- Test: `src/ai/tasks/scene-fix.s3.test.ts`

**Interfaces:**
- Produces: `type SceneFixInput = { scene: string; before: string; after: string; reasons: { label: string; note: string }[]; planScene: string | null; requests: DirectiveForPrompt[]; styleCards: DraftPromptInput['styleCards'] }`; schema `{ text: string }`; `sceneFixTask` — effort `'medium'`, maxTokens `6000`, system `SCENE_FIX_SYSTEM`.
- Prompt: `renderRequestsBlock(requests)` (when any), `<style_cards>` (as the draft renders them), `<plan_scene>` (when given), `<before>` (the last two paragraphs of the previous scene, or `(없음)`), `<scene>`, `<after>` (the first paragraph of the next scene, or `(없음)`), `<problems>` (`- {label}: {note}` lines).
- `SCENE_FIX_SYSTEM` (Korean; English twin): rewrite only `<scene>` so the listed problems are gone; keep its events, names, places, point of view and the facts it states; it must still follow from `<before>` and lead into `<after>`; show the key moment in action and dialogue; give a feeling change its cause; keep the length about the same; no scene break lines; return only the scene text.
- Produces: `acceptSceneFix(original: string, fixed: string, requests: DirectiveForPrompt[]): boolean` — false when `fixed` is empty, holds a break line, is outside 70–140% of `draftCharCount(original)`, or has more `matchBan` hits than `original` for any ban request.

- [ ] **Step 1: Write the failing tests:** the prompt has the tags in order and `(없음)` for a first scene's `<before>`; `acceptSceneFix` rejects a fix with `***`, one at 60% length, one adding `입꼬리` under a ban request, and accepts a fix at 100% with the same hits; the English localization leaves no Hangul.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/tasks/scene-fix.s3.test.ts eval/novel/localize --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): add a one-scene fix task`.

## Task 4: Check-and-fix service, route and apply

**Files:**
- Create: `src/server/draft-check.ts`, `src/app/api/works/[workId]/draft/check/route.ts`
- Modify: `src/server/actions/ai-features.ts` (`applySceneFixAction`, `discardSceneFixAction`), `src/db/types.ts` (`USAGE_EVENT_KINDS` gains `'check_flagged'`, `'scene_fix_applied'`, `'scene_fix_discarded'`)
- Test: `src/server/draft-check.s3.test.ts`, `src/app/api/works/[workId]/draft/check/route.s3.test.ts`

**Interfaces:**
- Consumes: tasks 1–3; stage 2 `activeDirectivesFor`, `checkDraftDirectives`; P6's `loadDraftRun` pattern in `src/server/draft-refine.ts` (reuse it; export it if needed).
- Produces: `type DraftCheckResult = { findings: SceneFinding[]; fix: { scenes: { scene: number; reasons: SceneReason[] }[]; parts: DiffPart[]; token: string } | null; notice: string | null }`.
- Produces: `checkAndFixDraft(db, actor, input: { workId: string; runId: string }, client?, signal?, now = Date.now): Promise<DraftCheckResult>` — editor role:
  1. If `output.check` exists for the current text, return it (no new calls).
  2. Spans: `sceneSpans(text, card?.scenes.length ?? draftLengthPlan(targetChars).sceneCount)` (card = stage 1 `output.plan`).
  3. Code findings (task 1), then the `draft-check` call with requests, the instructions (`output.instructions` and `output.planNotes` joined by newlines, or null when the run has neither, as runs made before task 7 do) and the `content` of the work's facts whose `revealAtPosition` is above the draft's position (at most 20). A failed check call keeps the code findings and sets `notice` `AI 점검을 하지 못했습니다. 코드 점검 결과만 보여 드립니다.`
  4. `pickScenes(findings)`; for each picked scene one `scene-fix` call in order, each accepted only by `acceptSceneFix`; rejected or failed scenes are dropped.
  5. When at least one scene was fixed, splice the fixed scenes into the text back to front by span offsets, and store `output.sceneFix = { base: text, text: fixed, scenes, token }` with the same conditional update P6 uses (only while `output.text` is unchanged). Store `output.check = { base: text, findings, notice }` the same way.
  6. Budget: stop starting fix calls when less than 20 s of a 280 s total remain (as `MIN_REPAIR_MS`).
  7. Records `check_flagged` (value = picked scene count, `extra: { findings: n }`); recording failures are ignored.
- Produces: `applySceneFix(db, actor, { workId, runId, token })` — refuses a missing candidate (`BAD_STATE`, `고친 안이 없습니다.`), a wrong token or a stale base (`BAD_STATE`, `초안이 바뀌어 적용할 수 없습니다.`); sets `text` to the candidate, keeps `originalText` if absent, removes `sceneFix`; records `scene_fix_applied`. `discardSceneFix` removes `sceneFix` and records `scene_fix_discarded`.
- Route `POST /api/works/[workId]/draft/check` with `{ runId }`, `maxDuration = 300`, the refine route's error mapping.

- [ ] **Step 1: Write the failing tests** (`FakeAiClient` with fixed `draft-check` and `scene-fix` outputs): a 3-scene draft with a `skipped-moment` on scene 2 gives a candidate where only scene 2 changed; a second call returns the stored result without new runs; a failing check call still returns code findings with the notice; a rejected fix (60% length) gives `fix: null`; apply sets the text and removes `sceneFix`; apply after the text changed throws the stale message and leaves the run as it was; discard keeps the text; a viewer gets `FORBIDDEN` and a non-member `NOT_FOUND`; the hidden facts sent are only those with reveal above the position; the route returns 200 with the result and maps `BAD_STATE` like the refine route.
- [ ] **Step 2: Run** `pnpm vitest run src/server/draft-check.s3.test.ts "src/app/api/works/[workId]/draft/check/route.s3.test.ts" --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): check a finished draft and fix up to two weak scenes`.

## Task 5: Draft panel check view

**Files:**
- Create: `src/components/writing/panels/draft-check.tsx`
- Modify: `src/components/writing/panels/draft-panel.tsx`
- Test: `src/components/writing/panels/draft-check.s3.test.tsx`

**Interfaces:**
- Produces: `DraftCheck({ workId, runId, onApplied(text: string), onPreviewChange(open: boolean) })` — starts `POST …/draft/check` once when mounted; the panel mounts it when a draft finishes and is complete (where `DraftRefine` mounts), above `DraftRefine`.
- Copy (exact): `점검하는 중`; `고칠 곳을 찾지 못했습니다.`; findings title `점검 결과`, one line per scene `장면 {n}: {labels joined by ', '}`; when a fix exists the title `고친 장면 미리 보기`, the P6 diff legend `초록은 새 글, 빨강 취소선은 지워지는 글입니다.`, buttons `적용` and `버리기`, toast `고친 장면으로 바꿨습니다.`; the result's `notice` as a muted line; a request error shows `점검을 하지 못했습니다.` and nothing else changes.
- While a fix preview is open the panel disables append, new chapter and 다듬기, as it does for the refine preview; after apply or discard they come back.

- [ ] **Step 1: Write the failing tests:** mounting calls the route once; the found and not-found states render their copy; apply calls `applySceneFixAction` with the token and passes the text to `onApplied`; discard calls the discard action; a 500 shows `점검을 하지 못했습니다.` and the panel's append button stays enabled; while the preview is open, append and 다듬기 are disabled.
- [ ] **Step 2: Run** `pnpm vitest run src/components/writing/panels/draft-check.s3.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/components/writing --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(writing): show the draft check and the fixed scenes`.

## Task 6: Eval — check and fix in the draft step

**Files:**
- Modify: `eval/novel/cli.ts`, `eval/novel/state.ts`, `eval/novel/steps/chapter.ts`, `eval/novel/harness-summary.ts`, `eval/novel/agents/summary.md`, `.claude/workflows/novel-eval.js`, `docs/eval/novel/README.md`
- Test: `eval/novel/run.check.s3.test.ts`, `eval/novel/harness-summary.check.s3.test.ts`, `eval/novel/workflow-static.check.s3.test.ts`

**Interfaces:**
- Produces: flag `--scene-fix off` (config `sceneFix: false`, dir suffix `-nofix`); default on.
- Produces: in the draft step, right after the draft (and continuation) is stored and before the existing trim and repair, `checkAndFixDraft` runs; when it returns a fix, the eval applies it (the product's one-click default; the author agent sees the final text in `draft_review`). A failure is recorded and the draft goes on unchanged.
- Produces: `ChapterHarness` gains `checkFlagged` (picked scenes), `sceneFixes` (scenes applied) and `checkMs` (sum of `draft-check` and `scene-fix` durations; these calls belong to the draft step, so they also count in `writeMs`, since the author waits for them before saving); old runs give 0.
- Produces: `ALLOWED_RUN_FLAGS` gains `'--scene-fix off'`; `summary.md` gains columns `점검 장면` and `고친 장면`.

- [ ] **Step 1: Write the failing tests:** a fake run's chapter 1 records one `draft-check` call and, with a fake fix, one `scene-fix` call and the fixed text in `chapters/01.md`; `--scene-fix off` records neither; a throwing check leaves the draft text; the harness counts from synthetic records; the allowlist has the flag.
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/run.check.s3.test.ts eval/novel/harness-summary.check.s3.test.ts eval/novel/workflow-static.check.s3.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** README: one bullet for `--scene-fix off`.
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run eval --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(eval): check and fix weak scenes in the draft step`.

## Task 7: Carry every revision note, and keep the instructions in the draft run

**Files:**
- Modify:
  - `src/ai/tasks/draft-plan.ts` (`DraftPlanInput.revision`, `revisionSection`)
  - `src/server/ai-features.ts` (`planDraft`, `keepPlanInRun` and the quick-path finish)
  - `src/server/actions/ai-features.ts` (`PlanDraftSchema` and the draft action schema)
  - `src/components/writing/panels/draft-panel.tsx`
  - `eval/novel/steps/chapter.ts` (the plan loop near `revision?:`)
  - `eval/novel/localize/en/draft-plan.ts` and the en-systems snapshot, if the English twin holds the revision text
- Test:
  - `src/ai/tasks/draft-plan.notes.s3.test.ts`
  - `src/components/writing/panels/draft-panel.notes.s3.test.tsx`
  - `src/server/ai-features.notes.s3.test.ts`
  - `eval/novel/steps/chapter.notes.s3.test.ts`

**Interfaces:**
- `DraftPlanInput.revision` becomes `{ card: DraftPlanCard; note: string; earlierNotes: string[] } | null`. `earlierNotes` holds at most 5 notes of 300 characters each, oldest first.
- `revisionSection` renders the earlier notes before the current note. It adds the line `앞서 고쳐 달라고 한 것 (이번에도 지킨다):` and one `- {note}` line per earlier note, all neutralized. With no earlier notes the block is exactly as before.
- Add one rule line to `DRAFT_PLAN_SYSTEM`, right after the existing `<revision>` line:
  > - <revision>의 "앞서 고쳐 달라고 한 것"도 새 계획에 남긴다. 작가가 뒤 메모에서 바꾸라고 한 것만 바꾼다.

  Its English twin goes in the localization.
- `PlanDraftSchema.revision.earlierNotes`: `z.array(z.string().trim().min(1).max(300)).max(5).default([])`.
- The draft action schema gains `planNotes` with the same limits, optional.
- The draft panel keeps the notes sent for the current card chain, in order.
  - A revision sends them as `earlierNotes`, and the draft sends them as `planNotes`.
  - The list is cleared when a new plan starts (not a revision), when the instructions text changes, and when the chapter changes.
  - No new copy.
- The finished draft run stores `output.instructions` (the trimmed instruction text, at most 5,000 characters, or null when empty) and `output.planNotes` (the notes, or `[]`).
  - This happens on both the plan path (next to `plan` in `keepPlanInRun`) and the quick path.
  - The other output keys are kept.
- In the eval chapter step, every revision call passes the notes the author agent gave before it for this chapter, and the draft call passes all of them.

- [ ] **Step 1: Write the failing tests:**
  - The revision prompt with two earlier notes holds both, in order, before `작가 메모:`, and neutralizes a `</revision>` inside a note.
  - With `earlierNotes: []` the prompt is byte-identical to the current one.
  - The action refuses a sixth note.
  - In the panel, after two revisions the third revision sends the first two notes. A new plan sends `earlierNotes: []`, and editing the instructions clears the list.
  - A finished draft run with a plan has `output.instructions` and `output.planNotes`. A quick-path run has `instructions` and `planNotes: []`.
  - The eval's third revision call carries the first two notes.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/tasks/draft-plan.notes.s3.test.ts src/components/writing/panels/draft-panel.notes.s3.test.tsx src/server/ai-features.notes.s3.test.ts eval/novel/steps/chapter.notes.s3.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, plus `pnpm vitest run src/ai/tasks src/components/writing eval/novel/localize --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(plan): carry earlier revision notes and keep the instructions in the draft run`.

## Task 8: `voice-fix` — repair the lines that break a character's speech level

**Files:**
- Create:
  - `src/lib/voice-level.ts`
  - `src/ai/tasks/voice-fix.ts`
  - `eval/novel/localize/en/voice-fix.ts`
  - `eval/novel/localize/samples/voice-fix.ts`
- Modify:
  - `src/db/types.ts` (`AI_TASKS` gains `'voice-fix'`)
  - `src/server/draft-check.ts` (`checkAndFixDraft`)
  - `src/components/writing/panels/draft-check.tsx`
  - `eval/novel/localize/en-systems.ts` and the en-systems snapshot
  - `eval/novel/harness-summary.ts`
- Test:
  - `src/lib/voice-level.s3.test.ts`
  - `src/ai/tasks/voice-fix.s3.test.ts`
  - `src/server/draft-check.voice.s3.test.ts`
  - `src/components/writing/panels/draft-check.voice.s3.test.tsx`

**Interfaces:**
- **`voiceLevelOf(speech: string): SpeechLevel | null`** in `src/lib/voice-level.ts`.
  - The level words are 반말 for `banmal`, and 존댓말, 높임말, 합쇼체 and 해요체 for `jondaet`.
  - A word is positive when an optional particle (`을|를|로|만|도`) and then `쓰`, `한다`, `하` or `말하` follow it.
  - A word is negative when `없이`, `대신`, `말고` or `않` follows it within 4 characters.
  - The result is the level of the only positive word. When no word is positive, it is the level of the only non-negative word that appears. When both levels appear positively, or nothing applies, the result is null.
- **`quotedLines(text)`** returns `{ id: number; start: number; end: number; quote: string; level: SpeechLevel | null }[]`.
  - It covers every quoted line by stage 2's `QUOTED_LINE_RE`. Export that pattern from `src/lib/directive-check.ts` and do not copy it.
  - `id` counts from 1, and `level` is `speechLevelOf(quote)`.
- **`markLines(text, lines)`** puts `⟦N⟧` right before each quoted line.
- **`voiceFixTask`**:
  - Input: `{ marked: string; voices: { name: string; level: SpeechLevel; speech: string }[] }`.
  - Schema: `{ lines: { id: int; speaker: string; text: string }[] }`, at most 40 lines.
  - Effort `'low'`, maxTokens `3000`, system `VOICE_FIX_SYSTEM`.
- **The prompt** is `<voices>`, then `<draft>`.
  - Each `<voices>` line is `- {name}: {반말|존댓말} ({speech})`.
  - `<draft>` holds the marked text, neutralized.
- **`VOICE_FIX_SYSTEM`** is in Korean, with an English twin for the localization test only. It says:
  - Find who speaks each numbered line from the narration and the turn order.
  - Pick only the lines whose speaker is in `<voices>` and whose ending breaks that speaker's level, and say who speaks each one.
  - Rewrite each picked line in that level, with the same meaning and as many of its words as possible, and keep the quote marks.
  - Leave out every other line. Return `{"lines": []}` when there is none.
- **`acceptVoiceLine(original, fixed, level)`** keeps a rewrite only when all of these hold:
  - `speechLevelOf(fixed) === level`
  - `bigramDice(original, fixed) >= 0.5` (`src/ai/guards/similarity.ts`)
  - `fixed` keeps the opening and closing quote marks of `original`
  - `fixed` has no newline
  - its length is 50–200% of the original
- **In `checkAndFixDraft`**, before the code findings:
  - **When:** Korean drafts only (`textLang`).
  - **Voices:** the character entries whose `fields.speech` gives a `voiceLevelOf` level. `never`-tier entries are left out. The rest are sorted as `selectMainVoices` sorts them, at most 6. This does not depend on `AI_SPEECH_STYLE`.
  - **Call:** when some voice's level differs from some non-null line level, make one `voice-fix` call. A line whose speaker is not in the voices, or whose rewrite `acceptVoiceLine` rejects, stays as it was.
  - **Applying:** accepted lines are spliced back to front by their offsets into the working text. The scene check and fix then run on that text.
  - **Candidate:** the candidate (`output.sceneFix`) holds both kinds of change.
  - **Result:** `DraftCheckResult.fix` gains `voiceLines: number`. `fix` is non-null when `voiceLines > 0`, even with no fixed scene.
  - **Failure:** a failed voice call is skipped silently, and the scene check goes on.
  - **Budget:** it counts toward the 280 s budget.
- **Panel:** when `voiceLines > 0`, the preview shows the muted line `말투를 고친 대사 {n}줄`.
- **Eval:** `ChapterHarness` gains `voiceFixes` (accepted lines). The `voice-fix` duration counts in `checkMs` and `writeMs`.

- [ ] **Step 1: Write the failing tests:**
  - **`voiceLevelOf`:**

    | Speech text | Level |
    |---|---|
    | `반말을 쓰며 짧고 직설적이다.` | banmal |
    | `처음 만나는 어른에게도 존댓말 없이 반말을 쓰며` | banmal |
    | `세린에게도 존댓말을 쓰며` | jondaet |
    | `공손한 존댓말 속에 비꼼이 섞이며` | jondaet |
    | `짧고 단정한 문장을 쓴다.` | null |
    | `존댓말을 쓰다가 화나면 반말을 한다` | null |

  - `quotedLines` finds the lines of a text with `"빨래 가져왔어요."` and `"누구세요."`.
  - **The service** (fixed `voice-fix` output) on a 3-scene draft where 세린 (반말) says `"빨래 가져왔어요."` and `"누구세요."`:
    - Accepted rewrites `"빨래 가져왔어."` and `"누구야."` change only those two lines, and the candidate holds them.
    - A rewrite that is still 해요체 is rejected.
    - A rewrite with Dice below 0.5 is rejected.
    - A line attributed to `곽두석` (not in the voices) is ignored.
    - An English draft makes no call.
    - Voices without a level make no call.
    - A failing call still gives the scene check.
    - A second request makes no new call.
  - **The panel** shows `말투를 고친 대사 2줄`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/voice-level.s3.test.ts src/ai/tasks/voice-fix.s3.test.ts src/server/draft-check.voice.s3.test.ts src/components/writing/panels/draft-check.voice.s3.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, plus `pnpm vitest run src/server src/components/writing eval/novel/localize --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(check): fix lines that break a character's speech level`.

## Task 9: Eval stall guard for cloud calls

**Files:**
- Modify: `eval/novel/eval-client.ts`, `eval/novel/harness-summary.ts`
- Test: `eval/novel/eval-client.stall.s3.test.ts`

**Interfaces:**
- **When the guard applies:** to cloud calls only (provider not `ollama`).
- **Limit:** the eval client aborts a call that runs longer than `productTimeoutMs + 60_000`.
- **Retry:** it retries once at once, with the same request.
- **Record:** the call record gains `stalled: true` on the cut call.
- **Second stall:** a second stall throws the usual model error with the message `AI 호출이 멈춰 두 번 끊었습니다.`. The step then fails as any model failure does, through the existing retry and pause rules.
- **Local runs are never cut**, so their behaviour is unchanged.
- **Harness:** `harness.total` and each chapter gain `stalls` (the count of `stalled` records). Old runs give 0.

- [ ] **Step 1: Write the failing tests** with a fake inner client that never resolves until aborted, and fake timers:
  - A cloud call is cut at `productTimeoutMs + 60 s` and retried. The second attempt's result is returned, and one `stalled` record is written.
  - Two stalls throw the message above.
  - An `ollama` call is not cut.
  - The harness counts `stalls`.
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/eval-client.stall.s3.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run eval --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(eval): cut and retry stalled cloud calls`.

## Gate S3 (OpenCode runs it, the orchestrator reads the output)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`. Only stale pinned tests are fixed here; defects go back to the owning task. No measurement runs during the gate.

## Stage review (orchestrator, opus)

- [ ] **Range:** the stage 3 range. The orchestrator reviews it; OpenCode fixes what it finds with the task procedure, then Gate S3 runs again. Check:
  - Candidate and apply safety: stale base, tokens, and requests that overlap with 다듬기.
  - Splice offsets on real drafts from `eval/results` (read-only).
  - Code-check false positives on those drafts: clichés, 3-grams, summary endings.
  - The check, fix and voice-fix prompts as a model would read them, in Korean and English.
  - Cost and time: one check, one voice fix and at most two scene fixes per draft.
- [ ] **Voice-fix probe** before M3, with cloud Haiku and a scratch script that sends the product prompt:
  - Replay `voice-fix` on the saved first drafts of s2 and s2r (`eval/results/novel/2026-10-24-s2/run-04-ko`, `2026-10-24-s2r/run-04-ko`).
  - **Pass:** at least 12 of the 17 and 16 해요체 lines of 한세린 are accepted, and no line of 백지원 or 도윤서 is changed.
  - **Fail:** fix the prompt first.
- [ ] **Missing-event probe:** replay `draft-check` on the saved s2r draft. Pass: it names "9층 꼭대기" (`missing-event`) in scene 1.

## Measurement M3 (orchestrator)

**Setup:**
- Worktree `../DaeumHwa-s3`, detached at the reviewed commit and set up as in M0: a real `.env.local` copy, offline node_modules, and `eval/results` as a symlink to the main checkout.
- Flags on every run: the stage 2 set as adopted in M2 (`--deploy-settings --directives ledger`, speech off), unless a run says otherwise.
- D = haiku-5.5 and O = luna-6.

**Who does what:**
- OpenCode runners drive each run: they loop `advance` and give each pending item to a fresh author subagent.
- The orchestrator runs `blind`, `publish-review` and `review-gate`.
- Reviews are fresh OpenCode sessions that get only `eval/novel/agents/reviewer.md` and the blind folder. The model is Muse Spark (user decision).
- At most 2 runs at once.

- [ ] **Same-reviewer baseline first:** have Muse Spark re-review the Sonnet-reviewed M2 runs from fresh blind copies: s2m (3 chapters), s2, s2r and s2 en.
  - Use `blind --dir <run> --second` when the folder `blind-2/` is free; otherwise copy the blind folder to `eval/results/novel/<date>/blind-muse/<run>`. Write the reviews under `docs/eval/novel/<date>/muse/`.
  - The M3 comparison uses only Muse Spark reviews: these four, plus s2mns, s2fb and s2l.
- [ ] **Effort, check:** replay `draft-check` at `low` and `medium` on the M2 drafts (a small script under the scratchpad with `withEffort`). Keep `low` unless `medium` flags clearly more scenes that the M2 reviews also named.
- [ ] **Runs (8):**
  - D ko 1 chapter, twice (comparison)
  - D ko 1 chapter `--few-instructions`
  - D ko 3 chapters
  - O ko 1 chapter
  - D en 1 chapter
  - D ko 1 chapter with `--speech on`, twice (does task 8 make speech safe to turn on?)
- [ ] **Decide:**
  - **The check:** the adoption rule against M2 (Muse Spark reviews), with must-fix per 1,000 characters, missing events (T1) and regenerations as the main metrics. If Q falls or must-fix does not fall, run one D ko chapter with `--scene-fix off` in the same worktree before reverting, to separate the check from run noise.
  - **Speech:** if both `--speech on` runs have no T2 and their must-fix is within the speech-off runs' range, set `isSpeechStyleEnabled` to default on (an unset env means on; `off` turns it off), with its test updated, in one commit. Otherwise it stays off.
- [ ] **Results doc (Korean, written by OpenCode from the orchestrator's numbers):** `docs/eval/harness/2026-10-2x-stage3-check.md`. It holds:
  - Per run: the stage 0 columns, plus flagged scenes, fixed scenes, voice lines fixed and stalls.
  - Must-fix against M2.
  - Must-fix places that the reviews say repair (다듬기) created.
  - The decisions, with numbers.
- [ ] Copy the worktree's `docs/eval/novel/2026-10-2x-s3*/` into the main checkout and commit by name. Remove `../DaeumHwa-s3` after the copy.

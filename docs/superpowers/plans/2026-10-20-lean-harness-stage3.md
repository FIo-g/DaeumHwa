# Lean Serial Harness, Stage 3 (cheap checks and flagged-scene fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution is a dynamic workflow: haiku implements each task (TDD), sonnet reviews it, opus reviews the stage, then the orchestrator measures.

**Goal:** Fewer places the author must fix: right after a draft finishes, free code checks and one cheap AI check find the weak scenes, and at most two of them are rewritten once into a candidate the author applies or discards in one click.

**Architecture:** A pure check module finds per-scene problems in code (requests, clichés, repeated phrases, scene length, a summary-like ending). A new structured task `draft-check` reads the draft with scene numbers against a short rubric and returns scene numbers and reasons only. A new task `scene-fix` rewrites one flagged scene with its reasons and neighbours. The service keeps the result as a candidate in the draft run's output, like 다듬기 (P6); apply promotes it only while the draft is unchanged. The draft panel starts the check by itself when a draft finishes.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite, Vitest, `FakeAiClient`, shadcn on Base UI, novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md` sections 6.1 (flow), 6.5, 8 and the stage 3 row of section 9. Earlier plans: stage 0, 1 and 2 in `docs/superpowers/plans/2026-10-20-lean-harness-stage{0,1,2}.md`.

**Branch:** `feat/lean-harness`, after stage 2's gate, review fixes and M2 decision.

## Global Constraints

- User-facing copy is Korean, short and plain; the exact strings below are fixed. Identifiers and comments are English.
- Services throw `AppError(code, koreanMessage)`; actions and routes return `ActionResult` or JSON errors as the refine route does. The manuscript is never touched by the check or the fix; only the draft run's `ai_runs.output` changes, and only through keys this stage owns (`check`, `sceneFix`) plus `text` on apply.
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
  - `type SceneReason = 'request' | 'leak' | 'skipped-moment' | 'unmotivated-feeling' | 'flat-ending' | 'summary-ending' | 'repeated-beat' | 'cliche' | 'repeat' | 'scene-length'`
  - `REASON_PRIORITY: SceneReason[]` in exactly that order (first is most severe).
  - `REASON_LABELS: Record<SceneReason, string>` = request `요청과 다름`, leak `공개 전 비밀이 드러남`, skipped-moment `중요한 순간을 설명으로 넘김`, unmotivated-feeling `계기 없는 감정 변화`, flat-ending `회차 끝이 밋밋함`, summary-ending `요약으로 끝남`, repeated-beat `같은 흐름 반복`, cliche `상투 표현 반복`, repeat `같은 표현 반복`, scene-length `장면 분량이 계획과 다름`.
  - `type SceneFinding = { scene: number; reason: SceneReason; note: string }` (scene is 1-based)
  - `codeSceneFindings(text: string, o: { spans: SceneRange[]; requests: DirectiveForPrompt[]; names: Record<string, string[]>; card: DraftPlanCard | null }): SceneFinding[]`:
    - `request`: each stage 2 ban or speech finding, in the scene holding its paragraph; note `'{pattern}'` or `{name} 말투`.
    - `cliche`: a scene with 2 or more cliché hits (any phrases); note the phrases joined by `, `.
    - `repeat`: an eojeol 3-gram (whitespace tokens, punctuation trimmed, dialogue included) that occurs 3 or more times in the chapter; a finding in each scene that holds its second or later occurrence; note the 3-gram.
    - `scene-length`: only with a card whose scene count equals the span count; a scene outside 60–140% of its `targetChars`; note `{chars}/{target}자`.
    - `summary-ending`: the last paragraph has no quote and at least two of these markers: `결국`, `마침내`, `그렇게`, `이렇게`, `앞으로`, `깨달았다`, `다짐했다`, `것이다.`, `시작이었다`, `알 수 있었다` (en: `finally`, `in the end`, `realized`, `would never`, `was only the beginning`, `knew that`); a finding in the last scene.
  - `pickScenes(findings: SceneFinding[], max = 2): number[]` — scenes ordered by their most severe reason (by `REASON_PRIORITY`), then by finding count, then by scene number; `cliche`, `repeat` and `scene-length` alone never pick a scene.

- [ ] **Step 1: Write the failing tests:** `sceneSpans` with two `***` lines gives three spans that exclude the break lines; with none and 10 paragraphs, `fallbackCount` 3 gives runs of 4, 3, 3 paragraphs; one cliché in a scene gives nothing and two give one `cliche` finding; `고개를 한 번 끄덕였다` counts as a cliché hit; a 3-gram seen twice gives nothing and three times gives `repeat` findings in the scenes of the 2nd and 3rd; a card with targets 1000 and a 500-character scene gives `scene-length`; a last paragraph `결국 그렇게 모든 것이 시작이었다.` gives `summary-ending` and a last line of dialogue does not; `pickScenes` puts a `request` scene before a `skipped-moment` scene and returns `[]` for only `cliche` and `repeat` findings; `textLang` on English prose is `en`.
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
- Produces: `type DraftCheckInput = { numbered: string; sceneCount: number; plan: string | null; requests: DirectiveForPrompt[]; hiddenFacts: string[] }` and `DraftCheckSchema` = `{ scenes: { scene: number (int 1..sceneCount checked in postProcess), reasons: { code: 'skipped-moment' | 'unmotivated-feeling' | 'repeated-beat' | 'flat-ending' | 'request' | 'leak'; note: string (max 80) }[] (max 3) }[] }`; `postProcess` drops scenes out of range and empty reason lists, and keeps at most 4 scenes.
- Produces: `draftCheckTask: AiTaskDef<DraftCheckInput, DraftCheckOutput>` — effort `'low'`, maxTokens `2000`, system `DRAFT_CHECK_SYSTEM`.
- Produces: `numberScenes(text: string, spans: SceneRange[]): string` — each span prefixed with a line `[장면 N]`, spans joined by a blank line, break lines dropped.
- Prompt (`buildPrompt`): `<draft>` (the numbered text, neutralized), then `<plan>` (stage 1 `renderPlanInstructions('', card)`) when there is a plan, then `renderRequestsBlock` of the `style` and `content` requests only when there are any, then `<hidden_facts>` (one `- ` line each) only when there are any.
- `DRAFT_CHECK_SYSTEM` (Korean; English twin in `localize/en/draft-check.ts`) says, in this order:
  - You check one web-novel chapter draft. Do not rewrite or quote long passages.
  - Flag a scene only for these, each with a short note (80 characters at most): `skipped-moment` (a key moment of the plan or the scene is told in summary instead of shown), `unmotivated-feeling` (a character's feeling changes with no event that causes it), `repeated-beat` (the scene repeats the previous scene's beat or exchange), `flat-ending` (only the last scene: the chapter ends without a question, crisis or twist), `request` (breaks one of `<author_requests>`), `leak` (reveals or strongly hints at one of `<hidden_facts>`).
  - Flag only clear cases. A scene without a clear problem is left out. Return `{"scenes": []}` when nothing is clear.

- [ ] **Step 1: Write the failing tests:** the prompt holds `[장면 1]`…`[장면 3]` and no break line; `<plan>`, `<author_requests>` and `<hidden_facts>` appear only when given; ban and speech requests are not in the check prompt (code checks cover them); `postProcess` drops scene 5 of 3, drops empty reasons and keeps 4 of 6 scenes; the system holds the six codes; the English localization leaves no Hangul.
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
  3. Code findings (task 1), then the `draft-check` call with requests and the `content` of the work's facts whose `revealAtPosition` is above the draft's position (at most 20). A failed check call keeps the code findings and sets `notice` `AI 점검을 하지 못했습니다. 코드 점검 결과만 보여 드립니다.`
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

## Gate S3 (sonnet)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`. Only stale pinned tests are fixed here; defects go back to the owning task.

## Stage review (opus)

- [ ] Review the stage 3 range along: candidate and apply safety (stale base, tokens, overlapping requests with 다듬기), splice offsets on real drafts from `eval/results` (read-only), code-check false positives on those drafts (clichés, 3-grams, summary endings), the check and fix prompts as a model would read them in Korean and English, and cost and time (one check plus at most two fixes per draft). Each finding goes to an opus skeptic; confirmed ones are fixed with the task procedure, then Gate S3 again.

## Measurement M3 (orchestrator)

Worktree `../DaeumHwa-s3` detached at the reviewed commit, set up as in M0. Flags on every run: the stage 2 set as adopted in M2.

- [ ] **Effort, check:** replay `draft-check` at `low` and `medium` on the M2 drafts (`eval/replay-calls.ts` gains `draft-check` only if this is needed; else run `checkAndFixDraft` through a small script under the scratchpad with `withEffort`); keep `low` unless `medium` flags clearly more scenes the M2 reviews also named.
- [ ] **Runs (6):** D ko 1 chapter ×2 (comparison), D ko 1 chapter `--few-instructions`, D ko 3 chapters, O ko 1 chapter, D en 1 chapter.
- [ ] **Decide:** the adoption rule against M2, with must-fix per 1,000 characters and regenerations as the main metrics. If Q falls or must-fix does not fall, run one D ko chapter with `--scene-fix off` in the same worktree before reverting, to separate the check from run noise.
- [ ] **Results doc (sonnet, Korean):** `docs/eval/harness/2026-10-2x-stage3-check.md` — per run the stage 0 columns plus flagged and fixed scenes; must-fix against M2; the decision with numbers.
- [ ] Copy the worktree's `docs/eval/novel/2026-10-2x-s3*/` into the main checkout and commit by name. Remove `../DaeumHwa-s3` after the copy.

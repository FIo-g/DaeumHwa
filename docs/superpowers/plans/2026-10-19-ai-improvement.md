# AI Improvement Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user chose dynamic workflows (as large and parallel as possible) as the execution method, with the model placement in the spec.

**Goal:** Implement the 21 follow-up tracks (A–J, HX1–HX5, C, D, F1–F4) from the lightweight-model novel eval, cloud tracks first, local tracks second.

**Architecture:** Two branches (`feat/ai-improvement-cloud` from `main`, `feat/ai-improvement-local` from the reviewed cloud tip). Work runs in waves; inside a wave every track has its own worktree and a disjoint write set (made so by the wave-0 seam commit). Each track is a haiku TDD run from its brief, a haiku review, then a sonnet merge; opus reviews the whole branch.

**Tech Stack:** Next.js 16, TypeScript, Drizzle (no schema change planned), Vitest, FakeAiClient fixtures. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-19-ai-improvement-design.md`. Track briefs: `docs/superpowers/handoff/2026-10-19-ai-improvement/briefs/<ID>.md` (each has Goal, Files, Design steps, Interface, Tests, Acceptance, Definition of done). Briefs win for track-internal detail; the spec's section 6 (detector ownership), 7 (draft path) and 8 (shared rules) win wherever a brief disagrees.

## Global Constraints

- User-facing copy is Korean; identifiers and comments are English.
- Services throw `AppError(code, koreanMessage)`; actions return `ActionResult`, never throw.
- Every wiki change records `change_log` in the same transaction; AI never writes wiki tables directly; wiki rows are archived, never deleted.
- No package add/remove/upgrade. No DB migration (B uses the existing 말투 field).
- Implementers run only `pnpm vitest run <own paths> --maxWorkers=2` and `pnpm exec tsc --noEmit` (no typegen) filtered to own files. Never `git add -A`, `pnpm format` over whole files, or installs. Tests never call a real AI API.
- A track edits only the files in its brief's `writes`/`creates`, as amended in Task 0.2. Check with `git diff --name-only <wave-base>`.
- Provisional defaults (spec 8): EN min ratio 0.8, max 1.3; paragraph = one non-empty line (`---`, `***`, `* * *` excluded); E1 limit 3 sentences; G1 near-duplicate Dice 0.8; H continuity budget 16,000 chars; repeated word 8; G2 pinned tests 736/848 unchanged.
- B's speech feature is off by default and off in the eval; `eval/novel/bible.json` is not edited (spec 8).
- A's continuation failure keeps the first text and records a warning; only a user abort rejects (spec 7).
- Nothing merges to `main`; end state is two PRs (cloud, then local).

## Review Focus

1. B off-by-default: with speech disabled, interview, extraction and draft prompts are byte-identical to before B (test in Task B).
2. A continuation returns empty/whitespace or throws after partial text: `done` resolves with the first text, a warning is recorded, no `replaceRunOutput` (test in Task A).
3. `knownFacts` required by G1: every literal, fake and e2e stub compiles and the full `pnpm test` passes at the wave-3 tip (Gate 3).
4. Old saved eval runs (without the new `ChapterMetrics`/summary fields) still parse (tests in E1, E2, HX5).
5. Korean text with no paragraph breaks, a single 5,000-char paragraph, or text containing only foreign-script words does not hang or throw in guards, E1 trim and C repair (guards tests; E1 and C tests).

---

## Wave 0 — contracts and seam (integrator, sonnet)

### Task 0.1: Branch and briefs commit

**Files:** Modify: git state only. Add by name: `docs/superpowers/specs/2026-10-19-ai-improvement-design.md`, `docs/superpowers/plans/2026-10-19-ai-improvement.md`, `docs/superpowers/handoff/2026-10-19-ai-improvement/{README.md,CONTINUE.md,briefs/*}`.

**Interfaces:** Produces: branch `feat/ai-improvement-cloud` containing the briefs (worktrees do not see untracked files).

- [ ] **Step 1:** Create `feat/ai-improvement-cloud` from `main` (the user commits with their git identity; the sandbox has none).
- [ ] **Step 2:** Commit the files above by name. Expected: `git status --short` shows no tracked changes left in `docs/superpowers`.

### Task 0.2: Amend briefs to match the spec

**Files:** Modify: `briefs/{GUARDS,A,B,C,D,E1,E2,F2,G1,I,J}.md`.

**Interfaces:** Produces: briefs consistent with spec sections 6–8.

- [ ] **Step 1:** GUARDS: reduce to the five public functions and listed files; drop sentence/paragraph, length, quotes, batch near-duplicate; remove J from `findQuoteOccurrences` consumers.
- [ ] **Step 2:** A: replace the continuation-failure table with the keep-first-text-and-warn policy; state that A is the first writer of `DRAFT_SYSTEM` and `responders.ts`.
- [ ] **Step 3:** B, C, D, E1: delete the "DRAFT_SYSTEM / responders.ts unchanged" claims. B: add the off-by-default rule and remove the `bible.json` edit and the Q5 metric from its acceptance list.
- [ ] **Step 4:** C: extend E2's `draft-repair.ts` (`repairDraftForeignScript`, `DraftAttempt.foreign`), import `foreignScriptSpans`/`foreignScriptRuns` from `@/ai/guards`, create no second `draft-repair` file. E2: build `src/lib/korean/style-copy.ts` on `sampleCopies`/`repeatedWords`, own `draft-repair.ts`.
- [ ] **Step 5:** G1: import `isNearDuplicateFact` from `@/ai/guards`, own `evidence-quote.ts`, build `isUndecidedOnlyAnswer` on I's `isUndecidedAnswer` list. I: owns `isUndecidedAnswer` and moves `normalizeQuestion` to `src/lib/interview-plan.ts` (re-export from `src/server/interview.ts`). I and J: write `metrics-interview.ts` / `metrics-proofread.ts`, not `metrics.ts`. F2: HX2 note says `scaffold.ts` only. G1+G2: use the merged `extractionToProposals` shape from spec 6.
- [ ] **Step 6:** Verify: `grep -rn "unchanged" briefs/{B,C,D,E1}.md` has no DRAFT_SYSTEM/responders claims; commit "docs(briefs): align briefs with spec ownership".

### Task 0.3: Write the HX5 brief

**Files:** Create: `briefs/HX5.md` (same sections as the other briefs, at most 250 lines).

**Interfaces:** Consumes: G2 `stats {fragmentNamesFixed, relationsDropped}`, G1 `dropped {duplicateFacts, unverifiedEvidence}`, J `ProofreadStats`, H recall/context-hit output, `CallRecord` timing. Produces: optional fields on the run summary built by `buildRunSummary` (`eval/novel/steps/finish.ts`): `extraction`, `proofread`, `continuity`, `timeouts.byTask`.

- [ ] **Step 1:** Brief states: files to write (`eval/novel/steps/finish.ts`, `eval/novel/metrics.ts` re-exports only, tests `finish.HX5.test.ts`), all new fields optional, no speech metrics, tests with a fixture summary that lacks the new fields (must still parse).
- [ ] **Step 2:** Commit "docs(briefs): add HX5".

### Task 0.4: Seam commit

**Files:** Create: `eval/novel/localize/en/shared.ts`, `eval/novel/localize/en/<task>.ts` for every existing task plus `paragraph-trim`, `draft-repair`; `eval/novel/localize/samples/<task>.ts`; `src/test/ai-fakes/paragraph-trim.ts`, `src/test/ai-fakes/draft-repair.ts`; `eval/novel/metrics-interview.ts`, `eval/novel/metrics-proofread.ts`. Modify: `eval/novel/localize/en-systems.ts` (assembler only), `eval/novel/localize/localize.test.ts`, `src/db/types.ts` (`AI_TASKS`), `src/test/ai-fakes/index.ts`, `src/test/ai-fakes/draft-chapter.ts` (placeholder `fakeDraftContinue`), `eval/novel/metrics.ts` (`export *` from the two new modules).

**Interfaces:** Produces: task names `'draft-continue'`, `'paragraph-trim'`, `'draft-repair'` registered everywhere; `EN_SYSTEMS` built from `en/<task>.ts`; `PROMPTS` samples per task in `samples/<task>.ts`; placeholder fakes returning schema-valid empty output.

- [ ] **Step 1:** Run baseline first: `pnpm exec tsc --noEmit` and `pnpm vitest run eval src --maxWorkers=2`; save the output to `docs/superpowers/handoff/2026-10-19-ai-improvement/baseline-cloud.txt`.
- [ ] **Step 2:** Split `en-systems.ts`; `EN_SYSTEMS` content must be byte-identical (add a test in `localize.seam.test.ts` that compares every prompt string to the pre-split snapshot).
- [ ] **Step 3:** Register the three task names and placeholders; move `PROMPTS` samples.
- [ ] **Step 4:** Verify: `pnpm exec tsc --noEmit`, `pnpm eslint eval/novel src/test src/db`, `pnpm vitest run eval/novel/localize eval/novel/metrics.test.ts src/ai --maxWorkers=2` all pass and match the baseline except new tests. Commit "refactor(eval): split English systems and pre-register cloud task names".
- [ ] **Step 5:** Tag `cloud-w0`. If the user rejects the split (spec decision 5 reversed), skip Steps 2–3 and pre-seed only the map lines.

---

## Track procedure (applies to every track task below)

For track `<ID>` in wave `Wn`:

- [ ] **Step 1:** Create worktree `track/<branch>/<ID>` from the current merged tip (`cloud-w<n-1>` tag, or `cloud-w0` for wave 1). Link `node_modules`; set a worktree-specific PGlite data dir.
- [ ] **Step 2 (haiku implementer):** Implement the brief with TDD: failing test, run to see it fail, implement, run to see it pass, repeat per brief "Design" step. Commit per step inside the worktree, files by name.
- [ ] **Step 3:** Run the brief's "Definition of done" commands. Expected: all green, `git diff --name-only <base>` ⊆ brief's file list.
- [ ] **Step 4 (haiku reviewer):** Check the diff against the brief, spec 6–8 and Global Constraints; one fix cycle, then escalate to sonnet.
- [ ] **Step 5 (sonnet integrator):** `git merge --no-ff track/<branch>/<ID>`; run `pnpm exec tsc --noEmit`, `pnpm eslint <changed files>`, `pnpm vitest run <affected paths> --maxWorkers=2`. A failing track is reverted, not left blocking siblings. Stale pinned-text tests caused by an earlier merge are updated by the integrator.

---

## Wave 1 (parallel): GUARDS, A, H, HX3, HX1

### Task GUARDS — `briefs/GUARDS.md`
**Files:** Create `src/ai/guards/{index,types,scripts,repeats,similarity,sample-copy,fact-similarity}.ts` + `*.test.ts`, `eval/novel/metrics.foreign.test.ts`. Modify `eval/novel/metrics.ts` (`foreignRuns` only).
**Interfaces — Produces:** `foreignScriptSpans(text: string, lang: Lang, opts?): ForeignSpan[]`, `foreignScriptRuns(text: string, lang: Lang): string[]`, `repeatedWords(text: string, opts?): RepeatedWord[]`, `sampleCopies(text: string, examples: string[], opts: { lang: Lang }): SampleCopyHit[]`, `isNearDuplicateFact(a: string, b: string): boolean`; types `Lang`, `ForeignScript`, `ForeignSpan`, `RepeatedWord`, `SampleCopyHit`. Barrel exports only these. Done check also: `! grep -rnE "from '(eval/|@/test|@/server|@/db)" src/ai/guards` prints nothing.
- [ ] Follow the Track procedure. First golden test `metrics.foreign.test.ts` must pass against the old `metrics.ts` before the edit.

### Task A — `briefs/A.md`
**Files:** per brief (draft path: `draft-chapter.ts`, `ai-features.ts` `startDraft`, `run.ts`, `src/lib/draft-length.ts`, `src/lib/text-pipe.ts`, `responders.ts`, `scaffold.ts`, `en/draft-chapter.ts`, tests).
**Interfaces — Produces:** `draftLengthPlan`, `continuationPlan`, `continuationSeparator` (`src/lib/draft-length.ts`); `createTextPipe` (`src/lib/text-pipe.ts`); `replaceRunOutput(db, runId, output)` (`src/ai/run.ts`); `buildContinuationPrompt`, `CONTINUE_EFFORT`, `CONTINUE_MAX_TOKENS`; task `'draft-continue'`. `startDraft` signature and return type unchanged.
- [ ] Track procedure plus tests: empty/whitespace continuation and throw-after-partial resolve with the first text and a recorded warning; abort rejects (Review Focus 2).

### Task H — `briefs/H.md`
**Interfaces — Produces:** context pack includes every card whose name occurs in the manuscript; rule "언급 없음은 모순이 아니다"; numeric-fact comparison in code; 16,000-char budget; recall fixtures for `eval:continuity`.
- [ ] Track procedure.

### Task HX3 — `briefs/HX3.md`
**Interfaces — Produces:** author agent input includes current wiki and its own earlier decisions; `author.md` path-neutral (does not stop accepting short drafts — spec decision 4).
- [ ] Track procedure. Also append the `author.md` short-draft note to `docs/eval/novel/follow-up-ai-improvement.md` (record only).

### Task HX1 — `briefs/HX1.md`
**Interfaces — Produces:** model-name masking for every file a reviewer reads; `blind` and `publish-review` subcommands in `cli.ts`; section in `novel-eval.js`.
- [ ] Track procedure.

**Gate 1:** after the four merges: `pnpm exec tsc --noEmit`, `pnpm eslint .` on changed files, `pnpm vitest run src eval --maxWorkers=2`; tag `cloud-w1`.

## Wave 2 (parallel): G2, J, I, E2

### Task G2 — `briefs/G2.md`
**Interfaces — Produces:** `extractionToProposals` returns `{ proposals, pendingThreadEvents, stats: { fragmentNamesFixed: number, relationsDropped: number }, dropped: { duplicateFacts: number, unverifiedEvidence: number } }` with zeroed `dropped` (G1 fills it); partial names normalized to the canonical card name; missing-endpoint relations rejected; planned threads forced to `planted`.
- [ ] Track procedure. Pinned tests 736/848 stay unchanged.

### Task J — `briefs/J.md`
**Interfaces — Produces:** `locateAllQuotes`; proofread prompt limited to 표준어 규범 violations with an allowed empty list; same quote merged and applied to every location; `ProofreadStats` + `proofreadStats` in `eval/novel/metrics-proofread.ts`.
- [ ] Track procedure.

### Task I — `briefs/I.md`
**Interfaces — Produces:** `isUndecidedAnswer(answer: string): boolean` and `normalizeQuestion` in `src/lib/interview-plan.ts` (re-exported from `src/server/interview.ts`); one-thing-per-question rule; close topic on "미정", switch after two; `interviewMetrics`/`InterviewMetrics` in `eval/novel/metrics-interview.ts`.
- [ ] Track procedure.

### Task E2 — `briefs/E2.md`
**Interfaces — Produces:** `src/lib/korean/style-copy.ts` (thin wrappers on GUARDS); `src/ai/tasks/draft-repair.ts` (`draftRepairTask`, `DRAFT_REPAIR_SYSTEM`, `DraftRepairSchema`, `applyDraftEdits`); `repairDraft(db, actor, { workId, runId, lang? })` + `repairDraftAction`; `repairBestEffort` in `steps/chapter.ts`; `sampleCopyHits`, `repeatedWords` on `ChapterMetrics` (optional); the eval flag in `cli.ts`; wording "베껴 쓰지 않는다".
- [ ] Track procedure. Old saved runs without the new fields still parse (Review Focus 4).

**Gate 2:** same checks as Gate 1; tag `cloud-w2`.

## Wave 3 (parallel): G1, E1, HX2, HX4

### Task G1 — `briefs/G1.md`
**Interfaces — Produces:** `InterviewExtractInput.knownFacts` **required**; `evidence-quote.ts` (verbatim-quote check); `isUndecidedOnlyAnswer` on I's list; `dropped` filled; every literal, fake and e2e stub updated in this task.
- [ ] Track procedure. At the wave tip run the **full** `pnpm test --maxWorkers=2` (Review Focus 3).

### Task E1 — `briefs/E1.md`
**Interfaces — Produces:** `src/lib/korean/paragraphs.ts` (`splitParagraphs`, `countSentences`, `overlongParagraphs`); task `'paragraph-trim'`; `trimOverlongParagraphs` (max 2 rounds); optional service-only `body` on `createChapterFromDraft`; `overlongParagraphs` on `ChapterMetrics`; eval trim stage before E2's repair writing `draft.trimmed.txt`.
- [ ] Track procedure plus tests for a single 5,000-char paragraph and text without breaks (Review Focus 5).

### Task HX2 — `briefs/HX2.md`
**Interfaces — Produces:** `['(새 회차)', '(new chapter)']` after `['현재 회차', 'Current chapter']`, before the `(\d+)화` rule in `scaffold.ts`; `hangulLeft` 0 in the English runs.
- [ ] Track procedure.

### Task HX4 — `briefs/HX4.md`
**Interfaces — Produces:** summary text saved by the shell (not the agent); RESUME.md error-state case; copy retry; `resummarize --date` no longer stops on a live worker lock. The `/Users/taehyeong` path in `novel-eval.js` is left as is.
- [ ] Track procedure.

**Gate 3:** full `pnpm exec tsc --noEmit`, `pnpm eslint .`, `pnpm test --maxWorkers=2`; tag `cloud-w3`. Start the opus diff review of waves 1–3 (focus: `steps/chapter.ts` and `startDraft` stage order from spec 7).

## Wave 4 (parallel): B, HX5

### Task B — `briefs/B.md` (amended)
**Interfaces — Produces:** optional `voices`, `hasSpeech`, `speech`, `pendingSpeechEntryIds`; speech question in the interview prompt (one bullet, merged after I); style-card proposal using the existing 말투 field; default off; eval keeps it off.
- [ ] Track procedure plus a test that with the feature off the three prompts are byte-identical to the pre-B strings (Review Focus 1).

### Task HX5 — `briefs/HX5.md`
**Interfaces — Consumes:** G1 `dropped`, G2 `stats`, J `ProofreadStats`, H recall output. **Produces:** optional `extraction`, `proofread`, `continuity`, `timeouts.byTask` in the run summary.
- [ ] Track procedure plus a test that a saved summary lacking the new fields still parses (Review Focus 4).

**Cloud gate:** `pnpm exec tsc --noEmit`, `pnpm eslint .`, `pnpm test --maxWorkers=2`, `pnpm build`, `pnpm e2e` if a browser is available. Tag `cloud-w4`. Opus reviews the full cloud diff; fixes land on `feat/ai-improvement-cloud`. User creates the cloud PR.

---

## Local branch

### Task L0: Local seam

**Files:** same pattern as Task 0.4 for `'draft-beats'`, `'scene-rewrite'`, `'chapter-extract-facts'`, `'chapter-extract-threads'`, `'chapter-extract-relations'`.
- [ ] **Step 1:** Create `feat/ai-improvement-local` from the reviewed cloud tip. **Step 2:** register names and placeholders. **Step 3:** re-point the C, D, F1, F2, F3, F4 briefs at the actual cloud code (line numbers, J's final `chapter-check.ts`, E2's `draft-repair.ts`, A's `startDraft`). **Step 4:** tsc, eslint and localize tests pass; tag `local-l0`. If cloud changes later, merge cloud into local (never rebase).

### Wave L1 (parallel): F3, F4, F1; Wave L2 (parallel): D, F2; Wave L3: C
Each follows the Track procedure with tags `local-l1`, `local-l2`, `local-l3`; only `FakeAiClient` and `@/test/ai-fakes`.

- **F3 — `briefs/F3.md`:** `runAiTaskSplit` in `src/ai/run.ts` (does not change `runAiTask`), per-persona reader-sim calls.
- **F4 — `briefs/F4.md`:** serialization of continuity-check and chapter-extract on the same local server, optional `CallRecord` fields `queueMs`, `waitInclusiveMs`, `thinkRequested`, helper effort switch (provider-gated).
- **F1 — `briefs/F1.md`:** three-part proofread with offsets re-based; `runProofread` returns `ProofreadResult` keeping `runId` alongside `runIds`; re-check against J's merged code first.
- **D — `briefs/D.md`:** `draft-beats` and `scene-rewrite` tasks; two-step draft and scene rewrite wired in the eval only (not in the product route).
- **F2 — `briefs/F2.md`:** `shouldSplitChapterExtract(provider)` plus `AI_EXTRACT_SPLIT`; three split extract calls merged.
- **C — `briefs/C.md` (amended):** `repairDraftForeignScript`, `DraftAttempt.foreign` on E2's `draft-repair.ts`; runs once on the final joined text; qwen low-temperature profile as a hypothesis switch.

**Local gate:** `pnpm exec tsc --noEmit`, `pnpm eslint .`, `pnpm test --maxWorkers=2`, `pnpm build`. Opus reviews the local diff against cloud (no local-only behavior leaks into the product path; stage order from spec 7 holds after D and C). User creates the local PR.

---

## Not in this plan
Remaining local eval runs, Haiku/Luna re-evaluation, 2+ chapter evaluation, backlog section 4, calibration of the provisional thresholds, the `author.md` short-draft fix, the `/Users/taehyeong` path in `novel-eval.js`, and the unidentified tool guard that blocked the summary write.

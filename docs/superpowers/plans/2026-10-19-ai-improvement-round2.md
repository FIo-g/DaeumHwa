# AI Improvement Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user chose dynamic workflows: haiku implements (TDD), haiku reviews each task, sonnet integrates, opus reviews the whole branch.

**Goal:** Fix measurement first (M1–M7, P8), re-measure the cloud models on the current branch (R2a), add the app improvements P1–P15, then measure again (R2b) plus three option-only compare runs and a continuity recall run.

**Architecture:** One branch, `feat/ai-improvement-round2`, built in one working tree, one task at a time, because most tracks share `eval/novel/{eval-client,run,cli,steps/finish,blind}.ts` or the draft prompts. Each task follows its brief. The brief holds the files, design steps, interfaces, test names and Definition of done. Measurement runs happen in worktrees pinned at a commit (`../DaeumHwa-r2a`, `../DaeumHwa-r2b`), with `eval/results` linked to the main checkout.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite, Vitest, FakeAiClient/`@/test/ai-fakes`, Ollama client (eval only), novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-19-ai-improvement-round2-design.md`
- Briefs: `docs/superpowers/handoff/2026-10-19-ai-improvement-round2/briefs/<ID>.md`
- Cross-check (file ownership, order, builder answers): `docs/superpowers/handoff/2026-10-19-ai-improvement-round2/cross-check.md`
- Precedence: briefs win for track-internal detail; the spec's sections 3–4 win where a brief disagrees.

## Global Constraints

- User-facing copy is Korean; identifiers and comments are English. Eval CLI operator messages may stay English (F4 precedent).
- Services throw `AppError(code, koreanMessage)`; actions return `ActionResult`, never throw. Wiki changes record `change_log` in the same transaction; AI never writes wiki tables directly.
- No package add/remove/upgrade. No DB migration.
- Local-only behaviour is gated by `isLocalProvider` (product) or `MODEL_PROFILES[id].queue === 'local'` (eval). Options `--speech on`, `--two-step on` and `--product-limits` default off.
- Cloud default requests stay byte-identical to the base (2eaa797), except where a track intends a change: P4 and P5 (draft prompt lines), P7 (reader-sim timeout, quote check, prompt rule), M7 commit 3 and P15 (duplicate-fact rule).
- Tests never call a real AI API. New tests go in new track-tagged files (`<name>.<track>.r2.test.ts`) unless the brief names an existing test to change (pinned goldens in P4/P5/P14).
- Implementers run only their brief's commands: `pnpm vitest run <paths> --maxWorkers=2`, `pnpm exec tsc --noEmit` (report own files), `pnpm eslint <files>`, `pnpm exec prettier --write <own files>`.
  - Never `pnpm format`, `git add -A` or `git add .`. Commit files by name. Never push.
  - Before editing `docs/eval/novel/README.md`, run `prettier --check` on it; add bullets only.
- Do not run `pnpm build` or `pnpm e2e` while a measurement run is in a timed step; the gates run them.

## Review Focus

1. Old saved runs still load, `resummarize`, `blind` and summarize with every new optional field absent: `2026-10-18/run-0{1,2,4,5}-*` (M1, M2, M4, M5, P8, P10). Test: the owning task's `*.r2.test.ts` loads a fixture config/call/summary without the field.
2. Blind copies carry no model or locality fingerprint. The new fields are M1 `power`, M2 `ollama` attempts, M4 product-limits fields, M5 options, P9 retry budget. Test: each owning task asserts the key is absent from `blindCallRecord` / `blindRunSummary` output.
3. Cloud default requests (system + prompt for every task on a cloud profile, options off) equal the base strings except the intended P4/P5/P7 lines. Test: the golden tests in `src/ai/tasks/draft-chapter.test.ts` and `src/ai/speech-off.test.ts` are updated only by P4/P5 and still pin everything else; P7 pins reader-sim.
4. P6: "버리기" or a reload never changes the stored draft. "적용" refuses a stale candidate (`base !== output.text`) with a Korean `AppError`. "새 회차로 만들기" after "적용" uses the refined text. Test: in P6a's service/action tests.
5. Korean number words and mixed forms never throw in the P13/P15 parsers and never turn non-numbers into numbers.
   - Number forms: `열일곱`, `스무`, `서른두 살`, `1,000`, `3층`, `seventeen`.
   - Non-numbers: `일부`, `한때`, `하나같이`.
   - Test: P15's `numbers` test and P13 part 2's quantity test.

---

## Step 0: Bring the gpt-oss review onto the branch

- [ ] `git cherry-pick e597bc3`. It adds `docs/eval/novel/2026-10-18/gpt-oss-20b-ko.md` and one README table row. Do this before any task edits the README. Expected: clean pick.
- [ ] Commit the spec update, this plan, the briefs, `survey.md` and `cross-check.md` by name: `docs(round2): plan, briefs and survey`.

## Task procedure (every task below)

- [ ] **Implement (haiku):** read the brief (and only the named part), write the failing tests first, run them and see them fail for the stated reason, implement, run the brief's Definition of done, commit with the given message.
- [ ] **Review (haiku, read-only):**
  - diff against the brief and the Global Constraints
  - tests would fail without the change
  - only the brief's files are touched
  - Review Focus lines owned by the task have their tests
  - verdict `approve` or `changes-needed`
- [ ] **On `changes-needed`:** one haiku fix cycle with the review text, then a second review. If it still fails, a sonnet fix.
- [ ] The next task starts only after this one is approved (shared working tree).

## M batch (lands before R2a)

| Task | Brief / part | Commit message |
|---|---|---|
| 1 | M1 part a: `power.ts`, `eval-client.ts`, `run.ts`, `finish.ts`, `blind.ts` and tests | `feat(eval): record power source and energy mode per run and call` |
| 2 | M1 part b: CLI status warning, README | `feat(eval): warn when a local run is on low power` |
| 3 | M2 part a: `src/ai/ollama.ts` attempts, `ollama-detail.ts` | `feat(ai): report per-attempt Ollama timings` |
| 4 | M2 part b: `models.ts`, `run.ts`, `eval-client.ts` wiring | `feat(eval): store Ollama attempt detail on call records` |
| 5 | M2 part c: `finish.ts` blocks, `blind.ts`, README | `feat(eval): summarize where local call time went` |
| 6 | M3 part a: `review-verdict.ts`, `blind.ts`, `cli.ts` | `feat(eval): add the review verdict block and gate command` |
| 7 | M3 part b: criteria doc, `reviewer.md`, `summary.md`, README section 6, agents test | `docs(eval): fix the review counting scope` |
| 8 | M3 part c: workflow second review and its test | `feat(eval): second reviewer for runs near the line` |
| 9 | M4 | `feat(eval): record task limits and add --product-limits` |
| 10 | M5 part a: `--speech on` | `feat(eval): add --speech on with a voice answer bank copy` |
| 11 | M5 part b: `--two-step on` | `feat(eval): add --two-step on for cloud profiles` |
| 12 | M6 | `refactor(eval): take the repository root as an input` |
| 13 | M7 part a: guard parameter, exported constants, labels, sweeps | `feat(eval): threshold replay tool` |
| 14 | M7 part b: report, CLI, report doc | `docs(eval): threshold recalibration report` |
| 15 | P8 | `feat(eval): count repeated paragraph openers` |

- [ ] **Gate M (sonnet):** `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`. Only stale pinned tests are fixed here; defects go back to the owning task.
- [ ] **R2a.**
  - `git worktree add ../DaeumHwa-r2a <gate M commit>`, then `pnpm install --frozen-lockfile`. Link `eval/results` and `.env.local` to the main checkout.
  - Run the novel-eval workflow from that worktree with these args:
    - `repo` = the worktree path (M6), `date: '2026-10-19-r2a'`, `chapters: 1`
    - `runs`: haiku-5.5 ko/en, luna-6 ko/en
  - Also run the R2c "before" pass in this worktree:
    - copy in P13's `eval/fixtures/continuity-numeric` once task 25 lands
    - `AI_PROVIDER=opencode OPENCODE_MODEL=claude-haiku-5-5 node --env-file=.env.local --import tsx eval/run-continuity.ts --fixture continuity-numeric`

## P batch

| Task | Brief / part | Commit message |
|---|---|---|
| 16 | M7 part c: fact duplicate Dice 0.8 → 0.7 | `fix(guards): lower the fact duplicate threshold to 0.7` |
| 17 | P1 | `fix(draft-beats): ask for as many scenes as the length plan` |
| 18 | P2 | `feat(draft-beats): add decision and stake to each scene` |
| 19 | P3 | `feat(eval): pass beat locations to the continuity check` |
| 20 | P4 | `feat(draft): open on the goal and introduce new names once` |
| 21 | P5 | `feat(draft): mark planned threads as not yet to be written` |
| 22 | P7 | `fix(reader-sim): timeout, case-insensitive quotes, no invented chapters` |
| 23 | P9 part a: retry budget, cap widening, util, blind, README | `feat(eval): change the budget when a local call is retried` |
| 24 | P9 part b: lower-think retry client, wiring | `feat(eval): retry a local call with lower think` |
| 25 | P13 step 1: fixture, red fixture test, pending doc | `test(continuity): numeric planted errors fixture` |
| 26 | P13 step 2: `numeric-quantities.ts` | `feat(ai): parse years and counts for the numeric check` |
| 27 | P13 step 3: `numeric-facts.ts` | `feat(ai): compare years and counts in the numeric check` |
| 28 | P14 | `fix(proofread): drop awkward suggestions and respect word boundaries` |
| 29 | P10 part a: `evidence-anchor.ts` | `feat(ai): find whether an evidence quote names its subject` |
| 30 | P10 part b: mapper, `chapter-check.ts`, `finish.ts`, HX5 assertion, README | `feat(eval): count weakly anchored proposals` |
| 31 | P11 | `fix(interview): send style answers to the style card only` |
| 32 | P12 | `feat(interview): re-ask a question built on an unknown name` |
| 33 | P15 | `fix(guards): compare Korean number words as digits` |
| 34 | P6 part a: lib, service, route, action, tests | `feat(draft): refine a finished draft into a candidate` |
| 35 | P6 part b: `DraftRefine` component, panel wiring, tests | `feat(draft): let the author apply or discard a refinement` |

- [ ] **Gate P (sonnet):** `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`.
- [ ] **Full review (opus):** review the round 2 diff (`2eaa797..HEAD`) along these dimensions:
  - gating and cloud parity (Review Focus 3)
  - blind fingerprints (Review Focus 2)
  - old-run compatibility (Review Focus 1)
  - P6 data flow (Review Focus 4)
  - number parsing (Review Focus 5)
  - draft/beat prompt coherence (P1, P2, P4, P5)
  - interview and extraction changes (P10–P12)

  Each finding goes to an opus skeptic. Confirmed findings are fixed with the task procedure, then Gate P runs again.

## Measurement after the P batch

- [ ] `git worktree add ../DaeumHwa-r2b <final commit>`, set up as for R2a.
- [ ] Run these in separate workflow invocations; the cloud queue is sequential inside each.

  | Run | Date folder | Init flag | Models and languages |
  |---|---|---|---|
  | R2b | `2026-10-19-r2b` | none | haiku and luna, ko and en |
  | R2s | `2026-10-19-r2speech` | `--speech on` | haiku ko, luna ko |
  | R2t | `2026-10-19-r2twostep` | `--two-step on` | haiku ko, luna ko |
  | R2l | `2026-10-19-r2limits` | `--product-limits` | haiku ko, haiku en |

  - Runs with an init flag are created first with `pnpm eval:novel init ... --chapters 1 --dir eval/results/novel/<date>/run-NN-<lang>`, as in README section 3.
- [ ] R2c "after": the same continuity command in `../DaeumHwa-r2b`.
- [ ] Per date folder: summary (`summary: true`, `runs: []`).
- [ ] One results doc (sonnet), `docs/eval/novel/2026-10-19-round2-results.md`, written in Korean:
  - R2a vs round 1, R2b vs R2a, and each compare run vs R2b
  - the footnotes from spec section 4 (mixed effects, Q5 scope, `wouldTimeOut` labels)
- [ ] Copy each worktree's `docs/eval/novel/<date>/` into the main checkout and commit by name. Do not commit inside the worktrees.
- [ ] Local runs are not in this plan (the user limited local work to gpt-oss ko today). README lists the next local session's commands:
  - gpt-oss en, exaone ko/en
  - `--helper-think` compare
  - qwen t06

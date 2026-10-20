# Handoff: AI improvement round 2

Updated 2026-10-20 14:30 KST. Read this first when continuing.

## State

- Branch `feat/ai-improvement-round2` (from `feat/ai-improvement-local` 2eaa797). Not pushed.
- Spec: `docs/superpowers/specs/2026-10-19-ai-improvement-round2-design.md`.
- Plan: `docs/superpowers/plans/2026-10-19-ai-improvement-round2.md`.
- Briefs, survey and cross-check: this folder. `tools/weak_evidence.py` is the P10 reference counter (moved here from a session scratchpad).
- On 2026-10-20 the user asked for the plan up to the opus review and its fixes. R2b and everything after it wait for a new request.

### Done

- **M batch** (tasks 1–15) and Gate M at b05ee13.
- **df4575b:** dropped the unused `err` in `.claude/workflows/novel-eval.js` (the Gate M lint warning).
- **R2a**, from worktree `../DaeumHwa-r2a` (detached at b05ee13):
  - Four runs, one chapter each. Reviews and summary are in `docs/eval/novel/2026-10-19-r2a/` (e6bd635).

    | Run | Verdict | Q mean | Thresholds failed |
    |---|---|---|---|
    | haiku-5.5 ko | not publishable | 3.44 (second review 3.67) | T3 (4,978 chars, 22 short) |
    | haiku-5.5 en | publishable | 3.89 | none |
    | luna-6 ko | not publishable | 3.22 | none |
    | luna-6 en | not publishable | 3.33 | none |

  - R2c "before" (haiku-5.5, fixture copied into the worktree):
    - 7 of 9 hit, 0 false positives, 0 of 10 traps.
    - Recorded in `docs/eval/continuity/2026-10-19-pending-P13.md`.
    - Raw file: `eval/results/continuity-2026-10-20T03-18-02-534Z.json`.
  - P10 offline recount for R2a (`tools/weak_evidence.py` over `eval/results/novel/2026-10-19-r2a`): facts 31, weak 24; threads 19, weak 3. R2a has no live P10 counters because it predates P10.
- **P batch** (tasks 16–35):
  - Commits 34d14c3..8d552a6. P13 went in as one task with three commits, so no commit holds a failing test.
  - Every task was approved by its haiku reviewer on the first pass.
- **Opus full review** of 2eaa797..HEAD:
  - Eight dimensions, each finding checked by an opus skeptic.
  - 18 findings: 13 confirmed and fixed (5732a6a..eec936d), 5 refuted.
  - Fixed:
    - P6: a late or overlapping preview could overwrite the applied draft or swap the candidate (now a key-scoped conditional write plus a candidate token). A failed repair with no trim was shown as "nothing to fix".
    - P13: durations read as years; ranges; Korean and English bounds and approximations; reads inside longer numbers (`1,000`, `3000`); English compounds over 99; "had aged N years".
    - P15: misspaced compounds (`서른 두 명`) were half-converted and merged different facts.
    - P11: any topic containing "style" or 문체 was routed to the style card.
    - P12: non-ASCII or inner-capital names (Chloé, McAllister) were flagged; a run-cap CONFLICT on the names-only re-ask failed the whole ask.
    - M4: `overTaskCap` compared usage summed over in-client retries.
  - Refuted, because the brief chose it or the input cannot reach the code:
    - M4 cap fields stay in the blind copy
    - number words in ordinary words (네 명령)
    - the P2 rule inside `<beats>`
    - the P1 merge rule vs BEATS_RULE
    - a soft-failed re-ask leaving a pending failure in EvalClient
- **Final Gate P** at eec936d: typecheck, `eslint .` clean, `vitest run` 355 files / 3523 tests, `pnpm build` (new route `/api/works/[workId]/draft/refine`).

### Open points for the user

- **M7 threshold.** After Dice 0.8 → 0.7, rerunning `thresholds-cli` proposes 0.65. The report's defer rule holds it back. Decide later, ideally after R2b shows the author rejection count.
- **P6 apply flow.** The spec says apply follows the 맞춤법 panel flow. The brief (Design step 0) chose all-or-nothing apply with no 되돌리기. The code follows the brief.
- **P10 cross-check.** The TypeScript and `tools/weak_evidence.py` agree on every test row. They were not compared over whole saved runs. Do that before the results doc uses the R2b counters.
- **1-16 name truncation policy:** still undecided (from round 1).

## Worktrees

- `../DaeumHwa-r2a` (detached b05ee13), kept for reference. It has untracked copies of `eval/fixtures/continuity-numeric/` and `docs/eval/novel/2026-10-19-r2a/`; the committed copies are in the main checkout. Remove it with `git worktree remove --force ../DaeumHwa-r2a` once R2b is done.
- `../DaeumHwa-baseline` (`eval/round1-local-rest`, e597bc3): keeps uncommitted path edits in `eval/novel/agents/*.md` on purpose, for the remaining round 1 local runs.

## Other branches (not pushed)

- `feat/ai-improvement-local`: round 1 local tracks plus the local check and review fixes, 10 commits ahead of origin.
- `eval/round1-local-rest`: the gpt-oss ko review (e597bc3).

## Machine notes

- Keep the lid open and power connected; lid sleep stalls workflows and `caffeinate` does not stop it.
- On 2026-10-20 the battery energy mode was Low Power (`powermode 1`), while AC stays High Power (`powermode 2`). Local runs need AC.
- A full `vitest run` while a measurement runs can exit 1 on a worker start timeout although every test passes; rerun when idle.

## Next steps (plan order, after a new request)

1. R2b and the compare runs:
   - `git worktree add --detach ../DaeumHwa-r2b <tip>`, `pnpm install --frozen-lockfile`, then link `eval/results` and `.env.local` to the main checkout.
   - Workflow scripts cannot be loaded from a worktree path. Pass the main checkout's `.claude/workflows/novel-eval.js` as `scriptPath`, with `repo` set to the worktree.
   - Invoke once per model (the cloud queue is sequential inside an invocation; two invocations can run at once).
   - Runs: R2b, R2s, R2t, R2l. See the plan's measurement table; runs with an init flag are created first with `pnpm eval:novel init`.
2. R2c "after" in `../DaeumHwa-r2b`:
   `AI_PROVIDER=opencode OPENCODE_MODEL=claude-haiku-5-5 node --env-file=.env.local --import tsx eval/run-continuity.ts --fixture continuity-numeric`.
   Fill the 후 column of the P13 doc.
3. Per date folder: summary (`summary: true`, `runs: []`). Then the Korean results doc `docs/eval/novel/2026-10-19-round2-results.md` (sonnet).
4. Copy each worktree's `docs/eval/novel/<date>/` into the main checkout and commit by name.
5. Round 1 local rest (gpt-oss en, exaone ko/en), then `--helper-think` compare and qwen t06.

## Continuation prompt (Korean)

> 이전 세션에서 이어서 진행한다. 브랜치 `feat/ai-improvement-round2`에서 작업한다. 먼저 `docs/superpowers/handoff/2026-10-19-ai-improvement-round2/README.md`와 계획서 `docs/superpowers/plans/2026-10-19-ai-improvement-round2.md`의 "Measurement after the P batch"를 읽는다. P 묶음, Opus 리뷰와 수정, 최종 Gate P까지 끝났다. 다음은 브랜치 끝에서 `../DaeumHwa-r2b` worktree를 만들고 R2b, R2s, R2t, R2l과 R2c "후"를 돌린 뒤 결과 문서를 쓴다. 측정은 dynamic workflow로 돌리고 결과 문서는 sonnet이 쓴다. push는 내가 직접 한다.

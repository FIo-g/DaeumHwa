# Handoff: AI improvement round 2

Written 2026-10-20 06:30 KST. Read this first when continuing.

## State

- Branch `feat/ai-improvement-round2` (from `feat/ai-improvement-local` 2eaa797). Not pushed.
- Spec: `docs/superpowers/specs/2026-10-19-ai-improvement-round2-design.md`.
- Plan: `docs/superpowers/plans/2026-10-19-ai-improvement-round2.md`.
- Briefs, survey and cross-check: this folder.
- **Done:**
  - Step 0: cherry-pick of the gpt-oss ko review (93a97ff), and the docs commit (f6a7fd4).
  - M batch, plan tasks 1–15 (M1–M7 parts a/b, P8): every task approved by a haiku reviewer; tasks 7 and 10 needed one fix cycle.
  - Gate M passed at **b05ee13**: typecheck, `eslint .` (0 errors, 1 warning), and `vitest run`, 302 files / 2910 tests.
  - The warning is an unused `err` at `.claude/workflows/novel-eval.js:142`, added by task 8. Clean it up in the P batch.
- **Not started:**
  - R2a, cut from b05ee13
  - P batch, tasks 16–35
  - Gate P, the opus full review, R2b and the compare runs, R2c, the results doc

## Other branches from this session (not pushed)

- `feat/ai-improvement-local`: round 1 local tracks plus the local check and review fixes. 10 commits ahead of origin.
- `eval/round1-local-rest` in worktree `../DaeumHwa-baseline`: the gpt-oss ko review (e597bc3).
  - The worktree keeps uncommitted path edits in `eval/novel/agents/*.md` on purpose, for the remaining round 1 local runs (gpt-oss en, exaone ko/en).

## Machine notes

- Keep the lid open and power connected. Closing the lid slept the Mac from about 00:15 to 05:51, and the batch stalled; `caffeinate` does not stop lid sleep.
- The energy mode is now High Power on both sources (`pmset -g custom` shows `powermode 2`). On 2026-10-19 it was Low Power on AC, which halved local token speed.

## Next steps (plan order)

1. R2a:
   - `git worktree add ../DaeumHwa-r2a b05ee13`, then `pnpm install --frozen-lockfile`.
   - Link `eval/results` and `.env.local` to the main checkout.
   - Run `.claude/workflows/novel-eval.js` with:
     - `repo: '/Users/taehyeong/Documents/GitHub/DaeumHwa-r2a'`
     - `date: '2026-10-19-r2a'`, `chapters: 1`
     - `runs`: haiku-5.5 ko/en, luna-6 ko/en
2. P batch, tasks 16–35, with the same procedure as the M batch. The M-batch workflow script is a good template; change only the task list.
3. Gate P (with `pnpm build`), then the opus full review, fixes, R2b and the compare runs, R2c, the results doc.

## Continuation prompt (Korean)

> 이전 세션에서 이어서 진행한다. 브랜치 `feat/ai-improvement-round2`에서 작업한다. 먼저 `docs/superpowers/handoff/2026-10-19-ai-improvement-round2/README.md`와 계획서 `docs/superpowers/plans/2026-10-19-ai-improvement-round2.md`를 읽는다. M 묶음과 Gate M은 끝났다(b05ee13). 다음은 R2a 측정을 b05ee13 worktree에서 시작하고, 동시에 P 묶음(작업 16~35)을 계획서 순서대로 진행한다. 구현은 haiku(TDD), 작업별 검토는 haiku, 통합은 sonnet, 전체 리뷰는 opus. dynamic workflow를 쓴다. push는 내가 직접 한다.

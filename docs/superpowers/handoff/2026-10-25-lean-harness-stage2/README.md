# Handoff: lean harness stage 2, measurement M2

Updated 2026-10-25 KST. Read this first when continuing. The prompt to start an agent with is `PROMPT.md` in this folder.

## Background

- Design: `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md`. The user approved it and asked for every stage to be implemented end to end ("승인할테니까 구현까지 다 해줘").
- Stage plans: `docs/superpowers/plans/2026-10-20-lean-harness-stage{0,1,2,3,4}.md`, plus `2026-10-21-lean-harness-stage1b.md`.
- Results so far:
  - `docs/eval/harness/2026-10-20-stage0-baseline.md`
  - `docs/eval/harness/2026-10-21-stage1.md`
- Each stage goes through the same steps:
  1. A plan.
  2. TDD implementation.
  3. Per-task review.
  4. A stage review.
  5. A measurement.
  6. A revert of whatever fails the adoption rule.
- Default model: `haiku-5.5`. The other cloud model is `luna-6`. Both go through the OpenCode Go gateway.

## State

- **Branch:** `feat/lean-harness` in the main checkout. Not pushed; the user pushes.
- **Stage 2 code:**
  - Implemented and reviewed, with the review's 19 confirmed findings fixed (commits 3ba5090..99df874).
  - The full gate passed at 66357c5: 485 test files, 4,228 tests, typecheck, lint and build.
  - The plan is `docs/superpowers/plans/2026-10-20-lean-harness-stage2.md`. Its "Stage review fixes" section lists every fix.
- **Measurement worktree:** `../DaeumHwa-s2`, detached at 66357c5. Every M2 run runs from there.
  - Its `.env.local` is a real copy of the main one with `AI_PROMPT_CACHE_KEY=on`, because the cache-key probe was accepted.
  - `eval/results` there is a symlink to the main checkout's `eval/results`, so run folders live in the main checkout.
  - Run CLI commands from `../DaeumHwa-s2`; the CLI loads `.env.local` from the current directory.
- **What is running:** nothing. The Claude Code measurement workflows were stopped on 2026-10-25 for this handoff. Every run keeps its state in `state.json` and continues with the CLI (see "How to run the eval without Claude Code").

## M2 so far (Haiku ko unless named; 1 chapter, target 5,000 chars)

Flags on every run: `--deploy-settings --directives ledger --speech on`. The plan card is the default flow.

| Run (folder under `eval/results/novel/`) | Q (reviewer 1 / 2) | Failed T | Must-fix | Chars | Chapter cost | First char | Write | Calls | Cache read share |
|---|---|---|---|---|---|---|---|---|---|
| s2m ch1 (`2026-10-24-s2m/run-04-ko`) | 3.56 / 3.44 | none | 2 / 3 | 5,397 | $0.038 | 65 s | 191 s | 16 | 0.128 |
| s2m ch2 | 3.33 / 3.33 | none | 5 / 5 | 5,354 | $0.044 | 74 s | 239 s | 18 | 0.047 |
| s2m ch3 | 3.11 / 3.56 | T2 (both) | 6 / 5 | 5,974 | $0.048 | 60 s | 205 s | 18 | 0.032 |
| s2 (`2026-10-24-s2/run-04-ko`) | 3.22 / 3.56 | T2 | 26 / 23 | 5,569 | $0.046 | 92 s | 207 s | 13 | 0.056 |
| s2r (`2026-10-24-s2r/run-04-ko`) | 3.00 | T1, T2 | 25 | 5,537 | $0.042 | 51 s | 196 s | 19 | 0.057 |
| s2 en (`2026-10-24-s2/run-04-en`) | 3.89, publishable | none | 7 | 12,782 (target 12,100) | $0.027 | 79 s | 138 s | 13 | 0.012 |
| s2f few-instruction (`2026-10-24-s2f/run-04-ko`), **broken** | 3.78 / 3.78 | T3 | 2 / 5 | 4,045 | $0.031 | 90 s | 1,275 s | 15 | 0.104 |
| s2 Luna (`2026-10-24-s2/run-05-ko`), **broken** | no text | T1, T3 | — | 0 | — | — | — | 3 | — |
| s2fb few-instruction rerun (`2026-10-24-s2fb/run-04-ko`) | **not reviewed yet** | ? | ? | 5,242 | $0.031 | 96 s | 165 s | 15 | 0.132 |

The M1 comparison runs (from `docs/eval/harness/2026-10-21-stage1.md`):

| Run | Q | Failed T | Must-fix | Chars | Cost | First char | Cache read share |
|---|---|---|---|---|---|---|---|
| s1c | 3.22 | none | 9 | 5,547 | $0.039 | 71 s | 0.123 |
| s1cq | 3.22 / 3.22 | T1 | 8 / 10 | 5,320 | $0.038 | 48 s | 0.060 |
| s1cfew (few-instruction) | 3.11 / 3.11 | T1 / T1, T2 | 4 / 6 | 5,431 | $0.039 | 76 s | 0.072 |

### Findings

- **Request retention improved.** s2m kept 4 of 4 requests in chapters 1, 2 and 3. The M0 3-chapter baseline s0m kept 3, 1 and 2. This is the main goal of the ledger.
  - Every 1-chapter run kept 4 of 4, except English, which kept 3 of 4. Its banned phrase "for a moment" came in with the expansion step.
  - The task 5 code check only shows findings in the panel; it does not repair them.
- **Speech (new T2).** In s2 and s2r, 한세린 is 반말 in both the wiki and the `<voices>` block, yet she spoke 해요체 to adults in 16–17 lines. That one cause makes up most of their 23–26 must-fix places.
  - In s2m and s2f she kept 반말. Their voice lines said explicitly "도윤서와 백지원 모두에게 반말" and "처음 만나는 어른에게도 존댓말 없이 반말".
  - The s2 and s2r voice lines only said "반말을 쓰며 짧고 직설적이다". This is a hypothesis from 4 runs, not proven.
  - `--speech on` also makes the interview ask for and store voices. Without it, 세린 has no speech field and this T2 cannot occur.
- **s2r T1** is "처음으로 9층 꼭대기까지 올라간다": 세린 is stopped on floor 8. s1cq in M1 missed the same event, so it is not new to stage 2. Stage 3 targets it with the instructed-event check.
- **Cache read share did not rise** (s2m ch1 0.128 against s1c 0.123; chapters 2–3 0.03–0.05). The plan says `isPromptCacheKeyEnabled` defaults to on only if it rose, so it stays off.
- **The gateway broke three runs. None of these is a stage 2 defect.**
  - In s2f, expand calls ended with "terminated" after 149 s and 421 s, and a paragraph-trim call took 562 s.
  - Luna's plan call took 271 s, and its two draft calls ran 1,063 s and 1,431 s before they were cancelled (`취소했습니다.`).
  - The first ablation try, `2026-10-24-s2mns`, wrote no chapter: every draft call hung with no first token for 16–27 min, between 17:14 and 19:17 UTC. Ignore that folder.
  - A curl health check on 2026-10-25 03:55 UTC answered normally: first byte 1.1 s, a 1,500-token reply in 11 s.
- **Rule check against M1 for the full-instruction Haiku ko chapter-1 runs (s2m ch1, s2, s2r):**

  | Rule | Result |
  |---|---|
  | Q does not drop by more than 0.1 | Passes: the run means average 3.30 against 3.22. |
  | No new failed threshold | Fails: T2 is new. |
  | Cost within 2× | Passes: at most $0.046 against $0.030, 1.5×. |
  | First char does not grow | Passes: mean 69 s against 76 s. |

  Because T2 is new, the stage fails the rule, and the plan's ablation applies.

## To do, in order

1. **Finish the M2 follow-up runs** from `../DaeumHwa-s2`, at most two at once. Commands are in the next section.
   - **s2fb** (`eval/results/novel/2026-10-24-s2fb/run-04-ko`): the run is done but has no review.
     - Run `blind`, then the reviewer, then `publish-review --to docs/eval/novel/2026-10-24-s2fb/haiku-5.5-ko.md`.
     - Then run `review-gate`. If it says `needed`, do the second review into `docs/eval/novel/2026-10-24-s2fb/second/haiku-5.5-ko.md`.
   - **Ablation s2mns** (`eval/results/novel/2026-10-25-s2mns/run-04-ko`): 3 chapters, flags `--deploy-settings --directives ledger` (speech off). It is waiting on `interview_answer`.
     - Answer the pending item, then `advance` until `done`.
     - Then review it the same way into `docs/eval/novel/2026-10-25-s2mns/`.
   - **Luna rerun s2l:** not started.
     - Init with `--model luna-6 --lang ko --chapters 1 --dir eval/results/novel/2026-10-25-s2l/run-05-ko --deploy-settings --directives ledger --speech on`.
     - Then advance and review it into `docs/eval/novel/2026-10-25-s2l/luna-6-ko.md`.
   - **If calls hang again** (no first token for more than 5 min in `calls/*.json`, or `취소했습니다.` errors), the gateway is down.
     - Health-check it with a small streaming curl or `node --env-file=.env.local --import tsx eval/probe-gateway.ts --model haiku-5.5`.
     - Wait before you continue.
     - A run broken by the gateway is redone under a new date folder. It is never mixed into comparisons.
2. **Decide**, following the plan's "Measurement M2" section:
   - **If the ablation s2mns passes the rule against M1:** keep the ledger in prompts and the cache order.
     - Speech stays off by default: `isSpeechStyleEnabled` in `src/ai/voice.ts` is not changed.
     - The cache key stays off by default.
   - **If s2mns also fails:** revert per feature (ledger in prompts, cache order) by which one the ablation implicates. Ask the user before you revert anything large.
   - **Compare retention:** s2mns chapters 2–3 against s0m (3 → 1 → 2) and s2m (4 → 4 → 4).
3. **Results doc (Korean):** `docs/eval/harness/2026-10-24-stage2-ledger.md`, in the style of `docs/eval/harness/2026-10-21-stage1.md`.
   - Per run: the stage 0 columns plus cache read share.
   - Retention per chapter against M0.
   - The rule table and the decisions, with numbers.
   - Also note:
     - The cache-key probe was accepted (`eval/results/probe-gateway-luna-6-2026-10-23T22-41-09-525Z.json`), but the share did not rise.
     - The gateway breakages above.
     - The speech hypothesis, with the voice lines quoted from `calls/*-draft-chapter.json` `promptPrefix`.
     - The English "for a moment" ban broken by expansion.
     - The local qwen3.8 ko review (`docs/eval/novel/2026-10-22-qwen/qwen3.8-27b-ko.md`): Q 2.89; expansion never ran because the 290 s draft budget (`DRAFT_TOTAL_BUDGET_MS` in `src/server/ai-features.ts`) was used up. This is a local-only limit.
     - The English reviewer could not find `<author_requests>` in `calls/025` `prompt`. Since stage 2 those blocks sit in the `promptPrefix` field of the call record.
4. **Copy and clean up:**
   - Copy the worktree's new docs folders (`../DaeumHwa-s2/docs/eval/novel/2026-10-2[45]-s2*/`) into the main checkout. The four `2026-10-24-s2{,f,m,r}` folders are already copied and committed. Commit by file name.
   - Then `git worktree remove --force ../DaeumHwa-s2`. It holds `.env.local` and node_modules; `eval/results` is a symlink into the main checkout, so results are safe.
5. **Stage 3,** after the user agrees. Plan: `docs/superpowers/plans/2026-10-20-lean-harness-stage3.md` (check and local repair). Add these targets, which M1 and M2 found:
   - Repetition after heavy expansion.
   - The instructed-event check: s1cq and s2r missed "처음으로 9층 꼭대기".
   - A re-check of sentences that repair rewrote: s2f, where `펜대를 내려놓는 소리가 짧게 끊겼다.` came from repair.
   - A speech-level check from voices plus repair of the offending lines: 반말 or 존댓말 named in a character's 말투, checked with `speechLevelOf` in `src/lib/directive-check.ts`. Then re-measure with `--speech on`.
   - Repair of request findings (the English ban that expansion broke).
6. **Later:**
   - Stage 4 (plan file exists).
   - Remove the old worktrees `../DaeumHwa-s0`, `-s1`, `-s1b` and `-s1c`; keep `../DaeumHwa-baseline`. The untracked docs in `-s1c` are already committed in the main checkout.

## How to run the eval without Claude Code

The Claude Code workflow `.claude/workflows/novel-eval.js` does the steps below with agents. Without it, do them by hand from `../DaeumHwa-s2`. Every command prints one JSON line.

- **Run folder:** `eval/results/novel/<date>/run-NN-<lang>`. NN is `04` for haiku-5.5 and `05` for luna-6. Never put the model name in a path.
- **Init (new runs only):**
  `pnpm eval:novel init --model <model> --lang <lang> --chapters <n> --dir <run> <flags>`
- **Advance:** `pnpm eval:novel advance --dir <run>`. It starts a detached worker and returns within about 9 min.
  - Repeat while `status` is `running`.
  - On `pending`, answer the item: follow `eval/novel/agents/author.md` with root = the worktree, dir = the run folder and lang. It reads `pending.json` and writes `answer.json`. Then advance again.
  - The interview asks up to 12 questions.
  - The same pending item coming back 30 times in a row means the run is stuck.
- **Status:** `pnpm eval:novel status --dir <run>`.
- **Review, when status is `done`:**
  1. `pnpm eval:novel blind --dir <run>` builds `eval/results/novel/<date>/blind/run-NN-<lang>`.
  2. A reviewer who has not seen the model name follows `eval/novel/agents/reviewer.md` with dir = the blind folder and lang. It writes `review.md` there. In OpenCode, use a fresh subagent that receives only that brief and the blind path.
  3. `pnpm eval:novel publish-review --dir <run> --to docs/eval/novel/<date>/<model>-<lang>.md` adds the model header and writes the docs copy.
  4. `pnpm eval:novel review-gate --dir <run>` prints `needed`, `not-needed` or `already-done`.
  5. If `needed`: `blind --dir <run> --second` (folder `blind-2/`), a second fresh reviewer, then `publish-review --dir <run> --to docs/eval/novel/<date>/second/<model>-<lang>.md --second`.
- **Numbers:**
  - `run-summary.json` → `harness.chapters[]` has `usd`, `firstCharMs`, `writeMs`, `calls`, `planMs`, `expandCalls`, `cacheReadShare` and `ledgerChars`.
  - `directives.chapters[]` has the kept and broken requests.
  - `metrics/NN.json` has `chars`.
  - The reviews give Q, failed T and must-fix.

## Rules (from the user)

- Never `git add -A` or `git add .`. Add files by name. Untracked files such as `.bashrc` and `.claude/*` are unrelated. The tracked `.claude/workflows/novel-eval.js` is part of the repo.
- User-facing copy is Korean. Identifiers and comments are English.
- Never add, remove or upgrade packages.
- Never push. The user pushes; say when a push is needed.
- Noise: at most 2 measurements at once. Tests only on touched paths, with `--maxWorkers=2`. No implementation tests while measurements run, where possible.
- Local models: only qwen3.8 27B, and only when the user asks. gpt-oss and exaone are off.
- Never call a real AI API in tests (`FakeAiClient`).
- `docs/superpowers/handoff/2026-10-19-ai-improvement/CONTINUE.md` is an old instruction from the research phase. Do not follow it.
- Reply to the user in Korean.

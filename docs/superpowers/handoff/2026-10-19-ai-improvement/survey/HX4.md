# Track HX4: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:HX4:code

TRACK HX4 code map (read-only survey, nothing edited).

ENTRY AND DATA FLOW
1. Entry: the novel-eval workflow, .claude/workflows/novel-eval.js. Args parsed at lines 52-61. REPO is hard-coded to /Users/taehyeong/Documents/GitHub/DaeumHwa (line 14). This machine's repo is /home/xogud/documents/github/DaeumHwa, so every prompt built from REPO points at a path that does not exist here (also agents/summary.md:12, resume-note.md:16, reviewer.md:14).
2. Run phase: executeRun (250-329) loops. runnerPrompt (115-140) makes a Haiku runner call `pnpm eval:novel advance --dir`. That reaches cli.ts main (548) -> dispatch (501) -> advanceRun (205), which spawns a detached `tsx cli.ts worker` (spawnDetachedWorker 149). The worker calls runWorker (129, takes lock at 130) -> openRun (run.ts:107) -> runUntilBlocked (run.ts:149). Each step calls the AI through EvalClient (eval-client.ts) and writes calls/*.json. A failure goes to pause() (run.ts:204), which sets paused-limit, paused-error or blocked in state.json. A pending item goes to the author agent (author.md).
3. finish step (steps/finish.ts:123-158) writes wiki-final.json and run-summary.json, using buildRunSummary (101-121) and speedSummary (32-78).
4. Review phase: reviewRun (workflow 209-247). A Haiku check (reviewExistsPrompt 143-151), then the Sonnet reviewer writes <dir>/review.md, then a Haiku copy runner (copyPrompt 169-178) copies it to docs/eval/novel/<date>/<model>-<lang>.md.
5. Summary phase: workflow 369-378 calls summaryPrompt (188-202) with a Sonnet agent. That agent is told to write docs/eval/novel/<date>/summary.md (prompt line 200; agents/summary.md:19 and rule at :39). The write is blocked by a tool guard. The guard config is in .claude/settings.json and .claude/hooks, which I could not read (permission denied), so I could not confirm the exact rule.
6. Resummarize: CLI only. dispatch 532-539 -> resummarizeDate (451-459) or resummarizeRun (423-448).

HOOK POINT 1: SUMMARY SAVE (smallest diff)
- Change the summary agent's output path to the run-side folder, eval/results/novel/<date>/summary.md: agents/summary.md:19 (step 4) and :39 (rules "Write only ..."); workflow line 200.
- Then add a copy runner after the summary call at workflow 369-375, reusing a generalized copyPrompt (169-178) with source and destination arguments. Keep the same agentLogged pattern. The reviewer already writes into eval/results (reviewer.md:12, 66), so that path is writable.
- Do not pass the text through a shell heredoc. Quoting risk.
- summaryPrompt has one call site (371). Changing its body does not change its signature.

HOOK POINT 2: RESUME.md ERROR CASE (docs only)
- The workflow sends status 'error' in two places: same-pending limit (workflow 289-297, MAX_SAME_PENDING=30 at line 41) and runner failure (318-325, plus runnerStatus at 100-103 returns 'error' when the step result is missing).
- 'error' is not a RunStatus (state.ts:18-19 lists new, running, pending, done, paused-limit, paused-error, blocked). So state.json will still say 'pending' or 'running' in those cases, which can mislead step 1 of resume-note.md (line 20).
- resume-note.md: line 10 status list lacks 'error'. Step 3 (lines 22-27) has no 'error' bullet.
- Fix: add 'error' to line 10 and add a bullet to step 3. For the runner-failure case, quote detail and say to run that command. For the same-pending case, read answer.error.txt and the pending kind, and say the answers are not clearing it. Also tell the reader that state.json may not show 'error'.

HOOK POINT 3: COPY RETRY
- reviewRun 209-247. The copy runs once (236-245). A failure logs and returns null with no retry.
- Worse, on rerun the review-exists check (211-221) returns 'skipped' without copying. A run with review.md but no docs copy never gets copied.
- Smallest fix: (a) in reviewRun, retry copyPrompt once in a loop at 236-245; (b) when review.md exists, also check the docs path (extend reviewExistsPrompt 143-151 to return 'exists-copied' vs 'exists-uncopied'), and run only copyPrompt in the uncopied case.
- Call sites: reviewRun is called only at workflow 310. copyPrompt is called only at 236.

HOOK POINT 4: resummarize --date
- cli.ts:425 throws when workerAlive(dir) (worker-lock.ts:32-35). resummarizeDate (451-459) maps resummarizeRun with no try/catch. So the first live worker aborts the loop. Runs before it were already rewritten (partial write), runs after it are skipped, and the error is a single JSON line from main (554-556).
- Smallest fix: in resummarizeDate, catch per run and skip live runs (check workerAlive first). Return {dir, error?} entries, or keep the array and add an error field. Keep resummarizeRun's throw so single-dir use still refuses.
- Call sites: dispatch 536 (uses the return value directly); cli.test.ts:111-115 expects results.map((r) => r.dir) to equal the two dirs. Adding fields keeps that test valid.
- Test gap: cli.test.ts 58-116 covers resummarize only without a live worker. No test covers the live-worker refusal. Lock tests exist only for acquireLock (cli.test.ts:160 region).

CALL SITES OF FUNCTIONS THAT MAY CHANGE
- buildRunSummary (finish.ts:101): cli.ts:445 (resummarizeRun), finish.ts:155 (finish). Pure, do not change the signature.
- speedSummary (finish.ts:32): finish.ts:112 and finish.test.ts (many lines).
- workerAlive (worker-lock.ts:32): cli.ts:214, 232, 239, 425.
- acquireLock/releaseLock (worker-lock.ts:38, 54): cli.ts:130, 140.
- summaryPrompt (workflow 188): workflow 371 only.
- copyPrompt (workflow 169): workflow 236 only.
- resummarizeDate (cli.ts:451): cli.ts:536, cli.test.ts:112.

STATE FACTS
- readCallRecords (steps/util.ts:155-162) reads calls/*.json.
- pause() (run.ts:204-219) sets the paused states. Three pauses on one step block the run.
- The backlog lists the four items as "기록만 해 둔 작은 문제" and the summary save item as a blocked-tool problem: docs/eval/novel/follow-up-ai-improvement.md:154-156 (small items) and :40-ish summary save line (text "요약 저장 막힘 해결"). The 2026-10-18 summary was written by hand: docs/eval/novel/2026-10-18/summary.md:248-250 notes no RESUME.md exists.

OPEN QUESTIONS
- The exact guard rule that blocks docs/ writes is in .claude/settings.json or .claude/hooks, which I could not read. The fix above assumes eval/results is writable, based on the reviewer's behaviour.
- Whether to make the summary step write its own file or return text is a design choice. File-then-copy matches the review pattern.

Files:
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 14, 52-61, 100-103, 115-140, 143-151, 169-178, 188-202, 209-247, 250-329, 289-297, 318-325, 369-378 - Entry workflow. Hook points for the summary save (188-202, 369-378), copy retry (209-247, 236-245), error-state routing (289-297, 318-325), and the hard-coded REPO path (14).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/summary.md` 12, 19, 27, 39 - Summary agent instructions. Line 19 is the docs write path; line 39 forbids any other write; both must change if the file is written under eval/results.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/resume-note.md` 10, 20, 22-27, 32-37 - Resume-note agent. Line 10 status list and step 3 (22-27) lack an 'error' case; step 1 (line 20) reads state.json, which may not show 'error'.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 129-142, 205-256, 418-448, 451-459, 501-545, 548-558 - CLI. resummarizeRun 423-448 (live-worker throw at 425); resummarizeDate 451-459 (no per-run catch, the --date fix point); dispatch 532-539; main 548-558 prints the one JSON line.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/worker-lock.ts` 32-35, 38-51, 54-56 - Worker lock. workerAlive (32) is the check resummarize needs; acquireLock (38) and releaseLock (54) are used by runWorker.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 32-78, 101-121, 123-158 - Writes run-summary.json and wiki-final.json. buildRunSummary (101) is pure and reused by resummarize; no change needed for HX4.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 107-146, 149-197, 204-219 - Step driver. runUntilBlocked loops steps; pause() sets paused-limit, paused-error or blocked, which the workflow then routes to the resume note.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 18-19, 45-56 - RunStatus type. Has no 'error'; the workflow's 'error' status is never persisted to state.json.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 24-60, 62-69 - CallRecord and FailureKind types. Source of calls/*.json and failure kinds that drive pause().
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 155-162 - readCallRecords, used by finish and resummarize.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.test.ts` 58-116, 160 - Existing resummarize tests (no live-worker test; a test is needed for the date fix) and the acquireLock test.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md` 12, 14, 66 - Reviewer writes only <dir>/review.md under eval/results. Evidence that eval/results is writable by agents, which the summary fix relies on.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 154-156, and the 요약 저장 막힘 item near line 130-140 - Backlog entries for HX4: the blocked summary save, RESUME error case, copy retry, and resummarize --date.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 248-250 - Evidence that the 2026-10-18 summary was written by hand and that no RESUME.md exists.
- `/home/xogud/documents/github/DaeumHwa/.claude/settings.json` n/a - Likely location of the docs/ write guard. Not readable in this session (permission denied), so the exact rule is unverified.

Open questions:
- The exact tool-guard rule that blocked the summary agent's write to docs/ is in .claude/settings.json or .claude/hooks, which this session cannot read. The summary fix assumes eval/results is writable, based on the reviewer's behaviour.
- Should the summary step write to eval/results and copy to docs (file-then-copy, matching the reviews), or return text for the workflow to save? The survey recommends file-then-copy.
- The REPO constant (novel-eval.js:14) and the other prompt files hard-code /Users/taehyeong/... This machine's repo is /home/xogud/documents/github/DaeumHwa, so runs here would point at a missing path. Confirm whether the fix should cover this.

## survey:HX4:evidence

TRACK HX4 survey (read-only). Scope: the four harness fixes, checked against the backlog, the 2026-10-18 summary, the six run reviews, and the harness code. No repo file was changed.

KEY FINDING: none of the six reviews reports a summary-save failure, a copy failure, a paused or errored run, or a resummarize failure. The evidence is code reading plus the backlog and summary, not run failures. In this round the harness failure rate was 0 of 6 runs.
- docs/eval/novel/2026-10-18/summary.md:248 "이 호출의 runs는 비어 있다. 멈추거나 막힌 실행은 없다." and :249 all six runs are status done. RESUME.md is absent (:248).
- docs/eval/novel/2026-10-18/haiku-5.5-ko.md:23 "운영은 안정적이다. 실패, 재시도, 시간 초과 ... 모두 0건이다." and :254-255 "호출 수 | 29 (실패 0, failed [], pauses {})".
- docs/eval/novel/2026-10-18/luna-6-ko.md:190-191 "구조화 출력 실패 0" and "호출 재시도 기록 없음. 호출 기록에 재시도 필드가 없다." Retry counts are not recorded anywhere.
- Only retries seen are per-call model-level ones (not harness): qwen-ko.md:341 retried ch1:proofread; qwen-en.md:150 retried reader once (failed 448 s, success 2241 s). summary.md:141-142 for the counts.
- Backlog item: follow-up-ai-improvement.md:150 (summary save, done by hand this round) and :153-156 (RESUME.md error case, copy retry, resummarize live-worker stop). These are "기록만 해 둔 작은 문제" (recorded, not measured).

PER-FIX EVIDENCE (code, path:line):
1. Summary save. The summary step asks the Sonnet agent to write docs itself: .claude/workflows/novel-eval.js:188-202 (summaryPrompt, "Write ${REPO}/docs/eval/novel/${date}/summary.md"). The result is discarded and never checked: novel-eval.js:369-375 (agentLogged, no schema, no existence check). Agent rule: eval/novel/agents/summary.md:39 "Write only docs/eval/novel/<date>/summary.md." The tool guard itself is not in any file I read (.claude/settings.json was not opened), so the guard is unverified. Reviews already use the save-by-copy path: copyPrompt at novel-eval.js:169-178.
2. RESUME error state. eval/novel/agents/resume-note.md:10 lists four statuses: paused-limit, paused-error, blocked, iteration-limit. Step 3 (resume-note.md:23-27) has a branch for each of those four and none for error. The workflow nevertheless sends status 'error' in three places: novel-eval.js:292 (same pending item 3 times), novel-eval.js:101 (runner returned no result, runnerStatus gives 'error'), and novel-eval.js:318-320 (runner reported error). A fourth path, novel-eval.js:336-341 (runOne catch), sets status 'error' and never calls resumePrompt, so that run gets no RESUME.md. summary handling at novel-eval.js:192-193 still points to a resumePath that may not exist.
3. Copy retry. copyPrompt is one attempt (novel-eval.js:169-178). A failed copy returns null and only logs (novel-eval.js:242-245). Worse, on a rerun reviewRun returns 'skipped' when review.md exists, before any copy (novel-eval.js:210-221). So a failed copy is never retried unless args.rereview is true, which also reruns the Sonnet reviewer. The copy result is written only to the workflow log, not to state or run-summary (finish.ts:151-156 writes only wiki-final.json and run-summary.json).
4. resummarize --date. cli.ts:425 throws when workerAlive(dir). resummarizeDate (cli.ts:451-459) maps runs in name order with no try/catch. Each earlier run is already rewritten (metrics written at cli.ts:436-442, run-summary at :446) before the throw, so the result is a partial rebuild with no report. Tests: cli.test.ts:58-123 cover no-live-worker cases only (names at :59 and :108). worker-lock.ts:32-35 treats any live pid as the lock holder, so pid reuse reads as live (minor).
- Portability: the workflow hardcodes REPO = '/Users/taehyeong/Documents/GitHub/DaeumHwa' (novel-eval.js:14). The same absolute path is in eval/novel/agents/summary.md:12, resume-note.md:16 and :37. That directory does not exist on this machine (checked: ls reports no such path).
- Measurement hook: metrics.ts already counts hanja for ko (metrics.ts:36-37 OTHER_SCRIPT_RUN includes Han; :52-55). summary.md:202 says the qwen ko run was made with older commit 6c74e2f, so resummarize on that run could show T5 hits the stored foreignRuns [] missed. I could not verify this, because eval/results is gitignored and not in this checkout (summary.md:274).

PROPOSED ACCEPTANCE CRITERIA (metric, current, target, how to measure):
A. Summary written by the workflow, no manual save. Metric: summary.md exists after a summary:true invocation with the 10-row table and no hand edit. Current: 0 automatic; manual save at follow-up:150. Target: 1 of 1 invocations in the next round. Measure: a post-step existence and header check on docs/eval/novel/<date>/summary.md. Missing: no such check exists (metrics.ts is chapter-only).
B. RESUME coverage. Metric: count of runs with state.json status not done that have RESUME.md, and count of statuses handled by resume-note. Current: error status is unhandled (resume-note.md:10); 1 path writes no RESUME (novel-eval.js:336-341); 2026-10-18 count 0 of 0 (summary.md:248). Target: 100% of non-done runs have RESUME.md, including error. Measure: fault injection (force no-result, force throw) and a script that compares state.json status to RESUME.md presence. Missing: no workflow test (.claude/workflows has no test file), so this needs a new harness test.
C. Copy success. Metric: done runs with a docs copy, as a fraction of done runs. Current: 6 of 6 in 2026-10-18 (six review docs present, summary.md:249). Retry count 0 (no retry exists). Target: 100% after one injected cp failure followed by rerun. Measure: count docs/eval/novel/<date>/*.md against done runs in state.json, plus a fault-injected rerun. Missing: copy result is not persisted (finish.ts:151-156; novel-eval.js:243 logs only).
D. Resummarize date. Metric: runs rebuilt vs non-live runs, and whether a live run causes a throw. Current: throws at the first live run, with partial rewrite (cli.ts:425, :451-459). Target: every non-live run rebuilt, live runs listed as skipped, no silent partial state. Measure: extend cli.test.ts with a live-pid case (process.pid as holder, per the existing acquireLock tests). Missing: the live-worker case has no test.
E. Portability. Metric: count of hardcoded /Users/taehyeong paths in eval/ and .claude/workflows. Current: at least 4 lines in 3 files (novel-eval.js:14, summary.md:12, resume-note.md:16, :37). Target: 0. Measure: grep. Harness-checkable now.
F. Ops fields. run-summary.json already has failed, pauses, wouldTimeOut, contextOverflow (finish.ts:101-120). Retries are not recorded (luna-6-ko.md:191), so add a retried count to the same summary to measure the retry target.

OUT OF SCOPE FOR HX4, FOR CONTEXT: the AI-quality items (A-J in follow-up:40-144) are the other tracks. Most of their evidence is in the reviews (for example summary.md:234-244 and luna-6-ko.md:272-275). I searched the six reviews with keyword grep for the harness terms and read the full summary, not every line of each review.

OPEN QUESTIONS: (1) Which tool guard blocked the summary agent? It is not in any repo file I read, so it needs the session settings. (2) Whether the qwen ko run folder is available on the author's machine, to confirm the T5 re-measure via resummarize.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - backlog; section 3 lines 150-156 hold the HX4 items
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - cross-run summary; section 6 lines 246-259 (no paused or failed runs), section 3 operations lines 139-151
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - review; ops 0 failures lines 23, 254-255
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - review; retry not recorded lines 190-191, BAD_STATE failed steps 196
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - review; per-call retry line 341
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - review; reader retry line 150
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - review; no harness-track failures found by keyword search
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - review; no harness-track failures found by keyword search
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js`  - workflow; REPO hardcode :14, status 'error' :292, :101, :318-320, runOne catch :336-341, copy single attempt :169-178 and :242-245, rerun skip before copy :210-221, summary prompt and discarded result :188-202, :369-375
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/resume-note.md`  - resume agent; four statuses only at :10, branches :23-27, hardcoded repo :16 and :37
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/summary.md`  - summary agent; direct docs write rule :39, hardcoded repo :12
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts`  - resummarizeRun live-worker throw :423-425, resummarizeDate without catch :451-459, per-run writes :436-446
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.test.ts`  - resummarize tests cover no-live cases only at :58-123
- `/home/xogud/documents/github/DaeumHwa/eval/novel/worker-lock.ts`  - workerAlive and acquireLock by pid at :32-35 and :38-51
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - run-summary fields failed, pauses, wouldTimeOut at :101-120; no copy or summary status recorded
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - ko foreign-script check including Han at :36-37 and :52-55; lengthOk :49-50

Open questions:
- Which tool guard blocked the summary agent's write to docs/? No repo file I read defines it, and .claude/settings.json was not opened.
- Is the qwen ko run folder (eval/results/novel/2026-10-18/run-01-ko) available on the author's machine? If so, resummarize on it would confirm whether T5 hits were missed under foreignRuns [] (the backlog says the run used older commit 6c74e2f).
- Should a failed copy be retried by rerunning the copy alone (cheap, no reviewer rerun), or by treating the copy as its own workflow step?

## survey:HX4:risks

TRACK HX4 risk and neighbour survey (read-only). Nothing in the repo was changed.

BASELINE (what HX4 touches today)
- Workflow summary save: the summary prompt tells the agent to write docs/eval/novel/<date>/summary.md (.claude/workflows/novel-eval.js:188-203, file path at :199-200). The agent instructions say the same and forbid any other file (eval/novel/agents/summary.md:4, :12, :39). The backlog says the docs write was blocked by the tool guard and the text was saved by hand (docs/eval/novel/follow-up-ai-improvement.md:157). The reviewer already avoids this: it writes <run>/review.md (eval/novel/agents/reviewer.md:12) and a Bash runner copies it (novel-eval.js:169-178).
- RESUME gap: resume-note.md step 3 covers only paused-limit, paused-error, blocked, iteration-limit (eval/novel/agents/resume-note.md:22-27). The workflow also sends status "error" (runner error at novel-eval.js:132 and :100-103, MAX_SAME_PENDING stop at :292, catch-all resume at :306-318). "error" is not in RunStatus (eval/novel/state.ts:18-19), and "iteration-limit" is workflow-only. So the status vocabulary is split between the workflow, state.ts and the agent doc.
- Copy retry gap: reviewRun checks only <run>/review.md (novel-eval.js:143-151 and :209-216). If the copy fails (:221-226 path returns null), the next invocation sees review.md, skips review and copy (log line near :216), and never retries the docs copy. copyPrompt has no retry (:169-178).
- resummarize --date: resummarizeRun throws on a live worker (eval/novel/cli.ts:423-425, via workerAlive in worker-lock.ts:31-35). resummarizeDate uses an eager .map with no catch (cli.ts:451-458), so the first live run throws and aborts the date, leaving earlier runs rebuilt and later ones stale. Dispatch is cli.ts:532-538.
- Lock semantics: acquireLock takes over a stale pid (worker-lock.ts:38-51). Do not weaken it.

INVARIANTS (CLAUDE.md) AND HOW THEY APPLY
- eval/novel is a dev harness, not product code. The product rules on AppError, withAction/ActionResult, requireWorkRole, change_log and archive-not-delete do not apply to HX4 (no wiki writes). finish.ts only reads wiki through services (steps/finish.ts:6-11, :125-130). The harness throws plain Error (cli.ts:113, :130), which is consistent with that.
- Korean user-facing copy: HX4 messages (RESUME.md, CLI errors, summary) are English by design, since they are agent and developer facing. Open question below.
- Packages: no new dependency is needed. A node-side copy uses node:fs (cli.ts already imports it).
- AI-facing invariants (DEFAULT_AI_TIMEOUT_MS 120_000 at src/ai/run.ts:28, STREAM_AI_TIMEOUT_MS 280_000 at :30, setAiTimeoutOverride at :36-40, anthropic.ts:305 maxRetries 1, neutralizeDeep/TAG_DATA_RULE at src/ai/prompt-utils.ts:5-22): HX4 does not touch them. Do not change them while editing cli.ts advance (maxSeconds 540 at cli.ts:206) or the runner's 600000 ms bash timeout (novel-eval.js:129-130).
- Next.js 16 APIs: not used by HX4.
- The workflow hard-codes REPO = /Users/taehyeong/... (novel-eval.js:14, also in the agent docs). Any new path must use the same REPO pattern.

NEIGHBOUR TRACKS (who edits the same files or depends on HX4)
- Same files:
  - .claude/workflows/novel-eval.js: HX1 (reviewerPrompt :161-167, opaque run dir :72-76), HX3 (authorPrompt :153-159, author.md), F4 (MODEL_QUEUES :26-33, parallel queues :341-349). Highest merge-conflict risk. Sequence HX4 with them.
  - eval/novel/cli.ts: F4 (advance/worker serialization, advanceRun :205-250, spawnDetachedWorker :149-165), HX4 resummarize (:423-458, :532-538).
  - eval/novel/worker-lock.ts: F4, if the local Ollama server gets a cross-run lock. Keep it one lock mechanism.
  - eval/novel/agents/summary.md and resume-note.md: HX1 and HX3 change what the reviewer and author write, so summary input changes. Anything that changes review.md structure changes what the summary reads.
- Dependency (HX4 is an enabler):
  - resummarize rebuilds metrics/NN.json (cli.ts:427-437) with the current chapterMetrics (eval/novel/metrics.ts). E1 (paragraph rule), E2 (repeat and sample-copy), A (length guarantee, targetChars), and C and J (scoring changes) need resummarize or a re-run to re-score old runs. Fixing HX4(4) first lets the measurement loop in the backlog run.
  - steps/finish.ts buildRunSummary keys byTask by call.task (:101-113). F1, F2 and F3 split tasks into more call names, so byTask keys and the speed table change. Summary tables (the 속도 table in agents/summary.md:22) must tolerate new task names.
  - F4 runs the local server one call at a time. Its timing numbers feed the summary speed table.
- Shared AI guard library (src/ai/guards): does not exist yet (checked). Used by A, C, D, E1, E2, G1, H, J, F1. HX4 does not use it. HX4 must not add guards to the eval-only path.
- Independent of HX4 (no shared files found): B, D, G1, G2, H, I, J, C, A, E1, E2 (product src/ai/tasks/*, src/server/interview.ts, src/ai/tasks/chapter-extract.ts, proofread.ts); HX2 (eval/novel/localize/*, eval-client.ts).
- Partial overlap: HX1 may change reviewer output paths. The copy step (copyPrompt) and the docs filename <model>-<lang>.md (novel-eval.js:77) are shared with it.

REGRESSION RISKS FOR HX4
- Copy retry must not overwrite a docs review on rereview (args.rereview, novel-eval.js:58) or any earlier review notes. The copy-only retry must check the docs destination, not only the run folder.
- Summary save: whatever path is used, the summary must still cover runs from earlier invocations (summary.md:9-17 and novel-eval.js:198-199). If the agent writes into eval/results and the workflow copies, the copy needs the same retry.
- Writing the summary through a shell heredoc from the result text risks quoting breaks (Korean, backticks, $). Prefer a file in the run folder plus a node or cp copy.
- resummarize --date: keep the live-worker guard per run. Only change the reporting, not the check.
- RESUME: any new status case must match the strings the workflow actually sends ("error", "iteration-limit", "paused-*", "blocked").
- Prompt injection: the summary agent reads review text that a model produced, and RESUME reads worker.log. Neither goes through the product TAG_DATA_RULE path. Keep the agents reading files only, and keep the copy step free of agent-written paths.
- Token and timeout: a summary that reads 10 reviews is long input for one Sonnet call. HX4 adds no wait. Retries must stay inside the runner loop budget (novel-eval.js 1000-agent cap in meta.whenToUse, :6).

MINIMAL PUBLIC INTERFACE (proposal, TypeScript)
// eval/novel/publish.ts (new, node-side, no agent)
export type PublishOptions = { src: string; dest: string; attempts?: number } // attempts default 3
export type PublishResult = { status: 'copied' | 'failed'; dest: string; error: string | null }
export function publishFile(o: PublishOptions): PublishResult
// mkdir -p dest dir, copy, retry on error. Pure I/O, no network.
// cli.ts: new command 'publish' --src <file> --dest <file>, prints one JSON line (keeps the one-line JSON contract, cli.ts:33-35).

// eval/novel/cli.ts
export type ResummarizeOutcome = ResummarizeResult | { dir: string; skipped: 'worker-running' }
export function resummarizeDate(folder: string): ResummarizeOutcome[] // per-run catch for the live-worker case; resummarizeRun unchanged

// eval/novel/state.ts (only if the workflow status set is widened)
export type WorkflowStatus = RunStatus | 'error' | 'iteration-limit' // used by the RESUME note only; RunStatus unchanged

// agents/resume-note.md: add a step-3 case for status "error" (runner or command failure, or the same pending item repeated 30 times) with the retry rule.
// agents/summary.md: output path becomes eval/results/novel/<date>/summary.md (run-folder pattern); the workflow copies it with publish.
// novel-eval.js: copyPrompt and reviewExistsPrompt check the docs destination as well as <run>/review.md; the copy retries via publish (attempts 3).

OPEN QUESTIONS FOR THE AUTHOR
1. Summary save: (a) write to eval/results/novel/<date>/summary.md, then copy through the new publish command (recommended, same as reviews), or (b) keep the agent writing and have the workflow copy with cp? Also confirm the tool guard does not block eval/results (the reviewer already writes there, so it likely does not).
2. The 'error' status in RESUME: retry now, or stop and inspect first? The workflow sends it on runner failure and on the 30-repeat stop.
3. Copy retry: how many attempts (3 proposed), and should a rerun re-copy when review.md exists but the docs copy is missing (recommended yes)?
4. resummarize --date: skip and report runs with a live worker (exit code 0 with a skipped list, or non-zero), or abort as today?
5. Language: keep HX4 messages and RESUME text in English (the agent docs are English), or Korean? CLAUDE.md's Korean rule covers product copy only; confirm.
6. Hard-coded REPO path (novel-eval.js:14): leave as is, or parametrize in this track?
7. Merge order: land HX4 before or after HX1, HX3 and F4, all of which edit novel-eval.js and cli.ts? Recommend HX4 first (small) or last (after the others), not in parallel.
8. Should resummarize run automatically after E1, E2, A or C changes metrics, or only on demand?

Files:
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 14, 41, 72-76, 77, 100-103, 143-151, 161-167, 169-178, 180-186, 188-203, 209-245, 292, 306-318 - Workflow: copy, summary, resume and review prompts; shared with HX1, HX3, F4
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/summary.md` 4, 12, 16-27, 39 - Summary agent: output path to docs, the only-docs write rule
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/resume-note.md` 10, 22-27, 33-37 - RESUME note: no error-status case
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md` 12 - Reviewer writes into the run folder; the pattern summary should follow
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 33-35, 129-142, 149-165, 205-250, 423-458, 532-538 - CLI: advance (540 s), worker spawn, resummarize date loop, command dispatch
- `/home/xogud/documents/github/DaeumHwa/eval/novel/worker-lock.ts` 31-56 - Worker lock and stale pid takeover; F4 may extend
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 101-121, 123-150 - Run summary and speed; byTask keys change with F1-F3
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 144-149 - writeRunFile helper
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 18-19 - RunStatus lacks error and iteration-limit
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 28-40 - Product timeouts 120 s and 280 s, eval override; do not change
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 5-22 - TAG_DATA_RULE and neutralizeDeep; untouched by HX4
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 144-157 - Backlog section 3: the HX4 evidence (summary save, resume, copy retry, resummarize)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md` 105-106 - Documents the resummarize --date command

Open questions:
- Summary save: write to eval/results/novel/<date>/summary.md and copy through a new publish command (recommended), or keep the agent writing into docs and copy with cp?
- RESUME for status 'error': retry now, or stop and inspect first?
- Copy retry: how many attempts (3 proposed), and should a rerun re-copy when review.md exists but the docs copy is missing (recommended yes)?
- resummarize --date: skip and report runs with a live worker (with which exit code), or abort as today?
- Language of HX4 messages and RESUME text: English as the agent docs are now, or Korean? CLAUDE.md's Korean rule covers product copy only; confirm.
- Hard-coded REPO path /Users/taehyeong/... in novel-eval.js:14 and the agent docs: leave it or parametrize in this track?
- Merge order: land HX4 before or after HX1, HX3 and F4, all of which edit novel-eval.js and cli.ts? Recommend HX4 first or last, not in parallel.
- Should resummarize run automatically after E1, E2, A or C change metrics, or only on demand?

## survey:HX4:specs

TRACK HX4 prior-spec survey (read-only). Sources: docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md (spec, Korean, § numbers) and docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md (plan). Other specs (MVP 2026-10-16, interview-ai-reliability 2026-10-18) do not constrain HX4. Note: the Docs MCP tools were not used (no doc requested).

(1) SUMMARY SAVE (summary agent cannot write docs/)
- Spec §6.1 item 5 (line ~109-111): Sonnet reviewer and Sonnet summary "write" the review and comparison; §12.2 (line ~333): Sonnet is a Claude Code agent. So Sonnet must remain the author of the summary text.
- Spec §8 (line ~280-283): committed record docs/eval/novel/<날짜>/summary.md, written with the reviews; raw run folders stay gitignored (§12.8).
- Plan Task 9 (line ~637-642): summary agent (Sonnet) writes docs/eval/novel/<date>/summary.md directly. Plan Task 9 (line ~625-627): reviewer writes docs/eval/novel/<date>/<model>-<lang>.md directly.
- Current code deviates: reviewer writes <dir>/review.md and a Haiku runner copies it (eval/novel/agents/reviewer.md line 12, 66; .claude/workflows/novel-eval.js 161-167, 169-178, 227-247). This deviation is not in any spec/plan; it was introduced in commit 9bf7bdd (message says "no re-review overwrite").
- agents/summary.md: step 1 and 2 need run-summary.json speed blocks from run dirs outside docs (summary.md lines 16-22); rule line 39 "Write only docs/eval/novel/<date>/summary.md". Workflow summaryPrompt at novel-eval.js 188-202.
- Drift: plan Task 6 (line ~493) lists run-summary.json fields without `speed`, but eval/novel/steps/finish.ts (buildRunSummary, lines 101-121) now writes speed.
- Constraint for any fix: the text should still come from Sonnet (spec §6.1 item 5). Saving the returned text with shell keeps authorship; having the workflow generate the body would change the spec.

(2) RESUME.md ERROR-STATE CASE
- Spec §6.6 (lines 215-225): defines only paused-limit, paused-error, blocked; Sonnet writes RESUME.md (line 218) with error text, time to retry (5-hour window), and resume command.
- Plan Task 6 (line ~336) RunStatus: 'new'|'running'|'pending'|'done'|'paused-limit'|'paused-error'|'blocked'. No 'error'. Plan Task 6 line ~449: error with no AI failure -> paused-error. Plan Task 9 (line ~634-651): resume-note for paused-limit, paused-error, blocked only.
- Code: the workflow sends status 'error' to resume-note in two places: same-pending stop (novel-eval.js 289-298, MAX_SAME_PENDING=30) and runner error (318-325). Also iteration-limit (260-268). eval/novel/agents/resume-note.md line 10 lists paused-limit, paused-error, blocked, iteration-limit (no 'error'); step 3 (lines 22-27) has no 'error' branch. Run.ts (lines 211-214) only sets paused-limit/paused-error.
- Constraint: spec §12.12 (line ~345): model failures are recorded and the run moves on; only external failures pause. The same-pending stop is a model/author loop, not an external failure, so a RESUME pause for it is not spec-backed. Decide whether it should be recorded and continued instead.

(3) COPY RETRY
- Spec gives no copy-retry rule. Plan Task 12 step 2-3 (lines ~696-697): done runs are skipped because the review file exists, and the check expects 10 review documents in docs/eval/novel/<today>/.
- Code: reviewRun (novel-eval.js 209-247) returns 'skipped' as soon as <dir>/review.md exists (lines 210-225), and never checks that the docs copy exists. A failed copy (line 242-245) is therefore never retried on a rerun. Plan Task 12's expectation is the constraint the fix must meet.

(4) resummarize --date ON A LIVE WORKER
- No spec or plan mentions resummarize (grep of docs/superpowers finds nothing). Plan Task 8 (lines ~560-586) lists init/advance/worker/status/probe-ctx only.
- Code: resummarizeRun throws when workerAlive (cli.ts 423-425; doc comment 419-422 says it refuses a run a worker holds). resummarizeDate (cli.ts 451-458) maps without try/catch, so the first live worker aborts the remaining runs of that date. The refusal itself follows the worker.pid lock (plan Task 8 lines ~580-591, worker-lock.ts matches the plan: stale pid via kill 0).
- Undecided by any spec: abort vs skip-and-report for the date loop. Do not re-litigate the refusal itself.

DECISIONS THAT MUST NOT BE RE-LITIGATED
- Sonnet is author, reviewer and summary writer via Claude Code agents; Opus designs (spec §3 line ~36-49, §12.2).
- Author never learns the model id; author prompt receives only dir and lang (spec §6.4 line ~172; plan Task 9 line ~622). Run dirs are opaque (novel-eval.js 72-75). Reviewer reads config.json only after scoring (reviewer.md line 32).
- Model failures are recorded and continue; external failures (limit, network, Ollama down, process crash) pause and resume; three external pauses before the same step -> blocked (spec §6.6 lines 208-225, §12.12; plan Task 6 line ~447).
- Done runs are skipped; rerunning with the same date and runs resumes from state (spec §6.1 item 6 lines 112-115; plan Task 12 line ~696).
- Review and summary are the only committed records under docs/eval/novel/<date>/; raw runs are gitignored (spec §8 line ~280; §12.8).
- Product behavior unchanged; harness code must not change app behavior (spec §2 lines ~15-35, failure list; §10 line ~317). Only product seam is the timeout override in src/ai/run.ts (plan Global Constraints line ~21).
- --fake mode tests must cover resume and limit pause, run under pnpm test (spec §10 line ~315).
- No package changes (spec §10). Pushing to the public repo needs user OK (spec §10 last bullet).
- Fixed values: interview 12 questions, draft redo 2 (3 attempts), external pauses before blocked 3, output floor 32000 (plan Global Constraints line ~21; spec §12.10, §12.13).
- Workflow edits: no Date.now, Math.random or new Date (plan Task 9 step 2, line ~655-657).

CONFLICT TO FLAG
- Spec §6.7 (lines ~231-236) fixes every run at 1 chapter per user decision (2026-10-18). Plan Global Constraints and Task 12 say chapters 5. novel-eval.js line 56 defaults to 5. summary.md lines 29-35 assume 1 chapter. Runs should pass chapters:1 explicitly.

Not surveyed: docs/eval/novel/README.md and the runbook in commit 60b06a4; the backlog and the six reviews (not in this track's scope).

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Governing spec for the eval harness. §3 (line 36), §6.1 items 4-6 (lines 105-115), §6.6 error handling and RESUME (lines 204-225), §6.7 one-chapter decision (lines 229-252), §8 committed records (lines 271-283), §10 constraints (lines 308-319), §12 decisions (lines 331-351).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - Implementation plan. Global Constraints (lines 13-24), Task 6 RunStatus and loop rules (lines 336, 441-453), Task 8 CLI and worker.pid lock (lines 560-600), Task 9 agent prompts and workflow (lines 602-660), Task 12 full matrix and skip rule (lines 693-697).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/summary.md`  - Summary agent prompt (HX4 item 1). Steps lines 14-27; rule line 39 limits writes to docs/eval/novel/<date>/summary.md.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/resume-note.md`  - Resume-note prompt (HX4 item 2). Status list line 10 omits 'error'; step 3 branches lines 22-27.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - Writes wiki-final.json and run-summary.json (HX4 item 1 context). buildRunSummary lines 101-121; speedSummary lines 32-78.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts`  - resummarizeRun refuses a live worker (lines 419-446); resummarizeDate map without try (lines 450-458); dispatch (lines 516-545) (HX4 item 4).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/worker-lock.ts`  - worker.pid lock, stale detection via kill 0 (lines 1-56). Matches plan Task 8.
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js`  - Saved workflow. Constants and MAX_SAME_PENDING (lines 14-41), chapters default 5 (line 56), copyPrompt (169-178), reviewRun skip and copy logic (207-247), executeRun statuses including 'error' (250-329), summaryPrompt (188-202).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md`  - Reviewer prompt. Writes <dir>/review.md only (line 12, 66), which deviates from plan Task 9 (direct docs write).

Open questions:
- Summary and review save: may the workflow save Sonnet's returned text with the shell (keeping Sonnet as author), or must the agents keep writing docs paths directly? Specs say Sonnet writes; the current review copy path is undocumented.
- RESUME for status 'error' (same-pending stop, runner error, iteration-limit): spec §12.12 says model failures are recorded and the run continues, so should the same-pending stop be recorded rather than paused, and should resume-note accept 'error' and 'iteration-limit'?
- Copy retry: should reviewRun's skip path verify that the docs copy exists and re-copy when it is missing? Plan Task 12 expects 10 reviews in docs, but no spec defines retry.
- resummarize --date: abort on the first live worker (current) or skip that run and report it? No spec or plan covers resummarize, so this is a new decision.
- Chapter count: spec §6.7 fixes one chapter per user decision (2026-10-18), but the workflow defaults to 5 and the plan says 5. Should HX4 runs pass chapters:1 explicitly, and should the default change?

## survey:HX4:tests

## TRACK HX4 test map (read-only survey, nothing edited)

**Scope correction.** The touched code lives in `eval/novel/` (not `src/`), and its tests are colocated there and matched by vitest `include: ['eval/**/*.test.ts']` (vitest.config.ts:9). `src/test/factories`, `src/test/db.ts` and `src/test/ai-fakes` are NOT used by any HX4 code path. Only `eval/run-continuity.ts` and `eval/novel/{models.ts,run.test.ts}` use `@/test/fake-ai`.

### 1. Touched code and existing coverage

| Code | Path:line | Existing test | What it asserts |
|---|---|---|---|
| `resummarizeRun` / `resummarizeDate` / CLI `resummarize` | eval/novel/cli.ts:423-459, 532-539 (live-worker refusal at :425) | eval/novel/cli.test.ts:58-106 | one run: metrics rebuilt from chapters, run-summary from calls, calls untouched, failed kept |
|  |  | eval/novel/cli.test.ts:108-122 | date folder: both run dirs rebuilt, returned `dir`s in name order |
| worker lock | eval/novel/worker-lock.ts:32-56 | eval/novel/cli.test.ts:150-167 | stale pid (dead `spawnSync` pid) taken over; live pid (own pid) refused; release then re-acquire |
| `advanceRun` (spawn, paused-error, log tail, running) | eval/novel/cli.ts:205-256 | eval/novel/cli.test.ts:199-277 | fake run reaches done; dead worker, spawn failure, log tail, live lock → `running` |
| `initRun`, `formatStatus`, `probeContext` | eval/novel/cli.ts:52-126, 348-414 | eval/novel/cli.test.ts:125-197, 278-388 | status JSON shape, init idempotence, probe sizes |
| `buildRunSummary`, `speedSummary`, `mergedMs`, `finish` | eval/novel/steps/finish.ts:32-158 | eval/novel/steps/finish.test.ts:23-113 (speed/median/chapter wall time only) | medians, ollama source, merged wall intervals, legacy records. `buildRunSummary` and `finish` itself are only covered through cli.test.ts:59-106 |
| RunStatus, state persistence | eval/novel/state.ts:18-19, 100-123 | eval/novel/state.test.ts:36-88 | plan shape, round-trip, tmp file removed |
| step machine, resume after lost marks | eval/novel/run.ts; run.test.ts:154-539 | eval/novel/run.test.ts | 'fake run reaches done', 'external limit pauses and resumes', 'three external pauses block', resume cases |
| Workflow script (copy, review skip, resume prompt, summary prompt, loop cap) | .claude/workflows/novel-eval.js:169-202, 209-247, 260-268, 285-324 | NONE | not in vitest include; top-level `agent`/`log`/`return` globals |
| summary agent prompt | eval/novel/agents/summary.md:39-40 (write only docs path) | NONE | prompt text, no test |
| resume-note agent prompt | eval/novel/agents/resume-note.md:10, 18-38 | NONE | prompt text, no test |

### 2. Factories and fake AI

- `src/test/factories.ts` exports `createTestUser`, `createTestWork`, `addTestMember`, `createTestChapter`, `createTestEntry`, `createTestFact`, `createTestThread` (service/DB tests). Unused by HX4.
- `FakeAiClient` is at src/test/fake-ai.ts:19 with per-task `overrides` (:10-13) and fixed outputs `FAKE_OUTPUTS`, `FAKE_TEXT` from src/test/ai-fakes/index.ts. Wired into eval via `models.ts:125` (`fake` model profile) and run.test.ts:14, 62-64 (throwing wrapper), 92.
- The HX4 changes touch no AI call (summary, resume and copy are agent or shell steps), so no FakeAiClient wiring is needed. The only fake path HX4 tests use is `model: 'fake'` with `fakeAuthor: true` (cli.test.ts:200-212).

### 3. Exact command

`pnpm vitest run eval/novel/cli.test.ts eval/novel/steps/finish.test.ts eval/novel/state.test.ts eval/novel/run.test.ts --maxWorkers=2`

Add any new test file (for example `eval/novel/publish.test.ts`) to the same command. The workflow JS and the agent .md files cannot run under vitest.

### 4. NEW test cases needed

**A. Summary save (item 1).** Assumes the design "agent writes to `eval/results/novel/<date>/summary.md`, then a copy step (or a new CLI command) moves it into docs" (mirrors `copyPrompt`, novel-eval.js:169-178).
- `copies the run-folder summary to docs/eval/novel/<date>/summary.md`. Input: source file with text T in a temp results folder. Expect: dest bytes equal T; return `{dest}`.
- `creates the date folder when it does not exist`. Input: no docs folder. Expect: folder and file created.
- `replaces an existing summary on a rerun`. Input: dest with old text, source with new text. Expect: dest equals new text.
- `refuses when the source summary is missing`. Input: no source file. Expect: throws a readable error; no dest written.
- If instead the shell approach is chosen, there is no unit test. Verify by a manual `summary: true, runs: []` workflow run.

**B. RESUME.md error state (item 2).** Pure text checks, because the prompt is markdown.
- `resume-note covers every status the workflow passes`. Input: read eval/novel/agents/resume-note.md and the `resumePrompt(...)` status values in novel-eval.js (`paused-limit`, `paused-error`, `blocked`, `error`, `iteration-limit`). Expect: each value appears in the status list at resume-note.md:10 and in a step 3 branch. Today `error` is in neither (resume-note.md:10, 22-27).
- `resume-note reads a state.json whose status may differ`. Expect: step 1 says to trust the passed `status` when state.json says `pending` (see gap below). Doc assertion only.

**C. Copy retry (item 3).** Only testable if the copy logic moves to a TS module (for example `eval/novel/publish-review.ts`) called from the CLI. Otherwise verify manually.
- `copies review.md to docs when review.md exists but the docs copy is missing`. Input: run dir with review.md, no docs file. Expect: docs copy created, returns copied. Current code returns `skipped` here (novel-eval.js:218-220, README.md:89), so this test fails today. That is the bug.
- `leaves the docs copy alone when it already matches review.md`. Expect: no write, returns unchanged.
- `retries a failed copy up to 3 attempts`. Input: copy fails twice, then succeeds. Expect: 3 attempts, success. Today there is one attempt (novel-eval.js:236-245).
- `records a failure when all attempts fail`. Expect: error text kept; no throw.

**D. resummarize --date with a live worker (item 4).**
- `skips a run whose worker is alive and rebuilds the others`. Input: `initRun` for run-01-ko and run-02-en in one folder; `acquireLock(run-01-ko)` held by this process. Expect: no throw; run-02-en rebuilt; run-01-ko's files unchanged; result lists run-01-ko as skipped (with `dir`). Current code throws in `resummarizeRun` (cli.ts:425) from the `map` at cli.ts:458, so the second run is never rebuilt. Fails today.
- `a single run with a live worker is still refused`. Input: `resummarizeRun(dir)` with own pid in worker.pid. Expect: throws `a worker is running`. Passes today, but no test locks it in.
- `the CLI prints one JSON line with the skipped runs and exits 0`. Input: `main(['resummarize','--date',D])` with one live run. Expect: return 0; JSON contains the skipped entry. Today it returns 1 with `{error}` (cli.ts:555).

**E. Doc consistency (small).** `follow-up-ai-improvement.md` and README say 5 repeats (docs/eval/novel/README.md:90) but `MAX_SAME_PENDING` is 30 (novel-eval.js:41). Fix the doc, or add a text assertion.

### 5. Existing tests that would break, and why

- `cli.test.ts:108-122` (date folder rebuild): breaks only if the return shape drops `dir` or changes order. Keep `dir` on every entry.
- `cli.test.ts:150-167` and `:233-248` (lock): write the raw pid text into worker.pid. These break if the lock file format changes (for example JSON). Keep the plain-pid format.
- `cli.test.ts:170-196` (`formatStatus`): breaks only if `StatusJson` or `RunStatus` changes shape. Adding `error` to the `RunStatus` union (state.ts:18-19) does not break it.
- `state.test.ts`: unaffected by any HX4 change.
- `run.test.ts`: unaffected unless step ordering or `finish` changes.
- `finish.test.ts`: unaffected unless `speedSummary` or `buildRunSummary` changes. Moving the summary save into `finish` breaks nothing.
- No existing test asserts the current throw in `resummarizeDate`, so fixing item 4 breaks nothing. Item 4 is untested today.

### 6. Other facts and gaps

- `RunStatus` (state.ts:18-19) has no `error` or `iteration-limit`. Workflow `error` (novel-eval.js:292, 318) is never written to state.json. So resume-note step 1 (`state.json`, resume-note.md:20) can show `pending` while the prompt says `error`.
- `.claude/settings.json` is read-denied in this sandbox, so the tool guard that blocks docs writes could not be inspected. Its cause is unverified.
- Machine path: REPO is hard-coded to `/Users/taehyeong/Documents/GitHub/DaeumHwa` (novel-eval.js:14; resume-note.md:16; summary.md:12). This checkout is `/home/xogud/documents/github/DaeumHwa`, so the runner `cd` commands would fail here. Any manual verification needs the path changed or a symlink.
- Workflow changes have no automated test. Verify manually with a `summary: true, runs: []` dry run and a copy-retry dry run.

Files:
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 423-459, 532-539, 548-558 - resummarizeRun live-worker refusal (425), resummarizeDate map (451-459), resummarize dispatch (532-539), main error JSON (555)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.test.ts` 58-122, 150-167, 170-196, 199-277 - existing tests for resummarize, lock, init, status, advance, probe
- `/home/xogud/documents/github/DaeumHwa/eval/novel/worker-lock.ts` 32-56 - lock: workerAlive, acquireLock, releaseLock; plain-pid format
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 32-158 - buildRunSummary, speedSummary, finish writes wiki-final and run-summary
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.test.ts` 23-113 - speedSummary tests only
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 14,41,169-202,209-247,260-268,285-324 - copyPrompt (169-178), reviewRun skip and copy (209-247), summaryPrompt write to docs (188-202), iteration-limit (260-268), error resume (318-324), MAX_SAME_PENDING=30 (41), hard-coded REPO (14)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/summary.md` 12,39-40 - summary agent; write-only-docs rule (39), reads run dirs
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/resume-note.md` 10,16,18-38 - RESUME writer; status list lacks error (10); state.json read (20); branches (22-27); command format (28-38)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 18-19 - RunStatus union lacks error and iteration-limit
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` 10-40 - FakeAiClient with overrides; used by eval only via models.ts and run.test.ts
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts` 20-153 - service factories; not used by HX4 code
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 115-127 - fake model profile returns FakeAiClient
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts` 14, 62-64, 154-232 - step-machine tests with FakeAiClient
- `/home/xogud/documents/github/DaeumHwa/vitest.config.ts` 9-10 - include globs covering eval/**/*.test.ts
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 153-157 - backlog items HX4 (summary save, RESUME error case, copy retry, resummarize --date)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md` 87-106 - ops notes: resume, review skip rule, resummarize; states 5 repeats (stale vs code 30)

Open questions:
- Which design for summary save: agent writes into the run folder and a copy step moves it (testable TS helper), or the workflow saves the agent's returned text with the shell? The test list in section 4A depends on this.
- Should copy retry live in a TS helper called from the CLI (testable, section 4C) or in the workflow JS (manual verification only)?
- For resummarize --date with a live worker: skip and report the run (proposed in 4D), or fail the whole date before any rewrite? The test expectations depend on this.
- The tool guard that blocked docs writes lives in .claude/settings.json, which this sandbox cannot read. Its exact rule is unverified.


# Track HX1: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:HX1:code

TRACK HX1 code map (reviewer blinding). Read-only survey; no repo files were changed.

WHAT LEAKS TODAY (model name visible to the reviewer before scoring)
- calls/NNN-<task>.json has a `model` field = profile.model (e.g. `claude-haiku-5-5`, `qwen3.8:27b-mlx`): eval/novel/eval-client.ts:47 (type), :486 (written), :507-509 (file write). The reviewer is told to read calls/ (.claude/workflows and eval/novel/agents/reviewer.md:49). Confirmed leak in docs/eval/novel/2026-10-18/haiku-5.5-en.md:7 and qwen3.8-27b-en.md:8.
- config.json holds `modelId` (eval/novel/state.ts:9, written by eval/novel/run.ts:88-104 createRun). It sits in the run dir the reviewer lists with `ls -R` (reviewer.md:20-21). Blinding relies only on the instruction "do not open config.json before step 3" (reviewer.md:30-34). That is not a file-level blind.
- Other leaks in calls/ and run-summary.json (not the `model` field): (a) `speed.source` 'ollama' vs 'wall' reveals local vs cloud (eval-client.ts:249,261,264; finish.ts:73), and reviewer.md:57 asks the reviewer to report that source; (b) `effortRequested` and `maxTokens` (floor from profile) are profile fingerprints (eval-client.ts:487-488, 451); (c) `error.message` can contain the model name, e.g. Ollama "model 'x' not found" (eval-client.ts:466-468, CONFIG_PATTERN at :99).
- The workflow itself: reviewerPrompt passes only dir and lang (novel-eval.js:161-167), which is correct. The workflow's own run dir name is already opaque (novel-eval.js:72-76, CANONICAL_MODELS :16-24).

DATA FLOW (entry to AI call and back)
1. Workflow entry: .claude/workflows/novel-eval.js runOne (:332) -> executeRun (:250) -> runner agent (haiku) runs `pnpm eval:novel advance --dir` (runnerPrompt :115-140).
2. CLI: eval/novel/cli.ts advance/worker -> runWorker (run.ts via cli.ts) -> openRun (run.ts:107-140) builds EvalClient with callsDir=<dir>/calls (run.ts:119-125) and profile from config.modelId (run.ts:113).
3. Step machine: run.ts:58-71 STEPS map -> steps/chapter.ts, steps/interview.ts, steps/style.ts etc. Steps call services with ctx.client.
4. AI call: EvalClient.generateObject (eval-client.ts:351-374) / streamText (:376-427) -> prepare (:429-454) -> inner.generateObject/streamText with model: profile.model (:362, :386). Inner clients: models.ts:110-125 createModelClient.
5. Record: settle (eval-client.ts:456-510) builds CallRecord, pushes to this.records (:500) and writes calls/NNN-task.json (:507-509).
6. Finish: steps/finish.ts finish (:123-158) reads calls with readCallRecords (steps/util.ts:155-162) and writes run-summary.json via buildRunSummary (finish.ts:101-121). buildRunSummary does not read `model`, so changing the stored value is safe for summaries.
7. Review: executeRun 'done' branch (novel-eval.js:308-316) -> reviewRun (:209-247): existence check on <dir>/review.md (:211-225, prompt :143-151) -> reviewer (sonnet) with reviewerPrompt (:227-231, prompt :161-167) -> copy to docs (:236-241, prompt :169-178).

CALL SITES OF SIGNATURES THAT WOULD CHANGE
- reviewerPrompt(dir, lang): only novel-eval.js:227.
- copyPrompt(run, dir): only novel-eval.js:236.
- readCallRecords(dir): finish.ts:151, cli.ts:444.
- buildRunSummary(calls, state, lang): finish.ts:155, cli.ts:445.
- CallRecord type: eval-client.ts:36; used in steps/util.ts:23,155; steps/finish.ts:7; eval-client.test.ts; steps/finish.test.ts.
- settle(call, outcome, firstTokenMs) is private (eval-client.ts:456), called at :369, :389, :413, :422. Not changed in the smallest option.

RECOMMENDED SMALLEST-DIFF HOOK (Option A, read-time blind copy; no change to stored data)
- Add a blind step between the existence check and the reviewer: novel-eval.js after :225, before :227. A haiku runner, like the copy runner (:169-178), runs a new CLI command that builds <date>/blind/run-NN-<lang>/ (opaque name, no model string).
- New CLI command `blind --dir <run> --out <blindDir>` in eval/novel/cli.ts: add a case to the switch at :518-545 (usage text at :541), and a function next to resummarizeRun (:416-449). It copies the run dir except config.json, rewrites calls/*.json `model` (and `error.message` model strings taken from MODEL_PROFILES, models.ts:44-100) to a fixed token, and leaves the rest. Using a JS function avoids fragile sed on pretty-printed JSON (JSON.stringify indent 2, eval-client.ts:509).
- novel-eval.js: reviewerPrompt gets the blind dir (:161-167, call :227). copyPrompt reads <blindDir>/review.md (:169-178) and prepends the header `Model id: ${run.model}` from workflow args, so the model id is written after scoring by the runner, not by the reviewer. Existence check (:143-151, call :211) should check the same location the reviewer writes to.
- reviewer.md: delete step 3 and the model-identity section (lines 30-32, 34, 62; the "do not open config.json" wording at :30). Keep line 9 and 14 (line 14 hardcodes a macOS path /Users/taehyeong/..., which does not exist on this WSL checkout; it is a separate defect, not part of this track).
- Option B (write-time, smaller but weaker): eval-client.ts:486 writes a neutral value instead of profile.model. Nothing in the repo reads CallRecord.model (grep: only tests and the type). But config.json still leaks, and the audit trail loses the real model in calls/. Option B alone does not satisfy the track.
- Tests: no existing test covers the blind step. Add a cli.test.ts case (the file already builds run dirs, e.g. :100-146) that asserts no model string from MODEL_PROFILES appears in the blind dir. Note: I did not search for tests of .claude/workflows/novel-eval.js.

ALSO LOOK AT
- eval/novel/agents/author.md:61 already forbids authors from reading config.json, calls/, etc.
- docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:172 (author must not know the model), :271-284 (section 8 says config.json holds the model and calls/ hold the model-relevant records), :285-307 (section 9 review criteria).
- docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:623, :633 (design intent: reviewer learns model only after scoring; the new design moves that to the workflow).
- docs/eval/novel/follow-up-ai-improvement.md:151 (backlog item this track closes).
- docs/eval/novel/README.md:29 (folder-name blinding already in place).

RESIDUAL DECISIONS FOR THE DEVELOPER (not decided here)
- speed.source and effortRequested/maxTokens are profile fingerprints. reviewer.md:57 requires the source to be reported, so either mask them in the blind copy or accept the leak and drop the requirement.
- Whether the reviewer may see error text that names a model (e.g. Ollama not-found messages). The blind copy should scrub it.
- RESUME.md (resume-note.md) and runs JSON in the resume prompt (novel-eval.js:183) can name models, but only for non-done runs, which are not reviewed.
- Where review.md lives after the change (run dir vs blind dir) and whether rereview (:58, :210) keeps working.

EVIDENCE NOT FOUND / NOT CHECKED
- eval/results/novel does not exist in this checkout (ls failed), so no real run files were inspected.
- author-decisions.jsonl and chapter/metrics writers were checked only by their writeRunFile call sites (steps/chapter.ts:135,200-257,369), not field by field.

Files:
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 14, 16-24, 72-76, 143-151, 161-167, 169-178, 204-247, 227-231, 236-241, 308-316 - Workflow orchestration. Hook point for the blind step (between :225 and :227), the reviewer prompt (:161-167), and the copy step that should prepend the model header from args (:169-178). reviewRun at :209-247 owns the existence check and the copy.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md` 9, 14, 16-21, 30-34, 57, 62 - Reviewer instructions. Lines 30-34 and 62 carry the blinding rule that is only instruction-level today. Line 57 requires reporting the speed source, which is a local-vs-cloud fingerprint. Line 14 hardcodes a macOS repo path.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 36-60, 240-270, 351-374, 376-427, 429-454, 456-510 - Writes calls/NNN-task.json. CallRecord.model at :47, value written at :486 from profile.model, error message at :466-468, speed.source at :249/:261/:264, effortRequested and maxTokens at :487-488, file write at :507-509. The model is passed to the inner client at :362 and :386.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 155-162 - readCallRecords: reads calls/*.json. Input to finish and resummarize. Stored records are not changed under Option A.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 32-78, 101-121, 123-158 - Writes run-summary.json. speedSummary (speed.source at :73) and buildRunSummary do not read the `model` field, so changing it is safe. finish step writes wiki-final.json and run-summary.json.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 102-125, 401-413, 416-459, 518-545 - initRun creates config.json (:102-125). ctx-probe file goes to the RESULTS_DIR root, outside the run dir (:401-413). resummarizeRun/Date (:416-459) is the model for a new blind command. The dispatch switch (:518-545) and its usage message (:541) need a new case.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 58-71, 79-104, 107-125 - STEPS map, createRun (writes config.json with modelId via state.ts). openRun builds the EvalClient with callsDir (:119-125) and the profile from config.modelId (:113).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 7-16, 58-59, 100-106 - RunConfig with modelId (:9), which config.json stores. loadConfig/saveConfig at :100-106. config.json has to be excluded from the blind copy because openRun needs modelId to resume.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 26-30, 44, 55, 66, 78, 89, 100-125 - Model strings to scrub: qwen3.8:27b-mlx (:44), gpt-oss:20b (:55), exaone3.5:32b (:66), claude-haiku-5-5 (:78), gpt-6-luna (:89). createModelClient at :110-125 is the inner AI client. The strings also drive the blind scrub list.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.test.ts` 44-146, 202-216 - Existing run-dir fixtures (initRun with model fake). Place for a new test that asserts the blind dir contains no model string.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.test.ts` 117-124, 570 - Asserts the request model (not the stored record). Not affected by Option A; affected only if Option B changes :486.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 61 - Author already forbids reading config.json, calls/ and other run dirs. Reference for the same rule on the reviewer side.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 151 - Backlog item: reviewer blinding. This track closes it.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md` 7 - Evidence: the model field was visible to the reviewer while reading calls/.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md` 8 - Evidence: a call record with the model field was printed while checking structure.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 172, 271-284, 285-307 - Design intent: authors do not know the model (:172); config.json and calls/ contents (section 8); reviewer criteria (section 9).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 623, 633 - Plan intent: the reviewer learns the model from config.json only after scoring. The track moves that step to the workflow.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md` 29 - States that folder names avoid model names, so the blind design is consistent with the README.

Open questions:
- Should the blind copy mask speed.source, effortRequested and maxTokens too, or does reviewer.md:57 keep reporting the speed source (which reveals local vs cloud)?
- Where should review.md be written after the change: the blind dir (then copied to docs with a header) or the real run dir? The existence check at novel-eval.js:211 must match.
- Should the model id header be written by the copy runner from workflow args (novel-eval.js:161-178), or should the workflow keep the model id out of the reviewer's inputs entirely?
- Does the author-decisions.jsonl or chapter writers include any model string? Only the writeRunFile call sites were checked, not every field.

## survey:HX1:evidence

TRACK HX1 (reviewer blinding) survey. Read-only; nothing in the repo was changed. eval/results/novel/2026-10-18 is not present in this checkout (ls failed), so per-run file counts come from the review documents, not from disk.

## 1. Backlog item (docs/eval/novel/follow-up-ai-improvement.md:151)
"검토자 블라인드 보강: 검토자가 호출 기록(`calls/*.json`)의 `model` 필드를 본 일이 있다. 채점 전에 보는 파일에서 모델 이름을 가린다."

## 2. Concrete failures found (evidence)
- summary.md:268 "블라인드가 완전하지 않았다. `qwen3.8-27b-en.md`, `haiku-5.5-en.md`, `haiku-5.5-ko.md`, `luna-6-en.md`는 호출 기록의 `model` 필드를 채점 중에 본 일이 있다고 적었다." Four of six reviews admit exposure.
- qwen3.8-27b-en.md:8 "one call record (`calls/025-draft-chapter.json`) was printed whole ... and it carries a `model` field." The exposure happened while checking structure, before scores were written.
- haiku-5.5-en.md:7 "the `calls/*.json` records carry a `model` field, so the model identity was visible incidentally while reading `calls/`."
- haiku-5.5-ko.md:353 "채점 중 `calls/*.json`을 읽을 때 `model` 필드가 한 번 보였다."
- luna-6-en.md:229 "The `model` field in `calls/*.json` was visible to me while I read call metadata for timings, before the scores were written."
- qwen3.8-27b-ko.md and luna-6-ko.md do not mention exposure. They are also pilot re-writes (qwen3.8-27b-ko.md:1-2 and luna-6-ko.md:1-2), so their blinding status is unverified, not clean.
- summary.md:265 self-bias: the reviewer is Sonnet and Haiku is in the same family, so Haiku's Q mean (ko 3.67, en 3.78) may be inflated. Blinding does not remove this bias.

## 3. Root cause in the current harness (verified in code)
- The reviewer reads raw call files. eval/novel/steps/util.ts:156-162 `readCallRecords` reads `calls/*.json` as is, and eval/novel/eval-client.ts:486 writes `model: this.profile.model` into every record, then :509 writes the file.
- reviewer.md:20 tells the reviewer to run `ls -R <dir>` and read `calls/`, `state.json` and `worker.log`. reviewer.md:49-53 and :57 require evidence from `calls/` for the whole-run scores.
- The only protection is ordering. reviewer.md:30-34 says score chapters first, do not open config.json, and read it after scoring. This does not stop the whole-run step from reading `calls/` raw. The exposure is in the whole-run step, which is also where the 5-chapter totals are scored.
- Other identity leaks in the same files, not masked by a model-name fix:
  - eval-client.ts:47 `model`, :48 `effortRequested`, :49 `maxTokens`, :50 `productTimeoutMs`. These are per-profile fingerprints.
  - eval-client.ts speed block and finish.ts:73 `speed.overall.source` ('ollama' vs 'wall') reveal local versus cloud. reviewer.md:57 requires the reviewer to report that `source`, so the instructions themselves expose it. qwen3.8-27b-en.md:180 shows `source: ollama`.
  - Model strings (models.ts:44 `qwen3.8:27b-mlx`, :52 `gpt-oss:20b`, :63 `exaone3.5:32b`, :75-78 `claude-haiku-5-5`, :86-89 `gpt-6-luna`) can be matched by grep.
- The author agent has a rule the reviewer lacks: eval/novel/agents/author.md:61 "Do not read `config.json`, `state.json`, `worker.log`, `calls/` ...". reviewer.md has no equivalent.
- The workflow masks only the path. .claude/workflows/novel-eval.js:72-77 makes the run dir opaque (`run-NN-<lang>`), and the reviewer prompt at :161-166 gives no blinding rule. The docs copy path at :77 contains the model id, but that is written after scoring, which is fine.
- No code exists for blinding. grep for "blind" or "redact" over eval/ and .claude/workflows returned nothing. No test covers it. The spec docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md has no blinding text (grep returned no hits).

## 4. Proposed acceptance criteria (metric, current value, target)
A. Leak scan of reviewer-visible input. Metric: count of model-id strings (the models.ts list plus provider tags) in every file the reviewer may read, after sanitising. Current: 1 per call file (model field), e.g. 32 call files in qwen ko (qwen3.8-27b-ko.md:11, calls/001~032); the count is unmeasured in the other runs. Target: 0 in a scan of the sanitized run dir, with the scan run in CI or as a test.
B. Self-reported exposure. Metric: reviews that disclose seeing `model` or `source` before scoring. Current: 4 of 6 (summary.md:268). Target: 0 of 6 in the next round, plus a required "blinding note" line that states what was visible.
C. Profile fingerprint. Metric: reviewer-visible fields that reveal local vs cloud (`speed.source`, `effortRequested`, `productTimeoutMs`, `maxTokens`). Current: all present in every call record. Target: 0 in the sanitized input. Note the conflict with reviewer.md:57. Either the orchestrator writes a neutral speed table (with a label such as "speed A/B") or the reviewer drops the source comparison. This is a design decision for the user.
D. Blind-versus-unblind effect (optional). Metric: |difference in Q mean| for the same run scored once with the raw calls and once with the sanitized calls. Target: under 0.25, my suggested figure. This needs an extra reviewer run per run.

## 5. How the harness can measure each
- A and C: add a `redactReviewerInput(dir)` step (new file, e.g. eval/novel/steps/blind.ts or next to finish.ts:123-158). It copies `calls/`, `run-summary.json`, `state.json`, `worker.log` into `<dir>/review-input/` with `model`, `effortRequested`, `maxTokens`, `productTimeoutMs` and `speed.source` removed or set to a constant. It must strip the model strings from `worker.log` and from `error.message` in calls (Ollama "model not found" text may include the tag, but this is unverified). Then point reviewer.md:20 and the reviewer prompt (novel-eval.js:161-166) at `review-input/` only. Add a test next to finish.test.ts that greps the output for every models.ts string. metrics.ts does not cover this and needs no change.
- B: the review header already has a blinding note (haiku-5.5-en.md:7, luna-6-en.md:229). Make it a required field in reviewer.md and grep it in the workflow.
- D: the workflow already accepts `args.rereview` (novel-eval.js:58), so a second review with the raw input could be run under a different folder name. This needs a flag for the input path.

## 6. Gaps
- No metric measures blinding. A leak scan, a self-report count and the profile-field count are all missing.
- eval/results is absent here, so the current per-run leak counts could not be measured. The values above are from the reviews.
- I did not verify whether the worker log or Ollama error text contains the model tag. That needs a real run directory.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 151 - backlog item 'Reviewer blinding' (ISSUE line 151 in section 3)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 265, 268 - four reviews admit model-field exposure; Sonnet self-bias note
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md` 8, 180 - exposure disclosure before scores (calls/025 printed whole); speed source ollama
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md` 7 - exposure disclosure (calls/*.json model field)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md` 353 - exposure disclosure (model field seen once)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md` 229 - exposure disclosure before scores
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 1-2, 11 - pilot rewrite; calls/001~032 listed; no blinding statement
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md` 9, 20, 30-34, 49-57, 62 - reviewer instructions: reads calls/ and worker.log; ordering-only blinding; speed source requirement
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 61 - author is forbidden to read config/calls; reviewer has no equivalent rule
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 36-50, 486, 509 - CallRecord fields model, effortRequested, maxTokens, productTimeoutMs; record written with model
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 156-162 - readCallRecords reads raw call files
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 69-75, 123-158 - run-summary speed.overall.source; finish writes run-summary and wiki-final
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 7-16 - RunConfig.modelId (config.json) and the run state
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 44, 52, 63, 75-78, 86-89 - provider model strings to grep for in a leak scan
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 72-77, 161-166, 227-230 - opaque run dir (path only); reviewer prompt has no blinding rule; reviewer model sonnet

Open questions:
- Should reviewer-visible speed use a neutral table (the orchestrator writes it) or should reviewer.md drop the ollama-versus-wall requirement? Either way the source field leaks local vs cloud.
- Does worker.log or the Ollama error text in calls error.message contain the model tag? Needs a real run folder to check (eval/results is not in this checkout).
- Should the blinded review input be a copy written inside the run folder (review-input/), or should the workflow pass that path to the reviewer instead of the run dir?

## survey:HX1:risks

HX1 (Reviewer blinding) survey. Read-only; nothing in the repo was changed.

## 1. Where the model identity leaks (verified)

- **calls/NNN-<task>.json carries `model` on every record.** `eval/novel/eval-client.ts:486` sets `model: this.profile.model`, and the file is written at `eval-client.ts:506-509`. The reviewer is told to use `calls/` as evidence (`eval/novel/agents/reviewer.md:49`). Two existing reviews admit reading it: `docs/eval/novel/2026-10-18/haiku-5.5-en.md:7` and `docs/eval/novel/2026-10-18/qwen3.8-27b-en.md:8`. I grepped only for these notes; the other four review files were not read, so their blinding status is unverified.
- **Profile-derived fields also identify the family, not just the name.** In the same record: `effortRequested` (`eval-client.ts:487`), `productTimeoutMs`, `maxTokens`, and `speed.source` (`'ollama'` for local, `'wall'` for cloud; see `steps/finish.ts:69-74`). Per-profile values are at `eval/novel/models.ts:43-100`: local profiles use effort `max` and cloud profiles use `high`, with different `timeoutMs`. Local and cloud are therefore separable even after `model` is masked.
- **config.json holds `modelId`.** `eval/novel/state.ts:7-16` (`RunConfig`) and `state.ts:58` (`CONFIG_FILE`). The reviewer is told to read it only at step 3 (`reviewer.md:30-34`), but this is prompt-only. The reviewer runs with the full filesystem, and `reviewer.md:9` says the run dir name is opaque, which is only partly true (see below).
- **Run dir name.** The workflow uses `run-NN-<lang>` with NN = index in `CANONICAL_MODELS` (`.claude/workflows/novel-eval.js:72-76`). The list is not in the reviewer's read set, but the order is guessable. `eval/novel/cli.ts:108` still defaults to `${seoulToday()}-${model}-${lang}` when `--dir` is omitted. The workflow always passes `--dir` (`novel-eval.js:119`), so this only leaks on manual `init`.
- **ctx-probe file.** `eval/novel/cli.ts:404` writes `ctx-probe-${o.model}.json` into `outDir` (default `RESULTS_DIR = eval/results/novel`, `cli.ts:37`). It is outside the run dir, but it sits in the same tree.
- **Not leaking (checked):** `metrics.ts` has no model field; `author-io.ts` has no model field; `state.ts` RunState has no model field (only RunConfig does); `steps/finish.ts` writes `wiki-final.json` and `run-summary.json` with no model name. `run-summary.json` does include the `speed` block with `source`, `byTask`, and `perChapterMs`.
- **Review copy.** `novel-eval.js:77` names the docs file `<model>-<lang>.md`, and `novel-eval.js:169-178` copies it after scoring. This is fine by design. `summary.md` reads all reviews by model name (`agents/summary.md:16-21`), and `reviewer.md:32,62` puts the model id in the header on purpose.
- **Prompt-only enforcement.** `agents/author.md:62` says authors must not identify the model. `reviewer.md:14` hard-codes `/Users/taehyeong/Documents/GitHub/DaeumHwa`, which does not match the workflow's `REPO`. This is portability, not blinding, but it is in the same file.

## 2. Minimal fix options

- **Option A (recommended): blinded review input.** Generate `<dir>/review-input/` in the finish step, or in the workflow before review (`novel-eval.js:227`, `reviewerPrompt`). It holds `chapters/`, `metrics/`, `author-decisions.jsonl`, `run-summary.json`, `reader/`, and a masked copy of `calls/` with `model` removed and the profile-derived fields handled per the open question below. `config.json` is excluded. The reviewer reads `review-input/` for scoring. It reads `config.json` by a path passed separately, only for the header. Keep the raw `calls/` for `resummarize` (`eval/novel/cli.ts:~420-447`) and for `speedSummary`.
- **Option B: strip at write time.** Remove `model` from `CallRecord` (`eval-client.ts:486`) and keep the id only in config.json. This breaks `resummarize` (no model needed there, so it is safe) and breaks any later "which model" lookup. Rejected unless the author wants no raw model id in calls at all.
- **Re-review.** `novel-eval.js:58` (`rereview`) and `:208-212` (existing review skip) mean existing contaminated reviews stay unless `rereview: true`. A masked copy of existing calls must be made first, or those runs must be rescored from a masked copy.

Minimal public interface (TypeScript signatures):

```ts
// eval/novel/blind.ts (new)
export type BlindedCall = Omit<CallRecord, 'model'>;
export function blindCallRecord(call: CallRecord): BlindedCall;
export function writeReviewInput(runDir: string, opts?: { omitProfileFields?: boolean }): { dir: string; files: number };
// eval-client.ts: unchanged writer; model stays in raw calls unless Option B is chosen.
// novel-eval.js: reviewerPrompt(dir, lang, inputDir) reads inputDir; config path passed separately.
```

## 3. Neighbouring tracks (by file overlap or dependency)

- **HX2 (English substitution table):** `eval/novel/localize/en-systems.ts`, `eval-client.ts` prepare (prompt swap, `eval-client.ts:20-21`). Shares `eval-client.ts`, which HX1 may touch at `:486-509`. Conflict risk on the record writer.
- **HX3 (author sees wiki):** `agents/author.md`, `author-io.ts`, `steps/interview.ts`. No file overlap with the reviewer path. Shares the rule "do not identify the model" (`author.md:62`).
- **HX4 (summary save, resume, copy retry, resummarize):** `novel-eval.js` copyPrompt and summary prompt, `cli.ts` resummarize, `steps/finish.ts`. Overlaps HX1 at `finish.ts` (if the blinded input is built there) and at `cli.ts` `resummarizeRun` (it reads `calls/` at `cli.ts:~428`). Serialize HX1 and HX4 on `finish.ts`.
- **F4 (local server serialization, effort switch):** changes the profile effort and timeouts in `models.ts`, which feed `effortRequested` and `productTimeoutMs` in calls. Any blinded field list must follow F4's changes.
- **F1/F2/F3 (proofread split, extract split, reader per persona):** each adds new per-call artifacts or new chapter/reader files that the reviewer reads (`steps/chapter.ts:135, 200-255, 369`). Any new file under the run dir must go through the same blinding (or into `review-input/` only).
- **A, E1, E2, C, D (draft-related):** all touch `steps/chapter.ts` attempt files (`chapters/NN.attempt-N.md`, `chapter.ts:135`), which the reviewer reads. They do not carry model ids today; keep it that way.
- **G1, G2, I, H (extraction, interview, continuity):** their calls are in `calls/`, so they get the same masking. `steps/interview.ts` writes pending/answer files.
- **B, J:** `src/ai/tasks/proofread.ts` uses `neutralizeTags` (`proofread.ts:40`) rather than `neutralizeDeep` like the other tasks. Not a blinding issue but an inconsistency J should note.
- **GUARDS (src/ai/guards):** no overlap with HX1 (harness only).

## 4. CLAUDE.md invariants that apply

- **Korean user-facing copy:** reviewer output is Korean for `ko` runs (`reviewer.md:24`). Blinding adds no product copy.
- **AppError codes / withAction / ActionResult / requireWorkRole:** not on HX1's path. The harness calls services directly (`steps/finish.ts:125-129`, `listEntries(ctx.db, ctx.actor, workId)`), so `requireWorkRole` still runs inside the services. Do not bypass it.
- **change_log in the same transaction / wiki rows archived, never deleted:** finish only reads wiki rows. HX1 must not write wiki tables.
- **AI never writes wiki tables directly:** unaffected.
- **Injection:** `TAG_DATA_RULE` (`src/ai/prompt-utils.ts:5`) and `neutralizeDeep` (`prompt-utils.ts:17`) apply to prompts the model reads. The blinded copy must keep `prompt` and `output` text unchanged, so evidence stays intact. Do not apply `neutralizeDeep` to the calls copy.

## 5. What could regress

- **Token limits:** product `maxTokens` are 16000 for proofread, chapter-extract, continuity-check, reader-sim, direction-advice (`src/ai/tasks/*.ts`); interview-question 2000; style-suggest 4000. Eval floor is `maxTokensFloor` 32000 (`eval/novel/models.ts`). Blinding must not alter `maxTokens` or `effortRequested` in the raw record, since `contextOverflow` (`eval-client.ts:~493`) and `resummarize` depend on them.
- **120 s product timeout:** `DEFAULT_AI_TIMEOUT_MS = 120_000` (`src/ai/run.ts:28`). Eval override `setAiTimeoutOverride` (`run.ts:~35-40`) is harness-only. `wouldTimeOut` is computed at write time (`eval-client.ts:490`), so it stays valid after masking. Do not recompute it from the masked copy.
- **Streaming:** `STREAM_AI_TIMEOUT_MS = 280_000` (`run.ts:30`). `streamText` relays chunks in `eval-client.ts` (ChunkRelay) and records `firstTokenMs`. HX1 should not touch the stream path.
- **Speed summary:** `speedSummary` (`finish.ts:32-78`) reads `speed.source` and `durationMs`. If the blinded input removes `speed`, the reviewer loses the 속도 evidence that `reviewer.md:57` requires. Keep `speed` in `run-summary.json`, or mask only `source`.
- **Tests:** `eval/novel/cli.test.ts` and `eval-client.test.ts` exist. I did not confirm whether any test asserts `record.model`; the grep returned only `initRun({ model: 'fake' })` call sites. Check before changing `CallRecord`.

## 6. Open questions for the author

1. Option A (blinded `review-input/` copy, raw `calls/` kept) or Option B (strip `model` at write time)?
2. Should profile-derived fields (`effortRequested`, `productTimeoutMs`, `maxTokens`, `speed.source`) also be masked? They reveal local versus cloud and effort tier. Masking them loses speed evidence (reviewer.md:57, summary.md:22).
3. Should the model id header be added by the workflow after scoring (so the reviewer never opens config.json)? This changes reviewer.md:30-34.
4. Re-review the existing 2026-10-18 runs after masking? That needs `rereview: true` (`novel-eval.js:58`). The two admitted leaks (haiku-5.5-en, qwen3.8-27b-en) are confirmed; the other four reviews are unverified.
5. Keep the default `${seoulToday()}-${model}-${lang}` dir name in `cli.ts:108` for manual init, or change it to the opaque form?
6. Fix the hard-coded `/Users/taehyeong/...` path in `reviewer.md:14` in the same change?

Files:
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md`  - Reviewer prompt; reads calls/ (line 49), reads config.json at step 3 (lines 30-34), hard-coded path (line 14)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - Writes calls/*.json with model (line 486), effortRequested, productTimeoutMs, speed (lines 486-509); wouldTimeOut at line 490
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - Writes wiki-final.json and run-summary.json; speedSummary (lines 32-78); candidate place for review-input/ generation
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts`  - RunConfig with modelId (lines 7-16), CONFIG_FILE (line 58)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - readCallRecords (around line 155); writeRunFile (line 145)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts`  - initRun default dir with model name (line 108); ctx-probe file with model name (line 404); resummarizeRun reads calls (around lines 420-447); RESULTS_DIR (line 37)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts`  - Profile effort, timeouts and model ids (lines 20-100); source of family-identifying fields
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js`  - Opaque run dir with CANONICAL_MODELS index (lines 72-77); reviewerPrompt (around line 161); reviewRun and rereview (lines 58, 208-247)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - Author must not identify the model (line 62)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/summary.md`  - Summary reads reviews by model name (lines 16-21) and speed block (line 22)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - Admits calls/*.json model field was visible (line 7)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - Admits it printed calls/025-draft-chapter.json with model field (line 8)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog A-J and harness items HX3/HX4 referenced in the task; this file does not mention blinding
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - DEFAULT_AI_TIMEOUT_MS 120000 (line 28), STREAM_AI_TIMEOUT_MS 280000 (line 30), setAiTimeoutOverride (around line 35)
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts`  - TAG_DATA_RULE (line 5), neutralizeTags (line 13), neutralizeDeep (line 17)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - maxTokens 16000 (line 38); uses neutralizeTags rather than neutralizeDeep (line 40)
- `/home/xogud/documents/github/DaeumHwa/src/server/action-helpers.ts`  - withAction wrapper (lines 12-18)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Design intent; section 9 review criteria (line 285)

Open questions:
- Option A (blinded review-input/ copy, raw calls/ kept) or Option B (strip model at write time)?
- Should profile-derived fields (effortRequested, productTimeoutMs, maxTokens, speed.source) also be masked, given they reveal local versus cloud and the effort tier?
- Should the model id header be added by the workflow after scoring, so the reviewer never opens config.json?
- Re-review existing 2026-10-18 runs after masking (rereview: true)? Confirmed leaks in haiku-5.5-en and qwen3.8-27b-en; the other four reviews were not checked.
- Keep the model name in the default dir name at eval/novel/cli.ts:108 for manual init, or make it opaque?
- Fix the hard-coded /Users/taehyeong path in eval/novel/agents/reviewer.md:14 in the same change?

## survey:HX1:specs

TRACK HX1 (reviewer blinding) - prior-spec constraints. Read-only survey; nothing in the repo was changed.

CURRENT LEAK (verified in code, cited):
- eval/novel/eval-client.ts:47 CallRecord has `model: string`; written at eval-client.ts:486 as `this.profile.model` (e.g. 'claude-haiku-5-5', 'gpt-6-luna', 'qwen3.8:27b-mlx'). Every calls/NNN-<task>.json carries it.
- eval/novel/steps/util.ts:155-162 readCallRecords returns full records, unmasked.
- Other call-record fields that still reveal local vs cloud (not names, but identity-adjacent): eval-client.ts:43-44 speed.source ('ollama' vs 'wall'), effortRequested, maxTokens, productTimeoutMs (eval-client.ts:36-54). Spec 12 item 1 (design spec line ~334) sets max effort for local, so effort alone does not name the model, but speed.source does separate local from cloud.
- Ollama error text may echo the model tag inside CallRecord.error.message (eval-client.ts:99 matches "model .*not found"); not verified whether the message carries the tag.
- Run-level files: config.json holds modelId (eval/novel/state.ts:9, 58; run.ts:93). state.json has no model. eval/novel/steps/finish.ts:151-156 and buildRunSummary (finish.ts:101-121) do NOT copy model into run-summary.json or wiki-final.json, so those are clean.
- RESUME.md (only for paused runs) is written by resume-note.md from a prompt whose `runs` JSON includes model (.claude/workflows/novel-eval.js:180-186; resume-note.md:13 example shows model). A run paused and later finished could keep a RESUME.md with the model name in the run dir, which reviewer.md:20 tells the reviewer to list (`ls -R <dir>`).
- worker.log is written by cli.ts:148-175 (stdio of the worker); content not checked for model strings.
- ctx-probe-<model>.json goes to eval/results/novel (cli.ts:402-404), outside run dirs, so the reviewer's `ls -R <dir>` does not reach it.
- cli.ts:108 default dir name embeds the model (`<date>-<model>-<lang>`), but the workflow always passes --dir (novel-eval.js:119), so runs use the opaque name.
- Workflow opaque run dir: novel-eval.js:72-75 (run-NN-<lang>); docs copy path with model name at novel-eval.js:77 is written after the review, which is fine.
- Reviewer reads calls/ on purpose: reviewer.md:20 (list of inputs), :49 (per-feature evidence from calls/). So the blinding rests on a prompt-only rule: reviewer.md:30-34 (score first, do not open config.json before step 3, do not put model id elsewhere). It does not mask the key inside calls/.
- Review evidence of the leak (docs): docs/eval/novel/2026-10-18/summary.md:268 says blinding was incomplete; four reviews admit seeing the `model` field: qwen3.8-27b-en.md:8, haiku-5.5-en.md:7, haiku-5.5-ko.md (line ~7 table, not re-read), luna-6-en.md (not re-read). Backlog item: docs/eval/novel/follow-up-ai-improvement.md:151 ("검토자 블라인드 보강").
- reviewer.md:14 hardcodes /Users/taehyeong/Documents/GitHub/DaeumHwa (not this machine's /home/xogud/... path). Aside, not a blinding item.

PRIOR SPEC / PLAN CONSTRAINTS:
- Spec docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md
  - §2 (lines 29-34): failure if the harness is non-rerunnable, if prompts/code change mid-run (breaks comparability), or if product behavior changes; harness-only code must have no effect on the app. -> any masking must stay in eval/novel or the workflow, not src/.
  - §6.1 item 3 (lines ~88-95): eval wrapper logs every call's input, raw output, parsing, tokens, time, retries, errors. Model is not listed among the required logged fields, but logging must stay complete.
  - §6.4 (line 172): author never knows which model is judged; no model name in pending/question files. Authors also get no model names (line 172 applies to author only; reviewer rule is not stated in the spec).
  - §8 (lines 271-283): config.json holds model; calls/ listed without a model field; `<model>-<lang>.md` review naming (line 281) and docs/eval/novel/<date>/ commit-only layout; raw records stay gitignored (line 283, and §12 item 8 line ~340).
  - §9 (lines 285-306): review criteria per feature; extraction scored against source text (line ~301). No blinding rule stated in §9.
  - §10 (lines ~308-319): product behavior unchanged; only one product touch point allowed (src/ai/run.ts timeout override); push to public repo needs user approval first.
  - §12 decisions (lines ~331-340): keep effort max for local (item 1), reviewer and author are Sonnet (item 2), fixed chapter instructions (item 3).
- Plan docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md
  - Lines 199-201: CallRecord interface in the plan includes `model: string` and `effortRequested`. Removing or renaming `model` from the record contradicts the plan's interface; a read-time mask (or a masked copy used only by the reviewer) does not.
  - Line 233: eval-client test (writes one call record per call) does not assert on model.
  - Lines 618-623 (author.md): author never sees model id; prompt passes only dir and lang.
  - Lines 625-633 (reviewer.md): reviewer learns model id from config.json only after scoring chapters; quotes mandatory; review writes `<model>-<lang>.md`.
  - Lines 648-651 (workflow): reviewer started without await after done; reviewer per run.
  - Line 7 and 22: model ids (qwen3.8-27b, gpt-oss-20b, exaone3.5-32b, haiku-5.5, luna-6, fake).
- MVP spec (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md) and interview reliability spec: no requirement touches eval blinding. Only product rules apply (CLAUDE.md: AI never writes wiki; services throw AppError; no product behavior change for harness code).

DECISIONS NOT TO RE-LITIGATE:
- Opaque run dir names (run-NN-<lang>), model only in config.json and the docs copy (novel-eval.js:72-77; docs/eval/novel/README.md:29).
- Scores are written before config.json is read (plan 633; reviewer.md:30-34).
- Author never sees model (spec 172; plan 623).
- Local models run at max effort, cloud at high (spec 12 item 1; docs README line ~24).
- Completed reviews are not rewritten unless args.rereview is true (novel-eval.js:58, 207-208).
- The 2026-10-18 run folders and their calls/ records are already on the author's Mac only and gitignored (docs/eval/novel/README.md:31). Changing the records already written would break comparability with the published reviews (spec §2 line 31-32).

WHAT A CHANGE WOULD CONTRADICT:
- Deleting or renaming CallRecord.model at eval-client.ts:47/486 (plan 201 interface).
- Altering effort/maxTokens/productTimeoutMs recording for the already-running 2026-10-18 runs (spec §2).
- Changing the review file naming or the docs copy path (spec §8 line 281).
- Any change under src/ (spec §2 line 34, §10).

OPEN QUESTIONS for the implementer:
1. Mask where: (a) a reviewer-only masked copy of calls/ made by finish.ts or a step before review, (b) a masking pre-step in novel-eval.js before reviewPrompt, or (c) change the record writer for future runs only? Option (c) changes the record format for new runs only and needs the plan interface updated.
2. Does the mask need to cover speed.source ('ollama' vs 'wall'), error.message echoes of the model tag, and RESUME.md and worker.log? Spec is silent; reviewer.md lists worker.log as an input.
3. Are the four already-published reviews' blindness gaps to be re-scored? The workflow does not redo reviews without rereview (novel-eval.js:58), and the spec does not say.
4. Confirm the hardcoded /Users/taehyeong path in reviewer.md:14 is a known local-only path before running on this machine.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Prior spec: §2 failure criteria (29-34), §6.1 harness components (81-115), §6.4 author rules incl. no model name (170-184), §8 record layout (271-283), §9 review criteria (285-306), §10 constraints (308-319), §12 decisions (331-340)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - Prior plan: CallRecord interface with model field (199-201), eval-client tests (233-234), author.md and reviewer.md rules (618-633), workflow outline (644-651)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md`  - Reviewer prompt: inputs incl. calls/ and worker.log (16-20), score-before-config order (28-34), model identity header (62), rules (64-69)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - Writes wiki-final.json and run-summary.json; reads calls from disk (151-156); buildRunSummary has no model field (101-121)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts`  - RunConfig.modelId (9) and config.json file name (58); RunState has no model
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - CallRecord with model (36-62; model at 47), record written with this.profile.model (470-509, model at 486); speed source field (27-44)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - readCallRecords reads full unmasked call records (155-162)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts`  - Default dir name embeds model (104-108); worker.log (148-175); ctx-probe output outside run dir (37, 402-404)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts`  - Model profiles and provider model strings (40-100), e.g. claude-haiku-5-5, gpt-6-luna, qwen3.8:27b-mlx
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js`  - Opaque runDir (72-75), docs review path with model (77), reviewer prompt and sonnet reviewer call (161-166, 227-230), resume prompt with runs JSON incl. model (180-186), reviewer not awaited (309-311), summary (188-200)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/resume-note.md`  - Writes RESUME.md in run dir; runs JSON example includes model (13, 34)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog item 'reviewer blinding reinforcement' (151)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Records that blinding was incomplete in four reviews (268)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - Evidence: reviewer saw a call record model field (lines 7-8)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - Evidence: model field visible while reading calls/ (line 7)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md`  - States folder names are opaque so author and reviewer do not know the model (29)

Open questions:
- Mask where: a reviewer-only masked copy of calls/ made in finish.ts or a pre-review step, a masking step in novel-eval.js before the reviewer prompt, or a change to the record writer for future runs (which would require updating the plan's CallRecord interface at plan line 201)?
- Should the mask also cover speed.source ('ollama' vs 'wall'), any model tag echoed in CallRecord.error.message, RESUME.md and worker.log? The spec is silent; reviewer.md lists worker.log as an input.
- Are the four already-published reviews with the blinding gap (summary.md:268) to be re-scored? novel-eval.js:58 re-reviews only when args.rereview is true, and the spec does not say.
- reviewer.md:14 hardcodes /Users/taehyeong/Documents/GitHub/DaeumHwa, not this machine's /home/xogud/documents/github/DaeumHwa. Confirm before any run here.

## survey:HX1:tests

TRACK HX1 test map (read-only survey, nothing edited). No masking or blinding code exists yet: `rg -i blind eval/novel` finds nothing in code; only docs mention it.

## 1. Where model names reach the reviewer before scoring

Reviewer read order is set in eval/novel/agents/reviewer.md:16-20 (criteria doc, spec section 9, then `ls -R <dir>` including calls/, author-decisions.jsonl, state.json, worker.log). The workflow passes only dir and lang (.claude/workflows/novel-eval.js:161-167). Run dir names are already opaque (novel-eval.js:72-75).

Leak carriers, with the write site:
- calls/NNN-<task>.json, field `model`: eval/novel/eval-client.ts:486 (`model: this.profile.model`), written at :507-509. Values are the profile.model strings from eval/novel/models.ts:44,55,66,78,89 (`qwen3.8:27b-mlx`, `gpt-oss:20b`, `exaone3.5:32b`, `claude-haiku-5-5`, `gpt-6-luna`).
- calls/*.json, `error.message`: eval/novel/eval-client.ts:463-469 (errorMessage copied raw). Ollama and SDK messages can contain the model id (test input at eval-client.test.ts:326 is `model 'gpt-oss:20b' not found`).
- state.json `failed[].message`: eval/novel/steps/util.ts:85 and :103-106 (fed from the same failure object). state.json `message`: eval/novel/run.ts:212-215 (the non-model branch saves `error.stack` raw).
- worker.log and status `message`: worker stdout and stderr go to worker.log (eval/novel/cli.ts:151-158). `main` prints raw error messages as JSON (cli.ts:552-555). `logTail` returns the raw log tail as the status message (cli.ts:175-188, 254).
- config.json `modelId`: eval/novel/run.ts:91-101 and eval/novel/state.ts:9. The reviewer reads it only after scoring (reviewer.md:30-34), so it is allowed by design. Keep it.
- ctx-probe-<model>.json: eval/novel/cli.ts:402-413, written to eval/results/novel (cli.ts:37), outside the run dir. Not reviewer input, but the file name carries the id.
- RESUME.md: novel-eval.js:180-184 passes `runs` (model names) to the resume agent. It is written only for runs that are not done, so the reviewer normally does not see it.
- Clean, with no model field: author-decisions.jsonl (eval/novel/author-io.ts:249-253), run-summary.json (eval/novel/steps/finish.ts:101-121), wiki-final.json (finish.ts:132-149), metrics/NN.json, chapters/NN.md.
- Residual fingerprints, not names: `speed.source` 'ollama' vs 'wall' (eval-client.ts:27-33, finish.ts:73), `contextOverflow` only on local profiles (eval-client.ts:496-498), `effortRequested`, `maxTokens`, `productTimeoutMs`. These reveal local vs cloud. Whether to mask them is a design decision.

Blocking leak in the reviewer's own reading list. Names appear in files the reviewer must read before scoring:
- docs/eval/novel-quality-criteria.md:134 (section 3.3, "Haiku와 Luna" as target line; the reviewer is told to read section 3.3).
- docs/eval/novel-quality-criteria.md:164 ("Sonnet이 같은 계열인 Haiku").
- docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:301 (section 9, "기준선: Haiku와 Luna"). Section 9 is in the reviewer's list.
- Spec section 5 (lines 60-73) names models but the reviewer is not told to read it.
Masking run files alone does not blind the reviewer. Either the two sentences move out of the read sections, or the reviewer gets a blinded copy of the docs.

Evidence that blinding already leaked: docs/eval/novel/2026-10-18/haiku-5.5-ko.md:353 (`model` field seen while reading calls/), haiku-5.5-en.md:7 (blinding note), qwen3.8-27b-en.md:7-8 (says "blind to the model" and then reads calls/025 with `model`), luna-6-en.md:229. Backlog item: docs/eval/novel/follow-up-ai-improvement.md:151.

## 2. Existing tests that touch this code

- eval/novel/eval-client.test.ts (vitest include eval/**/*.test.ts, vitest.config.ts:13): `spyClient` 31-58 (defaultModel 'spy-model'); `readRecord` 102-104; `QWEN`/`CLOUD` 77-78; `objectArgs` 88-100; call records 168-185 (asserts seq, task, usage, error null, no model); inner-args model assertion 117-124 (`model: QWEN.model` on the args passed to the inner client, not on the record); OLLAMA_STATS 567-575; classifyError 288-334.
- eval/novel/cli.test.ts: `callRecord` helper 31-56 (model 'fake'); resummarize 58-106 (line 105 asserts calls are byte-identical after resummarize); resummarize date folder 108-122; initRun 125-148 (config modelId 'fake', refuses another model 143-146); worker lock 150-168; formatStatus 170-197 (exact shape, message null); advance log-tail test 214-231 (asserts `status.message` contains 'line 25' and 'line 6').
- eval/novel/run.test.ts: makeRun 32-41 (modelId 'fake'); open 43-47 (openRun with `inner`); faultyClient 63-90 (wraps FakeAiClient, throws per task); "fake run reaches done" 154-195 (asserts run-summary.json, author-decisions); "model failure is recorded and skipped" 264-290 (AI_ERROR on chapter-extract, asserts state.failed steps and retried counts).
- eval/novel/state.test.ts: modelId 'fake' at :17; config round-trip 62-78.
- eval/novel/steps/finish.test.ts: only speedSummary 23-113 (no buildRunSummary or wiki test).
- eval/novel/author-io.test.ts: logDecision 225-234 (appends JSON lines).
- eval/novel/models.test.ts: profiles 7-21; createModelClient 23-39 (fake profile returns FakeAiClient).
- eval/novel/metrics.test.ts, bible.test.ts, worker-lock tests: unrelated.
- No test covers .claude/workflows/novel-eval.js or the agents/*.md prompts (outside vitest include).

## 3. Factories and FakeAiClient wiring

- src/test/factories.ts exports createTestUser (:20), createTestWork (:33), addTestMember (:50), createTestChapter (:59), createTestEntry (:87), createTestFact (:105), createTestThread (:132). The eval/novel tests do not import them. They use their own helpers and createRun/initRun.
- src/test/fake-ai.ts: `FakeAiClient` :19-65. `defaultModel = 'fake'` (:21). generateObject returns `model: args.model ?? 'fake'` (:31); streamText same (:37). `overrides` option (:10-13). Fixed outputs come from FAKE_OUTPUTS and FAKE_TEXT in src/test/ai-fakes/index.ts:14-29.
- Eval wiring: run.test.ts passes `FakeAiClient` as `inner` to openRun (run.ts:107-109), so the EvalClient still writes call records with profile.model. The fake author is eval/novel/fake-author.ts (used by run.test and cli.test with autoAuthor/fakeAuthor).
- src/test/setup.ts only imports jest-dom.

## 4. Exact test command

pnpm vitest run eval/novel/cli.test.ts eval/novel/eval-client.test.ts eval/novel/run.test.ts eval/novel/state.test.ts eval/novel/steps/finish.test.ts eval/novel/author-io.test.ts eval/novel/models.test.ts eval/novel/blind.test.ts --maxWorkers=2
(blind.test.ts is new. Typecheck filter: pnpm exec tsc --noEmit, then grep eval/novel.)

## 5. New test cases (proposed design: eval/novel/blind.ts exports a label constant, maskModelNames(text), blindRecord(record), blindTargets(dir); the mask list is every ModelProfile.model and every ModelId from models.ts; do NOT include 'fake')

blind.test.ts
1. maskModelNames removes every id and provider string. Input: text containing qwen3.8-27b, qwen3.8:27b-mlx, gpt-oss-20b, gpt-oss:20b, exaone3.5-32b, exaone3.5:32b, haiku-5.5, claude-haiku-5-5, luna-6, gpt-6-luna. Expected: no match (case-insensitive) remains.
2. maskModelNames masks the longer name first. Input: claude-haiku-5-5. Expected: no leftover 'haiku'.
3. maskModelNames leaves ordinary words alone. Input: "Luna is a ship captain; fake data; 루나". Expected: unchanged.
4. blindTargets never returns chapters/*.md, metrics/*.json, or author-decisions.jsonl. Input: a run dir with those files plus calls/ and state.json. Expected: only calls/, state.json, worker.log, run-summary-free targets.
5. blindRecord sets model to the label and keeps other fields. Input: a CallRecord with model 'claude-haiku-5-5' and error null. Expected: model === label; everything else deep-equal.
6. blindRecord masks the id in error.message. Input: error.message "model 'gpt-oss:20b' not found, try pulling it first". Expected: message has no 'gpt-oss'; error.kind unchanged.

eval-client.test.ts
7. writes the label, not the id, to disk. Input: EvalClient with QWEN, lang ko, objectArgs(). Expected: readRecord('001-proofread.json').model === label; no file in callsDir contains 'qwen3.8'.
8. still sends the real model to the inner client. Input: same. Expected: spy args.model === QWEN.model (guards eval-client.test.ts:117-124).
9. a failed call's error message on disk has no id. Input: spyClient({ error: AppError('AI_ERROR', 'AI 호출에 실패했습니다: qwen3.8:27b-mlx 응답 없음') }). Expected: record.error.message has no id; record.error.kind is still 'model'.
10. decision needed: in-memory client.records keep the real id. Input: same as 7. Expected: client.records[0].model === QWEN.model (only if the design blinds on disk alone).

run.test.ts
11. state.failed carries no id. Input: makeRun modelId 'haiku-5.5', open with faultyClient([{ task: 'chapter-extract', error: () => new AppError('AI_ERROR', 'AI 호출에 실패했습니다: claude-haiku-5-5 응답 없음') }]), autoAuthor. Expected: status 'done'; every state.failed message lacks 'claude-haiku-5-5'.
12. state.message from the non-model branch has no id. Input: a non-AppError Error whose message contains 'claude-haiku-5-5' thrown from a step. Expected: state.message lacks the id (covers run.ts:215 stack path).

cli.test.ts
13. log-tail status message has no id. Input: worker.log with 24 plain lines plus 'error: claude-haiku-5-5 not found' as the last line. Expected: status.message contains 'line 24' and not 'claude-haiku-5-5'.
14. blinding of old runs (only if a backfill is chosen). Input: calls/001 written with model 'claude-haiku-5-5'. Expected: after the backfill the model is the label. This CONFLICTS with the existing resummarize test (cli.test.ts:105), so a backfill must be a separate command, not resummarize.
15. workflow reviewerPrompt passes only dir and lang. Cannot be unit-tested as written (novel-eval.js is not importable). Either move prompt builders into eval/novel for a test, or check by hand.
16. reviewer-visible docs name no model id. Input: the section 3.3 text of docs/eval/novel-quality-criteria.md and spec section 9. Expected: FAILS today (criteria :134, :164; spec :301). This is a known failure to fix in the docs or the reviewer.md list, not in the test.

## 6. Existing tests that would break, and why

- None break if masking happens at write time (EvalClient.settle at eval-client.ts:456-509 and the error sites above), with the inner args left real (eval-client.test.ts:117-124 still holds).
- cli.test.ts:105 breaks only if resummarize rewrites calls/ (for example a backfill folded into resummarizeRun, cli.ts:423-448).
- cli.test.ts:112-146 and state.test.ts:17 break if modelId is removed from config.json (run.ts:91-101, cli.ts:112). Keep modelId in config.json.
- Any masking applied before classifyError (eval-client.ts:466, classifyError regex at :99 `model .*not found`) risks changing classification. Classify the raw error and mask only the stored copy. eval-client.test.ts:288-334 covers this.
- Adding 'fake' to the mask list would corrupt many run.test.ts and cli.test.ts assertions and the 'fake' substring in ordinary text. Keep it out.
- cli.test.ts:214-231 (log tail) still passes if masking only removes ids and keeps 'line N' text.
- finish.test.ts and the run-summary assertions (run.test.ts:166-176) are unaffected unless buildRunSummary changes.

## 7. Not found, stated plainly

- No blinding or masking code exists in eval/novel.
- No test references blinding, `model` masking, or the reviewer prompt.
- No test covers review.md generation or the workflow file.
- src/test/factories is not used by any eval test.

Files:
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md`  - reviewer read order and pre-scoring reading list (lines 14-34)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 36-60, 456-511 - CallRecord model field and error message on disk (lines 36-60, 456-511)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 101-158 - run-summary and wiki-final writers, no model field (lines 101-158)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 85, 103-106, 155-162 - state.failed messages and calls read (lines 85, 103-106, 155-162)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 89-104, 204-219 - config.json modelId write and pause message (lines 89-104, 204-219)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 148-188, 402-413, 423-448, 552-555 - worker.log stdio, status message, ctx-probe file, resummarize (lines 148-188, 402-413, 423-448, 552-555)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 11-100 - model ids and provider strings to mask (lines 11-100)
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 72-75, 161-167 - reviewerPrompt passes dir and lang only; opaque run dir (lines 72-75, 161-167)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md` 134, 164 - reviewer-read criteria doc naming Haiku and Luna (lines 134, 164)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 285-301 - spec section 9 naming Haiku and Luna (line 301)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.test.ts`  - existing call-record and inner-args tests (lines 31-58, 77-124, 168-185, 288-334)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.test.ts`  - existing resummarize, init, status and log-tail tests (lines 31-56, 58-122, 170-231)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts`  - faultyClient and step-machine tests (lines 32-90, 154-195, 264-290)
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` 10-65 - FakeAiClient (lines 10-65)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 14-29 - FAKE_OUTPUTS and FAKE_TEXT registries (lines 14-29)
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts`  - factories exported, unused by eval tests
- `/home/xogud/documents/github/DaeumHwa/vitest.config.ts` 13 - include pattern eval/**/*.test.ts (line 13)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 151 - backlog item G blinding (line 151)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md` 353 - evidence of blinding breach (line 353)

Open questions:
- Mask on write (EvalClient, calls/ and error messages) or in a separate blinding pass? The existing resummarize test (cli.test.ts:105) forbids touching calls/ there.
- Should provider fingerprints (speed.source, contextOverflow, effortRequested, maxTokens) be masked too, or only model names?
- The reviewer's pre-scoring docs (criteria section 3.3 and spec section 9) name Haiku and Luna. Move those sentences out of the read sections, or give the reviewer a blinded copy?
- Keep the real id on in-memory CallRecords (client.records) for the summary, or blind them too?
- Should old runs' calls/*.json be backfilled with a separate command, or left as they are?


# Summary agent (all runs of one date)

You write the cross-run comparison for one novel-eval date. It is written after every run has finished or paused.

## Inputs

You are given:

- `root`: the absolute path of the repository checkout the run belongs to.
- `date`: the run date (`YYYY-MM-DD`). Your output is `eval/results/novel/<date>/summary.md`. A later workflow step copies it into `docs/eval/novel/<date>/`.
- `runs`: a JSON list for this invocation. It may be empty. Each item has `model`, `lang`, `status`, `dir`, and either `reviewPath` (when the run is `done`) or `resumePath` (when it is paused or blocked).

Work from `root`. Every repo-relative path below (`eval/...`, `docs/...`) is relative to `root`: resolve it before you read or write. If `root` is not given, use the directory above the run directories in `runs` that contains `eval/` and `package.json`.

## Steps

1. Read every review document in `docs/eval/novel/<date>/` named `<model>-<lang>.md`. This covers the runs in `runs` and the runs from earlier invocations. Take from each: the per-chapter verdicts, the mean Q score, the TTCW pass count, the per-feature scores, the operations figures, and the weakness list. Also read every second review in `docs/eval/novel/<date>/second/` named `<model>-<lang>.md`: an independent second reviewer scored the same text, in the same format. Every review ends with a 'Verdict data' JSON block (`review-verdict-1`: failed thresholds, Q1 to Q9, verdict per chapter). Take the verdicts and Q scores from those blocks.
2. For each run in `runs` with no `reviewPath`, read its `resumePath` and note the status and the retry advice. Do not invent scores for it.
3. Read the criteria file `docs/eval/novel-quality-criteria.md` section 4 for the judge-bias caveat.
4. Write `eval/results/novel/<date>/summary.md` (create the folder if it is missing), in Korean. Include:
   - **10-run table**: model, language, status, verdict counts (publishable, excellent, not publishable), `2차 판정`, `2차 Q 평균`, mean Q score, TTCW pass rate (reference only). One row per review document found in step 1, and one row per other run in `runs`. Use the model ids as they appear in the review documents or in `runs`. `2차 판정` holds the second reviewer's verdict counts in the same order, or `-` when there is no second review. Write `판정 불일치` in that cell when the verdict of any chapter differs between the two reviews. Never average the two reviews and never pick one.
   - **2차 검토가 붙은 실행**: one row per run with a second review: model, lang, Q mean of both, failed thresholds of both, agree or `판정 불일치`, and one sentence naming the T or Q item that differs most, citing both review documents. Write `없음` if there is none.
   - **T2 건수와 말투 모순 수**: give each review's own T2 figure. T2 counts only bible and wiki contradictions (criteria section 3.5); style-card violations and in-chapter inconsistencies are listed apart. If a review counted them inside T2 (reviews before 2026-10-19 may), keep its figure and add `(문체 카드 위반 포함)` or `(내부 모순 포함)`. Also give the number of `Characterization (voice)` rows.
   - **Per-feature gaps**: for each feature (interview, extraction, continuity check, proofread, reader simulation and advice, style, operations), where each local model (qwen3.8-27b, gpt-oss-20b, exaone3.5-32b) falls short of the Haiku (haiku-5.5) and Luna (luna-6) results. Cite the review documents for the numbers. Where a cloud run is missing, say so.
   - **속도** (Korean, a table with one row per run): model, lang, generation tok/s (median over all tasks), prompt tok/s (local runs only; "-" for cloud), draft first-token time (median of the `draft-chapter` tasks, from `byTask`), and median time per chapter (median of the `perChapterMs` values). Take these from each run's `run-summary.json` `speed` block (`dir` in `runs`, or the run directory named in the review document). If a run has no `speed` block, write "no data". Add a note under the table: local speeds come from Ollama's internal timings, cloud speeds from wall-clock time including network and thinking, so they are not directly comparable.
   - **비용·시간·고칠 곳·요청 준수** (Korean, one row per run and chapter): model, lang, chapter `n`, and these columns, each from the run's `run-summary.json` or its review document:
     - 한 화 비용 (달러): `harness.chapters[].usd`, four decimals (for example 0.0273). Write `—` when `usd` is null. When `harness.chapters[].cacheRecorded` is `false`, append ` (캐시 미기록)` to the same cell (for example `0.0273 (캐시 미기록)`).
     - 본문 첫 글자 (초): `harness.chapters[].firstCharMs` divided by 1000.
     - 쓰기 시간 (초): `harness.chapters[].writeMs` divided by 1000.
     - 저장 뒤 시간 (초): `harness.chapters[].afterSaveMs` divided by 1000.
     - 계획 시간(초): `harness.chapters[].planMs` divided by 1000. `0` for runs with `--quick` or older runs.
     - 계획 수정(번): `harness.chapters[].planEdits` (the number of author notes on the plan card). `0` for runs with `--quick` or older runs.
     - 장면 분량 맞음(개/전체): `metrics/NN.json` `sceneLengths.within` over `sceneLengths.scenes`, written as a fraction (for example `3/4`). Write `—` when `within` is null (no plan).
     - 고칠 곳 (1,000자당): the chapter's `mustFix` from the review's 'Verdict data' block, divided by `chars` (the chapter's character count with spaces) times 1000.
     - 요청 준수: `directives.chapters[]` kept divided by (kept + broken), written as a fraction, for the chapters that have it.
       Write `—` in a cell when its block is absent (older runs). Do not compute a value the file does not hold.
   - **Korean versus English diagnosis**: the difference between each model's ko and en runs, and the likely causes, with evidence from the reviews. State which causes are only guesses.
   - **Improvement candidates**: ordered by expected effect, highest first. Cover prompts, splitting the work into smaller steps, self-review, code-side validation, and settings. For each, say the expected effect and the evidence.
   - **Paused or blocked runs**: each with its `RESUME.md` path and its status.
   - **Judge-bias caveat**: state that the scores come from Sonnet judging against the criteria (criteria section 4), that LLM judges agree only weakly with people on single works and better on model rankings, and that the Haiku and Luna runs are the target line, not a human baseline. A second review is a second sample from the same kind of judge; agreement does not remove self-bias.
5. Reply with one line: `wrote eval/results/novel/<date>/summary.md`.

## Runs with different chapter counts

- By user decision (2026-10-18), every run in this matrix runs 1 chapter. Read `chapters` from each run's `config.json` anyway. If a run ever has more chapters than the others, compare like with like: build every per-chapter comparison table (Q1–Q9 means, verdicts, threshold failures, extraction and continuity results) from the chapters all runs share, label it "N화 기준" with that shared count, and label any full-run figure with the run's own chapter count.
- With 1 chapter, direction advice (which appears from chapter 2 on) and character style suggestions (which run after chapter 2) do not occur. State this in the opening paragraph of `summary.md`. Do not score their absence as a failure.
- The matrix may be partial. The canonical set is qwen3.8-27b, gpt-oss-20b, exaone3.5-32b, haiku-5.5, and luna-6, each in ko and en (10 runs). For each canonical run with no review file `<model>-<lang>.md` in `docs/eval/novel/<date>/`, write "미실행 (나중에 이어서 돌림)" in the 10-run table and in the per-feature and speed tables. Base every comparison only on the runs that exist. Say which local models (qwen3.8-27b, gpt-oss-20b, exaone3.5-32b) are missing from the local-vs-cloud comparison.
- Some reviews were reused from pilot runs with identical settings. Each such review starts with a "> 참고:" line. Treat them as normal results.
- Speed and time per chapter are per-chapter figures, so they are comparable across runs whatever the chapter count.

## Rules

- Write only `eval/results/novel/<date>/summary.md`. Do not write under `docs/`. Do not edit any other file.
- Every number must come from a review document or a run file. If a number is missing, write "no data".
- Keep the table and the lists plain. No emojis.

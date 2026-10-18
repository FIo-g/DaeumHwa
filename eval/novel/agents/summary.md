# Summary agent (all runs of one date)

You write the cross-run comparison for one novel-eval date. It is written after every run has finished or paused.

## Inputs

You are given:

- `date`: the run date (`YYYY-MM-DD`). The output directory is `docs/eval/novel/<date>/`.
- `runs`: a JSON list. Each item has `model`, `lang`, `status`, `dir`, and either `reviewPath` (when the run is `done`) or `resumePath` (when it is paused or blocked).

Work from the repository root `/Users/taehyeong/Documents/GitHub/DaeumHwa`.

## Steps

1. For each run with a `reviewPath`, read the review document. Take from it: the per-chapter verdicts, the mean Q score, the TTCW pass count, the per-feature scores, the operations figures, and the weakness list.
2. For each run without a `reviewPath`, read its `resumePath` and note the status and the retry advice. Do not invent scores for it.
3. Read the criteria file `docs/eval/novel-quality-criteria.md` section 4 for the judge-bias caveat.
4. Write `docs/eval/novel/<date>/summary.md`, in Korean. Include:
   - **10-run table**: model, language, status, verdict counts (publishable, excellent, not publishable), mean Q score, TTCW pass rate (reference only). Use the model ids as given in `runs`.
   - **Per-feature gaps**: for each feature (interview, extraction, continuity check, proofread, reader simulation and advice, style, operations), where each local model (qwen3.8-27b, gpt-oss-20b, exaone3.5-32b) falls short of the Haiku (haiku-5.5) and Luna (luna-6) results. Cite the review documents for the numbers. Where a cloud run is missing, say so.
   - **Korean versus English diagnosis**: the difference between each model's ko and en runs, and the likely causes, with evidence from the reviews. State which causes are only guesses.
   - **Improvement candidates**: ordered by expected effect, highest first. Cover prompts, splitting the work into smaller steps, self-review, code-side validation, and settings. For each, say the expected effect and the evidence.
   - **Paused or blocked runs**: each with its `RESUME.md` path and its status.
   - **Judge-bias caveat**: state that the scores come from Sonnet judging against the criteria (criteria section 4), that LLM judges agree only weakly with people on single works and better on model rankings, and that the Haiku and Luna runs are the target line, not a human baseline.
5. Reply with one line: `wrote docs/eval/novel/<date>/summary.md`.

## Rules

- Write only `docs/eval/novel/<date>/summary.md`. Do not edit any other file.
- Every number must come from a review document or a run file. If a number is missing, write "no data".
- Keep the table and the lists plain. No emojis.

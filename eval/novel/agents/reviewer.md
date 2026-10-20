# Reviewer agent (one finished run)

You write the review document for one finished novel-eval run. The review is an evidence-based scoring of the run's chapters and of the run as a whole.

## Inputs

You are given:

- `dir`: a blinded copy of one run (for example `eval/results/novel/<date>/blind/run-03-ko`). It holds `chapters/`, `metrics/`, `calls/`, `reader/`, `author-decisions.jsonl`, `run-summary.json`, `state.json`, `worker.log`, `wiki-final.json`, and `reference/criteria.md` and `reference/spec-section-9.md`, and `reference/chapter-events.json` when the run gave only the first sentence of each chapter instruction (few-instruction runs; it holds each chapter's full bible instructions and `mustInclude` events). Model names, provider names, model-specific settings and speed numbers were removed or masked on purpose.
- `lang`: `ko` or `en`. This sets the language of the review document.

You write `<dir>/review.md`. A separate step adds the model header and copies it into `docs/` later; you do not write anywhere else.

Read these first:

1. `<dir>/reference/criteria.md` (the copy of `docs/eval/novel-quality-criteria.md`). Use sections 3.1 (thresholds T1 to T7), 3.2 (quality items Q1 to Q9 and their scoring anchors), 3.3 (publishable and excellent criteria), 3.4 (TTCW pass rate) and 3.5 (what T2 counts). Read section 4 for the scoring method and its limits.
2. `<dir>/reference/spec-section-9.md` (the copy of section 9 of the lightweight-model eval spec, review criteria). Its table says what to judge for each feature. Section 9 also says that extraction is scored against the source text the extraction read (the interview answers and the saved chapter text), not against the full bible.
3. The run directory. Run `ls -R <dir>` first and find the files yourself. Do not guess file names. Look for the chapter texts, the per-chapter metrics, the `calls/` records, `author-decisions.jsonl`, `state.json`, and `worker.log`.

## Language

- For `lang` = `ko`, write the whole review document in Korean.
- For `lang` = `en`, write the whole review document in English.
- Identifiers, file names and the metric names T1 to T7 and Q1 to Q9 stay as they are.

## Order of work (important)

1. Score the chapters first, from the chapter texts, the metrics and the author decisions.
2. Score the run as a whole (per-feature scores, operations, TTCW, weakness list).
3. Write the blinding note, then the verdict data block (see below).

Read nothing outside `dir`. Do not open `config.json`, any `docs/` file, any other run folder or any `eval/results/novel/<date>/run-*` folder. Do not try to identify the model. Model fields, effort, token caps and speed are removed on purpose; do not look for them elsewhere.

## What to write in `<dir>/review.md`

Use this structure. Headings in the document's language.

**Per chapter (one section per chapter)**

- T1 to T7: pass or fail for each, with the harness metric that decides it (for example `chars`, `targetChars`, `lengthOk`, `foreignRuns`, `metaHits`, `endsCleanly`, `hangulLeft`, `proofread` errors per 1,000 characters, `overlongParagraphs`). For T1, when `reference/chapter-events.json` exists, judge against that chapter's `mustInclude` list (each missing item is one missing event), not against the instruction sentence in `calls/`. Otherwise judge against the chapter instruction text in `calls/`. For the three-sentence paragraph rule, use the `overlongParagraphs` metric, not a hand count.
- Q1 to Q9: a score from 1 to 5 for each, with at least one quote from the chapter text for each score. Quotes are mandatory. A score without a quote is not accepted. Quote the Korean or English exactly. `metrics/NN.json` may hold `paragraphOpeners`: `counted` is the number of non-dialogue paragraphs, `top` lists the words that start four or more of them (Korean particles removed), and `repeated` is how many paragraphs start with such a word. Cite it when you mention repeated paragraph openers in Q7, instead of a hand count. It is context for the score, not a threshold; do not lower a score for it alone.
- Verdict: publishable (출판 가능 / publishable), excellent (우수 / excellent), or not publishable, using the section 3.3 rules.
- Continuity count for the chapter: each contradiction with the bible or the approved wiki, classified with the four ConStory categories in criteria section 3.5 (not Narrative & Style). Mark speech-register contradictions `Characterization (voice)`. Under the table, list apart: style-card violations (say how they were scored in Q6 to Q8), in-chapter inconsistencies (scored in Q2), and uncounted items with one line of reason each. These lists are not part of T2.
- Places the author must fix (heading `작가가 반드시 고칠 곳` for `ko`, `Places the author must fix` for `en`; criteria section 3.6): one place is one sentence or one paragraph that a working web-novel author would surely rewrite before publishing. Count each place once even if it has several problems. Count a contradiction with the bible or approved wiki, a wrong name, a broken or ungrammatical sentence (not a typo a spelling checker would catch), speech that does not fit the character's set voice, meta text or foreign script, a violation of the chapter instruction other than a missing `mustInclude` item (T1 counts those), a key moment summarized instead of shown, and a repeat of an earlier beat or sentence with no new information. Do not count taste-level style choices or things you would merely like better. List each place with the exact quote and a one-line reason, then write the count as `mustFix` in the verdict block.

**Whole run**

- Per-feature scores, 1 to 5, each with evidence from `calls/` and `author-decisions.jsonl`, plus what is missing and improvement candidates:
  - interview (questions useful, no repeats, stays on topic, settings extracted from the answers)
  - extraction (proposals versus the source text the extraction read: what is missing, what is wrong, name truncation, subject swaps, duplicate cards)
  - continuity check (ratio of valid to false flags, missed errors)
  - proofread (ratio of valid to invalid suggestions)
  - reader simulation and direction advice (grounded in the text, useful)
  - style proposal (captured the sample's style)
- Operations: failures, retries, `wouldTimeOut`, `contextOverflow`, `hangulLeft`, tokens per step, time per step.
- TTCW pass count (of 14 checks, as the criteria file describes), labeled as reference only.
- Five-chapter totals: mean Q score, publishable chapters count, and the continuity error count per 10,000 characters (Korean: characters; English: words, as section 3.3 says) (the T2 scope of criteria section 3.5 only).
- Weakness list with improvement candidates, each with the expected effect.

**Blinding note** (one sentence, before the verdict data): say whether anything in `dir` identified the model or the provider; if yes, say what it was. Write "none found" when nothing did.

### Verdict data

End `review.md` with one fenced json block under this heading (Korean heading: `### 판정 데이터`). It is the final block of the file. Keys stay in English. One object per chapter.

```json
{
  "schema": "review-verdict-1",
  "chapters": [
    {
      "chapter": 1,
      "thresholdsFailed": ["T2", "T3"],
      "qScores": [4, 3, 4, 3, 3, 4, 4, 4, 4],
      "verdict": "not-publishable",
      "mustFix": 4
    }
  ]
}
```

- `thresholdsFailed`: the T ids you marked fail, from T1 to T7 only. Use `[]` when none failed.
- `qScores`: nine integers, Q1 to Q9 in order, identical to your Q scores in the chapter section.
- `verdict`: `"publishable"`, `"excellent"` or `"not-publishable"`, identical to your prose verdict.
- `mustFix`: the number of places in the chapter's "Places the author must fix" list, an integer of 0 or more. Use `0` when the list is empty.
- No comments or other text inside the block. Write exactly one such block per review.
- A workflow step reads this block to decide whether the run needs a second review, so keep the keys and values exact.

## Rules

- Write only `<dir>/review.md`. Do not edit any other file.
- You may be the first or the second reviewer of this run, and you are not told which. Never open any other review: no `review.md` or `review-2.md` outside `dir`, nothing under `docs/eval/novel/`, and no other blind folder.
- Every score needs its evidence. Say so when evidence is missing instead of guessing.
- Keep it plain. No emojis.
- Your final reply is one line: `reviewed: <number of chapters> chapters`. Do not name the model in the reply.

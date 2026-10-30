Model: haiku-5.5 | Language: en

# Review: run-04-en

## Summary

This run produced no chapter text. The only draft step (`ch1:draft`) ran twice. Both calls used all 16,000 output tokens, were cut off, and saved nothing. `chapters/`, `metrics/` and `reader/` do not exist in the run folder, and `run-summary.json` records `"drafts": {"1": []}`. Because of this:

- Chapter 1 fails T1, T3 and T7 and is not publishable.
- Q1 to Q9, TTCW, the continuity count, the five-chapter totals, and the continuity check, proofread and reader simulation could not be scored. They are marked "not assessable" below and are not guessed.
- The interview and extraction ran normally and are scored from `calls/` and `author-decisions.jsonl`. The style proposal is scored with thinner evidence, because no call record exists for it.

Files read: `calls/001` to `calls/026`, `author-decisions.jsonl`, `state.json`, `worker.log`, `run-summary.json`, `wiki-final.json`, `reference/criteria.md`, `reference/spec-section-9.md`. There is no `reference/chapter-events.json`, so this is not a few-instruction run, and T1 is judged against the chapter instruction text in `calls/025` and `calls/026`.

## Chapter 1

### Evidence available

- Chapter text: none. `calls/025-draft-chapter.json` and `calls/026-draft-chapter.json` both have `"output": null` and `"error": {"kind":"model","message":"AI 응답이 너무 길어 중간에 끊겼습니다."}` (the response was too long and was cut off midway).
- Per-chapter metrics (`chars`, `targetChars`, `lengthOk`, `foreignRuns`, `metaHits`, `endsCleanly`, `proofread`, `overlongParagraphs`, `paragraphOpeners`): none, because no chapter was saved.
- `state.json` shows `"failed": [{"step":"ch1:draft","message":"AI 응답이 너무 길어 중간에 끊겼습니다."},{"step":"ch1:draft","message":"no draft text"}]` and `"retried": {"ch1:draft": 1}`. The plan then ran on to `finish` and the status is `done`.

### Thresholds

| id | Result | Deciding metric |
|---|---|---|
| T1 instruction events | fail | No text, so all 6 events in the instruction are missing (list below). The 4 standing rules (Yunseo's "Watch your step.", no "nod", no "for a moment", end on one line of dialogue) cannot be checked. |
| T2 bible contradictions | not assessable | No text. No contradiction is recorded and none is claimed. |
| T3 length | fail | Saved length is 0 characters against a required minimum of 12,100 (`<target_length>` in `calls/025`: at least 12,100, at most 14,520 characters including spaces). It fails under any English conversion ratio. |
| T4 non-story text | not assessable | No text. |
| T5 mixed language | not assessable | No text. The call record shows `hangulLeft: 0`, but there was no output to inspect. |
| T6 spelling | not assessable | No text. |
| T7 truncation | fail | Both draft calls hit the output cap (`usage.outputTokens` 16,000 = `taskMaxTokens` 16,000). Error: cut off midway. `run-summary.json` `outputCap.cutOff.byTask["draft-chapter"]` is 2. |

T1 events from the instruction in `calls/025` (all missing):

1. On the first spring morning Serin delivers laundry and climbs to the top of the nine-story tower for the first time.
2. Baek Jiwon spots her and chases her back down.
3. Do Yunseo appears as she goes down the stairs and hands her the sealed letter and the silver key left by Han Seoyeon.
4. Serin tucks the letter into her coat unopened and hangs the key around her neck.
5. Serin's left-handedness shows through what she does.
6. In the last scene the bell at the top trembles on its own without ringing.

### Quality scores Q1 to Q9

Not assessable. There is no chapter text, so no quote can be given, and the rules do not accept a score without a quote. The verdict data block must hold nine integers, so it carries 1 for every item. These 1s are placeholders for "no chapter delivered". They are not a rated quality of 1 and should not be averaged with scored chapters.

| Item | Score | Quote |
|---|---|---|
| Q1 to Q9 | not scored (block placeholder 1) | none possible |

### Verdict

Not publishable. T1, T3 and T7 fail, and there is no text to rate.

### Continuity count

Not assessable. No text exists, so the count is 0 recorded and none are claimed.

| ConStory category | Count |
|---|---|
| Timeline & Plot Logic | 0 |
| Characterization (including `Characterization (voice)`) | 0 |
| World-building & Setting | 0 |
| Factual & Detail Consistency | 0 |

- Style-card violations: none can be listed (no text).
- In-chapter inconsistencies: none can be listed (no text).
- Uncounted items: none.

### Places the author must fix

None. There is no text to fix, and a missing chapter is not a "place" (a missing `mustInclude`-type event is counted in T1). `mustFix` is 0.

## Whole run

### Per-feature scores

#### Interview: 3 of 5

What worked:
- 12 questions were asked and 12 answered, with no repeat flagged (`run-summary.json` `duplicateQuestions: 0`).
- Seven of the eight core topics were asked as setting questions: world rules, protagonist, main characters, central conflict, ending direction, style, main places. Every one of them produced approved wiki content (confirmed facts, an undecided fact for the ending, or the style card). The eighth, threads, was seeded by setup (four planned threads).
- Questions are specific and short. Example (`calls/012`): "What rule decides whether the Silver Key can open the tunnel beneath the Ashen Bell Tower?"

What did not:
- The first five turns (`calls/001, 003, 006, 008, 010`) were all "Chapter 1 opening". Three of those five were not answered. Turn 2's answer: "Whether she carries the laundry basket the whole way, or whether she can't get out of Jiwon's sight before Yunseo steps in, I haven't decided yet." Turn 3's: "I haven't decided that yet." Turn 5's: "I haven't decided that yet." The prompt says an undecided topic is closed, yet the generator kept making variants of the same topic.
- `calls/005` re-asked a closed topic: "should the orphanage get its own scene before Serin climbs the tower, showing Sister or staff sending her off with the laundry, or should the chapter begin directly on the stairs?" Turn 1's answer had already said "I haven't decided whether the orphanage gets a scene of its own before the climb." The question was rejected (it appears under `<rejected>` in `calls/006`) and replaced. That cost one extra call. "Sister" is also a role that appears nowhere in the wiki.
- `calls/003` joined two questions: "should Serin be carrying the laundry basket the whole way, and should she be unable to escape Jiwon's sight before Yunseo steps in on the stairs?" It has one question mark but two asks, against the "ask only one question" rule. `multiAsk: 0` in the summary does not catch it.
- The ending question (`calls/020`) was answered "I haven't decided the ending yet". That is a bible gap rather than a model fault, but the question could have been framed around what is decided.
- The harness reports `interview.undecided: 0` and `undecidedShare: 0` although four answers (turns 2, 3, 5 and the ending turn) say outright that the asked point is not decided. The harness metric does not see this form of non-answer.
- Nothing asked about speech or voice for Baek Jiwon or Yunseo's manner beyond the one line "barely talks", so the draft prompt has no per-character style card.

Missing: speech and manner of the supporting cast; any question after the core topics that moves to chapter 2. Improvement candidates are in the weakness list.

#### Extraction: 4 of 5

Scored against the source the extraction read (the question and answer in each `interview-extract` prompt), as spec section 9 says.

- 46 proposals in total (9 entries, 30 facts, 1 thread, 5 relations, 1 style card). The author decisions approved 43 and rejected 3.
- All 36 evidence strings (facts, thread, relations) are exact substrings of the answer text. I checked each one against the answer in its own prompt, with zero mismatches.
- No subject swaps, no duplicate cards, no titled or descriptive names ("Do Yunseo", not "swordsman Do Yunseo"). The relation directions are right (`Do Yunseo -> Han Seoyeon (debt)`, `Serin -> Baek Jiwon (opposes)`).
- Correct omissions: in `calls/009` the answer "Mother's sealed letter appears in chapter 1 and is resolved around chapter 8." returned nothing, because the thread "The seal on Mother's Letter" already exists. In `calls/024`, "rumor says a sealed tunnel lies beneath it" correctly did not become a new thread.
- A new thread was correctly created for "Why he goes so far to stop her hasn't been revealed yet." (`calls/019`, "Baek Jiwon's reason for stopping Serin").

Problems:
- 3 of 46 (6.5%) were noise that the author rejected. In `calls/002` and `calls/004` the model turned "I haven't decided" into undecided facts, for example "Serin may carry the laundry basket the whole way down the nine stories while Baek Jiwon chases her." with evidence "...I haven't decided yet." The author's reason: "It records an undecided question as a story fact, which the source text does not support". These never reached the wiki, but they cost review effort. Two of the three came from one answer (`calls/004`).
- Small omission: in `calls/007` the answer says the letter and key were "left by her mother, Han Seoyeon", but no fact records that the key was left by her mother. The wiki only has the `errand` relation, and the Silver Key summary says only "key handed to Serin by Do Yunseo on the tower stairs".
- Name: the card is "Serin", while the naming rule in the wiki is "Han Serin" (`namingRules`), and the card has `aliases: []`. The interview text only ever says "Serin", so this is not a truncation error by the model, but the wiki ends up with a naming rule that does not match any card.

Output size is fine: the largest extraction used 2,685 tokens against an 8,000 cap.

#### Continuity check: not assessed

No `check` or `continuity` call exists. The plan listed `ch1:check` and `ch1:continuity`, but no chapter was saved, so nothing ran.

#### Proofread: not assessed

No proofread call or metric exists for the same reason.

#### Reader simulation and direction advice: not assessed

No `reader/` folder and no call.

#### Style proposal: 3 of 5 (thin evidence)

- `wiki-final.json` holds an AI-created style card named "style" (`createdByType: "ai"`, created 12:56:02, approved in the author decisions). `calls/` has no record of a call that made it: between `calls/022` (the style question) and `calls/023` there is no extract call. How the card was produced cannot be checked.
- Content: tone "Close third person, not first person." and three rules that are the sentences of the author's answer ("It's written in third-person limited from Serin's point of view.", "Dry and calm, building mood through senses like fog, sound and cold.", "Emotions are shown through gestures rather than stated, and paragraphs are kept short."). It matches the answer faithfully and adds nothing to it.
- It overlaps the setup card "Work style" (same viewpoint, same tone, same short-paragraph rule). Both appear in the draft prompt's `<style_cards>`. The AI card also loses the concrete rule "No paragraph runs longer than three sentences." and has empty `examples`, so it captures less of the sample than the setup card. The "Speech" slot holds a narration description.

### Operations

| Item | Value |
|---|---|
| Calls | 26 (13 interview-question, 11 interview-extract, 2 draft-chapter) |
| Failures | 2, both `ch1:draft`, output cap reached (`outputCap.cutOff.total: 2`) |
| Retries | 1 (`retried: {"ch1:draft": 1}`). The retry used a byte-identical prompt, system text, effort ("high") and cap (16,000), so it re-ran the same conditions. |
| `wouldTimeOut` | 0 |
| `contextOverflow` | 0 |
| `hangulLeft` | 0 |
| Timeouts | 0 |

| Step | Calls | Tokens | Time |
|---|---|---|---|
| interview-question (effort low, cap 2,000) | 13 | 43,702 | 38.5 s total, 1.9 to 5.5 s each |
| interview-extract (effort medium, cap 8,000) | 11 | 52,535 | 91.5 s total, 4.7 to 17.7 s each (the long ones are `calls/002`, `calls/024`) |
| draft-chapter (effort high, cap 16,000) | 2 | 38,880 | 83.0 s and 79.3 s |

- The two failed drafts are 32,000 of 135,117 tokens (24%) and 162.3 of 292.2 s (56%) of the model time in this run, and produced nothing.
- Target text size is about 12,100 to 14,520 English characters, which is a few thousand tokens. A 16,000-token cap is several times that, so the cap was reached for some other reason than the visible chapter length alone. Timing fits that: in `calls/026` the first token came at 71,555 ms of 79,280 ms, and `calls/025` has `firstTokenMs: null`. This is consistent with most of the budget being used before or outside the visible text, but the call record stores no output, so what the 16,000 tokens contained cannot be checked.
- The failure message shown to the author is Korean in an English-language run (`AI 응답이 너무 길어 중간에 끊겼습니다.`). The second failure reads "no draft text", which differs from the error text stored in `calls/026`.

### TTCW (reference only)

Not assessable (0 of 14 can be judged). There is no story to read.

### Five-chapter totals

- Mean Q score: not available.
- Publishable chapters: 0 of 1. The run plan contains one chapter, not five.
- Continuity errors per 10,000 words (T2 scope): not available. The run delivered 0 words.

### Weakness list and improvement candidates

| # | Weakness | Evidence | Candidate | Expected effect |
|---|---|---|---|---|
| 1 | The only draft step produced no text, twice | `calls/025`, `calls/026`: `outputTokens` 16,000 = cap, `output: null`; 2.7 min of model time for nothing | Lower the draft task's effort or turn off its extended reasoning, so the budget goes to visible text | Likely removes the cause (first token at 71.6 s of 79.3 s). Largest effect; without it the run has no scoreable output. |
| 2 | The retry changes nothing | Both draft calls have identical prompt, effort and cap | On a cut-off, retry with a different setting (lower effort, higher cap) or write the chapter scene by scene with `draft_so_far` (about 1,500 characters per scene, 8 scenes) | A second attempt that can succeed; scene-sized calls need a small fraction of the cap. |
| 3 | A cut-off draft is thrown away and not recorded | `output: null` in both records | Keep the partial text in the call record, and offer "continue from here" | Makes the failure diagnosable, and a partial chapter could still be scored and continued. |
| 4 | The run ends as `done` with later steps silently skipped | `state.json` `status: done`, `cursor: 9`; no proofread, check, continuity, proposals or reader calls | Mark a run with an empty draft as failed or incomplete in `run-summary.json` | Prevents an empty run from being read as a complete one in comparisons. |
| 5 | Interview wastes turns on one topic | 5 straight "Chapter 1 opening" questions, 3 unanswered, 1 rejected re-ask, 1 double question | After one "not decided" on a story topic, move to a setting or different chapter topic (code check against closed topics); reject joined questions | About 3 of 12 turns saved; room for supporting-cast voice questions. |
| 6 | Harness does not count non-answers | `undecided: 0` with four explicit "I haven't decided" answers | Count answers that state the asked point is undecided | Honest interview metrics. |
| 7 | "Not decided" turned into undecided facts | `calls/002`, `calls/004`: 3 of 46 proposals rejected | Prompt line plus a code filter: if the evidence only says "haven't decided", return no fact | Removes about 6% of proposals and the review cost. |
| 8 | Duplicate and weaker style card | "Work style" and "style" both in `<style_cards>`; rule "three sentences" lost | Merge into the existing whole-work card instead of adding one | Shorter prompt, no conflicting rules. |
| 9 | Future-story facts carry no chapter range | `wiki-final.json`: "Serin finds traces of her mother beneath the bell tower." has `validFromPosition: null` and is in the chapter 1 draft context (a risk, not an observed error; no text exists) | Ask for or infer a target chapter for future facts | Lower risk of late-plot facts in early chapters once drafting works. |
| 10 | No character style cards | Draft prompt has only two "[whole work]" cards, though the system prompt says dialogue follows each character's card | Add a voice question per main character in the interview | Evidence for Q5 and the "Watch your step." rule later. |

## Blinding note

Nothing in `dir` identified the model or the provider (all `model` fields read `[masked]`; the only brand names are benchmark references in `reference/criteria.md`), so: none found.

### Verdict data

```json
{
  "schema": "review-verdict-1",
  "chapters": [
    {
      "chapter": 1,
      "thresholdsFailed": ["T1", "T3", "T7"],
      "qScores": [1, 1, 1, 1, 1, 1, 1, 1, 1],
      "verdict": "not-publishable",
      "mustFix": 0
    }
  ]
}
```

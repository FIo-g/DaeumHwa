# Novel eval review: run-05-en

- Run directory: `eval/results/novel/2026-10-18/run-05-en`
- Review language: en
- Model and language (from `config.json`, read after the scores were written): model id `luna-6`, language `en`, 1 chapter, 12 interview questions, up to 3 draft attempts, commit `3c8b902`
- Scope: chapter 1 only. This run was set to one chapter (`state.json` plan: setup, interview, ch1:draft, ch1:proofread, ch1:check, ch1:continuity, ch1:proposals, ch1:reader, finish). Items that start at chapter 2 (direction advice, style proposal) did not run and are not scored.
- Criteria: `docs/eval/novel-quality-criteria.md` sections 3.1 to 3.4 and 4; `docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` section 9.
- Quotes below are copied from `chapters/01.md`. That file is identical to `chapters/01.draft.md` and `chapters/01.attempt-1.md`: there was one attempt, and the author accepted none of the four proofread suggestions.
- Scores are one reviewer's judgment on one chapter. Per criteria section 4, chapter-level absolute scores are reference only; the TTCW count is reference only.

## 1. Chapter 1

### 1.1 Thresholds (T1 to T7)

Harness metrics (`metrics/01.json`): `chars` 9,888; `targetChars` 12,100; `lengthOk` true; `foreignRuns` []; `metaHits` []; `endsCleanly` true; `paragraphs` 146; `avgParagraphChars` 68; `dialogueLineRatio` 0.384. My own count: 1,843 words.

| id | result | deciding metric and evidence |
|---|---|---|
| T1 instructed events | pass | 6 of 6 `mustInclude` events present, 0 missing. Details below the table. |
| T2 setting contradictions | pass | 0 contradictions with bible facts or the approved wiki. Deviations that are noted but not counted are in 1.4. |
| T3 length | pass | `chars` 9,888 against `targetChars` 12,100, `lengthOk` true. The English rule is minimum 0.8 x target = 9,680 and maximum 1.3 x target = 15,730. The chapter is 81.7% of target and clears the minimum by 208 characters. |
| T4 non-body text | pass | `metaHits` is empty. The first line is body text ("On the first morning of spring, the fog lay low enough to hide the tower’s upper windows."). No title, explanation, or restated instruction. |
| T5 language mixing | pass | `foreignRuns` is empty (no Hangul runs in the English text). The text contains only the curly quote characters beyond ASCII. |
| T6 spelling | pass | `proofread` returned 4 suggestions, all `kind` "awkward", none spelling, spacing or grammar. My own read found no spelling, spacing or grammar error: 0.0 errors per 1,000 characters. Upper bound if all 4 suggestions were counted as errors: 4 / 9.888 = 0.40 per 1,000 characters. Either way at or below 1. |
| T7 truncation | pass | `endsCleanly` true. The last sentence is complete: "The air inside the tower remained motionless." |

T1 evidence by event:

1. First climb to the top of the nine-story tower on the first morning of spring: `On the first morning of spring, the fog lay low enough to hide the tower’s upper windows.`; `She had been inside before. Never to the top.`; `The ninth landing opened into the bell chamber.`
2. Baek Jiwon chases her away: `“Who let you up here?”`; `“Go down.”`; `His steps followed close behind.` The chase is written as a close-following escort rather than a pursuit, but the event is there.
3. Yunseo hands her the sealed letter and silver key: `He reached inside his coat and took out a sealed letter, then a silver key threaded onto a narrow cord.`
4. Letter tucked away unopened, key hung on her neck: `Serin slid the letter into the inside of her coat without opening it.`; `She slipped it over her head and let the silver rest against her chest.`
5. Left hand: `Serin took the letter and key with her left hand.`; `Serin tucked it farther under the cloth with the back of her left hand.`
6. Bell trembles without ringing: `Then the bell trembled.`; `No sound came from it.`

### 1.2 Quality scores (Q1 to Q9)

**Q1 Immersion and fun: 4**
- Strong, specific sensory staging. `A drop of water fell from one of the linen folds and struck the stone.` / `The sound reached farther than it should have.` The stairwell, landings and fog are easy to picture, and the confrontation lines pull the reader forward (`“The tower is not a room.”`).
- Held back from 5 by the opening: the first third is a floor-by-floor walk. `On the seventh floor, the air smelled faintly of dust.` / `On the eighth, a narrow window showed only fog. There was no view to mark how high she had come.` Next-chapter pull comes mostly from the last image and the unopened letter, and is moderate. The reader simulation rated 3, 4, 3, 3 and flagged the same climb as slow.

**Q2 Coherence and structure: 4**
- Causes follow: she is sent to the tower, goes up, is caught, meets Yunseo on the way down, receives the items, leaves. Her reason for climbing is given and in character: `She could have turned around there. She did not.`
- Small seams keep it from 5. The matron's order `And bring the basket back.` is never resolved (the chapter ends with `Baek moved the basket a little farther from the threshold with his boot.`). `Baek passed her on the last flight and reached the ground floor first.` is hard to picture in a stairwell described as narrowing at the fifth landing. Yunseo gives away the key's rule unprompted, which is a chapter 3 beat (see 1.4). A short as-you-know exchange: Serin says `“She went beneath the tower three years ago.”` and Yunseo answers `“I know.”`

**Q3 Showing (scene versus statement): 4**
- Key moments are staged as scenes and emotions are never named, as the work style card asks. `Serin did not take them yet.` / `Serin’s left hand slid along the iron. Her right arm tightened around the basket.`
- Some telling remains in narration and dialogue: `Three years was a long time to send something. The paper could not explain the delay.` and the backstory recited aloud, `“She was studying the tower’s seal when she went down. She never came back.”` answered by `“I know that too.”` The key rule is stated outright by Yunseo (`“The key has a rule.”`) instead of being found out.

**Q4 Character and emotional line: 3**
- Serin is consistent and recognisable (blunt, practical), but the emotional core of the chapter, receiving her missing mother's things, has almost no interior or gestural reaction. The wiki holds "resents her mother somewhat" and "acts calm on the surface"; the surface is rendered, the resentment is not. `Serin slid the letter into the inside of her coat without opening it. She pressed the flap shut with her left thumb and checked that the seal remained whole.`
- One good subtext beat: Serin asks `“Did she say she was coming back?”` and Yunseo answers `“No.”` Baek and Yunseo stay functional (gatekeeper, courier).

**Q5 Character voice: 4**
- Serin is blunt and retorts: `“I understand that you don’t want me above the lower floor.”`, then after Baek's `“That is not what I said.”` she answers `“It is what I heard.”` Baek speaks in rules and imperatives: `“An open door is not permission.”`; `“Now,” Baek said.` Yunseo is clipped and plain: `“I’ll be brief,” Yunseo said.`; asked `“Was there anything else?”` he answers only `“No.”`
- Baek and Yunseo overlap at times (both formal and flat), so names could not always be hidden. Chapter 1 had only the work style card in context, no character voice cards, so the bible's voice notes (Baek courteous with sarcasm and "young miss", Yunseo "a word or two") could not be followed and are not counted against the model.

**Q6 Pacing and web-novel form: 3**
- Form is right for mobile: 146 paragraphs, average 68 characters, 38% dialogue lines, and 145 of 146 paragraphs are within the card's three-sentence limit (the bell-chamber paragraph has four).
- Event pacing is not: the tower is reached at 26% of the text and Baek's first line comes at 30% (character offset 3,071 of 10,178, line breaks included). The opening repeats the same beat: `The delivery would take longer if she went up. It would take longer if she came down again.` The descent also cycles through landings. The reader simulation named the same lines.

**Q7 Prose: 4**
- Clean, exact, restrained, no purple writing and no stock heart-pounding phrases. `The tower did not require an answer from her, and she had no spare hand for one.`
- A few stiff or vague lines: `The way down was still unknown to her. It seemed reasonable to learn the building above ground first.` and `She held the objects out to receive them.` ("objects" is vague). The left-hand motif is stated about a dozen times (`left` appears 15 times in 1,843 words), which reads as mechanical in places.

**Q8 Originality and cliche: 3**
- Some particular details: the running joke about which floor, `“The tower is not a room.”`, and `Serin did not reply. There was no point asking how many rules a door could break by remaining open.`
- Set dressing is stock (`The bell hung above her, dark with age`, `a travel-stained coat and carried a sheathed sword`), and two key images are close paraphrases of the style card's example: `She kept her left hand on the railing as she climbed. The iron felt cold enough to pull the heat from her palm.` (example: "Serin braced her left hand on the railing. The iron was cold enough to stick to her palm.") and `Its lower rim shivered once against the gray light. No sound came from it.` (example: "the bell upstairs shivered once. It did not ring."). The full-moon key is a recognised fantasy constraint, though it comes from the bible.

**Q9 Ending and pull to the next chapter: 4**
- The chapter's events close (items received, she leaves the tower) and ends on an unexplained image: `Then the bell trembled.` The open questions (what the letter says, where the lock is, why the bell moves) are live.
- The very last line is flat: `The air inside the tower remained motionless.`

Mean Q score: (4 + 4 + 4 + 3 + 4 + 3 + 4 + 3 + 4) / 9 = 33 / 9 = 3.67.

### 1.3 Verdict

**Not publishable (borderline).** T1 to T7 all pass and no item is 2 or below, but the mean 3.67 is under the 3.75 line. It misses by 0.08, and one extra point on Q6 or Q8 would give 3.78 and flip the verdict, so this is a close call on a single reviewer's scores. Not excellent: the mean is under 4.25 and Q4 is 3 (needs 4 or more; Q3 and Q9 are 4).

### 1.4 Continuity count

Counted contradictions with the bible or approved wiki: **0**.

| ConStory category | counted |
|---|---|
| Timeline and Plot Logic | 0 |
| Characterization | 0 |
| World-building and Setting | 0 |
| Factual and Detail | 0 |
| Narrative and Style | 0 |

Noted but not counted:

- N1, plan order (category if counted: Timeline and Plot Logic). Yunseo states the key's rule in chapter 1: `“It will only enter its lock on a night when the moon is full,” he said.` In the bible this is a chapter 3 beat (Yunseo passes on Han Seoyeon's words; the chapter ends with nine days left to the full moon). Not counted because `f-key-moon` has no validity range and the rule was already approved into the wiki from the interview, so no stated fact is contradicted. The draft task also tells the model to write only the instructed events, so this is an instruction-following lapse. If counted it is 1 in 1,843 words, 5.4 per 10,000 words.
- N2, style card (category if counted: Narrative and Style). The bell-chamber paragraph runs four sentences against the work style rule "No paragraph runs longer than three sentences." Criteria Q6 says paragraph length is a scoring factor, not a threshold, so it is scored under Q6.
- N3, internal detail slips, no bible conflict: `Her left shoulder had begun to ache.` while the basket is carried in the right hand and the left hand rests on the rail; the basket order is never resolved; Baek passing Serin on a narrowing stair.
- N4, voice notes (see Q5): not counted because no character voice cards were in context.

## 2. Whole run

### 2.1 Per-feature scores (1 to 5)

| feature | score |
|---|---|
| Interview | 3 |
| Extraction (interview and chapter) | 3 |
| Continuity check | 3 (low confidence) |
| Proofread | 3 |
| Reader simulation | 4 |
| Direction advice | not run (starts at chapter 2) |
| Style proposal | not run (needs chapters 1 and 2) |

**Interview: 3** (`calls/001` to `023` odd numbers; `author-decisions.jsonl` lines for `interview_answer`)
- Evidence for. All eight core topics were touched in 12 questions (protagonist, main characters, world rules, places, central conflict, threads, ending, style). Questions are one or two sentences and tied to a gap in the wiki, with a rationale (for example call 009: "What is the silver key’s one firm rule: what can it open, and what condition or cost limits its use?"). No off-topic question. `focusCounts` is `{setting: 12}`.
- Evidence against. Two questions repeated an earlier topic and the author answered both from the same answer-bank entry: call 003 asked about Serin's resentment again (answer text repeats call 001's answer, `bankKeys` protagonist-goal both times), and call 013 asked about the Silver Key again (answer repeats call 009, `bankKeys` rule-key both times). Three more questions asked for things the bible has not decided and got "I haven't decided that yet" in whole or in main part: call 017 (ending), call 019 (smuggling ship), call 023 (what the letter reveals). In total 10 of 12 answers contained an "undecided" clause, and answers 9, 10 and 12 (in order) were almost entirely "undecided". It never switched to story focus, so it never asked how to open chapter 1, although the system prompt says to do so once the core setting is covered.
- Missing. Baek Jiwon as a character (only through the conflict question), the supporting cast (Yun Haeok, Gwak Duseok), the orphanage, the debt thread, the tunnel thread, and how characters speak. The chapter 1 draft therefore had no voice cards (Q5 note).
- Improvement candidates. Feed the topics that came back "undecided" into `<rejected>` or `<covered>` so they are not asked again; require a new sub-topic when the same topic is revisited; once the eight core topics are touched, move to story focus or to uncovered cards (supporting cast, voices). Expected effect: fewer wasted turns (up to 5 of 12) and a fuller wiki for the draft.

**Extraction: 3** (`calls/002` to `024` even numbers for the interview, `calls/028` for the chapter; `wiki-final.json`)
- Volume: 39 interview proposals (38 approved, 1 rejected) and 20 chapter proposals (20 approved).
- Accuracy is good. 0 name truncations (the source text only ever says "Serin", so the card "Serin" is not a truncation), 0 subject swaps in card summaries or relations, relation directions correct, and thread handling correct (call 028 marks "The seal on Mother's Letter" as planted against `T1`; call 020 correctly adds nothing for the already-existing smuggling-ship thread). Evidence quotes: 43 of 46 are exact substrings of the source; the 3 misses are clause-split or punctuation-changed quotes (call 008 twice, call 028 once).
- Problems.
  - Duplicate facts: the extractor only sees card names (`<known>`) in the interview, and a 15-fact list in the chapter call that left out the Silver Key facts, so it re-proposed what already existed. The Silver Key ended with 6 facts for 2 truths (moon rule and scratch each 3 times); Serin has a near-duplicate pair (F2 and F3, resentment) and an overlapping pair (F1 and F4, goal); the relation list has "owes a debt to" and "debt" for the same pair. About 9 of the 58 approved proposals are redundant.
  - Duplicate rule cards from the chapter extraction: "Full-Moon Lock Rule" repeats the Silver Key fact, and "Upper Chamber Access Rule" repeats the Baek Jiwon fact.
  - Thin or oblique card summaries: Cheonghae Harbor is "A harbor Do Yunseo is from." and Han Seoyeon is "A person to whom Do Yunseo once owed a debt." (the second does not say she is Serin's mother until a later fact). Each defines the subject through another character.
  - One wrong status: call 008 marked "The market only opens during the day." as `assumed` though the author stated it flatly.
  - One misattached fact: "Han Seoyeon asked Do Yunseo to bring the letter and key to Serin." is filed under Mother's Letter instead of Yunseo or Seoyeon.
  - Omissions against the source text: the interview answer in call 008 says a sealed tunnel is rumoured beneath the tower, which was not recorded as a fact (the thread already exists, so the fact is the only place for it). The chapter text shows the key worn at the neck, Serin living at the orphanage (Yunseo asks `“Do you live at the orphanage?”` and Serin answers `“Yes.”`) and left-handedness; none was extracted.
- Author-side note (not the model's fault): the first-round proposal for the card "Serin" was rejected as a "cut name", then the identical card was approved one round later; and the author approved duplicate facts and the two duplicate rule cards. Those approvals put the duplicates into the final wiki.
- Improvement candidates. Pass the existing facts (or a per-subject digest) to `interview-extract` and lift or rank the 15-fact cap in `chapter-extract`; drop proposals whose normalised text already exists; tell the extractor to attach rule-like properties of an existing item as facts on that item, not as new rule cards; add "possessions worn or carried" and "where a character lives" to the fact examples. Expected effect: about 15% fewer proposals, no duplicate cards, better recall of state facts.

**Continuity check: 3, low confidence** (`calls/027-continuity-check.json`)
- Result: `{"issues": []}`. I found no setting contradiction in the chapter, so there are 0 false flags and, as far as I can tell, 0 missed errors. Valid-to-false ratio is undefined (0 / 0).
- Why only 3: a clean chapter cannot test recall. The `<wiki>` block in the prompt held only 4 entries (Serin, Do Yunseo, Baek Jiwon, Han Seoyeon), leaving out the Silver Key and the Ashen Bell Tower although the chapter is about both, so the check could not have caught an error about them. It also did not notice the early reveal of the key rule (N1), which is outside its remit (no wiki conflict).
- Improvement candidate: build the wiki excerpt from every card whose name appears in the manuscript. Test recall with a chapter that has planted errors. Expected effect: recall on key and place facts.

**Proofread: 3** (`calls/026-proofread.json`, `chapters/01.proofread.json`)
- 4 suggestions, all `awkward`: "damp at the folds" to "damp in the folds"; "Serin’s left hand left the basket handle before her right did." (repeated "left"); "She held the objects out to receive them."; "The mark of the seal was unbroken." The author declined all 4, ruling that none is a spelling, spacing or grammar error. Valid errors found: 0 of 4. By my own read the text has no real errors, so the ideal output is an empty list.
- Assessment: 2 are harmless preference edits (1 and 4; 4 also shifts meaning slightly), 2 are reasonable optional style edits (2 flags a real clumsy repeat, 3 flags a vague phrase, though its replacement adds "her left hand"). No false claim of an error and no change of voice. Quotes are exact and offsets are consistent. Noise, not harm.
- Improvement candidate: tell the task to return an empty list when there is no real error, and to keep `awkward` for clear problems. Expected effect: fewer author rejections.

**Reader simulation: 4** (`calls/029-reader-sim.json`, `reader/01.json`)
- Grounded in the text: 9 of 11 quoted moments are exact; the 2 misses ("The bell trembled." where the text has "Then the bell trembled.") were dropped from the saved `reader/01.json`, which therefore holds 9 moments. Specific, accurate observations: the stair-and-basket beats repeat (`reader-binge`, `reader-casual`; this matches my Q6), the seal and "three years of thinking about what lay beneath" are unexplained for a new reader (`reader-novice`), and the full-moon key is a familiar constraint (`reader-genre`).
- Personas differ in tone and rating (3, 4, 3, 3; drop-off risk medium, low, medium, medium). Advice is usable (compress floor transitions; surface the key sooner; add a concrete clue about the seal), though somewhat generic. It missed the early reveal of the key rule.

**Direction advice and style proposal:** not run in this one-chapter run. No evidence, no score.

### 2.2 Operations

- Failures 0 (`failed: []`), retries 0 (`retried: {}`), pauses 0, draft rewrites 0 (one attempt, `usable` true, author quality 4), `wouldTimeOut` 0, `contextOverflow` 0, `error` null on all 29 calls.
- `hangulLeft` 3, all in call 025 (`draft-chapter`): the prompt line `<chapter>Chapter 1 (새 회차)</chapter>` is not covered by the English substitution table. It had no visible effect on the output (`foreignRuns` empty).
- Margin to the product timeouts: `draft-chapter` 115,983 ms of 280,000 (41%); `chapter-extract` 80,763 ms of 120,000 (67%, the closest to the limit; a longer chapter could exceed it); every other call under 25% of 120,000.
- Reasoning cost is large for structured tasks (estimate: output tokens beyond the visible JSON are hidden reasoning). `draft-chapter` produced 10,489 output tokens for about 2,400 visible tokens; `chapter-extract` produced 7,915 output tokens for a JSON of roughly 1,200 tokens (my estimate); `continuity-check` produced 506 for an empty result.

Tokens and time per step (from `run-summary.json`):

| step | calls | tokens (in / out where one call) | total ms | mean ms |
|---|---|---|---|---|
| interview-question | 12 | 23,910 | 70,994 | 5,916 |
| interview-extract | 12 | 26,120 | 133,767 | 11,147 (max 23,155) |
| draft-chapter | 1 | 12,103 (1,614 / 10,489) | 115,983 | 115,983 |
| proofread | 1 | 4,483 (2,579 / 1,904) | 23,111 | 23,111 |
| continuity-check | 1 | 4,223 (3,717 / 506) | 7,185 | 7,185 |
| chapter-extract | 1 | 11,899 (3,984 / 7,915) | 80,763 | 80,763 |
| reader-sim | 1 | 5,411 (2,839 / 2,572) | 27,389 | 27,389 |
| total | 29 | 88,149 | 459,192 (7.7 min) | |

Interview prompts grew from 760 to 2,122 input tokens as the wiki filled.

### 2.3 Speed (`speed` block of `run-summary.json`)

- `source`: **wall**. These figures are wall-clock time including network and any hidden thinking. They are not comparable with `ollama` figures, which use the engine's internal timings.
- Overall median generation speed: 76.76 output tokens per second.
- Median prompt tokens per second: not available (null on every task; wall-clock timing cannot separate prompt processing).
- Median first-token time of streams: 92,084 ms (one stream, `draft-chapter`; non-stream calls have null).
- By task, median output tokens per second: interview-question 62.28; interview-extract 92.23; draft-chapter 438.89; proofread 82.39; continuity-check 70.42; chapter-extract 98.00; reader-sim 93.91.
- The `draft-chapter` figure is not a real streaming rate. It is `outputTokens / (durationMs - firstTokenMs)` = 10,489 / 23.9 s, but those output tokens include the reasoning produced during the 92 s before the first visible token. Counting only visible tokens (about 2,400, my estimate) gives roughly 100 tokens per second. The other tasks divide by the whole call duration, so they include thinking time.
- Total call time per chapter (`perChapterMs`): chapter 1 = 254,431 ms (draft 115,983 + proofread 23,111 + continuity 7,185 + chapter-extract 80,763 + reader 27,389). `continuity-check` and `chapter-extract` started 15 ms apart, so wall time for the chapter was shorter than this sum.

### 2.4 TTCW (reference only; chapter 1 treated as the whole work)

**Pass count: 5 of 14 (35.7%).** Reference values: New Yorker 84.7%, Claude v1.3 30.0%, GPT-4 27.9%. Not a threshold or target.

| check | result | note |
|---|---|---|
| Narrative pacing | fail | Floor-by-floor climb stretches time; descent repeats it. |
| Scene versus summary | pass | Scenes carry the chapter; summary is brief. |
| Language and literary devices | fail | Plain and accurate; little sophisticated metaphor or idiom. |
| Ending | pass | Natural and set up; closes the chapter's events. |
| Understandability and coherence | pass | Clear throughout. |
| Perspective and voice | pass | Baek's rule-bound stance is rendered convincingly in dialogue; single POV. |
| Emotion (interior and exterior) | fail | Interior reaction almost absent. |
| Structure (surprising and appropriate turns) | fail | Turns follow the instruction order; Yunseo's arrival is signalled. |
| Theme and content (original idea) | fail | Premise is the fixed bible and is genre-standard. |
| Thought (no cliches) | fail | Full-moon key and sealed letter are familiar; sample echoes. |
| Form (original) | fail | Conventional. |
| World and setting (sensory) | pass | Fog, cold iron, dust, the sound of one drop. |
| Character (complexity) | fail | Baek and Yunseo are functional. |
| Rhetorical complexity | fail | Some subtext in the door and permission exchange, little beyond it. |

### 2.5 Totals (chapter 1 only; the run was one chapter)

- Mean Q score: 3.67.
- Publishable chapters: 0 of 1 (borderline, see 1.3).
- Counted continuity errors: 0 in 1,843 words, 0.0 per 10,000 words. With the plan-order deviation N1 counted, 1 in 1,843 words is 5.4 per 10,000 words.

### 2.6 Weakness list and improvement candidates

Ordered by expected effect on the next run.

1. **Slow opening, repeated beats (Q1, Q6).** Conflict starts at 30% of the text; the climb and descent reuse the same basket and railing moves. Candidate: add to the draft task "the first conflict within the first 15% of the text; compress transit to a few sentences; do not repeat a beat". Expected: Q6 from 3 to 4 (about +0.1 on the mean, which alone flips this verdict) and lower drop-off risk in the reader simulation.
2. **No interior reaction at the emotional beat (Q4, TTCW emotion).** Candidate: have the draft task show how the protagonist reacts at the key moment through one gesture or object, and ask for the wiki's emotional facts (resentment, calm surface) to appear in action. Expected: Q4 from 3 to 4, which also removes one barrier to "excellent".
3. **Later-chapter beat leaked (N1).** The draft pulled a chapter 3 reveal in from the wiki. Candidate: put planned chapters of facts and threads into the draft context and add "do not reveal what is planned for later chapters". Expected: removes plan-order deviations.
4. **Under length, thin margin on T3.** 81.7% of target, 208 characters above the minimum. Candidate: give the target also as a word range, or a scene list with a length per scene. Expected: fewer T3 failures across runs.
5. **Lifts from the style example (Q8).** Candidate: tell the draft task to use the example for tone only and not to reuse its images or sentences. Expected: Q8 up by about half a point.
6. **Duplicate and oblique extraction output.** Candidates as listed under Extraction (known facts into the extractor, dedupe, facts instead of new rule cards, fuller examples of state facts). Expected: about 15% fewer proposals, cleaner wiki.
7. **Interview wastes turns.** Candidates as listed under Interview. Expected: up to 5 of 12 questions saved for uncovered topics and story focus.
8. **Continuity check sees too few cards.** Candidate: include all cards named in the manuscript. Expected: higher recall on item and place facts.
9. **Hidden reasoning cost.** `chapter-extract` took 80.8 s and 7,915 output tokens for a short JSON, 67% of the product timeout on a 9,888-character chapter; `draft-chapter` waited 92 s for the first token. Candidates: lower effort for extraction tasks, or split the extraction by output type. Expected: timeout margin for longer chapters.
10. **Proofread noise.** Candidate: allow an empty list and restrict suggestions to real errors. Expected: fewer rejected suggestions.
11. **Localization gap.** Add `새 회차` to the substitution table (`hangulLeft` 3). Expected: `hangulLeft` 0.
12. **Reader-quote filter.** Two valid-looking quotes were dropped for case ("The bell trembled." against "Then the bell trembled."). Candidate: match case-insensitively. Expected: minor.

### 2.7 Limits of this review

- One chapter, one reviewer. The verdict is close to the line and rests on single-point judgments.
- Continuity recall and proofread recall cannot be measured on this chapter because it has no planted errors and no real spelling errors.
- Direction advice and style proposal have no evidence in this run.
- The `model` field in `calls/*.json` was visible to me while I read call metadata for timings, before the scores were written. I scored chapter 1 from the chapter text, the harness metrics, the bible and the author decisions, and did not open `config.json` until after the scores were written.

Model: haiku-5.5 | Language: en

# Review: run-04-en (English, one chapter)

Scope: this run finished the interview and chapter 1 only (`state.json` plan: setup, interview, ch1:draft, ch1:proofread, ch1:check, ch1:continuity, ch1:proposals, ch1:reader, finish). So the "five-chapter totals" below cover one chapter. `reference/chapter-events.json` does not exist, so T1 is judged against the chapter instruction text in `calls/025-draft-chapter.json` (the author note plus the four-scene plan).

Method: the chapter text `chapters/01.md` (identical to `01.draft.md` and `01.attempt-1.md`) was scored first, using `metrics/01.json`, `calls/`, `author-decisions.jsonl` and the wiki in `wiki-final.json`. Then the whole run was scored. I also compared the first draft (`calls/025` output, 9,591 characters) with the final text, to see which step introduced which problem.

---

## Chapter 1

### Thresholds T1 to T7

| id | result | deciding evidence |
|---|---|---|
| T1 instruction events | pass | All plot events of the instruction are in the text: laundry errand ("The laundry was supposed to stop at the lower door."), climb to the ninth floor and the bell rope, the warden confronts her and sends her down, Do Yunseo hands over the sealed letter and silver key on the stairs ("Han Seoyeon."), letter tucked into the coat unopened ("She did not open it."), key hung at the neck ("tied it snug at the back of her neck"), the bell trembles without ringing. Left-handedness is shown once explicitly ("She walked to the rope and closed her left hand around the loop.") and by the basket carried on the right arm. The time anchor "On the first morning of spring" is not in the text at all (no "spring", no "morning"; grep returns nothing). I treat that as a time setting, not a plot event, and count it under "Places the author must fix" instead. A reviewer who counts it as a missing event would fail T1 and make the chapter not publishable. This is the one borderline call in this review. |
| T2 settings contradiction | pass | 0 contradictions with the bible or approved wiki (see the continuity section). Names are exact (Baek Jiwon, Han Serin, Do Yunseo, Han Seoyeon, Cheonghae Orphanage, Cheonghae Harbor, Ashen Bell Tower); no "Baek Jiyeon" or "Han Saerin". |
| T3 length | pass | `chars` 12,782; `targetChars` 12,100 (range 12,100 to 14,520 in the draft prompt); `lengthOk` true. Scene lengths 3,678 / 3,295 / 3,270 / 2,530 against 3,025 each (`within` 4). |
| T4 non-story text | pass | `metaHits` []. No title, no commentary. The `***` lines are the scene breaks the instruction asked for. |
| T5 language mixing | pass | `foreignRuns` []; `hangulLeft` 0. |
| T6 spelling | pass | The saved proofread is empty (`chapters/01.proofread.json` is `[]`; `calls/033` returned no suggestions). My own read found no spelling or spacing errors. Spelling is consistently British ("grey", "colour", "had got"). 0 errors per 1,000 characters. |
| T7 truncation | pass | `endsCleanly` true. The last line is a complete quoted question. |

`overlongParagraphs` is 2. Both are dialogue-and-tag paragraphs where the quoted fragments push the sentence count to four: `"One," she counted. Her voice returned dull, as though the stone had gulped down the rest of it. "Two. Three."` and `"The rules did." A pause, and the lantern light dipped as he stepped down. "Before my time. Before yours, certainly."`. This is not a threshold. It is used in Q6.

### Quality scores Q1 to Q9

`paragraphOpeners` (metrics): 62 non-dialogue paragraphs, 44 start with a repeated word; top words "she" 14, "serin" 12, "the" 12, "he" 6. Other metrics: 124 paragraphs, average 103 characters, dialogue line ratio 0.476, `sampleCopyHits` 1.

| Q | score | evidence (quotes from the chapter) |
|---|---|---|
| Q1 Immersion and fun | 4 | The first line is a concrete hook: "The laundry was supposed to stop at the lower door." The warden scene has real tension: "Everything on this stair is for me, young miss." The last line pulls the reader on: "Then what's moving it?" Held back by stalled stretches in which the same atmosphere returns: "Her breath hung in front of her face and would not drift away." Four reader personas in `reader/01.json` all rated it 3; the commuter persona saw high drop-off risk. |
| Q2 Coherence and structure | 3 | Cause and effect mostly hold (she disobeys, is caught, is handed the letter). But the stair geometry breaks. Baek Jiwon is below her: "The lantern stopped at the sixth turn, and the man holding it looked up." and "Then his gaze slid past her, down toward the dark at the foot of the tower". Yet in the next scene he is behind her: "Serin went down first. Baek Jiwon came after her at the same careful pace, the lantern swinging at his side". Also "She had taken three steps when a light moved in the fog below." followed by "Serin stopped on the seventh landing." from the ninth floor. Also, from near the middle of the stair she can "no longer see the bell room at all" yet at the end "Far above her, through the grey, the bell shivered once in its frame" and "the rope overhead swung". |
| Q3 Showing | 4 | Key moments are scenes. The reaction to her mother's name is physical: "Serin's grip on the railing clenched until her knuckles blanched and the iron dug into her palm." Her search for her mother is shown by what she looks for: "She had expected a door. She had expected a mark on the stone, a scratch, a folded scrap, anything her mother might have left before she turned back toward the lower door." Deductions: "He had not raised his voice once. That made it harder to argue with him, and she disliked that more than the order itself." names the feeling, and "Serin had wanted a few minutes alone with the bell. She had got about two, and the rest had gone to his lantern and his rules." states the stake the preceding dialogue already showed. |
| Q4 Character and emotion | 4 | Serin's feeling has causes: the empty top ("Come on," she said. "Show me something."), the evasions, then the mother's name and "Is she alive?". Her defiance is characterised by action: "Serin did not look back. She had decided on the hill road that looking back was how people got sent home." Baek's dry rule-keeping has some depth: "I have answered for a great many things, young miss." Weak spot: after the biggest reveal the interior reaction is only "She did not open it." and Do Yunseo is only a messenger. |
| Q5 Character voice | 4 | Three clearly different voices. Serin: "Why do you care?" She asked it the way she asked everything, straight out. Baek: "Then you broke two rules instead of one. I'll only have to send one of them home." Yunseo: "What does it open?" / "A lock." / "Which lock?" / "Full moon." Baek always uses "young miss" and sarcasm, as set. Not a 5 because Yunseo's set "polite speech" is not visible in bare lines like "Keep it." and "Read the letter.", and in the last scene Serin and Yunseo both speak in very short lines (Serin: "Which lock?", Yunseo: "A lock."). |
| Q6 Pace and rhythm | 3 | Short paragraphs and dialogue-driven (0.476), good for a phone. But the first scene runs 3,678 characters before another person appears: "The first flight was easy. The second was not." Scenes 2 and 3 repeat one pattern (he evades, she presses): "That's not an answer." then "That isn't an answer either." The flight is stretched: "Two steps at a time. The basket swung against her hip, and her thighs burned from the climb." `overlongParagraphs` 2 (dialogue fragments only). |
| Q7 Sentences | 4 | Precise and often vivid: "Fog came in through the arrow slits and settled on the steps like wet wool", "The voice came up the stairwell polite and dry, the way a clerk reads out a bill." Flaws are repetition and padding from the expansion step: "The iron railing met her fingers, and she kept them clamped there. The metal was so cold it pulled at her skin whenever she lifted her fingers, so she kept them down." The breath image appears three times ("Her breath hung in front of her and did not drift." / "Her breath hung in front of her face and would not drift away." / "Each breath she took came out white and hung in front of her before the damp pulled it apart."). Seven "as if / as though" similes. 44 of 62 paragraph openers repeat (see metric above), context only. The author's banned phrase appears: "She stopped for a moment with her forehead almost touching the cold stone". |
| Q8 Originality | 4 | The plot beats are the genre template (orphan, missing mother, warden, messenger, moon-bound key), which is allowed. The details are the work's own: "from the orphanage gate it looked like a finger pointing at nothing", "His hair was cut short and neat, as if he had combed it in the fog.", "The fog stood in the open arches as if someone had told it to wait." Stock moments remain: "He turned and went back into the fog, and the mist closed behind him without a sound." The closing image still sits near the style sample ("the bell shivered once in its frame. It did not ring."; `sampleCopyHits` 1), though the instruction itself asks for that beat. |
| Q9 Ending and hook | 5 | The handoff is closed ("Watch your step," he said.), then the instructed uncanny beat ("Far above her, through the grey, the bell shivered once in its frame."), then a single line of dialogue that leaves a question: "Then what's moving it?" This meets the style card ("End each chapter on a question or tension") and the author's request to end on one line of dialogue. The "Then" has no spoken antecedent, a small blemish. The perception problem is counted in Q2 and in the fix list, not here. |

Mean Q = (4+3+4+4+4+3+4+4+5) / 9 = 35 / 9 = 3.89. No score at 2 or below.

### Verdict: publishable

T1 to T7 all pass, mean 3.89 is at least 3.75, no item at 2 or below. Not excellent: the mean is below 4.25. "Publishable" is the section 3.3 rule only. The chapter still needs the 7 fixes listed below, and the T1 borderline above could reverse the verdict.

### Continuity count (T2 scope, criteria 3.5)

| # | quote | wiki or bible basis | ConStory category |
|---|---|---|---|
| none | - | - | - |

Total T2 count: 0. Checked against the facts in `wiki-final.json`: Serin sixteen, blunt, left-handed, orphanage, mother gone three years; Baek Jiwon warden, "young miss", rules, inner iron door; Do Yunseo swordsman from the harbor, dagger in the right hand ("his right hand resting on the dagger at his belt"), word-or-two polite speech; Silver Key full moon and one thin scratch ("A single thin scratch crossed the shaft just above the teeth."); nine-story stone tower on the hill. The planned-only threads (tunnel, silver debt, smuggling ship, night fog scene) were not leaked into the text.

Style-card violations (not in T2; scored where noted):
- Author request "Never use the phrase 'for a moment'": "She stopped for a moment with her forehead almost touching the cold stone" (Q7). It came in with the expansion step (absent from the first draft). "for a long moment" near the end is not the banned phrase and is not counted.
- Style card "Do not name emotions": "she disliked that more than the order itself" (Q3).
- Style card "No paragraph runs longer than three sentences": `overlongParagraphs` 2, both dialogue-fragment paragraphs (Q6).
- Sample copy: the closing bell lines and "The metal was so cold it pulled at her skin" sit near the style card's example sentences (Q8).
- Met: "End each chapter on a single line of dialogue"; Do Yunseo ends his conversation with "Watch your step"; no "nod".

In-chapter inconsistencies (not in T2; scored in Q2):
- Baek Jiwon is below Serin (sixth turn, gaze past her down the stairs), then behind and above her.
- "She had taken three steps" from the ninth floor, then "the seventh landing".
- She cannot see the bell room from mid-stair, then sees the bell shiver and the rope "overhead" swing.
- Serin names Yunseo as "From the harbor." with nothing in the scene that tells her.

Uncounted items:
- "the city below" for the view from the window: the wiki calls the place a harbor town; weak ground.
- Do Yunseo's "polite" register in bare English imperatives ("Keep it."): cannot be judged in lines this short; weak ground for Characterization (voice).
- Baek Jiwon "chases her back down" (wiki F): in the text he follows at an unhurried pace; loose reading of "chases", weak ground.
- Morning fog while the wiki says fog "rolls into the harbor every night": lingering fog does not contradict it.

### Places the author must fix

1. Opening (first line and the paragraphs after it). Quote: "The laundry was supposed to stop at the lower door." The instruction opens "On the first morning of spring" and the interview answer says the same; the text never gives the season or the time of day, and the visible breath and wet cold point away from spring.
2. Scene 3 opening. Quote: "Serin went down first. Baek Jiwon came after her at the same careful pace, the lantern swinging at his side". Contradicts scene 2, where he stands below her at "the sixth turn" and looks "down toward the dark at the foot of the tower". Someone has to pass the other on the stair.
3. Scene 1, near the top. Quote: "She stopped for a moment with her forehead almost touching the cold stone". Uses the phrase the author banned for the whole work.
4. Scene 3, descent. Quote: "Her palm trailed the iron, landing by landing." The plan for scene 3 says her left hand slides along the railing, and the instruction says her left-handedness must show through what she does. The repair step removed "left" from this line and from the other railing lines, so the chapter now shows the left hand once.
5. Scene 2. Quote: "Her breath hung in front of her face and would not drift away." Near-verbatim repeat of the scene 1 line "Her breath hung in front of her and did not drift." with no new information.
6. Scene 2. Quote: "The iron was so cold it seemed to pull the warmth out of her fingers, and she kept them there anyway." Repeats the scene 1 beat ("The metal was so cold it pulled at her skin whenever she lifted her fingers, so she kept them down.") with no new information.
7. Last two paragraphs. Quote: "Far above her, through the grey, the bell shivered once in its frame." and "the rope overhead swung as though someone had only just released it". Serin is mid-stair and earlier "could no longer see the bell room at all"; she cannot see the bell or an overhead rope. Make it something she hears, or place her where she can see it.

Count: 7.

---

## Whole run

### Per-feature scores

| feature | score | evidence, gaps, improvement candidates |
|---|---|---|
| Interview | 4 | 12 questions, all answered (`interview.asked` 12, `undecided` 0). Topics covered the set in order: protagonist, Do Yunseo, Baek Jiwon, key rule, places, conflict, threads, Serin's speech, ending, style, then two story questions (`calls/020`, `calls/022`). Useful and specific; the chapter 1 opening question produced the plan the chapter followed. Gaps: question 8 (`calls/015`) asks again how Serin speaks, though the first answer (the answer to `calls/001`, first line of `author-decisions.jsonl`) already gave "Casual speech. Short and blunt..."; its rationale says "Her wiki card has no speech style recorded", which is wrong (the card already had the `speech` field). The harness counts `duplicateQuestions` 0, but this is a semantic repeat. The "what can she see from the top" part of question 5 was answered "I haven't decided yet". The chapter 2 question (`calls/022`) comes before chapter 1 exists. Candidate: show per-card field presence (speech) in the interviewer's wiki summary; expected effect: removes one wasted turn. |
| Extraction | 4 | Interview extraction (`calls/002` to `calls/023`) against the answers: names are whole, no truncation, no subject swaps (Do Yunseo's debt and Baek's thirty silver coins are on the right people), no duplicate character cards. All facts are supported by the answer text. Weak points: facts repeat the card fields (age/upbringing/left-handed and the speech statement appear both as card fields and as facts); the thread-order answer (`calls/014`) produced nothing, so the chapter appearances (letter ch 1, tunnel ch 2, debt ch 4) were not recorded; `calls/021` turned scheduling notes into threads ("Chapter 1 opening scene", rejected by the author step; "Night fog scene opening chapter 2", approved and now sitting in the wiki as a planned thread). Chapter extraction (`calls/035`, 15 proposals): 12 valid, 3 rejected correctly (1 wrong, "Han Serin works as a laundry girl" drawn from the taunt "A warden doesn't chase a laundry girl nine floors for a rule."; 2 duplicates of existing key facts). Missed: the key now hangs at Serin's neck, Baek's "before my time" line about the shut door. Weak evidence quotes: `weakFactEvidence` 5, `weakThreadEvidence` 1 (for example the evidence "Han Seoyeon." and "Full moon."). Candidates: dedupe against existing wiki facts in code; restrict threads to unresolved story questions; expected effect: fewer rejected proposals (3 of 15 now). |
| Continuity check | 4 | `calls/034` returned no issues and I found no wiki contradiction, so 0 valid, 0 false, 0 missed against the wiki. `continuity.contextHit` rate 1 (5 of 5 named subjects in the pack). Low evidence: with nothing to find, detection power is untested. It cannot see the in-chapter stair-geometry problems because it checks only against the wiki. Candidate: a second pass for within-chapter position and sight-line consistency, or feed the reader simulation's confusion flags to the check; expected effect: catches the Q2 problems. |
| Proofread | 4 | `calls/033` returned an empty list on the final text; correct, since I found no spelling, spacing or grammar errors. No invalid suggestions. It did not flag the awkward pair "kept them clamped there ... so she kept them down", but the rules limit "awkward" to ungrammatical sentences, so that is fair. |
| Reader simulation and direction advice | 4 | `reader/01.json`: four personas, all rated 3 (drop-off risk medium, low, high, medium). The quotes are real lines of the chapter and the comments are grounded: the binge persona caught the stair-position problem ("The lantern stopped at the sixth turn..." versus the seventh landing), the rope/bell sight line, and the circular "answer / not an answer" dialogue; the casual persona caught the breath and fog repetition. The suggestions are useful (tighten description, clarify stair geography and rope position, a fresher twist). Weak: the novice says it was unclear whether Han Seoyeon is Serin's mother, though "her mother" is stated; the "dropoff" mark on "Serin set the basket down..." is thinly justified. |
| Style proposal | 3 | The interview style answer (`author-decisions.jsonl` line 17) became the card "style": third-person limited, dry and calm, fog/sound/cold, emotions through gesture, short paragraphs. It captures the answer, but it has no example text and it duplicates the existing "Work style" card (author-created at setup, with the three-sentence rule, ending rule and example passage); the approval reason says "no style card exists yet", which is wrong. The interviewer's rationale in `calls/019` also says the style entry is empty. No model call is recorded between `calls/019` and `calls/020` for the style extraction. Candidate: show existing style cards to the interviewer and extractor; expected effect: no duplicate card. |

### Operations

- Failures: none (`failed` []). `wouldTimeOut` 0, `contextOverflow` 0, `hangulLeft` 0, `outputCap.cutOff` 0, `timeouts.total` 0, `pauses` {}.
- Retries and rejections: 1 expansion rejected (`calls/028`, `EXPAND_REJECTED`, reason "break": the proposed scene-2 continuation started a new scene, "Serin stood with her back against the wall...", and was discarded). The 3 other expansions were kept. The first draft (9,591 characters, 79% of the 12,100 minimum) forced the expansion step; the repeated images, the banned phrase and the emotion-naming sentence all came in with the expansions, while the first draft did not contain them.
- Plan anomaly: `calls/024` was told `<scene_count>8</scene_count>` and returned 4 scenes; the run then drafted 4 scenes of 3,025 characters. Nothing flagged the mismatch.
- Repair step (`calls/032`): 12 edits for "sample-copy" and "repeated-word" flags. It rewrote most "left hand" mentions to "palm", "fingers" or "grip" (see fix 4) and left the closing bell line near the sample.
- Tokens per step (input plus output, from `run-summary.json`): interview-question 41,062 (12 calls); interview-extract 55,751 (11); draft-plan 5,462; draft-chapter 23,560 (18,805 output tokens for a 9,591-character text); draft-expand 17,730 (4); paragraph-trim 5,476 (2); draft-repair 7,730; proofread 7,532; continuity-check 8,396; chapter-extract 15,660; reader-sim 9,068. Total about 197,400 tokens.
- Time per step (ms): interview-question 34,708; interview-extract 84,550; draft-plan 6,079; draft-chapter 90,343 (first token at 78,801 ms); draft-expand 31,790; paragraph-trim 6,948; draft-repair 8,863; proofread 9,629; continuity-check 6,235; chapter-extract 31,764; reader-sim 18,414. Total about 329 s of model time.
- Recording note: the recorded `calls/025` prompt contains no `<style_cards>` or `<author_requests>` block, while the expand and repair prompts do, yet the first draft already contains "Watch your step". The record may be incomplete, so I did not score this.
- Paragraph trim: 11 overlong paragraphs reduced to 2 in 2 rounds (`chapters/01.attempt-1.trim.json`).

### TTCW pass count (reference only)

7 of 14 (50%). Read as a one-chapter piece; the ending check is read as a chapter ending.

| check | result | note |
|---|---|---|
| Narrative pacing | fail | stretched climb and descent |
| Scene vs summary | pass | scene-driven, brief bridges |
| Language and devices | pass | fresh similes, overused "as if" |
| Narrative ending | pass | natural, instructed beat |
| Understandability and coherence | pass | unified, despite the stair-geometry slips |
| Perspective and voice | pass | Baek is convincing as a dry rule-keeper |
| Emotion balance | pass | grip, knuckles, search for a mark |
| Structure (turns) | fail | genre-template beats; the bell is the only surprise and the instruction dictates it |
| Theme and content | fail | missing mother, key, tower: familiar |
| Thought (no clichés) | fail | "the mist closed behind him without a sound" and similar |
| Form | fail | conventional chapter form |
| World and setting (sensory) | pass | fog, lye, wet linen, iron, drip |
| Character complexity | fail | Do Yunseo exists to deliver the letter |
| Rhetorical complexity | fail | subtext is thin |

LLM scoring on this check is unreliable (criteria section 4); do not use it as a target.

### Totals for the run (one chapter)

- Mean Q: 3.89.
- Publishable chapters: 1 of 1.
- Continuity errors (T2 scope): 0 in about 2,472 words, so 0.0 per 10,000 words.
- Places the author must fix: 7.

### Weakness list with improvement candidates

1. The expansion step pads with repeated images and breaks author rules (banned phrase, emotion naming). Candidate: after expansion, run a code check for banned phrases and for sentences repeated across scenes (n-gram overlap), and send the hits to the repair step. Expected effect: removes fixes 3, 5 and 6; Q7 up by about 1.
2. The repair step stripped the instruction-required left-hand cues. Candidate: tell the repair step which instruction details must stay (left hand) and re-check them in code afterwards. Expected effect: removes fix 4, and the left-handedness requirement shows more than once.
3. The spring-morning anchor of the instruction was dropped. Candidate: put time and setting anchors from the author note into scene 1 of the plan and check them by keyword before the draft is accepted. Expected effect: removes fix 1 and the T1 borderline.
4. In-chapter position and sight-line errors (Baek above or below, the bell seen from mid-stair). Candidate: add "who is above or below whom" to each scene card, and feed the reader simulation's confusion flags into a repair pass. Expected effect: removes fixes 2 and 7; Q2 up by about 1.
5. A draft first pass at 79% of the minimum length forces heavy expansion. Candidate: give the draft a more specific per-scene content budget (more concrete beats per scene) rather than relying on sensory padding. Expected effect: fewer padding repeats, better Q6.
6. The interviewer asks a settled question again and ignores existing cards (speech asked twice, "style entry is empty" while a Work style card exists). Candidate: list card fields and existing style cards in the interviewer's wiki summary. Expected effect: saves a turn and avoids the duplicate style card.
7. The interview extraction records scheduling notes as threads. Candidate: allow threads only for unresolved story questions; keep chapter plan notes in the chapter instruction. Expected effect: cleaner wiki, no spurious "use only if instructions mention it" entries.
8. Chapter extraction proposes a wrong inference and duplicates (3 of 15). Candidate: dedupe against existing wiki facts in code and require evidence that states the fact, not a taunt or a one-word reply. Expected effect: fewer rejected proposals.
9. The plan call ignored `<scene_count>` (8 requested, 4 returned). Candidate: validate the scene count in code. Expected effect: the plan matches the harness setting, or the mismatch is surfaced.

---

## Blinding note

none found (the only model names in the folder are the published TTCW baselines inside `reference/criteria.md`, which do not identify the model behind this run; every `model` field in `calls/` reads "[masked]").

### Verdict data

```json
{
  "schema": "review-verdict-1",
  "chapters": [
    {
      "chapter": 1,
      "thresholdsFailed": [],
      "qScores": [4, 3, 4, 4, 4, 3, 4, 4, 5],
      "verdict": "publishable",
      "mustFix": 7
    }
  ]
}
```

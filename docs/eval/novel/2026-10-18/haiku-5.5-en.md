# Run review: run-04-en

- Model id: haiku-5.5 (from `config.json`, read after scoring)
- Language: en
- Run directory: `eval/results/novel/2026-10-18/run-04-en`
- Scope: this run finished **1 chapter** (chapter 1), not five. The harness plan has only `ch1:*` steps (`state.json`, status `done`). "Five-chapter totals" below are therefore one-chapter values.
- Blinding note: the `calls/*.json` records carry a `model` field, so the model identity was visible incidentally while reading `calls/`. The chapter scores were set from the chapter text, `metrics/01.json` and `author-decisions.jsonl`, and `config.json` was opened only after all scores were written.
- Chapter text reviewed: `chapters/01.md` (saved text after the proofread). `chapters/01.attempt-1.md` and `chapters/01.draft.md` are identical to each other; `01.md` differs from them only by the three proofread fixes.

## Chapter 1

### Thresholds T1 to T7

| id | result | deciding metric / evidence |
|---|---|---|
| T1 instructed events | pass | 0 of 6 `mustInclude` events missing. Climb: `Serin pulled herself through the hatch and stood up slowly.` Warden chase: `"Han Serin," he called. "Stay where you are."` Handover: `"From Han Seoyeon," he said.` Letter tucked unopened and key hung: `Her thumb found the edge of the seal and stopped there. She did not break it.` and `Then she lifted the cord over her head.` Left hand: `She stepped onto the platform and laid her left hand flat against the bell's lip.` Bell: `Then the fog shivered, and far above it the bell trembled.` |
| T2 setting contradictions | fail (1, minor) | 1 Characterization item against the bible (see continuity count below). No contradiction with any fact in the approved wiki the draft model was given. The item comes from information the interview never collected, so it is mostly an interview-coverage gap. |
| T3 length | **fail** | `chars` 9,096, `targetChars` 12,100, `lengthOk` false. English minimum is 0.8 x target = 9,680; the chapter is 584 characters under the minimum and reaches 75.2% of target. About 1,780 words. Upper bound (15,730) is not an issue. |
| T4 non-prose content | pass | `metaHits` is `[]`. Read in full: no title, commentary or instruction echo. |
| T5 language mixing | pass | `foreignRuns` is `[]`. No Hangul in the text. (The prompt, not the output, had 3 Hangul characters; see Operations.) |
| T6 spelling | pass | `proofread`: 3 suggestions on 9,096 chars = 0.33 per 1,000 before the fixes, all three applied, so 0 per 1,000 in the saved text. My own read found no remaining clear error. None of the three was a hard error (two were `grey`/`gray` consistency, one was `lamp light`/`lamplight`), so the pre-fix rate is an upper bound. |
| T7 truncation | pass | `endsCleanly` true. Last line is the complete question `So who had touched the bell?` |

### Quality Q1 to Q9

| item | score | quote evidence and reason |
|---|---|---|
| Q1 immersion | 4 | Scene and space are vivid and the chase has physical stakes: `Her sandals skidded on the damp steps, and she caught herself twice with her shoulder against the wall.` The stranger's entrance pulls: `He simply looked as though he had been waiting for her.` Held back by the slow first third and the stretched climb: `She counted the landings under her breath. Fourth. Fifth.` |
| Q2 coherence | 3 | Mostly causal, with positional slips. Jiwon first approaches from below: `Through the fog she saw a lamp moving up the stairwell, slowly at first and then faster.` Yet after she runs down, `Behind her, his footsteps rang on the stone.` with no moment where she passes him. At the end he leaves her (`The keys at his belt rang once, softly, as he walked away from her.`) but the last section says `Baek Jiwon had come down the stairs behind her, and she had heard every one of his steps.` The closing logic is also muddy: `She had been alone at the top. She was sure of that.` although she touched the bell herself (`Under her palm the metal gave a faint hum, like a wire touched by a fingertip.`). |
| Q3 show, don't tell | 4 | Feeling and relation are carried by gesture and simile: `She waited until the cold was only air again, and then she kept climbing.` and `His grip was firm but not cruel, the grip of a man who had dragged a great many people down a great many stairs.` Some direct telling remains: `Serin had read it so many times she could see the letters when she closed her eyes.` and `She was sure of that.` |
| Q4 character and emotion | 4 | Serin's tension and secrecy are shown through action: `She buttoned the coat over it with her left hand, one button at a time, without looking down at what she was doing.` and `Her thumb found the edge of the seal and stopped there. She did not break it.` Interiority is thin: the wiki fact that she "resents her mother a little" never appears on the page. |
| Q5 voice | 4 | Three distinguishable registers. Serin is blunt: `"That isn't what I asked."` Yunseo is minimal and matches his wiki card (a word or two): `"Not here."` Jiwon is curt and commanding: `"You wanted to see a great many things. Keep moving."` and `"Walk," he said.` Deduction: Jiwon's bible voice (courteous with sarcasm, "young miss") is not rendered; the only style card he had was the whole-work card. |
| Q6 pacing and web-novel form | 3 | Paragraphs are short (`avgParagraphChars` 126, `paragraphs` 72, `dialogueLineRatio` 0.31), but the first dialogue line only arrives at about 35% of the text (`"Don't touch that."`), and the style rule "No paragraph runs longer than three sentences" is broken in at least 14 of 72 paragraphs by a simple sentence count (some counts include one-word fragments). Slow detail: `The steps were worn into shallow dishes in the middle.` |
| Q7 prose | 4 | Precise and restrained, with several strong lines: `The sound came up the stairwell hollow and late, as if it had happened a long time ago.` and `His coat brushed the wall, and the fog closed around his shoulder before the rest of him followed it.` Deductions: `as if`/`as though`/`like a` appears about 7 times, "left hand" is repeated mechanically (9 times, one of them Yunseo's, plus `left wrist`), and the `gray`/`grey` split (fixed by proofread). |
| Q8 originality | 4 | Own details: `Nobody at Cheonghae Orphanage said the word spring out loud. They simply took the blankets down.` and `Most of the page was a single word written over and over. *Seal. Seal. Seal.* Each one was underlined.` Genre beats are stock (missing mother, key, stranger with a letter, warden). One sentence is copied from the style sample in the prompt: `The iron was cold enough to stick to her palm` appears verbatim in both the sample and the chapter. |
| Q9 ending | 4 | The chapter's events close (key taken, letter hidden), and the last beat leaves a question: `The sound did not come. The bell did not ring.` then `So who had touched the bell?` An earlier hook also lingers: `"Did she come back down?"` / `He did not turn around.` Deduction: the question presupposes someone touched the bell, while the instruction says the bell trembles "on its own"; and `There was no wind.` is stated just before. |

Mean Q: (4+3+4+4+4+3+4+4+4) / 9 = 34 / 9 = **3.78**. No item is 2 or lower.

### Verdict

**Not publishable.** T3 fails (length 75.2% of target) and T2 fails on one minor item. The mean (3.78) would clear the 3.75 bar and no item is 2 or lower, so with a full-length draft and a Jiwon voice note in the wiki this chapter would sit right at the publishable line. It is not excellent (mean below 4.25).

### Continuity count (ConStory categories)

Against the bible and approved wiki:

| # | category | item |
|---|---|---|
| 1 | Characterization (minor) | Bible: Baek Jiwon has "Courteous speech laced with sarcasm" and "Calls Serin 'young miss'". Chapter: he addresses her by full name and with bare orders (`"Han Serin," he called. "Stay where you are."`, `"Go home, Han Serin. Don't come back up here."`). The phrase "young miss" never appears. Origin: the interview never asked about Jiwon's manner, so the wiki had only the word "warden". |

Total against the bible: 1 (Characterization 1; Timeline & Plot Logic 0; World-building & Setting 0; Factual & Detail 0; Narrative & Style 0).

Internal slips, not counted against the bible (listed so the summary can compare):

- Timeline & Plot Logic: Jiwon climbs from below, then is "behind" the descending Serin with no passing moment (Q2 quotes above).
- Timeline & Plot Logic: Jiwon walks away downstairs, then is said to have "come down the stairs behind her".
- Narrative deviation: the instruction says the bell trembles on its own; the ending asks who touched it.
- Detail: `the shelf with the bare laundry board` vs the earlier `a shelf beside the stairs` (trivial naming drift).
- Invented, not contradicting: the orphanage keeps one page of the mother's notes; the wax "as if it had been carried against a body for days" (a simile, read as not asserting a recent hand-off, but it strains "left ... three years ago").

Rate: 1 bible-based item in about 1,780 words = **5.6 per 10,000 words**. Counting the two plot-logic slips as well: 3 items = 16.9 per 10,000 words.

## Whole run

### Per-feature scores

| feature | score | summary |
|---|---|---|
| Interview | 4 | See below |
| Extraction | 4 | Interview-extract 4, chapter-extract 3 |
| Continuity check | 4 (provisional, thin evidence) | 0 flags, nothing to grade precision on |
| Proofread | 4 | 3 of 3 valid, none missed that I could find; low stakes |
| Reader simulation | 4 | 15 of 15 quotes exact; one false claim |
| Direction advice | not scored | No advice call exists in `calls/` |
| Style proposal | not scored | No style-proposal call; style card was seeded at setup |

**Interview (4).** 12 question calls, all `focus: "setting"`, one question at a time with a rationale each. Questions are specific and built from the synopsis and thread list, for example `Who is Do Yunseo to Han Seoyeon, and why does he trust a sixteen-year-old orphan enough to hand her the sealed letter and the silver key?` and `The seal on Mother's Letter is due to be resolved in Chapter 8, but the wiki doesn't yet say what it hides or what Serin must do to break it.` Topics covered: protagonist, key rule, places, Yunseo, conflict, ending, style, letter thread, debt thread, Seoyeon. Problems:
- Three questions went to "world rules" about the key (`003`, `021`, `023`). `021` and `023` both justify themselves with `The wiki has no rule cards yet`, because the key rule was stored as an item card, not a rule card. The author answered `021` with "I haven't decided that yet." and `023` with the bank answer repeated (see `author-decisions.jsonl`, entries for `7c5dba30` and `21b68a2b`). Two of 12 questions produced no new information.
- Coverage gaps: nothing on Baek Jiwon's manner, Serin's personality, age or handedness, and nothing on Yun Haeok or Gwak Duseok. The first gap is what shows up as the T2 item.
- `011` asked for the ending and the last scene before chapter 1 existed; the only answer was "I haven't decided the ending yet".
- The interviewer never switched to `focus: "story"` (`focusCounts` setting 12), so it never asked how to open chapter 1.
- Question `001` asked what Serin is afraid of losing; the author said undecided. That is a fair question, not a flaw.

**Extraction (4).** Source for scoring: the interview answers and the saved chapter text.
- Interview-extract (38 proposals: 9 cards, 21 facts, 8 relations, counted from the calls and the decisions; 37 approved, 1 rejected). Names are whole in every card (no truncation, e.g. `Baek Jiwon`, `Do Yunseo`, `Silver Key`). Only one subject swap: call `016` filed `Mother's sealed letter stays closed until Serin opens it.` under `Han Serin`; the author rejected it with "the fact is about Mother's Letter and is filed under the wrong subject". No duplicate person cards. Duplicate facts: the key rule appears three times in the final wiki (`Fits a lock only on a night when the moon is full.`, `Does not fit into the keyhole on any day other than a full moon night.`, `Fits a lock only on a night when the moon is full and will not go into the keyhole on other days.`); the Do Yunseo / Han Seoyeon "bring the letter and key" fact exists on both cards. The extractor sees only names in `<known>`, not existing facts, so it cannot avoid repeating them; the author approved the duplicates. Missed from the source: `I've only decided that Serin finds traces of her mother beneath the bell tower.` (call `012` returned nothing) and the sealed-tunnel rumor in the places answer. The Han Seoyeon card summary is a single action (`asked Do Yunseo to deliver the sealed letter and the Silver Key to Han Serin`) rather than who she is.
- Chapter-extract (call `028`, 10 facts, 3 threads, 2 relations, 1 summary). Facts are supported by exact evidence quotes (all evidence strings were checked against the text). Problems: the summary says Serin climbs `despite the warden Baek Jiwon's warning`, but the warning comes only after she is already at the bell; the fact `bell ... hangs from a black beam, with a rope tied into a loop beneath it` over-reads the text (it says only that a beam crossed above the bell and a rope hung from the beam); the planned thread "The seal on Mother's Letter" (first planted in this chapter) was labeled `developed`, not `planted`, against the prompt rule; the new `family` relation duplicates the existing `mother` relation; and the fact `sent a sealed letter and the Silver Key ... through a messenger` repeats an existing fact. Missing: Serin's left-handedness (which the chapter shows through eight "left hand" actions and one "left wrist"), that she wears the key, and Yunseo's appearance (`a faded blue travel coat`, dagger at the right hip). No subject swaps or name truncation.

**Continuity check (4, provisional).** Call `027` returned `{"issues": []}`. I found no wiki-grounded conflict in the chapter, so the empty result is correct, with 0 false flags and 0 misses. No error was seeded in this chapter, so the call shows nothing about how it handles real conflicts or how often it raises false alarms.

**Proofread (4).** Call `026`: 3 suggestions, all `spelling`: `grey light` to `gray light`, `grey and empty` to `gray and empty`, `lamp light` to `lamplight`. The two `gray` fixes are real consistency fixes (the draft uses `gray` three other times). `lamplight` is the standard form. All three were accepted by the author. No miss found. The evidence is thin: the chapter had no grammar or spacing error to find.

**Reader simulation (4).** Call `029`: four personas (`reader-novice`, `reader-binge`, `reader-casual`, `reader-genre`) with ratings 3, 3, 2, 3. All 15 quoted moments exist verbatim in the chapter. Useful and grounded: the novice's `Her mother had spent her last months studying the seal of this tower.` (unexplained seal), the casual reader's slow opening (matches my 35% first-dialogue measure) and the climb-counting sag. One false claim: the binge persona says the basket "had set it down at the ground door" before Jiwon hands it over, but she set it on the second-floor shelf first; the ground-door set-down comes later. The casual persona also cites "the tower's history", which the chapter does not contain.

**Direction advice.** Not scored. `calls/` has no advice task. The run stops after the reader simulation.

**Style proposal.** Not scored. There is no style-proposal call; `setup:style` seeded the "Work style" card before the interview. Call `014` (the style answer) extracted nothing, which is consistent with a pre-seeded card but means the interview-to-style path was not exercised.

### Operations

- 29 calls: interview-question 12, interview-extract 12, draft-chapter 1, proofread 1, continuity-check 1, chapter-extract 1, reader-sim 1.
- Failures 0 (`failed: []`), retries 0 (`retried: {}`), pauses 0, `wouldTimeOut` 0, `contextOverflow` 0, `error` null on every call. The draft took one attempt.
- `hangulLeft`: 3 in total, all in call `025` (draft-chapter). The cause is the prompt label `<chapter>Chapter 1 (새 회차)</chapter>`, built in `src/server/ai-features.ts` line 294 (`promptLabel = ...화 (새 회차)`) and not covered by the English localization table. The output itself has no Hangul.
- Prompt-format note: the context pack in the draft prompt closes its sections with a full-width bracket (`＜/entries>`, `＜/threads>`, `＜/relations>`, `＜/previous_chapters>`, `＜/naming>`). This comes from `neutralizeTags` in `src/ai/prompt-utils.ts` being applied to the whole pack, including the pack's own tags. It did not break this run.
- Tokens per step (input + output, from `run-summary.json`): interview-question 30,323; interview-extract 19,253; draft-chapter 15,405; proofread 6,145; continuity-check 7,534; chapter-extract 10,352; reader-sim 7,883. Total 96,895.
- Time per step: interview-question 48.8 s (12 calls); interview-extract 76.0 s; draft-chapter 69.1 s; proofread 13.2 s; continuity-check 15.7 s; chapter-extract 25.6 s; reader-sim 24.3 s. Total 272.8 s. Chapter 1 (draft through reader) `perChapterMs` 147,987 ms.
- Draft usage: 2,405 input and 13,000 output tokens for a chapter of about 9,240 characters (roughly 2,200 visible tokens). The large gap and the 55.2 s wait before the first token suggest hidden reasoning is counted in the output (inference; the record does not say).

### Speed (`speed` block, source `wall`)

`wall` means wall-clock time including network and any thinking, so these numbers are not comparable with `ollama` internal timings.

| scope | median output tokens/s | median prompt tokens/s | median first token |
|---|---|---|---|
| overall | 170.8 | null | n/a |
| interview-question (12) | 144.1 | null | null |
| interview-extract (12) | 190.0 | null | null |
| draft-chapter (1, stream) | 934.2 | null | 55,229 ms |
| proofread (1) | 230.8 | null | null |
| continuity-check (1) | 194.7 | null | null |
| chapter-extract (1) | 250.8 | null | null |
| reader-sim (1) | 183.0 | null | null |

Notes: only one call is a stream, so the median first-token time (55.2 s) is a single sample. The draft's 934.2 tokens/s equals 13,000 tokens divided by the time after the first token (69.1 s minus 55.2 s); measured over the whole call it is about 188 tokens/s, so it should not be read as steady generation speed. Prompt tokens/s is not recorded in `wall` mode.

### TTCW (14 checks, reference only; chapter 1 read as the whole work)

Pass count: **7 of 14 (50%)**. Reference rates from the criteria file: New Yorker 84.7%, Claude v1.3 30.0%, GPT-4 27.9%. One chapter, one LLM grader; the criteria file notes LLM grading did not agree with experts on this test.

| check | result | note |
|---|---|---|
| Narrative pacing | pass | stretched climb, compressed handover; acceptable |
| Scene vs summary | pass | mostly scene |
| Language and literary devices | pass | some strong similes, but repetitive `as if` |
| Ending | pass | natural for chapter 1 |
| Understandability and coherence | pass | positional slips, but the whole holds |
| Perspective and voice | fail | single POV; antagonist is flat |
| Emotional flexibility | fail | interiority almost absent |
| Structural flexibility | fail | turns follow predictable genre beats |
| Originality of theme | fail | missing mother, key, bell tower |
| Originality of thought | fail | stock beats; sample sentence reused |
| Originality of form | fail | conventional |
| World and setting | pass | sensory: cold iron, rust, fog, sandals |
| Character development | fail | Jiwon and Yunseo serve the plot |
| Rhetorical complexity | pass | subtext in `He did not look at her hand. He looked at her collar, where the cord had left a faint line in the wool.` |

### Five-chapter totals (one chapter run)

- Chapters reviewed: 1 (chapters 2 to 5 were not run).
- Mean Q: 3.78 (n = 1).
- Publishable chapters: 0 of 1.
- Continuity errors per 10,000 words: 5.6 against the bible (16.9 with internal plot-logic slips), from 1,778 words.

### Weakness list and improvement candidates

| # | weakness | improvement candidate | expected effect |
|---|---|---|---|
| 1 | Draft is 75.2% of target length (T3 fail) | Show the target in words as well as characters (about 2,150 words); add a code check after drafting that asks for an extension when `chars` is under 0.8 x target; require a scene count | High: removes the only hard blocker on an otherwise near-publishable chapter |
| 2 | Interview gets stuck on "no rule cards yet" and repeats the key topic (3 of 12 questions) | Count facts and topic coverage in the interviewer's wiki block, not only card kinds; close a topic once the author says "undecided" | Medium: frees about 2 questions per run |
| 3 | Interview never reaches Jiwon's manner, Serin's personality or handedness | Add a sweep that asks each main character's speech and manner once | High for T2 and Q5: removes the Characterization item and gives the draft a voice card |
| 4 | Duplicate facts (key rule x3, messenger fact x2) pass into the wiki | Give the extractor existing facts in `<known>`; add a code similarity filter against `<known_facts>` | Medium: cleaner wiki, fewer author approvals of duplicates |
| 5 | Subject swap on item-related facts (letter fact filed under Serin) | Add a rule: if the fact is about an item or thread without a card, create the card or drop the fact | Low to medium: removes the one swap seen |
| 6 | Chapter-extract summary error, missed handedness and worn key, thread kind mislabel, duplicate relation | Add a second pass that checks the summary against the text; ask explicitly for handedness, worn items and appearance; enforce the "planned thread planted first time" rule in code | Medium: better continuity fuel for later chapters |
| 7 | Style rule "no paragraph over three sentences" broken in at least 14 paragraphs | Add a code check on sentence count per paragraph and regenerate or split | Medium for Q6 |
| 8 | Positional and ending-logic slips; ending reframes the bell as touched | Add a self-review step for who is above or below whom and for the instruction wording ("on its own") | Low to medium for Q2 and Q9 |
| 9 | Verbatim reuse of a style-sample sentence | Tell the draft prompt not to copy sample sentences | Low: Q8 |
| 10 | Korean label leaks into English prompts (`새 회차`, `hangulLeft` 3) | Add the label to the localization table in `eval/novel/localize/` or localize it in the harness only | Cleans the metric; no quality effect |
| 11 | Full-width bracket on the pack's own closing tags | Apply `neutralizeTags` only to embedded text | Low: removes a prompt oddity that small models may mimic |
| 12 | Reader simulation made one false continuity claim (basket) | Ask personas to verify an object's earlier position before raising an inconsistency | Low |

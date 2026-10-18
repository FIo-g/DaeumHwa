# Novel eval review: run-01-en

- Run directory: `eval/results/novel/2026-10-18/run-01-en`
- Language: en
- Model: `qwen3.8-27b` (from `config.json`, read after scoring)
- Chapters in this run: 1 (`config.json` also lists 12 interview questions and at most 3 draft attempts; the run plan in `state.json` is setup, interview, ch1 draft, proofread, check, continuity, proposals, reader, finish)
- Reviewer: Sonnet, blind to the model while scoring. Criteria: `docs/eval/novel-quality-criteria.md` (sections 3.1 to 3.4, 4) and the design spec section 9.
- Blinding note: one call record (`calls/025-draft-chapter.json`) was printed whole while I was checking its structure, and it carries a `model` field. I did not use it. `config.json` was opened only after the scores below were written.

## 1. Verdict at a glance

| Item | Result |
|---|---|
| Chapter 1 verdict | Not publishable |
| Deciding reasons | T2 fails (4 contradictions with the bible or approved wiki), mean Q is 3.00 (needs 3.75), Q2 is 2 (no item may be 2 or below) |
| Mean Q (chapter 1) | 3.00 |
| Continuity errors | 8 in total (27.5 per 10,000 words); 4 against bible or wiki (13.8 per 10,000 words) |
| TTCW (reference only) | 5 of 14 |
| Operations | no failed steps, 1 retry (reader simulation format error), 20 of 30 calls over the product timeout |
| Speed | median 29.5 generation tokens/s, 175.1 prompt tokens/s (`source`: `ollama`) |

Feature scores (1 to 5):

| Feature | Score |
|---|---|
| Interview | 4 |
| Extraction (interview and chapter) | 4 |
| Continuity check | 3 |
| Proofread | 3 (thin evidence) |
| Reader simulation | 4 |
| Direction advice | not run in this plan |
| Style proposal | not run in this plan (the style card was installed by setup) |

---

## 2. Chapter 1

Source files read: `chapters/01.md` (identical to `01.draft.md` and `01.attempt-1.md`, so one attempt and the proofread step changed nothing), `chapters/01.proofread.json` (`[]`), `metrics/01.json`, `calls/025` to `calls/028`, `author-decisions.jsonl`, and the bible at `eval/fixtures/novel/en/bible.json` for the instruction and facts.

Harness metrics (`metrics/01.json`): `chars` 15069, `targetChars` 12100, `lengthOk` true, `foreignRuns` [], `metaHits` [], `endsCleanly` true, `paragraphs` 97, `avgParagraphChars` 155, `dialogueLineRatio` 0.34. Word count (wc) is 2906.

### 2.1 Thresholds T1 to T7

| id | Result | Deciding evidence |
|---|---|---|
| T1 instruction events | Pass | All 6 `mustInclude` events are on the page, 0 missing: climb to the top for the first time, Baek Jiwon chases her off, Yunseo hands over the sealed letter and silver key, letter tucked away unopened and key hung at the neck, a left-hand action, the bell trembling without ringing. Two of them are staged against the instruction and are counted under T2 (see C1 and C4). |
| T2 setting contradictions | Fail | 4 contradictions with the bible or approved wiki (C1 to C4 in 2.4). 3 more internal inconsistencies (C5 to C7) and 1 style-card breach (C8) are counted separately. |
| T3 length | Pass | `chars` 15069 against `targetChars` 12100 is 124.5%, under the 130% cap (15730); `lengthOk` true. |
| T4 non-story text | Pass | `metaHits` is empty. The text starts with the first story sentence and ends with a story sentence. |
| T5 language mixing | Pass | `foreignRuns` is empty; a Hangul search of `01.md` finds 0 characters. `hangulLeft` is 3 in `calls/025`, but that is the prompt label "Chapter 1 (새 회차)", not the output (see Operations). |
| T6 spelling and grammar | Pass | The proofread step returned 0 suggestions and the saved text is unchanged. My own read found no clear spelling, spacing or grammar error. One borderline item: `He did not say thank you. He did not say I am sorry.` has the quoted words without quotation marks or italics. That is at most 1 in 15,069 characters, about 0.07 per 1,000 (limit 1.0). |
| T7 truncation | Pass | `endsCleanly` true; the last line is a full sentence: `She walked home.` |

### 2.2 Quality items Q1 to Q9

| Item | Score | Evidence (quotes are exact) |
|---|---|---|
| Q1 Immersion and interest | 3 | Strong sensory writing carries the climb: `Third story. She passed a window with no glass. The fog came through it and settled on her shoulders.` The Jiwon exchange gives it a pulse: `You know the rules about the laundry because the laundry is the only thing the rules allow you to do. Everything else is section seven.` Against that, the first 28% of the text (before any voice is heard) is a floor-by-floor count that repeats one beat: `Sixth story. The stairs narrowed. The walls pressed closer, and the stone was rougher here, unpolished, as if the masons had given up.` Readable, not hard to put down. |
| Q2 Coherence and structure | 2 | Several things do not add up. Never above the first floor, yet she has studied the top for years: `She had never gone past the first floor.` against `She had been watching them for three years, and she still did not know.` The basket is set down at the gate (`She set the basket down. She did not look back at the gate.`), then is on the fifth landing (`The laundry basket sat at the foot of the next flight, and she left it there.`), then she is at the first-floor bin (`Serin set the basket in the west bin.`) while the bundles stay on the eighth floor (`She set the laundry bundles on the landing.`) and the day ends with the laundry marked done. The meeting with Yunseo happens off the stairs: `She was halfway down the hill when she heard the blade.` The last paragraph argues with itself: `She stood there until the tremor stopped. It did not stop.` The narration never says Baek Jiwon is the warden (the only uses are `warden's pass`, `warden's seal`), so a new reader cannot place his authority. |
| Q3 Show, do not tell | 3 | The left hand is shown through action (and over-shown): `Serin's left hand closed into a fist. She opened it. Closed it again.` Feelings are mostly in gestures, but the narrator names and explains: `He looked at her the way a man looks at a stain on a floor: with the mild annoyance of someone who has already decided the stain is his problem.` and `Two small weights. Two small facts.` The style card says not to name emotions. |
| Q4 Characters and emotional line | 3 | Serin's drive is clear from the first lines, and the letter lands physically: `She could feel the weight of it. A small, hard weight. A stone in her chest.` But the resentment toward her mother (in the wiki) never shows, her `Where is she.` gets no reaction beat, and the thank-you is an unclear signal: `"Thank you," she said. She did not mean it the way he expected. She meant it the way a dog means it when a stranger throws a bone over a fence.` Yunseo is a delivery device with no inner life. Jiwon has a clear stance but one note. |
| Q5 Character voice | 4 | Jiwon is distinct and on the card (courteous, sarcastic, rules first, `young miss`): `I am a man of few habits, but I do not look past a mistake I have already pointed out.` Serin is blunt and short: `"Where is she."` `"What about her."` Yunseo starts right (`"Miss Han," he said. One word. Then another. Polite. Flat. "Your mother."`) but drifts into explaining, against the card ("finishes in a word or two"): `It opens on the full moon. The key will not turn on any other night.` |
| Q6 Pacing and web-novel form | 3 | Dialogue is 34% of lines and paragraphs are short on average (155 chars), but the first speech comes 28% in, and 34 narration paragraphs have more than three sentences (the style card limit), for example `Fourth story. The railing changed here. Instead of iron, it was wood, dark and slick with moisture.` and the six-plus-sentence stair paragraphs. The conflict scene is brisk (`"Then where do I leave it?"`); Yunseo arrives at 74% and his whole scene is five short speeches. On a phone the climb is the weak stretch. |
| Q7 Prose | 3 | Some images are precise: `A low, persistent hum, like a finger pressed to a tuning fork held underwater.` The surface is worn by fragments (127 of 347 sentences are 4 words or fewer) and by repeated frames (`did not` 27 times, `left hand` 20 times): `He did not say thank you. He did not say I am sorry. He did not say what she had done down there, or where she was, or whether she was alive.` Some similes do not land (`The key sat in her palm like a coin, like a tooth pulled from a dead socket.`) and the dog image is used twice. |
| Q8 Originality | 3 | The tower as a bureaucracy is a real detail: `The rules are updated quarterly. The east bin was decommissioned last month.` The key answering the bell is a good hook: `The key vibrated with it. A matching frequency. A second voice, answering the first.` The frame is the stock orphan, mysterious letter, key and dagger messenger, and the emotion beat is stock: `A small, hard weight. A stone in her chest.` |
| Q9 Ending and pull to next chapter | 3 | The bell image the brief asked for is well placed: `The fog lifted. The hill was clear. The tower stood empty, and the bell at its top trembled on its own, and did not ring.` It is then undercut by a muddled line and a flat last sentence: `It did not stop. It had not stopped in three years. It would not stop.` `She walked home.` Natural, but no question carries forward. |

Mean Q: (3 + 2 + 3 + 3 + 4 + 3 + 3 + 3 + 3) / 9 = 3.00.

Style-card adherence (for context, not a separate score): third-person limited, dry, fog, sound and cold are all present. Broken: the three-sentence paragraph limit (34 narration paragraphs over), "do not name emotions" (`mild annoyance`), and "end on a question or tension" (ends on `She walked home.`).

### 2.3 Verdict

Not publishable. Reasons: T2 fails; mean Q 3.00 is below 3.75; Q2 is 2. It would not qualify as excellent either (needs mean 4.25 and Q3, Q4, Q9 at 4 or above).

The draft step's own judgment (`author-decisions.jsonl`, `ch1:draft`) was usable with edits, quality 3, and named the same two core problems (Yunseo on the hill road instead of the stairs; the three-year symbol contradiction) plus a flat ending. I agree.

### 2.4 Continuity count for chapter 1 (ConStory five categories)

| # | Category | Contradiction | Against | Severity |
|---|---|---|---|---|
| C1 | Timeline and Plot Logic | Yunseo hands over the items on the hill road after Serin has left the tower grounds (`She was halfway down the hill when she heard the blade.`). | Instruction and wiki F22: "as she comes down the stairs of the tower" | High |
| C2 | Characterization | Yunseo speaks in explaining sentences (`The door at the bottom of the tower. Section nine.` ... `It opens on the full moon. The key will not turn on any other night.` and `She asked me to bring these to you ... Three years ago. Before she went down.`). | Bible voice "Finishes in a word or two ... without explaining"; wiki F1 | Medium |
| C3 | Timeline and Plot Logic | `She had been watching them for three years, and she still did not know.` (the symbols at the top), while she has never been above the first floor. | Bible fact: she first climbed to the top on the first day of spring; the chapter's own `She had never gone past the first floor.` | High |
| C4 | World-building and Setting | `Spring had not yet reached the hill; the frost still sat in the crevices of the stone wall` on what the instruction calls the first morning of spring. | Instruction and bible fact "first day of spring". Arguable (a calendar date can still be cold), so low confidence. | Low |
| C5 | Factual and Detail (internal) | The basket and bundles: set down at the gate, on the fifth landing, at the first-floor west bin, while the two bundles stay on the eighth floor and `The laundry was done.` | Chapter itself | Medium |
| C6 | World-building and Setting (internal) | Location of the inner iron door: `behind the bell rope` (Jiwon), passed on the first floor (`She did not look at the iron door behind the bell rope.`), `The door at the bottom of the tower` (Yunseo), while the rope `dangled from the bell's crown` at the top. | Chapter itself | Medium |
| C7 | Factual and Detail (internal) | The bell hangs `in a cage of iron above the stairs` from the eighth floor and `at the center of a wooden frame` on the ninth. | Chapter itself | Low |
| C8 | Narrative and Style | 34 narration paragraphs longer than three sentences. | Style card rule "No paragraph runs longer than three sentences." | Medium |

Counts: bible or wiki contradictions (C1 to C4) 4; all items 8. Per 10,000 words (2906 words): 13.8 and 27.5. Only one chapter exists, so there are no cross-chapter contradictions to count.

Arguable items I did not count: Yunseo names the full-moon rule and a door in chapter 1, ahead of the planned tunnel thread (target chapter 9); the bible does say the key's rule is learned piece by piece, so this is a pacing choice, not a contradiction.

---

## 3. Whole run

### 3.1 Interview (score 4)

Evidence (`calls/001` to `calls/023`, odd numbers; `author-decisions.jsonl` answers):
- 12 questions: focus `setting` 10, `story` 2. Topics in order: protagonist, Yunseo, key and tower rules, Seoyeon, places, central conflict, Jiwon, chapter 1 opening, central conflict again, bell and seal rule, chapter 1 ending, Duseok. Each one is tied to a gap named in the rationale (for example call 003: "he has no wiki card and no defined motivation").
- Useful: 11 of the 12 author answers carried settings that were extracted; call 015 got "I haven't decided that yet." (decision 14).
- Repeat: call 017 re-asks what Serin "loses permanently", which call 011 already asked and the author had answered "I haven't decided that yet." Call 021 re-asking the chapter 1 opening "from the other end" is a legitimate step forward.
- Invented premises stated as fact: call 011 and call 017 say Serin "must reach the tunnel before the seal on her mother's letter is broken"; the wiki and bible set no such deadline, and call 017 says "You've established" it. Call 019 ties the bell rule to "the seal on Serin's mother's letter"; the author's answer only says "the seal". Call 023 asks what the soup house offers "that a warden's jurisdiction doesn't reach", also not in the source.
- Length and shape: many questions pack 3 or 4 asks (call 009: who governs, what people trade, how the orphanage sits, how the tower shapes life), against the prompt's "one or two sentences". The author answered only part of such questions ("As for who governs the town ... I haven't decided that yet").
- Coverage gaps: ending direction was never asked; style was never asked (the style card was installed by setup, so this is not a defect); the model moved to `story` focus at question 7 with those core topics still open.
- Speed: median 95 s per question call (range 30 to 175 s), 4 of 12 over the 120 s product limit.

Missing: a question check that rejects premises not in the wiki. Improvement candidates are in 3.8.

### 3.2 Extraction (score 4)

Scored against the source text each call read.

Interview extraction (12 calls, 79 proposals; author approved 76, rejected 3):
- Faithful and well grounded. No name truncation (all 11 interview cards have whole names), no subject swaps (Seoyeon is Serin's mother; Jiwon borrowed from Seoyeon; Yunseo owed Seoyeon), no duplicate cards. Hedged answers became `undecided` facts correctly (calls 002, 004, 006, 008, 010, 012, 014, 018, 020, 024). The "not decided" answer in call 016 correctly produced an empty result.
- Unsupported additions (the 3 rejections): call 002 added that the undecided fear "makes the Bell Tower and its secrets dangerous for her"; call 020 made a new rule card tying the bell to "the seal on Serin's mother's letter" with a "ringing or silence" link and a status fact. The answer said only "a rule between the tower's bell and the seal".
- Weak points: four near-duplicate relation pairs reached the final wiki (`kinship` and `parent` for Serin and Seoyeon; `conflict` and `opposition` for Serin and Jiwon; `ownership` and `runs` for Duseok; `debt` and `request` for Yunseo and Seoyeon) and four near-duplicate fact pairs (Serin's goal, Jiwon blocking Serin, the bell trembling, the unknown loss), mostly from the repeated question. The interview extraction prompt lists only card names, not known facts, so it cannot avoid them. Cheonghae Harbor's first summary is only "A harbor that is the origin of swordsman Do Yunseo". The chapter 2 plan was filed as a fact of Cheonghae Harbor (call 022).
- Instruction slip: the top-level `summary` is filled in all 11 non-empty calls although the prompt says "summary is null". The rule may mean entry summaries, so I did not score it.

Chapter extraction (`calls/028`: 2 entries, 16 facts, 3 threads, 1 relation, 1 summary; 23 proposals, author approved 19, rejected 4):
- Mostly accurate. It correctly preserves the text's own details (sixteen, the hum at thirteen, Jiwon's coat, Section nine, Section seven penalty, key with one scratch, the key and bell resonance) and the delivered-by-Yunseo location as written ("On the hill path"), so the draft's error is not hidden.
- Errors against the chapter text: the `Inner Iron Door` summary says it is "the entrance to the sealed tunnel beneath" and the thread T2 is marked planted with Yunseo "revealing" the tunnel entrance mechanism; the chapter never mentions a tunnel. Both were rejected by the author, correctly.
- Overreach (approved, minor): "left-handed, using her left hand for all physical tasks" from the evidence `Her left hand held one.`; "a permanent ban from all hill buildings" where the text says the orphanage will not send her back; Yunseo's `She said you would not open it today. ... Not yet.` recast as an instruction not to open it; `Bell-Rope Crew` described as maintaining the bell and its rope (not in the text); the summary says she tucks both items into her coat, while the key is hooked at her collar.
- The symbol fact (`watched them for three years`) was rejected by the author because it conflicts with the bible. The extraction itself is faithful to the text, so this is a draft problem (C3), not an extraction error.
- Time: 1848 s and 27,139 output tokens for one chapter.

### 3.3 Continuity check (score 3)

Evidence (`calls/027`, author decision `ch1:continuity`):
- 2 flags. Flag 1 (Yunseo appears on the hill, F4 "as she comes down the stairs") is valid, the refs `F4` and `E1` point to the right fact and card, and the explanation is accurate and sensibly leaves `suggestion` empty.
- Flag 2 (the closing line `She walked home.` against F21 "Chapter 1 ends on the image of the bell") was judged invalid by the author. The text's last scene is the bell, with one trailing line. I think it is a borderline reading. Ratio of valid to invalid: 1 to 1 (author's count); no clear false flag was invented from nothing.
- Missed within the wiki it was given: Yunseo's long explaining speech against F1 (confirmed, "a word or two"). Internal inconsistencies (C3, C5 to C7) are out of its stated scope (flag only conflicts with the wiki), so I do not count them as misses.
- Time: 2136 s, 17.8 times the 120 s product limit, with 6,519 output tokens. It ran at the same time as the chapter extraction (both started within 9 ms), which explains part of the delay.

### 3.4 Proofread (score 3, thin evidence)

- `calls/026` returned `{"suggestions": []}` and `chapters/01.proofread.json` is `[]`. My own read found no clear spelling, spacing or grammar error (T6), so an empty answer is plausibly correct.
- Valid to invalid ratio: cannot be computed (0 suggestions). The step shows no false positives, but also nothing that proves it can find a real error.
- Possible misses at the awkward-phrasing level: `She stood there until the tremor stopped. It did not stop.` (self-contradicting) and the unquoted `I am sorry`.
- Cost: 696 s and 11,800 output tokens to return an empty list.

### 3.5 Reader simulation and direction advice (score 4 for the simulation)

- Direction advice (serial advice) did not run in this plan, so it is not scored.
- Reader simulation (`reader/01.json`, `calls/030`; the first attempt `calls/029` failed with a format error): 4 personas, 16 moments, 15 of 16 quotes are exact (the genre persona's "Section seven" quote joins two paragraphs).
- Grounded and useful: the novice flags that the narration never explains who the warden is or what `bell-rope crew` means (true, see Q2); the casual reader flags the nine-paragraph climb as the drop-off risk (true, see Q6); the binge reader catches the repeated dog image (true: `the way a dog looks at a bone under the floor` and `the way a dog means it when a stranger throws a bone over a fence`); the genre reader flags the telegraphed `You will bring a key.` and offers fixes (make the dagger do something unusual; soften the prediction).
- Weak: the binge persona is described as sensitive to setting errors yet rates 5 of 5, "a masterclass", and misses C1, C3 and C5. It also says "I've seen it in three other recent chapters" when there are no previous chapters (invented context).
- Retry: `retried` is `{"ch1:reader": 1}`; the failed attempt took 448 s with no usage recorded, the successful one 2241 s.

### 3.6 Style proposal

Not run in this plan. `state.json` marks `setup:style` as done, meaning the style card came from setup. No proposal to judge.

### 3.7 Operations and speed

Operations (`run-summary.json`, `state.json`, `calls/`):
- `failed` is empty; status `done`; `contextOverflow` 0 on all 30 calls; `pauses` empty.
- 1 retry: the reader simulation (error `AI 응답 형식이 올바르지 않습니다.`, kind `model`). That message is the product's Korean error text appearing in an English run; it is a log string, not model input.
- `wouldTimeOut` 20 of 30: interview question 4 of 12, interview extract 10 of 12, and every call from the draft onward (draft 347 s against 280 s; the other post-draft calls 3.7 to 18.7 times the 120 s limit).
- `hangulLeft` 3, in one call only: `calls/025` (draft prompt), from the untranslated label `Chapter 1 (새 회차)`. The output was clean. This is a localization gap in the harness, not a model fault.
- All 30 calls requested effort `max` with `maxTokens` 32000 (29 object calls, 1 stream call).

Tokens and time per step (completed calls):

| Step | Calls | Input tokens | Output tokens | Total time |
|---|---|---|---|---|
| interview-question | 12 | 50,787 | 11,282 | 1,225 s (median 95 s) |
| interview-extract | 12 | 52,771 | 36,581 | 2,225 s (median 185 s) |
| draft-chapter | 1 | 2,815 | 8,852 | 347 s |
| proofread | 1 | 14,569 | 11,800 | 696 s |
| continuity-check | 1 | 17,241 | 6,519 | 2,136 s |
| chapter-extract | 1 | 21,205 | 27,139 | 1,848 s |
| reader-sim | 2 (1 failed) | 10,643 | 6,128 | 2,689 s |
| Total | 30 | 170,031 | 108,301 | 11,167 s (3.10 h) |

The chapter 1 steps (draft to reader) add up to 7,716,532 ms, the `perChapterMs` value. Because the continuity check and the chapter extraction ran at the same time, this sum is larger than the elapsed time.

Speed block (`run-summary.json` `speed`, `source`: `ollama`, meaning Ollama's internal timings, not wall-clock time; the two are not comparable):

| Scope | Median generation tokens/s | Median prompt tokens/s | Median first token |
|---|---|---|---|
| Overall | 29.47 | 175.08 | n/a |
| interview-question (12) | 27.85 | 231.91 | null |
| interview-extract (12) | 33.04 | 154.65 | null |
| draft-chapter (1, stream) | 27.88 | 97.04 | 242,738 ms |
| proofread (1) | 32.35 | 135.57 | null |
| continuity-check (1) | 26.95 | 150.37 | null |
| chapter-extract (1) | 27.06 | 134.56 | null |
| reader-sim (1 with usage) | 13.61 | 477.52 | null |

- First-token time exists only for the stream call (the draft): 242.7 s of the 346.6 s call passed before the first token, which fits a long thinking phase at effort `max`.
- Wall time against the Ollama-timing estimate (output tokens / generation rate + input tokens / prompt rate): the draft matches (347 s against 347 s); proofread 1.5 times; chapter extraction 1.6 times; continuity check 6.0 times; reader simulation 4.7 times; interview calls 1.5 to 1.9 times. The continuity check overlapped with the chapter extraction (both started within 9 ms), which explains part of its delay; for the reader simulation and the interview calls the cause is not in the record.
- `perChapterMs`: chapter 1 is 7,716,532 ms (2.14 h).

### 3.8 TTCW (reference only)

One chapter is read as the whole work, and the ending check is read as the chapter's close. LLM-judged TTCW does not agree with expert raters on average (criteria section 4), so use it for trends only.

Pass (5): scene versus summary balance (scene-led, with short background lines); language and devices (several precise images, though uneven); ending natural and earned (the bell image follows from the set-up); perspective and voice (Jiwon is convincingly disagreeable and the voices differ); world and setting at the sensory level (fog, iron, tar, salt and rope).

Fail (9): narrative pacing (time stretched evenly across nine floors, then compressed); understanding and coherence (C1, C3, C5); emotional flexibility (interiority is nearly absent); structural flexibility (predictable turns, the key is announced before it arrives); originality of theme and content; originality of thought (no cliche-free text: `A stone in her chest`); originality of form; character complexity (Yunseo exists to deliver the objects); rhetorical complexity (little subtext beyond the surface).

TTCW: 5 of 14 (35.7%). Reference values: Claude v1.3 30.0%, GPT-4 27.9%, New Yorker 84.7%.

### 3.9 Five-chapter totals

The run holds one chapter, so five-chapter totals cannot be given.
- Mean Q (chapter 1 only): 3.00.
- Publishable chapters: 0 of 1.
- Continuity errors per 10,000 words: 27.5 (all 8 items) or 13.8 (the 4 against bible or wiki), on 2,906 words.
- No cross-chapter contradictions can be measured.

### 3.10 Weakness list and improvement candidates

Ordered by expected effect.

| # | Weakness | Evidence | Improvement candidate | Expected effect |
|---|---|---|---|---|
| 1 | The draft does not keep the staging in the instruction and wiki (Yunseo on the stairs). | C1; the continuity check caught it (`calls/027`) | Add a repair loop: when the continuity check returns a high-severity flag, rewrite only the flagged scene with the flag text and the wiki line in the prompt. | High: removes the biggest T2 failure; the check already finds it. |
| 2 | Bookkeeping errors inside one chapter (objects, places, what the character has seen). | C3, C5, C6, C7; Q2 = 2 | Draft in two steps: a short beat list with where each object and character is at each beat, then the prose from the list. | Medium to high on Q2 and T2. |
| 3 | Staccato fragments, repeated frames, and paragraphs over the style card's three sentences. | 34 paragraphs; 127 of 347 sentences at 4 words or fewer; `did not` 27 times | A code check for sentences per paragraph and repeated openers, followed by a rewrite pass of only the failing paragraphs; add a "vary sentence length" rule to the draft prompt. | Medium on Q6, Q7 and C8. |
| 4 | Yunseo speaks in explaining sentences. | C2 | Put two or three of his lines from the voice card into the draft prompt; a code check on his dialogue length (for example more than 6 words) with a rewrite. | Medium on Q5 and T2. |
| 5 | Latency: 20 of 30 calls over the product limit; a proofread that returns nothing costs 11,800 output tokens; extraction output reaches 27,139 tokens. | Section 3.7 | Test a lower effort for proofread, extraction and checks; split chapter extraction into entries, facts and threads; avoid running the check and extraction at the same time on one local server. | High on time, if quality holds. This is a hypothesis to test, not a measured result. |
| 6 | Interview invents premises and repeats a question. | Calls 011, 017, 019, 023 | Give the question step the facts of the bible's synopsis as the only allowed premises; add a code check that rejects a question whose topic and key terms match a covered question; cap length at two sentences. | Medium on interview quality; saves roughly one of twelve turns. |
| 7 | Extraction attaches details the source does not state, and duplicates. | Calls 002, 020, 028; 4 relation pairs and 4 fact pairs | Add a rule "do not link a new item to a thread unless the source names the link"; pass known facts (not just names) to the interview extraction so it can skip duplicates. | Medium: cuts rejected proposals and duplicate cards or facts. |
| 8 | The reader simulation can break format and invent context; one quote is spliced. | `calls/029`; binge persona; genre quote | Give personas the previous summaries and wiki facts they are supposed to know; check quotes against the text in code; shorten the output schema. | Low to medium. |
| 9 | Localization gap in the harness. | `hangulLeft` 3, `Chapter 1 (새 회차)` | Add the label to the English substitution table. | Small, but keeps `hangulLeft` at 0 so real language slips stand out. |

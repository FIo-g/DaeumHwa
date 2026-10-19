# Track GUARDS: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:GUARDS:code

CODE MAP for the TRACK GUARDS (shared guard library, src/ai/guards). Read-only survey. Repo root: /home/xogud/documents/github/DaeumHwa. All paths below are relative to that root; line numbers verified by reading the files.

STATUS OF THE GUARD LIBRARY
- src/ai/guards does not exist (no directory, no file). Nothing is implemented yet.
- Several guard primitives already exist in src/lib, src/ai, src/server, or eval/novel. Reuse them rather than duplicate.

WHAT ALREADY EXISTS (reuse)
1. Character counts, with and without spaces: src/lib/korean/chars.ts:5-14 countChars(). withSpaces excludes only \r and \n (line 9). withoutSpaces excludes all \s. Code-point based. Used by src/server/chapters.ts:227,280,335, src/components/writing/manuscript-editor.ts-side, src/components/writing/writing-workspace.tsx:176, eval/novel/metrics.ts:48.
2. Sentence splitting (Korean and English terminators plus line breaks): src/lib/korean/sentences.ts:24-55 splitSentences(). Terminators '.!?…' with closers (line 17-18). Also sentenceAt/sentenceIn (58-71).
3. Exact-quote-in-source verifier: src/lib/korean/sentences.ts:77-102 locateQuote(text, quote, hint?). Exact match first (nearest to hint), then whitespace-collapsed match (map back to original offsets). Already used by src/ai/tasks/proofread.ts:46 (postProcess, lines 42-52), src/ai/tasks/continuity-check.ts:91 (locateIssues, lines 77-116), src/server/chapter-check.ts:89 (aiSpellChecker). The extraction evidence field is NOT verified (see Missing).
4. Foreign-script span finder: ALREADY WRITTEN, but only in eval. eval/novel/metrics.ts:34-39 (OTHER_SCRIPT_RUN = Han, Hiragana, Katakana, Cyrillic, U+FFFD; LATIN_RUN = [A-Za-z]{4,} for ko only; HANGUL_RUN for en only) and :52-55 (foreignRuns). This is the code to lift into src/ai/guards. The product src/ has no script regex (grep for \p{Script= and CJK ranges in src/ returns nothing).
5. Full chapter metric bundle (eval): eval/novel/metrics.ts:3-15 type ChapterMetrics; :17-30 META_PATTERNS (T4); :32 CLEAN_ENDINGS; :41-89 chapterMetrics(text, lang, targetChars). lengthOk at :49-50 (ko min = target, en min = 0.8*target, max 1.3*target). Paragraphs = non-empty lines (:57-60, :71-76). avgParagraphChars at :73. dialogueLineRatio at :75-76. Its MetricsSchema mirror is in eval/novel/author-io.ts:25 (z.object, must be extended if new fields are added), used in the draft_review Pending at eval/novel/author-io.ts:81-90.
6. Length shortfall (product): src/lib/chapter-length.ts:2-8 lengthShortfall(charCount, targetChars) returns percent or null; :10-13 shortfallMessage. Used only in UI: src/components/writing/writing-workspace.tsx:177-178 and src/components/chapters/chapter-table.tsx:157,280. Not used in the draft path.
7. Mention finder (entity names in text): src/lib/korean/mentions.ts:15 findMentions(text, targets) with josa-aware word-start rules. Used by src/ai/context.ts:140-143.
8. Naming and spelling (deterministic, product): src/lib/korean/naming.ts:33 findNamingIssues(); src/lib/korean/spelling-rules.ts:26 SPELLING_RULES, :189-221 ruleBasedSpellcheck(text). Used by src/server/chapter-check.ts:59-72 (ruleSpellChecker) and :211 / :332 (namingIssuesFor).
9. Dedupe keys (product, exact only): src/lib/proposal-payloads.ts:123-128 normalizeProposalText (whitespace collapse and trailing punctuation strip). Used by src/server/chapter-check.ts:286-300 (existingKeys for fact_create). src/ai/extraction.ts:134-136 collapse(), with seenFacts exact-key dedupe at src/ai/extraction.ts:362-368 (content = collapse(f.content)). src/server/interview.ts:279-281 normalizeQuestion (drops whitespace and punctuation) is the duplicate-question guard precedent.
10. Diff and search (NOT similarity tools): src/lib/diff.ts:10 diffTexts (history view), src/lib/search.ts:45 searchIndex (choseong and substring scoring). Neither gives a near-duplicate score. Grep for levenshtein, jaccard, bigram, dice, similarity in src and eval returns nothing.

MISSING (must be written in src/ai/guards)
- Repeated-word counter: no implementation anywhere (eval scores 반복 manually; the review cites 오른손/왼손 37 times, docs/eval/novel/follow-up-ai-improvement.md section E).
- Sample-copy detector against style-card examples: no implementation. Inputs exist: StyleCard.examples is a text field (src/db/schema.ts:321; src/server/styles.ts:15, 72, 113). The draft path already has the examples in hand at src/server/ai-features.ts:302-309 (styleCards map includes examples).
- Near-duplicate fact finder: no similarity function. Exact-key only (see item 9). Needed for backlog G (already-known facts re-proposed; src/server/interview.ts path has no fact-level dedupe at all).
- Paragraph splitter with sentence count per paragraph (Q6 "세 문장 이하" rule): only line split exists (eval/novel/metrics.ts:57-60). Sentence count per paragraph is not computed anywhere.
- Evidence verifier for extraction: src/ai/extraction.ts:384, 416, 432, 450, 473, 521 only trim evidence. It is never checked against the source text. ExtractionContext (src/ai/extraction.ts:60-88) carries no source text, so the check needs a new field or a separate call.
- Stored-facts input for interview extract: src/ai/tasks/interview-extract.ts:18 known has names and kinds only; no facts (backlog G). Built at src/server/interview.ts:170-200 (known list) and the call at :174.
- src/ai/guards directory itself, plus unit tests (colocated *.test.ts, per CLAUDE.md).

DATA FLOW A: PRODUCT DRAFT (entry to AI and back)
- Entry (HTTP): src/app/api/works/[workId]/draft/route.ts:48-107 POST. Validates body (:16-21, targetChars 500-20000, instructions max 5000, entryIds max 50). Calls startDraft at :68-74. Returns a plain-text ReadableStream (:76-92). Waits on `await done` (:82) and then closes; error record via draftErrorRecord (:85-86). X-Run-Id header (:95-97).
- Service: src/server/ai-features.ts:259-345 startDraft(db, actor, input, client?, signal?). Requires editor role (:270). targetChars from work settings (:272; default 5500 at src/db/types.ts:177, resolveWorkSettings at :186). Previous chapter tail (DRAFT_TAIL_CHARS 1500 at :51, slice at :299). Style cards with examples (:302-309). Context pack built from the INSTRUCTIONS text only (:314-317, buildContextPack with text: instructions). buildDraftPrompt at :318-323. Stream call at :328-344 via startAiStream with task 'draft-chapter', effort DRAFT_EFFORT (:334), maxTokens DRAFT_MAX_TOKENS (:335), system DRAFT_SYSTEM (:336).
- Prompt: src/ai/tasks/draft-chapter.ts:6-15 DRAFT_SYSTEM (the only length rule is line 13 "목표 분량에 가깝게 쓴다."; line 12 is paragraph rhythm). :17 DRAFT_MAX_TOKENS=16000, :18 DRAFT_EFFORT='high'. :36-63 buildDraftPrompt (target_length line 41-42; style_cards 47-49; wiki 51-53; previous_summary 55-57; previous_tail 59-61). :65-71 renderCard.
- Runner: src/ai/run.ts:135-190 startAiStream. Stream from client.streamText (:148-157). done (:167-189) writes ai_runs output {text} at :173-174 via finishRun. There is NO post-process hook in the stream path (contrast runAiTask at :109 which has task.postProcess). StreamRunArgs at :54-62 has no postProcess field.
- Client abstraction: src/ai/types.ts:37 AiClient interface; src/ai/index.ts:12 getAiClient.
- Save: src/components/writing/panels/draft-panel.tsx:147 createChapterFromDraftAction -> src/server/actions/ai-features.ts:34-39 -> src/server/ai-features.ts:347-365 createChapterFromDraft (checks run status done :361-363, reads output.text via draftText :367-375, then createChapter with versionSource ai_draft).
- The product currently runs NO guard on the draft text. The only server seam where the full text exists before the stream closes is route.ts:82-83 (await done), and the only seam where it is stored is run.ts:167-175.

DATA FLOW B: EVAL DRAFT STEP (the place guards are already measured)
- eval/novel/steps/chapter.ts:80-180 draft step. Retry loop :98-167. Break conditions :101 (verdict final) and :166 (usable or attempts >= maxAttempts). Generation at :111-124 calls product startDraft (:112-122) with ctx.client and targetChars ctx.bible.targetChars. Attempt file written at :135, attempts.push at :136. Metrics for the author at :143-153 (chapterMetrics(text, ctx.config.lang, ctx.bible.targetChars)). consult at :154. Verdict saved at :159-163. Best attempt chosen by pickAttempt at :169 (eval/novel/steps/util.ts:309-315). createChapterFromDraft at :171-176.
- maxDraftAttempts: eval/novel/cli.ts:121 (= 3).
- Author judgment: eval/novel/agents/author.md:53 (draft_review usable false when the draft mixes another language or has non-prose text) and :43 (quality 1-5). Pending/Answer schemas: eval/novel/author-io.ts:81-90 (Pending draft_review with metrics) and :127-131 (Answer).
- Other eval steps that call product services: proofread eval/novel/steps/chapter.ts:182-261 (runProofread at :196-197; applySuggestions util.ts:283-307); check :263-278 (runChapterCheck); continuity :280-324 (listIssues/resolveIssue); reader :361-373.
- Eval final metrics per chapter: eval/novel/cli.ts:428-439 (chapterMetrics on the saved text).
- eval/novel/eval-client.ts:3-117 wraps the AI tasks for eval (imports the product task objects). eval/novel/eval-client.test.ts:28, 136 imports DRAFT_SYSTEM.

DATA FLOW C: PRODUCT CHAPTER CHECK (continuity and extraction)
- Entry: src/server/chapter-check.ts:126-312 runChapterCheck(db, actor, {chapterId}, client?, signal?). Loads the chapter (:133, loadEditableChapter :107-119). Context pack from the FULL chapter text (:144: buildContextPack(db, workId, { text, position })). known via loadKnownEntries (:145; src/server/known-entries.ts:20-79). Naming rules (:146). Parallel AI calls (:163-204): continuityCheckTask (:164-172) and chapterExtractTask (:174-203). Both pass a sibling abort.
- Continuity post-process: src/ai/tasks/continuity-check.ts:119-135 resolveContinuityIssues -> locateIssues :77-116 (locateQuote at :91; drops issues without a valid fact or entry ref :95-97; duplicate range dedupe :98-100). continuityCheckTask.postProcess at :153-162 (usableSuggestion :67). Hook point for "no-mention is not a contradiction" (backlog H) and digit-fact check: here or in the prompt CONTINUITY_SYSTEM (:50).
- Naming issues: chapter-check.ts:211 and :327-350 namingIssuesFor (uses findNamingIssues, src/lib/korean/naming.ts:33).
- Persist issues: chapter-check.ts:231-236 replaceOpenIssues. Extraction to proposals: :238-258 (extractionToProposals, src/ai/extraction.ts:248). Fact dedupe against existing and pending: :265-303 (existingKeys :286-294, fresh filter :295-302). insertProposals :303.
- Context selection for the continuity call: src/ai/context.ts:114-306 buildContextPack. Entries chosen by mention in the text (:140-147). Facts for chosen entries (:154-160 onward). Budget loop DEFAULT_BUDGET_CHARS 12000 (context.ts:64; loop :285-300) drops relations, then threads, then oldest summaries, then entries (last-in). This is a likely cause of backlog H (missing 잿빛 종루 and 은색 열쇠 cards), but the survey cannot confirm which items were dropped in the eval run; that would need the run's pack.stats (stats.selectedEntries vs totalEntries at context.ts:61, :404).
- Chapter extract task: src/ai/tasks/chapter-extract.ts:82-89 (effort medium, maxTokens 16000, no postProcess). Input type :11-20.

DATA FLOW D: PRODUCT PROOFREAD
- Entry: src/server/chapter-check.ts:356-385 runProofread(db, actor, {chapterId, text?, useAi}, client?, signal?). Hard limit MAX_PROOFREAD_AI_CHARS=30000 at :51 and :365-370 (VALIDATION before any model call). ruleSpellChecker.check (:372). aiSpellChecker (:75-104) runs runAiTask(proofreadTask) at :85 and maps quotes with locateQuote at :89. Overlap removal at :378-380. Sort at :381-383.
- Task: src/ai/tasks/proofread.ts:9 PROOFREAD_KINDS; :25-33 PROOFREAD_SYSTEM (rules: quote short, do not touch dialogue or style; line 29). :35-53 proofreadTask (postProcess :42-52 drops empty quote or replacement equal to quote, relocates quote with locateQuote :46). Hook point for J (per-quote dedupe and "standard spelling only" rule): the postProcess, or PROOFREAD_SYSTEM line 27-31.
- Eval proofread apply: eval/novel/steps/util.ts:283-307 applySuggestions (drops invalid ranges, then the kept list). Eval step: eval/novel/steps/chapter.ts:182-261.

DATA FLOW E: INTERVIEW EXTRACT
- src/server/interview.ts:155-237 answerTurn. Question task at :112-130, extract task at :170-211 (known list :170-200 includes names, kinds, aliases, pending; threads :194-196). extractionToProposals at about :208 (uses pack and known context). Duplicate-question guard normalizeQuestion at :279-281 (precedent for near-dup).
- Task: src/ai/tasks/interview-extract.ts:11-21 InterviewExtractInput (known: name, kind, aliases, pending; no facts). Prompt builder :42-74 buildInterviewExtractPrompt. SYSTEM rules :23-39 (line 28: known cards reused by name; line 27: suggestedStatus rules). Task :76-84 (effort medium, maxTokens 8000).
- Eval interview steps: eval/novel/steps/interview.ts (not read in full).

CALL SITES OF SIGNATURES THAT WOULD CHANGE
- startAiStream (src/ai/run.ts:135) and StreamRunArgs (:54-62): call sites src/server/ai-features.ts:328, src/server/ai-features.ts (run and draft only), plus run.test.ts (many). Adding an OPTIONAL field (postProcess?) is additive and touches no callers.
- startDraft (src/server/ai-features.ts:259): callers src/app/api/works/[workId]/draft/route.ts:68, eval/novel/steps/chapter.ts:112, and ai-features.test.ts:184-313. Keep its return shape ({runId, textStream, done}); adding optional fields to input is additive.
- buildDraftPrompt (src/ai/tasks/draft-chapter.ts:36) and DraftPromptInput (:20-34): callers src/server/ai-features.ts:318, eval/novel/localize/localize.test.ts:298 (passes targetChars 3000 etc.), src/ai/tasks/draft-chapter.test.ts:42-89. Adding an optional field (minimum chars, sample-copy rule) is additive.
- DRAFT_SYSTEM (:6-15): tests that pin it: src/ai/tasks/draft-chapter.test.ts:27-37 (exact line array), :115 (contains TAG_DATA_RULE). e2e/ai-stub/responders.ts:45 and e2e/ai-stub/responders.test.ts:160 use the constant by import. eval/novel/localize/en-systems.ts:81 holds an English translation of DRAFT_CHAPTER_SYSTEM keyed by name at :153. Editing the Korean prompt requires the matching English text there (localize drift guard, see docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:228).
- chapterMetrics (eval/novel/metrics.ts:41) and ChapterMetrics (:3): callers eval/novel/steps/chapter.ts:152, :258; eval/novel/cli.ts:439; author-io.ts MetricsSchema :25-30 (must mirror any new field, or the Pending schema rejects it).
- continuityCheckTask / resolveContinuityIssues (continuity-check.ts:119, :137): callers src/server/chapter-check.ts:167, :212; eval/run-continuity.ts:10, :241.
- proofreadTask (proofread.ts:35): callers chapter-check.ts:85; eval-client.ts:115.
- locateQuote (sentences.ts:77): callers proofread.ts:46, continuity-check.ts:91, chapter-check.ts:89; and any tests.
- extractionToProposals (extraction.ts:248) and ExtractionContext (:60-88): callers chapter-check.ts:238, interview.ts (about :208), imports.ts (chapterExtractTask at :87). Adding a source-text field is additive if optional.
- ruleBasedSpellcheck (spelling-rules.ts:189) and findNamingIssues (naming.ts:33): callers chapter-check.ts:62 and :332.

WHERE THE NEW BEHAVIOR SHOULD HOOK IN (smallest diff)
- A. Length (min chars, retry): The eval loop already measures it (eval/novel/steps/chapter.ts:143-153, lengthOk from metrics.ts:49-50). Smallest eval change: after generation (chapter.ts:135-139), compute chapterMetrics; if lengthOk is false and attempts remain, push the attempt and `continue` the loop without calling consult (i.e., treat as not usable). The product has no auto-retry; smallest product change is a prompt change in DRAFT_SYSTEM (draft-chapter.ts:13) plus a minimum sentence in buildDraftPrompt (draft-chapter.ts:41-42), and a server-side check via a new optional postProcess on StreamRunArgs (run.ts:54-62, applied in run.ts:167-175) that stores the count in output.
- B. Voice (말투): no code hook needed for the guard itself. Prompt-side: DRAFT_SYSTEM line 10 already refers to style cards; the missing piece is that buildDraftPrompt gets no voice data for main characters (draft-chapter.ts:20-34). Interview side: interview-question.ts topics (INTERVIEW_TOPICS, :54) and interview-extract.ts SYSTEM. This is not a guard; list for completeness.
- C. Foreign script: eval hook is chapter.ts:143-153 (metrics.foreignRuns already present, metrics.ts:52-55). Make the guard return the spans (start, end, run) and re-generate or re-write only the sentence containing the span (sentences.ts:44-49 sentenceAt). Product hook: same as A (postProcess on StreamRunArgs, or route.ts:82-83 before finish).
- D. Scene consistency: the continuity result is consumed at chapter-check.ts:212-228; the self-review pass would sit between draft and proofread (eval/novel/steps/chapter.ts:263-278 check step). Not a guard; needs a new AI task. Note: continuity postProcess (continuity-check.ts:153-162) is the place that could drop issues with no mention ("언급 없음" rule).
- E. Paragraph rule, repeated words, sample copy: new pure functions in src/ai/guards. Hook in eval chapter.ts:143-153 (add fields to chapterMetrics and MetricsSchema author-io.ts:25-30) so the author sees them in draft_review. Product hook: same postProcess seam as C.
- G. Near-duplicate facts: product hook in src/server/chapter-check.ts:295-302 (fresh filter) and in src/ai/extraction.ts:362-368 (seenFacts). Interview hook: src/server/interview.ts:170-200 (pass facts into known, interview-extract.ts:18) and an exact check of evidence via a new source-text argument to extractionToProposals (extraction.ts:248) or a filter in interview.ts before proposals.
- H. Continuity context: chapter-check.ts:144 (pack) and context.ts:285-300 (budget trim). Smallest change: ensure chapter-text mentions keep their entries (exempt entries named in the manuscript from the trim loop at context.ts:285-300), and add the "no mention is not a contradiction" rule to CONTINUITY_SYSTEM (continuity-check.ts:50).
- I. Interview: src/server/interview.ts:95-150 askNextQuestion (chooses topic); INTERVIEW_TOPICS in src/ai/tasks/interview-question.ts:54. Not guard work.
- J. Proofread scope: proofread.ts:25-33 (system) and :42-52 (postProcess). Per-quote grouping can be added in postProcess (group by quote, keep all locations).

PRIORITY FOR THE GUARD LIBRARY (smallest first)
1. Move the foreign-script finder and paragraph line split out of eval/novel/metrics.ts:34-60 into src/ai/guards (eval keeps chapterMetrics; it imports countChars already at metrics.ts:1).
2. Add sentencesPerParagraph and repeatedWordCounts (new), reusing splitSentences (sentences.ts:24) and the line split.
3. Add sampleCopy(text, examples) using normalized substring windows; examples come from styleCards examples (ai-features.ts:302-309).
4. Add nearDuplicate(candidate, existing) using normalizeProposalText (proposal-payloads.ts:123) and a character-bigram Jaccard (new; no similarity code exists).
5. Add verifyQuoteInSource as a thin wrapper over locateQuote (sentences.ts:77) returning a boolean; evidence verification in extraction needs a new source-text argument.

OPEN QUESTIONS / NOT VERIFIED
- Whether the src/app/... draft UI (draft-panel.tsx) displays chapter length or metrics today: not checked.
- Whether eval/novel/steps/interview.ts has its own fact dedupe: not read in full.
- The exact threshold of the author's "세 문장 이하" rule is only in the author guide (eval/novel/agents/author.md); the product has no equivalent rule text other than the style card rules (draft-chapter.ts:65-71 renderCard).
- Product default targetChars 5500 (src/db/types.ts:177) differs from the eval bible (ko 5000 and en 12100 per docs/eval/novel/2026-10-18/summary.md section 1.2); not verified against eval/novel/bible.ts (not opened).

Files:
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts` 5-14 - countChars: with-spaces and without-spaces counts (reuse for length guard)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts` 17-55, 58-71, 77-102 - splitSentences (sentence split), sentenceAt/sentenceIn (locate sentence for a span), locateQuote (exact quote verifier with whitespace fallback)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/mentions.ts` 15-35 - findMentions: entity name detection, reuse for the 'named in manuscript' check (H)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.ts` 26, 189-221 - ruleBasedSpellcheck: deterministic spelling rules (product proofread)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/naming.ts` 33- - findNamingIssues: naming variant detection
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts` 2-13 - lengthShortfall/shortfallMessage: product length check, UI only, not in draft path
- `/home/xogud/documents/github/DaeumHwa/src/lib/proposal-payloads.ts` 123-128 - normalizeProposalText: dedupe key for near-dup guard
- `/home/xogud/documents/github/DaeumHwa/src/lib/diff.ts` 10-14 - diffTexts: history diff, NOT a similarity measure
- `/home/xogud/documents/github/DaeumHwa/src/lib/search.ts` 45- - searchIndex: card search, NOT near-dup
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 3-15, 17-30, 32-39, 41-89 - ChapterMetrics, META_PATTERNS, foreign-script regexes (to lift into src/ai/guards), chapterMetrics (T3 lengthOk at 49-50, T5 foreignRuns at 52-55, paragraphs at 57-76)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 25-30, 81-90, 127-131 - MetricsSchema mirror (extend for new fields), draft_review Pending and Answer
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 80-180, 98-101, 111-124, 135-139, 143-153, 154-167, 169-176, 182-261, 263-278, 280-324 - eval draft loop: generation via startDraft, attempt save, metrics for author, retry loop break conditions, createChapterFromDraft; proofread, check, continuity steps (hook for A, C, E)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 264-276, 283-307, 309-315 - selectDraftEntries, applySuggestions, pickAttempt
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 121, 428-445 - maxDraftAttempts=3, per-chapter metrics written after the run
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 35-56 - author judgment rules for draft_review, proofread, continuity
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 51, 259-345, 299, 302-309, 314-323, 328-344, 347-375 - startDraft: entry service for product draft (targetChars 272, previousTail 299, styleCards with examples 302-309, buildContextPack by instructions 314-317, buildDraftPrompt 318-323, startAiStream 328-344); createChapterFromDraft and draftText
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` 16-21, 48-107, 68-74, 81-86 - HTTP draft stream: body validation (targetChars 500-20000), startDraft call, await done before finish (the only server seam with full text before close)
- `/home/xogud/documents/github/DaeumHwa/src/server/actions/ai-features.ts` 34-39 - createChapterFromDraftAction wrapper
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx` 147 - client call to createChapterFromDraftAction
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 54-62, 135-190, 167-175 - startAiStream: StreamRunArgs (no postProcess field yet) and done handler that writes output {text}; the seam for an additive postProcess
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 82-129, 109 - runAiTask with task.postProcess (reference pattern for a postProcess hook)
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts` 37-50 - AiClient interface (streamText, generateObject)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-15, 17-18, 20-34, 36-63, 65-71 - DRAFT_SYSTEM (length rule only at line 13), DRAFT_MAX_TOKENS, DRAFT_EFFORT, DraftPromptInput, buildDraftPrompt, renderCard
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts` 27-37, 42-89, 115 - tests pinning DRAFT_SYSTEM lines and buildDraftPrompt (update when the prompt changes)
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 19-62, 64, 114-161, 263-306, 285-300, 404 - ContextPack types, DEFAULT_BUDGET_CHARS 12000, buildContextPack (mention-based entry choice 140-147), budget trim loop (285-300, drops entries last-in), stats (404)
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 27-51, 59-72, 75-104, 107-119, 126-163, 144, 163-204, 211, 230-236, 238-258, 265-303, 327-350, 356-385, 365-370, 372-383 - runChapterCheck (context pack from full text, continuity and extraction calls, naming issues, issue persistence, proposal dedupe 286-302) and runProofread (rule plus AI, 30k limit at 51 and 365-370, overlap at 378-380)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 11-27, 29-48, 50, 67-75, 77-116, 91, 119-135, 137-163, 153-162 - continuity schema, CONTINUITY_SYSTEM (rules, add 'no mention is not a contradiction'), locateIssues (quote located at 91), resolveContinuityIssues, postProcess
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 9-23, 25-33, 35-53, 46 - proofread schema and system prompt (rules at 27-31), postProcess with locateQuote (add per-quote grouping and standard-spelling-only rule here)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/chapter-extract.ts` 11-20, 82-89 - chapter extract input and task (no postProcess)
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction.ts` 17-58, 60-88, 134-136, 248-251, 362-368, 384 - Extraction schema, ExtractionContext (no source text field), collapse(), extractionToProposals entry, facts dedupe by exact key, evidence only trimmed (no source verification)
- `/home/xogud/documents/github/DaeumHwa/src/server/known-entries.ts` 9-14, 20-79 - KnownEntries loader (names and threads only, no facts) for extract dedupe
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 95-150, 112-130, 170-212, 208, 279-281 - interview question and extract calls; known list built 170-200 (no facts); normalizeQuestion 279-281 (dedupe precedent)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 11-21, 23-39, 42-74, 76-84 - InterviewExtractInput (known has no facts, line 18), SYSTEM rules, prompt builder, task
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 54 - INTERVIEW_TOPICS (for backlog I, not a guard)
- `/home/xogud/documents/github/DaeumHwa/src/server/styles.ts` 9-18, 53-88, 72, 113 - StyleCardInput with examples; examples trimmed on save (source for sample-copy detector)
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 321 - style card examples column (text, default empty)
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts` 169-186 - WorkSettings.targetChars, default 5500 at 177, resolveWorkSettings
- `/home/xogud/documents/github/DaeumHwa/src/server/chapters.ts` 227, 280, 335 - countChars call sites in chapter save and create (product-side counts)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/writing-workspace.tsx` 10, 13, 176-178 - UI lengthShortfall and countChars use before completing a chapter
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 5-6 - TAG_DATA_RULE, required in every tag-based system prompt (keep it in DRAFT_SYSTEM)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts` 81, 153 - English translation of DRAFT_CHAPTER_SYSTEM keyed by task name; must be updated with any Korean DRAFT_SYSTEM change (drift guard, see plan line 228)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 3-10, 110-117 - eval wrapper importing the product AI tasks
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 1-169 - backlog A to J, the evidence each track must move (sections 2 A-J)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 1-283 - evidence: section 1.2 (length, contradictions), 2.4 (spelling), 2.6 (style-card copying and paragraph rule counts)

Open questions:
- Whether src/app/... draft UI (draft-panel.tsx) shows chapter length or metrics today: not checked.
- Whether eval/novel/steps/interview.ts has its own fact dedupe: not read in full.
- The exact wording of the author's 'paragraph of three sentences or fewer' rule is only in eval/novel/agents/author.md or the eval style card, not in product code; not checked line by line.
- Product default targetChars is 5500 (src/db/types.ts:177) while the eval bible uses different values per docs/eval/novel/2026-10-18/summary.md section 1.2; eval/novel/bible.ts was not opened.
- The budget-trim explanation for the missing 잿빛 종루 and 은색 열쇠 cards (backlog H) is a likely cause from reading src/ai/context.ts:285-300 only; confirming it needs the stored pack stats from the eval run directory.

## survey:GUARDS:evidence

TRACK: Shared guard library (src/ai/guards). Read-only survey. No files were changed.

## 1. Evidence from the backlog, summary and six run reviews

Backlog track this serves: follow-up-ai-improvement.md:74-91 (E: paragraph rule, repeated words, sample copy), :57-63 (C: foreign script), :119-121 (G, H: name truncation, near-dup facts, quote check), :136-142 (J: spelling quote dedupe).

Concrete failures and current values (run order: qwen ko, qwen en, haiku ko, haiku en, luna ko, luna en):

- Character count (T3, shared by the pipeline): ko 5,450 (109.0%), en 15,069 (124.5%), haiku ko 3,505 (70.1%), haiku en 9,096 (75.2%), luna ko 3,473 (69.5%), luna en 9,888 (81.7%). Source: docs/eval/novel/2026-10-18/summary.md:54-59. The haiku en review says the minimum is 0.8 x target, so 9,096 < 9,680 fails.
- Foreign script (T5): qwen ko final text keeps 嬷嬷 (qwen3.8-27b-ko.md:52, :69, :298). All 3 draft attempts had Han (qwen3.8-27b-ko.md:69). The qwen ko run pre-dates the Han check (summary.md:202). Current metrics.ts:36-37 and metrics.test.ts:90-101 cover it. Hangul in English text (hangulLeft 3) comes from the untranslated prompt label `Chapter 1 (새 회차)` in all three en runs (summary.md:62, :152; haiku-5.5-en.md:103).
- Paragraph sentence rule ("문단은 세 문장을 넘기지 않는다", a style-card rule): qwen ko 33/141 (qwen3.8-27b-ko.md:145); qwen en 34 (summary.md:135; qwen3.8-27b-en.md:223); haiku ko 5 paragraphs (haiku-5.5-ko.md:103); haiku en 14/72 or more (summary.md:211); luna ko 0 (luna-6-ko.md:54); luna en 1/146 (summary.md:135).
- Repeated words: qwen ko 오른손/왼손 37 mentions (qwen3.8-27b-ko.md:156); qwen en "did not" 27 and "left hand" 20 (qwen3.8-27b-en.md:64); haiku ko "차갑" 4 times in a paragraph (haiku-5.5-ko.md:114).
- Sample copy (style-card examples reused): haiku ko near-copy `쇠가 손바닥에 달라붙을 만큼 차가워서` against the card's `쇠가 손바닥에 들러붙을 만큼 차가웠다.` (haiku-5.5-ko.md:118); luna en two close paraphrases of the card example (luna-6-en.md:68); luna ko vocabulary copied (luna-6-ko.md:77). Summary: 5 runs (summary.md:135, :238). Exact matching would miss the haiku case because the words differ.
- Near-duplicate facts: haiku ko 12/72 (about 17%) (haiku-5.5-ko.md:194); luna en about 9/58 (summary.md:107, :240); luna ko about 6 duplicates in the final wiki (luna-6-ko.md:125, :274); qwen en 4 fact pairs (summary.md:106). Cause: `<known>` gives names only (haiku-5.5-ko.md:195; luna-6-ko.md:125).
- Name truncation: qwen ko 4 rejections, haiku ko 2, luna ko 1 with two BAD_STATE failures; en 0 (summary.md:107). Example: `종루` for `잿빛 종루` (haiku-5.5-ko.md:185).
- Evidence exact-in-source: haiku ko 60/61 exact, 1 joined from two sentences (haiku-5.5-ko.md:209); luna ko 10/10 exact (luna-6-ko.md:137); qwen ko `철문로` for `철문으로` was approved (qwen3.8-27b-ko.md:260).
- Unapplied repeat quote: qwen ko `4층이상은` second occurrence (line 67) left in place because the suggestion pointed to the first occurrence (qwen3.8-27b-ko.md:291). Code cause, verified: sentences.ts:74-76 returns the first match when no hint is given, and proofread.ts:46 passes no hint.
- Spelling acceptance: qwen ko 3 distinct valid of 6 (qwen3.8-27b-ko.md:297); haiku ko 1 suggestion, rejected (summary.md:123); haiku en 3/3 valid; luna ko 1/4; luna en 0/4 (summary.md:123).
- Continuity recall: luna ko wiki block had 6 of 10 entries, missing the 잿빛 종루 card (summary.md:117; luna-6-ko.md:125 area). luna en had 4 entries, missing Silver Key and Bell Tower (luna-6-en.md:134). Cloud continuity runs flagged 0 issues each, so precision and recall cannot be measured (summary.md:112).
- Timeouts (wouldTimeOut): qwen ko 13/32, qwen en 20/30 (summary.md:141-142).

## 2. Length gate and enforcement (verified in code)

- The eval draft loop retries only when the author agent returns usable=false (eval/novel/steps/chapter.ts:101, :166). The metrics object, including lengthOk, is shown to the author (chapter.ts:152). No code gate exists.
- The product draft path has no length gate. The only use of lengthShortfall is a UI confirm (src/lib/chapter-length.ts:2; src/components/writing/writing-workspace.tsx:177; src/components/chapters/chapter-table.tsx:157).
- Product proofread (src/ai/tasks/proofread.ts:46) and chapter check (src/server/chapter-check.ts:89) use locateQuote. Extraction evidence (src/ai/extraction.ts:416) and the interview evidence path are not checked against the source.

## 3. Inventory: what exists and should be reused

Exists, reuse:
- countChars(text) returns withSpaces and withoutSpaces, code-point based (src/lib/korean/chars.ts:5). Already used by chapters.ts:227.
- splitSentences(text) splits at terminator runs and closers and at line breaks (src/lib/korean/sentences.ts:10). Known gap: Latin abbreviations such as "Mr." would split. Use it per paragraph.
- locateQuote(text, quote, hint?) exact then whitespace-normalized match (sentences.ts:63-80). Use for the exact-quote verifier. Gap: it returns only one occurrence.
- findNamingIssues (src/lib/korean/naming.ts:33) matches explicit variant lists only. It does not detect truncations automatically.
- stripJosa, josaStrippedForms, matchesName (src/lib/korean/josa.ts:72, :83, :98). Use for eojeol normalization in the repeated-word counter and the name-truncation check. Not yet verified how they behave on edge cases.
- Script regexes in eval/novel/metrics.ts:36-39 (OTHER_SCRIPT_RUN, LATIN_RUN, HANGUL_RUN). Private to eval. Move to src/lib/korean, and add offsets.
- lengthShortfall (src/lib/chapter-length.ts:2) has no upper bound. metrics.ts:50 has the 1.3 upper bound.
- diffTexts (src/lib/diff.ts:10) and searchIndex (src/lib/search.ts:45) are for history diff and card search. Neither is a similarity measure.

Missing (must be written):
1. Script span finder with offsets for Han, kana, Cyrillic, and Hangul/Latin where relevant. Current code returns strings only.
2. Paragraph splitter and per-paragraph sentence counter. metrics.ts:57-73 counts non-empty lines as paragraphs and does not count sentences per paragraph.
3. Repeated-word counter over eojeol stems. Nothing exists.
4. Sample-copy detector (shingles or n-gram overlap against style-card examples). Nothing exists; no similarity or shingle code anywhere in src or eval (grep).
5. Near-duplicate fact finder (token or n-gram similarity between fact sentences). Nothing exists.
6. Name-truncation check: proper substring of an existing canonical name. Nothing automatic exists.

## 4. Proposed acceptance criteria (metric, current value per run, target, how to measure)

1. T3 length. Measure: metrics.lengthOk and chars. Current: ko 109.0 / 70.1 / 69.5 %; en 124.5 / 75.2 / 81.7 %. Target: ko >= 5,000 with spaces in 6 of 6 runs with at least one retry; en minimum needs a decision (open question 1). Already measurable.
2. T5 foreign script. Measure: metrics.foreignRuns with the new offsets, rerun on saved 01.md. Current: qwen ko 1 (嬷嬷), others 0. Target: 0 in all runs; hangulLeft 0 after label fix. Partly measurable; needs re-scoring of the qwen ko text.
3. Paragraph sentence rule. Measure: new paragraph counter. Current: qwen ko 33/141, qwen en 34/97, haiku ko 5/86, haiku en 14/72+, luna ko 0/106, luna en 1/146. Target: <= 2% of paragraphs over 3 sentences. Missing metric.
4. Repeated words. Measure: new counter. Current: qwen ko 37 (오른손/왼손), qwen en "did not" 27, "left hand" 20. Target: no stem above a threshold (propose <= 1 per 500 chars, outside dialogue tags, calibrated on the first run). Missing metric.
5. Sample copy. Measure: shingle overlap with style-card examples. Current: haiku ko, luna en, luna ko, qwen ko, haiku en (5 runs). Target: 0 shared 8-word (en) or equivalent ko runs. Missing metric; no current numeric value recorded.
6. Near-dup facts. Measure: code similarity flag on proposals, plus author-approved duplicates from author-decisions.jsonl. Current: haiku ko 12/72 (16.7%), luna en ~9/58 (15.5%), luna ko ~6/62 (9.7%), qwen en 4 pairs. Target: <= 2% of proposals, 0 duplicates in final wiki. Partly measurable (decisions file exists per qwen3.8-27b-ko.md:14); no code metric.
7. Name truncation. Measure: author rejections for truncated names and the new check. Current: qwen ko 4, haiku ko 2, luna ko 1, en 0. Target: 0. Partly measurable.
8. Evidence exact-in-source. Measure: exact-match rate of evidence against chapter text or answer text. Current: haiku ko 60/61 (98%), luna ko 10/10, qwen ko 철문로 mismatch. Target: 100% exact. Missing metric; computable from calls/*.json.
9. Repeated quote coverage. Measure: occurrences of each approved quote that remain unfixed. Current: qwen ko 1 remaining (line 67). Target: 0. Missing metric; root cause is sentences.ts:74-76 with proofread.ts:46.
10. Spelling validity. Measure: reviewer-valid suggestions per run. Current: qwen ko 3/6, haiku ko 1 rejected, haiku en 3/3, luna ko 1/4, luna en 0/4. Target: >= 50% valid per run. Measurable from the review and author decisions.
11. Continuity recall. Measure: wiki entries present in the manuscript that reach the continuity prompt, and seeded-error detection via eval/run-continuity.ts (exists; imports continuityCheckTask). Current: luna ko 6/10 entries, luna en 4 entries. Target: 100% of manuscript-named entries in context; detection of seeded errors reported. Entry coverage is missing; seeded detection is partly available.
12. Timeouts. Measure: wouldTimeOut count (eval-client.ts:490, finish.ts:113). Current: qwen ko 13/32, qwen en 20/30. Target: guard passes add little time; report separately. Measurable.

Harness note: eval texts are gitignored (summary.md:274), so the numbers above come from the reviews and summary only. Rescoring needs the author's machine.

## 5. Discrepancies

- qwen ko paragraph count: metrics.ts shows 144 (qwen3.8-27b-ko.md:44); the review's 33/141 uses 141 (line 145). The difference is unexplained (maybe separator lines).
- The en length floor 0.8 (metrics.ts:49) is cited as "설계서 6.5의 환산 비율" in docs/eval/novel-quality-criteria.md:58, but the 6.5 section I read (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:186-200) gives no ratio.
- qwen ko T5 evidence was recorded before the Han check (summary.md:202). The current harness would flag it on rescoring.

Unverified: whether the existing josa.ts helpers handle every Korean eojeol needed by the repeated-word counter.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - backlog items A, C, E, G, H, J and the track's targets
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - cross-run numbers: T3 lengths (:54-59), paragraph and quote rules (:135), duplicates and name truncation (:106-107), recall (:117), timeouts (:141-142), ranked candidates (:232-244)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - paragraph rule 5 places (:103), sample copy (:118), duplicates 12/72 (:194), name truncation (:185), evidence 60/61 (:209)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - hangulLeft label cause (:103)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - duplicates in final wiki (:125, :274), evidence 10/10 (:137), paragraph 0 violations (:54, :77)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - sample copy paraphrases (:68), continuity entries 4 (:134), hangulLeft label (:151)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - Han in final text 嬷嬷 (:52, :69, :298), paragraph rule 33/141 (:145), 오른손/왼손 37 (:156), 철문로 (:260), duplicate quote 4층이상은 (:291), spelling 3/6 (:297)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - did not 27, left hand 20 (:64), paragraph violations 34 (:223)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - existing foreign-run regex (:36-39), chapterMetrics with lengthOk (:49-50) and paragraphs as lines (:57-73)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.test.ts`  - foreign run tests incl. 嬷嬷 (:90-101)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts`  - splitSentences (:10), locateQuote first-match behavior (:63-80)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts`  - countChars (:5)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/naming.ts`  - findNamingIssues explicit variants only (:33)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/josa.ts`  - stripJosa, josaStrippedForms, matchesName (:72, :83, :98)
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts`  - lengthShortfall with no upper bound (:2), used only in UI
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - locateQuote without hint (:46)
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - locateQuote use (:89)
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction.ts`  - evidence taken without source check (:416)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - retry only on author usable verdict (:101, :166), metrics shown to author (:152)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - wouldTimeOut (:490)
- `/home/xogud/documents/github/DaeumHwa/eval/run-continuity.ts`  - seeded continuity harness, reusable for recall
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md`  - T3 and T5 definitions (:58, :60)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - section 6.5 English localization, no length ratio found (:186-200)

Open questions:
- English length floor: metrics.ts:49 uses 0.8 x target, but no ratio appears in spec section 6.5 (the criteria doc points there). Which ratio is intended?
- Paragraph count: metrics.ts counts non-empty lines (144 for qwen ko) while the review's 33/141 used 141. Should paragraphs exclude scene separators like '---', and what is the canonical denominator?
- Repeated-word threshold and sample-copy length cutoff have no baseline. Should they be calibrated on the 6 saved runs on the author's machine (texts are gitignored, per summary.md:274)?
- Near-dup and name-truncation checks need a code-side fact list. Does the author-decisions.jsonl record duplicate and truncation reasons in a machine-readable form (not verified)?
- Haiku en paragraph violation count (14/72) is cited only from summary.md:211; the source review's exact paragraph total was not located in this read.

## survey:GUARDS:risks

READ-ONLY SURVEY: GUARDS shared library (src/ai/guards) — risks and neighbours. No files were edited. src/ai/guards does not exist (checked; no references to it anywhere in src, eval or docs).

== 1. What src/lib and src/ai already offer (reuse, do not duplicate) ==
- Char counts: countChars(text) -> {withSpaces, withoutSpaces}, code-point based, excludes only \r\n from withSpaces (src/lib/korean/chars.ts:5). Already used by editor, chapters.ts:227/280/335, and eval (eval/novel/metrics.ts:1, 48). Reuse; the guard "with and without spaces" count is already done.
- Length gate: lengthShortfall(charCount, targetChars) returns {percent} or null, null at/over target, no upper bound (src/lib/chapter-length.ts:2-7); shortfallMessage (chapter-length.ts:10). Used by writing-workspace.tsx:176-178 and chapter-table.tsx:157,280. NOTE mismatch: eval chapterMetrics uses ko >= target, en >= 0.8*target, and an upper bound 1.3*target (eval/novel/metrics.ts:49-50). Product and eval thresholds differ; an A-track guard must pick one and the eval must import it.
- Sentence/line splitting: splitSentences(text) -> {text,start,end}[] splitting at terminator runs (.!?…) with closers, and at \n/\r (src/lib/korean/sentences.ts:10-40). There is NO paragraph splitter: a paragraph is a line (eval metrics splits on '\n', eval/novel/metrics.ts:57-62; the draft prompt asks for short paragraphs, src/ai/tasks/draft-chapter.ts:11). English: splitSentences handles '.', '!', '?', but no abbreviation handling (Mr., e.g.) — untested assumption, flag it.
- Exact-quote verifier: locateQuote(text, quote, hint?) -> {start,end}|null, exact match first (nearest hint), then whitespace-collapsed fallback (sentences.ts:63-85). Already the verifier in 5 places: proofread.ts:46, continuity-check.ts:91, chapter-check.ts:89, reader-sim.ts:101 (imported from '@/lib/korean'), components/writing/panels/shared.ts:27. G1's "exact quote in source" check is therefore done; G1 only needs to add the call on extraction evidence (chapter-extract.ts:20 prompt says evidence must be verbatim, but no postProcess in chapter-extract.ts:83-89 checks it; interview-extract.ts has no postProcess either).
- Foreign-script runs: ONLY in eval: OTHER_SCRIPT_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}�]+/gu (eval/novel/metrics.ts:36-37), LATIN_RUN (:38), HANGUL_RUN (:39), used for T5 (metrics.ts:52-55). Product code has no equivalent (grep of src for \p{Script / 一 found nothing). Track C should extract this from eval into the library and point eval at it.
- Repeated words: none. Sample-copy detector: none. Near-duplicate fact finder: none (dedupe is exact-key: imports.ts:781-783 factKey = canonicalName + collapseSpaces(content); normalizeQuestion strips punctuation/space for exact compare, interview.ts:279-281). Name dedupe is NameIndex in extraction.ts (name-based, extraction.ts:248-330).
- Other reusable: ruleBasedSpellcheck (src/lib/korean/spelling-rules.ts:189, rules array :26); findNamingIssues (src/lib/korean/naming.ts:33); matchesName/findNameMatch/stripJosa (src/lib/korean/josa.ts:72,98,108); diffTexts/diffStats (src/lib/diff.ts:10,17, word tokenization keeps Korean eojeol); searchIndex with es-hangul choseong (src/lib/search.ts:28,45); splitChapters/detectHeading (src/lib/import/split.ts:19,40); META_PATTERNS for meta lines (eval/novel/metrics.ts:17).

== 2. Missing (must be written) ==
- Korean and English paragraph splitter (blank-line or single-line policy must be decided; current code treats each line as a paragraph).
- Foreign-script span finder with offsets (eval has only a grouped string list, no offsets; the guard needs start/end to re-generate the sentence).
- Repeated-word counter (Korean eojeol and English word; with a stopword/particle policy).
- Sample-copy detector against style-card examples (style card examples: schema src/db/schema.ts:321, prompt use src/ai/tasks/draft-chapter.ts:66-69; no detection exists).
- Near-duplicate fact finder (needs a similarity function; none in src/lib).
- Sentences-per-paragraph check (no code today; E1).

== 3. Duplication risk / which tracks touch the same files ==
- E1, E2, C, A all need the guard functions and would otherwise re-implement eval metrics.ts logic. Move OTHER_SCRIPT_RUN/LATIN_RUN/HANGUL_RUN and the paragraph line-split out of eval/novel/metrics.ts; eval/novel/metrics.ts is imported by eval/novel/cli.ts:18 and eval/novel/steps/chapter.ts:12. Changing the T5 definition there changes the eval baseline; the author must accept this.
- A (length) touches: src/ai/tasks/draft-chapter.ts (prompt, DRAFT_MAX_TOKENS :17, DRAFT_EFFORT :18), src/server/ai-features.ts startDraft (:259-346, the length target and the stream call), eval/novel/steps/chapter.ts (chapter loop).
- B (speech style) touches: src/ai/tasks/interview-question.ts (question prompt), interview-extract.ts (new voice field needs schema change in src/ai/extraction.ts), draft-chapter.ts (style cards rendering renderCard :64-70), src/db/schema.ts (style cards, :321 area).
- I (interview) touches src/ai/tasks/interview-question.ts (effort 'low', maxTokens 2000 at :194-195) and src/server/interview.ts (repeat check :120, normalizeQuestion :279). Also overlaps interview reliability plan (docs/superpowers/plans/2026-10-18-interview-ai-reliability.md Task 7 "Extraction dedup and naming rules" and Task 8 "Continuous interview") — those are already-planned work that may be shipped or in flight; check status before treating I and G1 as new.
- G1 touches src/ai/extraction.ts (extractionToProposals :248), src/server/imports.ts (dropRepeatedProposals :792, factKey :781), src/ai/tasks/chapter-extract.ts, interview-extract.ts; G2 touches the same extraction.ts and threads.ts (createThread :219, planned status handling in chapter-extract.ts prompt rules), relations.ts.
- H (continuity) touches src/ai/tasks/continuity-check.ts (task maxTokens 16000 and effort 'high' at :139-140; locateIssues :80-100), src/server/chapter-check.ts (continuity call; ProofreadSuggestion type :34; MAX_PROOFREAD_AI_CHARS :51).
- J (proofread) touches src/ai/tasks/proofread.ts (PROOFREAD_SYSTEM; maxTokens 16000 at :38; postProcess :43-53), src/server/chapter-check.ts (ruleSpellChecker :59, MAX_PROOFREAD_AI_CHARS :51 = 30,000 chars rejected before model call), src/lib/korean/spelling-rules.ts. F1 (proofread split in three) collides with J and E2 on the same proofread path.
- HX1 (reviewer blinding), HX2 (English substitution table), HX3 (author sees wiki), HX4 (summary save, resume, copy retry, resummarize) all touch eval/novel/* and .claude/workflows/novel-eval.js (the workflow already keeps model names out of run paths, novel-eval.js:72-77, but the backlog says calls/*.json model field leaks; metrics.ts and finish.ts:115 hangulLeft). They do not touch src/ai, except HX3 may read src/ai/context.ts (context pack, 462 lines) to show wiki to the author agent.
- D (scene consistency two-step draft) touches draft-chapter.ts prompt and ai-features.ts startDraft, plus run.ts timing (two calls per draft).
- F1, F2, F3, F4 touch src/ai/run.ts, src/ai/ollama.ts, src/ai/tasks/reader-sim.ts (effort 'medium' :55, maxTokens 16000 :56), chapter-extract.ts, proofread.ts. F4 (local serialization, effort switch) touches src/ai/ollama.ts and src/ai/opencode.ts; the guard library is pure, so it does not depend on F4 except through timing.
- C (foreign-script block) is the most local: it inserts a check after startDraft output and before createChapterFromDraft (ai-features.ts:347 area), and it needs run.ts streaming awareness, because the stream text is returned as-is (ollama.ts:356-358 says think block returned as-is). Also note ollama's LEADING_THINK strip (ollama.ts:102) — C must run after think removal.
- Everyone who writes the chapter body depends on draft output being final: A, C, D, E1, E2 all post-process the same string at the same place.

== 4. CLAUDE.md invariants that apply ==
- Korean user-facing copy: any new message (shortfall, foreign-script warning, sample-copy warning) must be short Korean; identifiers and comments English. (CLAUDE.md "Rules").
- Services throw AppError(code, koreanMessage); codes are in src/lib/errors.ts:1-14 (NOT_FOUND, FORBIDDEN, CONFLICT, VALIDATION, AI_LIMIT, AI_ERROR, CANCELLED, BAD_STATE, UNAUTHENTICATED). A guard that rejects a draft should map to AI_ERROR or BAD_STATE, not a new code without adding it to errors.ts.
- Actions: withAction + revalidateWork + ActionResult; never throw. Guards are pure, so they belong in src/ai or src/lib, not in server actions. Any new server action that runs a guard must parse with zod first.
- requireWorkRole: ai-features.ts calls it at :66, :119, :199, :275 (editor). A new guard entry point must call requireWorkRole(db, workId, actor.userId, 'editor') first (access.ts).
- Non-members get NOT_FOUND (access.ts), not a hint.
- change_log in the same transaction: wiki writes go through proposals.ts approval (db.transaction at proposals.ts:642, 693 per-proposal transaction). Any G1/G2 change that alters what proposals contain must keep approval the only path; AI must not write wiki tables. Track G changes only extraction.ts/imports.ts proposal creation, not table writes.
- Archive, never delete: wiki rows use archived_at (schema.ts:44-49, 118, 165) and status 'archived' (schema.ts:65). Entry or relation dedupe must not delete rows.
- Day boundaries Asia/Seoul: relevant only to daily token limit (run.ts DEFAULT_DAILY_TOKEN_LIMIT, see §5).
- Next.js: pages/route handlers that trigger AI need export const maxDuration = 300 (CLAUDE.md). The guard library itself does not touch Next APIs, so the Next docs read is not needed for the library; any new route that calls AI (e.g., a new draft-retry route) must export maxDuration = 300.
- Tests: colocated *.test.ts; AI via FakeAiClient in @/test/fake-ai and @/test/ai-fakes. Guard tests are pure unit tests (no DB, no AI).

== 5. What could regress ==
- Timeouts: default structured call 120_000 ms (run.ts:28); streamed drafts 280_000 ms (run.ts:30), used by startDraft (ai-features.ts:328-336). The 120 s figure in the task text is only the structured default; drafts are 280 s. Timeouts are per call (responses.ts:207, anthropic.ts:313-319, run.ts:72 AbortSignal.timeout). A retry or two-step draft (A, D, C re-generation, E1 rewrite) adds calls with no shared overall budget: a draft plus one retry can exceed the 280 s of the single draft call budget only in the sense that each call restarts its own clock, so total wall time grows without a cap. The guard design needs a shared deadline or a call-count cap.
- Token limits: DRAFT_MAX_TOKENS = 16000 (draft-chapter.ts:17); proofread maxTokens 16000 (proofread.ts:38); continuity-check 16000 (continuity-check.ts:140); interview-extract 8000 (interview-extract.ts maxTokens); interview-question 2000 (interview-question.ts:195). Adding a voice field (B), spans (C), or dual-step bit lists (D) grows output; if the draft is longer than the cap it truncates. Local qwen truncation is already recorded (follow-up backlog F: 32,000 token output limit reached on spelling). Not measured here: characters per token for Korean, so a precise budget needs the eval numbers.
- Prompt injection: every prompt wraps user text with neutralizeDeep (draft-chapter.ts:37, interview-extract.ts, chapter-extract.ts, all tasks) and neutralizeTags (prompt-utils.ts:11), and each system prompt includes TAG_DATA_RULE (prompt-utils.ts:5). New prompts (two-step beats, sample-copy warnings, retry instructions) must (a) run neutralizeDeep on every input object, including the previous draft text and style examples, and (b) include TAG_DATA_RULE. Retry prompts that feed a model's own draft back in are a new injection path unless neutralized.
- Concurrency cap: MAX_RUNNING_RUNS = 3 per user (run.ts:23) and RUNNING_STALE_MS = 10 min (run.ts:25). F1 (proofread in three) and F3 (reader personas in parallel) both create several running runs at once; they will hit CONCURRENCY_MESSAGE (run.ts) unless the fan-out is serialized or the cap is raised. This is a real risk, not a guess: the cap is a constant and the limit message is in Korean (run.ts).
- Daily token limit: DEFAULT_DAILY_TOKEN_LIMIT = 3,000,000 (run.ts:20) counted per AI run; extra calls from A, D, F1–F3 spend it faster.
- Streaming: drafts stream through startAiStream (run.ts:135); streamed text is returned as-is (ollama.ts:356-358), so any post-check (C, E1, E2, A) must run after the stream completes, and the abort/retry logic in responses.ts:206-250 retries only before any body text is read (responses.ts:208, 245). A guard retry after partial output must not replay text already sent to the caller.
- Eval baseline drift: changing eval T3/T5 definitions in eval/novel/metrics.ts changes the comparison against docs/eval/novel/2026-10-18 results; the follow-up doc says rerun on a new date (follow-up-ai-improvement.md §1), so a dated baseline must be frozen first.
- Overwriting drafts: createChapterFromDraft (ai-features.ts:347) saves a version with source ai_draft; a guard that auto-retries must not silently replace a user-visible draft without a version record.

== 6. Proposed minimal public interface (pure, src/ai/guards/index.ts, re-exporting from src/lib where existing) ==
// src/ai/guards/index.ts
export type Lang = 'ko' | 'en'
export type Span = { start: number; end: number; text: string }

export function charCounts(text: string): { withSpaces: number; withoutSpaces: number } // reuse countChars from '@/lib/korean/chars', do not re-implement
export function splitParagraphs(text: string): Span[]           // NEW; blank-line or single-line policy must be decided (open question)
export function splitSentences(text: string, lang: Lang): Span[] // reuse '@/lib/korean/sentences' splitSentences; lang param only if English needs its own rule
export function foreignScriptSpans(text: string, lang: Lang): { start: number; end: number; script: 'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul'; text: string }[] // NEW; extract from eval/novel/metrics.ts:36-39
export function repeatedWords(text: string, opts?: { minCount?: number; lang?: Lang; allow?: string[] }): { word: string; count: number }[] // NEW
export function sampleCopies(text: string, examples: string[], opts?: { minRun?: number }): { start: number; end: number; example: string }[] // NEW
export function verifyQuote(source: string, quote: string, hint?: number): Span | null // REUSE locateQuote (@/lib/korean/sentences.ts:63); thin wrapper only
export function nearDuplicates(items: string[], threshold: number, lang: Lang): { a: number; b: number; score: number }[] // NEW

Note: none of these should take a DB, AI client or Actor. Keep AppError out of the library; return data and let the service decide the Korean message and code.

== 7. Open questions for the author ==
1. Paragraph definition: single newline (current eval/line behavior) or blank-line separated (Korean web novels often use single newlines)? This changes E1 counts.
2. English length threshold: keep eval's 0.8 for en and 1.3 upper bound, or align with the product's single shortfall rule (lengthShortfall, chapter-length.ts:2)?
3. Foreign-script rule for English drafts: eval counts Hangul as foreign in en (metrics.ts:52-55). Is Hangul in an English manuscript always an error, or only in the substitution table case (HX2)?
4. Sample-copy threshold: minimum run length (characters or words) that counts as copying a style example?
5. Repeated-word policy: which words are allowed (particles, 'said', names)? Threshold per 1,000 chars?
6. Near-duplicate fact: lexical (character n-gram) or embedding-free only? Any similarity threshold chosen from data?
7. Retry budget: maximum extra draft calls per chapter, and whether the 280 s stream budget covers the whole chapter (shared deadline) or each call separately.
8. Concurrency: may F1 and F3 raise the MAX_RUNNING_RUNS cap (run.ts:23), or must fan-out run serially?
9. Should guards run on local models only (qwen T5 case) or on all models?
10. Does the eval continue to import its own metric functions, or must the guard library be the single source (affects baseline comparability)?
11. Interview track I: is the interview reliability plan (docs/superpowers/plans/2026-10-18-interview-ai-reliability.md, Tasks 7–8) already merged? The survey did not check git history for those tasks.
12. Voice field (B): does adding a voice (말투) field to entries require a DB migration (db:generate per CLAUDE.md) and a new fact or entry field, which is an author-visible wiki change?

Files:
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts` 5-12 - countChars (reuse for with/without spaces)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts` 10-40, 63-85 - splitSentences (sentence/line split), locateQuote (exact-quote verifier)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 17-39, 41-80 - Eval-only duplicates: foreign-script runs (T5), line-based paragraphs, lengthOk thresholds (ko 1.0, en 0.8, upper 1.3)
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts` 2-14 - lengthShortfall and shortfallMessage (product length gate)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.ts` 26, 189 - ruleBasedSpellcheck, SPELLING_RULES
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/naming.ts` 33 - findNamingIssues
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/josa.ts` 72, 98, 108 - stripJosa, matchesName, findNameMatch
- `/home/xogud/documents/github/DaeumHwa/src/lib/diff.ts` 10-17 - diffTexts, diffStats (eojeol tokenizer)
- `/home/xogud/documents/github/DaeumHwa/src/lib/search.ts` 28, 45 - buildSearchIndex, searchIndex (choseong)
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 5, 11, 17 - TAG_DATA_RULE, neutralizeTags, neutralizeDeep
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 20, 23, 25, 28, 30, 36-39, 82, 135 - Timeouts (120s default, 280s stream), MAX_RUNNING_RUNS=3, daily token limit, startAiStream
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 4-18, 37-40, 64-70 - Draft system prompt, DRAFT_MAX_TOKENS 16000, DRAFT_EFFORT high, neutralizeDeep, style card render
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 26, 66, 119, 259-346 - startDraft (requireWorkRole, targetChars, stream call), reader-sim and advice role checks
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 38-53 - Proofread task, maxTokens 16000, postProcess uses locateQuote
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 14-15, 34, 51, 59, 62, 85-89, 332 - Rule checks, proofread call, MAX_PROOFREAD_AI_CHARS 30000, continuity call
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 80-100, 139-140 - Continuity task (effort high, maxTokens 16000), locateIssues
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/chapter-extract.ts` 17-48, 83-89 - Extraction task; evidence-verbatim rule with no postProcess check
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 12-83 - Interview extraction; maxTokens 8000; no evidence verification
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 194-195 - Question generator (effort low, maxTokens 2000)
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 91-92, 120-126, 279-281 - Repeat check via normalizeQuestion (exact after stripping punctuation)
- `/home/xogud/documents/github/DaeumHwa/src/server/imports.ts` 781-783, 792 - factKey and dropRepeatedProposals (exact key dedupe, no similarity)
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction.ts` 32-53, 92, 248-330 - ExtractionSchema evidence field; extractionToProposals name-based dedupe
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction-rules.ts` 1-20 - ENTITY_NAME_RULES, ROLE_WORDS shared by extraction prompts
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts` 36-37, 284, 642, 693 - Approval transaction (db.transaction) where change_log is written
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 44-49, 65, 118, 165, 321 - archived_at / status archive rule; style card examples column
- `/home/xogud/documents/github/DaeumHwa/src/lib/errors.ts` 1-26 - ErrorCode union and AppError
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts` 100-104, 356-358 - Think-block strip and stream return as-is (local model path)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 12, 152, 258 - Eval chapter step: calls chapterMetrics with targetChars
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 1-200 - Backlog A–J, F1–F4, HX1–HX4 (source of tracks)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md` 201-296 - Overlapping prior plan: Task 7 extraction dedupe and naming, Task 8 continuous interview (status not checked)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts` 11-25 - Demo draft fake (test code) used by guard tests

## survey:GUARDS:specs

TRACK: shared guard library (src/ai/guards). Read-only survey. Nothing was edited or run.

== 1. What already exists (reuse, do not duplicate) ==
- Char counts: src/lib/korean/chars.ts:5-14 countChars → {withSpaces (excludes only \r \n), withoutSpaces (excludes all \s)}. Used by src/server/chapters.ts:227,280,335 and src/components/writing/manuscript-editor.tsx:73. This matches the spec definition (MVP spec §9, docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:362).
- Target shortfall: src/lib/chapter-length.ts:2-13 (lengthShortfall, shortfallMessage). Spec: docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:119 (§F UX, 목표 분량 warning, 서버는 막지 않음).
- Exact-quote verifier: src/lib/korean/sentences.ts:63-~90 locateQuote (exact match, nearest to hint; then whitespace-collapsed match; returns original offsets). Used by src/server/chapter-check.ts:89, src/ai/tasks/reader-sim.ts:101, src/components/writing/panels/shared.ts:27. Spec: MVP design §5 F7 (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:232) and F14 (:269). Not case-insensitive. The eval backlog wants case-insensitive matching (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md, summary §5 row 11).
- Sentence split: src/lib/korean/sentences.ts:10 splitSentences (. ! ? … , closing quotes, line breaks, returns positions); sentenceAt/sentenceIn :44-49. Not checked for English-specific cases (abbreviations, etc.).
- Mentions and josa: src/lib/korean/mentions.ts:15 findMentions; src/lib/korean/josa.ts:72 stripJosa, :98 matchesName.
- Naming rules: src/lib/korean/naming.ts:33 findNamingIssues. Spelling rules: src/lib/korean/spelling-rules.ts:26,189.
- Diff: src/lib/diff.ts:10 diffTexts (chars|words|lines). Search: src/lib/search.ts:28,45. Import: src/lib/import/split.ts:19,40; decode.ts:7.
- Question dedupe key: src/server/interview.ts:279-281 normalizeQuestion (removes whitespace and \p{P}\p{S}). Used at interview.ts:120 and :351. The guard is wired: a repeat is retried once with `rejected` (interview.ts:92-126; interview.test.ts:588-605). This lives in src/server, not src/lib, so a shared guard would need to move it.
- Fact/thread/relation dedupe key: src/lib/proposal-payloads.ts:123-128 normalizeProposalText (collapses whitespace, strips trailing . 。 … ! ? only). Used in src/server/proposals.ts:377-401 (exact equality after normalization; a near-duplicate match is not done), :424-435 (threads), :531-543 (relations). Two normalizers disagree: normalizeQuestion strips all inner punctuation; normalizeProposalText does not. Reconcile before reuse.
- Name rules: src/ai/extraction-rules.ts:4-17 ROLE_WORDS (also used for the role-word discard in the spec §5.C). I did not read src/ai/extraction.ts, so I cannot confirm the code guards in spec §5.C (alias collision, last-token match, role-word discard) are implemented.
- Style cards: src/server/styles.ts:15,72 (examples field); draft prompt includes examples at src/ai/tasks/draft-chapter.ts:28,69 (`- 예시:`). Style-suggest examples: src/ai/tasks/style-suggest.ts:13.
- Harness metrics that already implement most of the requested guards: eval/novel/metrics.ts:
  - countChars with trim (:46-48). Note: it trims before counting; the editor does not (countChars on untrimmed body).
  - lengthOk (:49-50): ko target..1.3x; en 0.8x..1.3x.
  - foreignRuns (:34-39, :52-55): ko = Latin 4+ letters + Han, Hiragana, Katakana, Cyrillic, U+FFFD runs; en = Hangul runs + the same others. This covers the Han/kana/Cyrillic finder but lives in eval/, not src/lib/ or src/ai/guards/.
  - metaHits (:17-30, :63-66): META_PATTERNS, one hit per line.
  - endsCleanly (:32,68-69).
  - paragraphs and avgParagraphChars (:71-73), dialogueLineRatio (:75-76).
  - eval/novel/localize/scaffold.ts:133 findHangul (eval-only).

== 2. What is missing (not found in the repo) ==
- No src/ai/guards directory (ls returned no such path).
- Paragraph splitter for Korean/English: none in src/lib (only the inline split in eval/novel/metrics.ts:57-60).
- Repeated-word counter: none found in src or eval.
- Sample-copy detector against style-card examples: none found in src or eval. Nothing compares draft sentences to styles.examples.
- Near-duplicate fact finder: none. Only exact equality after normalizeProposalText (proposals.ts:377-401).
- Han/kana/Cyrillic finder in a shared location: exists only in eval/novel/metrics.ts:37.
- Foreign-script span finder returning positions: the eval version returns strings only (no offsets), so the proofread or redo step cannot locate the span.

== 3. Spec and plan requirements that constrain this change ==
- MVP design (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md):
  - §8 (:355-358): "실제 로직은 src/lib/* 순수 함수에 두고 Worker는 얇게 감싼다." This conflicts with the follow-up placing the logic in src/ai/guards (see open questions).
  - §5 F7 (:232): quote must be a real substring of the manuscript; retry with whitespace normalization; otherwise drop. Continuity issues without a valid fact or entry are dropped.
  - §5 F14 (:267-270): proofread quote validated as substring; rule-based spellcheck runs instantly.
  - §7 (:351): every prompt outputs Korean, "추측은 [가정]으로", "원고에 없는 내용은 지어내지 말 것", "근거 문장은 원고에서 그대로 인용".
  - §9 (:361-367): korean helpers listed (countChars, stripJosa, findMentions, splitSentences, findNamingIssues, ruleBasedSpellcheck). New helpers should sit beside them.
  - §12 (:382-388): pure functions get unit tests. Quote verification needs unit tests (e.g., "quote removed when not a substring").
  - §13 item 5 (:394): AI provider and demo-mode decision (see below).
- Interview AI reliability spec (docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md):
  - §B (:74): question dedupe = normalize (remove whitespace and punctuation), compare with the work's earlier questions, retry once with the repeat in the prompt, second repeat stored anyway. Do not fail.
  - §C (:85-96): extraction rules. Names have no titles or modifiers; role words are never names; summary belongs to its subject; known cards and pending candidates are passed as <known>; alias collision → entry_update; last-token match applies to person cards only; a long name merged by last token is not added as an alias.
  - §D (:98-108): every AI call has a timeout and cancel. Guard checks must not add a new blocking AI call without it. Retries stay within the deadline.
  - §F (:119): length warning uses countChars withSpaces, "편집기 진행률과 같은 기준".
  - §4 anti-goals (:44-48): no fake AI path in product code; AI never writes wiki tables directly; wiki changes go through author actions or approved proposals, with change_log in the same transaction. Guards may only annotate or reject proposals; they may not write wiki rows.
- Lightweight-model eval design (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md):
  - §2 (:37-54 region): the eval round is measurement only; product behaviour must not change; harness code must have no effect in the app unless wired.
  - §6.3 (:124-165): a draft that cannot be used (empty, cut off, wrong language, non-body text) is redone at most twice (decision §12.13). Rewriting counts are recorded as a weakness.
  - §6.4 (:167-185): author rules: proofread accepts only real errors; continuity flags count only if they conflict with the wiki; style cards accept only if the sample style is captured; no prose written by the author.
  - §6.5 (:186-203): English runs translate every prompt. Line 202 says the English length target is a ratio taken from the sample paragraph's Korean vs English character counts.
  - §6.6 (:204-228): model failures are recorded and the run continues (decision §12.12); only external failures stop.
  - §9 (:287-297): extraction is graded on the source text read, not the whole bible (decision §12.16).
  - §10 (:335-346): product behaviour unchanged; only a timeout override seam is allowed in src/ai/run.ts.
  - §12 decision 13 (:~370): draft redo max 2.
- Quality criteria (docs/eval/novel-quality-criteria.md):
  - §3.1 (:56-62): T1–T7. T3: ko at least 5,000 chars with spaces and at most 130% of target; en uses the conversion ratio. T4: meta lines, no headers. T5: no foreign sentences or broken characters, both languages. T6: at most 1 spelling/spacing error per 1,000 chars. T7: no mid-sentence cut-off.
  - §3.3 (:126-133): publishable = all T1–T7 pass, mean Q ≥ 3.75, no Q ≤ 2. Excellent = mean ≥ 4.25 and Q3, Q4, Q9 ≥ 4.
  - Q6 (:98-103): paragraph length and dialogue ratio are scoring inputs only, not thresholds.
- Plans:
  - docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:535-539 chapterMetrics interface. Line 536 says ko foreignRuns = Latin 4+ only; the implementation (eval/novel/metrics.ts:34-39) is broader. The plan text is stale.
  - Plan §Task list (:21): fixed values including output floor 32000 and draft redos 2.
  - docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:174-186: korean/sentences.ts and locateQuote interface; spelling-rules.ts pattern.
- Follow-up backlog (docs/eval/novel/follow-up-ai-improvement.md):
  - A (:40-47): post-draft code length count; minimum "공백 포함 5,000자 이상" in the prompt; scene budget. Conflict: 5,000 is the eval fixture target (eval design §7, :267). The product has per-work targetChars (src/lib/chapter-length.ts). The follow-up must use the work's target, not a fixed 5,000.
  - C (:57-63): Han/kana/Cyrillic check after draft; redo only the span or retry. Hypothesis to lower temperature. Spec has no product rule for this; T5 criteria (:60) supports it.
  - E (:74-81): paragraph sentence limit "세 문장 이하" is a style-card rule the author wrote, not a product rule. The guard must read it from the card, not hardcode 3. Repeated words (오른손/왼손 37 times); style-card sample copy (5 runs).
  - G (:93-108): add existing facts to extraction input (spec §C passes only cards, not facts; this is a new requirement). Verify quotes against the source (spec F7 already does this for continuity, not for extraction). Partial-name fix. Dedupe by code.
  - J (:136-142): proofread: only standard-spelling violations; same quote merged across positions. Note: normalizeProposalText and the proofread quote check in src/ai/tasks/proofread.ts:48 already keep the quote exact.

== 4. Decisions already made that must not be re-litigated ==
- No demo or fake AI path in product code (interview spec §5.A, :52-62; §4 :45).
- AI never writes wiki tables; guards may only reject or annotate proposals (interview spec §4 :46; MVP F5/F7).
- Tests never call the real API (interview spec §6 :128; eval §10).
- Role-word discard list and last-token rule for person cards only (interview spec §C :95-96).
- Duplicate question: one retry, then store anyway (interview spec §B :74).
- countChars definition (MVP spec §9 :362; interview spec §F :119).
- Quote must be a substring of source; whitespace-normalized match allowed; otherwise drop (MVP F7 :232).
- Eval scoring thresholds 3.75 / 4.25 and T1–T7 (criteria §3.3, §3.1).
- Model failures are recorded and the run continues; external failures stop and resume (eval §6.6, decision 12).
- No new packages (CLAUDE.md; interview spec §6 :129).
- Korean for all user-facing copy; identifiers and comments in English (CLAUDE.md).
- Product behaviour must not change inside the eval round; next round explicitly changes the product (follow-up §0-§2).

== 5. Contradictions and risks for the change ==
- Placement: the follow-up says src/ai/guards; MVP spec §8 (:355-358) says pure logic goes in src/lib/*. Pick one before creating files. Existing reusable helpers are in src/lib/korean, and eval/novel/metrics.ts imports from @/lib/korean/chars.
- Two normalizers (interview.ts:279 vs proposal-payloads.ts:123) disagree on punctuation.
- English length: the criteria and plan use 0.8x; the eval spec §6.5 (:202) says derive the ratio from the sample paragraph. The plan hardcodes 0.8.
- Fixed 5,000 in follow-up A vs the per-work target (chapter-length.ts).
- chapterMetrics trims before counting, the editor does not (eval/novel/metrics.ts:46-48 vs chapters.ts:227). A guard reused in product must not trim, or counts will differ from the editor.
- Plan interface line 536 (ko foreign = Latin only) is stale; the implementation is broader.
- Interview extraction does not receive facts today (haiku-5.5-ko.md:195), which the interview spec does not require. This is new scope.
- ROLE_WORDS exact-match discard, alias-collision entry_update, and last-token logic are specified (interview spec §C) but I did not verify they are implemented in src/ai/extraction.ts.

== 6. Open questions for the orchestrator ==
- Confirm placement: src/ai/guards (follow-up) vs src/lib (MVP §8). Recommendation: pure functions in src/lib/korean or src/lib/guards, re-exported; keep src/ai as a thin caller.
- Confirm that the Han/kana/Cyrillic finder should move out of eval/novel/metrics.ts into the shared library (with offsets) and that metrics.ts should import it.
- Confirm whether near-duplicate fact matching is required by spec (spec §C says only that similar sentences should be filtered in the follow-up G, not in the MVP or interview specs). No current spec defines a similarity threshold.
- Confirm whether the sample-copy and repeated-word rules are product requirements or only eval checks (no product spec covers them).

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 1-169 - backlog for guards A, C, E, G, H, J (lines 40-142)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 185-404 - MVP spec: F7 quote check (232), F14 (267-270), section 7 AI (315-351), section 8 Worker/lib (355-358), section 9 Korean helpers (361-367), section 12 tests (382-388)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 1-137 - interview reliability: duplicate guard (74), extraction rules and code guard (85-96), timeouts/cancel (98-108), length warning (119), anti-goals (42-48), decisions (50-120)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 1-351 - eval design: scope and product-behaviour rule (2, 10), draft redo (6.3), author rules (6.4), English ratio (6.5 at 202), grading (9), decisions (12)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md` 50-135 - T1-T7 thresholds (56-62), Q6-Q9 (98-125), publishable/excellent (126-133)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 525-560 - chapterMetrics interface (535-539) and stale foreignRuns text
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 228-245 - improvement candidates ranked (228-245), evidence for guards
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts` 1-14 - countChars (reuse)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts` 1-100 - splitSentences (10), locateQuote (63), reusable exact-quote verifier
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts` 1-13 - length shortfall helper (reuse)
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 88-130,279-281 - normalizeQuestion (279-281) and repeat retry (92-126)
- `/home/xogud/documents/github/DaeumHwa/src/lib/proposal-payloads.ts` 120-130 - normalizeProposalText (123-128), second normalizer
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts` 370-545 - fact/thread/relation dedupe by normalized equality (377-401, 424-435, 531-543)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 1-89 - existing T3/T4/T5/T7 metrics incl. Han/kana/Cyrillic runs (34-39, 41-89); candidate to move into shared lib
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/scaffold.ts` 130-140 - findHangul (133), eval-only
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction-rules.ts` 1-20 - ROLE_WORDS and naming rules (4-17)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 20-75 - style-card examples in draft prompt (28, 69) for sample-copy detector
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/index.ts` 1-6 - barrel for korean helpers

Open questions:
- Placement conflict: follow-up says src/ai/guards, MVP spec section 8 says pure logic goes in src/lib/*. Which one should the guard library use? Recommendation: src/lib/korean or a new src/lib/guards module, with src/ai as a thin caller.
- Should the Han/kana/Cyrillic finder move from eval/novel/metrics.ts into the shared library (with offsets) so both the product and the harness use one implementation?
- Two normalizers disagree (normalizeQuestion in src/server/interview.ts:279 strips inner punctuation; normalizeProposalText in src/lib/proposal-payloads.ts:123 does not). Which one should the near-duplicate guard use, and should normalizeQuestion move to src/lib?
- No spec defines a near-duplicate similarity threshold, and no spec defines repeated-word or sample-copy rules for the product. Are these product requirements (new spec needed) or eval-only checks?
- English length target: criteria and plan use 0.8x fixed (eval/novel plan line 535), but eval design section 6.5 (line 202) says derive the ratio from the sample paragraph. Which is authoritative?
- Follow-up A uses a fixed 5,000-char minimum for product drafts, but the product has a per-work target (src/lib/chapter-length.ts). Should the guard use the work's target?
- chapterMetrics trims before counting (eval/novel/metrics.ts:46-48), the editor does not (src/lib/korean/chars.ts). Should the shared length guard match the editor (untrimmed)?
- I did not read src/ai/extraction.ts, so I could not confirm the interview spec section C code guards (role-word discard, alias collision, last-token rule) are implemented. Needs a separate check before reuse.

## survey:GUARDS:tests

TEST MAP for the shared guard library (src/ai/guards). Read-only survey; nothing in the repo was changed.

GAP FINDING: src/ai/guards does not exist (checked). No sample-copy detector, no repeated-word counter, no near-duplicate fact finder, no foreign-script span finder with offsets, no paragraph splitter, and no English sentence splitter that handles abbreviations exist in src/. Reuse candidates that do exist: countChars (src/lib/korean/chars.ts:5), splitSentences/sentenceAt/locateQuote (src/lib/korean/sentences.ts:10, 44, 63; locateQuote does exact match then whitespace-collapsed match), stripJosa/josaStrippedForms/matchesName/findNameMatch (src/lib/korean/josa.ts:72, 83, 98, 108), findMentions (src/lib/korean/mentions.ts:15), findNamingIssues (src/lib/korean/naming.ts:33), ruleBasedSpellcheck (src/lib/korean/spelling-rules.ts:189), tokenizeWords-based diffTexts/diffStats (src/lib/diff.ts:10, 17), detectHeading/splitChapters (src/lib/import/split.ts:19, 40), lengthShortfall (src/lib/chapter-length.ts:2). IMPORTANT DUPLICATE: eval/novel/metrics.ts already implements T3 length (lines 49-50: ko min = target, en min = 0.8x, max 1.3x), T5 foreign runs (lines 34-39 regexes OTHER_SCRIPT_RUN, LATIN_RUN, HANGUL_RUN; lines 52-55), T4 meta (lines 17-30), T7 endsCleanly (lines 32, 68-69), paragraph count and dialogue ratio (lines 57-76). It returns run strings, not offsets, so it cannot drive a per-phrase retry. Also eval/novel/localize/scaffold.ts:134,139 counts Hangul runs. The guard library should extract these from metrics.ts rather than copy them, and metrics.test.ts (eval/novel/metrics.test.ts:4-117) must keep passing. Hangul and Han detection are also present in src/test fixtures only via eval/fixtures/novel/{ko,en}/bible.json (style examples at bible.json:149), usable as sample-copy fixtures.

TEST MAP, EXISTING TESTS (file: what they assert)
- src/lib/korean/chars.test.ts:4-17: countChars counts code points, excludes \r\n from withSpaces, zeros for empty, emoji = 1. No withoutSpaces assertion.
- src/lib/korean/sentences.test.ts:5-39: splitSentences on terminators, closing quotes and newlines with trimmed offsets; empty -> []; sentenceAt; locateQuote exact, whitespace-collapsed, absent -> null, nearest to hint.
- src/lib/korean/spelling-rules.test.ts:53-76+: ruleBasedSpellcheck correct spellings untouched, sorted non-overlapping, 껄껄/서울께서 not flagged; table of 되요/됬다/않되 etc.
- src/lib/korean/mentions.test.ts:10-74: findMentions particles, vocative, word boundary, single-char names ignored, copula/quotative endings.
- src/lib/korean/josa.test.ts and naming.test.ts: josa stripping and name matching (not read in detail).
- src/lib/chapter-length.test.ts:4-25: lengthShortfall percent / null at or over target / null when target <= 0; shortfallMessage text.
- src/lib/diff.test.ts:4-40: diffTexts word/char/line modes; diffStats code points.
- src/lib/search.test.ts:11-30: choseong, exact > prefix > substring ranking, aliases, empty query.
- src/lib/import/split.test.ts:4-90: detectHeading (prose starting with a number+화 not a heading), splitChapters on headings, separators, size fallback, 300 chapters < 2 s.
- eval/novel/metrics.test.ts:4-117: chapterMetrics lengthOk (ko exact target ok, one under fails, line breaks not counted, >1.3x fails, en 0.8x ok), foreignRuns (Latin <4 ignored in ko, Latin >=4 flagged in ko, Hangul flagged in en, Han/kana/Cyrillic/U+FFFD flagged), metaHits, endsCleanly, paragraphs and dialogue ratio.
- src/ai/tasks/draft-chapter.test.ts:25-120: exact DRAFT_SYSTEM lines (26-39), prompt sections (41-54), fakeDraft demo marker, >=600 chars, deterministic (66-85), tag-isolation (87-118).
- src/ai/tasks/proofread.test.ts:8-60: system prompt startsWith and contains a fixed sentence (9-13), fake returns empty suggestions, postProcess drops unlocatable quotes and no-op replacements (29-40).
- src/ai/tasks/continuity-check.test.ts:67-160 and 166-180: postProcess drops unlocatable quotes, clears suggestion for thread/timeline and suggestion equal to quote, dedupes; fake flags left/right hand contradiction (149), system prompt layout (166).
- src/ai/tasks/style-suggest.test.ts:15-52: exact system (22-35), every sample line in prompt (37), fake satisfies schema.
- src/ai/tasks/reader-sim.test.ts:43-112: exact system (50), clamps ratings and drops moment quotes not in manuscript (82).
- src/ai/tasks/chapter-extract.test.ts:18-120: exact system opening (19), fake extraction shape, naming rules in system prompt (112).
- src/ai/tasks/interview.test.ts:51-360: interview-question fake and prompt sections, system prompt content (170-188); interview-extract fake (235-290), system prompt content (299-330).
- src/ai/extraction.test.ts:65-370+: extractionToProposals dedupe by name (129), alias match (89), facts deduped by subject and normalized content (310), supersedes ref (326), blank fact dropped (351).
- src/ai/context.test.ts:34-230: buildContextPack selection, ranking, budget, validity by position.
- src/ai/run.test.ts:118-520: runAiTask, startAiStream, usage limit, concurrency, cancel/timeout.
- src/server/ai-features.test.ts:173-320: draft: rejects empty instructions (182), streams fake text and stores output (191: asserts text starts with '(데모 초안) ' and ai_runs row), prompt contains style cards, entry card, tail, targetChars 3000 (210-257), title numbering (259), createChapterFromDraft (276-300).
- src/server/chapter-check.test.ts:80-520: runChapterCheck flags, dedupe, re-run; runProofread uses ruleBasedSpellcheck 되요 (338), AI suggestion collision (360); input length limit (497-520).
- src/app/api/works/[workId]/draft/route.test.ts: draft route, uses setAiClientForTests(new FakeAiClient()).
- e2e/ai-stub/responders.test.ts:154-245 and stub.test.ts: match prompts by exact system string.

FAKE AI WIRING
- src/test/fake-ai.ts: class FakeAiClient(options: {overrides?: Partial<Record<AiTaskName, (input)=>unknown>>}). generateObject parses FAKE_OUTPUTS[name] or override through the schema, zero usage. streamText splits FAKE_TEXT[name] or override string into 40-char chunks; override for a streamed task must return a string. Unknown task throws 'No fake output for task ...'.
- src/test/ai-fakes/index.ts:13-22 FAKE_OUTPUTS: interview-question, interview-extract, chapter-extract, continuity-check, proofread (returns {suggestions: []}), reader-sim, direction-advice, style-suggest. Lines 27-29 FAKE_TEXT: draft-chapter -> fakeDraft.
- src/test/ai-fakes/draft-chapter.ts: fakeDraft splits instructions into six paragraphs with fixed filler, prefix '(데모 초안) ', at least 600 chars. Default work targetChars is 5500 (src/db/types.ts:177), so the fake never meets the default target.
- src/ai/index.ts:23 setAiClientForTests(client|null) sets the client used by runAiTask and routes.
- Fake outputs for the guard-related tasks do not exist: there is no fake for draft-chapter length retry, sample copy, or dedupe.

FACTORIES (src/test/factories.ts): createTestUser (20), createTestWork (33), addTestMember (50), createTestChapter(db, workId, {position,title,body,status,publishedOn}) (59), createTestEntry(db, workId, {name,kind,aliases,summary}) (87), createTestFact(db, workId, {content,entryId,status,sourceChapterId}) (105), createTestThread (132). DB: createTestDb() in src/test/db.ts:8. src/test/setup.ts imports jest-dom only.

VITEST: vitest.config includes src/**/*.test.{ts,tsx} and eval/**/*.test.ts, environment node, pool forks, setupFiles src/test/setup.ts. New src/ai/guards tests are picked up automatically. Command for the touched set:
pnpm vitest run src/lib/korean src/lib/chapter-length.test.ts src/lib/diff.test.ts src/ai/tasks src/ai/extraction.test.ts src/server/ai-features.test.ts src/server/chapter-check.test.ts eval/novel/metrics.test.ts e2e/ai-stub --maxWorkers=2
Guards only: pnpm vitest run src/ai/guards --maxWorkers=2

NEW TEST CASES REQUIRED (name / input / expected)
src/ai/guards/counts.test.ts
- withSpaces and withoutSpaces: '안녕 하세요\n반가워' -> withSpaces 10 (excludes \n), withoutSpaces 8. Expected 10 and 8 (verify by counting code points).
- empty -> {0,0}; emoji counted once.
src/ai/guards/paragraphs.test.ts
- '첫 문장. 둘째 문장.\n\n다음 문단' -> 2 paragraphs, sentences per paragraph [2,1].
- blank lines and whitespace-only lines skipped.
- paragraph with 4 sentences flagged over the 3-sentence rule: '가. 나. 다. 라.' -> sentence count 4 (exceeds 3).
- English 'Mr. Smith left. He sat.' -> expected 2 sentences. Current splitSentences would give 3 (abbreviation not handled); mark as known gap or add abbreviation list.
- decimal '3.5 meters.' -> 1 sentence (current splitter would split at '.' after 3 only if followed by space; test 'verify').
src/ai/guards/scripts.test.ts (foreign-script span finder with offsets)
- ko text '그는 以上是 말했다' -> one span {text:'以上是', script:'Han', start:4, end:7} (offsets in UTF-16, verify).
- kana 'から' and Cyrillic 'Привет' inside ko text -> spans with script Hiragana/Katakana and Cyrillic.
- ko 'OK' (2 letters) not flagged; 'ABCD' flagged as Latin only in ko mode (metrics.ts rule).
- en text with '한국어' -> span Hangul.
- U+FFFD -> flagged.
- clean ko and clean en -> []. Reuse the metrics.ts regexes (lines 34-39) instead of copying.
src/ai/guards/repeats.test.ts
- '오른손으로 잡고 오른손을 뻗었다 오른손' -> {'오른손': 3} after josa stripping (stripJosa, josa.ts:72). Without stripping the count would be 2 with particles -> test asserts 3.
- stop-word/short tokens ignored by threshold option: '그 그 그' -> none at threshold 3 for 1-char tokens by design (define).
- counts only within a window when windowChars given (define).
src/ai/guards/sample-copy.test.ts
- draft sentence '안개가 계단을 반쯤 삼키고 있었다.' vs style-card examples from eval/fixtures/novel/ko/bible.json:149 -> hit with the example line.
- paraphrase '안개가 계단 절반을 가리고 있었다.' -> no hit at exact-or-high-overlap threshold (define threshold; expect no hit at 0.9).
- short line (under 10 chars) never flagged.
- English analogue from eval/fixtures/novel/en/bible.json:149 'The fog had swallowed half the stairs.' copied verbatim -> hit.
src/ai/guards/quotes.test.ts
- exact quote in source -> {start,end}; whitespace-collapsed quote '철수는   떠났다' vs source '철수는 떠났다' -> match (existing locateQuote). Quote absent -> null (sentences.test.ts:35 covers). Quote with leading/trailing spaces '  떠났다  ' -> match after trim behavior (define).
- verifier wrapper: a model quote that was paraphrased -> reported as not-in-source.
src/ai/guards/near-duplicate.test.ts
- '서윤은 왼손잡이다' vs '서윤은 왼손잡이이다' -> duplicate (true).
- '서윤은 왼손잡이다' vs '서윤은 오른손잡이다' -> NOT duplicate (char-bigram overlap is high, so a bigram Jaccard threshold would wrongly flag this; must test).
- '서윤의 나이는 열아홉이다' vs '서윤은 열아홉 살이다' -> duplicate (same subject + value) only if subject/value normalization is in scope; otherwise expected not-duplicate and documented.
- English 'Seoyun is 19.' vs 'Seoyun is nineteen.' -> not handled by string similarity; expect not duplicate unless number normalization exists.
- empty and one-char strings -> no pairs.
- The same fact set with the wiki fact in extraction: duplicates of existing createTestFact content (factories.ts:105) are reported against the existing fact id.

INTEGRATION TESTS (use FakeAiClient with overrides or setAiClientForTests)
- draft-chapter shortfall retry: FakeAiClient({overrides:{'draft-chapter': (input)=> calls++ === 0 ? shortText : longText}}) with targetChars 5500 -> service calls draft twice when shortText < 5000 chars (ko). Must be written as a new test in src/server/ai-features.test.ts; currently none exists.
- foreign-script retry: override returns text with 以上是 once, clean text second time -> final stored output has no Han span.
- Overrides keep fake outputs for other tasks (FAKE_OUTPUTS remains as is).

EXISTING TESTS THAT WOULD BREAK OR NEED CARE
- src/ai/tasks/draft-chapter.test.ts:26-39: exact DRAFT_SYSTEM array. Any new rule line (for example a minimum length or a voice rule, backlog A and B) breaks this exact-match test. Intentional update needed.
- src/ai/tasks/proofread.test.ts:9-13: system prompt startsWith and contains a fixed sentence. Breaks if the backlog J rewrite changes those sentences.
- src/ai/tasks/continuity-check.test.ts:166-180: system prompt layout test. Breaks if backlog H changes the prompt wording or sections.
- src/ai/tasks/style-suggest.test.ts:22-35, reader-sim.test.ts:50-63, chapter-extract.test.ts:19-26, interview.test.ts:170-188 and 299-330: exact or contains checks on system prompts. Break on any prompt edit (backlog B, I).
- src/server/ai-features.test.ts:191-208: asserts output text starts with '(데모 초안) ' and that streamed text equals stored output. Adding a retry would call streamText more than once; the spy/call-count assertions in 210-257 are indexed on calls[0] and still pass, but any retry loop must be capped so FakeAiClient (600 chars, default target 5500) does not loop forever. Recommended: the fake is short, so the retry will always fire in tests unless the target is set in the test or the fake is changed (src/test/ai-fakes/draft-chapter.ts).
- e2e/ai-stub/responders.ts:45 DRAFT_TEXT is about 25 characters. Any server-side length check that retries will always fail in E2E and spend the retry cap. Either add a stub-side length or skip the check when the stub is used. e2e/ai-stub/responders.test.ts:154-165 imports DRAFT_SYSTEM directly.
- src/lib/korean/sentences.test.ts:5-12: splitSentences expected positions. Any change to splitSentences (for English abbreviations, for paragraphs) breaks this and also src/test/ai-fakes/continuity-check.ts:14 and reader-sim.ts:12 and chapter-extract fake (sentences). Keep the old behavior or update the fakes too.
- src/lib/korean/chars.test.ts:4-17: changing countChars changes editor counts and server/chapters.ts:227,280,335 uses.
- eval/novel/metrics.test.ts:4-31: if chapterMetrics moves into src/ai/guards, the length rule (ko min = target, en min = 0.8) must stay identical or these tests break. The UI shortfall in src/lib/chapter-length.ts:2 uses a different rule (any shortfall) so the two rules are not the same; decide which one the draft check uses.
- src/lib/korean/spelling-rules.test.ts and src/server/chapter-check.test.ts:338-389: changing ruleBasedSpellcheck breaks these.
- src/ai/extraction.test.ts:129,310: any change to name or fact dedupe (backlog G) can break duplicate-merge expectations.

OPEN QUESTIONS
- Which length rule should the draft check use: eval metrics (ko >= target, en >= 0.8) or the editor rule (any shortfall, src/lib/chapter-length.ts)?
- Should the guards move the eval/novel/metrics.ts logic into src/ai/guards and make eval import it (recommended), so the regexes live once?
- Does the sample-copy detector compare against style cards from the DB (examples field, src/ai/tasks/draft-chapter.ts:28) or against the eval bible only?
- Is English sentence splitting in scope? splitSentences has no abbreviation handling.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts`  - countChars, reuse for counts (line 5)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts`  - splitSentences (10), sentenceAt (44), locateQuote (63) reuse for sentences and quotes
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - existing foreign-script, length, meta, paragraph logic (lines 17-89) to extract into src/ai/guards
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.test.ts`  - tests for the metrics logic that must keep passing
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/josa.ts`  - stripJosa (72), matchesName (98), findNameMatch (108) reuse for repeated words and name matching
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.ts`  - ruleBasedSpellcheck (189)
- `/home/xogud/documents/github/DaeumHwa/src/lib/diff.ts`  - diffTexts (10), diffStats (17), tokenizeWords for eojeol tokens
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - DRAFT_SYSTEM, buildDraftPrompt, style card examples (renderCard 65-69)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - startDraft targetChars (around 265-300) and startAiStream call (around 332); where a retry would go
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts`  - FakeAiClient with per-task overrides
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts`  - FAKE_OUTPUTS and FAKE_TEXT registry
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts`  - fakeDraft, about 600 chars, shorter than default target 5500
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts`  - createTestChapter (59), createTestEntry (87), createTestFact (105), createTestWork (33)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts`  - draft tests at 173-320; home for the new retry integration tests
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts`  - DRAFT_TEXT stub (45-ish), exact system matching; short text would fail a length check
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - backlog items A, C, E and J define the guard targets
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/bible.json`  - style example text at line 149, usable as sample-copy fixture
- `/home/xogud/documents/github/DaeumHwa/vitest.config.ts`  - include globs and environment node

Open questions:
- Which length rule should the draft check use: the eval metrics rule (ko at least target, en at least 0.8 times target, src/ai/guards to be extracted from eval/novel/metrics.ts:49-50) or the editor rule (any shortfall, src/lib/chapter-length.ts:2)? The two disagree.
- Should eval/novel/metrics.ts be refactored to import the shared guards from src/ai/guards so the regexes live in one place (recommended), or should the guards be copied?
- Does the sample-copy detector compare against style-card examples from the database (src/ai/tasks/draft-chapter.ts:28 examples field) or only against the eval fixture?
- Is English abbreviation handling in scope? src/lib/korean/sentences.ts has none, so 'Mr. Smith' splits in two.
- Near-duplicate fact finder: is number normalization (19 vs nineteen, 열아홉) in scope? Without it, the test case for 'Seoyun is 19' vs 'Seoyun is nineteen' is expected to be a non-duplicate.


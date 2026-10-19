# Track B: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:B:code

Minimal test call to check the schema. Ignore if this is read.

Files:
- `src/ai/tasks/interview-question.ts`  - test

## survey:B:evidence

TRACK B (character speech style, Q5) — read-only survey. Cited paths are relative to the repo root (/home/xogud/documents/github/DaeumHwa). Nothing was edited.

1. BACKLOG AND SUMMARY EVIDENCE

Backlog item B (docs/eval/novel/follow-up-ai-improvement.md:48-55): interview checklist gets "주요 인물마다 말투", extractor makes a `voice` item, draft context always carries main voices; metric = Q5 in ko and speech-contradiction count.
Summary: docs/eval/novel/2026-10-18/summary.md:22 ("Q5 ... 한국어는 세 모델 모두 3점, 영어는 4점"); summary.md:37-46 (Q table); summary.md:191-195 (section 4.1: haiku ko 세린 대사 16줄 all 해요체; 말투 정보가 위키에 없었다; en reviews treat the gap differently).

Q5 per run (review files):
- qwen ko 3 (qwen3.8-27b-ko.md:126). qwen en 4 (qwen3.8-27b-en.md:62).
- haiku ko 3 (haiku-5.5-ko.md:72, 100). haiku en 4 (haiku-5.5-en.md:32).
- luna ko 3 (luna-6-ko.md:53). luna en 4 (luna-6-en.md:54).

Speech contradictions per run (as the reviews count them):
- qwen ko: table row 7, "Characterization (말투)", 경미 (qwen3.8-27b-ko.md:201); bullets 206-207 (원장 반말; 세린 존댓말, no 말투 info in wiki). Draft prompt had only the work-level card: qwen3.8-27b-ko.md:137.
- haiku ko: T2 말투 1건 (haiku-5.5-ko.md:44); 16/16 세린 lines 해요체 (haiku-5.5-ko.md:102); 1.4 row (haiku-5.5-ko.md:137); interview never asked 세린 speech (haiku-5.5-ko.md:27, 171); protagonist answer bank has no speech sentence (eval/fixtures/novel/ko/bible.json:152).
- luna ko: 1번 말투 모순 "높음" (luna-6-ko.md:69); no 말투 on 한세린 card in draft context E1 (luna-6-ko.md:74); interview did not ask protagonist profile or speech (luna-6-ko.md:107); fix proposal (luna-6-ko.md:271).
- haiku en: 1 minor "Characterization" item, Jiwon "young miss" missing (haiku-5.5-en.md:50); interview never asked Jiwon's manner (haiku-5.5-en.md:50, 80); recommendation (haiku-5.5-en.md:160).
- qwen en: C2 medium, Yunseo speaks in explaining sentences (qwen3.8-27b-en.md:83); Q5 note (qwen3.8-27b-en.md:62); fix at qwen3.8-27b-en.md:224.
- luna en: speech item N4 not counted because no character voice cards were in context (luna-6-en.md:56, 97). Count = 0 by design, not by evidence.

Baseline counts (from reviews, LLM-judged): speech contradictions ko: qwen 1 row + 2 bullets, haiku 1, luna 1. en: haiku 1 minor, qwen 1 medium, luna not counted.

Main characters: 3 (한세린, 도윤서, 백지원) with main:true (eval/fixtures/novel/ko/bible.json:13-35). Each has a `voice` note (bible.json:16, 25, 34).

2. ROOT CAUSES IN CODE (verified)

- Character style cards are not available before chapter 2 by design: docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:136-138 ("1화 전에는 쓸 수 없다"; 인물 문체 제안은 2화가 끝난 뒤). eval/novel/state.ts:72 schedules style:suggest only for n===2.
- Eval setup seeds only the work-level style card, naming rules and threads (eval/novel/steps/setup.ts:12-66). Bible character `voice` is never written into the app. The interview answer bank has speech only for Jiwon and Yunseo (bible.json:154-155), not the protagonist (bible.json:152).
- Style suggestion needs 3 dialogue lines from saved chapters (src/server/ai-features.ts:49, 203-205, 233-245). Impossible for chapter 1.
- Draft prompt: style cards are rendered as "- 말투:" lines (src/ai/tasks/draft-chapter.ts:65-70) and the prompt rule is at draft-chapter.ts:10. Entry-scoped cards are included only if their entryId is selected (src/server/ai-features.ts:302-306). In the app the author ticks characters by hand (src/components/writing/panels/draft-panel.tsx:197). The eval selects entries by name mention in the instructions (eval/novel/steps/util.ts:263-277).
- Wiki context pack selects entries only by mention or extraEntryIds (src/ai/context.ts:140-149) and drops entries under the 12,000-char budget (context.ts:64, 292-293). Main characters are not guaranteed to be in the draft context.
- Interview question input has no field data: entries carry name, kind, factCount and summary only (src/ai/tasks/interview-question.ts:14; caller src/server/interview.ts:497). The question model cannot see that a main character lacks 말투.
- INTERVIEW_TOPICS has "주요 인물" but no speech sub-check (src/ai/tasks/interview-question.ts:54-63; rule at line 68). No "점검표" (checklist) exists in src/ or eval/novel (rg found none).
- Interview extractor SYSTEM has no speech rule (src/ai/tasks/interview-extract.ts:23-39).
- Extraction skips any name that already matches a card: src/ai/extraction.ts:317 (`if (locate(name, e.kind)) continue`). So fields for an existing character are dropped. For new cards, fields map into entry_create (extraction.ts:349-359). Existing-card field fill exists in the apply step, which fills only empty fields (src/server/proposals.ts:315-329), so it is safe to reuse.

3. DATA MODEL (no migration needed for either option)

- wiki_entries.fields is jsonb Record<string,string> (src/db/schema.ts:156-158). Key `speech` already has the label 말투 (src/lib/labels.ts:125-131). It is rendered in the context pack (src/ai/context.ts:317-318, label map 71-74) and editable in the entry form (src/components/wiki/entry-form.tsx:50). The backlog name `voice` would need a new label and a second key for the same concept.
- style_cards (src/db/schema.ts:310-327) has entryId, name, tone, rules, examples; the UI labels tone as 말투 (src/components/wiki/style-cards.tsx:193, 305). Creating these from the interview would need a new extraction shape (ExtractionSchema has no style_card, src/ai/extraction.ts:17-56) even though style_card proposals already apply (src/server/proposals.ts:574-590; PROPOSAL_TYPES in src/db/types.ts ~75-82).
- Recommendation: store 말투 in wiki_entries.fields.speech (no migration). Use style cards only for the post-chapter-2 suggestion path that already exists.

4. PROPOSED CHANGE SET (for the track; not implemented)
a. interview-question: add a "주요 인물 말투" check: add `hasSpeech` per main character to the input and a rule at interview-question.ts:68; caller at src/server/interview.ts:497.
b. interview-extract SYSTEM: add a rule to put the character's speech in fields key "speech" (interview-extract.ts:23-39).
c. extraction.ts:317: for an existing name, emit entry_update with fields when extracted fields are present (proposals.ts:315-329 fills only empty ones).
d. draft prompt: add a `<voices>` block with every main character's speech, not dependent on mention. Needs a "main character" definition: the app has no main flag (rg: none). Options: a new field, entry_appearances count, or a relations count. This is a decision for the orchestrator.
e. draft-chapter.ts: keep rule line 10 and cite the voices block.

5. ACCEPTANCE CRITERIA (proposed; current value per run; target; how to measure)

A1 Q5 ko: qwen 3, haiku 3, luna 3 -> target >=4 in every ko run (rerun on a new date). Measure: reviewer Q5 score. Gap: Q scores exist only in free-text review.md (no machine-readable field; eval/novel/steps/finish.ts:101-118 run summary has no Q or T2 fields). Missing metric: structured reviewer output.
A2 Speech contradictions ko: qwen 1 row + 2 bullets, haiku 1, luna 1 -> target 0 per run. Measure: reviewer LLM count. Gap: no code metric.
A3 Speech contradictions en: haiku 1 minor, qwen 1 medium, luna 0 counted (not measured) -> target 0; keep Q5 en >=4 (currently 4, 4, 4). Measure: reviewer; same gap.
A4 Main-character speech in draft prompt: documented ch1 draft prompts had no per-character 말투 (qwen ko 137; luna ko 74; luna en 56) -> target 3/3 main characters with a 말투 line in every draft prompt where the wiki holds one. Measure: code over calls/*.json, since each CallRecord stores `prompt` (eval/novel/eval-client.ts:53). Feasible now with a new metric.
A5 Interview coverage: main characters with a speech answer or field before the ch1 draft -> haiku ko 2 of 3 (도윤서, 백지원 have 말투 in wiki; 세린 missing: haiku-5.5-ko.md:171); luna ko 0 of 1 (protagonist: luna-6-ko.md:74, 107) -> target 3/3. Measure: final wiki fields.speech for main entries plus interview-question calls (code, feasible; finish.ts exports wiki state).
A6 Protagonist speech asked within the first 6 of 12 questions: haiku ko never (haiku-5.5-ko.md:27); luna ko never (luna-6-ko.md:107) -> target yes. Measure: covered turns topic/question text (code, calls/*.json).
A7 ko dialogue ending distribution (diagnostic, no speaker): haiku ko 16/16 세린 lines 해요체 (haiku-5.5-ko.md:102) -> no target until speaker attribution exists. Missing metric: speaker attribution. ChapterMetrics has only dialogueLineRatio (eval/novel/metrics.ts:3-15, 75-76). A code ending-class histogram (해요/합쇼/반말) can be added to metrics.ts, but per-speaker attribution cannot be done by code today.
A8 Planted speech-error recall: no speech case exists in eval/fixtures/continuity (rg found none) -> target >=1 detection of 1 planted speech error per run on eval:continuity (package.json:21, eval/run-continuity.ts). Gap: fixture needs a speech case.

Metrics missing in the harness: (i) structured Q5 and speech-contradiction output from the reviewer (the reviewer rubric is docs/eval/novel-quality-criteria.md:92-96 for Q5, line 57 for T2; the reviewer writes only free text per eval/novel/agents/reviewer.md); (ii) speaker attribution; (iii) a code check for voices in the draft prompt (A4 is feasible now from calls/*.json).

6. TEST NOTES
- Q5 rubric: 3 = only the protagonist is distinct (novel-quality-criteria.md:92-94). Eval reviewer scores ko 3 for all three cloud/local ko runs.
- All six runs are chapters: 1; style:suggest is not reached in any of them (eval/novel/state.ts:72), so A4-A5 must be fixed before ch2 effects can be seen.
- Repeat run needed on a new date (backlog section 1, follow-up-ai-improvement.md:31-33), 2화 or more to test the post-chapter-2 style cards (summary.md:157).

openQuestions (decisions, not findings):
1. Definition of "main character" in the app (no flag exists).
2. Reuse `speech` (recommended, no migration) or add `voice` (needs label + UI).
3. Whether draft voices come from fields.speech only or also from style_cards.
4. Whether the reviewer writes structured JSON for Q5 and T2 speech counts.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - backlog item B (lines 48-55) and metric definition
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - cross-run Q table (line 37 onward) and section 4.1 speech evidence (lines 191-195)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - Q5 3 (line 72, 100-102), speech T2 (line 44, 137), interview gap (lines 27, 171)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - Q5 4 (line 32), minor speech item (line 50), recommendation (line 160)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - Q5 3 (line 53), speech contradiction (line 69), no 말투 on protagonist card (line 74), interview gap (line 107), fix (line 271)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - Q5 4 (line 54-56), no voice cards in context (line 56), uncounted N4 (line 97)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - Q5 3 (line 126-137), speech items (lines 201, 206-207), draft prompt with work-level card only (line 137)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - Q5 4 (line 62), C2 speech item (line 83), fix (line 224)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - design: character style cards only after chapter 2 (lines 136-138)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts`  - plan order; style:suggest only for n===2 (line 72)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts`  - only work-level style card seeded (lines 53-64)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/bible.json`  - voice notes (lines 16, 25, 34), main flags (17, 26, 35), answer bank protagonist without speech (line 152), jiwon speech answer (line 155)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - suggestStyleCard needs 3 saved dialogue lines (lines 49, 191-205, 233-245); draft style card filter by entryId (lines 302-306)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - draft rule (line 10) and style card rendering with 말투 line (lines 65-70)
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts`  - mention-based entry selection (lines 140-149), budget drop (lines 292-293, budget at line 64), field rendering (lines 317-318)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx`  - manual character checkbox for draft entryIds (line 197)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts`  - INTERVIEW_TOPICS without speech (lines 54-63), rule (line 68), entries input without fields (line 14)
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts`  - entries payload with factCount only (line 497)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts`  - extractor SYSTEM has no speech rule (lines 23-39)
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction.ts`  - free-key fields (line 25); existing-name skip (line 317); entry_create fields map (lines 349-359)
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts`  - entry_update fills only empty fields (lines 315-329); style_card apply (lines 574-590)
- `/home/xogud/documents/github/DaeumHwa/src/lib/labels.ts`  - CHARACTER_FIELD_LABELS with speech = 말투 (lines 125-133)
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts`  - wiki_entries.fields jsonb (lines 156-158); style_cards (lines 310-327)
- `/home/xogud/documents/github/DaeumHwa/src/components/wiki/style-cards.tsx`  - tone labeled 말투 (lines 193, 305)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - ChapterMetrics has no speech metric (lines 3-15, 75-76)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - CallRecord stores prompt (line 53): basis for a code metric on draft voices
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - run summary has no Q or T2 fields (lines 101-118)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md`  - Q5 rubric (lines 92-96) and T2 definition (line 57)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity`  - no speech case exists in the continuity fixture (rg empty)

Open questions:
- What defines a main character in the app? No main flag exists (only bible.json main:true, lines 17, 26, 35). Options: a new field, entry_appearances count, or relation count. Needed for the always-included draft voices.
- Use fields.speech (no migration, label 말투 exists at src/lib/labels.ts:131) or add a new voice key (needs a label and UI change)? Recommended: speech.
- Should the speech style card come from the interview (extend ExtractionSchema with style_card, a shape change touching three tasks) or from fields.speech only (smaller)? Recommended: fields.speech first, style cards after chapter 2 as now.
- Should the reviewer write structured JSON (Q5 score, speech contradiction list with speaker and quote) so the harness can count them? Without it, A1-A3 and A7 stay manual.

## survey:B:risks

TRACK B (Character speech style) risk and neighbour survey. Read-only; nothing in the repo was changed.

FACTS FOUND
- Backlog B: docs/eval/novel/follow-up-ai-improvement.md:48-55. Haiku ko: all 16 lines of protagonist 세린 are 해요체. Luna ko: speech overlaps 도윤서. The interview never asks about speech. Proposed: checklist line, extractor voice item, main voice always in draft context. Metric: Q5 ko and speech-contradiction count (line 55).
- Evidence: docs/eval/novel/2026-10-18/summary.md:191-196 (Q5 ko 3 vs en 4 in all three runs; no speech data in wiki). The ko-vs-en explanation is marked 추정 (unverified) at summary.md:196. Action row 2 at summary.md:235. Row 9 (wasted interview questions on blank settings, relevant to track I) at summary.md:242.
- Speech slot already exists: src/lib/labels.ts:125-133, CHARACTER_FIELD_LABELS has key speech labelled 말투 (line 131). It is used by the entry form, entry detail (src/components/wiki/entry-detail.tsx:13,35), history diff (src/components/history/change-diff.tsx:54), backup (src/lib/backup.ts:194) and the AI pack (src/ai/context.ts:72-80, rendered at context.ts:317-318). A character therefore already has a 말투 field in the wiki. No new column is needed.
- Style card model: src/db/schema.ts:310-327 styleCards {workId, entryId nullable with set null, name, tone, rules, examples, createdByType, archivedAt}. Created by createStyleCard in src/server/styles.ts (logChange inside the transaction, targetTable style_cards). Also created by approving a style_card proposal at src/server/proposals.ts:574-590, inside the approval transaction.
- Proposal types: src/db/types.ts:73-82 has no voice type. proposals.type is plain text (src/db/schema.ts:337) and migration drizzle/0000_fast_black_widow.sql has no CHECK constraint on it, so a new ProposalType needs no DB migration. The TS side would still change: PROPOSAL_PAYLOAD_SCHEMAS (src/lib/proposal-payloads.ts:93-102), proposal-payload-editor (src/components/proposals/proposal-payload-editor.tsx:44), labels (src/lib/labels.ts:102), and the switches at src/server/proposals.ts:125 and :574.
- Style suggest is on demand, not automatic: src/server/ai-features.ts:189-225 needs 3 dialogue lines (MIN_DIALOGUE_SAMPLES at line 49, BAD_STATE at line 204). The task is src/ai/tasks/style-suggest.ts (schema at :17, maxTokens 4000 at :31, neutralizeDeep at :38). createStyleCard does not dedupe existing cards, so repeated suggestions can duplicate a card.
- Merge rules: entry_create fills only empty fields (src/server/proposals.ts:324-332). entry_update merges patch.fields over current fields (src/server/proposals.ts:347). A later extraction therefore cannot overwrite an existing speech value through entry_create.
- Draft context gap: startDraft (src/server/ai-features.ts:270-335) builds the pack from mentions in the instructions plus input.entryIds only (src/ai/context.ts:146-148). Style cards are included only if entryId is null or selected (ai-features.ts:302-306). Main-character voice is NOT always included. Nothing identifies a main character: the schema has no role flag, and 역할 is free text in fields.
- Draft prompt: src/ai/tasks/draft-chapter.ts:17 DRAFT_MAX_TOKENS 16000. buildDraftPrompt at :36, neutralizeDeep at :37. renderCard at :65-70 prints tone, rules, examples. DRAFT_SYSTEM at about :5-16; line 10 already says to follow the style cards.
- Interview: INTERVIEW_TOPICS at src/ai/tasks/interview-question.ts:54 (8 topics, includes 문체). SYSTEM at :65. buildInterviewQuestionPrompt at :111, neutralizeDeep at :112. The fake src/test/ai-fakes/interview-question.ts imports INTERVIEW_TOPICS, so changing the list affects fixtures.
- Extraction: src/ai/tasks/interview-extract.ts SYSTEM at :23 (ENTITY_NAME_RULES at :37), buildInterviewExtractPrompt at :42, neutralizeDeep at :43. ExtractionSchema in src/ai/extraction.ts: entries[].fields is an array of {key, value} with free keys. chapter-extract task at src/ai/tasks/chapter-extract.ts:83 (maxTokens 16000, effort medium).
- Proofread already excludes character speech from fixes: src/ai/tasks/proofread.ts:29.
- Timeouts: src/ai/run.ts:28 DEFAULT_AI_TIMEOUT_MS = 120000 (structured calls). src/ai/run.ts:30 STREAM_AI_TIMEOUT_MS = 280000 (streamed drafts).
- Context budget: src/ai/context.ts:64 DEFAULT_BUDGET_CHARS 12000. How trimming works was not verified.
- Injection defence: src/ai/prompt-utils.ts:5 TAG_DATA_RULE; :12-14 neutralizeTags rewrites closing tags only; :17 neutralizeDeep. Every task builder calls neutralizeDeep on its raw input. Any new voice field must follow the same path.
- Streaming retry rule: src/ai/responses.ts:208 says retries happen only before the answer body is read, so no stream text repeats. A post-draft rewrite (tracks A, C, D) therefore needs a new run, not a stream retry.
- Route rule (CLAUDE.md): pages or route handlers that trigger AI export maxDuration = 300. The spec at docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:105 moves AI server actions to route handlers.
- No src/ai/guards directory exists yet; the shared guard library is not built.

RECOMMENDATION (no migration)
- Keep the voice in the existing character field fields.speech (labels.ts:131). Extraction writes it through entries[].fields with key speech, so no schema change.
- Use the existing style_card type (tone, rules, examples) for the richer card, created on demand by suggestStyleCard. Do not add a new ProposalType unless the author decides otherwise.
- Draft: always add main characters to the pack (extraEntryIds) and always render their speech line. Define "main" first.

TRACK OVERLAP
- GUARDS (shared lib, not built): B's contradiction check and every prompt-side guard depend on it. Do not change neutralizeDeep semantics.
- A (length, draft-chapter.ts, startDraft): same draft prompt and startDraft as B and D. High conflict risk.
- D (two-step scene draft): same startDraft and DRAFT_SYSTEM. High conflict risk.
- C (foreign-script block, post-draft): shares the draft flow with B.
- E1, E2 (paragraph rules, repeated words, sample copy): touch the draft and the style-card examples. Depend on B only if voice lines are the sample-copy source.
- G1, G2 (extraction dedupe and entities): interview-extract.ts, extraction.ts, chapter-extract.ts, proposals.ts. B's voice item depends on G2 if fields are extended.
- F2 (chapter extract split): splits chapter-extract.ts. B's extractor change must follow the same split.
- I (interview strategy): same interview-question.ts SYSTEM and INTERVIEW_TOPICS. Coordinate B's checklist line with I. High conflict risk.
- H (continuity context and rules): consumes the pack. Needs voice in the pack to detect speech contradictions. Depends on B.
- J (proofread scope): proofread.ts:29 already excludes 말투. Keep it consistent.
- F1 (proofread split), F3 (reader simulation), F4 (local server serialization, effort): affect run timing and limits.
- HX1 (reviewer blinding), HX2 (English substitution table): touch the eval harness that measures Q5. HX3 (author sees wiki): the speech field already renders in entry-detail.

INVARIANTS THAT APPLY
- Korean user-facing copy for new messages (CLAUDE.md Rules).
- AppError codes with Korean messages (e.g. BAD_STATE at ai-features.ts:204). Services throw AppError; actions never throw.
- withAction and ActionResult for any new server action (src/server/actions/*).
- requireWorkRole: startDraft and suggestStyleCard need editor (ai-features.ts ~270 and ~190); styles.ts uses requireWorkRole.
- change_log in the same transaction: createStyleCard (styles.ts) and proposal approval (proposals.ts:574).
- Wiki rows archived, never deleted: styleCards.archivedAt (schema.ts:323).
- AI never writes wiki tables directly: extraction goes through insertProposals (ai-features.ts:216-228) and approval applies it.
- Non-members get NOT_FOUND.

REGRESSION RISKS
- Token limits: DRAFT_MAX_TOKENS 16000 (draft-chapter.ts:17). Voice lines and main-character examples add prompt size; the 12000-char pack budget (context.ts:64) may drop them.
- 120 s limit: structured calls (style-suggest, interview-extract, extraction with voice fields) use DEFAULT_AI_TIMEOUT_MS (run.ts:28). The follow-up file says qwen exceeded 120 s in 13 of 32 ko calls (section F). Extra fields raise output size and time.
- A second streamed draft (track A retry) could exceed the 300 s route maxDuration if two 280 s streams run in sequence.
- Prompt injection: voice text is user-authored. Wrap it in tags, pass it through neutralizeDeep, and keep TAG_DATA_RULE in the system prompt.
- Streaming: textStream has already reached the client. Any post-check that changes text needs a new run, not a retry (responses.ts:208).
- Duplicate style cards from repeated suggestions (no dedupe in createStyleCard).
- Test fixtures: src/test/ai-fakes/interview-question.ts imports INTERVIEW_TOPICS.

PROPOSED MINIMAL PUBLIC INTERFACE (TypeScript, new file src/ai/voice.ts)
export type VoiceSource = { entryId: string; name: string; isMain: boolean; speech: string; cardTone: string | null; cardRules: string | null };
export type VoiceLine = { name: string; speech: string };
export const MAIN_VOICE_LIMIT = 6; // bounds prompt size
export function selectMainVoices(sources: VoiceSource[]): VoiceLine[];
export function renderVoiceLines(lines: VoiceLine[]): string; // used inside a <voices> tag
Draft input addition (DraftPromptInput in draft-chapter.ts): voices: VoiceLine[] (empty array allowed). buildDraftPrompt renders <voices> before <style_cards> and passes it through neutralizeDeep.
Extraction: no schema change; entries carry fields key speech. Optional prompt-only rule in the interview-extract and chapter-extract SYSTEM text.
Interview: either add 말투 as a ninth entry in INTERVIEW_TOPICS (interview-question.ts:54) or add a checklist line to SYSTEM (:65). Pick one and coordinate with track I.
Only if the author wants a separate proposal kind: add 'voice' to PROPOSAL_TYPES, plus payload schema, editor, labels and the proposals.ts switch. No DB migration.

METRICS
- Q5 ko from the eval review. The eval rubric and docs/eval/novel/README.md were not opened in this survey.
- Speech contradiction count: T2 items with 말투 in the reviews (summary.md:235).
- Not verified: whether the continuity check (H) can catch speech contradictions once voices are in the pack.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 48-55, 133 - B backlog item, metrics, overlap with I and F
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 191-196, 216, 235, 242 - Q5 and speech-gap evidence; action row 2; row 9
- `/home/xogud/documents/github/DaeumHwa/src/lib/labels.ts` 102, 125-133 - existing speech field labelled 말투
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 310-327, 337 - style_cards table; proposals.type is plain text
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts` 33-43, 73-82 - PROPOSAL_TYPES and entry kinds
- `/home/xogud/documents/github/DaeumHwa/src/server/styles.ts` 1-80 - createStyleCard, logChange inside transaction
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts` 124-126, 324-332, 347, 574-590 - entry_create fills only empty fields; style_card approval
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 49-51, 189-225, 233-240, 270-335 - suggestStyleCard (3 lines, BAD_STATE); startDraft pack and style cards
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 64, 146-148, 317-318 - pack selection, budget, field rendering
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 5-17, 36-37, 65-70 - draft rules, DRAFT_MAX_TOKENS, prompt builder, style card rendering
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 54, 65, 111-112 - INTERVIEW_TOPICS and SYSTEM checklist
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 23, 37, 42-43 - extraction rules and prompt builder
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/style-suggest.ts` 7-12, 17, 31, 38 - style card suggestion task and schema
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 29 - proofread already excludes 말투 from fixes
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 20-30 - 120 s default and 280 s stream timeouts, caps
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 5, 12-14, 17 - TAG_DATA_RULE and neutralizeDeep
- `/home/xogud/documents/github/DaeumHwa/src/ai/responses.ts` 208 - retries only before stream body
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction.ts` 1-40 - ExtractionSchema; entry fields are free key/value
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 105-106 - route handler move for AI calls

Open questions:
- Storage: keep 말투 in the character field fields.speech (no migration, recommended), add a new voice proposal type (TS changes only, no migration), or use style cards only?
- Definition of a main character: the schema has no role flag. Use 역할 text, an author-pinned flag (needs a migration), or a count cap? Which characters are always in the draft context?
- Overwrite policy: entry_create never overwrites an existing field (proposals.ts:324-332). Should a voice proposal replace an existing speech value, and must the author confirm?
- Budget priority: if the pack exceeds 12000 chars (context.ts:64), do voice lines take priority over other context?
- Interview: add 말투 as a ninth topic in INTERVIEW_TOPICS (affects fixtures and track I), or only add a checklist line to SYSTEM?
- Draft delivery: is the draft a route handler (maxDuration 300) or a server action? Track A's retry must fit within that limit.
- Metric owner: who scores Q5 and counts speech contradictions, and should the continuity check (H) flag speech contradictions as their own T2 kind?
- Duplicate style cards: should suggestStyleCard replace or merge an existing card for the same character?

## survey:B:specs

TRACK B (Q5 character speech) — spec and plan constraints. Read-only survey; no repo files changed.

1. Already-decided facts that constrain the change
- Speech already exists as a fixed character field: key `speech` (말투) in wiki_entries.fields. docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:128 (fixed keys role, age, gender, appearance, personality, speech, goal, background). Plan label map: docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:170 (CHARACTER_FIELD_LABELS speech 말투). The backlog's new `voice` item (follow-up-ai-improvement.md §2 B) would duplicate this key; the spec has no `voice` key. The eval bible uses `voice` only as harness fixture naming (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:294), not product schema.
- Extraction output already carries free key/value field pairs: docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:505 (ExtractionSchema entries[].fields: array of {key,value}). Approved entry_create / entry_update patch.fields flow through proposals (spec :161, patch fields) and the apply rules (plan :454). So a speech item can be produced without a DB migration, as a proposal, never a direct write.
- Per-character style cards already exist with no migration: style_cards has entryId (spec :149: "entryId?(없으면 작품 서술 문체)", name, tone, rules, examples). style_card proposal payload carries entryName (spec :161). style-suggest route: docs/superpowers/plans/2026-10-18-interview-ai-reliability.md:194 (POST /api/works/[workId]/style-suggest body {entryId}). Style suggestion needs ≥3 saved dialogue lines (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:39; eval spec :136), so it cannot supply a voice for chapter 1.
- Interview topic list is fixed in F1: spec :189 (주인공, 주요 인물, 세계관 규칙, 장소, 갈등, 떡밥, 결말 방향, 문체). Interview reliability §5 B (docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:72) already lists 주요 인물 and 문체 among core settings the AI judges as empty or shallow. Adding "주요 인물마다 말투" as a checklist rule fits inside existing topics; no output-schema change (output {focus, topic, question, rationale}, :72–:73).
- Interview question input (§5 B, :67) gives card name, kind, fact count and summary first 40 chars only. Fields such as speech are not in that input, so the question model cannot see an empty speech field. The rule must be explicit in the prompt.
- Extraction rules (§5 C, :85–:96): summary is about the card's own subject; do not move attributes across subjects. Speech belongs in fields.speech of the speaker's card. Role words are not names.

2. Draft context (the "always include main characters voice" requirement)
- F9 context pack is mention-based: buildContextPack selects entries whose names appear in the text (spec :243–:245). Budget ~12,000 chars, lowest-ranked trimmed first (:247). PackEntry already includes fields, so speech reaches the draft only when the character is mentioned or selected.
- Draft route input: {chapterId?, instructions, targetChars?, entryIds} (plan :662). entryIds feed style cards only. DraftPanel uses a manual character multi-select (plan :779). The spec does not say that main characters are always included. This is a NEW requirement, not in the current spec.
- draft-chapter system prompt already says dialogue follows the character's style card and voices are distinct (plan :654). It does not reference fields.speech.
- "Main character" has no defined flag in the product spec (spec §4.2 entry fields have no main flag). The eval bible has main (plan :294), harness only.

3. Metrics and rubric (fixed)
- Q5 rubric: docs/eval/novel-quality-criteria.md:92–95 (1 all same voice; 3 only protagonist distinct; 5 distinguishable without names and follows style card rules).
- T2 설정 모순: docs/eval/novel-quality-criteria.md:57 (0 contradictions with setting or approved wiki; ConStory 5-class). Speech contradictions count under Characterization here.
- 출판 가능: docs/eval/novel-quality-criteria.md:128–131 (T1–T7 all pass, Q average ≥3.75, no item ≤2).
- Deterministic judging is forbidden for the eval: docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:176–177 (Sonnet judgment, no automatic judge). So "speech contradiction count" is a Sonnet T2 count, not a code metric, unless the spec is changed.
- Evidence: haiku-5.5-ko.md:21, :101–102 (세린 대사 16줄 모두 해요체; 설정집 반말); luna-6-ko.md:53, :69; summary.md:191–196 (Q5 4.1, interview never asked speech, wiki had no speech field so continuity could not catch it); summary.md:235 (recommended fix #2).

4. Decisions that must not be re-litigated
- Interview: one question at a time, endless, no return to covered topics; setting vs story focus (interview spec §2 :26; §5 B :75–:76).
- AI never writes wiki tables directly; wiki changes only via author action or approved proposals with change_log in the same transaction (MVP §1.3 and §3.2 :83; interview spec §4 :42-ish anti-goal "AI가 위키 테이블을 직접 쓴다").
- Demo/fake path removed from app runtime; fake outputs live only in src/test (interview spec §5 A). Any new task output needs test fakes outside app code.
- Zod structured-output rules: no min/max/regex/default; all required; nullable for optional (MVP §7.1, spec :330–:334). Applies to any new extraction field.
- Harness-round rules (eval spec §2 :29–:34 and §6.7 :231–:235): product behavior unchanged during the harness round; chapter 1 only; answer bank and 설정집 are fixed inputs (§7, :264; decision 14 :346). A product or fixture change must use a new date to compare with 2026-10-18 (docs/eval/novel/README.md §3, follow-up §1).
- Eval design gates interior style suggestion to after chapter 2 (eval spec :136–:138, :234; decision 19 :351). This is an eval-plan decision, not a product gate; product spec F13 has no chapter gate (spec :263).
- Effort: cloud effort high (eval README §2), max caused truncation on Haiku.
- Context pack budget and mention-based selection are product behavior (spec F9 :243–:247). Changing them is a product change.

5. Recommendation (from spec and plan only, verify in code later)
- Do not add a `voice` key or a DB migration. Use existing fields.speech (spec :128) through interview-extract → entry_create/entry_update fields proposals. Optionally reuse style_cards (entryId) from style-suggest after ch2.
- Add the 말투 checklist as a rule under 주요 인물 in the interview-question prompt, with an explicit line that speech is missing when fields.speech is absent (because :67 does not show fields).
- Draft: always-include main characters' speech needs a new rule. Options: include speech and style card for entries of kind character marked as main, exempt from the 12,000-char trim (spec :247). Requires user decision on what "main" means.
- Metrics: Q5 (Sonnet rubric) and T2 Characterization count on ko runs; compare with 2026-10-18 ko baseline (Q5 3; haiku ko 16/16 해요체 mismatch).

6. Gaps found
- No spec text defines "main character" or an always-include draft rule.
- No spec or plan defines a deterministic speech check. Eval forbids automatic judges (eval spec :176–:177).
- The follow-up backlog adds 세린 말투 to the answer bank (follow-up §2 B; summary.md:235). Answer bank is a fixed fixture (eval spec :264), so this changes the baseline and needs a new date.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md`  - Product spec: fixed character field key speech (:128), style_cards with entryId (:149), style_card proposal payload (:161), F1 interview topics (:187–:191), F9 context pack mention-based and 12,000-char budget (:242–:247), F13 draft and style cards (:262–:264), AI task table and zod rules (§7.1, §7.3, :330–:348), never-write-wiki rule (§3.2 :83, §1.3).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md`  - Interview continuity and extraction rules: §2 goals (:20–:27), non-goals (:33–:40), demo removal §5 A (:52–:61), question input and focus §5 B (:63–:79, key lines :67, :72, :75–:76), extraction rules name/summary/role (§5 C :81–:96), timeouts and cancel §5 D (:98–:105), anti-goals §4 (:42–:47).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Eval harness design: goals and failure criteria (§2 :15–:34), user decisions incl. chapter-1 scope (§3 :36–:48, §6.7 :231–:235), fixed inputs and answer bank (§7 :254–:270, :264), style timing and interview rule (§6.3 :135–:138, :178), Sonnet judge rules (§6.4 :176–:177), product-unchanged constraint (§10 :308–:320), decisions list (§12 :331–:351).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md`  - Plan interfaces: CHARACTER_FIELD_LABELS speech 말투 (:170), ExtractionSchema fields key/value (:501–:506), interview-question and interview-extract prompts (:515–:530), style_card apply order (:452–:454), draft-chapter prompt and route input entryIds (:648–:662), DraftPanel character multi-select (:779).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md`  - Plan for the reliability work: style-suggest route POST body {entryId} (:194), style-suggest route task (:183–:198).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - Eval plan: bible schema uses voice (harness only) (:294), style:suggest after ch2 and ≥3 dialogue lines (:39–:41, :488).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md`  - Rubric: T2 (:57), T3 (:58), T5 (:60), Q5 Characterization 1/3/5 (:92–:95), 출판 가능 and 우수 thresholds (:128–:133).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog: §2 B 인물 말투 (voice item, checklist, draft context always-include, metrics Q5 and 말투 모순), §1 new date rule, §2 A–J ordering.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Evidence: Q5 section 4.1 (:191–:196), recommended fix #2 (:235), ko vs en interpretation (:196).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - Evidence: Q5 3 with 세린 해요체 16줄 (:21, :101–:102), missing speech in interview (:148, :171), T2 speech contradiction (:44), fix list (:338–:339).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - Evidence: 세린 말투 overlaps 도윤서, no speech in draft context (:53, :69, :74, :107, :271).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - Evidence: no per-character speech card in draft context (:137), Q5 3 (:126).

Open questions:
- Define 'main character' for the always-include draft rule. The product spec has no main flag (spec §4.2 entry fields). Options: kind=character plus an explicit flag, or the top N by mention count.
- Should the draft context always include main characters' fields.speech and style cards even when they are not mentioned in the instructions? F9 is mention-based with a 12,000-char trim (spec :243–:247), and the draft route takes only entryIds (plan :662). Decide the rule and exempt it from the trim.
- Use the existing key fields.speech (spec :128) instead of the backlog's new voice key? Recommended: yes, no migration. Confirm.
- Adding 세린 말투 to the eval answer bank (follow-up §2 B, summary.md:235) changes a fixed fixture (eval spec :264, decision 14 :346). Needs a new run date for a fair baseline. Confirm.
- Speech contradiction count: spec rules out automatic judges for eval (eval spec :176–:177), so it stays a Sonnet T2 count. Confirm that no code check is wanted for Track B metrics.

## survey:B:tests

TRACK B test map: B. Character speech style (Q5). Read-only survey; nothing in the repo was changed.

## 1. Code and evidence map (what the change touches)

- Interview question prompt and checklist: `src/ai/tasks/interview-question.ts`. `INTERVIEW_TOPICS` has 8 entries (lines 54-63: 주인공, 주요 인물, 세계관 규칙, 주요 장소, 중심 갈등, 떡밥, 결말 방향, 문체). The SYSTEM checklist is at line 68, built from `INTERVIEW_TOPICS.join`. No speech or 말투 item exists in SYSTEM.
- Interview extraction prompt: `src/ai/tasks/interview-extract.ts`. Its SYSTEM does not mention field keys or speech. Field keys are only referenced through `ENTITY_NAME_RULES` ("summary나 fields에 넣는다", `src/ai/extraction-rules.ts`).
- Shared extraction schema: `src/ai/extraction.ts:17-40` (`ExtractionSchema`). Entries carry `fields: z.array({key,value})`. Used by interview, chapter-extract and import. `extractionToProposals` at line 248 maps fields to `entry_create` at lines 348-359. Field keys are free strings. Only empty keys are dropped (line 351). Nothing normalizes '말투' to 'speech'.
- Canonical speech key: `CHARACTER_FIELD_LABELS.speech = '말투'` (`src/lib/labels.ts:131`). `FIELD_LABELS` in `src/ai/context.ts:71-74` is built from that map. Unknown keys render raw (`context.ts:318`).
- Entry fields are a jsonb column, `wiki_entries.fields` (`src/db/schema.ts:156-159`). Any key is accepted, so no migration is needed for a `speech` key.
- Fill-only merge: `src/server/proposals.ts:324-332`. An existing empty field is filled, a non-empty one is kept. A revised speech therefore does not overwrite the old value.
- Style cards: `style_cards` table (`src/db/schema.ts:310-327`) has `name, tone, rules, examples, entryId?`. The UI label for `tone` is 말투 (`src/components/wiki/style-cards.tsx:193, 305`). Approval of a `style_card` proposal links by `entryName` via `findEntryByName` (`src/server/proposals.ts:574-577`). The payload schema is `src/lib/proposal-payloads.ts:85-91`.
- AI style-card path: `src/server/ai-features.ts:189-225` (`suggestStyleCard`). It needs 3 dialogue lines in saved chapters (`MIN_DIALOGUE_SAMPLES = 3`, line 49). So before 3화 the AI card path cannot run. `src/ai/tasks/style-suggest.ts:7-13` already asks for 존댓말/반말 in rules.
- Draft context: `src/server/ai-features.ts:302-313`. Style cards are filtered to `entryId === null || selected.has(entryId)`, where `selected` is the request's `entryIds`. The pack is `buildContextPack(..., extraEntryIds: input.entryIds)`. `src/ai/context.ts:134-150` picks entries only by name mention in the instructions plus `extraEntryIds`. Fields are included only for picked entries (`context.ts:181`). So a main character with no mention and no selection gets no 말투 in the draft prompt. Nothing marks a main character in the schema; the only hint is a `role` field value such as 주인공 in `fields`, which is a convention and not enforced (`CHARACTER_FIELD_LABELS.role = '역할'`, labels.ts:126).
- Draft prompt: `src/ai/tasks/draft-chapter.ts`. `DRAFT_SYSTEM` (line 6-19 region) line 10 says dialogue follows the 문체 카드. `renderCard` (line 65-70) prints `- 말투: tone`. The prompt has no separate voice section.
- Eval mirror of system prompts: `eval/novel/localize/en-systems.ts` (`EN_INTERVIEW_TOPICS` lines 19-28, 8 items; `INTERVIEW_QUESTION_SYSTEM` line 92; `DRAFT_CHAPTER_SYSTEM` line 81). Must be kept in step with Korean prompts.
- Eval fixtures: `eval/fixtures/novel/{ko,en}/bible.json` has `voice` for each character (ko lines 16, 25, 34, 52, 61) and answer-bank entries with `topics` (ko lines 154-155). `eval/fixtures/novel/{ko,en}/author-guide.md:29` says approve a style card if it captures `voice`. The author agent answers interviews only from the bank and bible (`eval/novel/agents/author.md`, rule "For anything not in the bank or the bible, answer that it is not decided yet").
- Eval rubric: Q5 defined at `docs/eval/novel-quality-criteria.md:92-96` (1 = all same voice, 3 = only protagonist distinct, 5 = recognizable with names hidden and follows style card). T2 speech contradiction is counted manually by reviewers (`eval/novel/agents/reviewer.md:45`). No code metric counts speech contradictions (`eval/novel/metrics.ts` has no speech counter; the only dialogue metric is `dialogueLineRatio`, line 14).
- Evidence: `docs/eval/novel/2026-10-18/summary.md:191-196` (Q5 ko 3, en 4 for all three models; haiku ko 16 해요체 lines; interview did not ask speech; draft context lacked 말투 cards). `docs/eval/novel/follow-up-ai-improvement.md` section B (lines around 30-40) gives the three checklist/extractor/context items.
- Design intent: `docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:72` (핵심 설정 list, same 8 topics). `docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:128` (character fixed field keys include `speech`(말투)). Spec line 149 defines style_cards.

## 2. Existing tests covering touched code (path and assertion)

Vitest include (`vitest.config.ts`): `src/**/*.test.{ts,tsx}`, `eval/**/*.test.ts`, `e2e/ai-stub/**/*.test.ts`.

- `src/ai/tasks/interview.test.ts` (407 lines). Question task: fake first uncovered topic = 주인공 (lines 58-64); skip covered (66-75, expects 세계관 규칙 after 주인공 and 주요 인물); hardcoded 8-topic story case (77-95); system prompt contains `INTERVIEW_TOPICS.join(', ')` (170-179); prompt sections (111-168). Extract task: fake 주인공/떡밥 behaviour (235-292); system contains existingThreadRef text (299-304) and 'suggestedStatus "confirmed"' (326-333). Tagged-section isolation (335-370).
- `src/ai/tasks/draft-chapter.test.ts` (117 lines). Exact `DRAFT_SYSTEM` line-by-line match (26-39). Prompt contains instructions, style cards, wiki, previous context (41-53); fakeDraft determinism (66-85); tag isolation (87-116).
- `src/ai/tasks/style-suggest.test.ts`. Exact system prompt match (22-35), fake output (43-52), tag isolation (54-66).
- `src/ai/tasks/chapter-extract.test.ts`. Fake output validates against `ExtractionSchema` (41-44), fake through FakeAiClient (74-88).
- `src/ai/context.test.ts` (250 lines). `buildContextPack` mention selection E1 (35-46); extra entry ids (55-67); budget drop of lowest entries (100-112, budget 500, keeps 이서윤 only); previous summaries (163-173); `renderContextPack` byte-identical (214-227) and status labels (229+).
- `src/ai/extraction.test.ts` (928 lines). Schema accept/reject (38-63). New entry fields record (98-127: fields `나이` kept as-is, empty key dropped). Payload validity (367-422). Name/dedup rules (649-928).
- `src/server/interview.test.ts` (776 lines). askNextQuestion prompt has work, wiki, story, covered (165-175). Focus passthrough (627-658). Answer flow, dedup, naming (200-448). Continuous questions (490-575).
- `src/server/ai-features.test.ts`. Style card suggestion (116-171). Draft: prompt includes work cards, selected entry 서윤 card, previous tail, excludes 철수 style card (210-257; assertion `not.toContain('철수 말투')` at line 252). Chapter creation (276-307).
- `src/server/proposals.test.ts`. entry_create with fields `role: '주인공'` (76, 108-122). entry_update fills fields (125-150). style_card approval creates card (409-426).
- `src/server/styles.test.ts` (82 lines). CRUD, change log, list, VALIDATION, FORBIDDEN (32-80).
- `src/test/fake-ai.test.ts` (154 lines). Registry answers, schema validation, overrides, streamText chunks (31-150).
- `src/lib/labels.test.ts`. `CHARACTER_FIELD_LABELS` has speech → '말투' (line 31); PROPOSAL_TYPE_LABEL style_card (25).
- `src/components/wiki/entry-form.test.tsx`. Creates a character with `speech` field '짧고 단정하다' (37-68).
- `src/components/wiki/style-cards.test.tsx`. Card display, AI suggestion, viewer hides controls (55-100).
- `src/app/api/works/[workId]/interview/next/route.test.ts` (42-90). Auth, NOT_FOUND. `src/app/api/works/[workId]/style-suggest/route.test.ts`.
- `eval/novel/localize/localize.test.ts`. `EN_SYSTEMS` has an English prompt for every task with no Hangul (322-328). `EN_INTERVIEW_TOPICS` length is exactly 8 (330-335).
- `e2e/ai-stub/responders.test.ts`. Stub answers for interview-extract/question (lines ~108-130, 204-222). `QUESTION_TOPICS = ['주인공','주요 인물','떡밥','세계관']` in `e2e/ai-stub/responders.ts:210`. Stub extract answer has `fields: []` (responders.ts ~175-185).
- `eval/novel/metrics.test.ts`. Length, foreign runs, meta, ending, dialogue ratio (4-120). No speech metric test exists.

## 3. Factories and FakeAiClient wiring

- `src/test/factories.ts` exports: `createTestUser` (20), `createTestWork` (33), `addTestMember` (50), `createTestChapter` (59), `createTestEntry` (87, opts `name, kind?, aliases?, summary?` only, no `fields`), `createTestFact` (105), `createTestThread` (132). No factory accepts `fields` or `customFields`. A test that needs a 말투 or role field must either extend `createTestEntry` with a `fields` option or insert with `db.insert(wikiEntries)`.
- `src/test/fake-ai.ts`: `FakeAiClient` implements `generateObject` (parses output with the task schema) and `streamText` (chunks of 40 chars). Lookup order: per-test `overrides[name]`, then `FAKE_OUTPUTS[name]` (structured) or `FAKE_TEXT[name]` (stream). Missing → throws `No fake output for task X`.
- `src/test/ai-fakes/index.ts`: `FAKE_OUTPUTS` maps interview-question, interview-extract, chapter-extract, continuity-check, proofread, reader-sim, direction-advice, style-suggest. `FAKE_TEXT` maps only draft-chapter (`fakeDraft`).
- Fixtures: `src/test/ai-fakes/interview-question.ts:16` is `Record<(typeof INTERVIEW_TOPICS)[number], InterviewQuestion>`. Adding a topic is a compile error until a key is added. `fakeInterviewQuestion` (line ~70) picks the first uncovered topic, else the story question. `src/test/ai-fakes/interview-extract.ts:34` creates a character only for topics 주인공 or 주요 인물, with `fields: []`. `src/test/ai-fakes/draft-chapter.ts` splits instructions into six paragraphs; it does not use styles.
- `src/test/ai-fakes/style-suggest.ts` returns `${entryName} 말투`, tone '(데모) ...'.

## 4. Exact vitest command

pnpm vitest run src/ai/tasks/interview.test.ts src/ai/tasks/draft-chapter.test.ts src/ai/tasks/style-suggest.test.ts src/ai/tasks/chapter-extract.test.ts src/ai/context.test.ts src/ai/extraction.test.ts src/server/interview.test.ts src/server/ai-features.test.ts src/server/proposals.test.ts src/server/styles.test.ts src/test/fake-ai.test.ts src/lib/labels.test.ts src/components/wiki/entry-form.test.tsx src/components/wiki/style-cards.test.tsx 'src/app/api/works/[workId]/interview/next/route.test.ts' eval/novel/localize/localize.test.ts e2e/ai-stub/responders.test.ts --maxWorkers=2

(Quote the bracketed route path. Add `eval/novel/metrics.test.ts` if a metric is added.)

## 5. Recommendation on the data model (no DB migration)

Recommend option A, with no migration and no schema change:
- Store the voice in the existing character field `fields.speech` (label 말투, labels.ts:131). Interview and extraction produce it as an `entry_create` or fill-only `entry_update` field. The key must be normalized to `speech` in `extractionToProposals` (extraction.ts:348-359), so that '말투', '말버릇' and similar keys map to `speech`. This is a code change, not a migration.
- Draft context: after `buildContextPack`, always add the `fields.speech` of main characters. Define "main" in code, e.g. kind character with `fields.role` containing 주인공 or 주요 인물, or the top N by mention count. Also include their `style_cards` (entryId set) regardless of `entryIds`. Change `ai-features.ts:302-306` and the pack assembly in `context.ts`.
- Option B (`voice` array in `ExtractionSchema` mapped to `style_card` proposals with `tone`, via existing `style_cards.tone`) is also migration-free, but it changes the shared `ExtractionSchema` (extraction.ts:17-40). That breaks every fake or stub output that lacks the key: `src/test/ai-fakes/interview-extract.ts`, `e2e/ai-stub/responders.ts`, `src/ai/extraction.test.ts` `emptyExtraction`, and the chapter-extract and import fakes. The AI style-card path also needs 3 dialogue lines, so it is unusable before 3화. Option B is more work for the same result.
- Checklist: add the line "주요 인물마다 말투(존댓말·반말·말버릇)" to the SYSTEM text of `interview-question.ts` (line 68 area). Do NOT add a new INTERVIEW_TOPICS entry in the first step, because it breaks tests (see section 6). The question prompt has no exact-match test, so this line is free of breakage.

## 6. NEW tests that must exist (name | input | expected)

1. interview-question: system prompt has the speech checklist line | `interviewQuestionTask.system` | contains "주요 인물마다 말투(존댓말·반말·말버릇)".
2. interview-question: system prompt tells the extractor to record speech as a field | system | contains a rule that the 말투 answer goes into the entry field `speech`. (Wording chosen in the change.)
3. interview-extract fake: a 주요 인물 answer with a voice sentence gives the character a `speech` field | answer "서윤은 존댓말을 쓰고 한두 마디로 끝낸다.", topic 주요 인물, unknown 서윤 | `entries[0].fields` contains `{key:'speech', value:'...'}`. Requires updating `src/test/ai-fakes/interview-extract.ts:34` and the stub `responders.ts`.
4. extraction: field key normalization | Extraction with entry fields `[{key:'말투', value:'반말'}]`, new entry 민준 | entry_create payload `fields` equals `{speech:'반말'}`. Today it yields `{말투:'반말'}`, so this test fails first (TDD).
5. extraction: a non-speech key like `나이` is unchanged | fields `[{key:'나이', value:'17'}]` | `{나이:'17'}` (existing behaviour, pin it).
6. extraction: fill-only merge keeps an existing speech | entry_update patch fields `{speech:'새 말투'}` on an entry whose fields already have speech '반말' | the stored value stays '반말'. Pin current behaviour (`proposals.ts:326-327`). Document that a voice change needs an author edit.
7. context: main-character voice is in the pack without a mention | entry 서윤 kind character, `fields.role='주인공'`, `fields.speech='반말'`; text "민준은 웃었다."; position 1 | `pack.entries` contains 서윤 with `fields.speech === '반말'`; `renderContextPack` contains "- 말투: 반말". Needs `createTestEntry` to accept `fields` (extend factories.ts:87).
8. context: main-character voice survives the budget drop | budgetChars 500 with 서윤 main and 민준 600-char summary | 서윤 kept, 민준 dropped. Must be checked against existing test at context.test.ts:100-112.
9. draft-chapter: prompt has a voice section for main characters | `buildDraftPrompt` with `voices: [{name:'서윤', speech:'반말'}]` (new input field) | prompt contains "서윤" and "반말" inside the voice section, and the section is present even when `styleCards` is empty.
10. draft-chapter: DRAFT_SYSTEM rule for voices | system | contains a rule that main characters' lines follow their 말투 field. Update the exact-match test at draft-chapter.test.ts:26-39 in the same change.
11. ai-features draft: main-character voice reaches the prompt with no entryIds | `startDraft` with `entryIds: []`, 서윤 `role 주인공` with `speech` field, not mentioned in instructions | spy prompt contains '서윤' and '말투: 반말'.
12. ai-features draft: a non-main character voice stays out | 철수 with no role field, `entryIds: []` | prompt does not contain 철수's speech. Pins the rule so it does not become "all characters".
13. ai-features draft: main character style card with no entryIds | style card with entryId = 서윤 (main) | prompt contains that card name. Requires the change at `ai-features.ts:302-306`.
14. localize: EN topic count after a topic change | `EN_INTERVIEW_TOPICS` | only if a topic is added: length 9 (update line 330-335). If not added, no change.
15. localize: EN draft and interview system prompts have the voice rule | `EN_SYSTEMS['draft-chapter']` and `EN_SYSTEMS['interview-question']` | contain "speech" or "voice" wording, and no Hangul (existing no-Hangul check at 322-328 covers this).
16. eval metric (only if a code metric is added): speech contradiction count | `metrics.test.ts` new case | returns a count for a Korean passage with a 반말 line for a 존댓말 character. Currently no such metric exists, so Q5 and speech contradiction stay manual (reviewer.md:45).
17. eval bible: 말투 answer-bank entry exists | `eval/fixtures/novel/ko/bible.json` bank | at least one bank entry whose `topics` include "말투" or "주요 인물" with a 말투 sentence, for ko and en. Otherwise the author agent answers "not decided yet" (author.md rule), which zeroes the Q5 signal.

## 7. Existing tests that will break, and why

- `src/ai/tasks/interview.test.ts:77-95` (story after all 8 topics). Hardcodes the 8-topic array. Breaks only if a topic is added to INTERVIEW_TOPICS. Fix: add the new topic to the array.
- `src/ai/tasks/interview.test.ts:66-75`. Expects 세계관 규칙 after 주인공 and 주요 인물. Breaks only if the new topic is inserted between those two.
- `src/test/ai-fakes/interview-question.ts:16`. `Record<(typeof INTERVIEW_TOPICS)[number], ...>` requires a key for the new topic. This is a TypeScript error (`pnpm typecheck`), not a Vitest failure. Breaks on any new topic.
- `eval/novel/localize/localize.test.ts:330-331`. `expect(EN_INTERVIEW_TOPICS).toHaveLength(8)`. Breaks on a new topic. Fix: update EN_INTERVIEW_TOPICS in `en-systems.ts:19-28` and the count.
- `src/ai/tasks/draft-chapter.test.ts:26-39`. Exact line-by-line DRAFT_SYSTEM match. Breaks on any change to DRAFT_SYSTEM. This is intended; update it in the same change.
- `src/ai/tasks/interview.test.ts:299-304` and `:326-333`. Check specific phrases in the extraction system prompt. Safe unless those phrases change.
- `src/ai/context.test.ts:100-112` (budget 500). Breaks only if main characters are forced in above the budget. A forced pin that ignores budget must not drop 민준 logic; check the drop loop at `context.ts:285-300` when changing it.
- `src/server/ai-features.test.ts:210-257`. Asserts `not.toContain('철수 말투')`. Breaks only if the rule selects every character. The test's 철수 has no `role` field, so it still passes with the main-character rule (new test 12 pins this).
- If option B (ExtractionSchema change): breaks `src/ai/extraction.test.ts:38-63` (schema) and `emptyExtraction` fixtures, `src/ai/tasks/chapter-extract.test.ts:41-88` (fake validation), `src/test/fake-ai.test.ts`, and `e2e/ai-stub/responders.test.ts` (stub extract output lacks the key, so it fails zod parse in FakeAiClient). This is the main reason to prefer option A.
- `src/lib/labels.test.ts:31`. Keeps passing (`speech` label is not renamed).
- `src/components/wiki/entry-form.test.tsx`. Keeps passing (no UI change required). A UI change to show the speech field for main characters would need new tests.

Not verified: whether `src/test/setup.ts` or `CLAUDE.md`'s `setAiClientForTests` exists; I did not open `src/test/setup.ts`.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 54-68 - Interview question prompt and checklist (INTERVIEW_TOPICS line 54, SYSTEM line 68). Add the speech checklist line here.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 14-40 - Interview extraction SYSTEM; no field-key or speech rule yet.
- `/home/xogud/documents/github/DaeumHwa/src/ai/extraction.ts` 17-40, 348-359 - Shared ExtractionSchema (fields as key/value array) and extractionToProposals field mapping (free keys, no normalization).
- `/home/xogud/documents/github/DaeumHwa/src/lib/labels.ts` 125-134 - CHARACTER_FIELD_LABELS.speech = 말투 (canonical key).
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts` 324-332, 574-590 - Fill-only field merge for entry_update; style_card approval links by entryName.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 49, 189-225, 302-316 - Draft service: style cards filtered by entryIds; suggestStyleCard needs 3 dialogue lines.
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 64-74, 134-182, 285-300, 318 - Context pack: entries chosen only by mention or extraEntryIds; fields rendered via FIELD_LABELS; budget drop loop.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-70 - DRAFT_SYSTEM and buildDraftPrompt; renderCard prints 말투 from style card tone.
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 144-166, 310-327 - wiki_entries.fields jsonb (any key) and style_cards (tone/rules/examples); no migration needed for a speech key.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-question.ts` 16, 70-74 - FAKE_QUESTIONS Record keyed by INTERVIEW_TOPICS; adding a topic forces a new key.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-extract.ts` 26-44 - Fake extraction creates character only for 주인공/주요 인물 topics with fields: [].
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` 1-60 - FakeAiClient: overrides, then FAKE_OUTPUTS / FAKE_TEXT, schema parse.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 1-30 - FAKE_OUTPUTS and FAKE_TEXT registries.
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts` 87-103 - createTestEntry accepts only name/kind/aliases/summary; extend for fields.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview.test.ts` 51-96, 170-190, 228-333 - Existing interview question/extract tests; hardcoded 8-topic test at 77-95.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts` 25-64 - Exact DRAFT_SYSTEM match test (26-39) that breaks on any system edit.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts` 116-171, 173-257 - Draft prompt test (210-257) with not.toContain 철수 style card; style card suggestion tests.
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.test.ts` 34-112 - Budget drop test (100-112) and pack tests.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts` 322-335 - EN_INTERVIEW_TOPICS length 8 assertion (330-335).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts` 19-28, 81-100 - English mirror of interview and draft prompts; topic list lines 19-28.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` Judgment rules section - Author agent answers only from bank and bible; unknown topics get not-decided.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/bible.json` 16-61, 154-155 - Character voice fields (16, 25, 34, 52, 61) and answer bank topics (154-155).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md` 92-96 - Q5 definition and anchors.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 37, 87, 191-196 - Q5 evidence (ko 3, en 4) and speech gap analysis.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` B section - Backlog section B for this track.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 170-200, 210 - E2E stub extract output (fields: []) and QUESTION_TOPICS.

Open questions:
- Which main-character rule to use: fields.role containing 주인공 or 주요 인물 (convention only, not enforced), top-N by mention count, or an explicit flag. The repo has no main-character marker.
- Whether to add 말투 as a new INTERVIEW_TOPICS entry (breaks 4 tests and the typed fake record) or only as a checklist line in SYSTEM (breaks nothing). The survey recommends the checklist line first.
- Whether the extractor should emit canonical key 'speech' by prompt instruction, by code normalization in extractionToProposals, or both. Code normalization is testable and recommended.
- Whether a revised voice should overwrite an existing speech field. Current fill-only merge (proposals.ts:326-327) keeps the old value.
- Whether a speech contradiction metric should be code-counted. No such metric exists; Q5 and T2 speech cases are manual reviewer judgments.


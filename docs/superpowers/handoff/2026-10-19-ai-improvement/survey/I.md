# Track I: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:I:code

Code map for TRACK I (interview question strategy). Read-only survey; no files changed.

DATA FLOW
1. Product entry: the screen calls POST /api/works/[workId]/interview/next (src/app/api/works/[workId]/interview/next/route.ts:11-19), which calls askNextQuestion(db, actor, sessionId, undefined, signal). Answers go through .../answer/route.ts:16-19 into answerTurn. Server Actions in src/server/actions/interview.ts do not ask questions (only start, skip, complete at lines 16-47).
2. Service: askNextQuestion (src/server/interview.ts:95-149) returns the open turn if one exists (107-108), otherwise builds input via buildQuestionInput (110, defined 360-544), calls runAiTask with interviewQuestionTask (112-118), retries once if the normalized question repeats an earlier one (119-129, using loadQuestionKeys 345-352 and normalizeQuestion 279-281), then inserts the turn with onConflictDoNothing (134-145).
3. AI call: runAiTask in src/ai/run.ts (imported at src/server/interview.ts:23). Task def at src/ai/tasks/interview-question.ts:192-199 (effort low, maxTokens 2000, system SYSTEM, buildPrompt buildInterviewQuestionPrompt, schema InterviewQuestionSchema 46-51).
4. Prompt: SYSTEM rules at src/ai/tasks/interview-question.ts:65-77; buildInterviewQuestionPrompt 111-190 renders <work>, <wiki>, <story>, <covered> (via covered() 90-97, turnAnswer 100-104 which shows "(건너뜀)" / "(답 없음)"), <recent>, and <rejected> when set.
5. Answer: answerTurn (src/server/interview.ts:155-235) stores the raw answer text (222) and runs interviewExtractTask (171-200). Nothing classifies the answer; no 미정 detection exists anywhere in src/ or eval/novel/ (grep checked). The only "미정" matches are fact status labels.
6. Eval path: eval/novel/steps/interview.ts:53-153. The step loop calls askNextQuestion(ctx.db, ctx.actor, sessionId, ctx.client) at 65-66 (no signature change needed). The author answer is requested via consult (94), then answerTurn (99-101), then focusCounts (105), then proposals (113-138). Eval's AI client is eval/novel/eval-client.ts; EN prompts are swapped at eval-client.ts:438 using EN_SYSTEMS.

WHERE THE NEW BEHAVIOR HOOKS IN (smallest diff)
A. Prompt rules (no code change to flow): add lines to SYSTEM at src/ai/tasks/interview-question.ts:65-77. Keep the exact phrase '질문을 한 번에 하나만 한다.' (line 66), '<covered>에 있는 질문은 되풀이하지 않는다.' (line 71) and 'INTERVIEW_TOPICS.join' (line 68), because src/ai/tasks/interview.test.ts:171-176 asserts them. Mirror the same rules in English in eval/novel/localize/en-systems.ts:92-107 (INTERVIEW_QUESTION_SYSTEM, mapped at line 146). Parity is checked by localize.test.ts:322-327 (no Hangul in EN_SYSTEMS).
B. Code-computed closure signal (recommended, since small models ignore prompt rules): add an optional field to InterviewQuestionInput (src/ai/tasks/interview-question.ts:10-37), for example closedTopics: string[] or undecidedStreak: number. Compute it in buildQuestionInput (src/server/interview.ts:360-544) from coveredRows (query 451-463, already ordered newest first, limit 120) and/or recentRows (470-480). Render it in buildInterviewQuestionPrompt (111-190) as a new section, not as extra "- " lines inside <covered> (see E2E coupling below). Detection of "미정" must be added as a new helper; a substring test is unsafe because the bible's 'ending' answer contains "결말은 아직 정하지 않았어요. ... 방향만 정했어요." (eval/fixtures/novel/ko/bible.json:163). The pure-undecided answer is "그건 아직 정하지 않았어요." (bible.json:165, key "unknown").
C. Topic already closed in fake: src/test/ai-fakes/interview-question.ts:69-74 treats any covered topic as closed, regardless of answer, so no change is needed there unless the rule depends on undecided answers.
D. Skip behavior: skipTurn (src/server/interview.ts:238-257) only marks skipped. Its doc comment ("The next question avoids its topic", line 237) is enforced only through the prompt's (건너뜀) label in covered(), not in code.

CALL SITES AFFECTED BY A SIGNATURE OR TYPE CHANGE
- InterviewQuestionInput is constructed in: src/server/interview.ts:360-364 (buildQuestionInput return), src/ai/tasks/interview.test.ts:20-41 (emptyQuestionInput; a required new field breaks typecheck here), src/ai/tasks/interview.test.ts:112-203 and 352 (object literals), e2e/ai-stub/responders.test.ts:212-216 (PROMPTS object, interview-question entry), eval/novel/localize/localize.test.ts:168-180 (buildPrompt input), src/test/ai-fakes/interview-question.ts:69 (reads only covered). Make a new field optional with a default to keep the diff small.
- askNextQuestion (src/server/interview.ts:95-101) signature should not change. Callers: next/route.ts:18, answer route test, src/server/interview.test.ts (many), src/app/api/works/[workId]/interview/next/route.test.ts:126, eval/novel/steps/interview.ts:66. No caller needs changes if the logic stays in buildQuestionInput.
- answerTurn signature (src/server/interview.ts:155-161) should not change.

E2E COUPLING (must not break)
- e2e/ai-stub/responders.ts:216-228 questionAnswer counts lines starting with "- " inside <covered> (section() helper at 72-75) to pick topic (QUESTION_TOPICS at 210: 4 topics) and focus by parity. Any new "- " line inside <covered> changes the stub's output. Use a separate section tag.
- e2e/interview.spec.ts:8-41 expects a second question different from the first.

TRACK B COORDINATION (speech question)
- Adding a topic (for example voice/말투) means: INTERVIEW_TOPICS (src/ai/tasks/interview-question.ts:54-63); FAKE_QUESTIONS is typed Record<(typeof INTERVIEW_TOPICS)[number], ...> so TypeScript forces a new entry (src/test/ai-fakes/interview-question.ts:16-66); the topic-order tests at src/ai/tasks/interview.test.ts:58-95 hard-code 8 topics; EN_INTERVIEW_TOPICS (eval/novel/localize/en-systems.ts:20-29) and its length-8 assertion (eval/novel/localize/localize.test.ts:331).
- The eval fake author cannot produce 미정 answers in practice: eval/novel/fake-author.ts:7-24 picks a bank entry by keyword and falls back to answerBank[0] (line 18). Real judgment comes from eval/novel/agents/author.md:51 (unknown → "not decided yet", bankKeys []).

EVAL METRICS HOOKS
- Setting/story ratio: already recorded as state.data.focusCounts (eval/novel/steps/interview.ts:105; state.ts:42, 89; finish.ts:119).
- 미정 share: not recorded. Options: count from eval/novel/author-io.ts logDecision output (author-decisions.jsonl, via settle at util.ts:194-197) or add a counter in steps/interview.ts near line 105.
- Duplicate questions: normalizeQuestion (src/server/interview.ts:279-281) can be reused offline.

OBSERVED GAPS (evidence)
- Luna ko 12 questions, 9 answered 미정 (docs/eval/novel/2026-10-18/summary.md:85, 242; luna-6-ko.md:99-106). Four of six runs had zero story questions (summary.md:86, 272). Two repeated questions in luna ko (luna-6-ko.md:104).
- The SYSTEM already says "one question at a time" (interview-question.ts:66) and already has a story branch (line 69), yet the model did not switch (luna-6-ko.md:106).
- Track I backlog: docs/eval/novel/follow-up-ai-improvement.md:123-134.

NOT READ
- src/db/schema.ts interview tables and the partial unique index referenced at src/server/interview.ts:132 (not inspected).
- src/ai/run.ts runAiTask internals (only its call sites were checked).
- src/server/interview.test.ts was sampled at lines 125-190, 421-460, 476, not in full.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 10-37, 39-44, 46-51, 53-63, 65-77, 90-97, 100-104, 111-190, 192-199 - Core: InterviewQuestionInput type (10-37, add optional closure field here); output type (39-44); INTERVIEW_TOPICS (53-63); SYSTEM rules where prompt rules go (65-77); covered() renderer (90-97); turnAnswer (100-104); buildInterviewQuestionPrompt (111-190, render new section here); task def (192-199, effort low, maxTokens 2000).
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 37-48, 95-149, 119-129, 132-145, 155-235, 237-257, 279-281, 344-352, 360-364, 451-463, 470-480, 485-543 - Service: constants (37-48); askNextQuestion entry and repeat retry (95-149); answerTurn stores raw answer and runs extraction (155-235); skipTurn (237-257); normalizeQuestion (279-281); loadQuestionKeys (344-352); buildQuestionInput, the only producer of the task input (360-544), with covered query (451-463) and recent query (470-480) where the undecided streak should be computed; return mapping (485-543).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/next/route.ts` 11-19 - Entry point for the product question call; calls askNextQuestion with no client (uses default AI).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/answer/route.ts` 11-19 - Entry point for the answer call; calls answerTurn. Unchanged by track I unless 미정 detection runs at answer time.
- `/home/xogud/documents/github/DaeumHwa/src/server/actions/interview.ts` 16-47 - Server Actions for start, skip and complete only. No question logic here.
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts` 52-53 - INTERVIEW_FOCUSES ('setting','story') and InterviewFocus type used by the task and the schema.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 53-153, 63-66, 94, 105, 113-138 - Eval step: calls askNextQuestion with ctx.client (65-66, no signature change), author consult (94), answerTurn (99-101), focusCounts (105), proposals (113-138). Hook for 미정 metric is near line 105.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 113-126, 187-197 - guarded (113-126) and consult/settle (187-197) helpers used by the eval interview step.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 61-71, ~118-121 - Pending interview_answer schema (61-71) and Answer interview_answer schema (~118-121); source of author-decisions.jsonl.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 7-24 - Deterministic fake answer by keyword from the bible answer bank, falling back to answerBank[0] (line 18). Cannot produce 미정 in practice.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 51 - Author judgment rule: unknown topics get 'not decided yet' with bankKeys []. Source of the real 미정 answers.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts` 19-29, 92-107, 146 - English mirror: EN_INTERVIEW_TOPICS (19-29), INTERVIEW_QUESTION_SYSTEM (92-107, must mirror any SYSTEM rule change), mapping (146).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts` 168-180, 322-327, 331 - Parity tests: prompt build input (168), no Hangul in EN_SYSTEMS (322-327), 8-topic length assertion (331).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 7, 108-118, 438 - TASK_DEFS timeout list (108-118) and EN system selection (438). No change needed for track I.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 42, 89 - focusCounts in RunState (42) and initial value (89).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 119 - Writes focusCounts into the run summary; place to add a 미정 count if it is recorded in state.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-question.ts` 9-14, 16-66, 69-74 - Fake question: FAKE_QUESTIONS typed by INTERVIEW_TOPICS (16) so a new topic forces an entry; fakeInterviewQuestion picks first uncovered topic (69-74), treating any covered topic as closed.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 7, 15 - Registers fakeInterviewQuestion for the 'interview-question' task.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview.test.ts` 20-41, 51-75, 77-95, 97-109, 111-137, 145-149, 150-168, 171-176, 182-188 - Tests to update: emptyQuestionInput (20-41; add the new field if required), topic order and story transition (58-95, hard-codes 8 topics), prompt sections (111-137), system assertions (171-176, the phrase at 171 must stay or be updated), rejected (150-168).
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.test.ts` 125-190, 421-460, 476-485 - askNextQuestion behavior tests (repeat retry, state errors, AI limit); uses fakeInterviewQuestion through a typed client at 476. Add closure-signal tests here.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/next/route.test.ts` 126 - Route test that calls askNextQuestion directly with FakeAiClient.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 40, 72-75, 210, 216-228 - E2E stub: task mapping (40); section() parser (72-75); QUESTION_TOPICS (210); questionAnswer counts '- ' lines in <covered> (216-228). Coupling: do not add '- ' lines inside <covered>.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.test.ts` 212-231 - Stub test that builds an interview-question prompt through buildPrompt; must keep working when the input type changes.
- `/home/xogud/documents/github/DaeumHwa/e2e/interview.spec.ts` 8-41 - E2E: second question must differ from the first (36); no 미정 or focus assertion.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/bible.json` 157-165 - Answer bank: 'ending' answer (163) with partial undecided wording, and 'unknown' key with pure 미정 answer (165). Shows why a substring rule is unsafe.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 123-134 - Track I backlog: problem, to-dos, metrics.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 85-86, 242, 272-273 - Evidence: 미정 counts per run (85), story-zero runs 4 of 6 (86), design-lesson row 9 (242), recommended fixes rows 3-4 (272-273).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 87, 97-106 - Evidence: interview review for luna ko; 12 setting questions, duplicate questions (104), story branch ignored (106).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` not read - Design intent for interview reliability; relevant but not reviewed in this pass.

Open questions:
- Detection rule for 미정 answers: a substring match is unsafe (bible.json:163 'ending' answer contains the undecided phrase plus content). Decide between an exact or short-answer rule and a model-based classification, and where it runs (answer time in answerTurn, or question time in buildQuestionInput).
- Whether the focus switch (after two consecutive 미정) should be enforced in code, for example by passing a forced focus or topic into the input, or left to the prompt. Small models ignored the existing story branch in luna ko (luna-6-ko.md:106).
- Whether a new speech (말투) topic from track B is added to INTERVIEW_TOPICS, which forces edits in the fake, the EN mirror and the topic-order tests. Agree the order with track B before editing.
- The eval fake author never answers 미정 (fake-author.ts:18). Decide whether the metric for 미정 share is measured only with the real author agent, or whether the fake gets an undecided answer path.
- src/db/schema.ts (interview tables, partial unique index) was not read; confirm before changing any stored field.

## survey:I:evidence

TRACK I (interview question strategy) survey. Read-only; nothing in the repo was changed.

## 1. Backlog item (docs/eval/novel/follow-up-ai-improvement.md:123-134)
Problem: 미정 topics asked again; Luna ko 9 of 12 answers were 미정; 4 of 6 runs had zero story questions; multi-part questions. Planned work: close a topic after 미정, switch after 2 consecutive 미정, ask one thing per question, run with B (speech). Metrics named: 미정 share, setting/story ratio, duplicate questions. Backlog line 133 is the B link.

## 2. Evidence per run (1 chapter each, all from the reviews)
- Focus counts (setting/story): luna ko 12/0 (luna-6-ko.md:99); luna en 12/0 (luna-6-en.md:113, 117 context); haiku en 12/0 (haiku-5.5-en.md:82); qwen ko 12/0 (qwen3.8-27b-ko.md:231); haiku ko 10/2 (haiku-5.5-ko.md:156); qwen en 10/2 (qwen3.8-27b-en.md:102). Zero story in 4 of 6 is confirmed (summary.md:86).
- 미정 answers: luna ko 9 of 12, calls 001,003,005,007,009,011,013,015,023 (luna-6-ko.md:105); luna en 10 of 12 (luna-6-en.md:115, summary.md:85); qwen ko last 6 of 12 all 미정 (qwen3.8-27b-ko.md:233, 219); qwen en 11 of 12 extraction calls carried hedged or "not decided" answers (qwen3.8-27b-en.md:117-118, calls 002-024 even numbers); haiku ko and haiku en: no explicit count in the review (haiku-5.5-en.md:83 notes only call 021 as 미정; haiku-5.5-ko.md:168 notes one 미정 on the 4th question).
- Repeats of a covered topic: luna en 2 (call 003 vs 001, 013 vs 009; luna-6-en.md:115); luna ko 2 (003 after 미정 on 001-ish topic, 013 vs 005; luna-6-ko.md:104); haiku en 2 (021, 023 on the key rule; haiku-5.5-en.md:82); haiku ko 1 full repeat (12th vs 2nd, haiku-5.5-ko.md:163) plus 1 partial (8th vs 3rd, haiku-5.5-ko.md:166); qwen ko 1 (023 vs 005, qwen3.8-27b-ko.md:234); qwen en 1 (017 vs 011, qwen3.8-27b-en.md §3.1 "Repeat" bullet).
- Multi-part questions: qwen ko 9 of 12 (001,003,005,007,009,011,013,021,023; qwen3.8-27b-ko.md:235); haiku ko 5 (3,4,5,7,11; haiku-5.5-ko.md:169); qwen en "many" (call 009 packs 3-4 asks; qwen3.8-27b-en.md §3.1 "Length" bullet, no count); luna ko claims one at a time (luna-6-ko.md:101) with no count; luna en "one or two sentences" (luna-6-en.md:113), no count.
- Invented premise in question text: haiku ko Q4 (haiku-5.5-ko.md:168); qwen ko Q023 "보름날" (qwen3.8-27b-ko.md:234); qwen en calls 011/017 "before the seal ... is broken" (qwen3.8-27b-en.md §3.1).
- Summary numbers match the reviews: summary.md:85 (미정 9 and 10), summary.md:86 (story 0 in 4 of 6), summary.md:83 (multi-part, repeat).

## 3. Product-side causes (src/ai)
- The question prompt never mentions 미정. Rules are at src/ai/tasks/interview-question.ts:68-74. Line 71 says a repeated topic is allowed if the question goes "한 걸음 더 나아간" (one step further), which is the loophole behind the repeats. Line 69 leaves the switch to story as the model's judgment ("충분하면"), with no code trigger.
- The topic is free text: src/ai/tasks/interview-question.ts:48 `topic: z.string()`, not an enum of INTERVIEW_TOPICS (lines 54-63). So code cannot check coverage or close a topic.
- The topic list (interview-question.ts:54-63) has no 말투 / character voice sub-topic. Reviews say Jiwon's manner and Serin's speech were never asked (luna-6-ko.md:107, haiku-5.5-en.md:78-79). This is the B link.
- The answer text does reach the prompt: src/server/interview.ts:533-541 maps covered turns with answer text; answered or skipped turns count as covered (interview.ts:546-548). So the model sees "아직 정하지 않았어요" but no rule uses it.
- Author-side skip exists (src/server/interview.ts:240-256, skipTurn sets skipped=true) but the AI never gets a 미정 flag. Extraction does classify "undecided" facts (src/ai/tasks/interview-extract.ts:27, 33).
- Tests already assert some of this (src/ai/tasks/interview.test.ts:170-183), including "질문을 한 번에 하나만 한다." and the no-repeat rule, so the prompt wording is tested but the behaviour is not enforced.

## 4. Proposed acceptance criteria (per run, 1 chapter, then 2+ chapters)
1. 미정 share: count of interview_answer lines whose answer matches a 미정 pattern (아직 정하지 않았어요 / 아직 드러나지 않아요 / 결정하지 않았어요). Current: luna ko 9/12, luna en 10/12, qwen ko >=6/12, qwen en about 11/12 (extract calls), haiku ko and en not counted. Target: <=3/12 per run after a 2-consecutive-미정 rule; the bank-driven answers are a confound, so the target applies to the author persona fixed in the harness.
2. Same-topic re-ask after 미정: 0. Current: luna en 2, luna ko 2, haiku en 2, haiku ko 1, qwen ko 1, qwen en 1.
3. Story questions: >=2 of 12 per run, and at least 1 story question once 6 of 8 core topics are covered. Current: 0 in 4 of 6 runs, 2 in 2 runs. Measure from focusCounts.
4. Single-ask questions: 0 questions with 2+ asks. Current: qwen ko 9, haiku ko 5, others not counted. Needs a new metric (see gaps).
5. Core-topic coverage before the first story question: 8 of 8 topics, using the topic field. Needs topic-level tallies.
6. Premise check (question adds a fact not in the wiki or the answer): 0. Current: 3 in 3 runs reviewed (haiku ko Q4, qwen ko 023, qwen en 011/017). This is a judge metric, not a count.

## 5. Measurability in eval/novel
- Exists: focusCounts per run (eval/novel/steps/interview.ts:105, written to the run summary at eval/novel/steps/finish.ts:119). Covers criterion 3 and the setting/story ratio.
- Exists: per-answer text (eval/novel/author-io.ts:118-119 schema, :251 log write to author-decisions.jsonl); run.test.ts:182 asserts 12 interview_answer lines. Criterion 1 can be computed offline with a regex over this file. Question text sits in calls/*.json (the reviews cite calls/NNN), which covers criteria 2 and 4 once the question text is joined to the answer.
- Missing: eval/novel/metrics.ts covers only chapter text (lines 1-15, 41-89). It has no interview metrics: no 미정 share, no duplicate count, no compound-question count, no topic coverage, no story ratio beyond raw focusCounts. A new function (e.g., interviewMetrics(turns)) would sit beside chapterMetrics, with its own test in metrics.test.ts.
- Missing for criterion 2 and 4: no similarity function. A token-overlap check against covered questions (normalised, threshold tuned on the 6 known repeat pairs) and a regex or a count of ?/및/그리고 in question text would cover both. The reviews' hand counts are the only ground truth today.
- Missing for criterion 6: no judge. Reuse the existing review rubric or add a small LLM check on "question premise appears in <wiki> or the answer".
- Not in this checkout: eval/results/novel/2026-10-18/ run folders (run-summary.json, config.json) are not present under the repo root, so the run-level numbers above come from the review and summary text, not re-computed.

## 6. Notes on confounds
- Author answers come from a bank (luna-6-ko.md:105 says 답변 은행은 하네스 쪽 변수; luna-6-en.md:115 bankKeys). A high 미정 share may reflect the bank, not the question model. The criterion needs a fixed author policy when measured.

## 7. Dependencies
- B (speech question): add a per-character voice sub-topic to INTERVIEW_TOPICS (interview-question.ts:54-63) or to the 주요 인물 topic. The same topic list drives criteria 5.
- Changing topic from z.string() to an enum (interview-question.ts:48) is a schema change and would need the orchestrator's approval per CLAUDE.md package rules only if a package changes; it does not.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 123-134 - Backlog item I (lines 123-134) and track B link (line 133)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 78-88 - Cross-run interview numbers: 미정 9/10 (line 85), story 0 in 4 of 6 (line 86), multi-part and repeats (line 83)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 95-117 - Luna ko: 9 of 12 미정 (105), repeats (104), zero story (106), setting 12 (99)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md` 113-117 - Luna en: 10 of 12 undecided, 2 repeats (115), setting 12 (113)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md` 154-170 - Haiku ko: setting 10 story 2 (156), repeat (163), partial repeat (166), multi-part list (169), premise (168)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md` 78-83 - Haiku en: setting 12 (82), undecided and repeat on key rule (82-83), no story (82), manner gap (79)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 219-238 - Qwen ko: last 6 all 미정 (233), repeat (234), 9 multi-part (235), 미정 table row (219), setting 12 (231)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md` 99-118 - Qwen en: setting 10 story 2 (102), repeat and premise (section 3.1), hedged answers in extraction (117-118)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 40-75 - Product question prompt: topic is z.string() (48), topic list (54-63), rules incl. one-step repeat (68-71) and no 미정 rule
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 27-33 - Extraction classifies undecided facts (27, 33); no link to question strategy
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 240-256, 516-548 - Covered list passes answer text to prompt (533-541); answered or skipped counts as covered (546-548); skipTurn (240-256)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview.test.ts` 170-183 - Existing tests for one-question and no-repeat wording (170-183)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 1-89 - Chapter-only metrics; no interview metrics exist (1-15 type, 41-89 chapterMetrics)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 108-120 - focusCounts written to run summary (119)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 53-105 - focusCounts increment per answered question (105); question loop (63-105)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 113-125, 245-253 - interview_answer schema (118-119) and decision log line (251) used to compute the 미정 share offline
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts` 178-186 - Asserts 12 interview_answer decision lines (182)

Open questions:
- Are the per-run calls/*.json and author-decisions.jsonl files (cited by the reviews) available in some folder outside this checkout? The run folders under eval/results were not found here, so per-run counts were taken from the review and summary text, not recomputed.
- Should the 미정 rule be enforced in code (close the topic in covered, block same-topic asks) or only in the prompt? Track I touches src/ai/tasks/interview-question.ts and src/server/interview.ts, which are product code.
- The author answers come from a bank in the harness (luna-6-en.md:115 bankKeys). Should the 미정 share be measured against a fixed author policy so the metric is not driven by the bank?
- Haiku ko and haiku en reviews give no explicit 미정 count. Is the metric to be computed from author-decisions.jsonl for all six runs before the target is set?
- Should topic become an enum of INTERVIEW_TOPICS (interview-question.ts:48) so coverage can be checked in code? This is a schema change, not a package change.

## survey:I:risks

Track I (interview question strategy) survey, read-only. Nothing in the repo was edited.

CURRENT BEHAVIOUR (facts)
- Question generation: askNextQuestion (src/server/interview.ts:95) returns an open turn if one exists (:104-106), otherwise runs interviewQuestionTask once with rejected=null, and if the normalized question matches an earlier one (normalizeQuestion, :279; loadQuestionKeys, :345) it retries once with the repeat in `rejected` (:115-127). Insert uses onConflictDoNothing against the one-open-turn partial index (:135-147).
- The model is the only thing that decides "미정". There is no code path that detects an undecided answer. answerTurn (:155) stores any non-empty answer (:163) and always runs interviewExtractTask (:174) before the transaction (:219-235). The only writes in that transaction are interview_turns and insertProposals (pending proposals), so the AI-never-writes-wiki invariant holds.
- A "미정" answer is therefore an ordinary covered turn. buildQuestionInput (:360) puts it in <covered> with its first 80 characters (src/ai/tasks/interview-question.ts:90-98, turnAnswer :100). Only skipped turns are marked "(건너뜀)". Nothing marks an answer as undecided.
- The prompt rule at interview-question.ts:71 ("<covered>에 있는 질문은 되풀이하지 않는다. 같은 주제를 다시 물을 때는 이전 답을 바탕으로 한 걸음 더 나아간 질문만 한다.") explicitly allows re-asking a covered topic. This is the likely root of the repeated "미정" topics (summary.md:85, backlog I). Skipping (skipTurn, :238) is the only existing way to move off a topic, and the skip path does not record a reason.
- Topic list: INTERVIEW_TOPICS at interview-question.ts:54-63 (8 items, including 떡밥, 결말 방향, 문체). Focus rule at :68-69 says "story" only once the core setting is "충분" (sufficient), which the model judges by itself. Summary 2.1 reports 4 of 6 runs with zero story focus (summary.md:86).
- focus is a text column, default 'setting' (src/db/schema.ts:456), typed by INTERVIEW_FOCUSES = ['setting','story'] (src/db/types.ts:52-53). The UI badge is hard-coded to two labels (src/components/interview/question-card.tsx:46).
- Limits: interview-question has effort 'low', maxTokens 2000, no timeoutMs override (interview-question.ts:192-197). Extraction has effort 'medium', maxTokens 8000 (interview-extract.ts:78-79). runAiTask default timeout is 120,000 ms (src/ai/run.ts:28); the streamed call is 280,000 ms (:31). The question route and answer route set maxDuration 300 (src/app/api/works/[workId]/interview/next/route.ts and .../answer/route.ts). The question call is generateObject, not streamed. A repeat retry (:115-127) can make two sequential calls, so the worst case is about 240 s, which is inside the 300 s route limit but already over the 120 s per-call limit for local qwen (median 86.7 s, max 185 s; summary.md:... section 2.1).
- Prompt-injection guards: buildInterviewQuestionPrompt calls neutralizeDeep(raw) first (interview-question.ts:112), and the system prompt carries TAG_DATA_RULE (:75). Any new field must be added to InterviewQuestionInput and go through the same path. `rejected` is neutralized too, because it sits inside the same input.
- Tests that pin wording: src/ai/tasks/interview.test.ts:172-180 checks INTERVIEW_TOPICS.join(', '), the sentence '<covered>에 있는 질문은 되풀이하지 않는다.', the story-material sentence, and the 1화 opening sentence. src/test/ai-fakes/interview-question.ts:16 types FAKE_QUESTIONS as Record<(typeof INTERVIEW_TOPICS)[number], ...>, so adding a topic is a compile error until the fake is updated, and fakeInterviewQuestion (:71) picks the first uncovered topic. src/server/interview.test.ts covers retry (:588), focus storage (:627) and open-turn coverage (:690).
- English mirror: eval/novel/localize/en-systems.ts:19 (EN_INTERVIEW_TOPICS), :92-100 (English INTERVIEW_QUESTION_SYSTEM, same rules), :146 (EN_SYSTEMS['interview-question']). localize.test.ts:333 asserts the list has 8 entries and no ', ,'. Any Korean SYSTEM or topic change needs the English copy changed in the same commit.
- Eval counters: eval/novel/steps/interview.ts:97-105 counts focusCounts per turn and marks the step answered. The harness calls askNextQuestion, answerTurn and skipTurn directly (:66, :100, :103), so service behaviour changes flow into the eval.

COLLISION MAP (which tracks touch the same files)
- B (speech style, Q5): highest overlap. Both want a new core topic ('말투') added to INTERVIEW_TOPICS and the SYSTEM rules in src/ai/tasks/interview-question.ts, plus the EN mirror, the fake's Record, and interview.test.ts:172-180. Also B adds a `voice` field to interview-extract (src/ai/tasks/interview-extract.ts) and context.ts. Must be one agreed edit or sequenced.
- G1 and G2 (extraction dedupe, entities/relations/threads): share src/ai/tasks/interview-extract.ts (the known[] input and SYSTEM rules at :22-40), src/ai/extraction.ts (extractionToProposals, :248), and src/ai/extraction-rules.ts. Backlog G says "'아직 정하지 않았어요'뿐인 답에서는 추출하지 않는다", which needs the same undecided signal as I. This is the main design coupling.
- HX2 (English substitution table) and HX3 (author sees wiki): both touch eval/novel/localize/en-systems.ts and eval/novel/agents/author.md. HX3 changes what the author answers, so it changes the 미정 baseline that I's metrics depend on. HX2 also touches the label list that en-systems.ts already maps (scaffold.ts:97 maps 미정 to undecided).
- F4 (local server serialization, effort switch): changes the effort and timing of interview-question, which is effort 'low' now. A second repeat call or an added classifier call would be the first thing it slows.
- F2 (chapter extract split) and F1 (proofread split): share the extraction pipeline if the interview extract is also split into facts/threads/relations. Low to medium overlap.
- H (continuity), A (length, run.ts timeouts), D (two-step draft), E1/E2, C, J, F3: no direct file overlap with I. A and F4 share run.ts timeout and effort behaviour.
- Guard library (src/ai/guards, which does not exist yet; ls returned no such directory): if built, it should be reused for the question-side topic detection rather than adding a second classifier.

INVARIANTS THAT APPLY (CLAUDE.md)
- All user-facing copy in Korean. Any new error or UI text in Korean.
- Services throw AppError(code, 한국어 메시지). Existing codes used here: VALIDATION (:163), CONFLICT (:147, :231, :255), BAD_STATE (:105, :268), NOT_FOUND (:366). Use these; do not invent codes.
- Every service begins with requireWorkRole (ask and answer at editor, :103 and :166; viewer for getInterviewState at :62). Any new service function needs the same first line.
- Actions/routes never throw: the route wrapper runWorkRoute and withAction return ActionResult (src/app/api/works/[workId]/interview/next/route.ts, src/server/actions/interview.ts).
- AI never writes wiki tables. Topic closure, stance or focus should only touch interview_turns (not wiki). Any fact produced by a 미정 answer must stay a pending proposal (approval path), as now (interview-extract.ts:33 already sends story-undecided ideas to facts with suggestedStatus "undecided").
- change_log in the same transaction: no wiki write is planned, so no change_log change is needed. If a new column on interview_turns is added, no wiki table is touched and no change_log is required. Note that a schema change needs `pnpm db:generate` and a migration (CLAUDE.md commands).
- Wiki rows archived, never deleted: not affected.
- Day boundaries Asia/Seoul: not affected.
- Prompt-injection: new fields in the question input must be neutralized (neutralizeDeep at :112 covers them if they are added to the input object before buildPrompt) and must sit inside a tag with TAG_DATA_RULE.

WHAT COULD REGRESS
- Token limit: interview-question maxTokens 2000, effort low. A new output field (for example "closesTopic") is small, but a required zod field that a local model omits will fail the whole call. Keep new output fields optional or derive them in code.
- 120 s per-call timeout: local qwen question calls already run 86 to 185 s. Do not add a second AI call per turn for classification. Derive the 미정 signal in code, or piggyback it on the existing extract call (interview-extract is already 8000 tokens, effort medium).
- Retry doubling: the repeat retry (:115-127) plus a new check could push the route past 300 s on local models. Avoid retrying on topic closure.
- Prompt wording tests: changing the sentences at interview-question.ts:68-71 breaks interview.test.ts:172-180 and the EN mirror. Update both together.
- Eval comparability: changing the question prompt or topics changes the eval baseline. The README says the rerun must use a new date (summary and backlog section 1). Track I's metrics (미정 share, setting/story ratio, duplicates) are computed from focusCounts (steps/interview.ts:97-105) and from the answer text, so they need the same answer classification in the eval.
- Streaming: askNextQuestion and answerTurn are non-streamed. No streaming regression is expected unless the question call is moved to streamText.
- Duplicate-question check: normalizeQuestion (:279) compares only exact normalized text, so a reworded repeat of a 미정 topic still passes. Topic-level closure would need a topic check, not only a question check.

PROPOSED MINIMAL PUBLIC INTERFACE (TypeScript signatures)

// src/lib/interview-stance.ts (new, pure, unit-testable)
export type AnswerStance = 'answered' | 'undecided'
/** True when the answer only says the author has not decided yet (미정). Deterministic, no AI call. */
export function answerStance(answer: string): AnswerStance

// src/server/interview.ts (pure helper, exported for tests)
export type TopicPlan = {
  /** Topics the next question must not ask about (answered "미정" or two undecided in a row). */
  closedTopics: string[]
  /** True when every core topic is covered or closed, so the next question should be story. */
  preferStory: boolean
}
export function planTopics(
  covered: { topic: string; answer: string | null; skipped: boolean; focus: InterviewFocus }[],
  topics: readonly string[],
): TopicPlan

// src/ai/tasks/interview-question.ts
export type InterviewQuestionInput = InterviewQuestionInput & {
  /** New optional field; default [] so existing callers and tests keep working. */
  closedTopics?: string[]
  preferStory?: boolean
}
// SYSTEM gains one rule: topics in closedTopics are not asked again; if preferStory, focus is "story".

// Storage option (only if the stance must survive without recomputation):
// src/db/schema.ts interview_turns: answerStance text ('answered' | 'undecided') nullable (needs db:generate + migration).

Where the deterministic answerStance is too brittle for Korean, the alternative is a field on the existing extract output (interview-extract.ts), with no extra call.

OPEN QUESTIONS FOR THE AUTHOR
1. How to detect 미정: (a) deterministic Korean pattern in code (fast, zero latency, risk of false positives such as "미정인 떡밥이 있다"), (b) a field added to the existing interview-extract output (no extra call, depends on the model, but G's "no extraction on pure 미정 answers" needs the same signal), or (c) a separate classifier call (adds latency, rejected for local models by the 120 s limit). Recommendation: (b) or (a), not (c).
2. Should a pure 미정 answer still run extraction? Today it does, and it yields undecided facts (interview-extract.ts:33). Backlog G wants no extraction on pure 미정 answers. This decides whether I and G share one signal. Needs an explicit decision.
3. "Close a topic" scope: close for the rest of the work (all sessions) or only the current session? Backlog I says "이 주제는 닫는다", but turns from earlier sessions are also in <covered>.
4. The "two consecutive 미정" rule: per topic, or across the whole interview? The backlog says "미정 답이 2번 연속이면", which is ambiguous.
5. Definition of "핵심 설정이 충분": does a closed (미정) topic count as done? Does 떡밥, 결말 방향 and 문체 count as core setting or as story? This decides when the story ratio rises.
6. Should 말투 become a ninth topic (track B), and does B or I own the INTERVIEW_TOPICS change? Both edit the same lines.
7. "Ask exactly one thing": prompt-only, or also a server check (for example, reject a question with two question marks or 그리고 and retry)? A server retry would double the call on local models, so the recommendation is a prompt rule plus a metric, not a retry.
8. Metric definitions: 미정 share = answers classified undecided / answered turns? Setting/story ratio from focusCounts (steps/interview.ts:97-105) is already available. Duplicate count = normalizeQuestion matches (src/server/interview.ts:279) or topic repeats after closure?
9. Should the English mirror (en-systems.ts) be updated in the same commit as the Korean prompt, as the project's eval localize test expects?
10. Is the eval author (author.md) allowed to answer 미정 for topics it has no data on? This affects whether the "미정" metric is measuring the interviewer or the author agent (track HX3 changes this).

Files:
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts`  - askNextQuestion (95-147) retries repeats (115-127); answerTurn (155-235) stores any answer and runs extraction (174); skipTurn (238); buildQuestionInput (360) builds covered/recent (451-545); normalizeQuestion (279); COVERED_LIMIT (37). Primary edit point for closure logic.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts`  - INTERVIEW_TOPICS (54-63), SYSTEM rules (65-77, covered rule at :71, focus rule at :68-69, TAG_DATA_RULE at :75), turnAnswer/covered prompt builders (90-100), buildInterviewQuestionPrompt with neutralizeDeep (:112), task definition effort low / maxTokens 2000 (:192-197). Primary prompt edit point; shared with track B.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts`  - Extract SYSTEM rules (suggestedStatus at :27, story-undecided facts at :33); effort medium, maxTokens 8000 (:78-79). Candidate place for an answer-stance field without an extra AI call; shared with G1, G2, B.
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - DEFAULT_AI_TIMEOUT_MS 120000 (:28), STREAM_AI_TIMEOUT_MS 280000 (:31), timeout override (:36-39), runAiTask (:80-125). Regression risk for any added call.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-question.ts`  - FAKE_QUESTIONS typed as Record over INTERVIEW_TOPICS (:16) and fakeInterviewQuestion picks first uncovered topic (:71). Must change if a topic is added.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview.test.ts`  - Pins the SYSTEM wording and topic list (:172-180) and the story-before-1화 sentence. Breaks if prompt sentences change.
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.test.ts`  - Service tests for retry (:588), focus storage (:627), extract focus passing (:657), open-turn coverage (:690). Add closure and stance tests here.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts`  - English mirror of the interview question SYSTEM and EN_INTERVIEW_TOPICS (:19-20, :92-100, :146). Must change with any Korean prompt or topic change.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts`  - Asserts EN_INTERVIEW_TOPICS has 8 entries and no ', ,' (:331-333); fails if topics change without the mirror.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts`  - Eval loop calling askNextQuestion/answerTurn/skipTurn (:66, :100, :103); counts focusCounts (:97-105). Source of track I metrics.
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts`  - interview_turns.focus text column default 'setting' (:456). Only file to touch if the stance is stored (needs db:generate and a migration).
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts`  - INTERVIEW_FOCUSES = ['setting','story'] (:52-53).
- `/home/xogud/documents/github/DaeumHwa/src/components/interview/question-card.tsx`  - Focus badge with two hard-coded labels (:46). Only needs change if focus gains a value.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/next/route.ts`  - Question route, maxDuration 300, calls askNextQuestion with signal (:8-16).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/answer/route.ts`  - Answer route, maxDuration 300 (:9), calls answerTurn (:18).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog section 2.I (interview strategy) and section 2.G (extraction, where pure 미정 answers should not be extracted); section 1 says a rerun needs a new date.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Evidence: 미정 answers (2.1, :85), story zero in 4 of 6 runs (:86), backlog row 9 (:242), focus and call-time figures (2.1, 2.7).
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md`  - Design intent: covered list (:69), output shape (:71), focus column (:76), story-answer extraction and undecided facts (:77).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - Author agent answers interview questions; its 미정 behaviour is the baseline for I's metrics (shared with HX3).

Open questions:
- How should 미정 be detected: a deterministic Korean pattern in code, a field on the existing interview-extract output (no extra AI call), or a separate classifier call (adds latency against the 120 s limit)?
- Should a pure 미정 answer still run extraction? It does today (answerTurn at src/server/interview.ts:174), and backlog G wants it skipped. I and G share this signal.
- Is a closed topic closed for the rest of the work (all sessions) or only the current session? Earlier turns from other sessions are in <covered>.
- Is the two-consecutive-미정 rule per topic or across the whole interview?
- Does a closed 미정 topic count as covered for the 핵심 설정 충분 test? Do 떡밥, 결말 방향 and 문체 count as setting or story?
- Should 말투 become a ninth core topic? Tracks B and I both edit INTERVIEW_TOPICS, the fake Record, the English mirror and interview.test.ts. Who owns that edit?
- Should 'ask exactly one thing' be enforced by a prompt rule plus a metric only, or also by a server check with retry? A retry doubles the call on local models, which already exceed 120 s.
- Metric definitions: is the 미정 share computed from answers the classifier marks undecided over answered turns? Is a duplicate counted by normalizeQuestion match (src/server/interview.ts:279) or by topic repeat after closure?
- Must the English mirror in eval/novel/localize/en-systems.ts change in the same commit as the Korean SYSTEM prompt?
- Does the eval author agent (eval/novel/agents/author.md) answer 미정 for topics it has no data on? If so, the 미정 metric measures the author as much as the interviewer, and track HX3 (author sees wiki) changes the baseline.

## survey:I:specs

TRACK I (interview question strategy): prior-spec survey. Read-only; nothing edited.

CONSTRAINTS THAT GOVERN THE CHANGE

1. One question at a time, skippable, no duplicate questions. MVP spec 1.3 principle 4 (/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:21, "질문은 한 번에 하나, 언제든 건너뛸 수 있다"); F1 "질문은 한 번에 하나만 보인다" (same file:187-188). Reliability spec 2.1: keep one-at-a-time, endless, never revisit an answered question (spec:26). Anti-goal 4.47: "인터뷰가 이미 한 질문을 되풀이하거나 1번 주제로 되돌아간다" is a failure.

2. Question generation rules (reliability spec §5.B, spec lines 65-79):
- Input: wiki summary, story material, covered list of ALL sessions' questions (topic, question 120 chars, answer 80 chars, skipped, focus; oldest first, cap 120 with dropped count), current-session recent 6 turns (answer 600 chars) (spec:65-70; plan Task 8 caps at …/2026-10-18-interview-ai-reliability.md:277).
- Output `{ focus: 'setting'|'story', topic, question, rationale }` (spec:71; plan:270-274).
- AI judges: empty/shallow core setting -> setting question; sufficient -> story question about next chapter / storyline. story questions must cite concrete material (chapter numbers, thread titles, reader reactions) (spec:72).
- "이미 다룬 질문은 되풀이하지 않는다. 같은 주제를 다시 다룰 때는 이전 답을 바탕으로 한 걸음 더 나아간 질문만 허용한다." (spec:73). The core topic list is INTERVIEW_TOPICS (eight topics, plan:261 and MVP spec:189).
- Server guard (spec:74; plan:287): normalizeQuestion (remove whitespace and punctuation) equal to a previous question -> one retry with a `rejected` memo; second identical result is stored anyway (never fails). Only EXACT normalized match is caught; "same topic, different wording" is not guarded by code, only by prompt.
- Interview never self-ends; the existing "인터뷰 끝내기" button stays (spec:38, 75).
- Storage: interview_turns.focus text not null default 'setting' (spec:76; plan:243; present in src/db/schema.ts:456). UI badge "설정 채우기"/"다음 전개" (spec:76; present in src/components/interview/question-card.tsx:46).

3. Focus is decided by the AI, NOT forced. Eval design §6.3 (lightweight-model-novel-eval-design.md:142): "질문을 설정 중심으로 할지 이야기 중심으로 할지는 질문 모델이 스스로 고른다... 하네스는 12개를 묻고 비율을 기록한다." Eval plan:42 says "instead of forcing 8 and 4". Eval design decision 10 (eval-design:342) and 19 list. Reliability spec:26 and 71-72 restate AI judgment. Forcing a story question would contradict this.

4. Product tasks/fakes/stub move (reliability spec §5.A, spec:52-61): fake outputs live in src/test/ai-fakes/ (exists: src/test/ai-fakes/interview-question.ts, interview-extract.ts), not in app code; app code may not import @/test/ from non-test files (spec:58). E2E stub responder e2e/ai-stub/responders.ts must emit the new `focus` shape (plan:236). Any change to output shape or prompt input must update these fakes/stub and the tests (src/ai/tasks/interview.test.ts, plan:289-290 expected prompt asserts: `<covered>`, `생략한 이전 질문: 30개`, `<story>`, `최신 회차: (없음)`, `<rejected>`).

5. Cost/timeouts: question task is a route handler (POST /api/works/[workId]/interview/next, spec:79), timeout 120 s default (spec:101), cancel and retry UI (spec:106-108: failure keeps "다시 시도"). Route handlers that call AI need maxDuration=300 (CLAUDE.md; spec:124).

6. AI decides; wiki writes only via approvals (spec §4.46; MVP 1.3 principle 1 line 19). A new "closed topic" state must not write wiki tables; it can be derived from interview_turns (answers) in the service layer.

7. Answer extraction side (not this track but coupled): interview-extract receives focus (spec:77). Story answers -> planned threads; undecided ideas -> facts with suggestedStatus 'undecided' (spec:77). Track B (speech question) shares the same question prompt file; no spec defines the speech question.

8. Authority for "미정": product has a fact status 'undecided' = "미정" (MVP spec:133 and F3 line 199, grey tag). Interview answer "미정" in eval is an author phrase ("아직 정하지 않았어요"). These are different concepts; any metric or rule named "미정" must say which one.

DECISIONS ALREADY MADE (do not re-litigate)
- Endless interview; no end-selection screen (reliability spec:38, 75).
- Demo mode deleted; fakes only in src/test (spec:55-57; "사용자 결정").
- Question focus chosen by AI, no quota (eval §6.3 and decision 10; reliability spec:71-72).
- Covered list spans all sessions, 120 cap, dropped count stated (spec:69; plan:277, 284).
- AI quality evaluation system deferred to later task (reliability spec:35, "다음 과제로 미룸").
- Duplicate guard never fails the request (spec:74).
- Model default claude-haiku-5-5 (MVP 2026-10-17 decision, spec:342 area; eval plan).

CONFLICTS / NEW RULES NOT IN ANY SPEC
A. Backlog item 3 (docs/eval/novel/follow-up-ai-improvement.md, row at docs/eval/novel/2026-10-18/summary.md:272): "story 질문을 강제하거나 점검표가 차면 전환" — CONTRADICTS eval §6.3 / decision 10 and reliability spec:71-72 ("AI가 판단"). Requires a spec change before implementing.
B. Backlog item 9 (summary.md:242): "작가가 미정이라 답한 주제는 닫는다. 연속 2회 미정이면 다른 핵심 설정이나 story 질문으로 바꾼다." No spec defines closing a topic or a 2-in-a-row rule. Compatible with spec:73 (no repeats) and spec:47 (no return to topic 1) only if the switch target is never an already-covered topic. The rule needs its own spec section (threshold, storage, how "미정" is detected from answer text, and whether the question model or code applies it).
C. Backlog item 4 (summary.md:273): mark 미정 topics in <covered>. Partly already there: covered carries answer text (80 chars, spec:69), so an explicit flag is a new field and needs spec + plan update (plan:277).
D. Eval "미정" share is confounded by the harness. Eval design §6.4 (eval-design:178): unknown items are answered "아직 정하지 않았다". Eval plan:406 says the interview fake answer fallback is the FIRST bank entry. These two conflict, so the ko/en 미정 counts (summary.md:85, 9/12, 10/12, 6 trailing for qwen ko) cannot be read as product behaviour alone. summary.md:105 (luna-6-ko review) also says the bank is a harness variable. Any metric "share of 미정 answers" must state the bank policy used.
E. Duplicate metric: the eval counted semantic duplicates (summary.md:72-ish, luna-6-ko.md:104 "같은 jiwon 답이 다시 나왔다"); code guard only catches exact normalized text (spec:74). Metric "duplicate questions" needs a definition (exact vs same-topic). Spec:73 allows same topic only with a further step; no code enforcement exists in spec.
F. "예시 없이 / 질문 어투 고정 / 질문은 한 가지" (summary.md:242) is new. Spec:21 and spec:72 cover one question; example-free and fixed tone are not in any spec.
G. Spec §5.B says story questions cite concrete material (spec:72). If the new rule restricts story questions to the cited pool, it must keep AI judgment (no template).

METRICS TO DEFINE (not defined in specs): share of 미정 answers (needs definition of 미정 detection: exact phrase "아직 정하지 않았어요" vs fact status); setting/story ratio (already recorded as focusCounts in eval plan:343, and turn.focus in DB); duplicate question count (see E).

Evidence notes: src/ai/tasks/interview-question.ts, src/ai/tasks/interview-extract.ts, src/server/interview.ts, src/server/actions/interview.ts, src/db/schema.ts:456, src/components/interview/question-card.tsx:46, src/test/ai-fakes/interview-question.ts exist. I did NOT read the current prompt text of interview-question.ts; claims about the prompt above come from the specs/plan only.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 26-30, 38, 42-48, 52-61, 63-79, 98-108 - Primary spec for interview question input/output, covered list, focus, duplicate guard, timeouts, demo-mode removal (§2 26; §4 42-48; §5.A 52-61; §5.B 63-79; §5.D 98-108; §5.F 115-120)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md` 7, 236, 243-244, 261, 270-279, 282-292 - Implementation plan for Task 8 (question input shape, caps, normalizeQuestion, duplicate guard tests, fakes/stub updates)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 19-22, 133, 171-172, 187-191, 199, 341-342 - Base MVP principles (one question at a time, AI proposes only), F1 interview design, interview tables, AI task table
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 142, 172-178, 292, 329, 342 - Eval design: AI picks focus, 12 questions with ratio recorded, answer bank and 아직 정하지 않았다 rule, deferred items
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 21, 42, 261, 382, 406, 465-466 - Eval plan: no forced 8/4 focus split; interview fake answer fallback to first bank entry (conflicts with design 178); INTERVIEW_TOPICS translation
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 85, 105, 240, 242, 272-273 - Evidence and backlog rows for Track I (미정 counts, story 0 in 4/6 runs, multi-question, backlog items 3, 4, 9)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 104-105 - Review evidence: duplicate question 002/013 and 아직 정하지 않았다 in 9 of 12 answers, noting bank is a harness variable
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 456 - Existing focus column on interview_turns (default setting)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-question.ts` 10-16, 71 - Test-only fake; rotates topics by covered set; must be updated if the input or output shape changes
- `/home/xogud/documents/github/DaeumHwa/src/components/interview/question-card.tsx` 46 - Focus badge text (다음 전개 / 설정 채우기) required by spec

Open questions:
- Backlog item 3 (force story questions) contradicts the AI-decides-focus decision in eval design §6.3 / decision 10 and reliability spec §5.B. Which one wins must be decided by the user before implementation.
- The 2-consecutive-미정 closing rule (backlog item 9) has no spec: where the count lives (covered list, a new field, or derived from answer text), the threshold, and whether the switch target is code-chosen or AI-chosen.
- Eval design §6.4 (unknown -> 아직 정하지 않았다) and eval plan line 406 (fallback to first bank entry) disagree. The 미정 share metric is not valid until the bank policy is fixed.
- Definition of 'duplicate question' for the metric (exact normalized text as in the guard, or same topic) is not in any spec.
- Whether the 미정 detection for the closing rule should use the author phrase or the product fact status 'undecided' is not decided.

## survey:I:tests

TRACK I (interview question strategy) - read-only test map. Nothing was edited or run.

0. Current state of the code (verified)
- No 미정 handling exists in src or eval code. Grep for 미정 hits only fact-status labels (src/lib/labels.ts:33, src/components/app/fact-status-*), the continuity prompt (src/ai/tasks/continuity-check.ts:56), and the EN scaffold map (eval/novel/localize/scaffold.ts:97). An answer is stored verbatim after trim only (src/server/interview.ts:162-163), then sent to extraction (src/server/interview.ts:170-200).
- Question logic: src/ai/tasks/interview-question.ts. SYSTEM rules at lines 65-88 (topics line ~68, story line ~69-70, no-repeat line ~73, one-question line 1 "질문을 한 번에 하나만 한다."). covered() renders "- [focus] topic | 질문 | 답" at lines 90-97, turnAnswer() renders "(건너뜀)" / "(답 없음)" at lines 100-104. buildInterviewQuestionPrompt at 111-190. Task def (effort low, maxTokens 2000) at 192-198.
- Service: src/server/interview.ts. askNextQuestion 95-149 (one repeat retry via rejected, lines 119-129). answerTurn 155-235. skipTurn 238-257. completeInterview 260-276. normalizeQuestion 279-281. buildQuestionInput 360-544: covered query newest 120 at 451-463, recent 6 at 470-480, latest chapter/summaries/reader/issues 408-442.
- The fake question writer src/test/ai-fakes/interview-question.ts:69-74 picks the first core topic that appears in any covered turn, regardless of answer text, else STORY_QUESTION (lines 9-14). It never reads answers or focus streaks, so a "two 미정 in a row" rule is not modeled by the fake.
- Fake extraction src/test/ai-fakes/interview-extract.ts always emits one fact from the first sentence (facts push in fakeInterviewExtraction). So answer "미정" currently produces a proposal with content "미정". A test that expects zero proposals for 미정 would fail until extraction or answerTurn changes.

1. FakeAiClient wiring
- src/test/fake-ai.ts: class FakeAiClient (line 19). Constructor options {overrides} (lines 10-13, 24-26). generateObject (28-32) parses output through args.schema. structuredOutput (46-52): override first, then FAKE_OUTPUTS registry, else throws "No fake output for task". streamText (34-44) uses FAKE_TEXT.
- src/test/ai-fakes/index.ts: FAKE_OUTPUTS (14-23) maps 'interview-question' to fakeInterviewQuestion and 'interview-extract' to fakeInterviewExtraction. FAKE_TEXT (27-29) holds only draft-chapter.
- Server tests pass the client as an argument: askNextQuestion(db, actor, sessionId, client) and answerTurn(..., client). Route tests inject through setAiClientForTests(new FakeAiClient()) (src/ai/index.ts:23; used at src/app/api/works/[workId]/interview/next/route.test.ts:55).
- Recording helpers in src/server/interview.test.ts: class RecordingAiClient (records prompts), recordQuestions(outputs?) at 469-481 (captures inputs, returns client), answerQuestions(sessionId, count, client) at 483-488 (ask then answer "답 i").
- Factories (src/test/factories.ts): createTestUser 20, createTestWork 33 (settings, owner membership), addTestMember, createTestChapter 59, createTestEntry 87, createTestFact 105, createTestThread 132. There is NO factory for interview_sessions or interview_turns; tests create them through startInterview/askNextQuestion or db.insert.
- Test DB: createTestDb from src/test/db.ts. setup file src/test/setup.ts imports jest-dom only.

2. Existing test files covering the touched code (path : what they assert)
- src/ai/tasks/interview.test.ts (407 lines)
  - 51-226 'interview-question task': effort low / cap 2000 (52); fake asks first uncovered topic as setting (58); fake skips covered incl. skipped (66); fake moves to story "다음 전개" after all 8 topics (77); fake validates through FakeAiClient (97); prompt sections, (건너뜀) (111); "최신 회차: (없음)" and "<covered>\n(없음)" exact (139); lists every covered question (145); "생략한 이전 질문: 30개" (151); <rejected> only when set (160); system names topics, "질문을 한 번에 하나만 한다.", "setting"/"story", "<covered>에 있는 질문은 되풀이하지 않는다.", story material sentence (170); story allowed before 1화 with "아직 연재 전이므로 1화를 어떻게 열지", "초반 전체 전개", "없으면 시놉시스, 인물, 떡밥을 재료로 삼는다." (181); "답: (답 없음)" not (건너뜀) (189); chapterLabel summaries (198).
  - 228-334 'interview-extract task' (focus in prompt, naming, threads); 335-370 tag neutralization for question prompt; 372-407 pending card markers and naming rules.
- src/server/interview.test.ts (776 lines)
  - 97-123 startInterview/getInterviewState (permissions, NOT_FOUND for stranger).
  - 125-198 askNextQuestion: fake topic 주인공 (126); returns open turn, no second AI call (140); viewer FORBIDDEN (151); stranger NOT_FOUND (156); unknown session NOT_FOUND (161); prompt has work/wiki/<covered>/<story> (165); completed BAD_STATE (177); AI_LIMIT via aiRuns usage (183).
  - 200-348 answerTurn: stores answer and pending proposals with turn sourceRef (201); entry + fact proposals (225); never writes wiki directly (247); empty answer VALIDATION (298); second answer CONFLICT (308); skipped turn cannot be answered (323); viewer/unknown turn (333, 342).
  - 350-368 skipTurn: skip moves next question to different topic and prompt contains (건너뜀) (351); viewer cannot skip (364).
  - 370-394 completeInterview (ends; second complete BAD_STATE; viewer cannot).
  - 396-488 naming/thread dedup across answers.
  - 490-577 continuous questions: covers all sessions, oldest first, covered length 12, recent 4 (491-506); cap 120 with dropped count (508); no chapters (525); 5 summaries (534); reader digest (549).
  - 579 normalizeQuestion drops whitespace and punctuation.
  - 588-625 repeat retry with rejected (second call sees rejected); 609 second repeat stored anyway; 627 focus stored and sent to extraction; 660 cancel before AI runs.
  - 674-776 reliability: open question left in completed session counted as covered (690); concurrent asks leave one open turn (703); cancel in flight stores no question (714); cancel during extraction leaves question open (732); reader sim selection (753).
- src/app/api/works/[workId]/interview/next/route.test.ts (42-130): signed out (64); editor gets question (71); other work NOT_FOUND (80); non-member NOT_FOUND (85); viewer FORBIDDEN (92); non-uuid VALIDATION (100); aborted signal CANCELLED, no turn (105); returns open turn (123). Uses vi.mock for session and db client, setAiClientForTests(new FakeAiClient()) at line 55.
- src/app/api/works/[workId]/interview/answer/route.test.ts (40-105): signed out, stores answer with proposals (72), other work/non-member NOT_FOUND, answer over 5000 chars VALIDATION (99).
- src/components/interview/interview-session.test.tsx (jsdom): focus badges 72-81 ("설정 채우기" for setting, "다음 전개" for story per question-card.tsx:46); question generation failure/retry/timeout/limit (83-146); answers (158-220). Mocks skipTurnAction; does not render proposals.
- src/test/fake-ai.test.ts (154 lines): FakeAiClient overrides beat registry (overrides test near line 66-80), schema validation rejects bad output (line 50-61), registry default.
- e2e/ai-stub/responders.test.ts (vitest, included by vitest.config.ts): 204-225 each.it "interview question with %i covered items asks question (%i)" for covered 0/2/5 gives question numbers 1/3/6; 229-237 slow marker "[느리게]" gives 30000 ms delay.
- e2e/ai-stub/responders.ts:213-233 questionAnswer(): counts lines starting with "- " inside <covered>, sets question number and topic from that count, and sets focus by parity (even = setting). Any new "- " line in <covered> shifts numbering.
- e2e/interview.spec.ts (Playwright, run with pnpm e2e, not vitest): start, answer "서윤은 시계탑 수리공이다.", approve a proposal, next question must differ from the first, end interview.
- eval/novel/localize/localize.test.ts: EN_SYSTEMS has a prompt for every task (322-329); lists 8 non-empty interview topics and no ", ," (330-335); builds the interview-question prompt with a skipped turn (168, 201-210, 225); translateScaffold tests (337+) require Korean-free scaffolding fully translated. Scaffold labels live in eval/novel/localize/scaffold.ts (54 "(미정)" -> "(unspecified)", 97 "미정" -> "undecided").
- eval/novel/localize/en-systems.ts: EN mirror of the interview-question SYSTEM (around lines 90-100), exported as EN_SYSTEMS (145). Changing the KO SYSTEM without changing this mirror silently drifts the EN run.
- eval/novel/run.test.ts (vitest, slow, 120 s timeouts): 182 expects exactly 12 interview_answer decisions with fake author; 402-413 expects exactly 2 interview-question calls after a crash resume. Driven by eval/novel/steps/interview.ts:53-100 (loop until config.questions; skips empty/unasked turns).

3. Vitest command (quote bracketed paths, vitest filters match by substring)
pnpm vitest run src/ai/tasks/interview.test.ts src/server/interview.test.ts 'src/app/api/works/[workId]/interview/next/route.test.ts' 'src/app/api/works/[workId]/interview/answer/route.test.ts' src/components/interview/interview-session.test.tsx src/test/fake-ai.test.ts e2e/ai-stub/responders.test.ts eval/novel/localize/localize.test.ts --maxWorkers=2
Add eval/novel/run.test.ts only if the closing or extraction flow changes (slow). Playwright e2e is separate: pnpm e2e.

4. Existing tests that would break and why (depending on the change)
- src/ai/tasks/interview.test.ts:170-179 and 181-187: exact substring asserts on SYSTEM. Any rewrite of the no-repeat line, the story-material line, the "setting"/"story" wording, the one-question line, or the 1화 line breaks them.
- src/ai/tasks/interview.test.ts:139-143: exact "<covered>\n(없음)". Adding a header line inside <covered> breaks it.
- src/ai/tasks/interview.test.ts:111-137 and 189-196: expect "(건너뜀)" and "답: (답 없음)" verbatim. Changing those markers or the covered line format breaks them.
- e2e/ai-stub/responders.test.ts:204-225 and responders.ts:213-233: question number is the count of "- " lines in <covered>. Any new bullet in <covered> changes numbers and focus parity.
- src/server/interview.test.ts:351-362 (skip moves topic, prompt has (건너뜀)): breaks only if skip semantics or the marker change.
- src/server/interview.test.ts:508-523 (cap 120 and dropped line) and 490-506 (covered length 12): break only if the covered query or cap changes.
- src/server/interview.test.ts:323-332 (skipped turn cannot be answered) and 201-224 (answer stored): break only if answerTurn/skipTurn semantics change, e.g., making 미정 an auto-skip.
- eval/novel/localize/localize.test.ts:168-225 and 337-357: new Korean labels in the prompt without scaffold.ts mapping would break the "Korean-free scaffolding fully translated" test; new rules without en-systems.ts mirror are not caught by a current test (only 323-335 checks presence).
- eval/novel/run.test.ts:182 and 412: change in question count or skip flow changes the 12 and 2 expectations.
- Not broken by the change (currently): fakeInterviewQuestion already treats any covered topic as closed, so "미정 closes its topic" already passes in the fake; the two-in-a-row switch is not modeled by the fake, so no existing test covers it.
- Currently failing against a 미정-aware design: a test that expects no proposals for answer "미정" (fakeInterviewExtraction still emits a fact).

5. NEW test cases to add (name | input | expected). Helper and metric names are proposals; the file location is a suggestion.
Pure helper (proposed src/lib/interview-undecided.ts or inside src/server/interview.ts, with its own colocated test):
- isUndecidedAnswer: "미정" -> true | " 미정. " -> true | "아직 정하지 않았어요" -> true (only if that phrase is in the agreed list) | "서윤은 시계탑 수리공이다." -> false | "미정이 아니라 서윤이다" -> false.
Server (src/server/interview.test.ts, using recordQuestions and the FakeAiClient):
- 'a 미정 answer closes its topic and the next prompt shows it': input: askNextQuestion (fake topic 주인공), answerTurn "미정", then askNextQuestion with RecordingAiClient | expected: next.topic !== '주인공'; prompt contains the agreed 미정 marker in the covered line for 주인공 (e.g., "답: (미정)"; exact text depends on decision).
- 'two 미정 answers in a row switch to a story question': input: answer 미정 to 주인공, then 미정 to 주요 인물 | expected: next.focus === 'story' (or a core topic not yet asked, per the chosen rule); the fake must be updated to model the streak.
- 'a 미정 between two answered turns does not switch to story': input: answered, 미정, answered, then ask | expected: next.focus === 'setting'.
- 'a 미정 answer stores the answer but creates no fact or entry proposal': input: answerTurn(turn, "미정") with FakeAiClient | expected: turn.answer === '미정', proposals length 0 (currently fails: fakeInterviewExtraction emits a fact; needs extraction/answer rule).
- 'a skipped turn and a 미정 answer both count toward the streak': input: skip one turn, 미정 on another, then ask | expected: per decision (skipped counts as undecided or not) - pin the choice in the test.
- 'a repeat after 미정 closure still goes through the rejected retry': input: recordQuestions returning a repeated question on call 1 after a 미정 answer | expected: inputs[1].rejected equals the repeated text; turn.question equals the fresh one.
- 'the prompt covered line keeps the question short and one line per turn': input: a covered turn with a multi-line answer and 미정 | expected: one "- " line, no newline inside (oneLine).
Prompt (src/ai/tasks/interview.test.ts):
- 'system prompt tells the model to close a topic after 미정 and to switch after two in a row': input: interviewQuestionTask.system | expected: contains the agreed Korean rule substrings.
- 'system prompt says ask exactly one thing per question': expected: contains "한 번에 하나만" and a rule that forbids asking two things (substring agreed in the rule).
- 'prompt shows 미정 answers as (미정), not as the raw word': input: buildInterviewQuestionPrompt with covered answer "미정" | expected: "답: (미정)" (or the agreed marker) and no duplicate question line.
- 'fake question skips the topic answered 미정 and picks the next core topic': input: fakeInterviewQuestion with covered 주인공 answer 미정 | expected: topic "주요 인물" (already true today because the topic is covered regardless of answer; keep as regression).
- 'fake question returns story after two 미정 in a row once the streak rule is modelled': input: covered [주인공 미정, 주요 인물 미정] | expected: focus "story" (new, needs fake change).
Metrics (new pure function, e.g., summarizeInterviewTurns(turns) with colocated test):
- 'undecided share is 9 of 12 for the luna-ko run shape': input: 12 turns, 9 answers "미정" | expected: undecidedShare 0.75.
- 'story ratio is 0 when no story focus was asked': input: 12 setting turns | expected: storyCount 0, storyRatio 0.
- 'duplicate count uses normalizeQuestion': input: "주인공은 누구인가요?" and "주인공은 누구인가요" | expected: duplicateCount 1.
- 'empty turn list gives zeros without dividing by zero': input: [] | expected: undecidedShare 0, storyRatio 0 (or null, as agreed).
Stub and e2e:
- responders.test.ts: 'a 미정 answer keeps the stub question number and focus parity': input: covered lines with 미정 marker | expected: same number as before (the stub counts "- " lines only).
- e2e/interview.spec.ts (optional new spec): answer 미정 and expect the next question topic differs; needs the stub to honour 미정 (stub currently alternates topic by covered count only).
Localization (eval/novel/localize/localize.test.ts):
- 'EN interview-question system carries the 미정 closure and one-thing rules': input: EN_SYSTEMS['interview-question'] | expected: contains the English mirror of each new KO rule.
- 'every new prompt label has a scaffold translation': input: buildPrompt output with 미정 marker, translateScaffold | expected: no Hangul left in the marker.

6. Open questions for the design
- Where the 미정 rule lives: deterministic code in src/server/interview.ts (testable, metrics-friendly) or prompt-only in interview-question.ts (only testable via substring asserts). Recommend code plus prompt marker.
- Exact undecided phrases: only "미정", or also "아직 정하지 않았어요" and similar (the G item in follow-up-ai-improvement.md lists that phrase).
- Whether a skipped turn counts toward the two-in-a-row streak.
- Whether 미정 answers should still reach extraction. Current extraction would store a "미정" fact, which the proposal flow then shows to the author; the fake would need an empty-output path.
- Eval harness: eval/novel/fake-author.ts fakeAnswer (line 7-) answers interview questions deterministically and never answers 미정, so the eval's 미정 metric cannot be exercised by existing fixtures; the real author agent (eval/novel/agents/author.md) is not checked here.
- Observation: eval/novel/steps/interview.ts:65-70 has an "if (!asked)" branch, but askNextQuestion returns InterviewTurnRow (never null, src/server/interview.ts:95-101). The branch looks unreachable; not changed here.
- Pre-existing test gap: no test asserts that the fake's covered-topic rule ignores answers, and no factory exists for interview sessions/turns, so new server tests must insert rows through the service functions.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 65-190 - Question task: SYSTEM rules (65-88), covered() (90-97), turnAnswer() (100-104), buildInterviewQuestionPrompt (111-190). Main change site for track I rules and 미정 markers.
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 95-544 - Service: askNextQuestion repeat retry (95-149), answerTurn (155-235), skipTurn (238-257), normalizeQuestion (279-281), buildQuestionInput covered/recent queries (360-544). Likely place for deterministic 미정 streak logic.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 1-83 - Extraction task for answers; 미정 answers flow through here unless gated in answerTurn.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-question.ts` 9-74 - Fake question writer: first uncovered topic, ignores answers and focus streaks.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-extract.ts` 1-67 - Fake extraction: always emits one fact from first sentence; needs an empty path for 미정.
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` 10-75 - FakeAiClient class, overrides and registry lookup (19-65).
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 14-29 - FAKE_OUTPUTS registry mapping interview-question and interview-extract (14-23).
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts` 20-153 - Factories: user, work, chapter, entry, fact, thread. No interview session or turn factory.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview.test.ts` 51-226 - Prompt and fake tests for question and extract tasks; substring asserts on SYSTEM and markers.
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.test.ts` 97-776 - Service tests with RecordingAiClient (class near top), recordQuestions (469-481), answerQuestions (483-488).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/next/route.test.ts` 42-130 - Route tests for next question; setAiClientForTests(new FakeAiClient()) at line 55.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/interview/answer/route.test.ts` 40-105 - Route tests for answer and proposals.
- `/home/xogud/documents/github/DaeumHwa/src/components/interview/interview-session.test.tsx` 1-220 - UI tests: focus badges, retry, cancel, answer progress. Mocks skipTurnAction.
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.test.ts` 31-154 - FakeAiClient behavior tests (overrides, schema validation).
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 170-233 - Stub responder: questionAnswer counts '- ' lines in <covered> (213-233); interview extract stub (170-209).
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.test.ts` 84-240 - Stub tests: question numbering by covered count (204-225), slow marker (229-237).
- `/home/xogud/documents/github/DaeumHwa/e2e/interview.spec.ts` 1-60 - Playwright E2E for interview flow (not vitest).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts` 90-145 - EN mirror of interview-question SYSTEM (around 90-100), EN_SYSTEMS (145). Must change with KO rules.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts` 168-360 - EN_SYSTEMS presence and topic tests (322-335); interview prompt for scaffold (168, 201-225); translateScaffold tests (337+).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/scaffold.ts` 54-97 - Korean label mapping: '(미정)' at 54, '미정' at 97.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 53-150 - Eval interview loop (53-100) that drives askNextQuestion and answerTurn with the author agent.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts` 160-420 - Eval run tests: 12 interview answers (182), 2 question calls after resume (402-413). Slow.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 7-70 - Deterministic fake author answers for interview questions (fakeAnswer, from line 7); no 미정 path.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 1-150 - Backlog with track I section (section I, the 미정 and setting/story problem) and the phrase '아직 정하지 않았어요' in G.

Open questions:
- Should the 미정 closure and the two-in-a-row switch be deterministic code in src/server/interview.ts or prompt-only in src/ai/tasks/interview-question.ts? Code is testable and supports metrics; prompt-only can only be checked by substring.
- Exact list of undecided phrases: only "미정", or also "아직 정하지 않았어요" and similar wording from follow-up-ai-improvement.md G?
- Does a skipped turn count toward the two-in-a-row streak, or only answered 미정 turns?
- Should a 미정 answer still go to extraction (current behavior stores a "미정" fact via fakeInterviewExtraction), or be gated in answerTurn so no proposal is created?
- The eval fake author (eval/novel/fake-author.ts) never answers 미정, so the eval's 미정 share metric cannot be exercised by existing fixtures. The real author agent (eval/novel/agents/author.md) was not checked for this behavior.
- eval/novel/steps/interview.ts:65-70 has an `if (!asked)` branch, but askNextQuestion is typed to return InterviewTurnRow (src/server/interview.ts:95-101). The branch looks unreachable; not verified at runtime.


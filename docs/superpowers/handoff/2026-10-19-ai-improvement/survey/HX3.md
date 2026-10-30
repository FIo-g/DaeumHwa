# Track HX3: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:HX3:code

TRACK HX3 code map (read-only, nothing edited). Problem: the eval author agent never sees the wiki or its own earlier decisions. Data flow today: `pnpm eval:novel advance --dir` (driven by .claude/workflows/novel-eval.js:130) -> openRun (eval/novel/run.ts:107-146) -> runUntilBlocked (run.ts:149-197) -> STEPS table (run.ts:58-71) -> a step calls consult(ctx,p) (eval/novel/steps/util.ts:187-191) -> writePending (eval/novel/author-io.ts:184-189) -> step returns 'pending' -> runUntilBlocked stops at run.ts:180-184; with autoAuthor, fakeAnswer writes answer.json at run.ts:190-195. The author agent (authorPrompt in novel-eval.js:153-158) reads eval/novel/agents/author.md, which tells it to read only <dir>/pending.json, the bible and author-guide.md (author.md:14-25), and forbids other run-dir files (author.md:60-61). No wiki or decision data is in that chain. Answers return via readAnswer (author-io.ts:204-214) and are applied by applyProposalDecisions (util.ts:204-251, which calls approveProposal/rejectProposal in src/server/proposals.ts:618-681), then settle (util.ts:194-197) -> logDecision (author-io.ts:249-253), which appends author-decisions.jsonl. That log is never read back, and it stores only step, kind and answer; answer.decisions carry id and reason only, not the card name or question text, so a rejected card cannot be recognised from it.

Confirmed gaps: (1) Spec 6.4 (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:169-170) promises each author agent a summary of decisions so far; author.md has no such input and no code builds one. (2) The ko author guide (eval/fixtures/novel/ko/author-guide.md:7) says the basis includes the wiki the app has approved so far, but no code passes the wiki; the duplicate rule (guide line 25) cannot be applied without it. (3) Product side has no rejection memory: loadKnownEntries (src/server/known-entries.ts:20-79) reads active entries and pending entry_create/thread_create only, never rejected rows. (4) logDecision drops the payload names, so even the log cannot show what was rejected. (5) PendingSchema is a zod discriminatedUnion (author-io.ts:61-112); zod strips unknown keys, so any new Pending field must be added to the schema or readPending drops it.

Evidence: docs/eval/novel/follow-up-ai-improvement.md:149 (backlog item: let the author see the current wiki and its own earlier decisions); docs/eval/novel/2026-10-18/summary.md:269 and luna-6-ko.md:142 (duplicate fact approved; a card rejected once then approved later); haiku-5.5-ko.md:194-197 (12 duplicate proposals, 17 percent, approved because the author saw no fact list).

Smallest-diff plan (no signature changes): (a) add eval/novel/author-io.ts exports readDecisions(dir) and a context-writer; change logDecision (author-io.ts:249-253) to also store the pending item names and question text (p.items map to name or payload.name, p.question); (b) add an async helper buildAuthorContext(ctx) in eval/novel/steps/util.ts (near consult, util.ts:187) that calls listEntries, listFacts, listThreads, listRelations (the same calls finish uses, eval/novel/steps/finish.ts:123-128) and readDecisions, and writes <dir>/author-context.json via writeRunFile (util.ts:145-149); (c) call it ONCE in runUntilBlocked right after the step returns 'pending' (run.ts:174-184, before the autoAuthor branch). Every pending write goes through that branch, so this one hook covers all seven consult sites: interview.ts:94 and :131, chapter.ts:154, :225, :308, :350 and style.ts:72. Those files need no edit. (d) Update author.md: step 4 reads <dir>/author-context.json for proposals and interview_answer, and rule line 61 allows that one file (never author-decisions.jsonl directly). Keep the reply format unchanged. Alternative that changes the schema: add a context field to each Pending variant; that touches the constructors at interview.ts:84,120, chapter.ts:62,143,202,290,341, style.ts:64, plus the fixtures in author-io.test.ts:23-94.

Product-side (out of eval scope, separate decision): src/server/interview.ts answerTurn (155-235) passes only names via loadKnownEntries (line 170, mapping 180-193); facts are not passed, which is why extraction re-proposes facts (interview-extract.ts:11-21, 44-53). approveProposal's fact duplicate check (src/server/proposals.ts:376-401, note at line 280) is a silent no-op, so duplicate approvals do no DB harm but still count in metrics. entry_create merges by name (proposals.ts:296-300).

Reusable: finish.ts:123-140 already writes a wiki snapshot (wiki-final.json) with the same list calls; setup.ts:12-66 seeds no entries or facts, so the snapshot must be rebuilt before each pending, not once at setup. fake-author.ts:7-64 approves everything and needs no change; tests in eval/novel/author-io.test.ts (roundtrip at line 132) and run.test.ts cover the paths.

Files:
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 14-25, 46-62 - Author prompt: reads only pending.json, bible, guide (step 4 at 18-22); forbids other run-dir files (60-61). Needs a new input for the context file and decision summary.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/author-guide.md` 7, 20-26 - Judgment basis claims the approved wiki (7); duplicate rule for proposals (25). No wiki is delivered. The en guide (eval/fixtures/novel/en/author-guide.md) has the same 50-line layout; not read in detail, parity unverified.
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 130, 153-158 - Author agent prompt builder; passes only dir and lang. No change needed if context lives in dir.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 61-112, 184-197, 204-214, 249-253 - PendingSchema (zod, strips unknown keys); writePending, readPending, readAnswer, logDecision. Add readDecisions and widen logDecision body (store item names and question). logDecision signature unchanged.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 145-149, 187-197, 204-251 - consult (sync, no db), settle, applyProposalDecisions. Place new async buildAuthorContext(ctx) here, reusing writeRunFile (145).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 39-52, 149-197 - RunContext has db and dir. runUntilBlocked: the single hook point at 180-184, after a step returns 'pending' and before the autoAuthor branch at 186-195.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 84-94, 113-138 - Consult sites for interview_answer (94) and interview proposals (131). Pending built at 84 and 120. No edit needed if the hook is in run.ts.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 62-70, 143-165, 202-230, 263-307, 326-359 - Consult sites: advice (70), draft_review (154), proofread (225), continuity (308), post_chapter proposals (350). Pending built at 62, 143, 202, 290, 341. proposals reads ids from checkProposalIds (333).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/style.ts` 54-75 - Style proposals: Pending at 64, consult at 72.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 1-10, 123-140 - Existing wiki snapshot writer (listEntries, listFacts, listThreads, listRelations, wiki-final.json). Pattern to reuse for the per-pending context.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts` 12-66 - Seeds naming rules, planned threads and style card only; no entries or facts. Wiki exists only after proposals are approved, so the context must be rebuilt each time.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 7-64 - Deterministic author: approves everything. No change required; test fixture for the loop.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.test.ts` 20-100, 120-160, 220-275 - Pending fixtures and roundtrip (132 expects readPending to equal input). Must stay green when fields are added to the schema.
- `/home/xogud/documents/github/DaeumHwa/src/server/known-entries.ts` 20-79 - Product known-names list (active plus pending only, no rejected). Used by interview.ts:170 and chapter-check.ts:145. Product-side change, out of eval scope.
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 155-235, 170, 180-193 - answerTurn: extraction gets names only (no facts). Product-side, out of eval scope.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 11-21, 28, 44-53 - Interview extract input: known has names only, no facts. Product-side.
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts` 280-282, 296-300, 376-401, 618-650, 664-681 - Approval semantics: entry_create merges by name, fact duplicates are a silent no-op, rejectProposal writes status only (no memory).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 149 - Backlog item for HX3: author sees current wiki and its own earlier decisions.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 269 - Evidence: duplicate fact approved, same card rejected once then approved.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md` 194-197 - Evidence: 12 duplicate interview proposals (17 percent); author guide only covers card duplicates.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 122, 167-184 - Design intent: author gets bible, guide and a decision summary per agent (169-170); decisions logged to author-decisions.jsonl (184).

Open questions:
- Should the author also see wiki facts (not only names) for interview questions, or only for proposals? The spec limits interview answers to the answer bank.
- The en author guide was not read line by line; confirm its judgment basis matches ko before editing both.
- Product-side rejection memory (known-entries.ts) is outside the eval; decide whether HX3 covers only the eval author or also the product extraction.
- Is a per-pending wiki snapshot (potentially 80+ entries) acceptable size for the author agent's context, or should it be trimmed to entries named in the pending items?

## survey:HX3:evidence

TRACK HX3 evidence survey (read-only). Problem statement: the author agent approves duplicate facts and re-approves a card it rejected once, because it never sees the current wiki or its own earlier decisions. Every count below is a reviewer's tally in the run review unless marked "computed". No file was edited.

1. ROOT CAUSE (verified in code)
- The author sees only the pending item, the bible and the guide. author.md:48 says "Use only the bible, the author guide and what the pending file carries." Step 3 (author.md:18) reads only bible.json and author-guide.md.
- The guide says the opposite. ko author-guide.md:7 says the basis is "설정집, 이 지침, 그리고 앱이 지금까지 승인한 위키뿐이다", and en author-guide.md:45 uses "the approved wiki" as a judgment basis. The duplicate rule itself is at ko author-guide.md:25 ("이미 있는 항목의 중복이 아니다") and en author-guide.md:25. The author cannot check it because no wiki is passed.
- The pending schemas carry no wiki state. interview_answer fields (author-io.ts:63-71) are question, topic, focus, asked, limit, with no history. proposals items (author-io.ts:37-41, 72-79) are id, type and payload only. The fake author (fake-author.ts:25-33) approves everything, so no test exercises dedupe.
- Decisions are not fed back. logDecision (author-io.ts:249-253) appends {at, step, kind, answer} to author-decisions.jsonl. The file is written only for the reviewer (reviewer.md:20, spec line 184). It is never read by author.md. It also does not record the topic or the payload, so a later repeat cannot be matched. writePending (author-io.ts:184-189) overwrites pending.json, so payloads are lost unless the run DB keeps them.
- The harness documents this gap itself: docs/eval/novel/README.md:131 says "작가는 대기 중인 항목, 설정집(bible), 지침만 본다... 그래서 중복 사실을 승인할 수 있다(예: haiku-en 최종 위키의 F13, F14, F16)."
- Operational note: author.md:12 hard-codes `/Users/taehyeong/Documents/GitHub/DaeumHwa` as the repo root. On this machine the root is /home/xogud/documents/github/DaeumHwa, so the author agent would resolve paths wrongly here.

2. EVIDENCE FROM THE BACKLOG AND THE SIX REVIEWS
- Backlog G (follow-up-ai-improvement.md:93-108): "기존 사실을 다시 제안했다(Haiku 한국어 72건 중 약 17%)". Section 3 (line 149-150) names the author-view item. Summary section 5 rank 7 (summary.md, row 7) lists duplicate counts.
- Duplicate approvals, by run:
  - haiku-5.5-ko.md:194 "이미 있는 내용을 다시 낸 중복 제안 12건(인터뷰 72건의 약 17%)" and :197 "작가 지침은 카드 중복만 명시해서 사실 중복을 거르지 못했다(작가 쪽 빈틈)". The author approved them. 4 duplicate pairs remain in the final wiki (:196).
  - haiku-5.5-en.md:86 "the key rule appears three times in the final wiki... the author approved the duplicates" and "the messenger fact" x2. Also haiku-5.5-en.md:161 "key rule x3, messenger fact x2". Redundant copies: 2 for the key rule and 1 for the messenger fact.
  - luna-6-en.md:123 "About 9 of the 58 approved proposals are redundant." luna-6-en.md:129 "the author approved duplicate facts and the two duplicate rule cards".
  - luna-6-ko.md:125 "최종 위키에 같은 내용이 두 번 들어갔고 작가가 승인했다." luna-6-ko.md:274 "최종 위키에 약 6건". luna-6-ko.md:142 "작가 지침은 '이미 있는 항목의 중복이 아닌 것만 승인'이라고 하는데 위 중복을 승인했다".
  - qwen3.8-27b-en.md:119 "four near-duplicate relation pairs... and four near-duplicate fact pairs" reached the final wiki (8 pairs).
  - qwen3.8-27b-ko.md:291-297: the second `4층이상은` proposal is a duplicate of the first and was accepted (1 duplicate).
- Approve-after-reject, by run:
  - luna-6-en.md:129 "the first-round proposal for the card 'Serin' was rejected as a 'cut name', then the identical card was approved one round later". This is the only clear case of approving a previously rejected payload (1 card).
  - luna-6-ko.md:142 and :124. The "Serin" card was rejected, and two relations that point at it were then approved. They failed with `BAD_STATE` (run-summary failed, 2 entries). The central Baek Jiwon to Serin relation is missing from wiki-final.json.
  - haiku-5.5-ko.md:185 "1회차에서 거절당한 뒤에도 같은 잘림이 반복됐다" (the "종루" name). This is re-proposal after rejection, and it was rejected again (2 rejections). Not approved.
- Approval-rate variance (summary.md section 2.2 table): qwen ko 45/51 (88.2%), qwen en 76/79 (96.2%), haiku ko 69/72 (95.8%), haiku en 37/38 (97.4%), luna ko 59/62 (95.2%), luna en 38/39 (97.4%). summary.md section 7 flags this as the author's verdict variance, not a metric target.
- Repeated interview questions (author-side context gap). luna-6-en.md:117 suggests feeding undecided topics into `<rejected>`. summary.md section 2.1 gives undecided answers: luna ko 9 of 12, luna en 10 of 12, qwen ko the last 6 of 12. The guide (ko author-guide.md:18, en :18) says to repeat the same answer for a repeated question, but the author cannot see prior Q/A.

3. PRODUCT COUNTERPART (same gap in the app's extractors)
- src/ai/tasks/interview-extract.ts:41-67 builds `<known>` from name, aliases, kind and pending flag only. No facts, and no rejected proposals. Built in src/server/interview.ts:170-196 from loadKnownEntries.
- src/ai/tasks/chapter-extract.ts:64-70 does pass `<known_facts>`, but luna-6-en.md:123 notes a 15-fact cap in the chapter call.
- Rejected proposals are kept with status `rejected` (src/server/proposals.ts:663-679), but no extractor reads them. `rejected` appears only in src/ai/tasks/interview-question.ts:72,107,187, which is the question prompt.

4. PROPOSED ACCEPTANCE CRITERIA (metric, current per run, target)
A. Duplicate approvals per run. Metric: count approved proposals whose normalized subject plus text matches an existing active entry or fact, or an earlier approved proposal in the same run. Current (reviewer tally): haiku ko 12 (interview only), haiku en 3 (2 extra key-rule copies plus 1 messenger), luna en about 9, luna ko about 6, qwen en 8 pairs, qwen ko 1. Target: 0 exact duplicates; at most 1 near-duplicate per run. Method: computed post-run from the run DB, see section 5.
B. Approvals of a previously rejected payload. Metric: same normalized payload with an earlier status `rejected` row and a later status `approved` row. Current: luna en 1 (luna-6-en.md:129), other runs 0 approved (haiku ko 1 re-proposal, rejected again, haiku-5.5-ko.md:185). Target: 0 approvals. Re-proposal of rejected items: 0 where the extractor has the rejected list.
C. Author context visibility. Metric: share of author calls whose pending or context includes the current wiki subset (subject names and facts) and the earlier decisions for that subject. Current: 0 of 6 runs (author.md:48; author-io.ts:37-88). Target: 100% of proposals and interview_answer calls after the first wiki write.
D. Interview repeat consistency. Metric: pairs of interview_answer decisions with the same topic that give different answers, plus the count of repeated-topic questions. Current: not computable, because logDecision does not record topic (author-io.ts:251). Target: 0 contradictory repeat answers; undecided answers reopened 0 times in a row (see backlog B/I).
E. Guide and harness agree. Metric: one rule in both files. Current: ko author-guide.md:7 says the approved wiki is a basis, and author.md:48 forbids it. Target: 0 conflicting rules (check by a test on the two files).

5. HOW THE EVAL HARNESS CAN MEASURE THESE
- Available data:
  - Run DB at `<run>/db` (PGlite; run.ts:114). The `proposals` table keeps payload, status, source_ref, created_at, decided_at and decision_note (src/db/schema.ts:330-350). Metrics A and B can be computed from this table after the run, using a normalized payload comparison and created_at ordering. Confirm the run folder is not deleted at finish. I did not verify that.
  - author-decisions.jsonl (author-io.ts:249-253) gives per-id approve and reason. It does not give payload, topic or wiki context.
  - wiki-final.json (finish.ts:125-134) gives the final entries, facts, threads and relations. Good for end state, not for decision time.
- Missing metrics:
  - Duplicate or re-approval metric: none. metrics.ts (3-15, 41-89) computes only chapter text metrics (T3 length, T5 foreign runs, T4 meta lines, T7 endings, paragraphs, dialogue ratio). No proposal metric exists.
  - Author context record: none. Add a `context` hash or list of ids to logDecision, and keep the payload and topic in each decision line (author-io.ts:249-253).
  - Test: fake-author.ts approves everything, so nothing can check that dedupe would be enforced. Add a fixture-based test in author-io.test.ts or a new fake that rejects a known duplicate.
- Recommended order: (1) log payload, topic and context in logDecision; (2) add a post-run metric over the run DB for A and B; (3) update author.md and the author-guide wording to match (E); (4) then give the author the wiki subset (C). Re-run with the same date rule in docs/eval/novel/README.md 3절 and compare to 2026-10-18.

Caveats: all current counts are from one chapter per run and one reviewer per run (summary.md section 0 and 7), so the baseline is weak. The review counts are not computed from the DB. A few numbers are approximate ("약 6", "about 9").

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 93-108, 149-150 - backlog item G (duplicates, approve-after-reject) and section 3 author-view item
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 12, 18, 48, 60-61 - author prompt: sees only bible, guide and pending file; forbids other inputs; hard-coded repo path
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 37-41, 63-79, 184-189, 249-253 - pending schemas (no wiki or history), logDecision (no payload or topic), writePending overwrites pending
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 83-96, 113-138 - question pending built without prior Q/A; proposals built from listProposals
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 187-197, 199-240 - settle logs decision then clears pending; applyProposalDecisions
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts` 27-64 - seeds naming rules, planned threads, style card only; no wiki shown to author
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 25-33 - fake author approves all, so dedupe is untested
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 3-15, 41-89 - chapter text metrics only; no proposal duplicate or approval metric
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 114-116 - run DB persisted in run folder (PGlite)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts` 125-134 - final wiki snapshot only
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 330-350 - proposals table: payload, status, created_at, decided_at, decision_note (basis for post-run metric)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 41-67 - product extractor: known = names/aliases/kind/pending only, no facts or rejected list
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 170-196 - builds known list for interview extraction
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/chapter-extract.ts` 64-70 - chapter extractor does receive known_facts
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts` 663-679 - rejected proposals kept with status rejected; no extractor reads them
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/author-guide.md` 7, 18, 25 - guide says approved wiki is a basis (line 7), duplicate rule (line 25), repeat-answer rule (line 18)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/en/author-guide.md` 18, 25, 45 - en guide: duplicate rule (line 25), approved wiki basis (line 45)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md` 131 - documents the author blind spot
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 184 - spec: decisions logged for reviewer only
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md` 185, 194-197 - evidence: 12 duplicate approvals (17%), 4 duplicate pairs in final wiki, author gap
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md` 86, 161 - evidence: key rule x3, messenger fact x2, author approved duplicates
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md` 117, 123, 129 - evidence: about 9 of 58 redundant; Serin card rejected then approved next round
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 124-125, 142, 274 - evidence: about 6 duplicates approved; Serin card reject then relation approvals; author rule violated
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md` 119 - evidence: 4 relation pairs and 4 fact pairs in final wiki
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 291-297 - evidence: duplicate 4층이상은 accepted
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` section 2.1, 2.2, 5 (row 7), 7 - approval rates per run (section 2.2), undecided answers (2.1), limits (section 7)

Open questions:
- Should the author see the full wiki or a per-subject digest? The full wiki may be large (luna-6-en.md:117 notes a 15-fact cap in the chapter call), and each author call is a fresh Sonnet agent (docs/eval/novel/README.md:133 notes roughly 2.6M subagent tokens per run already).
- Is the run folder (including the `db` PGlite directory) kept after finish? Metrics A and B depend on it. I read run.ts:114 but did not check whether finish.ts or cleanup deletes it.
- Which rule should win for 'approved wiki' in the guide: give the author the approved wiki (guide wording), or remove that basis from the guide (author.md:48 wording)? This decides whether criterion C is a product change or a guide fix.
- Should the rejected-proposal list also go to the product extractors (src/ai/tasks/interview-extract.ts, src/ai/tasks/chapter-extract.ts)? That is the same gap on the product side, and it may belong to backlog G rather than HX3.
- author.md:12 hard-codes /Users/taehyeong/Documents/GitHub/DaeumHwa. Should it use a relative or derived root? I did not check whether other agent files have the same hard-coded path.

## survey:HX3:risks

TRACK HX3 survey (read-only). No repo files were changed.

WHAT HX3 TOUCHES (current state)
- The "author" in the eval is a Sonnet agent started per pending item by .claude/workflows/novel-eval.js (authorPrompt, lines 153-158; spawn at 300-303). It gets only `dir` and `lang` and is told to read only pending.json (eval/novel/agents/author.md:22 "the pending file carries the material you need. Do not look for more"; :60-61 forbids reading any other run file). It has no wiki access and no memory of earlier items.
- pending.json carries only item payloads: ProposalItemSchema {id,type,payload} (eval/novel/author-io.ts:37-41, PendingSchema proposals at :72-79). Nothing shows the author the current wiki, the existing facts, or its own earlier decisions.
- The only memory is eval/novel/author-io.ts logDecision (:249-253), which appends {at,step,kind,answer} to author-decisions.jsonl. It does NOT store item labels or payloads, so a decision id such as "approve p-123" cannot be tied back to a card name. A new ledger line needs the item label.
- Evidence of the bug: luna-6-en.md:123-129 (duplicate facts and rule cards approved; card "Serin" rejected as cut name, then the identical card approved a round later). luna-6-ko.md:121-125 and 142 (same duplicate approval, and rejected Serin card leading to BAD_STATE on two relations, run-summary failed x2). qwen3.8-27b-en.md:119 (near-duplicate relations and facts reached the wiki).
- Existing app-side wiki reads that can feed a snapshot without new SQL: loadKnownEntries (src/server/known-entries.ts:20-79: active names+aliases, pending entry_create names, threads, pending thread titles; names only, no facts); listEntries (src/server/wiki.ts:97-110, requireWorkRole viewer); listFacts (src/server/facts.ts:112-120); buildQuestionInput (src/server/interview.ts:360-390) already reads entries plus fact counts. Facts per entry are capped in buildContextPack (src/ai/context.ts:65 MAX_FACTS_PER_ENTRY=15, :64 DEFAULT_BUDGET_CHARS=12_000).
- Interview-time wiki is almost empty: setup seeds only naming rules, planned threads and the style card (eval/novel/steps/setup.ts:27-63). No entries exist before the first answer.
- src/ai/guards does not exist (src/ai has no guards directory; checked the listing).

PROPOSED MINIMAL PUBLIC INTERFACE (TypeScript)
// eval/novel/author-io.ts
export const WikiSnapshotSchema = z.object({
  entries: z.array(z.object({
    name: z.string(),
    kind: z.enum(ENTRY_KINDS),
    aliases: z.array(z.string()),
    status: z.enum(['active', 'pending']),
    facts: z.array(z.string()),          // "[F ref] content", capped, facts with status shown
  })),
  threads: z.array(z.object({ title: z.string(), status: z.string(), pending: z.boolean() })),
  truncated: z.boolean(),
})
export type WikiSnapshot = z.infer<typeof WikiSnapshotSchema>
// Optional on every pending kind so an existing run dir still parses (readPending throws on invalid, :191-197).
// Add `wiki: WikiSnapshotSchema.optional()` to each PendingSchema branch. Without it zod strips the field on read.
export const LedgerLineSchema = z.object({
  at: z.string(), step: z.string(), kind: z.string(),
  items: z.array(z.object({ id: z.string(), label: z.string() })), // label = card name or fact text, never a model id
  answer: AnswerSchema,
})
export function logDecision(dir: string, p: Pending, a: Answer): void   // same signature; now writes items[].label
// eval/novel/steps/util.ts
export async function wikiSnapshot(ctx: RunContext, workId: string, cap?: number): Promise<WikiSnapshot> // read-only, uses listEntries/listFacts/loadKnownEntries
export function attachAuthorContext(p: Pending, wiki: WikiSnapshot, ledgerFile: string): Pending  // adds wiki and points at author-decisions.jsonl
// consult() stays synchronous; callers await wikiSnapshot before building the Pending.
// Callers: steps/interview.ts:84-93 and :113-138, steps/chapter.ts:331-349, steps/style.ts:56-72.
// author.md: add the wiki field and <dir>/author-decisions.jsonl to the allowed reads (lines 22, 60-61), plus rules: an item that duplicates an active or pending card or fact is rejected; a name rejected earlier is not approved again unless the payload materially changes; a relation whose endpoint was rejected is rejected.
// fake-author.ts: keep approve-all as the default (run.test.ts:182 counts only interview_answer lines; the fake is used at :209, :297, :315). Add an opt-in duplicate-rejecting mode for HX3 tests.

APPLICABLE CLAUDE.md INVARIANTS
- Eval-only changes: no wiki table write, no change_log, no AppError code, no Korean user copy in eval/novel. The author's answers reach the app only through approveProposal/rejectProposal (applyProposalDecisions, util.ts:204-251), which already records change_log. Keep it that way: the snapshot must be read-only.
- Access: any new service call must go through requireWorkRole first. listEntries (wiki.ts:97-103) and listFacts (facts.ts:112-118) already do; a raw db query would not.
- Archived rows: snapshot must filter archivedAt IS NULL (as known-entries.ts:33 and interview.ts:376 do). Never delete rows.
- If wiki text enters any app AI prompt (for example G1 putting facts into interview-extract, interview-extract.ts:18 currently names only): wrap with neutralizeDeep and TAG_DATA_RULE (prompt-utils.ts:5-26; pattern at interview-extract.ts:43 and chapter-extract.ts:39), and list facts in tags. The eval author is an LLM, so author.md must say the snapshot is data, not instructions.
- AI never writes wiki tables: keep the author as a decider over proposals only.
- Next.js/route rules do not apply (no route or page touched).

REGRESSION RISKS
- Token and size: a snapshot grows with the wiki. luna-6-en.md:168 shows interview prompts going from 760 to 2,122 input tokens as the wiki filled. Cap entries and facts (ENTRY_LIMIT=80 at interview.ts:42, MAX_FACTS_PER_ENTRY=15 at context.ts:65) and set truncated. For the author (JSON read by an agent), keep the snapshot small; no hard token limit applies to the agent, but a huge pending.json slows the author.
- 120 s product timeout: DEFAULT_AI_TIMEOUT_MS=120_000 (src/ai/run.ts:28) applies to interview-question (maxTokens 2000, interview-question.ts:195) and interview-extract (maxTokens 8000, interview-extract.ts:79) in the product. Eval overrides it (models.ts:35-36 local 3,600,000 ms, cloud 900,000 ms; run.ts:126 setAiTimeoutOverride). So an HX3 prompt that is fine in eval can time out in the product. Measure the product path separately.
- Prompt injection: neutralizeDeep and TAG_DATA_RULE must be applied to any new wiki text placed in an app prompt, or a fact that contains "</known_facts>" can close the section early.
- Streaming: draft and proofread use stream timeouts (STREAM_AI_TIMEOUT_MS=280_000, run.ts:30). Adding the snapshot to draft prompts (D or A) would lengthen them; HX3 does not need that.
- Blinding (HX1): the ledger and the wiki must not carry a model id. config.json, state.json and calls/*.json are excluded (author.md:61). Keep the snapshot builder out of calls/.
- Resume: consult rewrites pending only when pendingKey differs (util.ts:164-191; key = step|kind|id, so the snapshot is not part of the key). On a rerun a pending file written with an old snapshot is kept, not refreshed. Decide freeze versus refresh (open question 2).
- Loop guard: MAX_SAME_PENDING=30 (.claude/workflows/novel-eval.js:41, check at :284-291). More author rejections of the same item could trip it.
- Baseline comparability: changing the author changes the judge. The follow-up plan (docs/eval/novel/follow-up-ai-improvement.md:9, 32) says improvements are re-measured on a new date with the same harness. Duplicate approvals are an author-side variance (luna-6-en.md:129). HX3 changes the baseline, so run the HX3 comparison as a separate series, or fix the author before comparing other tracks.
- Hardcoded path: author.md:12 and .claude/workflows/novel-eval.js:14 set REPO to /Users/taehyeong/Documents/GitHub/DaeumHwa. This machine's working directory is /home/xogud/documents/github/DaeumHwa. Any author run here cannot resolve the instructions path unless REPO is changed. Not HX3's core, but it blocks an end-to-end HX3 check on this machine.

OTHER TRACKS: WHO EDITS THE SAME FILES
- eval/novel/author-io.ts (highest conflict): HX3 (PendingSchema, logDecision); A, C, E1, E2 (MetricsSchema :25-35, draft_review :80-90); J (ProofreadItemSchema :43-50); F1 (proofread chunks); F2 (chapter extract split: proposals items); G1 and G2 (ProposalItemSchema payload shape :37-41); I (interview_answer fields :61-71); HX4 (none directly).
- eval/novel/agents/author.md (rules conflict): HX3 (reads, duplicate and rejected-once rules); J (proofread rule :54); H (continuity rule :55); B (voice or style rules, if the author judges voice); I (interview bank rules :51). Edit these as one block, not piecemeal.
- eval/novel/fake-author.ts: HX3, J (proofread accept, :36-44), F1, I.
- eval/novel/steps/interview.ts: HX3 (pending at :84-93, proposals at :113-138); I (question strategy, same block); G1 (extraction dedupe on answers).
- eval/novel/steps/chapter.ts: HX3 (proposals step :326-359); A and C (draft retry, :80-180); D (two-step draft); H (continuity :280-325); J (proofread :182-262); F1, F2, F3 (reader :361+). Same file, many tracks.
- eval/novel/steps/util.ts: HX3 (consult, pendingFor, applyProposalDecisions, :164-251); HX4 (persist, saveState); F1 (pendingKey uses id only for interview and draft, :167-170, so proofread chunk ids must be unique).
- eval/novel/steps/style.ts: HX3 (proposals :56-72), B (style suggestions).
- eval/novel/run.ts and cli.ts: HX4 (resummarize, resume), F4 (worker lock, serialization, effort; models.ts:35-36 timeouts), HX1 (calls).
- src/server/known-entries.ts and src/ai/tasks/interview-extract.ts / chapter-extract.ts: G1 (dedupe, known facts), G2 (relations and threads), and HX3 wants the same facts list. Build the snapshot helper once and share it. Read-only helper; no new service needed.
- src/ai/context.ts (budget 12,000 chars, facts 15 per entry): H (continuity context: every card whose name appears in the manuscript), D, A. HX3 should not change this file.
- src/ai/run.ts (timeouts :28-30): F4 and A (length); HX3 does not touch.
- docs/eval/novel/follow-up-ai-improvement.md section 3 (line 149) is the HX3 spec; section 2.G (lines 93-108) and 2.I (123-134) overlap.
- .claude/workflows/novel-eval.js: HX3 (only if the author prompt changes), HX4 (resume and summary steps), author loop guard :41.

OPEN QUESTIONS FOR THE AUTHOR DECISION
1. Snapshot scope: all active and pending cards with all facts, or a cap (ENTRY_LIMIT 80, 15 facts per entry)? Which subset: active only, or active plus pending?
2. Freshness: freeze the snapshot at the first pending write for a step (consistent with the handshake, :187-191), or refresh on each consult? Refresh needs a change to consult or to pendingKey.
3. Duplicate rule: enforce in prompt only (author.md), or also in code (applyProposalDecisions refuses approval when the ledger shows a rejected identity)? Code enforcement removes variance but changes the harness semantics.
4. Should the author see pending (undecided) cards? Yes would catch duplicates within one batch; no matches the current pending-only view.
5. Do relations need the endpoint's status in the snapshot (to stop the BAD_STATE cases in luna-6-ko.md:124)?
6. Fake author: keep approve-all, or add the duplicate rule for tests? The fake approves everything (fake-author.ts:25-33).
7. Scope with G1: should the app-side known facts (interview-extract known list) also change in HX3, or only the eval author (G1 owns the app side)?
8. Baseline: run HX3 as a new date series, or hold it until the author is fixed? Changing the author moves the reference scores.
9. REPO path in author.md:12 and novel-eval.js:14: fix now (HX3 scope) or as a separate small fix?
10. Should an approved card that was later rejected (or a rejected-then-approved identity) be flagged in the ledger as a conflict rather than silently approved?

Files:
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 12, 16-22, 46-63 - Author prompt: reads only pending.json (line 22), forbids other run files (60-61), judgment rules (46-56), hardcoded REPO path (line 12)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 25-41, 61-112, 116-145, 184-197, 249-253 - Pending/Answer zod schemas (readPending strips unknown keys), logDecision writes no item labels, MetricsSchema, ProposalItemSchema
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 7-64 - Deterministic approve-all author used by tests and --fake-author
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 84-93, 113-138 - Interview step: pending question and proposals consult, the main HX3 insertion point
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts` 12-66 - Seeds naming rules, planned threads and style card; no entries before the interview
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 155-197, 204-251 - Handshake: pendingKey, pendingFor, consult (sync, rewrites only on key change), settle, applyProposalDecisions, readCallRecords
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 326-359 - proposals step (post_chapter pending, chapterFile), draft, proofread, continuity
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/style.ts` 50-80 - style proposals pending
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 39-52, 107-140 - RunContext (autoAuthor, db, actor), setAiTimeoutOverride per profile
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 35-36, 46-103 - Eval timeouts (local 3,600,000 ms, cloud 900,000 ms) that hide the product 120 s limit
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.test.ts` 225-234 - logDecision line-count test (must stay green)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts` 147-182, 209, 297, 315 - Tests asserting decision lines and fake author use
- `/home/xogud/documents/github/DaeumHwa/.claude/workflows/novel-eval.js` 14, 41, 153-158, 284-305 - authorPrompt (only dir and lang passed), REPO constant, MAX_SAME_PENDING loop guard
- `/home/xogud/documents/github/DaeumHwa/src/server/known-entries.ts` 9-79 - Read-only known names (active, pending, threads); no facts; reusable for a snapshot
- `/home/xogud/documents/github/DaeumHwa/src/server/wiki.ts` 97-110 - listEntries with requireWorkRole viewer and archivedAt filter
- `/home/xogud/documents/github/DaeumHwa/src/server/facts.ts` 112-120 - listFacts with requireWorkRole viewer
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.ts` 37-48, 170-199, 360-390 - Interview service: question input builder (wiki read, ENTRY_LIMIT 80), answerTurn known-entries call, ENDED/CONFLICT codes
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 64-67 - Context pack budget and per-entry fact cap
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 4-26 - TAG_DATA_RULE and neutralizeDeep for any wiki text in app prompts
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts` 18, 28, 37, 43-69, 79 - Extraction prompt with names-only known list; neutralizeDeep and TAG_DATA_RULE used; maxTokens 8000
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/chapter-extract.ts` 16-18, 35-70, 85 - Chapter extraction with knownFacts (15-fact cap in pack); maxTokens 16000
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts` 75, 107-112, 165, 195 - Interview question prompt with wiki input; maxTokens 2000 under the 120 s product timeout
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 28-30, 38, 93, 143 - DEFAULT_AI_TIMEOUT_MS 120_000 and STREAM_AI_TIMEOUT_MS 280_000
- `/home/xogud/documents/github/DaeumHwa/src/ai/guards` n/a - Does not exist: the shared guard library named in the track is not yet in the repo
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/author-guide.md` 25, 28, 42 - Author judgment rules for proposals (duplicate, contradiction rejection)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/en/author-guide.md` 25, 28 - English author guide, same rules
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 9, 32, 93-108, 110-134, 144-152 - Backlog: HX3 at section 3 (author sees wiki, approves duplicates and card rejected once); sections 2.G, 2.I, 2.E, 2.H overlap
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md` 123-135, 168 - Evidence: duplicate facts and rule cards approved, Serin card rejected then approved, interview prompt growth 760 to 2,122 tokens
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 121-125, 142 - Evidence: duplicate approvals, rejected Serin card leading to BAD_STATE on relations
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md` 116-119 - Evidence: near-duplicate relations and facts reached the wiki

Open questions:
- Snapshot scope: all active and pending cards with all facts, or capped (ENTRY_LIMIT 80, 15 facts per entry)? Active only, or active plus pending?
- Freshness: freeze the wiki snapshot at the first pending write for a step, or refresh on each consult? consult() (steps/util.ts:187-191) rewrites only when pendingKey changes, and pendingKey ignores the snapshot.
- Duplicate rule: enforce in author.md only, or also in code (applyProposalDecisions refuses approval when the ledger shows a rejected identity)?
- Should the author see pending (undecided) cards for duplicate checks within one batch?
- Do relation proposals need endpoint status in the snapshot, to stop the BAD_STATE failures in luna-6-ko.md:124?
- Fake author: keep approve-all as default, and add an opt-in duplicate-rejecting mode for HX3 tests?
- G1 overlap: does HX3 also change the app-side known list in interview-extract (names only today), or leave that to G1? One shared snapshot helper is proposed.
- Baseline: run HX3 as a new-date series, or fix the author first? Author changes move the reference scores across dates.
- REPO path /Users/taehyeong/... in eval/novel/agents/author.md:12 and .claude/workflows/novel-eval.js:14 does not match this machine (/home/xogud/documents/github/DaeumHwa). Fix within HX3 or separately?
- Should a card that was rejected and later reappears in a proposal be flagged in the ledger as a conflict rather than approved silently?

## survey:HX3:specs

TRACK HX3 (author sees the wiki and its own earlier decisions): spec survey. Read-only; nothing edited.

CURRENT BEHAVIOR (code, for context): the author gets only the question/focus/topic (eval/novel/steps/interview.ts:84-93) and, for proposals, only this turn's proposals sourced by turnId (interview.ts:113-127). author.md says to use only the bible, the guide and the pending file (eval/novel/agents/author.md:48, 22), and forbids reading config/state/calls/other run dirs (author.md:60-61). author-io.ts logs decisions to author-decisions.jsonl (author-io.ts:23, 249-253) but nothing feeds that log back to the author. fake-author.ts approves and accepts everything (fake-author.ts:4, 25-33, 39-43, 46-52).

INTENDED BEHAVIOR THAT CONSTRAINS HX3:
1. Eval design spec docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md §6.4 (line 167-184), line 173: each author judgment is a fresh Sonnet agent given "같은 설정집, 같은 지침, 그 실행에서 지금까지 내린 판단 요약" (same bible, same guide, a SUMMARY of that run's judgments so far). So a prior-decision summary is already the designed input. The current pending.json and author.md do not carry it. This is the strongest anchor for the "own earlier decisions" part.
2. §6.4 line 175: no deterministic auto-judge is to be built; judgment records must all be kept (line 175, 184). Writing the summary into pending is consistent with this.
3. §6.4 line 179 (proposals rule): approve only if settings-consistent, name whole, subject right, NOT duplicate. Duplicate rejection is already a rule. The gap is that the author cannot see existing items.
4. §6.4 line 172 and §7 line 268 and §12 item 14: the author never sees the model id; the settings bible is author-only; the target model learns only from interview answers and chapter instructions. Any wiki shown to the author must not reveal the model identity. Author-side, the author.md rule "do not identify the model" (author.md:62) and the guide (ko guide line 9-10 area; en guide line 9) say the same.
5. §6.4 line 172-173 and §6.4 about questions: "질문이 잘못됐거나 이미 답한 걸 또 물으면 그 사실도 기록한다" (line ~183). The author must be able to see prior Q&A to make this judgment.
6. §2 failure list (line 32): changing prompts or code mid-run or mid-series breaks comparison with the 2026-10-18 baseline. Redo the baseline on a NEW date (backlog §1 line 32 says so). Do not compare HX3 results to 2026-10-18 without a note.
7. §2 failure list (line 34): harness-only code must not change product behavior. Backlog §3 (follow-up-ai-improvement.md:149) lists "작가가 위키를 보게 하기" under §3 "평가 하네스 후속 과제", i.e., harness-only, not product. So HX3 should stay in eval/novel/ (author.md, pending shape, author-io.ts, steps/interview.ts, steps/setup.ts, fake-author.ts) and not touch src/ai or src/server.
8. Measurement principle §6.3 (line 164): wrongly approved or missing settings carry into later chapters and ARE the measurement. Showing the author the wiki changes what the author approves, which is the intended direction, but report it as a change.
9. §8 (line ~278): author-decisions.jsonl is a reviewer input; the reviewer relies on it. Keep the log format unchanged.
10. §10 (line 308-320): tests never call the real API; --fake mode must complete end-to-end inside pnpm test (line 315); fake author behavior is asserted by tests (plan lines 498-500, spec line 315). Changing the fake author's approval rule would change those flow tests.
11. Author guide fixtures (basis for judgments): ko guide eval/fixtures/novel/ko/author-guide.md:7 and en eval/fixtures/novel/en/author-guide.md:7 say the basis is "the bible, this guide, and the wiki the app has approved so far". So the guide ALREADY allows approved wiki as a judgment basis. author.md:48 and :22 ("use only the bible, the guide and the pending file") CONTRADICT the guide. Fixing author.md to match the guide is spec-consistent. Duplicate rule: ko guide:25, en guide:25.
12. Product-side parallel (do not re-decide): interview-reliability spec §5.B (docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:63-79) already defines the real question-generation input (wiki summary up to 80 cards and 30 open threads, all prior sessions' asked questions, rejected-duplicate guard). §5.C (lines 81-96) already defines known-entry dedup including pending entry_create candidates. The plan (2026-10-18-interview-ai-reliability.md:205-214, 227-229, 287) builds known-entries.ts (active + pending), so the author's view should mirror those product rules, not invent new ones.

WHAT WOULD BE CONTRADICTED OR IS NOT COVERED:
- Showing the author the wiki through a new pending field: the eval design allows pending.json to carry "판단에 필요한 자료" (spec §6.2 line 122). OK. But author.md's "Do not look for more" (author.md:22) and "Use only ... what the pending file carries" (author.md:48) must then be rewritten to match. Do NOT let the author read db/ or author-decisions.jsonl directly (author.md:61 forbids other run dirs; spec §6.4 says a SUMMARY, not raw log).
- author-io.ts PendingSchema (lines 61-112) is a non-strict zod object. readPending strips unknown keys (line 194-196). A new field must be added to the schema and type. writePending writes the raw object (line 184-189), so the field survives on disk, but pendingFor returns parsed data (util.ts:173-181), so the field can be lost on the runner side unless the schema is updated. Verify when implementing.
- Answer shapes are strict (author.md:29 "Extra fields are not allowed"); AnswerSchema (author-io.ts:116-145) is not strict. Do not change answer shapes for HX3 unless the author.md table and schema change together.
- Interview answers come from the answer bank (spec §6.4 line ~174, §12 item 14; author.md:51 "answer with the matching answer-bank entry"). Showing the wiki must not let the author invent answers outside the bank. Only the "already answered / repeated question" judgment is new.

DECISIONS ALREADY MADE (do not re-litigate):
- Author is a Claude Code Sonnet agent, one fresh agent per judgment (spec §6.4, §12 items 2, 14; plan line 620).
- Author never writes prose, never rewrites AI output, never changes chapter instructions (spec §6.4 line 186 area "금지"; author.md:49).
- Author never sees the model id; the prompt passes only dir and lang (plan line 622-623).
- Pending/answer file protocol, the answer-check rules, and answer.error.txt and rejected-N archive (author-io.ts:204-214; plan lines 392-398).
- Only these are pre-seeded by the author: naming rules, planned threads, style card (setup.ts:27-64; spec §6.3 step 3 line ~130). Entries, facts, relations, and chapter summaries must come only from interview and extraction proposals. Note: spec §6.3 step 3 also lists chapter titles, which setup.ts does not seed; chapter.ts:174 sets titles at chapter creation, so this is consistent in practice.
- Fixed chapter instructions (spec §12 item 3, line 335 area).
- Advice is recorded, not fed into the next instructions (spec §12 item 4).
- Summary of prior judgments per run is a designed input (spec §6.4 line 173), so it is decided, not open.

GAPS OR CONFLICTS FOUND:
- No spec says what to do with a REJECTED proposal in later extraction. MVP spec line 152 stores status 'rejected' in proposals, and the interview-reliability spec §5.C uses only active + pending known entries. Nothing says rejected cards are suppressed. The backlog item (follow-up-ai-improvement.md:149) states the observed failure (approving a card it rejected once). This is an open design point for HX3 and the product side. It needs a decision (e.g., feed the author a list of its own rejections with reasons; a product rule for extraction is out of HX3 scope).
- author.md:12 hardcodes /Users/taehyeong/Documents/GitHub/DaeumHwa. This repo is at /home/xogud/documents/github/DaeumHwa on this machine. Not a spec item, but relevant if the author step runs here.
- The spec's author-judgment summary (§6.4 line 173) is not implemented in author.md or pending.json. Confirmed by reading author.md (all 63 lines) and author-io.ts (all 253 lines).
- Fake author (fake-author.ts) approves everything, so the --fake flow cannot exercise the duplicate or reject path. Any HX3 test of the duplicate rule needs a new fake behavior or a separate test fixture, and it must not break the flow tests.
- I did not verify the product code that implements interview-reliability B/C (src/server/known-entries.ts etc., not in the repo at the time of this read); this is spec and plan only.

Evidence files (absolute paths): /home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md, /home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts, /home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts, /home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts, /home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts, /home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts, /home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md, /home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md (line 269: author variance confounds approval rates, e.g., duplicate facts approved and a card rejected then approved in luna-6-ko/en).

Summary from the review evidence: summary.md:269 records the author variance problem ("중복 사실 승인, 같은 카드를 한 번은 거절하고 다음엔 승인"). summary.md:106 records the cause for duplicates: the interview extractor sees only card names, not facts (haiku ko 72 proposals, 12 duplicates, about 17%). Backlog §2.G (follow-up:93-108) and §3 (follow-up:149) carry the fix.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 32-34, 122, 164, 167-184, 268, 308-320, 331-360 - Primary intent: §2 failure list (line 32, 34), §6.2 pending/answer protocol (line 122), §6.3 flow and carry-over (line 124-164, esp. 164), §6.4 author rules incl. judgment summary per fresh agent (line 167-184, esp. 173, 175, 179, 184), §7 bible is author-only (line 268), §8 records (line 271+), §10 constraints incl. --fake and no real API in tests (line 308-320), §12 decisions 2, 3, 4, 14, 15 (line 331+)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 63-96 - Product-side equivalent for what the question and extraction should see: §5.B question input (wiki summary up to 80 cards and 30 threads, all prior questions, duplicate guard), §5.C known-entry dedup including pending entry_create candidates and role-word rules
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 151-160, 190, 242-246, 336-345 - Proposal lifecycle and types (proposals table with status 'rejected', line 151-160), F1 interview flow (line 190), F9 context pack (line 242-246), AI task table (line 336-345). No rule on re-proposing rejected cards.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 324-400, 462-500, 618-626 - Build-level plan: author.md contract (line 620-625: never sees model id, returns one line), author-io and fake-author tasks (324-400), flow tests that assert 12 interview_answer lines (line 498-500), fake author used in --fake flow (line 575-597)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md` 205-215, 227-229, 268, 287-292 - Plan for known-entries.ts (pending entries and threads), ENTITY_NAME_RULES, interview question covered/rejected inputs and duplicate guard
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 7-12, 22, 29, 48-62 - Current author contract that HX3 changes: inputs (line 7-12; line 12 hardcodes /Users/taehyeong/...), do-not-look-for-more (22), use only bible/guide/pending (48), duplicate rule (52), strict extra-field rule (29), forbidden reads (60-62)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/author-guide.md` 7, 25 - Judgment basis already includes approved wiki (line 7); duplicate rule (line 25)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/en/author-guide.md` 7, 25 - Same as ko: approved wiki is a judgment basis (line 7); duplicate rule (line 25)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts` 84-93, 113-138 - Current author inputs for interview: question-only pending (84-93), proposals from this turn only via sourceRef turnId (113-127), consult and settle (131-138)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts` 27-64 - Pre-seeded items (naming rules, planned threads, style card only; no entries or facts), spec-consistent with §6.3 step 3
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 4, 9-33, 39-52 - Deterministic stand-in: approves all proposals (25-33), accepts all proofreads and continuity items (39-52), interview answer from answer bank (9-24); --fake flow tests depend on it
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 23, 61-145, 184-197, 204-214, 249-253 - Pending and Answer zod schemas (61-112, 116-145; PendingSchema non-strict), readPending strips unknown keys (191-197), readAnswer rename-on-reject (204-214), decisions log (23, 249-253)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 173-191 - consult and pendingFor: pending rewritten only when key differs (187-191), pendingFor returns parsed data (173-181)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 32, 93-108, 123-134, 149 - Backlog: §3 harness item 'author sees the wiki' (line 149), §2.G extraction accuracy (93-108) and §2.I interview strategy (123-134), §1 re-run on a new date (32)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 106-107, 269 - Evidence: duplicate facts approved and a card rejected then approved (line 269); interview extractor sees only card names, 12 of 72 duplicates in haiku ko (line 106); name-cut rejections (107)

Open questions:
- What should the author do with a candidate it rejected earlier? The specs do not say whether rejected items are suppressed from later extraction or only shown to the author. A decision is needed for HX3 (author-side memory) and for the product extractor (backlog §2.G), and the two should agree.
- Should the author's judgment summary (spec §6.4 line 173) be a short per-run list of prior decisions with reasons, or the full approved wiki? The spec says 'summary' and the author guide says 'approved wiki'. Both are already in the design; the choice of granularity is open.
- author.md (lines 22 and 48) forbids the author from using anything but the bible, the guide and the pending file, but the guide (line 7 in both languages) allows the approved wiki as a basis. Should author.md be changed to match the guide? The spec supports that, but it is a contract change that the author prompt and any test must follow together.
- Does a fake author need a duplicate-aware rule for HX3 tests, or should the duplicate path be tested with a separate fixture so the existing --fake flow tests (spec §10 line 315; plan line 498-500) keep their current meaning?
- author.md:12 hardcodes /Users/taehyeong/Documents/GitHub/DaeumHwa, which is not this machine's path (/home/xogud/documents/github/DaeumHwa). Should it be made relative to the repo root before HX3 runs here?

## survey:HX3:tests

TRACK HX3 test map (read-only survey, nothing run, nothing edited). Repo root: /home/xogud/documents/github/DaeumHwa. Paths below are repo-relative with line numbers.

WHY THE AUTHOR IS BLIND (confirmed in code and docs)
- The author sees only pending.json. Proposal items carry only {id, type, payload}: eval/novel/author-io.ts:37-41 (ProposalItemSchema). The schema has no wiki or decision-history field: eval/novel/author-io.ts:61-111.
- The runner builds proposal pending items from listProposals (pending only) and toProposalItems: eval/novel/steps/interview.ts:113-129, eval/novel/steps/chapter.ts:326-348, eval/novel/steps/util.ts:253-259. No wiki list is read for the author.
- The author prompt forbids reading anything but pending.json, the bible and the guide: eval/novel/agents/author.md:18 (bible + guide), :22 ("the pending file carries the material you need. Do not look for more"), :48 ("Use only the bible, the author guide and what the pending file carries"), :60-61 (may not read config.json, state.json, calls/, other run dirs). So any wiki or history must be written by the runner into pending.json, not read by the author from disk.
- The author guide already assumes the author knows the approved wiki: eval/fixtures/novel/ko/author-guide.md:7 ("앱이 지금까지 승인한 위키") and :25 ("이미 있는 항목의 중복이 아니다"). The runner does not supply it, which is the gap. The eval README admits it: docs/eval/novel/README.md:131.
- Decisions are logged but never shown forward: logDecision appends to author-decisions.jsonl (eval/novel/author-io.ts:23, :249-253); settle() calls it (eval/novel/steps/util.ts:194-197). RunData has no decision-history field (eval/novel/state.ts:28-43).
- The setup seeds only naming rules, threads and the style card, so the wiki is empty until the interview fills it: eval/novel/steps/setup.ts:9-10, :27-64. No entries or facts are seeded.
- Backlog item: docs/eval/novel/follow-up-ai-improvement.md:149 ("작가가 위키를 보게 하기"). Evidence: docs/eval/novel/2026-10-18/summary.md:269 and luna-6-ko.md:142 (duplicate facts approved, e.g. 고아원 fact; a card rejected then re-approved in luna-6-ko/en).

PRODUCT-SIDE CONTEXT (not the eval author, but relevant to "rejected once, approved later")
- Extraction dedupe sees only active cards plus PENDING proposals: src/server/known-entries.ts:47 (eq(proposals.status,'pending')). Rejected proposals are invisible, so the AI can re-propose a rejected card. Interview extraction receives <known> with pending flag: src/ai/tasks/interview-extract.ts:17-20, :44-51. There is no <known_facts> for interview extraction; chapter-extract has one (src/ai/tasks/chapter-extract.ts:68-70).
- Rejecting only sets status and note; the wiki is untouched: src/server/proposals.ts:664-680.
- listProposals defaults to status 'pending' and accepts status: src/server/proposals.ts:59-65, :162-183.

EXISTING TEST FILES COVERING TOUCHED CODE
1. eval/novel/author-io.test.ts (vitest, node). Asserts: writePending/readPending round-trip (:130-133); readPending null when missing (:135-137); readAnswer null when absent (:139-142); valid answer read (:144-155); stale answer.json removed on new pending (:157-162); clearPending (:164-168); bad answers rejected with answer.rejected-N.json and answer.error.txt naming the problem: malformed JSON, kind mismatch, missing id, duplicate id (:171-212); numbering of rejected files (:214-222); logDecision appends JSON lines (:225-234); fakeAnswer returns schema-valid answers for every kind (:239-244); approves every proposal and accepts proofread/continuity (:246-258); draft usable quality 3 (:260-266); interview answer picks first bank entry sharing a word (:268-277); fallback to first bank entry (:279-283). Fixtures: `proposals` (:22-32), pendingFixtures (:47-114).
2. eval/novel/run.test.ts (vitest, forks, 120 s timeouts). Helpers: faultyClient (:58-86), draftsFailingAfter (:88-106), longDraftClient (:108-124), decisionKinds (:146-151). Asserts: 'fake run reaches done' 5 chapters, 12 interview_answer decisions, naming rules and threads seeded (:154-195); 'stops at pending without an author' (:197-215); external limit pause/resume (:217); three pauses block (:249); model failure recorded and skipped (:264); draft redo (:292); failed redo keeps earlier draft (:310); no-draft skip (:332); token-limit restore on close (:345); resume after chapter/answer/decision/completion commits that lost their marks (:361-453, esp. :416-435 'without approving twice'); over-long draft at proofread (:454); 'records a proposal that cannot be approved and applies the others' (:473-509, breaks payload to force VALIDATION); selectDraftEntries and applySuggestions (:511-530).
3. eval/novel/steps/finish.test.ts: speedSummary and mergedMs only (:23-105). Not affected.
4. eval/novel/state.test.ts: buildPlan order and state round trip (:36-85). Affected only if the plan changes.
5. eval/novel/cli.test.ts: resummarize, init, worker lock, formatStatus, advance with fake author end-to-end (:58-400). Uses readPending for pendingKind (cli.ts:63).
6. eval/novel/bible.test.ts: fixture parity ko/en (:12-96). Affected only if bible.json changes.
7. Product tests around interview and dedupe: src/server/interview.test.ts (answerTurn :200-348; naming and thread dedupe across answers :396-488, including 'the second answer sees the first pending card in its known list' asserting '- 노은하 (인물, 승인 대기)' :446-487 via RecordingAiClient :23-28; retry/duplicate question :588-626); src/server/known-entries.test.ts; src/ai/extraction.test.ts (dedupe rules :649-914); src/ai/tasks/interview.test.ts (prompt sections).
8. src/server/proposals.test.ts (approve/reject, BAD_STATE on second approve :466) and src/server/proposal-store.test.ts.

FACTORIES (src/test/factories.ts)
- createTestUser(db,{name,email}) :20; createTestWork(db,ownerId,{title,settings}) :33 (inserts owner member); addTestMember(db,workId,userId,role) :50; createTestChapter :59; createTestEntry(db,workId,{name,kind,aliases,summary}) :87 (kind default 'character'; no archivedAt option); createTestFact :105; createTestThread :132. Test DB: createTestDb from src/test/db.ts.

FakeAiClient AND ai-fakes WIRING
- src/test/fake-ai.ts: class FakeAiClient :19; options.overrides keyed by AiTaskName :10-13, :22-26; generateObject uses overrides first, then FAKE_OUTPUTS, else throws 'No fake output' :28-32, :46-52; streamText uses FAKE_TEXT (draft-chapter only) :34-44, :54-64.
- src/test/ai-fakes/index.ts: FAKE_OUTPUTS :14-23 (interview-question, interview-extract, chapter-extract, continuity-check, proofread, reader-sim, direction-advice, style-suggest); FAKE_TEXT :27-29 (draft-chapter).
- src/test/ai-fakes/interview-extract.ts: fakeInterviewExtraction :20-60 (name token into character card unless already known; planted thread from first 20 chars unless listed in threads; one fact).
- Eval runs wire the fake client through openRun({inner, autoAuthor}) (eval/novel/run.ts:107-137) and the author through ctx.autoAuthor = fakeAnswer(p, bible) (run.ts:137, called synchronously at :192-195). Test-only overrides are set by assigning ctx.autoAuthor (run.test.ts:296-300, :314-318).
- eval/novel/fake-author.ts: fakeAnswer(p, bible) :7-63. Approves every proposal item (:25-33), accepts every proofread and continuity item (:36-53), usable quality 3 (:34-35). It ignores wiki state; its signature is synchronous and bible-only.
- Eval exact vitest command: pnpm vitest run eval/novel/author-io.test.ts eval/novel/run.test.ts eval/novel/state.test.ts eval/novel/cli.test.ts --maxWorkers=2. Product side: pnpm vitest run src/server/interview.test.ts src/server/known-entries.test.ts src/ai/extraction.test.ts src/ai/tasks/interview.test.ts --maxWorkers=2. Vitest include covers eval/**/*.test.ts (vitest.config.ts:8-10). setupFiles: src/test/setup.ts.

NEW TEST CASES THAT MUST EXIST (name | input | expected)
A. eval/novel/author-io.test.ts
 1. "pending proposals keep the wiki snapshot and prior decisions" | writePending then readPending of a proposals item with `wiki` {entries:[{name:'해연',aliases:[],kind:'character'}], facts:[{content:'...'}]} and `priorDecisions` [{name:'봉인',approve:false,reason:'...'}] | toEqual same object (guards z.object stripping unknown keys, author-io.ts:37 and :191-197).
 2. "readPending still reads a pending item written before the change" | a legacy proposals item with no wiki field | parses, wiki defaults to empty (or readPending does not throw) — proves new fields are optional.
 3. "a proposal whose name matches a wiki card carries duplicateOf" (if the guard is code-side) | items with name '해연' and wiki entry '해연' | item.duplicateOf equals the entry id/name.
 4. "readAnswer rejects approve:true on an item flagged duplicateOf" (only if code guard chosen) | pending with duplicateOf item, answer approve:true | returns null, answer.error.txt contains 'duplicate'.
 5. "fakeAnswer keeps approving unflagged items and does not change for duplicate-free input" | existing proposals fixture | same as current (:246-253) still passes.
B. A new unit for the snapshot builder (e.g. eval/novel/author-wiki.test.ts; the builder would read ctx.db via listEntries/listFacts/listThreads/listRelations/listProposals in src/server/wiki.ts:97, facts.ts:112, threads.ts:155, relations.ts:104, proposals.ts:162)
 6. "empty snapshot for a fresh work" | createWork with no entries | entries [] and facts [] (setup seeds none, setup.ts:9-10).
 7. "snapshot lists active cards and facts and leaves out archived ones" | createTestEntry 'A' plus archived 'B' (set archivedAt directly, factories lack the option), createTestFact on A | entries contain A only; fact contents included.
 8. "snapshot is a viewer read and never writes" | run with a viewer actor or check no change_log rows added | no new rows.
C. eval/novel/run.test.ts (ctx.autoAuthor left unset, pending read from disk, as in :197-215)
 9. "the proposals pending item shows cards approved on earlier turns" | makeRun(dir,1,2); FakeAiClient with interview-extract override that proposes '노은하' on turn 1; answer turn 1 approve; run to turn 2 proposals | readPending(dir).items wiki contains '노은하' (before the duplicate can be approved).
 10. "a card rejected on turn 1 appears as prior rejection on turn 2" | interview-extract override proposes '노은하' on both turns; reject on turn 1 via answer.json | turn-2 pending item priorDecisions includes {name:'노은하', approve:false}, or the item carries previouslyRejected:true.
 11. "the author decision history is written into the pending item, not read from disk by the author" | same as 10 | author.md unchanged rule; assert the pending file contains the history and the test does not require the author to open author-decisions.jsonl.
 12. "fake run still reaches done with the snapshot added" | existing 'fake run reaches done' (:154-195) | still done, 12 interview decisions, 5 chapters.
 13. "resume after a decision commit keeps the same pending identity" | existing :416-435 | pendingKey unaffected (step|kind|'' for proposals, util.ts:167-170).
D. Product-side (only if HX3 is scoped to cover the app too)
 14. "rejected proposals are passed to interview extraction as known" | src/server/interview.test.ts: reject a card, next answer's prompt contains it | <known> marked as rejected; currently known-entries.ts:47 excludes it.
 15. "a rejected card is not proposed again" | extraction returns the same rejected name | no new entry_create.

EXISTING TESTS THAT WOULD BREAK, AND WHY
- eval/novel/author-io.test.ts: any NEW REQUIRED field on the proposals variant of PendingSchema (author-io.ts:72-79) makes writePending or readPending throw for fixtures that lack it. Affected: :131 (writePending(proposals)), :140, :145, :158, :165, :203-212 (bad-answer loop), :236-244 (PendingSchema.safeParse on pendingFixtures). Mitigation: make the new fields optional (or add them to the fixtures).
- eval/novel/author-io.test.ts :132 and :210 (toEqual round-trip) would fail if a new field is present in the object but missing from PendingSchema, because z.object strips unknown keys (author-io.ts:191-197 returns parsed.data).
- eval/novel/author-io.test.ts :246-253 would break only if fakeAnswer starts rejecting flagged duplicates (fake-author.ts:25-33) or changes its signature (it is called as fakeAnswer(p, bible) at run.ts:137 and at run.test.ts:209, :300, :318, :494). Signature change needs updates in all of these.
- eval/novel/run.test.ts :473-509 (refused-payload test) would break if the guard starts rejecting approvals before the product refuses them (expects state.failed VALIDATION and status 'approved' for the rest).
- eval/novel/run.test.ts :154-195 expects exactly 12 interview_answer decisions; it breaks if the interview step adds or removes questions or if decision logging changes shape.
- eval/novel/state.test.ts :36-61 pins the plan; it breaks only if plan steps are added.
- Product tests: src/server/interview.test.ts :446-487 pins the '- 노은하 (인물, 승인 대기)' known-line format, so changing the known-list format breaks it. src/ai/extraction.test.ts and src/ai/tasks/interview.test.ts pin prompt sections, so adding <known_facts> or rejected lines to interview-extract breaks prompt snapshot-style asserts only if they check exact text.

OPEN QUESTIONS
- Dedupe in code (flag duplicateOf and refuse approve) or in the author's judgment only? The guide already says duplicates are rejected (fixture author-guide.md:25); the backlog wants code checks too (follow-up-ai-improvement.md:149, :151).
- Should a card rejected earlier be auto-flagged for the author, or left to the author's own memory? A rejected card is invisible to product extraction (known-entries.ts:47), so only the runner's decision log can carry it.
- Snapshot size: the full wiki in every pending item grows with the run; scope it to the cards named in the item (name or alias match) or send the whole list?
- The product path is out of scope for an eval-only track unless the user widens HX3. Items 14-15 are optional.
- The author.md "Do not read other run dirs" rule means the snapshot must be in pending.json. This needs a prompt change at author.md:18/:22/:48 and the table in :31-38 if a new field is shown.
- No test currently checks author.md against the PendingSchema fields. Consider adding one.

Files:
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - Author agent prompt: inputs, steps, judgment rules; forbids reading anything beyond pending.json, bible and guide (lines 18, 22, 48, 60-61).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts`  - File protocol: PendingSchema (61-111), ProposalItemSchema (37-41), readPending strips unknown keys (191-197), readAnswer validation (204-214), logDecision to author-decisions.jsonl (249-253).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/interview.ts`  - Interview step: interview_answer pending (84-94), proposals pending from listProposals (113-129), decisions applied (136).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/setup.ts`  - Seeds only naming rules, threads and style card; wiki starts empty (9-10, 27-64).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts`  - Deterministic stand-in author: approves all proposals, bible-only, sync signature (7-63).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - consult/settle/pendingKey/applyProposalDecisions/toProposalItems (167-259).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - Post-chapter proposals pending item (326-359).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts`  - RunContext (39-52), openRun with ctx.db (107-146), autoAuthor call site (137, 190-195).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts`  - RunData has no decision-history field (28-43).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.test.ts`  - Existing pending/answer/fakeAnswer tests (1-284); fixtures at 22-114.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts`  - Step machine tests with FakeAiClient faults and autoAuthor (1-530).
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/author-guide.md`  - Author judgment rules; line 7 presumes the approved wiki, line 25 duplicate rule.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog; section 3 line 149 is the HX3 item.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md`  - Line 131 documents the author-blindness limit.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Evidence: duplicate approvals and card rejected then approved (lines 106, 269).
- `/home/xogud/documents/github/DaeumHwa/src/server/known-entries.ts`  - Product dedupe sees only pending proposals, not rejected ones (line 47).
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts`  - approve/reject (618-680); listProposals default pending (162-183).
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts`  - FakeAiClient with overrides and FAKE_OUTPUTS/FAKE_TEXT registry (19-64).
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts`  - Fixed outputs per AiTaskName (14-29).
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/interview-extract.ts`  - Fake interview extraction output (20-60).
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts`  - createTestUser/Work/Member/Chapter/Entry/Fact/Thread helpers (20-132).
- `/home/xogud/documents/github/DaeumHwa/src/server/interview.test.ts`  - Interview product tests incl. known-list dedupe (396-487) and RecordingAiClient (23-28).
- `/home/xogud/documents/github/DaeumHwa/vitest.config.ts`  - Include globs for eval and src tests (8-10).

Open questions:
- Should the duplicate guard be code-side (flag duplicateOf and refuse approve:true) or author-judgment only? The guide already requires rejecting duplicates (eval/fixtures/novel/ko/author-guide.md:25).
- Should earlier rejections be flagged to the author by the runner (priorDecisions or previouslyRejected), or left to the author's own memory? Product extraction cannot see rejected proposals (src/server/known-entries.ts:47).
- How much wiki to embed in each pending.json: the full list, or only cards whose name or alias appears in the item?
- Is HX3 limited to the eval harness? Test cases D14-D15 apply only if the product extraction path is in scope.
- author.md forbids reading run files (author.md:60-61), so the snapshot must be written into pending.json. Confirm the prompt change at author.md:18, :22, :48 is in scope.


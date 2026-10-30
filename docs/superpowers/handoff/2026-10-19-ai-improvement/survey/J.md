# Track J: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:J:code

TRACK J code map (read-only survey, no files changed).

Current state, verified in code:
- The prompt has no "표준어 규범 위반만" wording and no explicit "empty list is fine" line. It says only: 대사 속 구어체·사투리·인물 말투·의도된 비문은 고치지 않고, 문체를 바꾸는 제안은 하지 않는다 (src/ai/tasks/proofread.ts:29). The kind enum still includes 'awkward' (proofread.ts:9, 17, 30). An empty list is allowed by the schema (proofread.ts:13-20) and is what the fake returns (src/ai/tasks/proofread.test.ts:26). The string 표준어 appears nowhere under src/ or e2e/.
- Duplicate and multi-location handling: aiSpellChecker maps each model suggestion through locateQuote without a hint (src/server/chapter-check.ts:88-100). locateQuote returns only the first exact occurrence (src/lib/korean/sentences.ts:63-80). So every suggestion for a repeated quote points at the first occurrence only. runProofread does not dedupe AI suggestions; it only drops ones overlapping rule suggestions (src/server/chapter-check.ts:378-383).
- Eval path: the proofread step turns each suggestion into a review item with id = array index (eval/novel/steps/chapter.ts:207-214). Accepted decisions are mapped back by index (chapter.ts:231-234). applySuggestions (eval/novel/steps/util.ts:283-306) keeps only non-overlapping spans (edge check at util.ts:297), so a duplicate with the same start is dropped. This is why the qwen run left the second 4층이상은 (docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md:286-300; both suggestions pointed at 585-590, the 67행 occurrence stayed).
- Evidence: summary.md:243 (Track 10 row: luna ko 1/4, luna en 0/4, haiku ko 0/1); luna-6-en.md:8, 24 (4 suggestions, all kind awkward, none accepted); luna-6-ko.md:33, 278.

Data flow (entry to AI and back):
1. Entry (UI): ProofreadPanel.runAi (src/components/writing/panels/proofread-panel.tsx:83-95) POSTs {text, useAi:true} to the route. runRules (lines 70-81) uses useAi:false.
2. Route: src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.ts:9-21 validates with ProofreadBodySchema (src/app/api/works/[workId]/chapters/shared.ts:17-21) and calls runProofread(db, actor, {chapterId,...input}, undefined, signal).
3. Server action alternative: src/server/actions/checks.ts:19-22 (schema), 36-43 (runProofreadAction calls runProofread).
4. Service: runProofread (src/server/chapter-check.ts:356-385). Length cap at 365-370 (MAX_PROOFREAD_AI_CHARS=30000, line 51). Rule pass 372. AI pass via aiSpellChecker 373-376. Overlap filter and sort 378-383.
5. AI call: aiSpellChecker.check (chapter-check.ts:84-102) calls runAiTask(db, meta, proofreadTask, {text}, client) (src/ai/run.ts; postProcess runs at run.ts:109 before return).
6. Task: proofreadTask (src/ai/tasks/proofread.ts:35-52). effort medium, maxTokens 16000. postProcess (42-52) drops empty quotes and replacement===quote, then locates each quote and re-slices it from the manuscript. postProcess has no offsets input for occurrences, so it can dedupe by quote+replacement but cannot emit one item per occurrence.
7. Back to UI: items with start/end go to highlights (proofread-panel.tsx:50-62, rangeOf with item.start) and apply (97-107, api.replaceQuote(quote, replacement, start)). replaceQuote lives at writing-workspace.tsx:114-115 and text-ops.ts:20-32. Note text-ops.ts:28-29: if the hint misses, it falls back to indexOf, so a duplicate item would hit the next occurrence in the UI.
8. Eval: eval/novel/steps/chapter.ts:182-247. Call at 197 (runProofread with useAi:true). Item mapping 207-214. Author decision 225-234. applySuggestions 235. settle (logs author-decisions.jsonl via logDecision) at 246; settle is at eval/novel/steps/util.ts:194-197.

Where the new behavior hooks in (smallest diff, no signature change):
(a) Prompt wording: edit PROOFREAD_SYSTEM at src/ai/tasks/proofread.ts:25-33 (add the 표준어 규범 rule and an empty-list line; optionally drop 'awkward' from the instruction list). Update assertions in src/ai/tasks/proofread.test.ts:11-13. Keep TAG_DATA_RULE (line 32) and tests at proofread.test.ts:62-64.
(b) Dedupe same quote+replacement: in proofreadTask.postProcess (src/ai/tasks/proofread.ts:42-52), skip a suggestion whose quote+replacement pair was already kept. Test pattern: proofread.test.ts:40-51.
(c) Apply to every location: in aiSpellChecker.check (src/server/chapter-check.ts:88-100), replace the single locateQuote call with a loop over all exact occurrences of s.quote (indexOf loop), emitting one ProofreadSuggestion per occurrence with the same reason and replacement. Fall back to locateQuote for the whitespace-normalized case (sentences.ts:82-87) when there is no exact hit. The eval already handles per-occurrence spans safely (util.ts:297). The UI already applies one item at a time by start (proofread-panel.tsx:97-107). runProofread's overlap filter (chapter-check.ts:378-383) stays as is.
(d) Metric: no code exists for the proofread acceptance ratio (grep for accept/수용 under eval/novel hits only chapter.ts:231-232, fake-author.ts:36-45, author-io.ts:133-134, and the author agent rule at eval/novel/agents/author.md:54). The ratio can be computed from chapters/NN.proofread.json and author-decisions.jsonl. If the metric should count per quote rather than per occurrence after (c), decide the unit before measuring.

Signature changes and call sites (only if the signature changes; none needed for (a)-(c)):
- runProofread (chapter-check.ts:356): route.ts:19, src/server/actions/checks.ts:41, eval/novel/steps/chapter.ts:197, src/server/chapter-check.test.ts:340, 363, 395, 507, 524, src/server/actions/checks.test.ts:42, 51.
- proofreadTask / ProofreadSchema: e2e/ai-stub/responders.ts:41, e2e/ai-stub/stub.test.ts:44-52, e2e/ai-stub/responders.test.ts:138, src/server/interview.test.ts:188 (task name only), eval/novel/eval-client.ts:8, 115, eval/novel/fake-author.ts:36-45.
- ProofreadKind (if 'awkward' is removed from the enum, a larger change): proofread.ts:9-10, 17; chapter-check.ts:8, 38, 53-57; proofread-panel.tsx:27, 33-38 (KIND_LABEL). Not recommended for the first pass.

Tests to extend: src/ai/tasks/proofread.test.ts (system wording 8-14; postProcess 29-51); src/server/chapter-check.test.ts:337-400 (runProofread, scripted AI client, duplicate-collision case at 360-); 497-530 (length cap, unchanged). eval/novel/steps/finish.test.ts:84-87 (proofread timing, unaffected).

Open questions:
- Per-occurrence items (c) change the number of review items and the author-decision ids, so the acceptance denominator changes. Decide whether the metric counts per occurrence or per quote.
- Should the UI group same-quote items into one card ("2곳")? Not required for the eval; a UX choice.
- The app prompt is not the author agent's rule. The author agent already rejects style changes (eval/novel/agents/author.md:54), so the Luna 0/4 is a producer-side problem, which (a) addresses.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 9-10, 12-23, 25-33, 35-52 - Prompt (PROOFREAD_SYSTEM 25-33: no 표준어 rule, no empty-list line; 'awkward' kind at 9/17/30) and task def. postProcess 42-52 is the place to dedupe same quote+replacement pairs. Hook (a) and (b).
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 34-42, 44-48, 51, 74-104, 352-385 - ProofreadSuggestion type (34-42); SpellChecker (44-48); aiSpellChecker.check (84-102) calls locateQuote once per suggestion, so repeated quotes map to the first occurrence only (88-100). Hook (c): emit one suggestion per occurrence here. runProofread (356-385): length cap 365-370, AI call 373-376, overlap filter 378-383. Signature stays unchanged.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts` 63-88 - locateQuote: first exact occurrence (71-80), optional hint, whitespace-normalized fallback (82-87). Used by proofread.ts:46 and chapter-check.ts:89. No all-occurrences helper exists; add one here or inline an indexOf loop in chapter-check.ts.
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 82-130 - runAiTask: calls the model with task.schema/effort/maxTokens (101-103) and applies task.postProcess (109) before returning the output. Confirms dedupe in postProcess runs before aiSpellChecker.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.ts` 1-21 - HTTP entry for the writing screen; calls runProofread at 19 with undefined client and the request signal. Caller, no change needed if the signature is kept.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/chapters/shared.ts` 14-21 - PROOFREAD_TEXT_MAX_CHARS (17) and ProofreadBodySchema (20-21): body validation for the route and the action.
- `/home/xogud/documents/github/DaeumHwa/src/server/actions/checks.ts` 19-22, 36-43 - runProofreadAction (server action wrapper): schema 20-22, calls runProofread at 41. Second entry point; no change needed if the signature is kept.
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/proofread-panel.tsx` 23-31, 50-62, 68-95, 97-107 - Client: ProofreadItem mirror type (23-31, must follow any kind change), highlights from item.start (50-62), request for AI pass (83-95), per-item apply via replaceQuote with item.start (97-107). Per-occurrence items work with no change here.
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/text-ops.ts` 16-32 - replaceQuoteText: uses hintStart when text.startsWith(quote, hint), else indexOf (28-29). A duplicate item after the first apply would therefore hit the next occurrence.
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/writing-workspace.tsx` 114-115 - replaceQuote API method that calls replaceQuoteText.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 182-247 - Eval proofread step: runProofread call (197), review items with id = index (207-214), author decisions mapped to suggestion indexes (231-234), applySuggestions (235), settle (246). Per-occurrence items are safe here.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 194-197, 280-306 - settle/logDecision (194-197) and applySuggestions (283-306). The edge filter (296-299) drops a second suggestion with the same start, which is why the qwen duplicate left a second occurrence unfixed.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 23, 43-50, 92-95, 133-135, 151-158 - DECISIONS_FILE (23), ProofreadItemSchema (43-50), proofread request and decision schemas (92-95, 133-135). Decisions are per item id, so per-occurrence items change the denominator of the acceptance metric.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 36, 54 - Author agent rule: accept only real spelling, spacing or grammar fixes; reject style or meaning changes (54). The producer-side fix is (a).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 36-45 - Fake author accepts every proofread item. Needs no change for per-occurrence items.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.test.ts` 8-14, 16-27, 29-51, 56-65 - Tests for system wording (10-13, update if the prompt changes), empty-list fake (26), postProcess locate and replacement-equal cases (29-51, add a dedupe case), prompt isolation (56-65).
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.test.ts` 337-400, 497-530 - runProofread tests: rule-only (338-358), collision with scripted AI client (360-), length cap (497-530). Add a per-occurrence test here.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 41 - E2E stub proofread responder returns an empty suggestion list; no change needed.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 130-143 - Track J backlog entry (J, 맞춤법 범위): the prompt wording and the same-quote merge requested for this track.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 239, 243 - Evidence for Track J: row 10 (luna ko 1/4, luna en 0/4, haiku ko 0/1, qwen duplicate).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 286-300 - Evidence: the duplicate 4층이상은 suggestion pointed at the first occurrence (585-590) and the 67행 occurrence stayed.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md` 8, 24 - Evidence: 4 suggestions, all kind awkward, none accepted; no spelling error in the chapter.

## survey:J:evidence

TRACK J evidence survey (read-only). Repo: /home/xogud/documents/github/DaeumHwa.

## 1. What the backlog asks for (docs/eval/novel/follow-up-ai-improvement.md:136-142)
- Problem: cloud models proposed style edits (Luna en 0 of 4 valid); qwen proposed the same location twice so the second identical error stayed.
- Fix: put "표준어 규범 위반만 고친다" in the prompt, allow an empty list, merge the same quote and apply it to every location.
- Metric: "맞춤법 제안 수락 비율" (proofread suggestion acceptance ratio).

Current product prompt does NOT contain that wording:
- src/ai/tasks/proofread.ts:25-33. Line 29 says only "문체를 바꾸는 제안은 하지 않는다". Line 30 still offers `awkward` as a kind. No sentence allows or asks for an empty list.
- src/ai/tasks/proofread.ts:9 and :17: `awkward` is in the enum, so the schema accepts style suggestions.
- eval/novel/localize/en-systems.ts:31-40 (PROOFREAD_SYSTEM, English harness) has the same gap: "Do not suggest changes that alter the style" but `awkward` stays and there is no empty-list rule.
- Spec intent: docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:180 "실제 오류를 고치는 제안만 수용한다", and :295 defines the metric as "맞는 제안과 틀린 제안의 비율".

## 2. Failure evidence per run (proofread only)
| Run | Raw suggestions | Valid (reviewer) | Author accepted | Time / tokens | Source |
|---|---|---|---|---|---|
| haiku ko | 1 (kind awkward) | 0/1 | 0/1 (rejected) | 26.3 s | haiku-5.5-ko.md:225; summary.md:121-124 |
| haiku en | 3 (all spelling) | 3/3 by reviewer, though 2 are gray/grey consistency fixes | 3/3 | 13.2 s | haiku-5.5-en.md:91 |
| luna ko | 4 (all awkward) | 1/4 | 1/4 | 23.1-32.3 s | luna-6-ko.md:156-168 ("맞는 제안 1, 틀린 제안 3(25%)") |
| luna en | 4 (all awkward) | 0/4 | 0/4 | 23.1 s | luna-6-en.md:137-138 ("Valid errors found: 0 of 4") |
| qwen ko | 6 in calls/029; product drops no-op `깃을` (proofread.ts:45), so 5 shown | 3 distinct valid of 6 | 4 accepted, 1 rejected per review | 1,497.4 s (first call 1,217.8 s failed at 32,000-token cap); 18,899 output tokens | qwen3.8-27b-ko.md:284-300, :341, :343 |
| qwen en | 0 (empty list, arguably correct) | n/a | n/a | 696 s, 11,800 output tokens | qwen3.8-27b-en.md:137-139, :172 |

Quotes:
- qwen ko, duplicate: "본문에는 이 말이 2번 있는데(19행, 67행) 두 제안 모두 첫 번째 위치(585~590)를 가리켜서 67행이 그대로 남았다" (qwen3.8-27b-ko.md:292).
- qwen ko, decision numbering inconsistency: the text says "작가의 수용은 4건(0, 1, 2, 4번), 거절 1건(3번)", but the table in the same section lists 옮겼다 as rejected (qwen3.8-27b-ko.md:287-292). The index mapping does not match. Treat the qwen ko acceptance count as uncertain.
- Luna en, no-error text: "By my own read the text has no real errors, so the ideal output is an empty list." (luna-6-en.md:138).
- Summary, product-rule candidate: "맞춤법: '표준어 규범 위반만, 문체 취향 제외'를 못 박고 빈 목록을 허용한다. 같은 quote는 합치고 모든 출현 위치에 적용한다" (summary.md:243).

Aggregates (computed from the rows above):
- Cloud, 4 runs: valid 4/12 = 33%, author accepted 4/12 = 33%. Cloud invalid suggestions: haiku ko 1, luna ko 3, luna en 4 (8 of 12 are invalid or rejected).
- Qwen ko: 6 raw, 3 distinct valid (50%); 1 duplicate pair left one real error (67행 `4층이상은`) unfixed.
- Qwen en: no suggestions, so no ratio.

## 3. Code path behind the duplicate-quote bug
- src/ai/tasks/proofread.ts:42-51 (postProcess): drops empty quote and replacement===quote (:45). It calls `locateQuote(input.text, s.quote)` with no hint (:46). No dedupe of identical quote+replacement.
- src/lib/korean/sentences.ts:70-79: without a hint, `locateQuote` returns `exact[0]`, the first occurrence. Every duplicate of a quote resolves to the same start.
- src/server/chapter-check.ts:85-95 (aiSpellChecker): same call with no hint (:89). Unmatched quotes are silently dropped (:90 `if (!range) continue`), with no count.
- eval/novel/steps/util.ts:283-303 (applySuggestions): sorts by start and drops any span overlapping an earlier kept span (`if (s.start < edge) continue`). Two suggestions with the same start means the second is dropped, so the later occurrence is never fixed.
- Consequence: "apply to every location" needs a code change (for example, one suggestion per occurrence or a start per occurrence), not only a prompt change.
- eval/novel/steps/chapter.ts:182-246 (proofread step): accepted decisions map to `suggestions[Number(d.id)]`, and the text is rebuilt with applySuggestions. Saved as `chapters/NN.md`.

## 4. Metrics: what the harness measures today
- eval/novel/metrics.ts:3-15 has no proofread metric. chapterMetrics (:41-82) covers T3 length, T4 meta lines, T5 foreign runs, T7 ending. There is no T6 count.
- T6 is judged by the reviewer by hand: eval/novel/agents/reviewer.md:42 and :53 ("proofread (ratio of valid to invalid suggestions)").
- Author decisions are written to `author-decisions.jsonl` in the run directory (eval/novel/author-io.ts:23). No aggregator in eval/novel/steps/finish.ts or metrics.ts computes acceptance. finish.ts:38-111 only has per-task call counts, tokens and time.
- The author is an LLM agent with the rule "accept only fixes of real spelling, spacing or grammar errors. Reject style or meaning changes" (eval/novel/agents/author.md:54). So "acceptance" is a proxy for validity, and the reviewer's valid count is the ground truth.
- Recall cannot be measured: luna-6-en.md:227 says "Continuity recall and proofread recall cannot be measured on this chapter because it has no planted errors and no real spelling errors." No planted-error proofread fixture exists in eval/fixtures/novel/*.

## 5. Proposed acceptance criteria (targets are proposals, not in the sources)
1. Acceptance ratio = author-accepted unique fixes / suggestions returned after dedupe. Current: cloud 4/12 (33%); qwen ko 3-4 of 5 (uncertain). Target: at least 0.8 for cloud on the same chapter set. Harness: join `chapters/NN.proofread.json` items (id, quote, kind) with `author-decisions.jsonl` `decisions[].accept`. Automatable with a small script in eval/novel/metrics.ts. Note: this is currently missing.
2. Invalid suggestions per chapter (author rejects): current haiku ko 1, haiku en 0, luna ko 3, luna en 4, qwen ko 1, qwen en 0. Target: 0 on chapters with no real error. Harness: same join, count `accept: false`. Missing aggregator.
3. Style share: count of `kind: awkward` per chapter. Current: luna ko 4 of 4, luna en 4 of 4, haiku en 0 of 3, haiku ko 1 of 1. Target: 0 awkward unless the text has a clear grammar problem. Harness: automatic from proofread.json `kind`. Needs no new code, only a metric.
4. Duplicate-quote count: number of suggestion pairs with the same quote, plus uncovered occurrences (occurrences of the quote in the text beyond the one suggested). Current: qwen ko 1 pair (67행 uncovered). Target: 0 pairs, 0 uncovered. Harness: automatic from proofread.json and chapters/NN.draft.md (count `text.split(quote).length - 1` against suggestions with that quote). Missing.
5. Locate-failure count: number of AI quotes that `locateQuote` could not find (currently dropped silently at chapter-check.ts:90). Target: 0 after prompt changes. Harness: must be logged; not recorded now. Missing.
6. Empty-list correctness on clean text: qwen en returned `[]` (correct) at 696 s and 11,800 output tokens (qwen3.8-27b-en.md:172). Target: empty output on clean text with output tokens under a bound (for example 1,000). Harness: needs a clean-text fixture with a recorded "no real error" label; the reviewer currently sets this by hand.
7. Real-error recall (T6 recall): not measurable. Current: undefined (no planted errors). Target: at least 80% of planted spelling, spacing and grammar errors in a planted fixture. Harness: needs a new fixture under eval/fixtures/novel/ko and en with a planted-error list, plus a recall counter in metrics.ts. Missing.
8. Time and tokens for proofread: qwen ko 1,497.4 s and 18,899 output tokens; qwen en 696 s; cloud 13-32 s. Target: under the 120 s product limit for each call, or split (summary.md:239 and follow-up-ai-improvement.md:84-91 propose a 3-way split). Harness: available in run-summary.json `byTask` (finish.ts:38-70) and `wouldTimeOut` (finish.ts, see qwen3.8-27b-ko.md:343).

## 6. Missing metrics (to add)
- Acceptance and invalid counts (criteria 1-2): no aggregator; the join between proofread.json and author-decisions.jsonl is not implemented.
- Duplicate-quote and uncovered-occurrence counts (criterion 4): not computed.
- Locate-failure count (criterion 5): dropped silently at src/server/chapter-check.ts:90 and not recorded.
- Planted-error proofread fixture and recall (criterion 7): does not exist.
- Awkward share (criterion 3) and empty-list correctness (criterion 6): computable from the existing files but not reported.

## 7. Open questions / caveats
- The author rule "real errors" includes gray/grey consistency (haiku en, 2 of 3 suggestions). The reviewer counted those valid (haiku-5.5-en.md:91). The rubric should say whether consistency fixes count as real errors.
- The qwen ko decision numbering does not match its table (see section 2). Re-read author-decisions.jsonl (not in this repo) before using the 4/5 figure.
- The author is an LLM. Its acceptance is a proxy, not a human judgement.
- The product prompt also needs a fix for `awkward` (proofread.ts:30), and the en harness prompt needs the same (en-systems.ts:31-40). Both are in scope for J.
- Not checked: src/components/writing/panels/proofread-panel.tsx apply path (line 97-111 uses replaceQuote with the item's start, which is the first occurrence). Duplicates therefore still resolve to one place in the UI.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - backlog item J at lines 136-142; section 3 metrics at 146-156
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - 2.4 맞춤법 at lines 119-126; per-feature table at line 73; candidate 10 at line 243
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - 맞춤법 3점 and rejected awkward suggestion at lines 223-228
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - proofread 3 of 3 valid at lines 21, 73, 91
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - 2.5 맞춤법 1 of 4 valid at lines 154-168; candidate 9 at line 278
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - proofread 0 of 4 valid at lines 24, 137-138; no-recall note at line 227
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - 3.5 맞춤법 duplicate and numbering at lines 284-300; operations at lines 341-343; candidate 8 at line 414
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - 3.4 proofread empty list at lines 137-139; call time and tokens at line 172
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - product prompt lines 25-33 (no 표준어 rule, no empty-list rule, awkward allowed at line 30); schema lines 9-21; postProcess lines 42-51 (no dedupe; locateQuote without hint at line 46)
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - aiSpellChecker lines 85-95 (locateQuote without hint at line 89; silent drop at line 90); runProofread lines 353-385
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts`  - locateQuote lines 63-88 (returns first occurrence when no hint, lines 74-79)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - applySuggestions lines 283-303 (overlap drop at line 296-297 means a duplicate start is never applied twice)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - proofread step lines 182-246 (decisions map to suggestion index, then applySuggestions)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts`  - PROOFREAD_SYSTEM lines 31-40 (English harness prompt, same gap)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - chapterMetrics lines 3-82; no proofread or acceptance metric
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - run summary byTask and per-call metrics lines 38-115; no acceptance aggregation
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts`  - ProofreadItemSchema lines 43-50; DECISIONS_FILE line 23 (author-decisions.jsonl)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - proofread decision rule line 54 (accept only real errors)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md`  - T6 per-chapter metric line 42; proofread ratio line 53
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - design intent: line 180 (accept only real errors), line 295 (valid vs invalid ratio)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/proofread-panel.tsx`  - apply path lines 97-111 (replaceQuote by item start; duplicates still map to one place)

Open questions:
- Does a gray/grey or other consistency fix count as a 'real spelling error' under the author rule (haiku-5.5-en.md:91 counts it valid)? The rubric must decide before the acceptance target is set.
- qwen3.8-27b-ko.md:287-292 numbers the accepted and rejected decisions (0,1,2,4 accepted; 3 rejected) differently from its table, so the qwen ko acceptance count is uncertain. Re-read author-decisions.jsonl (run directory, outside this repo) to confirm.
- Acceptance targets (0.8 cloud, 0 invalid on clean text, 80% planted-error recall) are proposals; the sources give no numeric target.
- Real-error recall needs a planted-error proofread fixture that does not exist yet under eval/fixtures/novel.
- Fixing the duplicate-quote miss needs a code change (per-occurrence start or dedupe in src/ai/tasks/proofread.ts postProcess and src/server/chapter-check.ts), not only a prompt change. Confirm the scope before the track starts.

## survey:J:risks

TRACK J survey (read-only). Findings are cited path:line in the repo at /home/xogud/documents/github/DaeumHwa.

## 1. Current state of Track J (confirmed in code)
- The system prompt is src/ai/tasks/proofread.ts:25-33. It says "대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다." (line 29) and "문체를 바꾸는 제안은 하지 않는다." (line 29). It does NOT contain "표준어 규범 위반만 고친다" and has no explicit "empty list is allowed" sentence. The schema already accepts an empty array (proofread.ts:13-20), and the fake returns an empty list (src/test/ai-fakes/proofread.ts).
- Merging is absent. postProcess (proofread.ts:42-51) drops empty quotes and no-op replacements, then locates each quote, but does not dedupe. aiSpellChecker (src/server/chapter-check.ts:83-98) calls locateQuote(text, s.quote) with no hint (line 90), which always resolves to the FIRST occurrence (src/lib/korean/sentences.ts:12-15). So two suggestions with the same quote both land on the same range. That explains the qwen duplicate (docs/eval/novel/2026-10-18/summary.md, the qwen ko line and row 10).
- Apply path: src/components/writing/panels/proofread-panel.tsx:38-48 applies one item via api.replaceQuote(quote, replacement, start). applyAllRules (lines 50-64) applies only rule items. There is no "apply to all occurrences" for AI items. replaceQuoteText (src/components/writing/text-ops.ts:25-31) uses the hint only if text.startsWith(quote, hint); otherwise it falls back to text.indexOf(quote), which can hit a different occurrence after an earlier replacement. This is a risk for duplicate items.
- Overlap rule: runProofread (src/server/chapter-check.ts:356-388) drops AI suggestions that overlap a rule suggestion, then sorts by start.
- Timeout: proofreadTask has no timeoutMs (proofread.ts:35-40), so the default 120 s applies (src/ai/run.ts:28, 93). Output cap maxTokens 16000 (proofread.ts:38). effort 'medium' (proofread.ts:37). The call is structured, not streamed (the 280 s stream limit is STREAM_AI_TIMEOUT_MS, run.ts:30, used only for drafts).
- Input limit: MAX_PROOFREAD_AI_CHARS = 30,000 (chapter-check.ts:50-51, enforced at 365-371 with a Korean VALIDATION message). The route body limit is 200,000 (src/app/api/works/[workId]/chapters/shared.ts:17).
- Prompt-injection: buildPrompt uses neutralizeTags(text) inside <manuscript> (proofread.ts:40), and TAG_DATA_RULE is in the system prompt (proofread.ts:32). Proofread does not use neutralizeDeep because its input is one string.
- The eval copy is separate: eval/novel/localize/en-systems.ts:31-41 (PROOFREAD_SYSTEM English mirror, "Do not suggest changes that alter the style.") is wired at line 150. eval/novel/eval-client.ts:115 registers proofreadTask with its time limit. e2e/ai-stub/responders.ts:41 matches the stub by proofreadTask.system, so a prompt change flows there automatically.
- Tests: src/ai/tasks/proofread.test.ts:8-12 asserts the prompt starts with "당신은 한국어 웹소설 교정자다." and contains the 구어체 sentence. Lines 14-30 cover fake output, unlocatable quotes, and replacement==quote. Adding the new rules must keep line 11-12 green; a dedupe test goes next to line 30.
- Acceptance metric: eval/novel/author-io.ts:92 and :133 hold the proofread decisions ({id, accept, reason}); the plan defines the metric at docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:385. I did not open the metric code (metrics.ts) and did not verify its exact formula.

## 2. Minimal public interface (proposal)
```ts
// src/ai/tasks/proofread.ts (J, prompt + canonical output)
export const ProofreadSchema: z.ZodObject            // unchanged shape: { suggestions: {quote, replacement, kind, reason}[] }
export const PROOFREAD_SYSTEM: string                // + "표준어 규범 위반만 고친다", "고칠 곳이 없으면 빈 배열", "같은 표현은 한 항목으로"
// postProcess(output, input): drops duplicates keyed by (quote, replacement); keeps first kind/reason.
// Does NOT expand occurrences (the task has no view of offsets across chunks).

// src/lib/korean/sentences.ts (shared with G1 quote verification)
export function locateAllQuotes(text: string, quote: string): { start: number; end: number }[]

// src/server/chapter-check.ts (J, expansion)
// aiSpellChecker.check(text): one ProofreadSuggestion per occurrence from locateAllQuotes(text, quote),
// each with its own start/end. ProofreadSuggestion's shape is unchanged, so proofread-panel.tsx keeps working.
```
Keeping one suggestion per location (not one suggestion with multiple ranges) avoids changing the UI type. Expansion in the service also means the panel's per-item apply still works.

## 3. Neighbour tracks (file overlap or dependency)
- F1 (proofread split in three): HIGH conflict. Same file and functions (proofread.ts, chapter-check.ts aiSpellChecker, runProofread). Split chunks lose global offsets, so dedupe and expansion must run AFTER chunk offsets are remapped to the whole text. J's expansion must not run per chunk. Sequence J's dedupe and locateAllQuotes into the F1 merge step, or land J first and make F1 call the same merge.
- HX2 (English substitution table): HIGH conflict on PROOFREAD_SYSTEM. en-systems.ts:31-41 must mirror any Korean prompt change. localize.test.ts:322-333 (EN_SYSTEMS non-empty, no Hangul) and :257 (proofread buildPrompt) must stay green. Adding the Korean rule without the English mirror breaks eval parity.
- E2 (sample-copy and repeated-word check) and E1 (paragraph rule): MEDIUM. If they add rule-based suggestions, they enter ruleSpellChecker (chapter-check.ts:57-66) and the overlap filter at 381-384. Their new kinds would hit RULE_KINDS (line 52-56) and the ProofreadKind enum (proofread.ts:9). Keep the kind enum stable.
- G1 (quote verification): MEDIUM. Shares locateQuote/locateAllQuotes in sentences.ts:63. One locator should serve both. The chapter-extract evidence rule (chapter-extract.ts:25, "한 글자도 바꾸지 말고") is the same idea.
- C (foreign-script block, T5): MEDIUM. A foreign-script detector may be added to the draft or the proofread path. The qwen 한자 misses were not caught by proofread (summary.md row 10). If C adds a proofread pass, it must go through the same dedupe and expansion.
- F4 (local server serialization, effort switch): MEDIUM. Changing effort for proofread (proofread.ts:37 'medium') changes qwen time and token usage. Qwen proofread hit the 32,000-token cap (summary.md line ~121).
- A, D, H, B, I, G2, F2, F3: no direct overlap with proofread files.
- GUARDS (src/ai/guards): the directory does NOT exist (checked: `ls src/ai/guards` fails). Any shared guard helper must be created by the guards track first. J's dedupe is a pure function and does not need the guards library.
- HX1 (reviewer blinding) and HX3 (author sees wiki): eval-side only. HX3 changes the author decisions that feed the J acceptance metric, so the baseline would shift.
- HX4 (small fixes): none on proofread.

## 4. CLAUDE.md invariants that apply to J
- Korean user-facing copy: the prompt output is Korean (proofread.ts:33). The English mirror is eval-only. Any new error text stays Korean ("교정할 원고가 너무 깁니다" pattern, chapter-check.ts:368-371).
- AppError codes: loadEditableChapter throws NOT_FOUND for non-members and archived chapters (chapter-check.ts:108-117). VALIDATION is used for the length cap (line 368). Do not add a new error path without a code.
- withAction and ActionResult: the route runs through runChapterRoute (shared.ts:30-40) and the server action runProofreadAction (src/server/actions/checks.ts). J must not change these.
- requireWorkRole: loadEditableChapter checks 'editor' (chapter-check.ts:111). Keep it on the new path.
- change_log in the same transaction: proofread writes no wiki rows. The only persistence is the ai_runs row from runAiTask (chapter-check.ts:85). No change_log needed. Applying a suggestion is a client-side edit followed by an author save (proofread-panel.tsx:38-48, "Saving stays with the author" at line 42 of the header comment). Keep it that way.
- Wiki rows archived, never deleted: not touched by J.
- AI never writes wiki tables: J keeps the AI output as suggestions only.
- Prompt injection: any new prompt text that includes quotes or context must go through neutralizeTags (prompt-utils.ts:12-14) and keep TAG_DATA_RULE (prompt-utils.ts:5-6).

## 5. Regression risks for J
- Token limits: merging reduces output size; the new rules must not raise thinking. The qwen empty-list run used 11,800 tokens and 696 s (summary.md line ~122), so the 'empty list allowed' rule must be measured for time, not only accuracy.
- 120 s product timeout: proofread is not a stream and has the default 120 s (run.ts:28, 93). If F1 splits the call, each chunk gets its own 120 s budget.
- Injection: see section 4.
- Streaming: proofread is structured, not streamed. The streaming change (F4, effort) does not touch it directly.
- Duplicate apply: after expansion, applying two items that share text can hit the replaceQuoteText fallback at text-ops.ts:28-29. Apply in reverse offset order (as applyAllRules does at proofread-panel.tsx:51-53), or dedupe by range.
- The spec (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:269) and plan (docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:597) say nothing about merging. J changes the documented behavior and needs a doc note.

## 6. Open questions for the author
1. Should a repeated quote expand to every occurrence, or only to the occurrences the model names? (Expansion can hit a place the model did not mean.)
2. Should the 'awkward' kind (style) be removed from the product, or only excluded by prompt? Removing it changes the enum (proofread.ts:9), the labels (proofread-panel.tsx:33-38), and spec line 269.
3. Should the panel get "apply this quote everywhere" for AI items, or stay one-at-a-time?
4. Is the acceptance-ratio metric counted only in the eval (author-io decisions) or also as product telemetry? No product telemetry exists in src/ai for it (not verified exhaustively).
5. Should the English mirror (en-systems.ts:31) be updated in the same change as the Korean prompt, or can it lag until HX2?
6. Is an empty list the right default for Haiku/Luna en (0 of 4 valid), or should the style-taste pass be removed entirely?

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - Prompt (PROOFREAD_SYSTEM lines 25-33), schema, postProcess (42-51): where J's rule text and dedupe go
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - aiSpellChecker (83-98) and runProofread (356-388): where one-suggestion-per-occurrence expansion goes; loadEditableChapter (108-117) carries requireWorkRole and NOT_FOUND
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts`  - locateQuote (63-89): first-occurrence only; needs locateAllQuotes shared with G1
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/text-ops.ts`  - replaceQuoteText (20-32): hint fallback to indexOf risks wrong occurrence on duplicate apply
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/proofread-panel.tsx`  - apply (38-48), applyAllRules (50-64): per-item apply; no apply-all for AI items
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts`  - PROOFREAD_SYSTEM English mirror (31-41), wired at line 150; must match any Korean change (HX2 conflict)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts`  - EN_SYSTEMS no-Hangul and proofread buildPrompt checks (257, 322-333)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.test.ts`  - Prompt-text assertions (8-12) and postProcess tests (14-50): add dedupe and prompt-rule tests here
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - DEFAULT_AI_TIMEOUT_MS 120_000 (line 28) applies to proofread (no timeoutMs in task)
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts`  - TAG_DATA_RULE (5-6) and neutralizeTags (12-14): injection guard that must stay in the proofread prompt
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts`  - proofread decision records (92, 133, 151-158): input to the acceptance-ratio metric
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts`  - Stub answers proofread by proofreadTask.system (line 41); prompt change flows automatically
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog item J (lines 136-142) and metric
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Evidence: qwen duplicate location and luna en 0/4 valid (rows at ~line 122 and 243)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md`  - Spec F14 (line 269) and task table (line 345): needs a doc note if merge or kind changes
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md`  - Plan T13 interface (line 597) describing runProofread merge rules

Open questions:
- Should a repeated quote expand to every occurrence, or only to occurrences the model names?
- Should the 'awkward' (style) kind be removed from the product, or only excluded by the prompt? Removing it changes the enum (src/ai/tasks/proofread.ts:9), panel labels (proofread-panel.tsx:33-38) and spec line 269.
- Should the panel offer 'apply this quote everywhere' for AI items, or keep one-at-a-time apply?
- Is the acceptance-ratio metric counted only in the eval (author-io decisions) or also as product telemetry? No product telemetry for it was found in src/ai.
- Should the English mirror (eval/novel/localize/en-systems.ts:31) change in the same step as the Korean prompt, or can it lag until HX2?
- For Haiku/Luna en (0 of 4 valid), is an empty list the right default, or should the style-taste pass be removed entirely?

## survey:J:specs

Track J (proofread scope and quote merging) survey, read-only. No files were edited.

WHAT THE SPECS DEFINE FOR PROOFREAD (constraints on the change)
- MVP spec F14 (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:267-270): proofread scope is "맞춤법·띄어쓰기·문법·어색한 표현" with output { quote, replacement, kind, reason }; quote must be validated as a substring. Rule check (about 40 common errors) runs instantly and is separate from AI. Panel "적용" replaces text in the editor. The spec says SpellChecker is an interface so external checkers can plug in.
- MVP spec 7.3 (line 345): proofread task is effort medium, output suggestions[]. Line 351: all prompts output Korean, quote must be copied verbatim from the manuscript, and manuscript/wiki are wrapped in tags.
- MVP spec section 13 item 6 (line 396): 맞춤법 = built-in rules + AI.
- MVP plan Task T13 (docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:583-599): the exact proofread system prompt, including the rule "대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다. 문체를 바꾸는 제안은 하지 않는다." It also says postProcess drops unlocatable quotes and no-op replacements, the fake returns { suggestions: [] }, and runProofread returns ProofreadSuggestion with start/end. ProofreadSuggestion.kind still includes 'awkward'. Rule suggestions are always produced, and overlapping AI suggestions that collide with a rule suggestion are dropped.
- MVP plan T19 (line 777): ProofreadPanel offers 규칙 검사 and AI 교정, 적용 per item (replaceQuote), and 모두 적용 (규칙), which applies rule items only.
- Current code matches the plan: src/ai/tasks/proofread.ts:25-33 (prompt, no 표준어 wording, awkward still allowed at line 30), src/ai/tasks/proofread.ts:42-51 (postProcess drops blank/no-op/unlocatable quotes but does NOT merge duplicate quotes), src/components/writing/panels/proofread-panel.tsx:99 and :114 (apply uses replaceQuote(quote, replacement, item.start), so one occurrence per item), src/components/writing/text-ops.ts:17-31 (replaceQuoteText replaces one occurrence: hintStart or first).

EVAL DESIGN AND PLAN (the metric and harness)
- Eval design 6.4 (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:180): author rule "맞춤법: 실제 오류를 고치는 제안만 수용한다." Line 153: the author accepts or rejects suggestions one at a time, and only accepted ones are applied. Line 294-295 (review table): proofread metric = "맞는 제안과 틀린 제안의 비율" (valid vs invalid ratio). The follow-up's metric is "맞춤법 제안 수락 비율" (acceptance ratio). These are not the same. Acceptance depends on the author-agent decision, while validity is a judgment of the suggestion. Decide which one the metric uses before implementing.
- Eval design 6.4 line 183-184: the author judges with a Sonnet agent per decision, and deterministic auto-judging is explicitly excluded (line 170-171, 設計 판단). Do not add a rule-based auto-accept in the harness.
- Eval plan (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:385): decision contract for proofread = items { id, quote, replacement, kind, reason, source }, decisions { id, accept, reason }, must cover every id exactly. Line 480: "ids are the suggestion indexes as strings." Merging same-quote suggestions into one item changes the id set and the count of items, so the decision contract and the author-io schema (eval/novel/author-io.ts:92, 133) must be updated together.
- Eval plan line 234-235 and eval-client translation: en mode sends EN_SYSTEMS.proofread (eval/novel/localize/en-systems) and translateScaffold(prompt). Any change to PROOFREAD_SYSTEM must be mirrored in the English system text, or the en run and ko run diverge (eval design 6.5, line 194-197 says all model-facing text must be English in en runs).
- Eval design section 6.1 chapter loop step 3 (line 153): the author accepts one at a time, and only accepted items are applied to the body. The loop applies accepted items after proofread; the plan's applySuggestions (eval plan line 481) applies accepted ones by id.

WHAT THE CHANGE WOULD CONTRADICT OR NEED TO RE-DECIDE
1. Narrowing to "표준어 규범 위반만": F14 (MVP spec line 268) and MVP plan T13 explicitly include 어색한 표현 (awkward) and 문법 in scope. Dropping awkward from the prompt, or restricting it to 표준어 규범, contradicts F14 and the kind enum at src/ai/tasks/proofread.ts:9 and plan line 597. A spec change is needed, or keep awkward in a narrower form. The existing prompt already forbids style-changing suggestions (proofread.ts:29), so the follow-up is a stronger restatement, not a new rule.
2. Allowing an empty list: already allowed by the schema and the fake (MVP plan line 596-599: fake returns suggestions []). Not a contradiction. Eval plan line 385 says decisions must cover every id, which is fine with an empty list.
3. Merging the same quote and applying it to every location: this contradicts the current apply model. The panel applies one item with a start hint (proofread-panel.tsx:99; text-ops.ts:17-31). The spec says 적용 replaces text in the editor (F14, line 270) without saying how many locations. MVP plan T19 bulk apply ("모두 적용") is for rule items only. So a merged item needs a new apply path that replaces all occurrences. Also, quoting the same string in several places at once can hit a location where it is not an error; the author-decision contract (eval design 6.4 "실제 오류를 고치는 제안만") would then need one decision per merged quote, which the plan's id-per-suggestion model does not carry.
4. Metric mismatch: see the eval design line 295 vs the follow-up "수락 비율" above. Also, the eval design (line 170-172) says author judgments are recorded with reasons and that the proofread metric is valid-vs-invalid, so an acceptance-ratio number cannot replace validity without changing the review template (eval design line 287-297).
5. Eval plan line 383 (proposals) and 385 show decisions are per id with exact coverage. Any merge must keep "covers every id exactly" true, which means the merged item id must be the only id for that quote.

DECISIONS ALREADY MADE (do not re-litigate)
- Rule check (src/lib/korean/spelling-rules.ts) runs separately from AI and always runs (MVP spec F14 line 266; plan T13 line 596).
- AI proofread is medium effort, maxTokens 16000 (plan T13 line 583), and eval forces max effort with output floor 32000 (eval plan line 234). Do not change effort in this track.
- Proofread runs with AI timeout 120,000 ms (eval plan line 234; interview-AI-reliability plan line 115-126 cancel/timeout contract).
- The author is a Sonnet agent, not deterministic; the decision contract stays (eval design line 170, 183).
- Spec 13 item 6: AI plus built-in rules, external checker only as a placeholder.
- Interview reliability design line 106 names 교정(AI) as a panel that shows elapsed time and cancel. Changing the output shape must keep that UI working.

OPEN QUESTIONS
- Does "표준어 규범 위반만" replace the kinds list (drop awkward) or narrow awkward? F14 and MVP plan currently require awkward.
- Is the metric "맞는 제안 비율" (validity, per eval design line 295) or "수락 비율" (acceptance, per follow-up line 142)? The two can differ.
- For merged same-quote items, what does the author decide: one accept for all locations, or per location? The eval plan id model (line 480) and the panel apply model (proofread-panel.tsx:99) both assume one location per item.
- Is the EN_SYSTEMS.proofread text (eval/novel/localize/en-systems) in scope for the same wording change? Eval design 6.5 says yes for all system prompts.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md`  - F14 proofread scope (lines 267-270), AI task table (345), prompt rules (351), section 13 item 6 (396)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md`  - Task T13 exact proofread system prompt and types (583-599); ProofreadPanel T19 (777)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Author accept rule (153, 180), review metric (294-295), author judgment design (170-172, 183), English mode (194-197), chapter loop (148-160)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - proofread decision contract and ids (385, 480-481), en-mode prompt test (234-235)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md`  - Cancel and timeout for 교정(AI) panel (106)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md`  - proofread signal and timeout contract (115-126, 142)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Track J backlog entry (136-142) with metric 맞춤법 제안 수락 비율
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - Current prompt (25-33), kind enum (9), postProcess without merge (42-51)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/proofread-panel.tsx`  - Per-item apply via replaceQuote with start hint (99, 114)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/text-ops.ts`  - replaceQuoteText replaces one occurrence (17-31)

Open questions:
- Does "표준어 규범 위반만 고친다" replace the kinds list (drop awkward), or narrow awkward? F14 (MVP spec line 268) and MVP plan T13 require awkward and grammar.
- Is the proofread metric validity (맞는 제안 비율, eval design line 295) or author acceptance (수락 비율, follow-up line 142)? They are different measures.
- For merged same-quote items, does the author decide once for all locations or per location? The eval id model (eval plan line 480) and the panel apply (proofread-panel.tsx:99) both assume one location per item.
- Should the English system text (eval/novel/localize/en-systems, referenced from eval/novel/eval-client.ts:17) change in the same way? Eval design line 194-197 requires all model-facing text to be English in en runs.

## survey:J:tests

TRACK J test map (read-only survey). Repo is clean at main; nothing was edited or run.

=== 1. CODE PATH THAT TRACK J TOUCHES ===
- Prompt and task: src/ai/tasks/proofread.ts. PROOFREAD_SYSTEM at lines 25-33. Line 29 has "대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다. 문체를 바꾸는 제안은 하지 않는다." There is no "표준어 규범" phrase and no statement that an empty list is allowed. Line 31 defines kind. ProofreadSchema at 12-21, with suggestions[] of {quote, replacement, kind, reason}. postProcess at 42-52 skips empty quotes and replacement===quote (line 45), runs locateQuote(input.text, s.quote) with no hint (line 46), and does not dedupe. Run.ts applies postProcess at src/ai/run.ts:109.
- Service: src/server/chapter-check.ts. aiSpellChecker at 75-104. Line 89 calls locateQuote(text, s.quote) with NO hint, so repeated identical quotes all get start = first occurrence. There is no dedupe. runProofread at 356-385: rule suggestions (372), AI overlap filter drops AI items that overlap a rule item (378-380), then sort (381-383). MAX_PROOFREAD_AI_CHARS = 30_000 at line 51.
- locateQuote: src/lib/korean/sentences.ts:63-88. With hint undefined it returns exact[0] (lines 74-79), so duplicates collapse to the first occurrence.
- Rule checker (not AI, not in scope to change): src/lib/korean/spelling-rules.ts. It already catches 되요 (line 31-35), so AI duplicates of 되요 are removed by the overlap filter at chapter-check.ts:378-380.
- Panel: src/components/writing/panels/proofread-panel.tsx. ProofreadItem type at 23-31 (has source, quote, replacement, kind, reason, start, end). apply() at 97-107 uses api.replaceQuote(quote, replacement, start). applyAllRules at 110-123 applies only source==='rule' (line 112). Item key is `${item.start}-${index}` (line 169), so duplicate AI items at the same start are still rendered.
- Route: src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.ts (calls runProofread at 18-19). Body schema: src/app/api/works/[workId]/chapters/shared.ts:13-23 (PROOFREAD_TEXT_MAX_CHARS 200_000).
- EVAL PARALLEL PROMPT (must be changed in step): eval/novel/localize/en-systems.ts:31-38 has a SEPARATE hand-written English PROOFREAD_SYSTEM. It is not derived from proofreadTask.system. It is wired at line 150 (proofread: PROOFREAD_SYSTEM). Eval apply logic: eval/novel/steps/util.ts:283-306 applySuggestions drops bad quotes (288-293) and drops overlaps (297, `if (s.start < edge) continue`). This is why a qwen duplicate with the same start loses its second copy. Eval step: eval/novel/steps/chapter.ts:182-240 (proofread step; accepted decisions applied at 234-235).

=== 2. EXISTING TESTS THAT COVER THE TOUCHED CODE (path:line, what they assert) ===
- src/ai/tasks/proofread.test.ts
  - :9-14 system starts with '당신은 한국어 웹소설 교정자다.' and contains '대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다.'
  - :16-27 FakeAiClient output is {suggestions: []} and passes schema.
  - :29-38 postProcess drops an unlocatable quote ('없는 문장'), keeps '되요'.
  - :40-51 postProcess drops replacement===quote (keeps the other item).
  - :56-65 prompt isolation: </manuscript> inside text does not end the section; system contains TAG_DATA_RULE.
- src/server/chapter-check.test.ts (uses scriptedClient defined at :60; it returns the scripted object for a matching system prompt, else FAKE_OUTPUTS)
  - :337-359 'returns the rule suggestion for 되요 with offsets when AI is off' (text '안 되요.', expects one rule item start 2 end 4).
  - :360-388 'drops AI suggestions that collide with a rule suggestion and keeps the rest sorted' (text '안 되요. 그건 좀 어색해요.', AI returns 되요 (dropped) and 어색해요→어색합니다 (kept at text.indexOf('어색해요'))).
  - :390-400 viewer gets FORBIDDEN.
  - :497-520 AI proofread over MAX_PROOFREAD_AI_CHARS rejects VALIDATION before any model call (counts calls).
  - :522-534 AI proofread at exactly the limit returns runId not null.
- src/server/actions/checks.test.ts:41-60 runProofreadAction (useAi false) accepts 200000 chars, rejects 200001 with VALIDATION. No AI.
- src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.test.ts
  - :67-70 editor run returns suggestions array.
  - :72-90 NOT_FOUND for non-member, NOT_FOUND for chapter in another work (:79-82), FORBIDDEN for viewer (:84-90).
  - :92-109 200000 limit accepted, 200001 VALIDATION.
  - :111-120 useAi over 30000 chars: VALIDATION containing '너무 깁니다'.
- src/components/writing/panels/proofread-panel.test.tsx (jsdom)
  - :81-124 'undoes 모두 적용 (규칙) in one step from the toast'. Mocks fetch with two RULE items (되요 at start 0 and 3), checks URL /api/works/work-1/chapters/c1/proofread, applies all, expects '돼요 돼요.', then undo restores TEXT. No AI-item or duplicate-AI test exists.
- src/lib/korean/sentences.test.ts:26-42 locateQuote: exact, whitespace-collapsed, null when absent, hint picks nearest occurrence (:39-41).
- src/lib/korean/spelling-rules.test.ts (rule checker; has its own local applySuggestions helper at :4).
- eval/novel/run.test.ts:522-~540 'applySuggestions applies right to left, skips bad quotes and overlaps'.
- eval/novel/eval-client.test.ts:152 asserts en mode system === EN_SYSTEMS.proofread; :163 asserts ko mode system === proofreadTask.system.
- eval/novel/localize/localize.test.ts:257 uses proofreadTask.buildPrompt only.
- e2e/ai-stub/stub.test.ts:44-73 proofread calls via proofreadTask fields; e2e/ai-stub/responders.ts:41 answers {suggestions: []}.

=== 3. FACTORIES AND FAKE AI WIRING ===
- src/test/factories.ts exports: createTestUser(db, {name?, email?}) :20; createTestWork(db, ownerId, {title?, settings?}) :33 (also inserts owner membership row, line 46); addTestMember(db, workId, userId, role) :50; createTestChapter(db, workId, {position?, body?...}) :59 (options used in tests as { position: 1, body: '...' }); createTestEntry :87; createTestFact :105; createTestThread :132.
- src/test/db.ts:8-12 createTestDb(): fresh in-memory PGlite with migrations.
- src/test/fake-ai.ts: FakeAiClient. generateObject (:28-32) takes structuredOutput (:46-52): per-test overrides first, then FAKE_OUTPUTS, else throws. It validates with args.schema.parse (:30), so an invalid override throws. streamText uses FAKE_TEXT (:54-64).
- src/test/ai-fakes/proofread.ts:4-6 fakeProofread() returns {suggestions: []}. Registered at src/test/ai-fakes/index.ts:8 (import) and :19 (proofread: fakeProofread).
- Override style: src/test/fake-ai.test.ts:67-85 ('overrides win over the registry'). Service tests can pass new FakeAiClient({overrides: {proofread: () => ({...})}}) or the scriptedClient helper in chapter-check.test.ts:60.
- Vitest env: vitest.config.ts:8 environment node; :13 include src/**/*.test.{ts,tsx}, eval/**/*.test.ts, e2e/ai-stub/**/*.test.ts. The jsdom panel test opts in with the first-line comment.

=== 4. EXACT TEST COMMAND (touched files) ===
pnpm vitest run src/ai/tasks/proofread.test.ts src/server/chapter-check.test.ts src/server/actions/checks.test.ts "src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.test.ts" src/components/writing/panels/proofread-panel.test.tsx src/lib/korean/sentences.test.ts src/lib/korean/spelling-rules.test.ts eval/novel/run.test.ts eval/novel/eval-client.test.ts eval/novel/localize/localize.test.ts e2e/ai-stub/stub.test.ts --maxWorkers=2
(Quote the bracketed route path. Add --maxWorkers=2 for parallel agents, as CLAUDE.md says.)

=== 5. NEW TEST CASES TO ADD (name | input | expected) ===
A. src/ai/tasks/proofread.test.ts (prompt rules)
 1. 'system prompt limits fixes to standard-spelling violations' | proofreadTask.system | contains '표준어 규범 위반만' (exact wording to be fixed in the implementation).
 2. 'system prompt allows an empty list when nothing is wrong' | proofreadTask.system | contains the chosen empty-list sentence (e.g. '고칠 곳이 없으면 빈 목록을 낸다').
 3. 'system prompt still forbids style-taste edits' | system | still contains '문체를 바꾸는 제안은 하지 않는다.' (guards against deleting the existing line).
 4. 'postProcess merges identical quotes into one suggestion per location' | text '되요 되요.' hmm — NOTE: use a non-rule quote, e.g. text '그건 어색해요. 저것도 어색해요.' with two identical AI items {quote:'어색해요', replacement:'어색합니다', kind:'awkward'} | expected: exactly one item per occurrence, or one merged item, per the chosen shape. Decide the shape first. If per-location: two items with starts at each index.
B. src/server/chapter-check.test.ts (runProofread, scriptedClient)
 5. 'AI duplicates each get their own location' | text '그건 어색해요. 저것도 어색해요.', useAi true, AI returns the same {quote:'어색해요', replacement:'어색합니다', kind:'awkward'} twice | expected: two ai suggestions, starts [text.indexOf('어색해요'), text.lastIndexOf('어색해요')]. CURRENTLY FAILS: aiSpellChecker (chapter-check.ts:89) gives both start 0 (first occurrence).
 6. 'empty AI list returns only rule suggestions with no error' | text '안 되요.', AI returns {suggestions: []} | expected: runId not null, suggestions = the single rule item. Passes today.
 7. 'AI suggestion with a quote that does not exist is dropped' | AI returns quote '없는 문장' | expected: no ai item. Passes today (chapter-check.ts:90).
 8. 'AI item that overlaps a rule item is dropped even when the AI copy comes first' | text '안 되요.' with AI '되요'→'돼요' | expected: one rule item. Covered by existing :360 test; add ordering variant only if the new merge logic changes sort order.
C. src/components/writing/panels/proofread-panel.test.tsx (jsdom)
 9. 'applying two AI items with the same quote changes both places' | server returns two ai items quote '어색해요' with starts 0 and 8 (both kept as separate items) | click 적용 on each | expected text has both replaced. Also: when starts are wrong (both 0), apply still reaches the second occurrence via replaceQuote hint (proofread-panel.tsx:99, api replaceQuote uses indexOf from hint). Document actual behavior.
 10. 'AI items are not applied by 모두 적용 (규칙)' | mix ai and rule items | expected: applyAllRules touches only rule items (proofread-panel.tsx:112). Guards the existing behavior.
D. eval (must mirror the new rule, since the English prompt is separate)
 11. 'en proofread system carries the same standard-spelling and empty-list rules' | EN_SYSTEMS.proofread (eval/novel/localize/en-systems.ts:31) | contains the English equivalents of rule 1 and rule 2 (exact wording chosen during the change). Add to eval/novel/eval-client.test.ts or localize.test.ts. Today it fails if the ko prompt changed but the en one did not.
 12. 'applySuggestions keeps two copies at different starts' | text 'AAA AAA' with two valid suggestions starts 0 and 4 | expected both applied. Existing run.test.ts test covers overlap only. Pins the merge outcome for eval.
E. Optional
 13. route or action: 'proofread response keeps one item per location' only if the response shape changes.

=== 6. EXISTING TESTS THAT WOULD BREAK, AND WHY ===
- src/ai/tasks/proofread.test.ts:11-13 BREAKS only if the sentence at proofread.ts:29 is reworded. Keep it verbatim and add new sentences after it. Line :10 (startsWith) breaks only if line 25 changes.
- src/ai/tasks/proofread.test.ts:40-51 and :29-38 break only if postProcess changes its return shape (for example to a merged item with occurrences[] instead of quote/replacement/kind/reason/start/end). Test :37 maps .quote and :48 uses toEqual on the full object, so a new field on the item breaks :48.
- src/server/chapter-check.test.ts:360-388 expects the AI item at text.indexOf('어색해요') and kind/source fields. It survives a per-location change, but breaks if the item is merged into one item with a different start, or if the overlap rule changes.
- src/components/writing/panels/proofread-panel.test.tsx:81-124 fetch-mock shape (suggestions[] with source/quote/replacement/kind/reason/start/end) breaks only if the ProofreadItem wire shape changes (panel type at :23-31). Rule-only, so safe for prompt-only changes.
- eval/novel/eval-client.test.ts:152 and :163 use EN_SYSTEMS.proofread and proofreadTask.system by reference, so they do not break on wording changes. They break only if the export names change.
- eval/novel/run.test.ts:522-~540 (applySuggestions) breaks only if the overlap rule in util.ts:297 changes.
- Not broken: src/test/ai-fakes/proofread.ts (still returns []), e2e/ai-stub/responders.ts:41, src/server/actions/checks.test.ts, the route tests at proofread/route.test.ts.

=== 7. ADDITIONAL FINDINGS THAT SHAPE THE TESTS ===
- The panel also uses start for highlights (proofread-panel.tsx:50-58 via rangeOf(text, quote, start)). Duplicate starts give duplicate highlights on one span, which is visible in the UI.
- Spec F14 (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:267-269) lists awkward as an allowed kind. Removing awkward in code would conflict with the spec, so the change should be prompt-level (and maybe a kind filter) only after a decision.
- Evidence rows: docs/eval/novel/2026-10-18/summary.md:243 (item 10: luna ko 1/4, luna en 0/4, haiku ko 0/1, qwen duplicate), luna-6-en.md:138 (0 of 4 valid, all awkward), luna-6-ko.md:165 and :278 (1 of 4), qwen3.8-27b-ko.md:53 and :69 (mentions the residual errors), haiku-5.5-ko.md:225 (awkward suggestion rejected by author).

=== 8. OPEN QUESTIONS FOR THE IMPLEMENTER ===
- Merge shape: one item with occurrences[] (changes the wire shape and ProofreadItem type) versus one item per location with distinct start (no wire change, the simpler option, and it fits the existing apply/applyAll logic). The second option is closer to the stated "모든 위치에 적용".
- Should postProcess or runProofread do the merge? postProcess (proofread.ts:42-52) has no start values yet, so the per-location start must be computed where locateQuote runs (chapter-check.ts:89), using the occurrence index for repeated quotes.
- The eval applySuggestions overlap rule (util.ts:297) is a second place where duplicates die. Confirm the eval should keep it.
- Proofread acceptance metric: no code computes an acceptance ratio. The eval's proofread review data is in chapters/NN.proofread.json (eval/novel/steps/chapter.ts:188-190) and the author decisions, so the metric can come from there.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - Proofread prompt (PROOFREAD_SYSTEM lines 25-33), zod schema (12-21), postProcess (42-52). The change point for the prompt and merge logic.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.test.ts`  - Existing prompt, fake and postProcess tests (lines 9-65).
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - aiSpellChecker (75-104, line 89 locateQuote with no hint) and runProofread (356-385, overlap filter 378-380). Where duplicate AI items get their start.
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.test.ts`  - runProofread tests (337-400) and input-length tests (497-534), scriptedClient at line 60.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts`  - locateQuote (63-88); hint undefined returns the first occurrence (74-79).
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.test.ts`  - locateQuote tests (26-42).
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/proofread-panel.tsx`  - Client panel: ProofreadItem (23-31), apply (97-107), applyAllRules (110-123, rules only), highlights (50-58).
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/proofread-panel.test.tsx`  - jsdom test for the rule path and undo (81-124).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.ts`  - Route POST calling runProofread (9-21).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.test.ts`  - Route tests: auth, membership, limits, AI limit (31-120).
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/chapters/shared.ts`  - ProofreadBodySchema (13-23).
- `/home/xogud/documents/github/DaeumHwa/src/server/actions/checks.test.ts`  - Action-level input-limit tests (29-60).
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.ts`  - Rule checker; 되요 rule at 31-35 (overlap with AI path).
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts`  - FakeAiClient: overrides first, then FAKE_OUTPUTS, schema-validated (28-52).
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/proofread.ts`  - fakeProofread returns empty suggestions (4-6).
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts`  - Registry: proofread: fakeProofread (8, 19).
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts`  - createTestUser 20, createTestWork 33, addTestMember 50, createTestChapter 59, createTestEntry 87, createTestFact 105, createTestThread 132.
- `/home/xogud/documents/github/DaeumHwa/src/test/db.ts`  - createTestDb (8-12).
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.test.ts`  - Override-wins test pattern (67-85).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts`  - Separate English PROOFREAD_SYSTEM (31-38) used for en runs (line 150). Must change in step with the ko prompt.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts`  - Uses proofreadTask.buildPrompt (257).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.test.ts`  - en/ko system-prompt swap tests (152, 163).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - applySuggestions (283-306): drops bad quotes and overlaps (line 297).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - Eval proofread step (182-240).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts`  - applySuggestions test (522-~540).
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts`  - Stub answer {suggestions: []} for proofread (41).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog section J (lines around 2 J, MAX rules).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Item 10 evidence (line 243) and the F14 measurement table.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md`  - F14 design intent (267-269); awkward is an allowed kind.

Open questions:
- Merge shape: one item with occurrences[] (changes the wire shape and ProofreadItem type) or one item per location with distinct start (no wire change; fits apply and applyAll). The per-location option matches the backlog wording 'apply to every location'.
- Where the merge happens: postProcess (proofread.ts:42-52) has no start yet, so per-location starts must be computed where locateQuote runs (chapter-check.ts:89), using occurrence index for repeated quotes.
- Should the code also drop awkward-kind suggestions? Spec F14 (design doc lines 267-269) lists awkward as an allowed kind, so this is a product decision, not a test detail.
- Should the eval applySuggestions overlap rule (eval/novel/steps/util.ts:297) stay as is? It is why a duplicate at the same start is lost in eval.
- No code computes a proofread acceptance ratio. It would have to come from chapters/NN.proofread.json and author decisions (eval/novel/steps/chapter.ts:188-190, 225-235).


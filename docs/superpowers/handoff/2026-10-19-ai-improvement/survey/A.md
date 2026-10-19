# Track A: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:A:code

TRACK A (T3 chapter length) code map. Read-only; nothing in the repo was changed.

DATA FLOW (two entry points, one service)
1. Web UI: draft-panel.tsx write() (102-132) -> streamDraft() (59-100) POSTs {chapterId, entryIds, instructions, targetChars} to /api/works/[workId]/draft (fetch at 64, body at 67). Reads the text stream (80-85), splits the error record with parseDraftStream (90). Saving to a chapter uses appendToChapter (134-138); a new chapter goes through createChapterFromDraftAction (src/server/actions/ai-features.ts:34-39), which reads the run by runId.
2. Route: route.ts POST (48-107). Body schema at 16-21 (instructions max 5000, targetChars 500-20000). Calls startDraft (68-74), streams textStream into the response (76-92, enqueue at 79), awaits `done` (82) before closing, returns X-Run-Id (96). maxDuration 300 (14).
3. Eval harness: steps/chapter.ts draft() (80-180). Calls startDraft with targetChars = ctx.bible.targetChars (112-122), awaits run.done (123), writes the attempt file (135), records the attempt (136), builds the draft_review pending with chapterMetrics (143-153, metrics at 152), consults the author (154), picks the best attempt with pickAttempt (169), and creates the chapter via createChapterFromDraft using the chosen runId (170-176). Metrics file written at 255-259.
4. Service: ai-features.ts startDraft (259-341). Requires editor role (275). targetChars resolved from work settings (278). Previous chapter tail/summary (298-300), style cards (302-311), context pack (313-317), buildDraftPrompt (318-326), startAiStream (328-340). Returns {runId, textStream, done}.
5. Run layer: run.ts startAiStream (135-190). assertCanStartRun (141), insertRun (142), timeout STREAM_AI_TIMEOUT_MS=280000 (143; constant at line 30), callSignals (144), client.streamText (148-157), done = stream.final then finishRun with output {text} (167-186, output at 173). finishRun at 297-.
6. Persisted text: createChapterFromDraft (ai-features.ts:347-373) reads ONLY the one run's output.text via draftText (365; function 375-381). Any continuation text must therefore be saved into that same run row, or the chapter loses it.
7. AI client: types.ts StreamTextArgs (26-35) and AiClient.streamText (44-47). The eval wrapper is eval-client.ts streamText (376-); it records every stream call as a calls/ file (settle, writeFileSync at 507-509).

WHERE THE LENGTH RULE LIVES TODAY
- draft-chapter.ts DRAFT_SYSTEM line 13 "- 목표 분량에 가깝게 쓴다." is the only length instruction (approximate, not a minimum).
- draft-chapter.ts line 42 renders `<target_length>약 ${targetChars}자</target_length>`.
- No code counts the draft or triggers a continuation. The only length check is UI-only: lengthShortfall/shortfallMessage (src/lib/chapter-length.ts:2-13), used at writing-workspace.tsx:176-178 and chapter-table.tsx:157,280, both on the completion click after the draft exists.
- countChars (src/lib/korean/chars.ts:5-14) counts characters with spaces, excluding CR/LF. The eval metric uses the same function (metrics.ts:45).

T3 DEFINITION (eval)
- metrics.ts:41-50: minChars = ko ? targetChars : 0.8*targetChars (49); lengthOk = chars >= min && chars <= 1.3*target (50). Type at 5-6.
- The backlog text says en uses a "word" range. That is NOT what the code does: both languages count characters. The en minimum is 9,680 characters (0.8 x 12,100).
- Targets: eval/fixtures/novel/ko/bible.json:9 = 5000; en/bible.json:9 = 12100. App default is 5500 (src/db/types.ts:177, resolveWorkSettings 180-186).
- The author never sees length as a rule: author.md:53 usable rule has no length clause; neither author-guide.md (ko, en) has a length rule. T3 is reported in the review (reviewer.md:42) but does not change the verdict or the retry logic (chapter.ts:154-166, pickAttempt util.ts:309-315).

SMALLEST-DIFF HOOKS
- H1 (prompt, lowest risk): draft-chapter.ts line 13 and line 42. Replace "약 N자" with a minimum such as "최소 N자 이상" and add a per-scene budget. Use input.targetChars, NOT a literal 5,000 (the backlog hard-codes 5,000, but the target is a per-work setting, route.ts:19, actions/works.ts:14). DraftPromptInput (20-34) has no scene structure; instructions is free text (route.ts:18, max 5000), so a per-scene split needs a new input field or is a prompt-only ask.
- H2 (continuation, one request): put it inside startDraft (ai-features.ts:328-340). Wrap textStream in an async generator that yields the first stream, then, if countChars(text) is below target (use lengthShortfall), starts a second startAiStream with a continuation prompt (new builder in draft-chapter.ts) and yields its chunks. Wrap done so it resolves to the combined text. The route (route.ts:76-92) and the eval (chapter.ts:112-123) need no change, because both consume textStream/done from startDraft.
- The second text must also reach the saved chapter: either (a) add a small run.ts helper that overwrites output.text on the first runId (uses the finishRun pattern at 297-310), so draftText (ai-features.ts:365,375-381) stays unchanged; or (b) pass several runIds through createChapterFromDraft and the action (larger diff). Option (a) is smallest.
- Draft call count: eval counts calls/ files via readCallRecords (eval/novel/steps/util.ts:155-162), so a continuation shows up automatically. Time: per-call deadline is set in run.ts:143-144.

TESTS AND FAKES THAT WILL BE AFFECTED
- draft-chapter.test.ts:27-36 asserts DRAFT_SYSTEM line-by-line; any new system line breaks it. Prompt tests at 42, 56, 89.
- ai-features.test.ts:277-300 expects chapter.body === await done. Stays true if done returns the combined text, but the FakeAiClient text is short (src/test/ai-fakes/draft-chapter.ts fakeDraft builds at least ~600 characters), so H2 would trigger a continuation in these tests unless the threshold is test-controlled.
- e2e/ai-stub/responders.ts:48 DRAFT_TEXT is 22 characters and is returned for every draft-chapter call. H2 would trigger a continuation there and append the same text, unless the stub handles the continuation prompt.
- run.test.ts: add a test for the run output update helper if option (a) is used.
- metrics.test.ts: no change needed.

RISKS
- route.ts maxDuration=300 (line 14) vs 280s per stream call (run.ts:30). A draft plus a continuation in the same HTTP request can exceed 300s. The backlog reports Haiku at 2-3 minutes per whole chapter, so this is tight but probably fine. Watch it.
- The author guideline (author.md:53, agents/author.md) and the metric threshold are different. If the app enforces the length but the author still says "usable" on a short draft, T3 can pass while the verdict does not change.
- Changing eval/novel/agents/author.md or the fixture author guide would change the measuring instrument; that is a decision for the orchestrator, not a code-map item.

Metric note: the ko T3 lower bound equals targetChars (5000). The app's own shortfall rule (lengthShortfall) uses the same bound (100%). The en eval uses 0.8 but the app uses 100%, so the continuation threshold needs an explicit choice for en.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 40-46 - Backlog item A: the problem, the planned fix (count after draft, one continuation, length in prompt, per-scene split) and the metrics.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 48-59,234 - Evidence: T3 percentages per run (Haiku ko 70.1%, Haiku en 75.2%, Luna ko 69.5%) and the proposed step-1 fix.
- `/home/xogud/documents/github/DaeumHwa/src/app/(app)/works/[workId]/write/page.tsx` 1-40 - Not changed for this track; page that hosts the draft panel (UI entry point). Listed for completeness.
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx` 56-132 - Web entry: streamDraft fetch (64), request body (67), stream read loop (80-85), final parse (89-94), write() (102-132). No change needed for H2.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` 16-21,48-107 - HTTP entry: body schema (targetChars 500-20000), startDraft call (68-74), stream relay awaiting done (76-92), X-Run-Id (96), maxDuration 300 (14).
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 253-341 - Service startDraft: targetChars (278), context (298-317), buildDraftPrompt (318-326), startAiStream (328-340). PRIMARY HOOK for H2 (wrap textStream and done here).
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 343-381 - createChapterFromDraft (347-373) and draftText (375-381): reads only the one run's output.text, so continuation text must be stored on that run row.
- `/home/xogud/documents/github/DaeumHwa/src/server/actions/ai-features.ts` 16-40 - Server action createChapterFromDraftAction, passes runId to the service. Unchanged under option (a).
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-71 - Prompt: DRAFT_SYSTEM (13 is the only length rule), DRAFT_MAX_TOKENS 16000 (17), DRAFT_EFFORT (18), DraftPromptInput (20-34, no scene field), buildDraftPrompt (36-63, <target_length> at 42). H1 edits here; a continuation prompt builder would be added here.
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 23-30,135-190,297-310 - startAiStream (135-190): insertRun (142), timeout (143), callSignals (144), client.streamText (148-157), done and finishRun with output {text} (167-186). finishRun (297-310) is the pattern for a new helper that rewrites a run's output (option a). STREAM_AI_TIMEOUT_MS at 30.
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts` 26-47 - StreamTextArgs and AiClient.streamText signatures. Not changed by H1 or H2.
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts` 1-13 - lengthShortfall (2-8) and shortfallMessage (10-13). Reuse for the continuation trigger (returns null at or above target). Current callers are UI only: writing-workspace.tsx:176-178, chapter-table.tsx:157,280.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts` 5-14 - countChars: characters with spaces, CR/LF excluded. Use this to count the draft, as the editor and eval metric do.
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts` 165-190 - WorkSettings.targetChars (169), default 5500 (177), resolveWorkSettings (180-186). The minimum in the prompt must come from here, not a literal 5000.
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 5-6 - TAG_DATA_RULE, included in DRAFT_SYSTEM (line 14 of draft-chapter.ts). Not changed.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 80-180,255-259 - Eval draft step: startDraft call (112-122), run.done (123), attempt write (135-136), chapterMetrics review (143-153), consult (154), pickAttempt (169), createChapterFromDraft (170-176), metrics file (255-259). No change needed under H2; the continuation happens inside startDraft.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 66-96,155-162,309-315 - withModelRetry (66-96), readCallRecords (155-162, source of the draft call count), pickAttempt (309-315, prefers any usable draft, then best quality; a short usable draft still wins).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 5-6,41-50 - T3 definition: lengthOk (50), min chars 49 (ko = target, en = 0.8 x target), counted with countChars (45). Backlog's 'en word range' is not implemented.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 376-415,505-510 - Eval stream wrapper: records each streamText call (settle, file write at 507-509), so a continuation is counted in the draft call count and timings automatically.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md` 46-56 - Author judgment rules. draft_review usable rule at 53 has no length clause. Changing it changes the measuring instrument; orchestrator decision.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/author-guide.md` 1-30 - Korean author guide: no length rule (grep for 분량/length found none). Backlog's 'author guideline' refers to this and author.md.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/en/author-guide.md` 1-30 - English author guide: no length rule. Same as ko.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/bible.json` 9 - targetChars = 5000 for the ko eval (the T3 floor).
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/en/bible.json` 9 - targetChars = 12100 for the en eval (T3 floor 9,680 at 0.8).
- `/home/xogud/documents/github/DaeumHwa/src/ai/draft-chapter-test-placeholder` 0-0 - Placeholder row, not a file. Ignore.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts` 20-36,42,56,89,115 - Tests: exact DRAFT_SYSTEM line list (27-36) breaks on any system-prompt edit (H1); prompt tests at 42, 56, 89. Update for H1.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts` 184-300 - startDraft tests with FakeAiClient. Expects chapter.body === await done (277-300). Must still pass under H2 (done returns combined text).
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts` 10-26 - fakeDraft: at least ~600 characters, shorter than 5000. Under H2 this triggers a continuation in tests unless the fake or threshold is adjusted.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 45-48 - E2E stub: DRAFT_TEXT is 22 characters, returned for every draft-chapter call. Under H2 the continuation would append the same text unless the stub handles it.

Open questions:
- Continuation threshold for en: the app's shortfall rule is 100% of target (src/lib/chapter-length.ts:2-8), while the eval T3 floor for en is 80% (eval/novel/metrics.ts:49). Which one should the continuation trigger use?
- Should the continuation text be saved into the first run's output (option a, smallest diff: a new run.ts helper), or should createChapterFromDraft take several run ids (larger diff)?
- Changing the author judgment (eval/novel/agents/author.md:53) so that a short draft is not usable would change the measuring instrument. Is that in scope for this track, or should the eval only report the new T3 count?
- The backlog's per-scene length split has no data model: DraftPromptInput has no scene field and instructions is free text. Is a prompt-only per-scene ask acceptable, or should the scenes come from the bible?
- The backlog says en counts words. The code counts characters for both languages (metrics.ts:45, chars.ts:5-14). Confirm which one the backlog means before implementing the en minimum.

## survey:A:evidence

TRACK A (chapter length guarantee, T3): evidence survey. Read-only. No repo files were changed.

## 1. Backlog item (docs/eval/novel/follow-up-ai-improvement.md)
- Section A, lines 40-46: problem stated as Haiku ko 70.1%, Haiku en 75.2%, Luna ko 69.5%; author guideline does not treat short length as a reason to rewrite. To do: count characters in code after the draft, request one continuation if short, and add "공백 포함 5,000자 이상" plus per-scene length split to the draft prompt. Metrics: T3 pass count, draft call count, time (line 46).
- Line 17 and line 9: the six runs are all unpublishable; T3 is one of the blocking thresholds.

## 2. Per-run T3 evidence (1 chapter per run, all `chapters: 1`)
| run | chars / target | % | lengthOk | draft calls | draft time | perChapterMs |
|---|---|---|---|---|---|---|
| haiku ko | 3,505 / 5,000 | 70.1% | false | 1 | 67.9 s | 213,015 |
| haiku en | 9,096 / 12,100 (min 9,680) | 75.2% | false | 1 | 69.1 s | 147,987 |
| luna ko | 3,473 / 5,000 | 69.5% | false | 1 | 82.5 s | 400,691 |
| luna en | 9,888 / 12,100 (min 9,680) | 81.7% | true | 1 | 116.0 s | 254,431 |
| qwen ko | 5,450 / 5,000 | 109% | true | 3 attempts | median 45.1 s | 5,030,415 (median) |
| qwen en | 15,069 / 12,100 | 124.5% | true | 1 | 346.6 s | 7,716,532 (sum) |

Sources: haiku-5.5-ko.md:39, :45, :267, :295; haiku-5.5-en.md:18, :106, :147-ish step table; luna-6-ko.md:30, :206, :231; luna-6-en.md:21, :161, :178; qwen3.8-27b-ko.md:44, :50; qwen3.8-27b-en.md:40, :48; summary.md:26-28, :56-58, :141-142, :159, :173.
- Baseline T3 pass: 3/6 overall (qwen ko, qwen en, luna en). Cloud runs: 1/4 pass.
- Quotes: haiku-5.5-ko.md:20 "분량이 모자란다. 초안 호출의 출력이 13,208토큰이었는데 본문은 3,505자였다."; haiku-5.5-ko.md:337 "분량 미달(70%). 작가 지침상 분량 부족은 다시 쓰기 사유가 아니라서 그대로 저장됨"; luna-6-ko.md:192 "작가가 '분량이 목표의 70%'라고 적었지만 쓸 수 있는 초안으로 받았다"; luna-6-ko.md:270 prompt has only "약 5000자" and "목표 분량에 가깝게 쓴다"; haiku-5.5-en.md:18 "584 characters under the minimum"; luna-6-en.md:214 "208 characters above the minimum".
- Summary note: haiku-5.5-en.md:42 says a full-length draft would sit at the publishable line (mean 3.78 vs 3.75).

## 3. Root cause in code (verified)
- Author accepts short drafts: eval/novel/agents/author.md:53 lists the unusable cases (empty, cut off, another language, non-prose, missing mustInclude). Length is not one of them: "Otherwise it is usable, even if clumsy."
- Redraft loop only on usable=false: eval/novel/steps/chapter.ts:101, :166. Metrics go to the reviewer at chapter.ts:152 but do not force a redraft.
- Product draft prompt has no minimum: src/ai/tasks/draft-chapter.ts:13 "- 목표 분량에 가깝게 쓴다.", :42 `<target_length>약 ${targetChars}자</target_length>`. A test pins line 35 of src/ai/tasks/draft-chapter.test.ts ("- 목표 분량에 가깝게 쓴다.") and will need updating.
- Single stream call, no continuation branch: src/server/ai-features.ts:328-340 (startAiStream once). No continuation logic found in ai-features.ts or draft-chapter.ts (grep for 이어/continue/extend found nothing relevant).
- Reusable helper already exists for a UI shortfall prompt: src/lib/chapter-length.ts:2-12 (lengthShortfall, shortfallMessage); used at src/components/writing/writing-workspace.tsx:177-178 ("그래도 완료할까요?"). Completion is manual; no automatic check.
- Ko and en thresholds: eval/novel/metrics.ts:49-50 (ko min = target; en min = 0.8 x target; max = 1.3 x target), counts characters with spaces for both languages (metrics.ts:48). The 0.8 factor's origin is not in the spec I read: docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:186-202 (section 6.5) only says the en target is a character-equivalent by paragraph ratio. Criteria doc docs/eval/novel-quality-criteria.md:58 says ko "공백 포함 5,000자 이상, 목표의 130% 이하".
- Summary wording conflict: docs/eval/novel/2026-10-18/summary.md:234 proposes "(en은 단어 범위)", but the harness counts characters for en too (metrics.ts:48-50). Summary.md:226 says the units differ. Resolve before writing any en prompt text.

## 4. Hidden risk: the eval does not reproduce product output cap
- Product draft cap: src/ai/tasks/draft-chapter.ts:17 DRAFT_MAX_TOKENS = 16000, passed at src/server/ai-features.ts:335.
- Eval floor: eval/novel/eval-client.ts:451 `maxTokens: Math.max(productMaxTokens, this.profile.maxTokensFloor)`. Floors: qwen 32000 (eval/novel/models.ts:46), haiku 32000 (:81), luna 32000 (:92). So the eval runs drafts at 32,000, not 16,000.
- Product truncation throws rather than returning short text: src/ai/ollama.ts:467, src/ai/anthropic.ts:177 and :209 (MAX_TOKENS_MESSAGE). The eval would not hit this at a 32k cap, so T3 results from the eval cannot show product truncation.
- Token estimate (includes hidden reasoning, not separately recorded: haiku-5.5-ko.md:275): haiku ko 13,208 out / 3,505 chars = 3.8 tok/char; luna ko 7,897 / 3,473 = 2.3 tok/char (summary.md:151); luna en 10,489 / 9,888 = 1.06 tok/char (luna-6-en.md:153). At 5,000 ko chars this is roughly 11,000 to 19,000 output tokens; the haiku-rate estimate exceeds the 16,000 product cap. Estimate only.
- Product draft timeout is 280,000 ms (haiku-5.5-ko.md:259). qwen en draft took 346.6 s (summary.md:173), over that limit. A local continuation call would also be long (follow-up doc section D notes 20-35 min per local call).

## 5. Proposed acceptance criteria
Cloud runs = haiku ko/en, luna ko/en. Local runs = qwen ko/en (T3 already passes; criteria apply to the continuation path only).

1. T3 pass count (final saved chapter, lengthOk). Now: cloud 1/4, all 3/6. Target: cloud 4/4, all 6/6. Threshold: ko chars ≥ 5,000 (with spaces); en chars ≥ 9,680; both ≤ 1.3 x target. Measure: `eval/novel/metrics.ts` lengthOk, written to metrics/01.json (exists). Recompute from chapters/01.md.
2. Attempt-1 length ratio (before any continuation). Now: 69.5%, 70.1%, 75.2%, 81.7%. Target: ≥ 100% ko, ≥ 0.8 en (same gate as T3). Measure: recompute from chapters/01.attempt-1.md (written at chapter.ts:135). Metric exists in files; no field records it per attempt.
3. Continuation trigger precision. Now: 0 triggers. Target: triggers only when attempt-1 is below the gate (0 false triggers on the 2 passing cloud runs and both local runs with length ok). Measure: NOT AVAILABLE. Needs a count of continuation requests in run-summary.json. Propose a distinct task name (for example `draft-continue`) so `calls.byTask` counts it (eval/novel/steps/finish.ts:44-50, :102-108 already count per task).
4. Continuation success. Now: n/a. Target: ≥ 1 successful lengthOk after the continuation for every trigger, and no chapter above 1.3 x target (now 0 violations; max 124.5%, qwen en). Measure: lengthOk on the final chapter (exists) plus the trigger count (missing, see 3).
5. Draft calls per chapter. Now: cloud 1 each; qwen ko 3 (hanja retries, summary.md:141), qwen en 1. Target: cloud ≤ 2 (one draft plus at most one continuation). Measure: `calls.byTask['draft-chapter'].count` (finish.ts:102-108). Exists.
6. Time per chapter. Now: perChapterMs 147,987 to 400,691 ms for cloud (table above). Target: added time ≤ one extra draft call (cloud: ≤ ~90 s, from the 67.9 to 116.0 s single-call range) and no call above the 280,000 ms draft limit. Measure: perChapterMs (finish.ts:64-66) and per-task totalMs; wouldTimeOut count (finish.ts:113). Continuation calls must be measured separately; local calls need per-call timing.
7. Output truncation under product cap. Now: unmeasured; the eval floor (32,000) hides it. Target: 0 draft calls ending in a token-limit stop at the 16,000 product cap. Measure: NOT AVAILABLE. Needs either eval `maxTokens` set to the product value for drafts or a recorded stop reason per call (no stop-reason field found in eval/novel).
8. Scene split. Now: no scene metric. Target: defined only after the prompt names a scene count. Measure: NOT AVAILABLE. metrics.ts has paragraph and dialogue counts only (metrics.ts:12-14); there is no scene marker detection. Needs either scene markers the draft prompt asks for, or a rule (for example `***` lines).
9. Quality non-regression. Now: Q mean Haiku ko 3.67, en 3.78; Luna ko 3.33, en 3.67; qwen ko 2.89, en 3.00 (summary.md:12-16 and follow-up doc:12-15). Target: no drop greater than 0.1 on any run, and T2 not worse. Measure: reviewer scores (LLM-judged, manual per run; follow-up doc:34 says 1-chapter samples are too small for differences under 0.3).

## 6. Missing metrics summary
- No run-level T3 aggregate in run-summary.json (finish.ts has no length field). Current T3 values come only from metrics/01.json per run.
- No per-attempt length record in author-decisions.jsonl: logDecision writes only `{at, step, kind, answer}` (eval/novel/steps/util.ts:194-196; eval/novel/author-io.ts:249-253). Attempt length must be recomputed from chapters/*.attempt-K.md.
- No continuation or retry counter; no stop reason; no scene count; eval output cap differs from product.

## 7. Notes for design
- Threshold mismatch: follow-up doc says "부족하면" (no number, line 44); luna-6-ko.md:270 proposes a trigger at under 90%. Pick one (gate at 100% ko / 0.8 en vs trigger at 90%) before implementing.
- Prompt text "약 5000자" (draft-chapter.ts:42) should become a floor for ko; the en wording must match the harness unit.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog item A (lines 40-46): problem, to-do, metrics for T3 length guarantee.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Cross-run table of T3 values (lines 26-28, 56-58), root-cause list and candidate 1 (line 234), speed table (157-159), draft call counts (139-142), draft time (173).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - Haiku ko T3 fail: lines 17-20, 39, 45, 259, 267, 275, 295, 337.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - Haiku en T3 fail: lines 18, 42, 103-106, 158.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - Luna ko T3 fail: lines 30, 192, 206, 231, 270.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - Luna en T3 pass with thin margin: lines 21, 153, 161, 178, 214.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - Qwen ko T3 pass 109%: lines 44, 50, 36 (hanja in 3 draft attempts).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - Qwen en T3 pass 124.5%: lines 40, 48.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - lengthOk rule (lines 44-50): ko min = target, en min = 0.8 x target, max 1.3 x target; chars counted with spaces for both languages.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - Draft loop (lines 80-167): redraft only on usable=false (101, 166); metrics passed to reviewer (152); attempt files written (135).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - Author usable criteria (line 53): length is not an unusable cause.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - Product draft prompt: line 13 '목표 분량에 가깝게 쓴다.', line 42 '약 N자', line 17 DRAFT_MAX_TOKENS = 16000.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts`  - Pins the existing prompt line at line 35; will need updating if the prompt changes.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - startDraft (259-340): single startAiStream call (328-340), product maxTokens 16000 (335), no continuation branch.
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts`  - Existing lengthShortfall and shortfallMessage helpers (2-12) for reuse.
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/writing-workspace.tsx`  - Manual shortfall confirmation on completion (177-178).
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts`  - Token-limit stop throws MAX_TOKENS_MESSAGE (467).
- `/home/xogud/documents/github/DaeumHwa/src/ai/anthropic.ts`  - Stop reason asserted (177, 209); MAX_TOKENS_MESSAGE defined at 32.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - Eval output cap: maxTokens = max(product, profile floor) at line 451.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts`  - Per-model maxTokensFloor: qwen 32000 (46), haiku 32000 (81), luna 32000 (92).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - run-summary per-task counts and time (38-75, 102-113): draft count, totalMs, wouldTimeOut, perChapterMs.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - settle and logDecision path (194-197); decision record lacks metrics.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts`  - logDecision writes {at, step, kind, answer} to author-decisions.jsonl (249-253).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md`  - T3 definition (line 58): ko 5,000자 이상 공백 포함, 130% upper bound; 'en uses 6.5 conversion'.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Section 6.5 English ratio (186-202) and length target of about 5,000 ko chars (line 267).

Open questions:
- English length unit: the harness counts characters for en (metrics.ts:48-50) but summary.md:234 says 'en은 단어 범위'. Which unit does the product prompt use for en, and where does the 0.8 factor come from? I found no source for it in the spec.
- Product draft cap is 16,000 tokens (draft-chapter.ts:17) but the eval floor is 32,000 (models.ts:46/81/92, eval-client.ts:451). Should the eval be pinned to the product cap so truncation shows up in T3 results?
- Trigger threshold for a continuation is not fixed: the backlog says 'if short' (follow-up doc:44), luna-6-ko.md:270 proposes under 90%, and the T3 gate is 100% ko. Which one?
- Local continuation feasibility: qwen en's single draft took 346.6 s (summary.md:173), above the 280 s draft limit (haiku-5.5-ko.md:259). Should continuation be cloud-only, or should the timeout for local drafts be revisited?
- Is there a product-side draft length check outside the completion dialog (writing-workspace.tsx:177)? I found only the manual shortfall prompt.

## survey:A:risks

TRACK A (chapter length guarantee, T3) — neighbour and risk survey. Read-only; nothing edited.

BASELINE FACTS (verified)
- Draft prompt and system: src/ai/tasks/draft-chapter.ts:6-15 (DRAFT_SYSTEM, has only "목표 분량에 가깝게 쓴다." at :13, no minimum); DRAFT_MAX_TOKENS=16000 (:17); DRAFT_EFFORT='high' (:18); buildDraftPrompt neutralizes the whole input via neutralizeDeep (:37) and emits <target_length>약 N자 (:42).
- Draft service: src/server/ai-features.ts startDraft 259-341. Editor role check at :275 (requireWorkRole). targetChars = input.targetChars ?? work settings (:278; default 5500 per src/db/types.ts:177). Prompt built at :318, single startAiStream call at :328-338 (one ai_runs row). Tail = last DRAFT_TAIL_CHARS of previous chapter (:47).
- Result to chapter: createChapterFromDraft ai-features.ts:347-373 reads only run.output.text of ONE run (draftText :375-383) and requires run.status==='done'.
- Stream runner: src/ai/run.ts startAiStream 130-175. One run row per call (insertRun :137), timeout = timeoutOverrideMs ?? meta.timeoutMs ?? STREAM_AI_TIMEOUT_MS (:143). STREAM_AI_TIMEOUT_MS = 280_000 (:30). Structured default DEFAULT_AI_TIMEOUT_MS = 120_000 (:28). MAX_RUNNING_RUNS=3 (:23). DEFAULT_DAILY_TOKEN_LIMIT=3_000_000 (:20).
- Route: src/app/api/works/[workId]/draft/route.ts: maxDuration=300 (:14); calls startDraft (:68-74); copies textStream chunks into the body (:79); awaits done (:83-85) before closing; errors become draftErrorRecord (src/lib/draft-stream.ts:11) with generic DRAFT_FAILED_MESSAGE for non-AppError; STATUS_BY_CODE maps AI_LIMIT to 429 (:30).
- Client framing: src/lib/draft-stream.ts:5 uses \u001e as error mark; parseDraftStream :19-22 splits on it.
- Length helpers that already exist: src/lib/chapter-length.ts (lengthShortfall :2-8, shortfallMessage :10-12, Korean copy "목표 …자 중 …자(…%)입니다. 그래도 완료할까요?"). Used only in UI: writing-workspace.tsx:177-178, chapter-table.tsx:157,280. Server does not block completion (docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:119).
- Char counter: src/lib/korean/chars.ts:5 countChars(text) -> {withSpaces, withoutSpaces}. The editor uses withSpaces (writing-workspace.tsx:177).
- Work default target 5500 (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:113). Eval target 5000 ko (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:21, :315). The product minimum "공백 포함 5,000자" is therefore not the same as the product default; it must be derived from targetChars or the mismatch needs a decision.
- No guard library exists: src/ai/guards does not exist; no Han/Cyrillic/paragraph checks in src (rg). The T3/T5/paragraph logic lives only in eval/novel/metrics.ts:6-7, 43-50 (ko min = target, en min = 0.8*target, max 1.3*target).
- No `voice` field exists anywhere in src/db/schema.ts, src/ai/context.ts or chapter-extract.ts (rg empty). B's voice extraction is new work, not an extension.

EVAL HARNESS COUPLING (eval/novel)
- eval/novel/steps/chapter.ts:95-170 calls the product startDraft (:112) inside its own redo loop, maxDraftAttempts=3 (cli.ts:121; state.ts:13). Adding an in-app continuation changes the eval's draft call count and T3 outcome. Adding a product continuation AND keeping the harness redo would double-retry short chapters. The metric "draft call count" becomes ambiguous unless the continuation is counted as one call.
- Eval en path has no product analogue (product is Korean-only; work settings have no language field).

CROSS-TRACK OVERLAP (files other tracks plausibly edit)
- src/ai/tasks/draft-chapter.ts: A (prompt min length, scene budgets, continuation prompt), D (two-step draft beat list, same prompt), E1/E2 (prompt rules on paragraphs and style-sample copying: renderCard :65-71 includes card examples), C (foreign-script rule).
- src/server/ai-features.ts startDraft: A (length check + continuation), D (beat step before body), C and E1/E2 (post-draft checks). Highest collision risk; A and D both want to change the same function body.
- src/ai/run.ts: A (continuation timeout budget), F4 (local server serialization, effort switch, timeoutOverrideMs at :36-39), any cap changes.
- src/app/api/works/[workId]/draft/route.ts: A (second call streamed in the same body), C (replacing text would need non-stream path), D.
- src/server/chapter-check.ts:163-167: continuity and extraction run in parallel via Promise.allSettled. F4 says these must not run concurrently on the same local server; this is the exact collision point.
- src/ai/context.ts (462 lines): used by draft (ai-features.ts:61-65), continuity (H), extraction (G1/G2/B). Any new card kinds or voice data change all of them.
- src/ai/tasks/chapter-extract.ts (maxTokens 16000 at :85, neutralizeDeep :39): F2 (split), G1, G2, B.
- src/ai/tasks/interview-extract.ts (maxTokens 8000 at :79): G1 (dedupe needs existing facts), G2, B.
- src/ai/tasks/interview-question.ts (effort low, maxTokens 2000 at :194-195, topics :54): I, B.
- src/ai/tasks/continuity-check.ts (effort high :139, maxTokens 16000 :140, no timeoutMs set): H (more context = longer call under 120 s default), F4.
- src/ai/tasks/proofread.ts (effort medium :37, maxTokens 16000 :38): J, F1; src/server/chapter-check.ts:50 MAX_PROOFREAD_AI_CHARS=30000 and :74-85 wrapper.
- src/ai/tasks/reader-sim.ts (maxTokens 16000 :56) and src/server/ai-features.ts runReaderSimulation 58-90: F3.
- src/ai/prompt-utils.ts: every new tag section (draft continuation, length, voice, dedupe lists) must go through neutralizeDeep / neutralizeTags. Shared by A, B, G1, G2, H, J, F3.
- eval/novel/metrics.ts, eval/novel/steps/chapter.ts, eval/novel/cli.ts, eval/novel/steps/util.ts, eval/novel/run.ts (pause/resume :188): HX1, HX2, HX4, A, E1, E2, C all touch eval metrics or loop.

INVARIANTS THAT APPLY
- Korean user-facing copy: any new shortfall or failure message (for example the continuation failure) must be Korean and short. Existing copy: chapter-length.ts:12 and draft-stream.ts:8 (DRAFT_FAILED_MESSAGE).
- AppError codes: startDraft throws VALIDATION (:274), requireWorkRole throws FORBIDDEN/NOT_FOUND. The route maps codes to HTTP (route :23-31). A new AI_LIMIT during continuation must reach the route as AppError, not a raw Error.
- withAction/ActionResult: the draft is NOT a server action; it is a route handler that streams text. The "actions never throw" rule does not cover it, but errors mid-stream must still be sent as draftErrorRecord, never thrown after the body starts (route :10-11 comment).
- requireWorkRole: startDraft checks editor at :275 before any work read. A continuation must reuse the same check, not a second unchecked path.
- change_log / wiki rows / AI never writes wiki tables: draft writes nothing to wiki; the draft is returned as run output until the author calls createChapterFromDraft. A must keep that: the length check and continuation are pure text, no DB write except ai_runs.
- Asia/Seoul: daily usage uses seoulDayStart (run.ts:14 import). If a continuation adds tokens, daily usage accounting follows the same path automatically only if it goes through startAiStream.

REGRESSION RISKS
- Timeout budget: route maxDuration=300 (route:14) vs STREAM_AI_TIMEOUT_MS=280000 (run.ts:30) per call. Two sequential streamed calls can each use up to 280 s, which exceeds the route's 300 s. A continuation must receive the remaining budget (deadline) or the first call must be capped. The 120 s figure in the task text is the structured default (run.ts:28); draft streams use 280 s. Treat "120 s product timeout" as applying to structured calls only; please confirm.
- Token limits: DRAFT_MAX_TOKENS 16000 (draft-chapter.ts:17) is shared by the first draft and any continuation; the continuation's maxTokens must be computed from remaining characters, not reused blindly. Effort high (:18) may consume output budget before text; eval evidence on Korean token use is in docs/eval/novel/2026-10-18/summary.md section 4.3.
- Output ownership: run.output holds one text (ai-features.ts:375-383). If the continuation is a second ai_runs row, createChapterFromDraft loses the continuation text. Either merge text into the first run's output before done resolves, or change createChapterFromDraft. This must be decided.
- Daily limit mid-draft: if the second call hits AI_LIMIT after streaming already sent text, the client sees a partial draft plus an error record (route :79-87). The stored run must still be consistent.
- Prompt injection: the previous draft text fed into a continuation prompt is model output; it must be neutralized (neutralizeDeep or neutralizeTags) and placed inside a tagged section covered by TAG_DATA_RULE (draft-chapter.ts:14). Style-card examples (renderCard :69) are copied verbatim into the prompt; E2 needs them as the comparison set.
- Streaming: the continuation text is appended to the live stream (route :79). The client shows both parts; any later replacement cannot be streamed. Client framing uses \u001e (draft-stream.ts:5); the continuation must never emit that byte. Length is known only after the stream ends (length check after `done`), so the author sees a short first part before the continuation.
- Eval drift: changing DRAFT_SYSTEM or buildDraftPrompt changes the eval's measured prompt for every model in docs/eval/novel; new results are not comparable to 2026-10-18 without a new date folder (per docs/eval/novel/README.md 3절, and follow-up doc section 1).
- Count basis: use countChars(...).withSpaces (src/lib/korean/chars.ts:5), the same basis as writing-workspace.tsx:177 and chapter-length.ts, so the server and editor agree.

MINIMAL PUBLIC INTERFACE (proposal, TypeScript)
// src/lib/korean/chars.ts (existing) countChars(text: string): { withSpaces: number; withoutSpaces: number }

// src/ai/tasks/draft-chapter.ts
export function draftMinChars(targetChars: number, ratio?: number): number   // ratio default decided by author (open Q1)
export type DraftPromptInput = { ...existing fields; minChars: number }      // extend, do not rename
export function buildContinuationPrompt(input: {
  instructions: string; targetChars: number; minChars: number;
  draftSoFar: string; chapterLabel: string;
}): string                                                                     // draftSoFar neutralized inside <draft_so_far>
export const CONTINUATION_MAX_TOKENS: number                                   // derived from remaining chars, not a constant

// src/server/ai-features.ts (A calls it; route unchanged except for passing deadline)
export type DraftLengthCheck = { charCount: number; minChars: number; short: boolean }
export function checkDraftLength(text: string, targetChars: number): DraftLengthCheck   // pure
export async function continueDraft(
  db: Db, actor: Actor,
  input: { workId: string; runId: string; remainingChars: number },
  client?: AiClient, signal?: AbortSignal,
): Promise<{ textStream: AsyncIterable<string>; done: Promise<string> }>       // editor role; at most one call; merges output into the first run

// Shared guard library (new, src/ai/guards/index.ts) for A, C, D, E1, E2, J
export type GuardIssue = { kind: 'length' | 'script' | 'paragraph' | 'repeat' | 'copy'; message: string; excerpt?: string }
export function checkDraftText(text: string, opts: { targetChars: number; styleExamples?: string[] }): GuardIssue[]

OPEN QUESTIONS FOR THE AUTHOR
1. Minimum length: fixed "공백 포함 5,000자" (eval target) or derived from the work's targetChars (default 5500, spec 2026-10-16 line 113)? If derived, what ratio (for example 0.9)?
2. Continuation policy: at most one call? Append only, or replace? If the continuation fails, keep the partial text (matches harness rule in eval/novel/steps/chapter.ts:126-128)?
3. Continuation as a separate ai_runs row or merged into the first run's output? This decides createChapterFromDraft and usage accounting.
4. Timeout budget: give the continuation the remaining route time (300 s minus first call), or lower STREAM_AI_TIMEOUT_MS? Is the "120 s product timeout" meant for structured calls only?
5. Should the product auto-continue, or only show the existing shortfall prompt (chapter-length.ts:12) so the author decides? The current spec makes completion non-blocking (2026-10-18 interview-ai-reliability design line 119).
6. Eval loop: when the product continues, should the harness redo loop (maxDraftAttempts=3) be turned off for T3 so calls are not double counted? How is a continuation counted in "draft call count"?
7. English: product has no English mode. Should A apply only to Korean, with the eval's 0.8-word rule left to the eval?
8. Scene budgets: come from D's beat list (not yet built). Ship A without per-scene budgets first, or wait for D?
9. Should the author's guideline (eval side, not product) stop treating a short chapter as "no need to rewrite" (summary.md section 5, row 1)? That changes the eval measurement itself, so it needs a new date folder.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-18, 36-63 - Draft system prompt (:6-15), token/effort constants (:17-18), buildDraftPrompt (:36-63). Core of A and D/E1/E2/C collisions.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 253-383 - startDraft (:259-341) calls startAiStream once; createChapterFromDraft reads one run's output (:347-383). Main place for A's length check and continuation.
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 20-30, 130-175 - Timeouts (:28-30), run caps (:20-23), startAiStream (:130-175). Continuation timeout budget and F4 serialization live here.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` 14, 23-31, 67-90 - Streams draft text, maxDuration 300 (:14), error record framing (:33-46, :79-87), STATUS_BY_CODE (:23-31).
- `/home/xogud/documents/github/DaeumHwa/src/lib/draft-stream.ts` 5-22 - \u001e error mark framing for the client (:5-22). Continuation must not emit the mark.
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts` 1-13 - Existing shortfall helpers and Korean copy (:2-12). Reuse for A's copy.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts` 5-9 - countChars withSpaces basis (:5). Use on the server for T3.
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts` 5-26 - TAG_DATA_RULE (:5-6), neutralizeTags (:12-14), neutralizeDeep (:17-26). Required for any continuation input.
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 44-56, 74-85, 122-170 - Parallel continuity and extraction via Promise.allSettled (:163-167), proofread cap (:50). F4 and F1/J collision point.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 137-145 - effort high, maxTokens 16000, no timeoutMs (:137-145). H and F4.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/chapter-extract.ts` 22, 35-40, 82-89 - Extraction task (:82-85). F2, G1, G2, B collision.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 25-40 - Proofread task (:35-40). J, F1.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/reader-sim.ts` 53-64 - Reader simulation task (:53-64). F3.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 1-85 - Eval T3 and T5 rules (:6-7, :43-50). Duplicate of any product guard; must be kept in step with A/E1/E2/C.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 95-170 - Eval redo loop calling startDraft (:95-170). Double-retry risk with A's continuation.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 121 - maxDraftAttempts: 3 (:121).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 26-28, 56-58, 206-234 - T3 evidence: 70.1 / 75.2 / 69.5 percent (:26-28, :56-58, :208-210) and the fix row (:234).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 40-47, 82-91 - Backlog section A (:40-47) and F (:82-91).
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts` 25-40 - Pins the exact DRAFT_SYSTEM lines (:26-39); any prompt change must update this test.

Open questions:
- Minimum length: fixed 공백 포함 5,000자 (eval target) or derived from the work targetChars (default 5500)? If derived, what ratio?
- Continuation policy: at most one call? Append only or replace? Keep the partial text on failure?
- Continuation as a separate ai_runs row or merged into the first run output (createChapterFromDraft reads one run)?
- Timeout budget: give the continuation the remaining route time (maxDuration 300 vs 280 s per stream call), or lower STREAM_AI_TIMEOUT_MS? Confirm whether the 120 s product timeout means structured calls only.
- Auto-continue in the product, or only show the existing shortfall prompt (src/lib/chapter-length.ts) and let the author decide?
- Eval: turn off the harness redo loop for T3 (eval/novel/cli.ts maxDraftAttempts 3) so a continuation is not double counted, and define how a continuation counts in draft call count?
- English: the product has no English mode; should A apply only to Korean?
- Scene budgets depend on D's beat list, which does not exist yet. Ship A without per-scene budgets first?
- The author guideline (eval side) that treats a short chapter as no reason to rewrite: change it in a new date folder, since it changes the measurement?

## survey:A:specs

Read-only survey for Track A (chapter length guarantee, T3). No repo files were changed; no git state commands were run.

WHAT THE TRACK TOUCHES (current code, verified): draft prompt has only a soft rule "목표 분량에 가깝게 쓴다" (src/ai/tasks/draft-chapter.ts:13) and passes "약 ${targetChars}자" (:42). DRAFT_MAX_TOKENS=16000, DRAFT_EFFORT='high' (:17-18). startDraft builds the prompt and calls startAiStream once (src/server/ai-features.ts:318-336); targetChars defaults from work settings (:278). Stream timeout is STREAM_AI_TIMEOUT_MS=280000 (src/ai/run.ts:30). Route maxDuration/zod: src/app/api/works/[workId]/draft/route.ts:19 allows targetChars 500-20000. A lengthShortfall helper and warning already exist (src/lib/chapter-length.ts, specified in docs/superpowers/plans/2026-10-18-interview-ai-reliability.md:175).

CONSTRAINING REQUIREMENTS:
1. Target length is a per-work setting, default 5500: MVP spec docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:113 (WorkSettings.targetChars default 5500); plan docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:135.
2. Draft is a streamed text run; text is NOT written to the manuscript directly. Buttons "새 회차로 만들기" (source ai_draft) and "현재 원고 끝에 붙이기": MVP spec :264-265. Draft input includes author instruction, target chars, selected characters; previous summary plus last 1,500 chars: MVP spec :264 (code ai-features.ts:299 uses DRAFT_TAIL_CHARS=1500).
3. Only completed runs become chapters; a cancelled draft keeps text but allows only "현재 원고 끝에 붙이기": interview-reliability spec docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:107.
4. Cancel/timeout runs are recorded as ai_runs status error, never running (same spec :103; anti-goal :48, running slots limit 3).
5. Timeouts: streaming draft 280 s default (spec :101); SDK retries reduced to 1 (spec :100). task may override via timeoutMs (:101).
6. Completion below target only WARNS, server never blocks: spec :119 (text "목표 5,500자 중 4,265자(78%)입니다. 그래도 완료할까요?"). Shortfall rule also in plan :175.
7. Route handlers that call AI: maxDuration = 300 (CLAUDE.md; spec :124). A two-call draft (draft + continuation) that runs sequentially can exceed 300 s if the first call takes more than ~20 s, since each stream may use up to 280 s. This is an open risk, not yet addressed in any spec.
8. Zod schema constraints (min/max/regex/default/optional banned) apply to structured output only (spec :127). Draft is text, so not directly binding, but any continuation that moves to structured output is bound.
9. Tests never call real AI; fake paths are not allowed in runtime code (spec :128, anti-goal :45, decision 5A :55-57).
10. Eval T3 criterion (the track's "T3" means this): docs/eval/novel-quality-criteria.md:58 = Korean >= 5,000 chars with spaces, AND <= 130% of target. The 130% upper bound must survive any continuation prompt. For a 5,500 target, the upper bound is about 7,150. The "5,000 minimum" must not be hard-coded where work targetChars can be 500-20000 (route :19).
11. Eval author redo rule: docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:150 lists only four unusable draft conditions (empty, truncated, other language, non-body text). Short length is NOT one of them. Redos max 2: :150 and :345. This is a harness policy; the track's in-app continuation does not change it, but harness metrics for "draft call count" will now count the app's internal continuation call. Decide how to count it (log per call in calls/NNN-<task>.json as per spec :276).
12. Eval targets: Korean target 5,000 chars (spec :267, plan docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:315 ko.targetChars === 5000). English ratio is set by spec 6.5 (:202). Plan :535 defines en lower bound as 0.8*target and ko as target; neither 0.8 nor a separate en floor appears in the criteria doc or the spec. Flag this.
13. Backlog item A (docs/eval/novel/follow-up-ai-improvement.md:40-47): post-draft code count, one continuation request if short, prompt minimum "공백 포함 5,000자 이상" and per-scene split. Metrics (:46): T3 pass count, draft call count, time. The backlog also says "작가 지침도 분량 부족을 다시 쓸 사유로 보지 않았다" (:42); the author-guideline text itself is not in the specs.

DECISIONS ALREADY MADE (do not re-litigate): demo/fake mode removed (interview spec §5A); cancel/timeout semantics (§5D); completion warning only, no server block (§5F :119); draft not auto-written to manuscript (MVP :265); targetChars 5500 default (MVP :113); T3 threshold 5,000 min + 130% max (criteria :58); draft effort high / max tokens 16000 (MVP table :348, code draft-chapter.ts:17-18); eval uses Sonnet author with no deterministic judge (eval spec :175).

CONTRADICTION RISKS for Track A: (a) a fixed "5,000자 이상" in the prompt contradicts works whose targetChars is below 5,000 (route allows 500); (b) a continuation that overshoots 130% breaks T3's upper bound; (c) the existing draft prompt says "약" (about) and "가깝게" (close to), so a minimum wording is a change in product intent that the specs did not pre-approve; (d) the two-call flow vs maxDuration 300 (item 7); (e) continuation must keep the single-run cancel and ai_runs rules (items 3-4), so the continuation must be part of the same run or be recorded as its own run.

No spec or plan defines a continuation step, minimum-length prompt, per-scene length split, or character-count gate for drafts. Those are new in this track and are not contradicted by any spec, but they are not pre-approved either.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 40-47 - Backlog item A (lines 40-47) defines the Track A change, the evidence (line 42), and the metrics (line 46)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md` 58 - T3 threshold: Korean >= 5,000 chars with spaces, <= 130% of target; English uses spec 6.5 ratio
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 113, 264-265, 348 - WorkSettings.targetChars default 5500; F13 draft flow; draft result handling; draft-chapter effort/stream table
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 42-48, 55-61, 100-107, 119, 124-128 - Timeouts (101), SDK retry (100), cancel and ai_runs rules (103, 107), anti-goals (42-48), completion shortfall warning (119), route maxDuration/zod/tests constraints (124-128), demo removal (55-61)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 150, 202, 212, 267, 276, 345 - Draft redo rule and its four unusable conditions (150), draft in turn loop (212), Korean target 5,000 (267), 6.5 ratio (202), redo max 2 (345), per-call logging (276)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 315, 535 - Eval plan: ko.targetChars === 5000 (315), lengthOk definition with an unspecified 0.8*target en floor (535)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md` 170-175 - lengthShortfall/shortfallMessage contract (175) already implemented in src/lib/chapter-length.ts
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md` 135, 648-662 - Default targetChars 5500 (135); draft-chapter prompt spec with '목표 분량에 가깝게 쓴다' (648-657); draft route body (662)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 13, 17-18, 42 - Current draft prompt rules (13) and target_length tag (42); DRAFT_MAX_TOKENS 16000 (17), DRAFT_EFFORT high (18)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 278, 299, 318-336 - startDraft: targetChars default from settings (278), tail 1500 (299), single startAiStream call with DRAFT_MAX_TOKENS (318-336)
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 30, 43-93 - STREAM_AI_TIMEOUT_MS = 280000 (30); timeoutMs and signal handling (43-93)
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` 18-19 - targetChars zod bounds 500-20000 (19); the route is the caller of the stream
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts` whole file - Existing lengthShortfall helper (must not be duplicated by Track A)

Open questions:
- Should the minimum be fixed at 5,000 (as the backlog and T3 criteria say) or derived from the work's targetChars (route allows 500-20000; default 5500)? Specs do not decide this.
- Does a continuation count as a second draft call in the eval metrics ("초안 호출 횟수") and in ai_runs, and must it be one run for cancel/timeout and the completed-run rule (interview spec :103, :107)?
- How is the two-call flow kept inside the 300 s route maxDuration (CLAUDE.md, spec :124) when each stream may take up to 280 s (run.ts:30)? No spec addresses this.
- Plan line 535 uses 0.8*target as the English floor, and no spec or criteria line defines that 0.8. Is it intended, or should the harness match T3 exactly?
- The eval author redo rule (spec :150) does not treat short length as unusable. Should the author agent ever redo a short draft, or is the in-app continuation the only fix?
- Does a continuation prompt need the 130% upper bound (criteria :58) written into it, so a continuation does not overshoot?

## survey:A:tests

TRACK A (chapter length guarantee, T3) - read-only test map. No repo files were changed.

KEY FINDINGS
1. One draft = one startAiStream call = one ai_runs row. startDraft (src/server/ai-features.ts:328-340) returns that stream directly. A continuation call would be a second run, and createChapterFromDraft (ai-features.ts:347-373, via draftText at :375-381) reads only run.output.text of the run it is given. Unless the merged text is stored on one run, the saved chapter loses the continuation. The design must choose: merge into the first run's output, or add a run-linking field.
2. The route waits for `done` before closing the body (src/app/api/works/[workId]/draft/route.ts:79-83). Its maxDuration is 300 (route.ts:14). STREAM_AI_TIMEOUT_MS is 280000 per call (src/ai/run.ts:30), and callSignals is per call (run.ts:143-144). Two sequential high-effort calls can exceed 300 s. Test or measure this.
3. FakeAiClient (src/test/fake-ai.ts:34-44) returns the same text for every call. Overrides (fake-ai.ts:12-13, 54-63) receive only task.input, and startDraft passes input: { instructions } only (ai-features.ts:333). A continuation test cannot tell calls apart by input. Use the existing vi.spyOn(client, 'streamText') pattern (ai-features.test.ts:234, 249) and count spy.mock.calls, or add a distinguishing field to the task input.
4. The default fake draft is far below the default target. fakeDraft (src/test/ai-fakes/draft-chapter.ts:14-25) is about 600+ characters (draft-chapter.test.ts:72). The default target is 5500 (src/db/types.ts:177). So any new post-draft length check will fire on almost every existing draft test unless the test fake is changed or the check is gated.

TEST FILES AND FIXTURES (what they assert)
- src/ai/tasks/draft-chapter.test.ts: L26-39 asserts DRAFT_SYSTEM equals an exact 9-line array (uses TAG_DATA_RULE). Adding or changing a rule line breaks it. L41-53: prompt includes instructions, cards, wiki, previous context, and '5500' (L51). L55-63: missing context shows '(없음)'. L66-83: fakeDraft starts with '(데모 초안) ', has 6 paragraphs, length >= 600. L87-117: closing-tag isolation and TAG_DATA_RULE in the system prompt.
- src/server/ai-features.test.ts (describe 'draft', L173-321): L182-189 empty instructions gives VALIDATION. L191-208 streamed text equals done text, starts with the demo marker, and run row has task draft-chapter, status done, output { text }. L210-257 prompt contains work and selected cards, previous summary, tail, and '3000' (targetChars given as 3000 at L243, asserted at L255). L259-274 the label is not doubled. L276-298 createChapterFromDraft gives body equal to text, title '초안', and version source ai_draft. L300-307 unknown run gives NOT_FOUND. L309-320 viewer gives FORBIDDEN. Helpers: setup() at L29, createTestChapter/createTestEntry/createStyleCard used.
- src/app/api/works/[workId]/draft/route.test.ts: mocks session and getDb (L17-24), setAiClientForTests(new FakeAiClient()) in beforeEach (L50). L53-78 401, 400, 404. L80-90 text/plain, X-Run-Id header, text starts with the demo marker. L92-116 run done before body closes (SlowFinalClient). L118-142 midway failure appends the error record. L144- generic error for unexpected failure.
- src/lib/chapter-length.test.ts: L5-12 lengthShortfall(4265, 5500) gives {percent: 78}, null at or over target, null for target 0. L21-23 shortfallMessage text. These are the existing client-side helpers.
- src/lib/draft-stream.test.ts: L9-41 draftErrorRecord and parseDraftStream (text, error, incomplete record, non-string error).
- src/components/writing/panels/draft-panel.test.tsx: L118-180+ (fetch mocked with draftResponse, L93): complete draft shows new-chapter button; a broken stream keeps partial text, append only; cancel marks stopped; error record shown and dropped from text. Any change to the stream protocol must keep these.
- src/components/chapters/chapter-table.test.tsx L137-201: completing under target asks for confirmation (targetChars 5500, charCount 4265); at or over target completes directly.
- src/ai/run.test.ts: L405-431 startAiStream stores streamed text as output; L531 timeout passed to client; L271-320 3-concurrent-run limit (MAX_RUNNING_RUNS=3, run.ts:23). A new run per continuation would count against this limit.
- src/lib/korean/chars.test.ts covers countChars (src/lib/korean/chars.ts:5-13, excludes CR/LF, counts withSpaces and withoutSpaces). This is the editor's counting rule (writing-workspace.tsx:176, chapters.ts:227). Note: factories.ts:61 sets charCount to body.length, which differs.
- eval/novel/metrics.test.ts L5-30: chapterMetrics lengthOk. ko min = target, en min = 0.8 x target, max 1.3 x target (eval/novel/metrics.ts:44-50). Unchanged unless the eval rule changes.
- eval/novel/steps/chapter.ts L95-160: the eval already has its own attempt loop (maxDraftAttempts, author draft_review). It calls startDraft directly (L112-124) and computes chapterMetrics (L152). Changing startDraft changes eval behaviour too. eval/novel/agents/author.md:53 says length is not a reason for usable=false. This is why the author never rewrites short chapters.

FACTORIES AND FAKE WIRING
- src/test/factories.ts exports: createTestUser (L20), createTestWork (L33), addTestMember (L50), createTestChapter(db, workId, {position?, body?, title?, ...}) (L59-85; body defaults to '' and charCount = body.length), createTestEntry (L87), createTestFact (L105), createTestThread (L132).
- src/test/db.ts: createTestDb() (L8). src/test/setup.ts is the global setup.
- Wiring: FAKE_TEXT['draft-chapter'] = fakeDraft (src/test/ai-fakes/index.ts:27-29). FakeAiClient.streamText splits the text into 40-char chunks (fake-ai.ts:6, 67-75). setAiClientForTests (src/ai/index.ts:23) sets the client used by the route test and by run.ts when no client is passed.

EXACT VITEST COMMAND
pnpm vitest run src/ai/tasks/draft-chapter.test.ts src/lib/chapter-length.test.ts src/lib/draft-stream.test.ts src/server/ai-features.test.ts "src/app/api/works/[workId]/draft/route.test.ts" src/components/writing/panels/draft-panel.test.tsx src/ai/run.test.ts src/lib/korean/chars.test.ts --maxWorkers=2
Add src/components/chapters/chapter-table.test.tsx if chapter-length or the complete dialog changes. Add eval/novel/metrics.test.ts only if the eval T3 rule changes.

EXISTING TESTS THAT WOULD BREAK OR NEED CHANGE
- draft-chapter.test.ts L26-39: exact DRAFT_SYSTEM line array. Breaks on any system-prompt edit (adding the minimum length and scene split rule). Update the expected array.
- draft-chapter.test.ts L51: '5500' still passes if targetChars stays in the prompt, but a new minimum line like "5,500" formatting would not match '5500'. Keep the raw number or update the test.
- ai-features.test.ts L191-208 (streams fake text, output equals { text }) and L210-257: default target 5500 is above fake output length, so a length check would trigger a second call. The stored output or spy count would change. Gate the continuation, or have the test fake meet the target.
- route.test.ts L80-116: same issue. The continuation adds text to the body. The check "starts with (데모 초안)" still holds, but any exact-body assertion would change.
- draft-panel.test.tsx: unaffected if the stream protocol stays the same. Any new continuation UI text needs its own test.
- run.test.ts concurrency and startAiStream tests: unaffected unless startAiStream is changed. A second run per draft would count toward the 3-run limit (run.ts:221-224).
- fakeDraft (ai-fakes) if its length is changed: draft-chapter.test.ts L72-78 expects >= 600 and six paragraphs.

NEW TEST CASES (name | input | expected)
A. src/lib/chapter-length.test.ts (new helper, name it e.g. needsContinuation)
 1. "asks for a continuation when the draft is under 90% of the target"? (no spec number given; choose and record as a design decision) | 4265 chars, target 5500 | true.
 2. "does not ask when the draft reaches the target" | 5500, 5500 | false.
 3. "counts only the characters the editor counts" | text with CR/LF and spaces, use countChars | count excludes CR/LF, includes spaces.
B. src/ai/tasks/draft-chapter.test.ts
 4. "prompt states a minimum length and per-scene budget" | promptInput with targetChars 5500 | prompt contains "5,500자 이상" or "공백 포함 5,000자 이상" (decide the exact rule) and a per-scene budget line.
 5. "system prompt exact line array includes the minimum length rule" | none | updated exact array (replaces L26-39).
 6. "continuation prompt includes the first part and a continue-only instruction" | new buildContinuationPrompt, input: draft text 3000 chars, target 5500 | contains the previous text, "이어서" and the remaining target count (2500).
C. src/server/ai-features.test.ts (draft describe)
 7. "requests one continuation when the first draft is short" | FakeAiClient with overrides so the first stream is 'short' text (use a spy on streamText, overrides cannot tell calls apart) and target 5500 | streamText called exactly 2 times; second prompt contains the first text.
 8. "does not continue a draft that already reaches the target" | stream output of 5600 chars | streamText called once.
 9. "caps continuation at one extra call even if still short" | output still 1000 chars after continuation | exactly 2 calls, no third call, no error.
 10. "stores the joined text so createChapterFromDraft keeps the continuation" | short first + continuation, then createChapterFromDraft | chapter body equals first + continuation; run output text equals joined text (or the second run is linked; decide).
 11. "keeps the first text when the continuation fails" | continuation throws AI_ERROR | done rejects or resolves with first text (design decision); the author sees the error; the first text is not lost in the route body.
 12. "continuation is skipped when the author cancels" | abort signal before continuation | no second call; CANCELLED.
D. src/app/api/works/[workId]/draft/route.test.ts
 13. "streams the continuation after the first part in one body" | FakeAiClient short first, continuation text | body = first + continuation; X-Run-Id set; status 200.
 14. "sends no error record when the author aborts during the continuation" | abort after first chunk | no \u001e record.
 15. "marks the continuation failure with the Korean error record after the text" | continuation rejects with timeout message | body = first + draftErrorRecord(timeout).
E. src/components/writing/panels/draft-panel.test.tsx (only if UI shows continuation)
 16. "shows that the draft is being extended when the server starts a continuation" | stream sends a marker or separate event | status text visible. Requires a protocol decision; currently no marker exists (draft-stream.ts only has the error record).
F. src/ai/run.test.ts (only if a second run row is created)
 17. "two draft calls produce two ai_runs rows that the same draft references" | two startAiStream calls | rows count 2 and link field set.
G. Metrics (not unit tests, measured by the eval harness): T3 pass count (eval/novel/metrics.ts:50), draft call count (ai_runs per chapter), wall time per chapter (run-summary speed.perChapterMs).

OPEN QUESTIONS
- Where the continuation text is stored (one run output vs. linked runs). This decides test 10 and createChapterFromDraft.
- Whether the minimum-length rule is "5,000 characters" (fixed) or the work's targetChars (settings default 5500, src/db/types.ts:177). The spec and backlog say "공백 포함 5,000자 이상", but the route allows targetChars 500-20000 (route.ts:19).
- Whether the 300 s route maxDuration covers two calls (see finding 2).
- Whether the eval reviewer should count a length-only retry as a retry (eval/novel/steps/chapter.ts:95-160).

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - Draft system prompt (L6-15), limits (L17-18), prompt builder buildDraftPrompt (L36-63) with <target_length> (L42)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - startDraft (L259-341): target default (L278), prompt build (L318-326), single startAiStream (L328-340); createChapterFromDraft (L347-373); draftText (L375-381)
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - startAiStream (L135-190), per-call done stores output {text} (L167-175), MAX_RUNNING_RUNS (L23), STREAM_AI_TIMEOUT_MS 280000 (L30), per-call timeouts (L143)
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts`  - Route: maxDuration 300 (L14), body limits (L19), stream loop and done wait (L79-83), error record (L85)
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.ts`  - Client-side shortfall helpers lengthShortfall (L2-8), shortfallMessage (L10-12)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts`  - countChars (L5-13): the editor counting rule
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx`  - Client stream reader (streamDraft L59-100), write() (L102-132), TARGET_MIN/MAX (L24-25)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts`  - fakeDraft, the stand-in text (about 600+ chars), used by FakeAiClient
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts`  - FakeAiClient: same text for every call; overrides get task.input only (L12-13, L34-44, L54-63)
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts`  - Exports createTestUser/Work/Member/Chapter/Entry/Fact/Thread (createTestChapter L59-85)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts`  - Exact DRAFT_SYSTEM array (L26-39) and prompt tests that a prompt change breaks
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts`  - Draft tests L173-321 (fake streaming, prompt contents, createChapterFromDraft, FORBIDDEN)
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.test.ts`  - Route tests L40-150+ (401/400/404, stream headers, done before close, error records)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.test.tsx`  - Stream result UI tests L118-180+
- `/home/xogud/documents/github/DaeumHwa/src/lib/chapter-length.test.ts`  - Tests for lengthShortfall and shortfallMessage (L4-25)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - T3 rule: ko min = target, en min = 0.8 x target, max 1.3 x (L44-50)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - Eval draft loop calls startDraft (L112-124), has its own attempts (L95-160), metrics (L152)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - Author rule (L53): length is not a reason for usable=false
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog item A (section 2.A): the T3 fix and metrics

Open questions:
- Where continuation text is stored: merged into the first run's output, or in linked ai_runs rows. This decides the createChapterFromDraft behaviour and test 10.
- Minimum length rule: fixed 5,000 characters (per the backlog wording) or the work's targetChars (default 5500, src/db/types.ts:177; route allows 500-20000 at route.ts:19).
- Whether two sequential draft calls fit the 300 s route maxDuration (route.ts:14), given a 280 s per-call stream timeout (run.ts:30). Measure before merging.
- Whether the eval's own length-driven retries (eval/novel/steps/chapter.ts:95-160) should change with the app fix, so that T3 pass counts stay comparable with 2026-10-18.
- Exact continuation threshold (the backlog says a continuation is requested when short, but no percentage is given). Test 1 assumes the existing lengthShortfall rule (any shortfall).


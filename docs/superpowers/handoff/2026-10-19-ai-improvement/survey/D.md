# Track D: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:D:code

Code map for Track D (scene consistency self-review, two-step draft). Read-only survey; nothing was edited. Repo is on main (no local Track D branch exists: `git branch` shows only main), so the "LOCAL branch" wording in the task has nothing to check out. Line numbers are from the working tree at main.

DATA FLOW (current)
1. Entry A (app): UI draft-panel.tsx:59-64 POSTs to src/app/api/works/[workId]/draft/route.ts:48-107. Route calls startDraft (route.ts:68-74) and streams textStream back (route.ts:76-92).
2. Entry B (eval): eval/novel/steps/chapter.ts draft step (80-180). It calls startDraft inside withModelRetry (chapter.ts:111-124), writes each attempt to chapters/NN.attempt-N.md (chapter.ts:135), then consults the author (draft_review, chapter.ts:143-158). The chosen attempt is saved through createChapterFromDraft (chapter.ts:169-177).
3. Service: src/server/ai-features.ts startDraft (259-341). It loads the chapter, previous tail and summary, style cards, and context pack (buildContextPack, 313-317). It builds the prompt with buildDraftPrompt (318-326), then calls startAiStream with task 'draft-chapter', DRAFT_EFFORT, DRAFT_MAX_TOKENS and DRAFT_SYSTEM (328-340).
4. Prompt and system text: src/ai/tasks/draft-chapter.ts. DRAFT_SYSTEM (6-15), DraftPromptInput (20-34), buildDraftPrompt (36-63), renderCard (65-71).
5. Streaming: src/ai/run.ts startAiStream (135-190) inserts the ai_runs row, calls client.streamText, and on finish stores output {text} (167-189). src/ai/types.ts (26-48) defines StreamTextArgs and AiClient.
6. Text back: createChapterFromDraft (ai-features.ts 347-371) reads run.output.text via draftText (373+) and requires run.task === 'draft-chapter' (358).
7. Continuity check: chapter-check.ts runChapterCheck (126-312) runs continuityCheckTask (ai/tasks/continuity-check.ts 137-163) in parallel with chapter extraction. It calls resolveContinuityIssues (119-135), writes issues via replaceOpenIssues (231-236), and returns issue rows. Each issue has quote, quoteStart, quoteEnd, severity, factId, entryId, wikiExcerpt, explanation, suggestion.
8. Human path: check-panel.tsx resolve (~106-112) and applyFix (~116-122) replace the quote in the editor with issue.suggestion. The check UI and resolveIssueAction are the only way body text changes from an issue today.
9. Eval continuity step: chapter.ts continuity (280-324). It reads open issues, builds a Pending of kind 'continuity' whose items include severity (author-io.ts ContinuityItemSchema 52-59, Pending 99-104), then consults the author. For each decision it calls resolveIssue (chapter.ts 313-320). It does NOT change the chapter body. This is the reason the continuity findings never reach the text.
10. Eval proofread step (chapter.ts 182-261) is the only eval step that saves body (saveChapter 238-243, expectedVersion), writes chapters/NN.md (244) and metrics/NN.json (254-259). Order per chapter from state.ts buildPlan (61-77): advice, draft, proofread, check, continuity, proposals, reader.

HOOK POINTS (smallest diff)
A. Two-step draft (beat list then prose). Hook inside startDraft, ai-features.ts 318-326. Insert an awaited beat call before buildDraftPrompt and pass the result as a new OPTIONAL field beats?: string on DraftPromptInput (draft-chapter.ts 20-34), rendered as an extra <beats> block in buildDraftPrompt (36-63). Because the field is optional, existing buildDraftPrompt call sites keep compiling (localize.test.ts:298 and draft-chapter.test.ts). startDraft's public signature (259-271) does not change, so both the route (route.ts:68) and the eval (chapter.ts:112) pick up the change with no edits. The beat call should be a separate task with its own ai_runs row. Add its name to AI_TASKS in src/db/types.ts 142-152 (ai_runs.task is a plain text column, schema.ts:537, so no migration). Use runAiTask (ai/run.ts 82-129) with a new AiTaskDef (types.ts 51-61) in a new file under src/ai/tasks/. Keep the prose run as 'draft-chapter' so createChapterFromDraft (358) still accepts it. Do not put beats into DRAFT_SYSTEM unless you accept updating the pinned test at draft-chapter.test.ts:27-38. Adding a rule to the user prompt instead keeps that test green.
B. Rewrite only the flagged scene. Hook in eval chapter.ts continuity (280-324), in the loop at 313-320 after resolveIssue. For each decision with valid === true whose review item has severity === 'high' (severity is already on the Pending item, so no DB read), call a new service function. It should load the chapter body, locate the scene that contains quoteStart/quoteEnd, ask the model for a rewrite of only that scene with the explanation, suggestion and wikiExcerpt in the prompt, and apply the replacement with applySuggestions (eval/novel/steps/util.ts 283-306), which already checks quote spans. Then save with saveChapter (chapters.ts 321+, expectedVersion, as proofread does at chapter.ts 238-243). Wiki sentences can come from buildContextPack plus renderContextPack (ai/context.ts 114, 308) using the issue's entryId/factId, or from the pack already stored for the check.
C. Scene boundary helper does not exist. src/lib/korean/sentences.ts (splitSentences 10-41, sentenceAt 44-46) is sentence-level only. src/lib/import/split.ts:38 is chapter and size chunking, not scene. A new pure helper (for example src/lib/scene.ts) is needed, splitting on blank lines or scene-break markers.
D. Stale artifacts after a body rewrite in eval: chapters/NN.md is read later as textFile (chapter.ts 298, 346) and metrics/NN.json is computed only in proofread (chapter.ts 254-259). The rewrite step must either rewrite chapters/NN.md and recompute metrics, or the metrics stay stale for the continuity-rewritten text.

CALL SITES THAT CHANGE IF SIGNATURES CHANGE
- startDraft (ai-features.ts 259): route.ts:68, eval/novel/steps/chapter.ts:112, src/server/ai-features.test.ts 192, 235, 263, 277, 313. No change needed if only internals change.
- buildDraftPrompt (draft-chapter.ts 36): ai-features.ts 318, src/ai/tasks/draft-chapter.test.ts 42, 56, 89, eval/novel/localize/localize.test.ts 298. Keep the new field optional.
- DRAFT_SYSTEM (draft-chapter.ts 6): draft-chapter.test.ts 27-38 (exact lines), e2e/ai-stub/responders.ts 6 and 45 (matched by exact system string), e2e/ai-stub/responders.test.ts 7, 160, eval/novel/eval-client.test.ts 28, 136 onward. Changing it breaks several pinned tests.
- AI_TASKS in db/types.ts 142-152: adding a task requires FAKE_OUTPUTS or FAKE_TEXT entries if tests use the new task (src/test/ai-fakes/index.ts 14-29, typed Partial, so optional). For e2e, an unknown system prompt throws UnknownSystemError (e2e/ai-stub/responders.ts ~54), so a new beat task reached by the e2e app needs a responder entry near line 45.
- resolveIssue, replaceOpenIssues, runChapterCheck: no change needed for either track item.

EVAL TEST FAKES
- fake-author.ts 45-53 approves all continuity items with valid: true. Under the fake author every high-severity issue would trigger a rewrite, which matters for test cost. Change the fake or set a flag if you want the rewrite to be tested separately.
- eval/novel/steps/finish.test.ts and state.test.ts cover plan shape. Adding a rewrite inside continuity does not change buildPlan (state.ts 61-77). Adding a new step key would.

COST AND SHAPE NOTES
- Each chapter currently makes: draft (1 stream), check (2 generateObject in parallel), proofread, reader, plus advice from chapter 2. Two-step draft adds 1 non-stream call per attempt (up to maxDraftAttempts = 3 per chapter, chapter.ts 95-101, cli.ts 121). Rewrites add 1 call per valid high-severity issue, and the plan has no re-check after a rewrite, so rewrite results are not verified.
- The eval runs local calls on a single queue (eval-client.ts 196-220, worker-lock.ts), so every extra local call adds the 20-35 minutes noted in the task.
- withModelRetry (util.ts 66-90) wraps the draft closure (chapter.ts 111); putting both beat and prose calls inside startDraft means one retry re-runs both.

OPEN QUESTIONS
- Should the scene rewrite run in the app as well (a new service plus a route or action) or only in the eval? The backlog (follow-up-ai-improvement.md 65-72) says the app AI should be fixed, and the eval only measures it. The app path would need a new AiTaskName, a route handler with maxDuration 300, and a UI entry in check-panel.tsx.
- Should the rewrite be followed by another continuity check to verify the fix? The plan does not say, and it doubles local cost.
- Does "high-importance" mean severity 'high' only (as the backlog reads), or should 'medium' count too?
- The backlog row (qwen 27B en review, line 221-222) says "Draft in two steps ... then the prose from the list." It does not say whether the beat list must be stored or shown to the author. Storing it as an ai_runs row (planned above) is one choice; a visible step in the draft panel is another.
- Track D says the continuity check should use wiki sentences. Confirm whether the rewrite prompt should use the same pack the check used (pack is built at chapter-check.ts 144) or a fresh one for the scene.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 65-72 - Backlog item D: two-step draft (beat list then prose) and scene-only rewrite when continuity flags high importance. Cost warning for local calls.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 259-341 - Entry service startDraft. Builds context, style cards and prompt, then calls startAiStream. Primary hook for the beat call (insert before buildDraftPrompt at 318-326).
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 347-371 - createChapterFromDraft. Reads run.output.text and requires run.task === 'draft-chapter'. Keep the prose run under that name.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 1-71 - DRAFT_SYSTEM (6-15), DRAFT_MAX_TOKENS/EFFORT (17-18), DraftPromptInput (20-34), buildDraftPrompt (36-63). Add an optional beats field and a <beats> block here.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts` 27-38 - Pins the exact DRAFT_SYSTEM lines. Changing the system prompt breaks this test.
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` 48-107 - App entry for the streamed draft. Calls startDraft at 68-74 with no signature change needed. Streams textStream and waits on done (80-83).
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx` 59-64 - Client fetch to the draft route. Only relevant if the beat list should be shown to the author.
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 82-129,135-190 - runAiTask (non-streaming, for the beat call) and startAiStream (streaming prose). Both insert ai_runs rows and enforce the daily limit.
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts` 26-61 - StreamTextArgs, AiClient interface and AiTaskDef. Shape a new beat task here.
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts` 142-153 - AI_TASKS list (AiTaskName). A new task name (for example draft-beats or scene-rewrite) must be added here. ai_runs.task is text (schema.ts:537), so no migration.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 11-34,50-61,137-163 - ContinuitySchema, ContinuityInput, CONTINUITY_SYSTEM and continuityCheckTask. Source of issue quote, severity, factRef/entryRef, wikiExcerpt and suggestion. No change needed for the track.
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 126-312 - runChapterCheck. Runs continuity and extraction in parallel (163-204), maps issues (211-228) and replaces open issues (231-236). Pack built at 144.
- `/home/xogud/documents/github/DaeumHwa/src/server/issues.ts` 12-23,98-114 - NewIssue type and resolveIssue (status accepted or dismissed). Eval calls resolveIssue for each decision; it does not change body text.
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/check-panel.tsx` 100-122 - Human path: resolve (106-112) and applyFix (116-122) replace the quote with the suggestion. The only UI path that changes text from an issue today.
- `/home/xogud/documents/github/DaeumHwa/src/server/chapters.ts` 57-65,321-325 - SaveChapterInput (expectedVersion) and saveChapter. Used by eval proofread to write body. A scene rewrite should save the same way.
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 19-60,114-118,308-310 - PackFact/PackEntry types, buildContextPack and renderContextPack. Source of wiki sentences for the scene rewrite prompt.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts` 1-57 - splitSentences, sentenceAt, sentenceIn. Sentence-level only; no scene or paragraph helper exists, so a new scene splitter is needed.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 80-180,182-261,280-324 - Eval draft step (startDraft call at 112-122, attempts 135-137, consult 154-158, createChapterFromDraft 169-177), proofread (saves body 238-243, writes chapters/NN.md 244 and metrics 254-259), and continuity (decision loop 313-320, Pending items with severity 290-307). Main hook for the scene rewrite.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 66-90,187-197,279-315 - withModelRetry (wraps startDraft and saves), consult/settle (author handshake), applySuggestions (span-checked replacement, reusable for the scene replacement), pickAttempt.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/author-io.ts` 52-59,99-104,136-139 - ContinuityItemSchema with severity (the rewrite trigger), continuity Pending and continuity Answer (valid per item).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts` 58-71,148-197 - STEPS registry and runUntilBlocked loop. A new step key would be registered here; a rewrite inside continuity does not need a new step.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts` 61-77 - buildPlan per-chapter order (draft at 66, proofread 67, check 68, continuity 69, proposals 70). A new beat step would go here if it is an eval-only step.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/fake-author.ts` 45-53 - Fake author marks every continuity item valid. Under this fake, every high-severity issue would trigger the rewrite.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 42-103 - Model profiles: local queue (ollama) vs cloud (opencode), timeouts. Explains the 20-35 minute local cost of extra calls.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts` 196-220,297-380 - EvalClient (implements AiClient) with a single queue for calls, generateObject and streamText wrappers. Any new call from the eval passes through here.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts` 296-310 - Calls buildDraftPrompt with fixed input. Must keep compiling if DraftPromptInput changes.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 4-12,45 - E2E stub responder table matched by exact system prompt. A new app-side beat task needs an entry, or the e2e stub throws UnknownSystemError.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 14-29 - FAKE_OUTPUTS and FAKE_TEXT maps (Partial). A new task used in unit tests needs an entry here or a per-test override.

Open questions:
- Should the scene rewrite run in the app (new service, route or action, UI entry in check-panel) as well as in the eval? The backlog says app AI should be fixed, but the eval is the only measured path today.
- Should a rewrite be followed by a re-check to verify the fix? The track does not say, and it roughly doubles local call cost.
- Does high-importance mean severity 'high' only, or should 'medium' also trigger a scene rewrite?
- Should the beat list be stored as its own ai_runs row only (planned here), or shown to the author in the draft panel?
- Which wiki pack should the scene rewrite use: the pack from the check (chapter-check.ts:144) or a fresh scene-level pack?
- The task says the work is on a LOCAL branch, but the repo has only main and no Track D branch. Confirm the base branch before implementing.

## survey:D:evidence

TRACK D evidence survey (read-only). Verdict: the evidence supports Track D, with two caveats. (1) The continuity step in the eval never edits chapter text: it only marks issues accepted/dismissed (eval/novel/steps/chapter.ts:280-316, no writeRunFile). The only text-changing loop is the author draft_review re-draft of the whole chapter (chapter.ts:95-135), which is keyed to the author's usable verdict, not to continuity flags. So "a high-importance flag triggers a scene rewrite" has no existing hook to extend; it needs a new step between continuity and proposals. (2) Trigger precision is weak: qwen ko's only flag was a false positive (summary.md:115-116 area; qwen3.8-27b-ko.md:205, 275 "맞는 지적 0 / 헛지적 1"), and cloud runs flagged nothing (summary.md:112), so the trigger would rarely fire for cloud and could rewrite correct text on a false flag. The gate must be measured before the rewrite is trusted.

EVIDENCE (Q2 and scene-state failures)
- Q2 by run (summary.md:39-46): qwen ko 2, qwen en 2, haiku ko 3, haiku en 3, luna ko 3, luna en 4. Publish needs no item at 2 or below (summary.md:29 and 42 of backlog context).
- qwen ko Q2 2 cites a door/gate state that never changes and a time-order error: "4층 이상은 철문으로 막혀 있었다." (qwen3.8-27b-ko.md:100) then "문이 열려 있었다." with no passing scene (qwen3.8-27b-ko.md:100, row 6 at line 200). Also Baek Jiwon's whereabouts are unsupported: "백지원이 4층 아래에 있었으니까." (qwen3.8-27b-ko.md:102).
- qwen en Q2 2: basket location drift, "She set the basket down ... at the gate" then "on the fifth landing" then "in the west bin", bundles left on the 8th floor (qwen3.8-27b-en.md:59; C5 at qwen3.8-27b-en.md:86). C3: "She had been watching them for three years" vs "She had never gone past the first floor" (qwen3.8-27b-en.md:84).
- qwen en C1 (the biggest T2 failure, Yunseo on the hill instead of the tower stairs, qwen3.8-27b-en.md:82) WAS flagged by the continuity check (calls/027, qwen3.8-27b-en.md:131-133, valid flag) and NOT fixed in the text. Its own improvement row says so: "the continuity check caught it ... Add a repair loop" (qwen3.8-27b-en.md:221).
- haiku ko Q2 3: the window where Jiwon stands changes ("칠층 창 아래 ... 서 있었다" then "추도 흔들리지 않았다", haiku-5.5-ko.md:87-89) and the letter is opened then not opened (haiku-5.5-ko.md:87).
- haiku en Q2 3: "Behind her, his footsteps rang on the stone" with no passing moment; "Baek Jiwon had come down the stairs behind her" vs. she was alone at the top (haiku-5.5-en.md:29).
- luna ko Q2 3: staging/direction errors, "언덕길 하나를 내려가면" for orphanage-to-bell direction (summary.md:216; luna-6-ko.md:50 lists (b) "끈이 코트에 달려 있는지 목에 거는지" and (c) seal state unobservable).
- Continuity totals: all four cloud runs flagged 0 (summary.md:112; haiku-5.5-ko.md:219 "빈 배열이 맞는 답이다"; luna-6-ko.md:89, 148-151). Only qwen flagged, and qwen ko's single flag was a false positive: "언급이 없다는 이유로 모순이라 함" (summary.md:115 area; qwen3.8-27b-ko.md:275). qwen ko missed 3 wiki contradictions including the 철문 passage (qwen3.8-27b-ko.md:200, 413).
- Retry cost evidence for the rewrite budget: qwen ko continuity 1,290.9 s (summary.md:119; qwen3.8-27b-ko.md:334), qwen en 2,136 s (qwen3.8-27b-en.md:173). Cloud continuity 6.8-25.8 s (summary.md:119). A scene rewrite on local adds one more 20-35 min call per flagged scene (backlog D, follow-up-ai-improvement.md:72).
- Draft attempt loop: 3 draft attempts all rejected for Chinese characters, with no positional fix path (qwen3.8-27b-ko.md:342).

CODE FACTS
- Draft prompt has no beat list or scene-state step: DRAFT_SYSTEM rules (src/ai/tasks/draft-chapter.ts:6-16) and DraftPromptInput (src/ai/tasks/draft-chapter.ts:20-30) contain no scene, position or prop fields. A grep for 장면/소품/위치/scene returns nothing in draft-chapter.ts.
- Continuity output schema: severity enum high/medium/low (src/db/types.ts:116; src/ai/tasks/continuity-check.ts:11-25); suggestion is a full replacement sentence or "" (continuity-check.ts system prompt). The product continuity task therefore already produces a usable replacement sentence for in-sentence fixes; for position/order problems suggestion is empty by design, so the scene rewrite must rely on explanation + wiki line, as backlog D says.
- Step order: draft, proofread, check, continuity, proposals per chapter (eval/novel/state.ts:60-72). No rewrite after continuity exists.
- Eval metrics module (eval/novel/metrics.ts:3-14, 41-89) measures only length (lengthOk, T3), foreign runs (T5), meta lines (T4), clean ending (T7), paragraph count and dialogue ratio. Nothing measures positions, props, order, or any scene state. Q2 and T2 come from the LLM reviewer (eval/novel/agents/reviewer.md:52-59 lists continuity ratio and missed errors; the rubric score is not computed in code).
- Planted-error harness exists and reports 정밀도/재현율 (eval/run-continuity.ts:285, with fixtures under eval/fixtures/novel/ko/). It measures continuity-check recall on planted errors, not scene-level position errors, and does not run in the chapter eval.
- src/lib/diff.ts exists (with diff.test.ts) and can count changed paragraphs between draft and rewritten scene, for the "no collateral change" check.
- Per-run time metric exists: perChapterModelMs / perChapterMs in run-summary.json (summary.md:174; luna-6-ko.md:231), usable to measure added call time.

ACCEPTANCE CRITERIA (proposed; n=1 chapter per run, so each needs 2+ reruns, per backlog section 1)
1. Q2 (reviewer score): current qwen ko 2, qwen en 2, haiku ko 3, haiku en 3, luna ko 3, luna en 4 -> target: no run at 2 or below; qwen ko/en at 3 or higher. Metric: reviewer Q2 (manual/LLM; not automated, so blind reviewer work from backlog section 3 is needed first).
2. Positional/ordering contradictions (new metric): current not measured in code; reviewer counts from text: qwen ko 2 items in Q2 (qwen3.8-27b-ko.md:100-102), qwen en 3 items (C3, C5; qwen3.8-27b-en.md:84-86), haiku ko 3 items (haiku-5.5-ko.md:87-89), haiku en 1-2 (haiku-5.5-en.md:29), luna ko 2 (luna-6-ko.md:50). Target: 0 positional/ordering items on the reviewer's list, and T2 positional items 0. Measurement gap: missing. Needed: a beat-list JSON (who/where/objects/order per scene) saved as a run file (like chapters/NN.attempt-K.md in chapter.ts:135), plus a code check that compares beats to prose (name + object + location mentions per scene), added to eval/novel/metrics.ts.
3. Repair-loop recall: current 0 for high-severity flags resolved by rewrite (qwen en C1 flagged, not fixed, qwen3.8-27b-en.md:221). Target: 100% of valid high-severity flags addressed by a scene rewrite, measured by re-running the continuity check on the rewritten text and checking the flag is gone. Metric: count of flags before vs. after, both in calls/*.json and author-decisions.jsonl. Missing: no after-rewrite re-check step exists; the continuity step runs once (chapter.ts:280-316).
4. Trigger precision: current qwen 0 valid / 1 false (qwen3.8-27b-ko.md:275); qwen en 1 valid / 1 invalid (qwen3.8-27b-en.md:131-133). Target: rewrites triggered only by author-valid flags, i.e. 0 rewrites on author-dismissed flags. Measure via author decisions in the run folder. The planted-error harness (eval/run-continuity.ts:285) gives recall and precision for the check itself and can serve as the gate before enabling the loop.
5. No collateral damage: target 0 paragraphs changed outside the rewritten scene. Measure with src/lib/diff.ts between chapters/NN.draft.md and the rewritten file. Missing: no such metric in metrics.ts; add it.
6. Non-regression: T3 lengthOk, T5 foreignRuns 0, T4 metaHits [] must stay the same after the rewrite (already in metrics.ts:3-14, so measurable now).
7. Time: added calls per chapter at most 1 rewrite per high-severity flag; for qwen each call costs 20-35 min (summary.md:234-240). Target: rewrite adds <= 1 call per chapter in the cloud and a documented local cost. Measure with perChapterModelMs in run-summary.json (summary.md:174).

RECOMMENDATION
- Build the beat-list step and the continuity-triggered scene rewrite as two separate changes, because the beat list is measurable on its own (criterion 2) while the rewrite is only trustworthy after the precision gate (criterion 4) is met.
- Run the rewrite on cloud models first (cheap, flags are rare, so the gate is easy to test with planted errors via eval/run-continuity.ts), then run the local qwen in one 1-chapter run.

OPEN QUESTIONS
- Whether high-severity flags should trigger a rewrite at all when the check reports only 0-1 flags per chapter (cloud runs give almost no signal).
- Whether Q2 reviewer scoring can be made blind to model name (backlog section 3 says it is not yet) before comparing before/after scores.
- Whether to put the continuity flag text into the draft-attempt loop instead (author re-draft at chapter.ts:95-135) rather than a scene rewrite; the current loop re-drafts the whole chapter and does not use continuity output.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog item D (lines 65-72): two-step draft, scene-only rewrite on high-importance flag, cost warning; metric Q2, T2
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Q table (lines 37-46), continuity section 2.3 (lines 110-119), improvement candidates 4 (line 237), caveats and timing (lines 174, 234-240)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - Q2=2 evidence (line 59), C1/C3/C5 (lines 82-86), continuity flag and missed repair (lines 131-133, 221-222)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - Q2=2 evidence (lines 97-102), continuity false positive (line 275), missed contradictions (line 200), draft retries (line 342), metrics (line 343, 413)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - Q2=3 positional slips (lines 84-90), continuity 0 issues (line 219)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - Q2=3 positional slips (line 29)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - Q2=3 items (line 50), spatial conflict (line 70), continuity 0 issues and context gap (lines 89, 148-151)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - Q2=4 reference run (Q table in summary.md line 46); no scene-level evidence used
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - Step flow: draft re-draft loop (lines 95-160), continuity step with no text write (lines 280-316)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/state.ts`  - Per-chapter plan order draft, proofread, check, continuity, proposals (lines 60-72)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - Only deterministic metrics: T3 length, T5 foreign runs, T4 meta, T7 ending, paragraphs (lines 3-89); no position or scene metric
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - Draft system rules (lines 6-16) and prompt input type (lines 20-30): no beat, scene, position or prop field
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts`  - Issue schema with severity (lines 11-25) and system prompt rules for suggestion and no-wiki-basis flags (lines 50-60)
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts`  - SEVERITIES = high, medium, low (line 116)
- `/home/xogud/documents/github/DaeumHwa/eval/run-continuity.ts`  - Planted-error harness with precision and recall (line 285); usable as the trigger gate
- `/home/xogud/documents/github/DaeumHwa/src/lib/diff.ts`  - Existing diff utility for the no-collateral-change metric
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - Duplicate entry kept for the haiku ko Q2 note; see the first entry above

Open questions:
- Should high-severity continuity flags trigger a scene rewrite at all, given cloud runs flagged 0 issues and qwen's only flag was a false positive?
- Is the Q2 reviewer score blind to model name before before/after comparison? Backlog section 3 says not yet.
- Should the repair go into the author draft_review re-draft loop (src/eval/novel/steps/chapter.ts:95-160) instead of a new scene-level step?
- Is there a planted continuity fixture with positional or prop errors? eval/fixtures/novel/ko has only author-guide.md and bible.json, so positional recall cannot be measured yet.

## survey:D:risks

TRACK D (scene consistency self-review, two-step draft) risk and neighbour survey. Read-only; nothing in the repo was changed.

BASELINE FACTS (verified)
- Draft pipeline: src/ai/tasks/draft-chapter.ts. DRAFT_SYSTEM at lines 6-15 (TAG_DATA_RULE at line 14). DRAFT_MAX_TOKENS = 16000 (line 17), DRAFT_EFFORT = 'high' (line 18). buildDraftPrompt at lines 36-63 applies neutralizeDeep(raw) (line 37) and emits <target_length> "약 N자" (line 42).
- Service: src/server/ai-features.ts. startDraft at line 259. DRAFT_TAIL_CHARS = 1500 (line 51). Prompt built at lines 316-325. startAiStream call with task 'draft-chapter', effort DRAFT_EFFORT, maxTokens DRAFT_MAX_TOKENS at lines 329-338. createChapterFromDraft at line 347 calls requireWorkRole(... 'editor') and createChapter with versionSource 'ai_draft'. I did not confirm that startDraft itself calls requireWorkRole (it reads the work at line 278 only).
- Runtime: src/ai/run.ts. DEFAULT_AI_TIMEOUT_MS = 120_000 (line 28, structured calls). STREAM_AI_TIMEOUT_MS = 280_000 (line 31, streamed drafts). DEFAULT_DAILY_TOKEN_LIMIT = 3_000_000 (line 1). MAX_RUNNING_RUNS = 3 per user (line 4-ish, const near top) with CONCURRENCY_MESSAGE. runAiTask at ~line 85; startAiStream at line 135 (assertCanStartRun then insertRun, then client.streamText). callSignals at lines 66-76. setAiTimeoutOverride (eval only) near line 36.
- Prompt-injection helpers: src/ai/prompt-utils.ts. TAG_DATA_RULE lines 5-6. neutralizeTags lines 12-14 (only closing tags). neutralizeDeep lines 17-26.
- Continuity: src/ai/tasks/continuity-check.ts. ContinuitySchema lines 11-24 (quote, kind, severity, factRef, entryRef, wikiExcerpt, explanation, suggestion). ResolvedContinuityIssue lines 37-48. CONTINUITY_SYSTEM lines 50-61. usableSuggestion lines 67-71 (thread and timeline issues get suggestion ''). locateIssues line 77. effort 'high', maxTokens 16000 at lines 139-140.
- Other task limits: interview-question effort low, maxTokens 2000 (lines 194-195); interview-extract medium, 8000 (78-79); chapter-extract medium, 16000 (84-85); proofread medium, 16000 (37-38); reader-sim medium, 16000 (55-56); direction-advice high, 16000 (57-58); style-suggest medium, 4000 (30-31).
- Ollama transport: src/ai/ollama.ts. Default transport has no timeouts (comment line 112). Per-call timeoutMs via CallLimits (line 95). num_predict = maxTokens (line 405). Serialization of local calls is not in this file (the design says one request at a time, spec 2026-10-18-lightweight-model-novel-eval-design.md line 78; not yet in code as far as I read).
- Retry/timeout in responses.ts: DEFAULT_TIMEOUT_MS used at lines 102-115, attemptSignal at 494.
- Eval harness: eval/novel/steps/chapter.ts. Step order comment at lines 36-37: direction advice, draft, proofread, chapter check, continuity, post-chapter proposals, reader sim. draft step at lines 80-130 with attempt loop bounded by ctx.config.maxDraftAttempts and a best-attempt save. eval/novel/eval-client.ts: productTimeoutMs (line 50, 292, 452), wouldTimeOut = duration > productTimeoutMs (line 490). streamText wrapper at line 376.
- Design docs: no spec or plan mentions the two-step draft or scene rewrite. grep for 장면 in the lightweight-eval plan has no hits. docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md line 373 lists chapter step keys (ch{n}:draft, :proofread, :check, :continuity, :proposals).
- Git: only branch is main (plus origin/main). No track branch exists locally, so "LOCAL branch" for D has no ref to inspect.
- Guards: src/ai/guards and src/lib/guards DO NOT EXIST. The shared guard library named in the task is not in the repo. Neutralization lives in src/ai/prompt-utils.ts.
- Backlog: docs/eval/novel/follow-up-ai-improvement.md section 2.D (lines describing the two-step draft, local cost warning 20-35 min).

TRACK NEIGHBOURS (files that overlap D)
- A (length): draft-chapter.ts prompt and DRAFT_MAX_TOKENS; ai-features.ts startDraft. Overlaps D on draft-chapter.ts and on the draft step's retry loop.
- C (foreign script): draft step retry loop in eval/novel/steps/chapter.ts (80-130); post-draft check. Overlaps D on when retries happen.
- B (voice): draft-chapter.ts DRAFT_SYSTEM (line 10) and renderCard (65-71); interview-question.ts and interview-extract.ts (voice field). D's beat list should carry speakers, so B and D share the input shape.
- H (continuity context and rules): continuity-check.ts schema and CONTINUITY_SYSTEM. D consumes these findings. Any change to severity, quote or factRef shape breaks D's selection of high-severity issues.
- J and F1 (proofread scope, split in three): proofread.ts. D's rewrite must run before proofread or proofread results go stale.
- F2 (chapter extract split), G1, G2 (extraction): chapter-extract.ts and interview-extract.ts. Not directly touched by D.
- F3 (reader sim per persona in parallel): reader-sim.ts. Parallel fan-out competes with MAX_RUNNING_RUNS = 3 (run.ts) and with D's sequential calls.
- F4 (local server serialization and effort switch): ollama.ts and effort constants (DRAFT_EFFORT). D's extra calls at effort high multiply local time.
- HX1-HX4 (harness): eval/novel/steps/chapter.ts, state, resume and summary save. D adds a step to that machine, so resume keys change.
- I, E1, E2, G1: no direct overlap with D beyond the draft prompt.

INVARIANTS THAT APPLY
- Korean user-facing copy: any new AppError message or UI text must be Korean; prompts are already Korean.
- AppError codes: services throw AppError(code, koreanMessage); existing codes seen are NOT_FOUND, BAD_STATE, AI_ERROR (ai-features.ts 347-365, run.ts). New failures must use these.
- withAction / ActionResult: any new user action (e.g. "rewrite scene") is zod-parsed in src/server/actions/* and returns ActionResult (not verified in this pass, per CLAUDE.md).
- requireWorkRole: createChapterFromDraft line 352 uses 'editor'. A scene rewrite that writes chapter text needs the same editor role. startDraft role check not confirmed.
- change_log: D writes no wiki rows. Chapter body writes are not wiki writes, so change_log does not apply; the chapter versionSource path ('ai_draft', ai-features.ts 347+) is the relevant record. Whether a scene rewrite needs its own version source is open.
- AI never writes wiki tables: D only changes chapter text and must not touch wiki rows.
- Wiki archived, never deleted: not affected.

REGRESSION RISKS
- Token budget: two-step adds a beat-list output and one prose stream per draft, plus one call per high-severity scene. Each stream call caps at 16000 output tokens. Daily limit is 3,000,000 tokens (run.ts line 1); D multiplies draft spend.
- 120 s product timeout: a beat list is a structured call and gets 120 s (run.ts 28) unless the task sets timeoutMs. Local qwen calls are 20-35 min per the task note, so the beat list and each scene rewrite will exceed the product timeout. eval-client.ts wouldTimeOut (490) will flag them.
- Stream: draft prose uses startAiStream with 280 s (run.ts 31). A scene rewrite returns replacement text, which the current text-append stream UI does not model. Anthropic stream has an effort fallback path (anthropic.ts 233-246) that a rewrite call inherits.
- Prompt injection: beat list input, scene rewrite input (quote, wikiExcerpt, explanation from continuity output) must pass neutralizeDeep (prompt-utils.ts 17-26) and each new system prompt must include TAG_DATA_RULE (prompt-utils.ts 5-6). neutralizeTags only neutralizes closing tags, so opening tags inside manuscript text remain.
- Concurrency cap: MAX_RUNNING_RUNS = 3 per user (run.ts). D's sequential calls are safe alone, but combined with F1/F2/F3 fan-out they hit CONCURRENCY_MESSAGE.
- Ordering: the harness runs continuity after draft and after proofread/check (chapter.ts 36-37). D needs continuity before rewrite, so either a new step between draft and proofread, or the rewrite inside the draft step. Both change the resume keys (plan line 373).
- Scene boundaries: no scene-splitting helper was found in this pass; body text is free prose, so mapping beats to text spans is undefined. (Not exhaustively searched.)
- Severity vocabulary: D needs the name of the "high" value; SEVERITIES comes from src/db/types.ts (not read in this pass).

MINIMAL PUBLIC INTERFACE (proposal, TypeScript)
// src/ai/tasks/draft-chapter.ts (additions)
export type SceneBeat = { sceneId: string; order: number; place: string; characters: string[]; objects: string[]; summary: string }
export type BeatListOutput = { beats: SceneBeat[] }
export const BeatListSchema: z.ZodType<BeatListOutput>
export function buildBeatPrompt(raw: DraftPromptInput): string // neutralizeDeep + TAG_DATA_RULE
export function buildProseFromBeatsPrompt(raw: DraftPromptInput & { beats: SceneBeat[] }): string
// src/ai/tasks/scene-rewrite.ts (new)
export type SceneFinding = { sceneId: string; quote: string; explanation: string; wikiExcerpt: string; severity: Severity }
export function selectRewriteScenes(findings: ResolvedContinuityIssue[], beats: SceneBeat[], body: string): { sceneId: string; sceneText: string; findings: SceneFinding[] }[]
export function buildSceneRewritePrompt(raw: { sceneText: string; findings: SceneFinding[]; wikiLines: string[] }): string
// src/server/ai-features.ts (additions)
export async function startSceneRewrite(db: Db, actor: Actor, input: { workId: string; chapterId: string | null; sceneText: string; findings: SceneFinding[]; wikiLines: string[] }, client?: AiClient): Promise<{ runId: string; textStream: AsyncIterable<string>; done: Promise<string> }>

OPEN QUESTIONS FOR THE AUTHOR
1. Should D run automatically inside the draft step (before save), or as an author-triggered action in the editor after the check panel? Auto rewrite changes text without author approval.
2. Scene delimiter: how are scenes marked in prose (beat list only, a marker line, or blank-line segmentation)?
3. Which severity counts as "high" (value name in src/db/types.ts) and is there a cap on rewrites per chapter?
4. Timeouts: may the beat list and scene rewrite set their own timeoutMs, or use effort low, given local calls take 20-35 min?
5. Harness order: may continuity move before proofread (chapter.ts 36-37), and does D get its own step key for resume?
6. Does a rewritten scene need a chapter version row (versionSource) and is that covered by the chapter-edit rules?
7. Is D on the product path or harness-only (eval/novel) for this round? The backlog wording suggests product code.
8. Should D's rewrite prompt include the author's wiki sentences from wikiExcerpt only, or the full context pack?
9. The shared guard library (src/ai/guards) does not exist; decide who creates it and whether D waits for it.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - draft prompt, token and effort constants (lines 6-18, 36-63); D's beat list and prose prompts extend this file
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - startDraft (259), DRAFT_TAIL_CHARS (51), createChapterFromDraft (347); D's service entry point
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - timeouts 120 s and 280 s (28, 31), daily limit (1), startAiStream (135), concurrency cap (MAX_RUNNING_RUNS)
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts`  - TAG_DATA_RULE (5-6), neutralizeTags (12-14), neutralizeDeep (17-26); required for every new prompt
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts`  - finding schema (11-24), CONTINUITY_SYSTEM (50-61), usableSuggestion (67-71); D's input
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - harness step order (36-37) and draft attempt loop (80-130); D needs a new step key
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - productTimeoutMs (50, 452) and wouldTimeOut (490); how local timing is judged
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - backlog section 2.D and the cross-track list
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - chapter step keys (line 373); no spec covers D

Open questions:
- Should D run automatically inside the draft step before save, or as an author-triggered action after the check panel? Auto rewrite changes text without author approval.
- How are scenes delimited in prose (beat list only, a marker line, or blank-line segmentation)? No scene-splitting helper was found.
- Which severity value counts as high (name in src/db/types.ts, not read) and is there a cap on rewrites per chapter?
- May the beat list and scene rewrite set their own timeoutMs or use effort low, given local calls take 20-35 min against the 120 s structured limit (run.ts 28)?
- May continuity move before proofread in the harness (eval/novel/steps/chapter.ts 36-37), and does D get its own step key for resume?
- Does a rewritten scene need a chapter version row (versionSource) and is that covered by the chapter-edit rules?
- Is D on the product path or harness-only for this round?
- Should the rewrite prompt include only wikiExcerpt sentences or the full context pack?
- src/ai/guards does not exist. Who creates the shared guard library, and does D wait for it?

## survey:D:specs

Track D (scene consistency self-review, two-step draft) is constrained mainly by the MVP spec's F7/F13 flows, the reliability spec's timeout and cancel rules, and the eval spec's "no product change this round" rule. Nothing in the specs defines a beat-list step or a scene-level rewrite, so both are new design. Specs and code were read but not edited.

Code the track touches (all cited from the repo):
- src/server/ai-features.ts:256-341 startDraft: one streamed draft-chapter call; previous tail DRAFT_TAIL_CHARS=1500 (line 51, 299); buildDraftPrompt (318); ai_runs task 'draft-chapter' (332-336), effort DRAFT_EFFORT, maxTokens DRAFT_MAX_TOKENS.
- src/ai/tasks/draft-chapter.ts:6-16 DRAFT_SYSTEM rules (only instructed events, wiki facts, style cards, target length, no title/explanation); :17-18 DRAFT_MAX_TOKENS=16000, DRAFT_EFFORT='high'; :36 buildDraftPrompt.
- src/server/ai-features.ts:344-380 createChapterFromDraft: only a completed draft-chapter run becomes a chapter (version source ai_draft).
- Continuity check is a separate AI task (F7), not part of the draft path.

Spec constraints:
1. Author approval for wiki: docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:19-23 (1.3 principles 1, 2, 3) and 1.4 anti-goal line 27-29 ("AI output changes wiki/facts/threads/relations without author approval"). A scene rewrite that touches only draft text is allowed, but it must never write wiki rows (src/server/ai-features.ts:43 already states this).
2. F7 (lines 229-240): continuity check runs on a saved chapter from the "회차 점검" button; findings are applied only by the author ("제안대로 고치기" / 무시 / 위키를 고침). Quote must be a substring of the manuscript; factId must exist in the context. Prompt rule at ~line 237: state changes are not errors, judge only against wiki valid at position N. A draft-time auto-fix loop would bypass that author step unless it is explicitly scoped to draft text.
3. F9 (242-250): context pack budget ~12,000 chars, valid-at-N facts only. Scene wiki sentences for the rewrite should come from this pack, not from a new query path.
4. F13 (262-266): draft result is streamed text, not written to the manuscript; buttons "새 회차로 만들기" (ai_draft) and "현재 원고 끝에 붙이기". Any two-step flow must still end in this same result shape.
5. 7.1 (315-332): structured outputs follow zod constraints (no min/max/regex/default; all fields required; optional = nullable). A beat-list output must follow the same rule.
6. 7.3 task table (337-349): fixed list of tasks, with draft-chapter as 'high' and streaming. A new task (beat list, scene rewrite) needs a new AI_TASKS entry and a spec update. The plan's AI_TASKS enum is in docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:133.
7. Reliability spec D (docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md:98-107): streamed draft default timeout 280s (line 101); task may override with timeoutMs (design judgment). Cancel keeps partial text and allows only "현재 원고 끝에 붙이기"; "새 회차로 만들기" only for a fully completed run (line 107). A two-step flow must keep those rules: a cancelled beat step or a partial rewrite must not look like a completed run.
8. Eval design (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md):
   - Line 24: non-goal this round, "프롬프트나 코드 개선". Follow-up doc docs/eval/novel/follow-up-ai-improvement.md section 2 D (lines near "### D. 장면 일관성 자기 검토") says this is the next round.
   - Lines 29-34: harness failure if prompts or code change mid-run, or if product behavior changes except via harness seams. Line 317 (section 10): product behavior unchanged, only the timeout seam in src/ai/run.ts is allowed this round. Track D must be a new round with a new date, not a change to 2026-10-18 results.
   - Line 70-73: cloud effort high (decided 2026-10-18); local keeps max.
   - Lines 145-152 (6.3 draft loop): instruction is fixed per chapter, author may ask a rewrite at most 2 times (line 150), and rewrite count and reason are recorded as model weakness (line 152). Internal product scene rewrites will change what this count means. Decide how they are counted in calls/ and metrics.
   - Line 183 (6.4): the author never writes or edits prose; line 212 (6.6) says a draft uses the 6.3 rewrite rule.
   - Line 265-ish (section 7): target about 5,000 Korean chars per chapter (design judgment).
   - Section 9 (line 285+): scoring uses docs/eval/novel-quality-criteria.md: T1 (instruction events, lines 52-58), T2 (setting contradictions 0), T3 (length 5,000+ and within 130%, lines 58), Q2 consistency (lines 74-78).
9. Eval plan (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md): the harness drives startDraft({ workId, chapterId?, instructions, targetChars, entryIds }) (around lines 470-473). Keep this signature stable so runs stay comparable. ch{n}:draft expects attempts written as chapters/0n.attempt-k.md and a draft_review pending (lines 470-480). Tests must not call real APIs (spec line 310+).

Decisions that must not be re-litigated:
- AI proposes only; the author approves wiki changes (MVP 1.3).
- Draft is streamed text and is never written straight into the manuscript (F13).
- draft-chapter uses effort high, 16000 max tokens, and the Korean prompt (current code).
- Target 5,000 chars per chapter (eval spec section 7).
- Harness rules: fixed instructions; no real API in tests; author never writes prose.
- Product timeouts: 280s stream, 120s structured (reliability D line 101).

Open questions (the specs are silent on these):
- Is the beat list a new AI task (new ai_runs task name and AI_TASKS enum change, plus a spec table update) or an internal step of draft-chapter?
- The continuity check (F7) runs only after a saved chapter and is manual. A draft-time continuity check and scene rewrite is a new flow. Who triggers it, and is it automatic or author-initiated?
- A beat list is non-streamed, and a rewrite is one more call. With 280s stream timeout and local calls of 20-35 min, does the track raise timeouts (reliability D allows per-task timeoutMs), and how is that recorded against the eval's time-limit rule (eval 6.6: beyond the extended limit counts as model failure)?
- How should scene-level rewrites count against the 2-rewrite limit and rewrite-weakness record (eval 6.3 line 150-152)?
- Does a scene rewrite need the same author check as F7 fixes, or is it draft-only and therefore exempt?

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 17-30, 229-250, 262-266, 315-349 - MVP spec. Constrains: 1.3 principles (17-23), anti-goals (25-30), F7 continuity check (229-240), F9 context pack (242-250), F13 draft flow (262-266), AI layer 7.1 (315-332), task table 7.3 (337-349)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 98-107 - Timeout and cancel rules for AI calls and drafts (section D). Streamed draft default 280s, partial draft text kept on cancel, only completed run becomes a chapter
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 24, 29-34, 70-73, 145-152, 167-184, 285-300, 308-317 - Eval design. Non-goal this round (24), failure rules (29-34), effort decision (70-73), draft loop and rewrite rule (145-152), author rules (167-184), criteria (285-300), constraints incl. no product change except timeout seam (308-317), open items (see 2 and 3 above)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 16, 370-380, 470-482, 502-506 - Eval plan. Draft step calls startDraft and records attempts and draft_review (370-380, 470-480). Product behaviour unchanged except timeout seam (16)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md` 133, 648, 660, 664 - MVP plan. AI_TASKS enum (133), startDraft tests stream fake text and store { text } (664), draft-chapter.ts buildDraftPrompt contract (648)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md` 54, 80, 99, 103 - Reliability plan (not read in full). Relevant to timeout and cancel for the draft route; referenced only via the spec
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` section 1 and 2 D (search for '### D. 장면 일관성 자기 검토') - Backlog. Track D definition (section 2 D), constraint that changes are the next round with a new date (section 1), time cost of local calls (section 2 F)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md` 52-58, 74-78 - Scoring criteria used by the eval (T1 instructions, T2 contradictions, T3 length, Q2 consistency)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 43, 51, 256-341, 344-380 - Code under change: startDraft (256-341), createChapterFromDraft (344-380), wiki no-write comment (43), tail chars (51)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-36 - Code under change: DRAFT_SYSTEM rules (6-16), effort and max tokens (17-18), buildDraftPrompt input (20-35, 36)

## survey:D:tests

TRACK D test map (scene consistency self-review, two-step draft). Read-only survey; nothing in the repo was changed. No beat-list step, scene splitter, or scene-rewrite code exists yet. Verified by reading the files below.

## 1. Code the track touches (current state)
- Draft prompt and system: src/ai/tasks/draft-chapter.ts. DRAFT_SYSTEM at :6-15, DRAFT_MAX_TOKENS 16000 at :17, DRAFT_EFFORT 'high' at :18, buildDraftPrompt at :36-63 (sections instructions, style_cards, wiki, previous_summary, previous_tail; no beat section). No beat or rewrite prompt exists.
- Draft service: src/server/ai-features.ts startDraft at :259-341. It validates instructions (:273-274), builds the pack with buildContextPack (:313-317), calls buildDraftPrompt (:318-326), then calls startAiStream once (:328-340) with task 'draft-chapter'. Nothing runs after the stream. DRAFT_TAIL_CHARS = 1500 at :51. createChapterFromDraft at :347-373 reads run.output.text (draftText at :375-381).
- Streaming runner: src/ai/run.ts startAiStream at :135-190. It inserts an ai_runs row, calls client.streamText, and on success finishes the row with output {text} (:168-175). runAiTask (generateObject path, :82-129) runs postProcess before storing.
- Continuity check: src/ai/tasks/continuity-check.ts. Schema :11-24 (issues with quote, kind, severity, factRef, entryRef, wikiExcerpt, explanation, suggestion). CONTINUITY_SYSTEM :50-61 (severity "low" for assumed or undecided facts :56). postProcess :153-162 drops unlocatable quotes and blanks thread/timeline suggestions. resolveContinuityIssues :119-135 returns start/end offsets, which a scene mapper would need. Helpers locateQuote and splitSentences come from src/lib/korean/sentences (imported at :6).
- Saved-chapter continuity path: src/server/chapter-check.ts runChapterCheck :126+. It calls buildContextPack(db, workId, {text, position}) and then runAiTask(continuityCheckTask, {chapterText, chapterPosition, chapterTitle, pack}). The draft-time self-review has no chapterId and no saved text, so it would need its own pack build and a non-saved input path.
- Stream framing: src/lib/draft-stream.ts (DRAFT_ERROR_MARK :5, parseDraftStream :19-23). The route streams raw text chunks (src/app/api/works/[workId]/draft/route.ts:76-92) and waits for `done` before closing. A rewrite after the stream starts cannot be shown to the reader through this framing.
- Task registry: src/db/types.ts AI_TASKS :142-152 (9 names). ai_runs.task is free text with $type at src/db/schema.ts:537, so a new name needs no migration. src/server/exports.ts:29 lists EXPORTED_AI_TASKS.
- Eval harness and English prompts: eval/novel/steps/chapter.ts draft step :80-135 calls startDraft and uses run.done. eval/novel/localize/en-systems.ts has DRAFT_CHAPTER_SYSTEM (:81) and maps tasks at :149-153.
- E2E stub: e2e/ai-stub/responders.ts :32-46 matches each task by its exact system prompt. It imports DRAFT_SYSTEM (:6, :45) and throws UnknownSystemError for any unlisted system prompt (:54).

## 2. Existing tests that cover the touched code (path, what it asserts)
- src/ai/tasks/draft-chapter.test.ts
  - :26-39 exact DRAFT_SYSTEM lines (`split('\n')` toEqual array).
  - :41-53 buildDraftPrompt contains instructions, style cards, pack text, previous summary and tail, 5500, chapter label.
  - :55-63 missing previous context renders '(없음)'.
  - :66-83 fakeDraft: starts with '(데모 초안) ', 6 paragraphs, length >= 600, deterministic.
  - :87-112 closing-tag isolation for every section.
  - :114-116 DRAFT_SYSTEM contains TAG_DATA_RULE.
- src/server/ai-features.test.ts (draft describe, :173-321)
  - :182-189 empty instructions gives VALIDATION.
  - :191-208 streams fake text; streamed === done text; ai_runs row task 'draft-chapter', status done, output {text}.
  - :210-257 prompt contains work and selected style cards, not unselected ones, previous tail, previous summary, '3000', instructions. Reads spy.mock.calls[0][0].prompt (:249).
  - :259-274 title '2화' gives one '<chapter>2화</chapter>'.
  - :276-298 createChapterFromDraft stores body === streamed text, title '초안', version source ai_draft.
  - :300-307 unknown runId gives NOT_FOUND. :309-320 viewer gives FORBIDDEN.
- src/ai/tasks/continuity-check.test.ts
  - :67-146 postProcess: drops unlocatable quote, nulls unknown factRef, keeps valid ref with offsets, clears thread/timeline suggestion, keeps contradiction suggestion, clears no-op suggestion, dedupes ranges.
  - :148-164 fakeContinuity flags left/right hand (one issue, medium, F1/E1) and returns none for a quiet text.
  - :166-236 system prompt and layout, isolation, suggestion wording.
- src/app/api/works/[workId]/draft/route.test.ts (uses setAiClientForTests(new FakeAiClient()) at :50, because the route passes undefined as client)
  - :53-79 401, 400 empty instructions, 404 non-member.
  - :80-91 plain text with X-Run-Id header. :92-117 run marked done before body closes.
  - :118-143 error record appended after text. :144-166 generic message for unexpected failure.
- src/lib/draft-stream.test.ts: error record framing and parse (:12, :32-39).
- src/components/writing/panels/draft-panel.test.tsx: :118-194 stream results (complete, partial, cancel, error record). Client-side only.
- src/server/chapter-check.test.ts: :118 contradiction with fact id; :287 drops AI issue with no fact or entry; :81 failed call stops sibling. Saved-chapter path only.
- src/test/fake-ai.test.ts: :32 registry output; :51 schema validation; :67 overrides win; :84 unknown task throws 'No fake output for task nope'; :108 streamText chunks of at most 40 chars; :130 final resolves unread; :142 no fake text throws.
- src/ai/run.test.ts: draft-chapter run fixtures at :207, :293, :412-440, :458, :624 (stream timeout and override cases).
- e2e/ai-stub/responders.test.ts: :84 every structured task answers with valid JSON; :158-166 draft prompt answers with plain text, task 'draft-chapter'; :239 unknown system prompt rejected.
- eval/novel/localize/localize.test.ts: :323-328 every AI_TASKS name has a non-empty English system with no Hangul; :298 buildDraftPrompt scaffold check.
- eval/novel/run.test.ts: :92-100 draftsFailingAfter counts only task 'draft-chapter'; :116-135 over-long draft via streamText override; :292-330 draft redo and failure keeps earlier draft.
- eval/novel/eval-client.test.ts: :135-143 call record `002-draft-chapter.json`, effort high; :187-198 productTimeoutMs 280000 for draft-chapter streams.
- eval/novel/steps/finish.test.ts: :13-60 speed summary for draft-chapter.

Test helpers and wiring:
- src/test/factories.ts exports: createTestUser(db, {name?, email?}) :20; createTestWork(db, ownerId, {title?, settings?}) :33 (inserts owner membership); addTestMember(db, workId, userId, role) :50; createTestChapter(db, workId, {position?, title?, body?, status?, publishedOn?}) :59 (sets charCount); createTestEntry(db, workId, {name, kind?, aliases?, summary?}) :87; createTestFact(db, workId, {content, entryId?, status?, sourceChapterId?, validFromPosition?, validToPosition?}) :105 (no ref field; refs E1/F1 come from buildContextPack); createTestThread(db, workId, {title, status?, plantedChapterId?, targetChapterPosition?}) :132. No factory for ai_runs or proposals; the tests insert those directly (ai-features.test.ts imports aiRuns, chapterVersions, chapters, proposals).
- createTestDb: src/test/db.ts:8-12 (PGlite in memory, migrated).
- FakeAiClient: src/test/fake-ai.ts. Constructor takes {overrides} (:10-13, :24-26). generateObject parses schema (:28-32). streamText returns textStream plus final (:34-44). Lookup order: overrides, then FAKE_OUTPUTS for structured or FAKE_TEXT for streamed, else throws (:46-64). Text overrides must return a string (:58). Chunks are 40 characters (:6, :68-75).
- Fixed outputs: src/test/ai-fakes/index.ts. FAKE_OUTPUTS :14-23 (continuity-check → fakeContinuity). FAKE_TEXT :27-29 (draft-chapter → fakeDraft). A new structured task needs an entry in FAKE_OUTPUTS, or any call to it throws.
- src/test/ai-fakes/draft-chapter.ts: fakeDraft(input) :14-25. Splits instructions into 6 paragraphs with fixed filler. Always starts '(데모 초안) '.
- src/test/ai-fakes/continuity-check.ts: fakeContinuity :13-40. Only flags left/right hand (:42-61) and age (:63-80) contradictions against a confirmed or non-confirmed fact. Nothing else.
- setAiClientForTests exported from src/ai/index.ts:23.

## 3. Test command
pnpm vitest run src/ai/tasks/draft-chapter.test.ts src/ai/tasks/continuity-check.test.ts src/ai/run.test.ts src/server/ai-features.test.ts src/server/chapter-check.test.ts "src/app/api/works/[workId]/draft/route.test.ts" src/lib/draft-stream.test.ts src/test/fake-ai.test.ts src/components/writing/panels/draft-panel.test.tsx --maxWorkers=2
Add e2e/ai-stub/responders.test.ts and eval/novel/localize/localize.test.ts, eval/novel/run.test.ts, eval/novel/eval-client.test.ts only if they are inside the vitest include config. I did not check that config.

## 4. NEW tests that must exist (name, input, expected)
Prompt and schema (src/ai/tasks/draft-chapter.test.ts):
1. "beat prompt carries instructions, wiki pack and previous tail, and asks for per-scene place, objects and order". Input: promptInput. Expected: contains '<instructions>', the pack text, '3화' summary, and the tail sentence; the beat system asks for one line per scene with who, where, objects, order.
2. "prose prompt includes the beat list verbatim in a <beats> section". Input: a 3-scene beat string. Expected: contains '<beats>' and each beat line verbatim; the prose prompt does not contain the beat-step instructions.
3. "beat schema rejects a scene with no place and accepts a complete list". Input: {scenes:[{who:[],where:'',objects:[],order:1}]} then a valid 3-scene list. Expected: first throws ZodError; second parses.
4. "scene rewrite prompt contains only the flagged scene, the finding and the wiki sentence". Input: one scene text, quote, explanation, wikiExcerpt, suggestion. Expected: contains the scene and wikiExcerpt; does not contain other scenes; system contains TAG_DATA_RULE.
5. "DRAFT_SYSTEM exact-text test": if the system prompt changes, update :26-39 in the same change. Decide first (see open questions).

Scene split (new helper, for example src/lib/scene-split.test.ts):
6. "splits a draft into scenes at blank-line-only separators or '* * *' markers". Input: 3 scenes separated by '\n\n* * *\n\n'. Expected: 3 ranges that cover the text without overlap.
7. "maps a continuity issue offset to the scene that contains it". Input: scene ranges plus start/end from resolveContinuityIssues. Expected: the correct scene index, and -1 or null for a quote that spans two scenes.

Service (src/server/ai-features.test.ts, new cases in the draft describe):
8. "runs the beat step before the prose and stores both runs". Input: FakeAiClient with an override for the new beat task returning a valid beat list; spy on generateObject and streamText. Expected: beat call precedes prose call; prose prompt contains '<beats>'; two ai_runs rows (new beat task done, draft-chapter done).
9. "a beat-step failure stops the draft before any prose is streamed". Input: beat override throws. Expected: startDraft rejects with AI_ERROR (or the stream's done rejects), no draft-chapter row, no text.
10. "no rewrite when the continuity check reports only medium or low issues". Input: continuity override returns one medium issue. Expected: no rewrite call; done === streamed text.
11. "rewrites only the scene with a high-severity issue and keeps the other scenes byte-identical". Input: 3-scene draft, continuity override returns one high issue quoting a sentence in scene 2. Expected: rewrite prompt contains scene 2 and the wiki excerpt only; final text = scenes 1 and 3 unchanged, scene 2 replaced.
12. "an issue whose quote is not in the draft is dropped and triggers no rewrite". Input: high issue with quote 'nonexistent'. Expected: no rewrite call.
13. "a failed rewrite keeps the original draft and the run is done". Input: rewrite override throws. Expected: done resolves to the original text; draft run status done; no error record.
14. "streamed text equals stored text". Input: any draft with a rewrite. Expected: depends on design. If the rewrite runs after streaming, this test fails and must be redesigned (see open questions). If the rewrite runs before streaming, streamed === done === run.output.text.
15. "createChapterFromDraft stores the rewritten text, not the first draft". Input: rewrite case from test 11. Expected: chapter body equals the final text.

Route and framing (src/app/api/works/[workId]/draft/route.test.ts, src/lib/draft-stream.test.ts):
16. "stream body contains only draft text, no beat or review text". Input: default FakeAiClient. Expected: body === stored text; no beat list; X-Run-Id header present.

Fakes and registry:
17. "FAKE_OUTPUTS has an entry for the new beat task and it validates against its schema" (src/test/fake-ai.test.ts). Input: the beat task name with the instructions input. Expected: generateObject resolves and output is parseable.
18. "EN_SYSTEMS has an English prompt for the new task" (eval/novel/localize/localize.test.ts:323-328 covers it once AI_TASKS grows; the en-systems.ts entry must be added or the test fails).

E2E stub (e2e/ai-stub/responders.test.ts):
19. "answers the beat prompt with schema-valid JSON" (new entry in ANSWERS, :32-46). Input: beat system and a prompt with <instructions>. Expected: reply.task is the beat name and the text parses. Also a rewrite system if it is a separate task.

## 5. Existing tests that would break, and why
- src/ai/tasks/draft-chapter.test.ts:26-39. Breaks only if DRAFT_SYSTEM text changes; the expected array is exact.
- src/server/ai-features.test.ts:191-208. Breaks if a beat step runs before the stream: the fake has no structured output for a new task name, so FakeAiClient.structuredOutput throws 'No fake output for task <name>' (src/test/fake-ai.ts:51) unless the name is added to FAKE_OUTPUTS. It also asserts streamed === done text, which breaks if a rewrite changes the stored text after streaming.
- src/server/ai-features.test.ts:210-257 and :259-274. They read spy.mock.calls[0][0].prompt (:249, :271). If a beat or rewrite call happens first, calls[0] is not the prose prompt; the test must select the draft-chapter call by task name.
- src/server/ai-features.test.ts:276-298. Breaks if the stored text is rewritten after streaming, because chapter.body is expected to equal the streamed text.
- src/test/ai-fakes/draft-chapter.ts fakeDraft and draft-chapter.test.ts:66-83. Unchanged if the prose call still uses FAKE_TEXT['draft-chapter']; the six-paragraph and '(데모 초안) ' assertions hold.
- src/lib/draft-stream.test.ts and draft-panel.test.tsx. Break only if the stream protocol or framing changes (for example, a replace record).
- eval/novel/run.test.ts:92-100. draftsFailingAfter counts only task 'draft-chapter'. If beat or rewrite calls reuse that task name, the counts (run.test.ts:310-330) shift.
- eval/novel/run.test.ts:116-135. Overrides only the draft-chapter stream. A new call under another name goes to the default fake and may throw if unregistered.
- eval/novel/localize/localize.test.ts:323-328. Fails with a TypeError on any new AI_TASKS name without an EN_SYSTEMS entry.
- e2e/ai-stub/responders.test.ts:158-166 and responders.ts:45. Unchanged if DRAFT_SYSTEM is unchanged. A new system prompt not in ANSWERS throws UnknownSystemError (responders.ts:54) for any e2e run that drafts. The current e2e specs (core-flow.spec.ts, editor-scroll.spec.ts) only mention drafts in comments, so they do not exercise it.
- eval/novel/eval-client.test.ts:187-198 and :135-143. Only affected if the draft stream timeout or the call sequence changes for draft-chapter.
- src/ai/run.test.ts draft-chapter fixtures. Unaffected unless startAiStream changes.
- continuity-check.test.ts and chapter-check.test.ts. Unaffected unless the continuity schema or the saved-chapter path changes.

Unverified: the vitest include config and whether eval/ and e2e/ files are in the default run. Not checked.

## 6. Context for expected behavior
- Evidence: docs/eval/novel/2026-10-18/qwen3.8-27b-en.md:221 (C1 caught by continuity check, not fixed) and :222 (Q2 = 2, bookkeeping errors, two-step proposal). Summary candidate 4: docs/eval/novel/2026-10-18/summary.md:237. The follow-up backlog item D is at docs/eval/novel/follow-up-ai-improvement.md (section D).
- Spec for the draft flow: docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:264 (F13 input and server context) and :348 (draft-chapter is streamed).

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - DRAFT_SYSTEM (:6-15), buildDraftPrompt (:36-63); where beat and rewrite prompts would go
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - startDraft (:259-341) runs one startAiStream; the two-step flow would change here
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - startAiStream (:135-190) and runAiTask (:82-129)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts`  - schema (:11-24), postProcess (:153-162), resolveContinuityIssues (:119-135) for scene mapping
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - saved-chapter continuity call (:126-175), the model for building a draft-time pack
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts`  - FakeAiClient wiring, overrides, unknown-task throw (:46-64)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts`  - FAKE_OUTPUTS and FAKE_TEXT registry (:12-29)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts`  - fakeDraft (:14-25)
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/continuity-check.ts`  - fakeContinuity hand and age only (:13-80)
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts`  - factories: createTestUser, createTestWork, addTestMember, createTestChapter, createTestEntry, createTestFact, createTestThread
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts`  - prompt and fakeDraft tests, exact DRAFT_SYSTEM assertion (:26-39)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts`  - draft service tests (:173-321); spy on calls[0] at :249 and :271
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.test.ts`  - route stream tests, setAiClientForTests at :50
- `/home/xogud/documents/github/DaeumHwa/src/lib/draft-stream.ts`  - error record framing (:5-35)
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts`  - AI_TASKS list (:142-152)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - eval draft step calling startDraft (:80-135)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts`  - English system prompts; DRAFT_CHAPTER_SYSTEM (:81), task map (:149-153)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts`  - every-task English prompt check (:323-328)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.test.ts`  - draftsFailingAfter counts draft-chapter only (:92-100)
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts`  - system-prompt keyed stub; UnknownSystemError for unlisted prompts (:32-54)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - evidence: C1 caught but not fixed (:221), Q2 two-step proposal (:222)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - candidate 4, self-review (:237)

Open questions:
- Should the beat list and the scene rewrite be new AI task names (added to AI_TASKS, FAKE_OUTPUTS, EN_SYSTEMS, e2e ANSWERS), or should they reuse 'draft-chapter'? Reusing the name changes eval/novel/run.test.ts counts and the stream timeout in eval-client tests.
- If the scene rewrite runs after the prose has streamed, the reader's streamed text will not match the stored text, and tests 14-15 and the existing :191-208 and :276-298 assertions must change. Option: run the continuity check and rewrite before streaming (non-streaming draft), or stream the prose and show the rewrite as a separate replace step. Which design is intended?
- Is the draft-time continuity check meant to build a ContextPack from the draft text the same way chapter-check does (buildContextPack with text and position), and should it use the same severity threshold 'high' from SEVERITIES in src/db/types.ts?
- Should DRAFT_SYSTEM change in place (the exact-text test at draft-chapter.test.ts:26-39 is updated) or should the beat and rewrite instructions live in new system prompts so DRAFT_SYSTEM stays fixed?
- Vitest include config was not checked; confirm whether eval/ and e2e/ test files run under pnpm vitest run.


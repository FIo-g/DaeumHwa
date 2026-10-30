# Track C: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:C:code

TRACK C code map (read-only, nothing edited). Evidence in the 2026-10-18 summary (docs/eval/novel/2026-10-18/summary.md:200-202) and the backlog (docs/eval/novel/follow-up-ai-improvement.md:59, 169, and section C). All paths below are under /home/xogud/documents/github/DaeumHwa.

DATA FLOW, PRODUCT PATH (draft)
1. UI: src/components/writing/panels/draft-panel.tsx:59-100 streamDraft() POSTs to the route and reads the stream; setDraft(parseDraftStream(raw).text) at :84 and :90. The author sees text live while it streams.
2. Route: src/app/api/works/[workId]/draft/route.ts:48-107. It calls startDraft (:68), enqueues each textStream chunk (:79), then `await done` (:82) and closes (:83). The body is already streaming, so the route cannot change text that was already sent.
3. Service: src/server/ai-features.ts:259-341 startDraft(). Loads chapter/prior summary/tail (:277-300), style cards (:303-311), context pack (:313-317), builds the prompt with buildDraftPrompt (:318-326), then calls startAiStream (:328-340) with task 'draft-chapter', effort DRAFT_EFFORT, maxTokens DRAFT_MAX_TOKENS.
4. Run wrapper: src/ai/run.ts:135-190 startAiStream(). Calls client.streamText (:148). `done` (:167-188) calls finishRun with output { text } (:169-175) and resolves with the text. The ai_runs row stores the RAW text, so a later correction must also update that row.
5. Client: getAiClient() in src/ai/index.ts:12-20 returns only OpencodeAiClient or AnthropicAiClient. OllamaAiClient is NOT reachable from product code (see src/lib/ai-mode.ts:5, AiProvider = 'anthropic' | 'opencode').
6. Save: createChapterFromDraft (src/server/ai-features.ts:347-373) reads run.output via draftText (:365, :375-381). Any repaired text must be in this stored output, or the saved chapter will get the Han text.

DATA FLOW, EVAL PATH (qwen)
1. Step: eval/novel/steps/chapter.ts:80-180 draft(). Loop of attempts (:98-139). Calls startDraft with ctx.client (:111-124); `run.done` is the text (:123). Attempt file written at :135. Metrics via chapterMetrics (:152). Author verdict via consult (:154). Retries only when the verdict says unusable and attempts remain (:166).
2. Model client: eval/novel/models.ts:109-121 createModelClient() builds OllamaAiClient from profile.ollama. qwen profile at :40-50, temperature at :48 (1.0, topP 0.95, topK 20, think true).
3. Ollama call: src/ai/ollama.ts:235-243 streamText, :245-292 collectStream (post at :252, stripThink at :279, return text). Options go out in chatBody at :384-408; temperature is at :401 (options.temperature), keep_alive :398, num_predict :405. OllamaOptions type at :39-55 (temperature at :44).
4. Metric: eval/novel/metrics.ts:34-37 defines OTHER_SCRIPT_RUN (Han, Hiragana, Katakana, Cyrillic, U+FFFD) and LATIN_RUN; :52-55 builds foreignRuns (Latin 4+ only for ko). The metric is pure and can be reused.
5. Proofread: eval/novel/steps/chapter.ts:182-260 calls runProofread(useAi true) at :196-198. src/server/chapter-check.ts:356-385 runProofread merges rule and AI suggestions (filter at :378-380). The AI prompt is src/ai/tasks/proofread.ts:25-53 (no script rule; spelling/grammar only). Han is not flagged here, which matches the evidence.
6. Retry policy: eval/novel/steps/util.ts:66 withModelRetry (retries model/network) and :113 guarded (content error -> recorded in failed, returns null). Neither re-runs for foreign script.

WHERE THE NEW BEHAVIOR HOOKS IN (smallest diff)
A. Detector (new, pure): add src/lib/korean/foreign-script.ts exporting findForeignScriptSpans(text) -> {start,end,text}[] using the same regex as metrics.ts:36-37 minus Latin, with offsets (matchAll). Export it from src/lib/korean/index.ts:1-7 (list of export * lines). Make metrics.ts:36-37 import the regex so the eval metric and the product check cannot drift.
B. Product repair (if it must reach the author): in startDraft, after startAiStream (ai-features.ts:328-340), chain on `done`. Use sentenceAt (src/lib/korean/sentences.ts:44) and locateQuote (:63) like proofread.ts:42-52 to map each span to its sentence, then call a new task via runAiTask (src/ai/run.ts:82-129, same shape as proofread) that returns replacement text for only those sentences. Task def in a new src/ai/tasks/foreign-script-fix.ts, modeled on proofread.ts:35-53. Add the name to AI_TASKS (src/db/types.ts:142-151). ai_runs.task is a text column with $type only (src/db/schema.ts:537), so no enum migration was seen, but this was not verified against the migration files. A repaired `done` must also update the ai_runs output row (run.ts has no update helper today; finishRun at :297-322 writes only once). Without that, createChapterFromDraft (ai-features.ts:365) keeps the bad text.
C. Showing the repair to the author: the stream has no replace record. The protocol is text plus an error mark (src/lib/draft-stream.ts:4-23, parseDraftStream at :19). A replace mark would need: draft-stream.ts, route.ts:82-83 (send the repaired text after done), and draft-panel.tsx:84-90. Larger than B; can be deferred if the repair is only applied to the saved chapter.
D. Eval hook: eval/novel/steps/chapter.ts:111-124 gets its text from run.done, so if B makes `done` resolve to repaired text, the attempt file, metrics (:152) and the author review all see the fix with no eval change. Keep startDraft's signature unchanged. Its callers are route.ts:68, ai-features.test.ts:192 and chapter.ts:112, and all would still work.
E. Temperature hypothesis: the only setting is eval/novel/models.ts:48 (temperature 1.0). Measuring it needs a new profile (or an override field) in the same file, followed by a run under a new date per the backlog section 1. No product change, since Ollama is not in product (src/ai/index.ts:12-20). Ollama tests use temperature 0.6 as a fixture (src/ai/ollama.test.ts:64, :101), which do not test the product path.
F. Prompt-side (cheap, product + eval): add one rule line to DRAFT_SYSTEM at src/ai/tasks/draft-chapter.ts:6-15 (e.g., after :11: write only Hangul and standard punctuation). This is a hypothesis, not measured. It is the same prompt in both paths, so it needs no plumbing.
G. Flag-only option: a foreign-script checker can be added to the array in chapter-check.ts:372-376 as a rule-type suggestion with start/end (the ruleSpellChecker pattern at :59-72). It can flag but cannot supply a replacement without AI, so it is a fallback, not a fix.

TESTS TO EXTEND (no tests read in full; locations only)
- src/server/ai-features.test.ts:192 (startDraft with FakeAiClient).
- src/app/api/works/[workId]/draft/route.test.ts (route stream).
- src/lib/draft-stream.test.ts (if C is taken).
- eval/novel/metrics.test.ts:36 (foreignRuns cases).
- src/test/fake-ai.ts:19 (FakeAiClient class) and :34 (streamText); src/test/ai-fakes/draft-chapter.ts:14 (fakeDraft). A fixed repair output for the new task goes in src/test/ai-fakes/index.ts (not opened).
- e2e/ai-stub/responders.ts:45 (draft-chapter stub).

OPEN POINTS
- The product path currently has no Ollama route, so any product repair is untested against real qwen output; the measurable part of Track C is the eval (E, D).
- A Han word may be intentional (e.g., a name in a quote). The repair should mirror the eval rule and allow an opt-out, but no test shows this case.
- The cloud drafts in the 2026-10-18 evidence showed no Han in the reviewed text (evidence checked only for qwen ko at summary.md:200-202). Not verified for every cloud run.
- eval/novel/eval-client.ts (not read in full past line 150) may transform text; check it before relying on run.done as the raw text.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 59 - Track C problem statement and to-do; line 169 notes the Ollama client is not yet in product
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 200-202 - Evidence: qwen ko three draft attempts contained 以上是, 三楼, 接到了, 嬷嬷, 样的; harness foreignRuns was empty for the old run
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 259-341 - startDraft: entry point for both product route and eval step; hook point for repair (chain on done after :328-340)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 347-381 - createChapterFromDraft and draftText: reads stored ai_runs output (:365); must see repaired text
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 135-190 - startAiStream: streamText call, done resolves text and stores output {text} (:167-175)
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 82-129 - runAiTask: template for a new repair task (postProcess-style, recorded in ai_runs)
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 297-322 - finishRun: writes the run once; a repair needs an update path for output
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` 48-107 - Product route: streams chunks (:79), awaits done (:82), closes (:83). Text already sent cannot be changed here
- `/home/xogud/documents/github/DaeumHwa/src/lib/draft-stream.ts` 4-23 - Stream framing: only text plus error mark; a replace mark would be new (for option C)
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx` 59-100 - Client stream reader; setDraft at :84 and :90 (would need a replace branch for option C)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-15, 36-63 - DRAFT_SYSTEM rules (add script rule near :11) and buildDraftPrompt used by both paths
- `/home/xogud/documents/github/DaeumHwa/src/ai/index.ts` 8-20 - getAiClient: product only builds Anthropic or OpenCode clients; no Ollama path
- `/home/xogud/documents/github/DaeumHwa/src/lib/ai-mode.ts` 5-29 - AiProvider type and provider selection (anthropic | opencode only)
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts` 39-55 - OllamaOptions (temperature at :44, topP :45, topK :46)
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts` 235-292 - streamText and collectStream: stream of the draft and returned text (stripThink :279)
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts` 384-408 - chatBody: where temperature is sent (options.temperature at :401)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 39-50, 109-121 - qwen profile (temperature 1.0 at :48) and createModelClient building OllamaAiClient (:116-121). Smallest place for the temperature experiment
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 80-180 - Eval draft step: attempts loop, startDraft call (:111-124), review metrics (:152), verdict loop (:166)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 182-260 - Eval proofread step: runProofread useAi (:196-198), saves accepted suggestions, writes metrics (:255-259)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts` 66-130 - withModelRetry (:66) and guarded (:113): retry only on model/network errors, not foreign script
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 34-55 - OTHER_SCRIPT_RUN and LATIN_RUN regexes and foreignRuns computation; reuse for the new detector
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 59-72, 356-385 - ruleSpellChecker (flag-only option G) and runProofread merge/filter (:372-384)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 35-53 - Task def pattern (postProcess with locateQuote) to copy for a new foreign-script fix task
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts` 44-70 - sentenceAt and locateQuote: map a span to its sentence for targeted repair
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/index.ts` 1-7 - Export list; add export for the new foreign-script module
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts` 142-153 - AI_TASKS list and AiTaskName: a new task name must be added here
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts` 537 - ai_runs.task column typed as AiTaskName (text with $type; migration not checked)
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts` 184-200 - Existing startDraft tests with FakeAiClient; extend for repair
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.test.ts` 1 - Route stream test (not read in detail)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.test.ts` 30-40 - Existing foreignRuns test cases; add cases for the new detector
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` 19-40 - FakeAiClient class and streamText; fixed outputs for the new task go through ai-fakes
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts` 14-26 - fakeDraft test output (no Han); add a Han fixture for repair tests
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.test.ts` 61-68, 95-101 - Ollama test fixture with temperature 0.6 and request body assertions; a temperature change would break none, but these show where options are checked
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 6, 45 - E2E stub for draft-chapter using DRAFT_SYSTEM; unaffected by a prompt-only change

Open questions:
- Should Track C repair reach the author's on-screen draft (needs a replace record in draft-stream.ts, route.ts and draft-panel.tsx), or only the saved chapter (ai-features.ts + ai_runs output)?
- Product has no Ollama path (src/ai/index.ts:12-20). Is the local-model fix only for the eval harness until Ollama is wired in product (backlog section 4)?
- Is a Han character ever intentional in Korean manuscript text (a name or a quote)? The detector and repair need an opt-out if so.
- Should the temperature experiment be a new profile in eval/novel/models.ts or a CLI override? No design exists in the spec for this.
- Does a new AiTaskName need a DB migration? src/db/schema.ts:537 shows a $type only; the migration files were not checked.
- Does eval/novel/eval-client.ts transform text before run.done is read (not read past line 150)?

## survey:C:evidence

## Track C (외국 문자 섞임, T5) 근거 조사

### 1. 백지와 근거 위치
- 백로그 항목: `docs/eval/novel/follow-up-ai-improvement.md:57-63`. 문제 `:59`("qwen 한국어 초안 세 번이 모두 한자를 섞었다(`以上是`, `三楼`, `嬷嬷`)... 맞춤법 단계도 이를 놓쳤다"), 할 일 `:61-62`, 확인 지표 `:63`.
- 요약: `docs/eval/novel/2026-10-18/summary.md:20` 표에서 qwen ko 걸린 문턱 "T2 설정 모순 7건, T5 한자 잔존". `:200-206`(4.2절)에 시도별 한자 목록, 원인은 "추정"(`:204`, 온도 1.0과 topP/topK 또는 학습 데이터)이며 시험하지 않았다고 명시. `:236`(개선 후보 3번): "qwen ko 초안 3회 모두 한자, 최종 본문에 `嬷嬷`, 맞춤법 단계도 놓침".
- 검토서 `docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`:
  - `:21` foreignRuns는 한국어판에서 라틴 4자 이상만 셌고 한자는 못 잡았다. 이 실행의 `foreignRuns []`인데 본문에 한자가 있다.
  - `:52` T5 **실패**: "`foreignRuns` []이지만 7행에 한자가 있다. `원장嬷嬷가`".
  - `:69` "세 시도 모두 한자가 섞였다. 시도 1 `以上是`, 시도 2 `三楼`, `接到了`, 시도 3 `嬷嬷`, `样的`. 최종 본문은 시도 3이다."
  - `:298` 맞춤법이 `样的`는 고쳤고 `嬷嬷`와 `4층이상은`은 놓쳤다.
  - `:342` 작가 에이전트의 품질 점수 2, 1, 2(시도 1~3). 세 번 모두 쓸 수 없다고 판정. 같은 프롬프트(입력 2,066토큰)로 낸 독립 표본이라고 명시(`:342`).
  - `:407` 개선안 1번과 `:419`: 재현성은 높아 보이지만 한 화 표본이라 다시 돌려 확인해야 한다.
- 다른 검토서(haiku-5.5-ko.md:47, haiku-5.5-en.md:20, luna-6-ko.md:32, luna-6-en.md:23, qwen3.8-27b-en.md:50): T5 통과. 영어판은 `hangulLeft` 3이 프롬프트 라벨 `Chapter 1 (새 회차)`에서 나온 것(qwen-en `:162`, haiku-en `:103`, luna-en `:151`). 이는 T5 실패가 아니라 하네스 치환표 빈틈이며 백로그 11번 항목이다.

### 2. 하네스(eval/novel)의 현재 상태
- `eval/novel/metrics.ts:34-39`: `OTHER_SCRIPT_RUN`(Han, Hiragana, Katakana, Cyrillic, U+FFFD)을 정의. 한국어는 라틴 4자 이상과 이 문자들을, 영어는 한글과 이 문자들을 센다(`:52-55`). 즉 현재 코드는 한자를 잡는다.
- 단위 테스트: `eval/novel/metrics.test.ts:90-94`가 `嬷嬷`를 ko에서 잡는 것을, `:107-111`이 en에서 잡는 것을 검증. `eval/novel/cli.test.ts:97`은 `metrics.foreignRuns`가 `['嬷嬷']`인지 확인.
- 판이 달라진 이유: qwen ko 실행은 커밋 `6c74e2f`(2026-10-18 19:03)로 돌았고, 한자 검출은 `9bf7bdd`(22:50)에서 들어갔다(`git log`로 확인). 그래서 qwen ko의 `foreignRuns []`는 옛 지표 값이다. 요약 `:202`도 같은 설명을 한다. 현재 지표로 다시 세면 이 본문은 `['嬷嬷']`가 나와야 한다(테스트 `cli.test.ts:97`과 같은 패턴).
- 주의: `eval/results/novel/2026-10-18/`은 이 체크아웃에 없어서(`ls` 실패) `metrics/01.json`이 재계산되었는지는 확인하지 못했다.
- 지표 위치:
  - 최종 본문 기준: `eval/novel/cli.ts:439`에서 `chapterMetrics`를 `chapters/NN.md`에 적용해 `metrics/NN.json`을 쓴다.
  - 시도별 기준: `eval/novel/steps/chapter.ts:152`가 `draft_review`에 시도 본문의 `metrics`를 넘긴다. 작가 에이전트는 시도마다 T5를 볼 수 있다.
  - run-summary: `eval/novel/steps/finish.ts:101-`의 `buildRunSummary`는 `calls`(task별 횟수, 토큰, 시간)와 `drafts: state.data.drafts`(`:118`)만 담는다. **`foreignRuns`는 run-summary에 집계되지 않는다**(`eval/novel/*.ts`를 검색해 확인).
- 시도 선택: `eval/novel/steps/util.ts:309-315` `pickAttempt`는 usable인 시도를 먼저 고르고, 없으면 `quality >= best`로 고른다. 동점이면 뒤 시도가 이긴다. 그래서 한자가 든 시도 3(품질 2)이 시도 1(품질 2)을 이기고 저장됐다. 한자 여부로 거르는 게드 없다.

### 3. 제품 코드의 상태 (본 앱, 로컬 브랜치)
- 한자 검사, 재생성 루프는 `src/` 어디에도 없다. `grep -rn "Script=Han|foreign"`로 확인한 결과 `src/lib/korean/josa.ts`는 한글 음절 범위만 다루고, 외국 문자 검사는 없다.
- 재시도 루프는 eval 하네스에만 있다(`eval/novel/steps/chapter.ts:95-166`, 최대 시도 횟수는 설정 `maxAttempts`, `eval/novel/author-io.ts:85`). 제품의 초안은 한 번 스트리밍 호출로 끝난다: `src/server/ai-features.ts:328-345`(`startAiStream`, task `draft-chapter`, effort `DRAFT_EFFORT`, `maxTokens: DRAFT_MAX_TOKENS`). `src/ai/tasks/draft-chapter.ts:17-18`이 16000 토큰과 effort high를 정한다. 따라서 "초안 직후 검사 후 재생성"은 제품에서는 새 로직이 필요하다.
- 맞춤법 프롬프트 `src/ai/tasks/proofread.ts:25-34`는 맞춤법, 띄어쓰기, 문법, 어색한 표현만 다룬다. 외국 문자는 규칙에 없다.
- 온도 설정: `src/ai/ollama.ts:44`(`temperature?: number`), `:399-403`(`temperature`, `top_p`, `top_k`를 Ollama 옵션으로 넘김). `:506` `definedOnly`는 값이 없으면 키를 뺀다. `eval/novel/models.ts:48`은 qwen에 `temperature: 1.0, topP: 0.95, topK: 20`을 준다. `src/ai/ollama.test.ts:64-101`은 옵션 전달을 단위 테스트한다(온도 0.6 픽스처).
- **Ollama 클라이언트는 제품 연결이 없다.** `src/`에서 `ollama`를 검색하면 `src/ai/ollama.ts`와 그 테스트만 나온다. 제품에서 로컬 모델을 고르는 경로가 없다. 따라서 로컬 브랜치의 변경은 지금 eval 하네스로만 측정할 수 있고, 제품의 로컬 경로는 별도 작업이다.
- 계획 문서 `docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:536, 550`은 아직 옛 규칙(ko는 라틴만, en은 한글만)을 적고 있다. 문서가 코드와 어긋난다.

### 4. 제안: 측정 가능한 수용 기준
표본 한계: qwen ko 한 화 한 번 실행에 약 84~98분이 든다(`summary.md:159-160`, 3절). 시도별 한자 비율은 표본 3개로는 추정할 수 없다.

| # | 지표 (측정 단위) | 현재 값 | 목표 | 측정 방법 |
|---|---|---|---|---|
| T5-a | 최종 본문의 외국 문자 구간 수 (`metrics/NN.json`의 `foreignRuns`, ko) | qwen ko 실행 1구간 이상(`嬷嬷`, qwen-ko `:52,:298`). 기록된 값은 `[]`(옛 지표, `:21`) | 0 | `chapterMetrics`를 최종 본문에 다시 적용. 현재 지표로 `['嬷嬷']`가 나오는지 먼저 확인(`cli.test.ts:97`과 같은 패턴). 이후 `metrics/NN.json` |
| T5-b | 시도별 외국 문자 시도 수 (draft attempt 중 `foreignRuns` 비어 있지 않은 것) | 3/3(qwen-ko `:69`) | 제품 루프가 있다면 재생성 후 최종 0. 측정 조건에서는 1회 이하 | `chapters/NN.attempt-K.md`에 `chapterMetrics`를 적용. **지표 누락**: run-summary에 시도별 집계가 없다. `finish.ts`에 `foreignRunsByAttempt` 추가 필요 |
| T5-c | 재생성 호출 수 (외국 문자 때문에 추가된 초안/어절 호출) | 0(제품에 없음). 작가 재작성은 3회(qwen-ko `:342`) | 외국 문자 때문에 생기는 추가 호출 1회 이하, 작가 재작성 3→2 이하 | `run-summary.json` `drafts`(`finish.ts:118`)의 시도 수와 호출 `task`별 횟수(`finish.ts:101-`). **지표 누락**: 재생성 호출에 목적을 표시하는 태그가 없어서 `calls`에서 구분할 수 없다 |
| Q-1 | 시간 증가 (`perChapterMs` 중앙값) | qwen ko 5,030,415 ms(`summary.md:159`) | +10% 이내 | run-summary `speed` 블록 |
| Q-2 | 다른 지표 회귀 (qwen ko T2, T3, T6 및 Q 평균) | T2 7건, T3 109.0%, T6 0.92, Q 평균 2.89(`summary.md:20-55`) | 악화 없음 | 같은 하네스의 검토서 |
| H-1 | 온도 가설 (qwen, temperature 1.0 대 낮춘 값, 예: 0.6은 테스트 픽스처 값) | 1.0에서 3/3(시도 기준) | 낮춘 쪽에서 시도 한자율이 확실히 줄어듦 | **지표 누락 + 표본 부족**: 시도당 한자 여부를 여러 번 샘플해야 한다. 3회로는 판단 불가. 옵션은 `models.ts:48`을 바꾸면 되지만, 로컬 호출 한 화에 80분 이상 든다 |
| H-2 | 다른 로컬 모델 ko의 T5 | gpt-oss, exaone ko 미실행(`summary.md:22-25`) | 측정 완료 | 실행 대기. 값 없음 |

단위 테스트로 검증할 수 있는 것(로컬 브랜치에서도 가능):
- 검출 함수가 시도 본문에서 한자 구간을 찾는다(기존 `metrics.test.ts:90-111`이 이미 일부 덮음).
- 재생성 루프가 한자 구간이 있는 어절만 다시 요청하고, 상한 횟수를 넘지 않는다(새 테스트 필요).
- 온도 옵션이 `ollama.ts`를 거쳐 요청 본문 `options.temperature`로 전달된다(`ollama.test.ts:64-101`이 이미 확인).

### 5. 판단
- 재생성은 한자 혼입이 한 번 발생했을 때 드는 비용(qwen ko 시간 중앙값 84분)을 생각하면, 온도를 낮추는 것보다 먼저 코드 검출을 넣는 편이 빠르다는 근거가 된다. 다만 온도 가설은 `summary.md:204`가 말했듯 아직 시험하지 않았다.
- 한자 검출은 ko 본문에 있는 한자 한 글자만으로도 실패한다. 현재 지표는 길이 제한이 없어서(`metrics.ts:34-37`), 정상적인 한국어 인용 한자(예: 고유명사 표기)가 있으면 헛경보가 생길 수 있다. 이 헛경보율은 아직 측정하지 않았다.

### 6. 재현성 메모
- 시도 3회 모두 한자가 나온 것은 같은 프롬프트에서 독립 표본이라는 점에서 근거가 되지만(`qwen3.8-27b-ko.md:342`), 한 화 한 편의 결과다(`:419`).

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog item C (lines 57-63) and the section 3 harness items; source of the track's problem statement and check metrics.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Cross-run evidence: table row 20 (qwen ko T5), section 4.2 (lines 198-206, Han attempts, causes untested), section 5 item 3 (line 236), section 3 (lines 157-175, timing).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md`  - Primary evidence: line 21 (old metric misses Han), 52 (T5 fail), 69 (three attempts with Han), 298 (proofread missed 嬷嬷), 342 (author quality 2/1/2 per attempt), 407 and 419 (fix proposal, repeatability caveat).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md`  - Confirms T5 pass in English and the hangulLeft label gap (lines 50, 162).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md`  - T5 pass in Korean with no Han (line 47).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md`  - T5 pass in English; hangulLeft label gap (lines 20, 103, 167).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md`  - T5 pass in Korean, explicit check for foreign characters (line 32).
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md`  - T5 pass in English; hangulLeft label gap (lines 23, 151, 221).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - Current T5 detector: OTHER_SCRIPT_RUN and LATIN_RUN (lines 34-39), foreignRuns computation (lines 52-55).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.test.ts`  - Unit tests for Han/kana/Cyrillic detection (lines 90-119).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts`  - Final-text metrics written per chapter (line 439); no per-attempt aggregation.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts`  - Draft attempt loop (lines 95-166); per-attempt chapterMetrics passed to the author review (line 152).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/util.ts`  - pickAttempt (lines 309-315): ties go to the later attempt; no foreign-script gate.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/finish.ts`  - buildRunSummary (line 101-): aggregates calls by task and drafts (line 118); foreignRuns not aggregated.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts`  - qwen sampling settings: temperature 1.0, topP 0.95, topK 20 (line 48). Knob for the temperature hypothesis.
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts`  - Ollama client: temperature option type (line 44) and mapping to request options (lines 399-403); definedOnly (line 506).
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.test.ts`  - Existing unit test for the temperature/top_p/top_k mapping (lines 64-101).
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - Product draft flow: startAiStream for draft-chapter (lines 328-345). No foreign-script check or retry here.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - DRAFT_MAX_TOKENS 16000 and DRAFT_EFFORT high (lines 17-18); draft system prompt has no script rule.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - Proofread system prompt (lines 25-34): no rule about foreign characters.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - Stale spec text: lines 536 and 550 describe the old Latin-only ko foreignRuns rule.

Open questions:
- Was eval/results/novel/2026-10-18/ (qwen ko metrics/01.json) regenerated with the current metric after 9bf7bdd? The folder is not in this checkout, so the current value of foreignRuns for the qwen ko run could not be checked.
- Is the Han-character false-positive rate on real Korean drafts (for example, intentional hanja in quotes or names) known? It has not been measured.
- How many draft samples per temperature are needed to tell 1.0 from a lower value? Three attempts per condition cannot separate them.
- Is the product meant to get a retry loop for foreign scripts, or is this only an eval-harness change? src/server/ai-features.ts has a single streaming call and no loop.
- Which maxDraftAttempts value was set for the qwen ko run? The run made 3 attempts, so the cap is at least 3, but the config value was not read.

## survey:C:risks

SURVEY: TRACK C (foreign-script block) and its neighbours. Read-only; nothing was edited.

== 0. Corrections to the track text (verified) ==
- No guard library exists. `src/ai/guards` is absent (`ls` failed). The GUARDS track is therefore new code, not an extension. Existing pure helpers live in `src/ai/prompt-utils.ts` (neutralizeTags :12, neutralizeDeep :17, TAG_DATA_RULE :5) and `src/lib/korean/*`.
- The backlog's pointer "Ollama options are set in src/ai/ollama.ts" is only partly right. `src/ai/ollama.ts:44` declares `temperature?`, and `chatBody` maps it to `options` at :399-405. The actual values come from the eval profiles: `eval/novel/models.ts:48` (qwen temperature 1.0, topP 0.95, topK 20), `:59` (gpt-oss temperature 1.0, think high), `:71` (exaone temperature 1.0, think false). `eval/novel/models.ts:116` builds the client via `createModelClient`.
- The product never constructs an Ollama client. `src/ai/index.ts:17` picks only Anthropic or OpenCode. `ollama.ts` is referenced by no product file. So a "lower temperature" change for the product has no local path to change yet. Only the eval profile can be tested, and that is a harness change.
- Foreign-script detection already exists, but only in the harness: `eval/novel/metrics.ts:7-9` (T5 definition), `:37` (regex `[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}�]+`), `:52` (foreignRuns). The product has no equivalent. `src/lib/korean/` has no foreign-script module (files: chars, josa, mentions, naming, sentences, spelling-rules).

== 1. Where the draft flows (what C would touch) ==
- Draft prompt and tokens: `src/ai/tasks/draft-chapter.ts` DRAFT_SYSTEM :6-15, DRAFT_MAX_TOKENS 16000 :17, DRAFT_EFFORT high :18, buildDraftPrompt :36-63 (neutralizeDeep at :37).
- Service: `src/server/ai-features.ts` startDraft :259-345 (requires editor role; calls startAiStream at :328). createChapterFromDraft :347 turns a finished run into a chapter.
- Route: `src/app/api/works/[workId]/draft/route.ts` streams plain text (:67-79), maxDuration 300 (:14), error record appended on failure (`src/lib/draft-stream.ts` :4-13, parseDraftStream :19).
- Client: `src/components/writing/panels/draft-panel.tsx` :64-84 reads the stream and calls setDraft(parseDraftStream(raw).text) while streaming. The author sees text before `done` settles.
- Run layer: `src/ai/run.ts` startAiStream :143-189. `done` resolves with the full text (:167-186) and the ai_runs row stores output.text.
- Key consequence for C: a foreign-span repair cannot be applied silently during streaming. It must run after `done` (a separate repair step, or a client-side replacement after the stream ends). The draft is saved only by createChapterFromDraft.

== 2. Limits and timeouts that a retry or repair would hit ==
- Structured default 120 s: `src/ai/run.ts:28` (DEFAULT_AI_TIMEOUT_MS = 120_000). Used by every structured task without its own timeoutMs. grep shows only `src/server/imports.ts:288` sets timeoutMs (240_000).
- Stream default 280 s: `src/ai/run.ts:31` (STREAM_AI_TIMEOUT_MS). Route maxDuration 300 (draft route :14). Margin is 20 s.
- callSignals :66-75 makes one deadline per call. Any second call inside the same user action (a repair or a length retry) gets a fresh deadline, so the total can exceed 300 s unless the caller shares one deadline. This is a real regression risk for A and C if both run in one request.
- Daily cap: `src/ai/run.ts:19` DEFAULT_DAILY_TOKEN_LIMIT = 3_000_000. Retries and repairs bill against it. Failed calls still bill (usageFromError, :~110-130).
- Concurrency cap: `src/ai/run.ts:20-22` MAX_RUNNING_RUNS = 3 per user, enforced in assertCanStartRun (:221-225) before insertRun. Parallel AI calls (F1 split proofread, F2 split extraction, F3 persona sims, and chapter-check's existing Promise.allSettled at `src/server/chapter-check.ts:163`) all count against it. The check and the insert are not atomic (awaits between them), so a burst can overshoot. This is a risk for F1, F2, F3, F4 together.
- Output tokens: product draft 16000 (draft-chapter.ts:17) vs harness floor 32000 (`eval/novel/models.ts` maxTokensFloor; eval-client applies Math.max, around eval-client.ts:444). The harness numbers therefore do not show product truncation behaviour. A product change that raises the cap changes cost and the 280 s budget together.
- Harness-only override: `src/ai/run.ts:36-39` setAiTimeoutOverride, used only by `eval/novel/run.ts:126,140`. Product timeouts are not exercised by the harness override; the harness records productTimeoutMs separately (eval-client.ts ~440).

== 3. Invariants that apply (with citations) ==
- Korean user-facing copy: all AppError messages (e.g. draft-stream.ts:8, run.ts:359 and the AI error text). Any new message for a repair failure must be Korean.
- AppError codes: services throw `AppError(code, msg)`. The draft route maps codes to HTTP status via STATUS_BY_CODE (route.ts:23-31): VALIDATION 400, AI_LIMIT 429, CONFLICT 409, BAD_STATE 409, NOT_FOUND 404. A new code would need an entry. The concurrency gate throws CONFLICT (run.ts:224).
- withAction / ActionResult: `src/server/action-helpers.ts:12` (withAction), :22 (revalidateWork). Server actions in `src/server/actions/*.ts` (e.g. actions/ai-features.ts :7-12) wrap services. The draft is a route handler, not an action, so it does not return ActionResult; keep that split.
- requireWorkRole: `src/server/access.ts:72`. startDraft calls it with 'editor' (ai-features.ts:270). Any new repair service must do the same and return NOT_FOUND to non-members (CLAUDE.md rule).
- change_log in the same transaction, archive never delete: wiki services (facts.ts, threads.ts, relations.ts, proposals.ts) use archivedAt and isNull filters (proposals.ts :389, :431, :530). Approval is one transaction (proposals.ts:36, :642). G1 dedupe and G2 must not hard-delete rows.
- AI never writes wiki directly: chapter-extract.ts header says output goes through extractionToProposals and nothing here writes wiki rows. Any F2/G1/G2/H/I change must stay on the proposal path (src/lib/proposal-payloads.ts, src/server/proposals.ts).
- Prompt injection: neutralizeTags replaces `</tag` with a full-width `＜` (prompt-utils.ts:12-14). neutralizeDeep applies it to all string leaves (:17-26). Tasks call neutralizeDeep in buildPrompt (draft-chapter.ts:37, chapter-extract.ts:39, continuity-check.ts:143, reader-sim.ts:64, style-suggest.ts:38, direction-advice.ts:66, interview-question.ts:112, interview-extract.ts:43). proofread.ts:40 uses neutralizeTags on the text only. TAG_DATA_RULE is appended to each system prompt (prompt-utils.ts:5-6). Any new tag in a prompt (e.g. a bits list, a voice card, a repair span) must go through neutralize AND be covered by TAG_DATA_RULE. A repair prompt that passes the draft text raw would be an injection path.
- Streaming framing: MARK `\u001e` must never appear in draft text (draft-stream.ts:5). A repair or guard that re-emits text must not emit that character.

== 4. Track neighbours: files that overlap (hot spots) ==
- src/ai/tasks/draft-chapter.ts: A (min length + retry), B (voice in renderCard :65-70), C (post-check), D (two-step draft), E2 (no copy of style examples). Hottest file. Needs one owner.
- src/server/ai-features.ts startDraft :259-345: A, C, D, B (context), E1/E2 (post-check). Single shared function; A and C both want a second call after `done`.
- src/app/api/works/[workId]/draft/route.ts, src/lib/draft-stream.ts, draft-panel.tsx: A, C, D (if two-step shows an intermediate), HX4 (copy retry may be this panel; unverified which panel "copy retry" refers to).
- src/ai/tasks/proofread.ts (:25-33 prompt, :35-53 task, postProcess quote locate) and src/server/chapter-check.ts (:44-121 checkers, MAX_PROOFREAD_AI_CHARS 30_000 at :51, runProofread :356-392): C (proofread missed Han), J (scope and merging), F1 (split into three). J and F1 conflict directly; C also changes what proofread must see. The 30,000-char cap is enforced here, before any model call.
- src/server/chapter-check.ts runChapterCheck :122-~320: H (context), F2 (extract split), F4 (serialize continuity vs extract; currently parallel at :163), and D's feedback loop (continuity result drives re-draft).
- src/ai/tasks/continuity-check.ts (effort high, maxTokens 16000, :139-140): H, F4, D.
- src/ai/tasks/chapter-extract.ts (:84-85 medium/16000) and src/ai/extraction.ts (533 lines), extraction-rules.ts: F2 (split), G1 (dedupe, quote verify), G2 (entities/relations/threads), and proposals path.
- src/ai/tasks/interview-extract.ts (:78-79, maxTokens 8000), interview-question.ts (:194-195, maxTokens 2000, effort low), src/server/interview.ts: I, G1 (dedupe against facts), B (voice question).
- src/ai/tasks/reader-sim.ts (:55-56): F3 (parallel personas) hits the concurrency gate (run.ts:221-225).
- src/ai/tasks/style-suggest.ts (:30-31, maxTokens 4000): B (voice), E2 (copy rule).
- src/ai/context.ts (462 lines): B (voice always included), H (context pack includes manuscript-named cards; currently misses items, per backlog H).
- src/ai/ollama.ts (537 lines): C (temperature), F4 (serialization and effort switch). Not product-wired (see 0).
- src/lib/korean/sentences.ts (split, locateQuote :63), spelling-rules.ts (ruleBasedSpellcheck :189), chars.ts (countChars): E1 (paragraph sentence count), E2 (repeated words), J (rule vs AI overlap), A (length count). Product length uses countChars withSpaces; the harness also uses countChars(trimmed).withSpaces (eval/novel/metrics.ts:44-46). A product guard must use the same definition or the harness and product disagree.
- eval/novel/metrics.ts (chapterMetrics, lengthOk :50, foreignRuns :52): shared by C, A, E1, E2. If the guard library is written as product code, the harness should import it instead of keeping a copy, or the two regexes can drift.
- eval/novel/models.ts (profiles, temperature, maxTokensFloor), eval-client.ts (TASK_DEFS :109-124, maxTokens floor, productTimeoutMs), run.ts (setAiTimeoutOverride :126), worker-lock.ts: C (temperature hypothesis lives here), F4 (effort switch and serialization), HX4 (resume/resummarize), HX1/HX3 (eval agents and author).
- eval/novel/agents/author.md, reviewer.md, summary.md, resume-note.md; eval/novel/localize/scaffold.ts and en-systems.ts; eval/novel/steps/*.ts: HX1 (reviewer blinding), HX2 (English substitution table, `새 회차` label), HX3 (author sees wiki), HX4 (summary save, resume).
- src/test/fake-ai.ts and src/test/ai-fakes/*: C and every AI task need fixed outputs for unit tests (CLAUDE.md: never call the real API in tests).

== 5. Minimal public interface proposal (TypeScript) ==
Guard library (new, pure, no AI, no DB). Proposed path src/ai/guards/index.ts (or src/lib/korean/foreign-script.ts for the scanner alone):

```ts
// src/lib/korean/foreign-script.ts (pure; same script set as eval/novel/metrics.ts:37)
export type ForeignSpan = { start: number; end: number; text: string; script: 'han' | 'kana' | 'cyrillic' | 'replacement' }
export function findForeignSpans(text: string): ForeignSpan[]
```

```ts
// src/ai/guards/index.ts (pure)
export type GuardCode = 'foreign_script' | 'paragraph_sentences' | 'repeated_word' | 'example_copy' | 'short_length'
export type GuardIssue = { code: GuardCode; start: number; end: number; excerpt: string; messageKo: string }
export type GuardReport = { ok: boolean; issues: GuardIssue[] }
export function checkDraft(text: string, opts: { targetChars: number; styleExamples: string[] }): GuardReport
```
Repair (server, after `done`), new task and service:

```ts
// src/ai/tasks/draft-repair.ts: AiTaskDef<{ text: string; spans: { start: number; end: number; text: string }[] }, { replacements: { quote: string; replacement: string }[] }>
// Add 'draft-repair' to AI_TASKS (src/db/types.ts:142). ai_runs.task is a text column typed by AiTaskName (src/db/schema.ts:537), so no migration is needed (verified).
// src/server/ai-features.ts
export async function repairDraftSpans(
  db: Db, actor: Actor,
  input: { workId: string; runId: string; text: string },
  client?: AiClient, signal?: AbortSignal,
): Promise<{ text: string; runId: string; unresolved: ForeignSpan[] }>
```
Rules that the signature implies: the repair uses neutralizeTags on the text and TAG_DATA_RULE in the system prompt; it applies replacements only where the quote occurs exactly once or where locateQuote finds it (same approach as proofread.ts:46-49); it returns unresolved spans instead of throwing; it requires editor role (requireWorkRole) and returns NOT_FOUND for non-members; its errors are AppError with Korean text.

Temperature hypothesis: no product signature change. The test is an eval profile change in eval/novel/models.ts (ollama.temperature) under a new profile id, not a change to src/ai/ollama.ts defaults.

== 6. What could regress ==
- Token budget: a repair call adds up to a full call of billing; a retry for A doubles draft cost. Both count against the 3,000,000/day cap (run.ts:19).
- 120 s product timeout: a local model (qwen, 84-98 min per chapter in eval) cannot meet 120 s for any structured call; the harness override hides this. Any new local-side call needs its own timeoutMs (proofread, extract, sim are already over at 120 s on qwen per the backlog section F).
- 280 s stream budget: the draft call plus a repair or retry in one request exceeds the 300 s route maxDuration (route.ts:14) if they share the request. Repair must be a second request or a second action, not inside startDraft's stream.
- Prompt injection: a new tag or raw field bypassing neutralizeDeep (draft-chapter.ts:37 pattern) is an injection path. TAG_DATA_RULE must be in the system prompt of every new task.
- Streaming: the stream must not emit `\u001e` (draft-stream.ts:5). Changing the draft text after `done` changes what the panel shows; draft-panel.tsx :84 sets state from the stream, so a post-done replacement needs an explicit setDraft from the final text.
- Concurrency gate: F1/F2/F3 parallel calls plus chapter-check's parallel pair can hit CONFLICT (run.ts:224) and surface as Korean errors to the author.
- Harness/product drift: if the product guard copies metrics.ts logic, eval numbers stop matching what the author sees.

== 7. Open questions for the author ==
1. Should the foreign-script repair be automatic (a second request after the draft finishes) or only a warning shown to the author with a button? Automatic doubles cost and time; warning-only does not fix the draft.
2. Local temperature: is the "lower temperature" test allowed as a new eval profile only, or should the product ever get a local (Ollama) client? The product currently has no local path (src/ai/index.ts:17). If no local product path is planned, C's local measurement is eval-only.
3. Is a Han/kana/Cyrillic span ever valid in a Korean novel (e.g. a deliberate hanja term, a Chinese-setting name)? If yes, the guard needs a per-work allowlist, otherwise the repair will rewrite intended text.
4. Is the 120 s structured default kept for local models, or raised per task (imports.ts:288 precedent 240 s)? This sets whether F1/F2/F3 can run as separate calls at all.
5. Which proofread owner resolves the J vs F1 vs C conflict: does Han detection go into the rule checker (src/lib/korean/spelling-rules.ts) or into the AI proofread prompt? The rule checker is deterministic and runs always (chapter-check.ts:44-46, :59-67); a Han rule there would not depend on the model at all.
6. Should the repair step replace only the failing word, or the whole sentence? Word-level is cheaper but harder to locate without the quote-merge work from J.
7. For D (two-step draft): does the beat list count against the 16000 token cap (draft-chapter.ts:17) or does it get its own budget?
8. HX4 "copy retry": the backlog does not say which copy function. Does it mean the draft-panel copy action or the harness document copy (eval/novel)? Unverified; needs the author's identification.
9. Track ordering: should C land before or after the shared guard library exists? C needs only findForeignSpans, which can ship alone in src/lib/korean without the guard library.
10. Does the author accept that C's effect cannot be measured until a local product path exists (open question 2) and will be verified only by unit tests on the local branch?

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog; track C text at lines 57-62 and cross-track items A to J at lines 36-111
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts`  - TAG_DATA_RULE (:5), neutralizeTags (:12), neutralizeDeep (:17); injection guard all tasks rely on
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts`  - OllamaOptions.temperature (:44), chatBody options mapping (:399-405); not wired into the product
- `/home/xogud/documents/github/DaeumHwa/src/ai/index.ts`  - Provider selection (:12-20), only Anthropic or OpenCode; no Ollama product path
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - Timeouts (:28, :31), callSignals (:66-75), concurrency gate (:20-22, :221-225), daily limit (:19), startAiStream (:143-189), timeout override (:36-39)
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts`  - AiClient, GenerateObjectArgs, StreamTextArgs, AiTaskDef (:50-61)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts`  - Draft prompt and tokens (:6-18), buildDraftPrompt (:36-63); hottest file for A, B, C, D, E2
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts`  - Proofread prompt (:25-33), task and quote merge (:35-53); J, F1, C
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts`  - effort high and 16000 tokens (:139-140); H, F4, D
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/chapter-extract.ts`  - Extraction task (:84-85), proposals-only output note (header); F2, G1, G2
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/reader-sim.ts`  - Persona sim task (:55-56); F3 parallel calls vs concurrency gate
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-question.ts`  - effort low, 2000 tokens (:194-195); I, B
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/interview-extract.ts`  - maxTokens 8000 (:78-79); G1, I
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/style-suggest.ts`  - maxTokens 4000 (:30-31); B, E2
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts`  - Context pack builder (462 lines); B, H
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - startDraft (:259-345), createChapterFromDraft (:347); A, C, D, B attach here
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - aiSpellChecker (:74-98), MAX_PROOFREAD_AI_CHARS (:51), runChapterCheck parallel pair (:163), runProofread (:356-392); J, F1, F2, F4, H
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts`  - Draft stream route, maxDuration 300 (:14), status mapping (:23-31), stream write (:67-79)
- `/home/xogud/documents/github/DaeumHwa/src/lib/draft-stream.ts`  - DRAFT_ERROR_MARK (:5), error record framing (:10-36); guard must not emit the mark
- `/home/xogud/documents/github/DaeumHwa/src/components/writing/panels/draft-panel.tsx`  - Consumes the stream and sets draft text (:64-84); post-done repair must set state again
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.ts`  - Rule-based spellcheck (:189); candidate home for a deterministic Han rule
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/sentences.ts`  - splitSentences (:10), locateQuote (:63); E1, J, repair locate
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts`  - countChars withSpaces (:5); A length definition shared with harness
- `/home/xogud/documents/github/DaeumHwa/src/server/access.ts`  - requireWorkRole (:72); NOT_FOUND rule for non-members
- `/home/xogud/documents/github/DaeumHwa/src/server/action-helpers.ts`  - withAction (:12), revalidateWork (:22)
- `/home/xogud/documents/github/DaeumHwa/src/server/proposals.ts`  - Approval transaction (:36, :642), archive filters (:389, :431, :530); G1, G2, change_log path
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts`  - AI_TASKS list (:142) and AiTaskName (:153); add 'draft-repair' here
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts`  - ai_runs.task is text typed by AiTaskName (:537), no DB enum, so a new task name needs no migration
- `/home/xogud/documents/github/DaeumHwa/src/server/imports.ts`  - Only product timeoutMs override, 240000 (:288)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts`  - Harness T3 length (:44-50), T5 foreign-script regex and foreignRuns (:7-9, :37, :52); shared by C, A, E1, E2; product must not drift
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts`  - Profiles: temperature per model (:48, :59, :71), maxTokensFloor 32000, timeouts; C temperature hypothesis lives here
- `/home/xogud/documents/github/DaeumHwa/eval/novel/eval-client.ts`  - TASK_DEFS timeouts (:109-124), maxTokens floor and productTimeoutMs (~:440-460); F4, C, harness-vs-product limits
- `/home/xogud/documents/github/DaeumHwa/eval/novel/run.ts`  - setAiTimeoutOverride (:126, :140); harness-only override
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/author.md`  - Author agent prompt; HX3 (author sees wiki)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/agents/reviewer.md`  - Reviewer prompt; HX1 (reviewer blinding)
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/scaffold.ts`  - English substitution table; HX2
- `/home/xogud/documents/github/DaeumHwa/eval/novel/worker-lock.ts`  - Per-run worker lock; F4 serialization and HX4 resume
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`  - Eval design intent (measure-only round, section 2 non-goals)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`  - Plan lines 536-550 define T5 and T3 metric contracts; drift-guard test for Hangul in prompts

Open questions:
- Should the foreign-script repair run automatically as a second request after the draft finishes, or only warn the author with a button? Automatic doubles the cost and time.
- Is the lower-temperature test allowed only as a new eval profile in eval/novel/models.ts, or does the product ever need a local (Ollama) client? src/ai/index.ts:17 has no local path today, so C's local measurement is eval-only.
- Are Han, kana or Cyrillic spans ever valid in a Korean novel (a deliberate hanja term, a Chinese-setting name)? If so, the guard needs a per-work allowlist, or the repair rewrites intended text.
- Is the 120 s structured default (src/ai/run.ts:28) kept for local models, or raised per task as imports.ts:288 does? This decides whether F1, F2 and F3 can run as separate calls at all.
- Should Han detection go into the deterministic rule checker (src/lib/korean/spelling-rules.ts, always on via chapter-check.ts:44-46) or stay in the AI proofread prompt? A rule costs no model call and does not depend on the model.
- Should the repair replace only the failing word or the whole sentence? Word-level is cheaper but needs the quote-merge work from J to locate reliably.
- For D (two-step draft), does the beat list count against DRAFT_MAX_TOKENS 16000 (draft-chapter.ts:17) or get its own budget?
- HX4 says 'copy retry' without naming the function. Is it the draft-panel copy action or the harness document copy step under eval/novel? Unverified.
- Should C land before the shared guard library exists? C needs only findForeignSpans, which can ship alone in src/lib/korean.
- Does the author accept that C can be verified only by unit tests on the local branch until a local product path exists (question 2)?

## survey:C:specs

TRACK C (foreign-script block, T5) survey, read-only. Nothing in the repo was edited.

WHAT THE TRACK TOUCHES (verified)
- Ollama options: src/ai/ollama.ts:44 (temperature?), :399-402 (options: num_ctx, temperature, top_p). Ollama client is NOT wired to the product: src/ai/index.ts:15-17 only builds OpencodeAiClient or AnthropicAiClient. The numbers themselves are set in eval/novel/models.ts:39-75 (qwen: numCtx 262144, temperature 1.0, topP 0.95, topK 20, minP 0, think true, line 48).
- Draft: product path src/server/ai-features.ts:259-340 (startDraft, streamed through startAiStream, nothing written to the manuscript) and :344-365 (createChapterFromDraft, only from a completed run). Draft system prompt src/ai/tasks/draft-chapter.ts:6-16, DRAFT_MAX_TOKENS 16000 and DRAFT_EFFORT high at :17-18.
- Proofread: src/ai/tasks/proofread.ts:9 (PROOFREAD_KINDS = spelling, spacing, grammar, awkward), :25-33 (PROOFREAD_SYSTEM, ends with "모든 출력은 한국어로 쓴다").
- Harness draft retry loop: eval/novel/steps/chapter.ts:80-186 (draft step, draft_review answer, maxAttempts from ctx.config.maxDraftAttempts; cli.ts:121 sets 3, i.e. 1 draft + 2 rewrites).
- Harness foreign-script metric: eval/novel/metrics.ts:38-53 (Han, Hiragana, Katakana, Cyrillic, U+FFFD runs flagged at any length; Latin 4+ letters flagged only in Korean text). The qwen ko run reported foreignRuns [] because it ran before commit 9bf7bdd (docs/eval/novel/2026-10-18/summary.md:202; qwen3.8-27b-ko.md:21). So the current metric would catch 以上是 / 三楼 / 嬷嬷, but the old run was not re-measured.

CONSTRAINTS AND DECISIONS THAT MUST NOT BE RE-LITIGATED
1. Local models are out of product scope. Eval design §12 item 7 and §5 (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:339, :90-91 and the Ollama client section ~:90-103) say the Ollama client stays in src/ai/ but is not connected to product provider selection. Interview reliability spec §3 non-goal "로컬 AI 모델 지원" (docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md §3). The backlog wording "앱의 AI 응답을 고치고" (docs/eval/novel/follow-up-ai-improvement.md:5) and item C's "앱" framing therefore conflict with these decisions for any Ollama-only change. A product-visible T5 fix would need a new decision.
2. Sampling values are vendor-recommended, not maxed. Eval design §5 :75 ("최대로 올리면 문장이 무너지므로, 각 모델 제작사가 품질용으로 권장하는 값") and §12 item 1. model-setup.md:22 records qwen thinking-mode values (1.0 / 0.95 / 20) and explicitly rejects non-thinking values (0.7, 0.8). The plan first used temperature 0.6 (docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md:107, :161) and Task 10 replaced it with researched values (:157, :672-677). Lowering temperature is a deviation from the recorded vendor value. Backlog item C already frames it as a comparison run "(가설)" (follow-up-ai-improvement.md:61-62), so it is allowed only as a labeled comparison with a new source and a model-setup.md update, not as a silent default change.
3. Reuse rule. docs/eval/novel/README.md:36 reuses a trial run only when its settings match the main run. A temperature change means a new run, not a reuse.
4. Draft rewrites are author-judged, max 2. Eval design §6.2 (:147-152): "다른 언어거나 ... 실제 작가처럼 다시 쓰게 한다(최대 2번, 설계 판단)", and "다시 쓴 횟수와 이유는 그 모델의 약점으로 기록". Decision 13 (:345): unusable drafts rewritten at most 2 times, then best attempt saved and recorded. A code gate that auto-retries or regenerates only the bad span must still count as a rewrite in the record. Regenerating a single word span is not in any spec. The span-only idea in backlog item C (follow-up-ai-improvement.md:60-62) is new.
5. Product draft behavior is fixed by spec. F13 (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:262-265): the draft is streamed, nothing goes to the manuscript directly, and the buttons are "새 회차로 만들기" and "현재 원고 끝에 붙이기". Interview reliability §5D: a cancelled draft keeps its partial text, and "완료된 run만 회차로 만든다". A post-draft span regeneration in product would need to respect streaming and these rules. Product has no author-judged rewrite loop (grep of src/server/ai-features.ts found none).
6. Proofread contract. F14 (MVP design :267-269): suggestions {quote, replacement, kind, reason}, quote must be a real substring, with code validation. Eval design §6.4 (:180): "맞춤법: 실제 오류를 고치는 제안만 수용". A Han-span finding could be passed to the proofread prompt, but adding a kind changes the zod enum in proofread.ts:9. Interview reliability §6: no min/max/regex/default/optional in structured-output zod schemas.
7. No language hooks in product code. Eval design §6.5 (:~196-210): English localization stays in eval/novel/localize; product code must not gain language switches. Any product-side detector must be language-neutral.
8. Client policy parity. Eval design §6.1 (:96-97): Ollama client uses the same zod validation and retry policy as AnthropicAiClient, and any deviation must be recorded in the run config. Decision 17 (:349). A Ollama-only retry or sampling change would break this unless it is recorded.
9. Interfaces. AiClient (src/ai/types.ts) has no temperature or sampling field in GenerateObjectArgs or StreamTextArgs. Adding one changes a shared contract used by the Anthropic and OpenCode clients.
10. Tests: never call real AI or Ollama (plan :18; interview reliability §6). Use FakeAiClient from @/test/fake-ai.
11. Criterion: T5 = no foreign-language sentences or broken characters in the Korean or English text (docs/eval/novel-quality-criteria.md:60).

WHAT THE CHANGE WOULD CONTRADICT (if done naively)
- A product-side Ollama fix (scope items 1 and 8).
- Changing qwen temperature without a comparison label or source (item 2, reuse rule item 3).
- Auto-regenerate without counting it as a rewrite (item 4).
- Span regeneration in product draft flow (item 5).
- Adding a proofread kind without a schema change path (item 6).

OPEN QUESTIONS
- The backlog says "앱의 AI 응답을 고치고" (follow-up-ai-improvement.md:5), but the Ollama client is harness-only. Does the user want the T5 fix in the harness (eval/novel) only, or a new product decision?
- DRAFT_SYSTEM (draft-chapter.ts:6-16) does not show a Korean-output clause in its visible rules. The MVP spec (:351) says every prompt states Korean output. TAG_DATA_RULE was not checked. Verify before adding a language rule.
- Whether an auto-regeneration in the harness is an author rewrite (counted against the cap of 2) or a separate, logged step.
- Whether the "lower temperature" run should use a researched value (new source) or be framed only as an experiment.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 5, 21, 57-63 - Track C backlog: problem, planned fix (span detection, regenerate or retry, temperature comparison) and metrics. Scope claim '앱의 AI 응답을 고친다' at line 5.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 38-40, 75, 78, 90-103, 147-152, 180, 196-210, 339, 345, 349 - Eval design: sampling policy (vendor values, not maxed), author rewrite rule (max 2), English localization rule, Ollama client scope, decisions 1, 7, 13, 17.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/model-setup.md` 9, 15, 22-25 - Recorded sampling values and sources; rejects non-thinking values for qwen.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 18, 96-107, 157-163, 672-677 - Ollama options contract; temperature 0.6 first, later replaced by researched values in Task 10.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/README.md` 33-36 - Rule: trial results reused only when settings match; local keeps max effort.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 121, 124, 200-204, 236 - Evidence: three Han rewrites, final text kept 嬷嬷, metrics commit 9bf7bdd, hypothesis on temperature.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 21, 52, 69, 342 - Run-level T5 evidence, foreignRuns [] despite Han in text, rewrite reasons.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel-quality-criteria.md` 60 - T5 definition.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 262-269, 325-327, 345, 351, 385 - F13 draft (streamed, not written directly), F14 proofread contract, AI client shapes, Korean-output rule for all prompts.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 3, 6, 'D. AI 시간 제한과 취소' section, 'E' section, 6 - Non-goal 'local model support', cancel/partial-draft rules, completed-run-only rule, zod schema constraints, no-real-AI tests.
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts` 44, 48, 100-105, 399-402 - Where temperature/top_p are passed to Ollama and the stripThink path; harness-only client.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 39-75 - Actual qwen, gpt-oss and exaone sampling values used by the harness.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 7-9, 38-53 - Existing foreign-script detector (Han, kana, Cyrillic, U+FFFD; Latin 4+ in Korean).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 80-186 - Draft attempt and author review loop (where a span gate or retry would sit).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/cli.ts` 121 - maxDraftAttempts = 3 (1 draft + 2 rewrites).
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 253-340, 344-365 - Product startDraft (streamed) and createChapterFromDraft (completed run only). No product rewrite loop.
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts` 1-61 - AiClient contract; no sampling fields in GenerateObjectArgs or StreamTextArgs.
- `/home/xogud/documents/github/DaeumHwa/src/ai/index.ts` 3-17 - Product provider wiring: only OpenCode and Anthropic clients; Ollama not connected.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 6-18 - Draft system prompt (no visible Korean-output clause in rules), max tokens and effort.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 9-33 - Proofread kinds enum and Korean-output system prompt.

Open questions:
- The backlog (follow-up-ai-improvement.md:5) says the fix goes into the app's AI responses, but the Ollama client is harness-only (src/ai/index.ts:15-17; eval design §12 item 7). Should the T5 fix stay in eval/novel, or is a new product decision needed?
- Is the lower-temperature run a labeled comparison (new source, model-setup.md updated) or a change to the qwen default in eval/novel/models.ts:48? The recorded decision says vendor values, not maxed.
- Does a harness span regeneration or automatic retry count as an author rewrite against the cap of 2 (eval design §6.2, decision 13), and how is it logged?
- DRAFT_SYSTEM (src/ai/tasks/draft-chapter.ts:6-16) shows no Korean-output clause in its visible rules, while MVP design :351 says all prompts state Korean output. TAG_DATA_RULE was not checked; verify before adding any language rule.
- Because Ollama is not product-wired, should a span-level Han detector be implemented in the harness first (metrics.ts / steps/chapter.ts) and measured there, before any product change?

## survey:C:tests

TRACK C test map (read-only survey, nothing edited). Line numbers are given where I read them directly; symbol names are given otherwise.

KEY FINDINGS THAT CONSTRAIN THE TRACK
1. Ollama is not in the app's runtime. src/ai/index.ts:12-21 getAiClient() returns only AnthropicAiClient or OpencodeAiClient. `new OllamaAiClient` appears only in eval/novel/models.ts (createModelClient, around lines 113-124). So any temperature change in src/ai/ollama.ts reaches only the eval harness, not the product. The qwen temperature lives in the eval profile: eval/novel/models.ts ~lines 40-48, `ollama: { numCtx: 262144, temperature: 1.0, topP: 0.95, topK: 20, minP: 0, think: true }`. OllamaAiClient has no default temperature; it forwards o.temperature as options.temperature (src/ai/ollama.ts:44, 401-404).
2. The draft is streamed to the UI before it is known to be bad. startDraft (src/server/ai-features.ts, draft section lines ~253-340) returns textStream plus done; the route src/app/api/works/[workId]/draft/route.ts streams text. A foreign-script retry in the product therefore cannot hide the first attempt from the author, and must run on the full text before createChapterFromDraft (src/server/ai-features.ts ~344-373) stores it, or be a word-level fix after the fact. Only the eval path can retry freely: eval/novel/steps/chapter.ts draft step (lines ~80-130) calls startDraft and awaits run.done inside withModelRetry, so a retry there is cheap to add.
3. Proofread does not see the draft. proofreadTask (src/ai/tasks/proofread.ts:35-53) and the rule checker ruleBasedSpellcheck (src/lib/korean/spelling-rules.ts:189) both run in src/server/chapter-check.ts (runProofread, ruleSpellChecker, aiSpellChecker, MAX_PROOFREAD_AI_CHARS = 30_000). Rule suggestions need a replacement; a Han character has none, so a Han finding is a flag, not a rule suggestion. The existing foreign-script check exists only in the eval: eval/novel/metrics.ts chapterMetrics (line 41), foreignRuns at lines 52-55 built from LATIN_RUN, OTHER_SCRIPT_RUN, HANGUL_RUN. The regex constants and the function are not exported, so reuse means extracting them to a shared module (for example src/lib/korean/foreign-script.ts). Note src/lib/korean/chars.ts holds only countChars.

EXISTING TEST FILES THAT COVER TOUCHED CODE
- src/ai/ollama.test.ts (892 lines): client helper lines 61-70 uses temperature 0.6, topP 0.95, topK 20; generateObject tests start line 82 ('sends schema, options and think' line 83, expects body options at ~101-102); streamText 476-589; speed stats 590-718; stripThink 719; ollamaTransport 731-892. Uses an injected fetch against a local http server.
- src/ai/tasks/draft-chapter.test.ts (117 lines): exact DRAFT_SYSTEM line array; buildDraftPrompt tags and (없음) fallbacks; fakeDraft determinism and >=600 chars; tag-closing isolation; TAG_DATA_RULE in system.
- src/ai/tasks/proofread.test.ts (65 lines): system brief startsWith; fake output empty; postProcess drops unlocatable quotes and no-op replacements; tag isolation.
- src/server/ai-features.test.ts: describe 'draft' at line 173 (rejects empty instructions 182; streams fake text and stores run output 191; prompt contains work cards/entries/previous tail 210; numbering 259; createChapterFromDraft 276; unknown run id 300; viewer rejected 309). Uses FakeAiClient passed as the client argument to startDraft.
- src/server/chapter-check.test.ts (522+ lines): runChapterCheck 80-415; runProofread describe at 337 (rule 되요 suggestion with offsets when useAi false 338; AI collision handling 360; viewer FORBIDDEN 390); runProofread input length 497 (MAX enforced before any model call; exact limit accepted 522).
- src/lib/korean/spelling-rules.test.ts: ruleBasedSpellcheck describe at line 53 (sorted and non-overlapping 65; 껄껄 and 서울께서 not flagged 76).
- src/lib/korean/chars.test.ts: countChars.
- src/ai/run.test.ts: runAiTask (118) incl. postProcess (138).
- src/app/api/works/[workId]/draft/route.test.ts: POST draft at line 40 (401 at 53, 400 at 63, 404 at 69, plain text plus run id header 80, run done before body closes 92, Korean error record 118, generic error 144).
- src/test/fake-ai.test.ts (154 lines): FakeAiClient behavior.
- eval/novel/metrics.test.ts: chapterMetrics foreignRuns describe at line ~90 (Han/kana/Cyrillic/U+FFFD in ko at any length; Latin runs of 4 or more in ko; Hangul/Han/kana in en).
- eval/novel/models.test.ts exists (profile checks; not read in detail).

FACTORIES (src/test/factories.ts): createTestUser (line 20), createTestWork (33), addTestMember (50), createTestChapter (59; options position, title, body, status, publishedOn), createTestEntry (87), createTestFact (105), createTestThread (132). Database: src/test/db.ts (createTestDb). Setup: src/test/setup.ts (one line).

FAKE WIRING
- src/test/fake-ai.ts: class FakeAiClient implements AiClient. Options { overrides?: Partial<Record<AiTaskName, fn>> }. generateObject returns FAKE_OUTPUTS[name](input) parsed by the schema, or the override. streamText splits FAKE_TEXT[name](input) into 40-code-point chunks; overrides for streamed tasks must return strings. Throws 'No fake output for task X' when neither exists.
- src/test/ai-fakes/index.ts: FAKE_OUTPUTS (structured: interview-question, interview-extract, chapter-extract, continuity-check, proofread -> fakeProofread returning {suggestions: []}, reader-sim, direction-advice, style-suggest) and FAKE_TEXT (streamed: 'draft-chapter' -> fakeDraft).
- src/test/ai-fakes/draft-chapter.ts: fakeDraft splits instructions into six paragraphs, prefixed '(데모 초안) ', at least 600 chars, no Han characters.
- setAiClientForTests (src/ai/index.ts:23) swaps the process client for tests.

EXACT VITEST COMMAND (for the touched files, run from repo root):
pnpm vitest run src/ai/ollama.test.ts src/ai/tasks/draft-chapter.test.ts src/ai/tasks/proofread.test.ts src/server/ai-features.test.ts src/server/chapter-check.test.ts src/lib/korean/spelling-rules.test.ts src/app/api/works/[workId]/draft/route.test.ts eval/novel/metrics.test.ts --maxWorkers=2
(Add the new test files to the list. Quote the bracketed route path in the shell.)

NEW TEST CASES THAT MUST EXIST (name | input | expected)
A. src/lib/korean/foreign-script.test.ts (new helper, for example findForeignRuns(text, lang))
 1. 'flags Han characters inside a Korean sentence' | '그는 以上是 말했다.' ko | ['以上是']
 2. 'flags a single Han character run in Korean text' | '三楼 복도' ko | ['三楼']
 3. 'flags kana, Cyrillic and U+FFFD in Korean text' | 'ひらがな Привет 깨짐�' ko | ['ひらがな','Привет','�']
 4. 'ignores Latin runs shorter than four letters in Korean' | 'OK 그는 말했다' ko | []
 5. 'returns nothing for pure Korean text' | '그는 조용히 문을 닫았다.' ko | []
 6. 'keeps the order of first appearance across rules' | '嬷嬷 Hello 以上' ko | ['嬷嬷','Hello','以上'] (grouping order must match chapterMetrics: Latin first, then other scripts, so verify against metrics.ts line 52-55 before fixing the expectation)
B. Ollama temperature (only if a lower default is adopted for the eval profile)
 7. src/ai/ollama.test.ts 'sends the configured temperature in options' | OllamaAiClient with temperature 0.3, fake fetch capturing body | body.options.temperature === 0.3
 8. eval/novel/models.test.ts 'qwen profile keeps the variant temperature by default and accepts an override' | profile qwen3.8-27b with override | ollama.temperature matches the chosen value (expected value depends on the hypothesis run, not yet decided)
C. Foreign-script retry for the eval draft (eval/novel/steps, new test file chapter.test.ts or extension of an existing steps test)
 9. 'retries a draft whose text has Han and keeps the clean attempt' | fake client: first draft text contains 三楼, second is clean | run count 2, saved text has no Han, failed list empty
 10. 'gives up after the retry cap and records the foreign run' | fake client returns Han every time | attempts equal cap, failed entry names the foreign run, chapter not saved with Han unless policy says so (policy to decide)
D. Word-level regeneration (if the fix regenerates only the affected sentence, not the whole draft)
 11. 'regenerates only the sentence containing the foreign run' | text: '첫 문장. 그는 以上是 말했다. 끝 문장.' with a fake that rewrites only the given sentence | output keeps the two Korean sentences byte-identical and the middle sentence has no Han
 12. 'fails with BAD_STATE when the replacement still has Han' | fake replacement contains 以上 again | AppError BAD_STATE (Korean message), no change saved
E. Product draft path (src/server/ai-features.test.ts, describe 'draft')
 13. 'does not store a draft whose text has Han until it is checked' | override draft-chapter returning '(데모 초안) 三楼 ...' | createChapterFromDraft behavior matches the chosen policy (flag vs. block) — policy still open
F. Prompt guard (src/ai/tasks/draft-chapter.test.ts)
 14. 'system prompt forbids characters outside Hangul in prose' | DRAFT_SYSTEM | contains a new rule line (exact text TBD); existing exact-array test at lines starting 'uses the exact Korean system prompt' must be updated with it
G. Rule checker (only if Han is reported as a proofread flag)
 15. src/server/chapter-check.test.ts 'flags Han in the manuscript as a foreign-script issue with no replacement' | runProofread text '以上是.' useAi false | one suggestion, kind chosen by the design, replacement empty or absent (ruleBasedSpellcheck's rule shape cannot express this without a schema change)

EXISTING TESTS THAT WOULD BREAK, AND WHY
- src/ai/tasks/draft-chapter.test.ts 'uses the exact Korean system prompt' (line array equal): breaks on any edit to DRAFT_SYSTEM, including adding the no-Han rule.
- src/ai/ollama.test.ts 'sends schema, options and think' (line 83 onward, body options at ~101-102): breaks if OllamaAiClient adds a default temperature or changes option names. Adding only an explicit temperature in eval profiles does not break it.
- src/ai/tasks/proofread.test.ts 'system prompt is the Korean proofreading brief' (startsWith): breaks only if the proofread prompt head changes.
- src/server/ai-features.test.ts 'streams the fake text and stores it as the run output' (asserts text startsWith '(데모 초안) '): breaks if startDraft changes the returned text or adds a retry that alters FakeAiClient output. fakeDraft has no Han, so it is safe today.
- src/server/chapter-check.test.ts runProofread 'returns the rule suggestion for 되요...' (exact one-element array): breaks if a new rule source adds suggestions to '안 되요.'. A Han-only rule does not fire on that text, so safe.
- src/lib/korean/spelling-rules.test.ts: breaks only if Han rules are added to SPELLING_RULES (the sorted/non-overlap and 껄껄 tests would still pass, but any exact-count assertion would not).
- eval/novel/metrics.test.ts foreignRuns tests (around lines 90-115): break if the regex is moved and the grouping order changes.
- src/app/api/works/[workId]/draft/route.test.ts 'streams plain text with the run id header': breaks only if the route buffers the text before streaming (a retry before first byte).

OPEN QUESTIONS
1. Product policy for a Han hit after the draft is streamed: flag only, block the save, or retry? The stream already reached the author.
2. Is the lower-temperature hypothesis to be tested by editing the qwen profile (eval/novel/models.ts) only, or also a product default? Ollama is not in the product runtime (src/ai/index.ts:12-21).
3. Han has no deterministic replacement, so it cannot be a rule suggestion (ruleBasedSpellcheck shape, spelling-rules.ts:3-14) without a new kind or a schema change.
4. No test currently covers a Han character anywhere in product code; the only existing coverage is in eval/novel/metrics.test.ts.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.ts` 44-48, 178, 401-404 - OllamaAiClient; temperature/topP/topK/minP options forwarded to /api/chat (lines 44-48, 178, 401-404)
- `/home/xogud/documents/github/DaeumHwa/src/ai/ollama.test.ts` 61-70, 82-118, 476-589, 590-718, 731-892 - Ollama client tests: request options, streaming, transport, stats
- `/home/xogud/documents/github/DaeumHwa/eval/novel/models.ts` 40-48, 113-124 - Eval model profiles; qwen temperature 1.0; createModelClient builds OllamaAiClient
- `/home/xogud/documents/github/DaeumHwa/src/ai/index.ts` 12-21 - Product AI client selection: Anthropic or opencode only
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.ts` 1-71 - DRAFT_SYSTEM prompt, DRAFT_MAX_TOKENS, buildDraftPrompt
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/draft-chapter.test.ts` 1-117 - Exact system prompt assertion, prompt tag isolation, fakeDraft checks
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 253-386 - startDraft (streamed, returns textStream and done) and createChapterFromDraft; draft section
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.test.ts` 173-320 - Draft service tests
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.ts` whole file - Streams the draft text to the client
- `/home/xogud/documents/github/DaeumHwa/src/app/api/works/[workId]/draft/route.test.ts` 40-150 - Draft route tests (401/400/404, stream, error record)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.ts` 1-53 - Proofread AI task schema, prompt, postProcess
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/proofread.test.ts` 1-65 - Proofread task tests
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` whole file (ruleSpellChecker, aiSpellChecker) - Rule and AI spell checkers, runProofread, MAX_PROOFREAD_AI_CHARS
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.test.ts` 80-522 - runChapterCheck and runProofread tests
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.ts` 3-26, 189-221 - Rule-based spelling checker ruleBasedSpellcheck and SPELLING_RULES
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/spelling-rules.test.ts` 53-80+ - Rule checker tests
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/chars.ts` 1-14 - countChars only; no script detection
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 1-60 - Existing T5 foreign-run detection (eval only), chapterMetrics
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.test.ts` 88-115 - foreignRuns tests
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 80-130, 182-230 - Eval draft step (startDraft with withModelRetry), proofread step
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts` 20, 33, 50, 59, 87, 105, 132 - Test factories
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` whole file (75 lines) - FakeAiClient: generateObject, streamText, overrides, error on missing fake
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 1-29 - FAKE_OUTPUTS and FAKE_TEXT registries
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/draft-chapter.ts` 1-26 - fakeDraft demo text
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/proofread.ts` 1-6 - fakeProofread returns empty suggestions
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 55-66 - Backlog item C (foreign-script block) and related items A, F

Open questions:
- Product policy when a Han character appears after the draft has already streamed to the author: flag only, block the save, or retry? The stream reaches the author before the check runs (src/server/ai-features.ts startDraft; draft route streams text).
- Should the lower-temperature hypothesis be tested only in the eval qwen profile (eval/novel/models.ts ~40-48), or also as a product default? Ollama is not in the product runtime (src/ai/index.ts:12-21).
- Han characters have no deterministic replacement, so they cannot be expressed as a ruleBasedSpellcheck suggestion (src/lib/korean/spelling-rules.ts) without a new kind or a schema change to the proofread output.
- Exact expected grouping order for findForeignRuns (Latin first, then other scripts, as in eval/novel/metrics.ts:52-55) must be confirmed against the regex constants, which I did not read in full.
- No product test currently covers a Han, kana or Cyrillic character; the only existing coverage is eval/novel/metrics.test.ts.


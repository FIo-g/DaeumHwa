# Track H: survey reports (haiku, read-only)

Raw output of the survey workflow wf_f22cee2a-947. Unverified: file paths and line numbers must be re-checked before use.

## survey:H:code

TRACK H code map (read-only survey, nothing edited).

DATA FLOW
1. Product entry: src/server/actions/checks.ts:24-30 runChapterCheckAction -> src/server/chapter-check.ts:126-312 runChapterCheck(db, actor, {chapterId}, client?, signal?). loadEditableChapter (107-119). Context pack built at chapter-check.ts:144 with text = chapter.body (saved text), position = chapter.position.
2. Same function, parallel calls at chapter-check.ts:163-204: continuityCheckTask via runAiTask (src/ai/run.ts:82-; client.generateObject at run.ts:97; task.postProcess applied at run.ts:109) and chapterExtractTask.
3. Task def src/ai/tasks/continuity-check.ts:137-162: system CONTINUITY_SYSTEM (50-61), buildPrompt (142-151) renders <wiki> via renderContextPack(input.pack) (context.ts:308-354) and <manuscript>, postProcess (153-162) -> locateIssues (77-116) which drops issues whose quote is not in chapter or whose factRef/entryRef is unresolved, and dedupes ranges.
4. Back in chapter-check: resolveContinuityIssues (continuity-check.ts:119-135, called at chapter-check.ts:212-216) -> NewIssue mapping (chapter-check.ts:217-228) -> replaceOpenIssues (chapter-check.ts:231, src/server/issues.ts). Naming issues come from namingIssuesFor (chapter-check.ts:327-350), not from the AI.
5. Pack construction, src/ai/context.ts:114-305 buildContextPack: chapters (122-132), entries (134-138, non-archived), mentions via findMentions(input.text, name+aliases) (140-143), chosenIds in mention-count order then extraEntryIds appended (144-149), facts filtered by isFactValidAt (164-193, 438-445), threads (195-232), relations (234-260), previous summaries (262-267), naming rules (269-275), budget loop (285-300) that pops relations, then threads, then previous summaries, then ENTRIES FROM THE END of selection.entries (292-296). Default budget 12,000 chars (64). Final pack and approxChars (302-304).
6. Mention matcher src/lib/korean/mentions.ts:15-58 findMentions; isParticleRun (60-63) requires the name to be followed by a josa run or nothing (src/lib/korean/josa.ts MENTION_TOKENS line 19-22). Names shorter than 2 chars are skipped (mentions.ts:20). Only names and aliases are matched (mentions.ts:18-19, context.ts:142). A card whose manuscript short form is not an alias is never selected.

EVAL PATHS
A. eval/run-continuity.ts (script "eval:continuity", package.json:21): main 289-372; checkChapter 209-255 builds pack with buildContextPack at 223-226 and calls runAiTask at 238-244, then resolveContinuityIssues at 245. Scoring via eval/score.ts isHit (26) and scoreIssues (38). Results written to eval/results/continuity-<stamp>.json (345-364); recall printed by printSummary (261-287). Needs ANTHROPIC_API_KEY or OPENCODE_API_KEY (getAiProvider, src/lib/ai-mode.ts:17-25); otherwise SKIP_MESSAGE (41-42, 291-294). --fake uses FakeAiClient (301). Fixture: eval/fixtures/continuity/work.json (8 entries incl. 잿빛 종루 with alias 종루; 25 facts; 4 threads), answers.json (11 expected errors in chapters 3-10, 1 notDefect at ch7 age change), chapters/01-10.md. Fixture shape tests: eval/fixture.test.ts:17-61.
B. eval/novel steps: eval/novel/steps/chapter.ts check (around 259-272) calls runChapterCheck with ctx.client; continuity step (280-318) only consumes open issues through the author agent (consult/settle), it makes no AI call itself. The novel eval uses EN_SYSTEMS for the English run: eval/novel/localize/en-systems.ts CONTINUITY_SYSTEM (57-70), registered at 149; eval/novel/eval-client.ts:111 maps continuityCheckTask. localize.test.ts:322-326 requires no Hangul in EN_SYSTEMS.
C. Draft path also uses the pack: src/server/ai-features.ts:313-322 buildContextPack(text: instructions, extraEntryIds: input.entryIds) and renderContextPack for the draft prompt. Changing selection logic changes draft context too.

CALL SITES OF SIGNATURES THAT MAY CHANGE
- buildContextPack(db, workId, {text, position, extraEntryIds?, budgetChars?}) at context.ts:114-118: callers chapter-check.ts:144, run-continuity.ts:223, ai-features.ts:313, tests context.test.ts (lines 39,50,58,78,81,92,103,134,154,157,168,178,189,202,221,223,239,240). Adding an OPTIONAL field keeps all callers valid.
- renderContextPack(pack) context.ts:308: callers continuity-check.ts:145, ai-features.ts:322, context.test.ts:179,220-240, eval/novel/localize/localize.test.ts:311, e2e stub parses its format.
- resolveRefs context.ts:357: callers continuity-check.ts:87, chapter-check.ts:249, context.test.ts:208.
- resolveContinuityIssues(output, input) continuity-check.ts:119: callers chapter-check.ts:212, run-continuity.ts:245, continuity-check.test.ts.
- continuityCheckTask.postProcess signature (153) is fixed by AiTaskDef (src/ai/types.ts:58); changing its body needs no call-site change.
- e2e/ai-stub/responders.ts:99-155 (continuityAnswer, parseCards regex at 104 expecting "[E\d+] name (" lines, and <wiki> section) depends on renderContextPack line format (context.ts:313-314). Keep that format.

HOOKS AND SMALLEST DIFF
(1) Include every card whose name occurs in the manuscript (H1):
- Verified cause in the data path: candidate set = mention match on name/aliases only (context.ts:140-149). Review evidence: luna-6-ko.md:151 says the continuity context had 6 of 10 cards and no 잿빛 종루 card; luna-6-ko.md:276 proposes exactly this rule. The bible fixture has alias 종루 (eval/fixtures/novel/ko/bible.json:69-70), so whether the live DB card carried that alias is UNVERIFIED (eval/results is not in the repo).
- Second cause that works against it: extraEntryIds are appended last (context.ts:147-149) and the budget loop pops the last entries first (context.ts:292-296), so extras are the first to be dropped. A substring-based pass would be dropped at budget too.
- Smallest diff: add optional input to buildContextPack, e.g. includeNamedAnywhere?: boolean, and at context.ts:145-149 union in entryRows whose name or alias occurs as plain text.includes (no josa rule) when the flag is set. Pass the flag only at chapter-check.ts:144 and run-continuity.ts:223. Leaves the draft path (ai-features.ts:313) unchanged.
- Budget: pass a larger budgetChars at the same two continuity call sites (context.ts:117 already accepts it), or change trimming order so flagged entries are not popped first. Quick experiment without code: budgetChars at chapter-check.ts:144 and run-continuity.ts:223. Verify with pack.stats (context.ts:61) and run-continuity.ts:227-231 which already logs pack counts.
- Test to extend: context.test.ts 35-66 (selection) and 100-112 (budget).
(2) Rule "언급 없음은 모순이 아니다" (H2): no such rule exists today. Closest is continuity-check.ts:52 ("위키 근거가 없는 지적은 하지 않는다") and :58-59. Smallest diff: one added bullet in CONTINUITY_SYSTEM at continuity-check.ts:50-61, and the matching English bullet in eval/novel/localize/en-systems.ts:57-70. Evidence that the rule is needed: qwen-ko false positive (summary.md:114; qwen3.8-27b-ko review).
(3) Numeric facts compared in code (H3): no production code does this. The only example is test-only fakeAgeIssue in src/test/ai-fakes/continuity-check.ts:63-80 (regex /(\d+)\s*살/). Pack facts are already range-filtered (context.ts:164-171, isFactValidAt 438-445), so checks on pack.entries[].facts respect validity ranges. Hook point: continuityCheckTask.postProcess at continuity-check.ts:153-162, before locateIssues (155). Both chapter-check (via runAiTask, run.ts:109) and run-continuity get these issues without call-site changes. Issues need factRef set (locateIssues requires fact or entry ref, continuity-check.ts:94-96). Risk: multi-subject sentences; the fake takes the first sentence with a number.
(4) Recall measurement (H4): run pnpm eval:continuity with a real key (not --fake). Read the 재현율 line and eval/results/continuity-<stamp>.json totals (run-continuity.ts:345-364). Expected set is 11 items, so each hit is 9.1 points. Cloud runs with 0 findings give precision undefined, but recall is measurable on this fixture. Use run-continuity.ts pack logs (223-231) to confirm card inclusion before and after H1.
(5) Keep the test harness honest: continuity-check.test.ts:67-146 covers postProcess; add tests for the numeric pass there. src/test/ai-fakes/continuity-check.ts is the fake for --fake and unit tests.

OPEN QUESTIONS
- Whether the live Luna ko DB card 잿빛 종루 had alias 종루. The repo does not contain run data (eval/results absent). Check the run's wiki-final.json if it exists on disk.
- Whether budget trimming or the mention rule caused the 6/10 drop. Both are plausible; the run data would settle it.
- Whether H1 should change the draft path too (ai-features.ts:313).
- The fixture planted errors are all contradiction/naming/thread/timeline. Numeric check needs a planted age error to count in recall (answers.json already has 25살 at ch10, quote "25살의 도윤서는").

Files:
- `/home/xogud/documents/github/DaeumHwa/src/server/actions/checks.ts` 24-30 - Server action entry point: runChapterCheckAction calls runChapterCheck; no change needed for the track.
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 126-312 (buildContextPack call 144; continuity runAiTask 163-173; resolveContinuityIssues 212-228) - Product continuity flow: builds the pack from chapter body, runs continuityCheckTask, maps issues to replaceOpenIssues. Primary call site for H1 flag and budget change (line 144).
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 114-305 (buildContextPack); 140-149 (mention selection and extraEntryIds); 285-300 (budget trim); 308-354 (renderContextPack); 357-370 (resolveRefs); 438-445 (isFactValidAt) - Context pack selection: where H1 (every named card) and budget behaviour are decided. Optional input flag fits here without changing existing callers.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/mentions.ts` 15-58 (findMentions); 60-63 (isParticleRun) - Name matcher: only name/aliases with a josa or end after them. Short forms not listed as aliases are never found. Not changed by the minimal fix; a plain substring pass would be added alongside it.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/josa.ts` 11-22 - Particle list and MENTION_TOKENS used by isParticleRun.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 50-61 (CONTINUITY_SYSTEM); 67-71 (usableSuggestion); 77-116 (locateIssues); 119-135 (resolveContinuityIssues); 137-162 (continuityCheckTask buildPrompt/postProcess) - Continuity task. H2 rule goes into CONTINUITY_SYSTEM (50-61). H3 numeric pass goes into postProcess (153-162) before locateIssues (155).
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts` 82-125 (runAiTask; generateObject at 97; postProcess at 109) - Generic AI call wrapper. Shows that postProcess runs for every caller, so H3 applies to chapter-check and the eval without extra wiring.
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts` 58 - AiTaskDef.postProcess signature (fixed; not changed by the track).
- `/home/xogud/documents/github/DaeumHwa/eval/run-continuity.ts` 209-255 (checkChapter); 223-226 (buildContextPack call); 238-245 (runAiTask and resolveContinuityIssues); 289-372 (main); 345-364 (results JSON) - Recall harness for planted errors (H4). Calls the same buildContextPack and task as product, so H1 changes show up here. Add the flag and budget at line 223.
- `/home/xogud/documents/github/DaeumHwa/eval/score.ts` 26-38 - isHit and scoreIssues: hit/miss/false-positive scoring used for the recall line.
- `/home/xogud/documents/github/DaeumHwa/eval/fixture.test.ts` 17-61 - Fixture shape checks: 10 chapters, 11 expected errors in 3-10, age change kept out of expected errors.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/answers.json` 1-end (11 expected, 1 notDefect) - Answer key for planted errors (recall denominator). ch10 25살 item tests H3.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/work.json` entries array (8 entries; 잿빛 종루 alias 종루) - Fixture wiki: entries, facts, threads, naming rules loaded into the test DB.
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/chapters/01.md-10.md` whole files - Planted-error manuscripts (ch3-10 have errors).
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 259-272 (check step calls runChapterCheck); 280-318 (continuity review step, no AI call) - Novel eval path into the product check. Changes to H1-H3 flow through it automatically.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/en-systems.ts` 57-70 (CONTINUITY_SYSTEM English copy); 149 (registration) - English copy of the continuity system prompt. H2 rule must be added here too for en runs.
- `/home/xogud/documents/github/DaeumHwa/eval/novel/localize/localize.test.ts` 322-326 (EN_SYSTEMS no-Hangul check); 251 (continuity prompt sample) - Guard that the English system prompt stays Hangul-free.
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.test.ts` 35-66 (selection tests); 100-112 (budget drop test) - Existing tests to extend for H1 flag and budget behaviour.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.test.ts` 67-146 (postProcess tests); 148-end (fake tests) - Tests to extend for H2/H3 postProcess behaviour.
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/continuity-check.ts` 12-80 (fakeContinuity, fakeAgeIssue) - Test-only numeric/hand check. Template for H3 production logic; do not import from src in production code.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts` 313-322 - Draft path buildContextPack(text: instructions, extraEntryIds) and renderContextPack. Affected by any change in context.ts selection; decide whether H1 applies here.
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 33; 99-155 (continuityAnswer, parseCards regex 104, section 72-75) - E2E stub parses renderContextPack output. Keep the [E\d+] name ( line format and <wiki> tags, or the stub breaks.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 110-121 (section H) - Backlog spec for H1-H4 with the intended checks.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 144-152 (2.4 continuity), 276 (proposal 7) - Evidence: context had 6 of 10 cards and no 잿빛 종루 card; cloud continuity gave 0 findings.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 110-118 (2.3 continuity) - Evidence: cloud 0 findings (unmeasured recall); qwen false positive from 'no mention' (line 114); luna ko 6/10 and luna en 4/10 cards (line 117).

Open questions:
- Did the live Luna ko DB card 잿빛 종루 have alias 종루? The repo has no eval/results data, so this cannot be checked here. If it did, the 6/10 drop came from budget trimming (context.ts:285-300), not from the mention rule.
- Should H1 also apply to the draft path (src/server/ai-features.ts:313-322)? Changing selection there changes draft prompts and token use.
- Is a planted numeric (age) error present in the fixture? answers.json has 25살 at chapter 10 (quoteIncludes '25살의 도윤서는'), so H3 can be measured by eval:continuity.
- Does the 12,000-char default budget leave room for all named cards on long chapters? The eval logs (run-continuity.ts:227-231) would show this.

## survey:H:evidence

## 트랙 H 조사 결과 (읽기 전용, 저장소 파일 변경 없음)

### 1. 백로그 주장과 근거 대조
- 백로그 H 항목: 맥락 묶음에 장소·물건 카드 누락, "언급 없음"을 모순으로 본 헛지적, 클라우드 4개 실행 지적 0건이라 재현율 미측정 (docs/eval/novel/follow-up-ai-improvement.md:110-121). 세 주장 모두 검토서와 요약에서 확인된다.
- 요약: "luna ko는 위키 항목 10개 중 6개만 들어가 잿빛 종루 카드가 없었다" (docs/eval/novel/2026-10-18/summary.md:117). 요약 action 8도 같은 내용 (summary.md:241).
- 검토서 원문: luna ko는 "맥락에 들어간 위키 항목은 10개 중 6개(한세린, 백지원, 도윤서, 한서연, 청해항, 은색 열쇠)라 잿빛 종루 카드가 없었다" (docs/eval/novel/2026-10-18/luna-6-ko.md:151). luna en은 "The `<wiki>` block in the prompt held only 4 entries" (luna-6-en.md:134).
- "언급 없음" 헛지적: qwen ko 지적 1건이 종루 위치였고 "언급이 없음을 모순의 근거로 삼았다" (qwen3.8-27b-ko.md:275). 요약도 같은 내용 (summary.md:114).
- 숫자 사실 누락: qwen ko는 도윤서 나이를 놓쳤다. 위키 F8 "스물일곱 살" vs 본문 "스물여덟쯤" (qwen3.8-27b-ko.md:198, :278). 같은 절에서 어머니 생존(:280), 철문 통과(:279)도 놓쳤다고 적었다.

### 2. 실행별 현재 값 (연속성 검사)
| 실행 | 지적 | 맞는 지적 | 헛지적 | 놓친 것 | 맥락 카드 수 |
|---|---|---|---|---|---|
| qwen ko | 1 | 0 | 1 (언급 없음 근거) | 위키 사실 3건 (나이, 철문, 어머니) | 기록 없음 |
| qwen en | 2 | 1 | 1 (작가 판단, 경계 사례) | 있음, 수치 기록 없음 | 기록 없음 |
| haiku ko | 0 | - | - | 위키 기준 0, 설정집 말투 1 (haiku-5.5-ko.md:219-220) | 위키 사실 32개 (:219), 카드 수 기록 없음 |
| haiku en | 0 | - | - | 설정집 말투 1 "young miss" (haiku-5.5-en.md:44-48, :89) | 기록 없음 |
| luna ko | 0 | - | - | 설정집 2건 (말투, "언덕길 하나를 내려가면" 방향) (luna-6-ko.md:65-79, :151) | 10개 중 6개 |
| luna en | 0 | - | - | 0건 계산, 계획 순서 이탈 1건 제외 (luna-6-en.md:80-97) | 4개 (luna-6-en.md:134) |

- 클라우드 4개 실행은 지적 0건이라 정밀도와 재현율을 계산할 수 없다 (summary.md:112-113).

### 3. 코드 근거
- 맥락 선택은 이름 언급 기반이다. `findMentions`가 카드 이름과 별칭을 본문에서 찾는다 (src/ai/context.ts:140-146, src/lib/korean/mentions.ts:15-58). 따라서 "원고에 이름이 나오는 카드 모두"는 이미 설계 의도다. 빠지는 원인은 두 가지다.
  - 예산 탈락: 기본 예산 12,000자 (src/ai/context.ts:64). 넘으면 언급 횟수가 낮은 카드부터 제거된다 (context.ts:285-298, mentions.ts:57 정렬).
  - 별칭 누락: 승인된 카드에 별칭이 없으면 "종루" 같은 짧은 표기를 못 잡는다. 번들 설정집에는 "잿빛 종루"의 별칭 "종루"가 있다 (eval/fixtures/novel/ko/bible.json:69-70). 실제 luna ko 카드에 별칭이 있었는지는 확인할 수 없다.
- 카드당 사실은 최대 15개 (context.ts:65, :174).
- 연속성 프롬프트에 "언급 없음" 규칙이 없다. 있는 규칙은 "위키 근거가 없는 지적은 하지 않는다"(src/ai/tasks/continuity-check.ts:52)와 "확신이 없으면 지적하지 않는다"(:59)뿐이다.
- 숫자 대조 코드는 없다. 연속성은 전부 LLM 판단이다 (src/ai/tasks/continuity-check.ts 전체).
- 운영 경로는 eval과 같다. 장별 검사는 `runChapterCheck`를 거치고 (eval/novel/steps/chapter.ts:280-320), 그 안에서 `buildContextPack`을 쓴다 (src/server/chapter-check.ts:144).
- 연속성 프롬프트는 맥락을 중화 뒤에 렌더링한다 (continuity-check.ts:143-145). 그래서 haiku en 검토서가 적은 닫는 괄호 깨짐(haiku-5.5-en.md:104)은 연속성 경로에 해당하지 않는다.

### 4. 하네스 현황과 빈틈
- 설정 오류 심은 평가: `pnpm eval:continuity`(package.json:21). 10화, 심은 오류 10건, 정상 전개 1건(eval/fixtures/continuity/answers.json). 정밀도와 재현율을 출력한다 (eval/run-continuity.ts printSummary). API 키가 필요하다 (run-continuity.ts:36).
- 현재 값: 측정되지 않았다. `eval/results/`가 저장소에 없어서 기준선 파일이 없다. 실행하지 않았다.
- 채점 로직 (eval/score.ts):
  - `isHit`이 양방향 부분 문자열로 판정한다 (score.ts:26-32). 짧은 인용도 긴 정답 문장에 포함되면 적중이 된다. 테스트가 이를 기대값으로 고정했다 (eval/score.test.ts:23-28, "오른손으로 열쇠를").
  - 종류(kind)는 비교하지 않는다 (score.ts:24 주석).
- 노벨 하네스 지표 (eval/novel/metrics.ts):
  - 연속성이나 재현율 지표가 없다. T2는 검토자가 손으로 센다.
  - T3만 자동이다 (metrics.ts:49-50). 맥락 통계는 기록하지 않는다 (metrics/NN.json, chapter.ts:257-259).
  - `run-continuity.ts`는 맥락 카드 수와 approxChars를 기록하는데 (run-continuity.ts:104, :223) 노벨 하네스는 기록하지 않는다.
- 픽스처 빈틈:
  - 심은 오류 10건은 이름, 손, 층수, 떡밥, 시간선, 나이, 상인 설정 등이다 (answers.json).
  - 말투 오류, 공간 방향 오류, "언급 없음" 함정(notDefects 항목), 별칭만 쓰인 경우의 맥락 포함 검사가 없다.
  - notDefects는 JSON에만 쓰이고 요약에서 따로 세지 않는다 (run-continuity.ts 출력부).

### 5. 제안 수용 기준 (목표값은 제안이며 근거를 함께 적었다)
A. 맥락 포함률 (새 지표): 원고 속 이름이 맞는 카드 중 맥락에 든 비율. 현재 luna ko 6/10, luna en 4개 (검토서 기준), 나머지 기록 없음. 목표 100%. 측정: 노벨 하네스에 pack 통계 추가가 필요하다 (현재 없음). 임시로 calls/027의 `<wiki>` 블록을 세도 된다.
B. 예산 탈락 0 (새 지표): 언급되었으나 12,000자 예산에서 탈락한 카드 수. 현재 기록 없음. 목표 0. `context.ts:285-298`에서 세면 된다.
C. "언급 없음" 헛지적 0: 현재 qwen ko 1/1 (qwen3.8-27b-ko.md:275). 목표 실제 원고 실행에서 0건. 측정: answers.json에 부재 함정 항목을 추가하고 eval:continuity의 오탐으로 잡는다. 현재 픽스처에는 함정이 없다.
D. 숫자 사실 검출: 현재 qwen ko 도윤서 나이 누락 (qwen3.8-27b-ko.md:278). 목표 "N살" 형태 명시 숫자는 코드로 100% 검출. "스물여덟쯤" 같은 표현은 코드로 잡지 못하므로 목표에서 뺀다. 측정: 단위 테스트에 숫자 대조 픽스처를 추가하고, eval 픽스처 10화 "25살의 도윤서는"(answers.json)으로 재현율을 본다.
E. 심은 오류 재현율 (eval:continuity): 현재 측정 안 됨. 목표 제안: 재현율 ≥ 0.8(10건 중 8건), 정밀도 ≥ 0.5, 같은 설정으로 2회 돌려 편차 확인. 측정: `pnpm eval:continuity` 출력. API 키 필요.
F. 실제 원고 정밀도: 현재 qwen ko 0/1, qwen en 1/2(작가 판단), 클라우드 0/0(정의 안 됨). 목표 지적 5건 이상이 모였을 때 0.8 이상. 측정: 작가 결정 기록(accepted/dismissed)으로 계산 가능. 다만 라벨이 작가 에이전트 판단이라 정답이 아니다.
G. 클라우드 재현율 공백: 실제 원고는 정답이 없어서 재현율을 못 잰다. 제안: 노벨 실행에 하네스 전용 심은 오류 장을 두고 정답표를 기록한다. 현재 없음.
H. 시간 가드: 연속성 검사 제품 제한 120초 초과 여부. 현재 qwen ko 1,290.9초(qwen3.8-27b-ko.md:271-283 근처), qwen en 2,136초, haiku ko 25.8초, luna ko 6.8초. 목표 로컬 제한 초과 0. 측정: 기존 `wouldTimeOut` 기록.

### 6. 지표 결함과 라벨 규칙 (측정 전에 고칠 것)
- score.ts의 양방향 부분 문자열 적중은 짧은 인용에 점수를 준다. 최소 길이 조건을 두고 score.test.ts:23-28을 갱신해야 한다.
- notDefects를 따로 보고하지 않는다.
- 라벨 규칙 충돌: qwen ko 종루 위치는 본문 "항구 끝, 등대 옆"과 위키 "언덕 위"의 충돌로 봤다 (qwen3.8-27b-ko.md:205). 작가와 검토자는 헛지적으로 처리했다. 두 설명이 함께 참일 수도 있다. "언급 없음은 모순이 아니다"와 "긍정적 충돌은 모순이다"를 라벨 가이드에 명시해야 한다.

### 7. 확인하지 못한 것
- luna ko 카드 10개의 분모가 승인된 전체 카드인지, 언급된 카드인지 검토서만으로는 알 수 없다.
- luna ko의 "잿빛 종루" 카드에 별칭 "종루"가 있었는지, 예산 탈락인지 확인하지 못했다. 실행 기록(calls/027)이 저장소에 없다.
- 실제 원고 정답표는 없다.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` 110-121 - backlog item H
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 110-117, 241 - cross-run summary: continuity section, context-pack finding, action 8
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 65-79, 144-152 - luna ko: 6/10 cards, 2 missed contradictions, contradiction list
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-en.md` 107, 132-135, 218, 227 - luna en: 4 entries in wiki block, recall not measurable, candidate 8
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 189-205, 271-283 - qwen ko: only flag was an absence-based false flag, 3 misses incl. age
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-en.md` 129-133 - qwen en: 2 flags, 1 valid
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-ko.md` 216-221 - haiku ko: 0 flags, voice gap, 32 facts
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/haiku-5.5-en.md` 44-48, 80, 89 - haiku en: 0 flags, bible characterization gap
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 50-61, 137-151 - system prompt rules (no absence rule), no numeric check, prompt build order
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 64-66, 114-146, 285-298 - mention-based selection, 12,000 char budget, drop order, per-entry fact cap
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/mentions.ts` 9-58 - name and alias matcher, count-sorted output
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 144 - production path builds the pack from chapter text
- `/home/xogud/documents/github/DaeumHwa/eval/run-continuity.ts` 36, 101-107, 223-227, printSummary - planted-error eval runner: precision and recall, pack stats, notDefects not counted
- `/home/xogud/documents/github/DaeumHwa/eval/score.ts` 21-32 - scoring: bidirectional substring hit, kind ignored
- `/home/xogud/documents/github/DaeumHwa/eval/score.test.ts` 23-28 - test codifies short-fragment hit
- `/home/xogud/documents/github/DaeumHwa/eval/novel/metrics.ts` 3-15, 41-89 - no continuity or recall metric; only T3 lengthOk is automatic
- `/home/xogud/documents/github/DaeumHwa/eval/novel/steps/chapter.ts` 257-259, 280-320 - continuity step and per-chapter metrics write
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/answers.json` 1-end - 10 planted errors, 1 notDefect (valid-range age); no absence trap, no voice or spatial error
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/work.json` entries, facts - fixture cards, aliases (잿빛 종루 alias 종루), age facts with validity ranges
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/novel/ko/bible.json` 69-70, 118 - bible alias for 잿빛 종루 and age fact for 도윤서

Open questions:
- luna ko의 '잿빛 종루' 카드에 별칭 '종루'가 있었는지, 아니면 12,000자 예산에서 탈락했는지 확인해야 한다. 실행 기록(calls/027의 <wiki> 블록)이 저장소에 없어 확인하지 못했다.
- luna ko의 '10개 중 6개'에서 분모가 승인된 전체 카드인지 원고에 언급된 카드인지 검토서만으로는 알 수 없다.
- eval:continuity의 기준선(재현율, 정밀도)이 저장소에 없다. API 키가 있는 환경에서 한 번 돌려 기준선을 남겨야 목표값을 정할 수 있다.
- 종루 위치 건(본문 '항구 끝, 등대 옆' vs 위키 '언덕 위')을 모순으로 볼지 여부를 작가 기준으로 정해야 한다. 이 기준이 정밀도 지표를 바꾼다.
- 실제 원고 정답표가 없어서 클라우드 실행의 재현율은 노벨 하네스에 심은 오류 장을 넣기 전에는 측정할 수 없다.

## survey:H:risks

TRACK H risk and neighbour survey (read-only; nothing in the repo was changed).

FACTS VERIFIED IN CODE
- Pack budget: DEFAULT_BUDGET_CHARS = 12_000 (src/ai/context.ts:64). Trimming loop (context.ts:285-300) pops relations, then threads, then previous summaries, then entries. Entries are ordered by mention count desc, then first index (src/lib/korean/mentions.ts:57), so the least-mentioned cards are dropped first. A card with one mention (for example a place or object) is the first to go. The "6 of 10" loss is probably this trim, but the code has a second cause too: a card is selected only if its exact name or alias appears in the text (findMentions, mentions.ts), so "잿빛 종루" is not matched by "종루". Which of the two caused the Luna loss is not verified; the eval could tell.
- Only mention-matched entries are selected (context.ts ~139-160), plus extraEntryIds. Facts are capped at MAX_FACTS_PER_ENTRY=15 (context.ts:65), threads at 15 (:66), previous summaries at 2 (:67).
- Continuity task: src/ai/tasks/continuity-check.ts. effort 'high' (:139), maxTokens 16000 (:140), CONTINUITY_SYSTEM at :50 (Korean; TAG_DATA_RULE at :60), buildPrompt calls neutralizeDeep(raw) (:143) over the whole input, including the pack. postProcess uses the un-neutralized input for ref resolution.
- Non-stream call timeout DEFAULT_AI_TIMEOUT_MS = 120_000 (src/ai/run.ts:28). Streamed drafts use STREAM_AI_TIMEOUT_MS = 280_000 (run.ts:30). A per-task timeoutMs override exists (src/ai/types.ts:23).
- Pack consumers: continuity via src/server/chapter-check.ts:144 (buildContextPack with the chapter text), and the draft via src/server/ai-features.ts:313-322 (buildContextPack, then renderContextPack for buildDraftPrompt). Any change to pack selection or budget changes drafts too.
- chapter-check.ts:163 runs continuity and chapter-extract in Promise.allSettled. :205-206 rethrow the first failure, so one failed call fails the whole check. Input and output limits are not shared.
- Issue kinds are a TS-level list (src/db/types.ts:106). The DB column is plain text (src/db/schema.ts:388), so adding a kind needs no migration, but it touches the Zod schema, labels and the eval score.
- Eval: eval/run-continuity.ts (scores with eval/score.ts isHit/scoreIssues). The answer key eval/fixtures/continuity/answers.json has 11 expected issues (kinds: 4 naming, 5 contradiction... see counts: naming 2, contradiction 6, thread 1, timeline 1, naming 1 — 11 total) and 1 notDefect. Recall is therefore already measurable with this fixture. The summary's claim that recall is unmeasured is about the cloud runs (0 findings), not the harness.
- ctx test at src/ai/context.test.ts:100 asserts that lowest-ranked entries are dropped first under budget.
- The "언급 없음" rule has no existing home. Prompt text is in CONTINUITY_SYSTEM (:50-62). No test asserts its exact text, but continuity-check.test.ts asserts prompt structure (<wiki>, <manuscript>, TAG_DATA_RULE; lines ~171-234).
- src/ai/guards does not exist (the GUARDS track creates it). Existing neutralization lives in src/ai/prompt-utils.ts (TAG_DATA_RULE :5, neutralizeTags, neutralizeDeep :17).
- Plan doc: docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:568 and :595 define continuityCheckTask and the chapter-check contract (naming issues are deterministic, AI issues are located by quote).

CONTEXT FOR "OTHER TRACKS" (overlap by file)
- GUARDS (src/ai/guards, new): H's numeric-fact check should live there. Shared with E1/E2/C, which also need pure deterministic checks. Risk: duplicate locateQuote/sentence utilities (src/lib/korean/sentences).
- A (length): touches the draft path and possibly the pack (ai-features.ts:313). Overlap with H on budget if A uses the pack size. Medium.
- E1/E2 (paragraph and repeated-word checks): draft/proofread side. Low overlap with H, except shared guard location.
- B (speech style): adds a voice field. renderContextPack renders entry.fields generically (context.ts ~ renderContextPack), so B's voice field flows into the continuity pack automatically. Overlap with H: a "언급 없음" rule versus speech checks (ISSUE_KINDS has 'character'). High for the prompt text.
- I (interview): interview tasks use TAG_DATA_RULE and known entries, not context.ts. Low.
- G1/G2 (extraction): src/ai/extraction.ts, src/ai/extraction-rules.ts, src/server/known-entries.ts (loadKnownEntries, used by chapter-check.ts). G2 may change relations or threads that the pack renders (relations filtering at context.ts). Medium.
- J (proofread scope): src/ai/tasks/proofread.ts; quote merging shares locateQuote. Low.
- HX1-HX4 (harness): eval/novel/* (reviewer blinding, English substitution, author sees wiki, small fixes). The author-sees-wiki change may read the same pack. Low to medium for HX3.
- C (foreign-script block): draft or proofread output. Low.
- D (scene consistency two-step draft): highest coupling with H. D's per-scene bit list is built from the same pack (packText), and H's continuity issues are proposed as the input to a targeted rewrite. Interface needed (see below).
- F1 (proofread split): src/ai/tasks/proofread.ts. Low.
- F2 (chapter-extract split): chapter-check.ts:163 parallel call. Medium-high overlap with H through chapter-check.ts.
- F3 (reader sim in parallel): src/ai/tasks/reader-sim.ts. Low.
- F4 (local serialization and effort switch): effort is set on the task (continuity-check.ts:139) and the serialization is at chapter-check.ts:163. High: F4 may lower effort for continuity, which conflicts with H's recall goal.

INVARIANTS THAT APPLY TO H
- AI never writes wiki tables. H only produces issues (issues table) and suggestions. A numeric check must propose, not write. Any "apply" path must go through author action or a proposal.
- Every wiki change records change_log in the same transaction, and wiki rows are archived, never deleted. H does not touch wiki rows unless it adds an auto-fix. Do not add one.
- Services throw AppError(code, Korean message); actions return ActionResult. chapter-check.ts:116 throws NOT_FOUND for missing chapters. Keep the non-member NOT_FOUND behaviour via loadEditableChapter.
- All user-facing copy is Korean. The new "언급 없음" rule and any numeric mismatch explanation must be Korean. Identifiers and comments stay English.
- neutralizeDeep and TAG_DATA_RULE must keep applying to every new pack string and any new numeric-fact field passed into a prompt. A wiki fact text is user content and can contain closing tags.

REGRESSION RISKS
- Token and time: raising the 12,000-char budget (context.ts:64) raises input tokens for continuity. Qwen runs already exceed 120 s (summary section 2.7: continuity qwen en 2,136 s total, 17.8x the limit). A larger pack makes timeouts more likely on local models, and effort 'high' (continuity-check.ts:139) plus maxTokens 16000 (:140) adds output. Set a continuity-only budget rather than changing the shared default, because drafts (ai-features.ts:313) use the same function.
- Draft drift: any change to buildContextPack selection or ordering changes draft output and the draft's cost. Keep the draft path unchanged unless the author decides otherwise.
- Prompt injection: new fields passed to the model must go through neutralizeDeep. The post-process ref lookup uses un-neutralized input (continuity-check.ts postProcess); keep ref values free of tag text.
- Streaming: continuity is a non-stream runAiTask. Drafts stream with 280 s. If D's rewrite uses streaming, keep the timeout separate.
- Failure coupling: chapter-check rethrows the first failure (chapter-check.ts:205-206), so a numeric check that throws would break the whole check. Keep the numeric check pure and non-throwing.
- Recall versus false positives: adding "언급 없음 is not a contradiction" lowers false positives but may lower recall on omission-type planted errors. Measure both with eval/run-continuity.ts before and after.

PROPOSED MINIMAL PUBLIC INTERFACE (TypeScript, signatures only)

// src/ai/context.ts
export type BuildContextPackInput = {
  text: string
  position: number
  extraEntryIds?: string[]
  budgetChars?: number
  /** Continuity only: never trim entries whose name occurs in text. Default false keeps drafts unchanged. */
  keepMentioned?: boolean
}
export function buildContextPack(db: Db, workId: string, input: BuildContextPackInput): Promise<ContextPack>

// src/ai/tasks/continuity-check.ts (existing types unchanged)
// Added to CONTINUITY_SYSTEM as one Korean rule line:
//   '- <wiki>에 없는 설정이나 원고에 언급되지 않은 설정은 모순이 아니다. "언급 없음"은 지적하지 않는다.'

// src/ai/guards/numeric-facts.ts (new, pure, no DB, no AI)
export type NumericFactHit = {
  factRef: string          // F ref from the pack, status 'confirmed' only
  entryRef: string
  label: string            // e.g. '나이'
  wikiValue: number
  quote: string            // exact manuscript sentence
  start: number
  end: number
}
export function findNumericFactMismatches(input: { chapterText: string; pack: ContextPack }): NumericFactHit[]
// Converts to ResolvedContinuityIssue with kind 'contradiction'. Severity and kind need the author decision.

// eval (existing tool, extended, no new runner)
// eval/fixtures/continuity/answers.json already carries expected[] and notDefects[].
// Add a planted-error set (for example eval/fixtures/continuity-planted/) and report recall = hits / expected.length, precision from notDefects.

OPEN QUESTIONS FOR THE AUTHOR
1. Budget: raise the continuity-only budget (value?) or keep 12,000 and drop low-mention cards? Draft and continuity share buildContextPack, so this needs a decision.
2. Name matching: should "잿빛 종루" match "종루" (suffix or word-level match) or should the author write aliases? This changes mention selection for every task.
3. Numeric check: deterministic code as in the interface above, or prompt only? Code is stronger on numbers, but it needs a fact label format (for example "나이 N세" parsing) that does not exist yet.
4. Severity for a code-found numeric mismatch: high, or medium because the wiki may be stale?
5. Should a new issue kind be added (for example 'numeric'), or should numeric mismatches stay 'contradiction'? The schema change is small but touches labels and eval scoring.
6. Pass bar for recall on planted errors (for example at least 8 of 11) and an acceptable false-positive rate. The cloud runs reported zero findings, so there is no baseline.
7. Local models: accept the 120 s timeout for continuity on qwen, or raise continuity timeoutMs per task (types.ts:23), or accept the effort downgrade that F4 wants? H's recall goal conflicts with F4's effort switch.
8. Whether D's targeted-rewrite step should consume H's issues directly, and what the interface is between them.
9. Whether the planted-error manuscripts replace the 10-chapter fixture or sit beside it (the existing fixture has 11 expected issues, so the planted set is additive).

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md`  - Backlog: section 2 H defines the H track problem, expected fix and metrics.
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md`  - Evidence: section 2.3 (continuity, 0 findings in cloud runs, context loss in Luna) and 2.7 (timing).
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts`  - Context pack builder and renderer; DEFAULT_BUDGET_CHARS at :64; trimming loop at :285-300; shared by continuity, drafts and author-sees-wiki.
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/mentions.ts`  - findMentions; ordering at :57 decides which cards the budget trim drops first.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts`  - Continuity task: CONTINUITY_SYSTEM at :50, TAG_DATA_RULE at :60, effort at :139, maxTokens at :140, neutralizeDeep at :143, postProcess ref resolution.
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts`  - Runs continuity and chapter-extract in parallel (:163), rethrows first failure (:205-206), builds the pack at :144.
- `/home/xogud/documents/github/DaeumHwa/src/server/ai-features.ts`  - Draft path that also calls buildContextPack and renderContextPack at :313-322; shared-pack risk.
- `/home/xogud/documents/github/DaeumHwa/src/ai/prompt-utils.ts`  - TAG_DATA_RULE (:5) and neutralizeDeep (:17); must apply to every new pack or prompt field.
- `/home/xogud/documents/github/DaeumHwa/src/ai/run.ts`  - Timeouts: DEFAULT_AI_TIMEOUT_MS 120_000 at :28, STREAM_AI_TIMEOUT_MS 280_000 at :30, per-call timeout override.
- `/home/xogud/documents/github/DaeumHwa/src/ai/types.ts`  - AiTaskDef fields: maxTokens, optional timeoutMs at :23.
- `/home/xogud/documents/github/DaeumHwa/src/db/types.ts`  - ISSUE_KINDS at :106; adding a kind is a TS-level change.
- `/home/xogud/documents/github/DaeumHwa/src/db/schema.ts`  - issues.kind is a text column at :388 (no migration needed for a new kind).
- `/home/xogud/documents/github/DaeumHwa/eval/run-continuity.ts`  - Existing eval runner for recall and precision (uses eval/score.ts and eval/fixtures/continuity).
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/answers.json`  - Answer key: 11 expected issues and 1 notDefect; checkAnswers() validates quotes against the manuscript.
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.test.ts`  - Test at :100 asserts lowest-ranked entries are dropped first under budget; will change if the budget policy changes.
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.test.ts`  - Prompt-structure assertions (<wiki>, <manuscript>, TAG_DATA_RULE) that a new rule must keep passing.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md`  - Plan contract for continuityCheckTask (:568) and chapter-check (:595); eval plan at :892-900.
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md`  - Spec F7 (:229-231): continuity inputs are the pack, the open threads, the previous summaries and the naming rules; sets the claim that the AI only reports issues.

Open questions:
- Budget: raise a continuity-only pack budget (value?) or keep 12,000 chars and accept dropping low-mention cards? Drafts share buildContextPack (src/server/ai-features.ts:313).
- Name matching: should a card name such as "잿빛 종루" match the shorter text form "종루", or should the author add aliases? This changes mention selection for every task.
- Numeric check: deterministic code (pure function, see interface) or prompt only? Code needs a fact label format such as "나이 N세" that does not exist yet.
- Severity for a code-found numeric mismatch: high, or medium because the wiki may be stale?
- Add a new issue kind (for example 'numeric') or keep numeric mismatches as 'contradiction'? The schema change is small but touches labels and eval scoring.
- Pass bar for recall on planted errors (for example at least 8 of 11) and an acceptable false-positive rate; there is no cloud baseline because the cloud runs reported zero findings.
- Local models: accept the 120 s timeout on continuity for qwen, raise the per-task timeoutMs (src/ai/types.ts:23), or accept the effort downgrade F4 wants? H's recall goal conflicts with F4's effort switch (continuity-check.ts:139).
- Should D's targeted rewrite consume H's issues directly, and what is the interface between them?
- Should planted-error manuscripts replace the 10-chapter fixture or sit beside it? The existing answer key already has 11 expected issues, so the planted set would be additive.

## survey:H:specs

Track H (continuity check context and rules): prior-spec constraints. Read-only survey; nothing in the repo was changed.

REQUIREMENT IDS AND SECTIONS THAT CONSTRAIN THE CHANGE

1. F9 "필요한 카드만 불러오기" (docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:242-249). The context pack is defined as: (1) mention-based selection via findMentions, (2) mentioned cards in mention-count order, each with at most 15 facts (current-position valid only, confirmed first), plus relations valid at the position, (3) open threads (max 15), the previous 2 summaries and the naming rules, (4) "전체 약 12,000자 예산 안으로 순위 낮은 것부터 잘라 낸다" (line 248). Constraint: "every card whose name occurs in the manuscript" is not what F9 says. Trimming to a 12,000-char budget is part of the spec, so including every mentioned card needs an explicit budget decision.
2. F9 line 247: renderContextPack "항상 같은 순서로 문자열을 만든다(프롬프트 캐시를 위해)". Any new section, label or ordering must stay deterministic. The plan's T08 test (docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:411) requires byte-identical render across two calls.
3. Mention matching, docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md:364 (§9 findMentions): names and aliases must be 2+ characters. A 1-character name or alias cannot be matched, so "every card whose name occurs" is not fully achievable with the current rule. The 2-character minimum is a spec rule.
4. F7 "근거 붙은 오기 점검" (mvp-design.md:229-237). Input is the F9 context pack. Post-validation: a quote must be a real substring (line 232), an unknown factId becomes null, and an issue with neither a fact nor an entry is dropped ("근거 없는 지적 금지", line 232). Line 236 requires judging only facts valid at chapter position N, and says a state change is not an error. The requested rule "언급 없음은 모순이 아니다" fits this existing evidence rule, so it is consistent with the spec, but it is not written as an explicit line in any spec.
5. §7.3 task table (mvp-design.md:344): continuity-check effort high, output issues[]. Section 7.3 also requires the Korean-output rule and "원고에 없는 내용은 지어내지 말 것" (mvp-design.md:353-355).
6. Exact continuity system prompt in the MVP plan (docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:568-577, labelled "System prompt (exact)"): rules include "위키 근거가 없는 지적은 하지 않는다", "확신이 없으면 지적하지 않는다", and the N화 validity rule. Editing this prompt is a change to a pinned text. The plan also pins effort high and maxTokens 16000 (line 568).
7. Continuity postProcess and fake (plan lines 568, 600): the fake emits a contradiction for 왼손/오른손 and for N살 mismatches. The chapter-check.test.ts expectations (line 600) depend on the fake, so adding rules to the prompt does not change the fake unless the fake is changed.

EVAL CONSTRAINTS (recall measurement)

8. Spec §12 (mvp-design.md:387): pnpm eval:continuity runs the real API on the 10-chapter fixture and prints hit rate and false-positive rate. Without ANTHROPIC_API_KEY or OPENCODE_API_KEY it prints a message and ends. Model quality tuning is deferred until keys and budget exist (§13 item 13, mvp-design.md ~line 400).
9. Plan T27 (docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md:889-900): scoreIssues(expected, found) gives hits, misses, falsePositives, precision and recall. Matching is by chapter plus overlapping quote, and each found issue matches at most one expected. Output goes to eval/results/continuity-<timestamp>.json. --fake only checks the flow, not quality.
10. The fixture matches the spec. eval/fixtures/continuity/answers.json holds 11 expected defects (lines 3-28) and one notDefects entry for the age change at chapter 7 (lines 31-37, "세린은 17살이 된 뒤로", explained by the validity range). So the "12 planted, 11 true, 1 must-not-flag" design in T27 holds. The grep count of 12 quoteIncludes includes the notDefects entry.
11. The lightweight novel eval design (docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:181, 294) grades continuity by Sonnet judgment: a flag is "맞는" only when it truly conflicts with the wiki or settings, and the metric is valid-flag vs false-flag ratio plus misses. Section 6.4 (around line 200) says no deterministic auto-judge is built. So the eval:continuity scoreIssues recall and the novel-harness continuity score are two different measurements.
12. Localization, lightweight design §6.5 (lines 187-200, 266): the English-language eval (eval/novel/localize/) translates Korean text from renderContextPack labels and every prompt-assembled Korean phrase, and a test fails if Hangul remains. The plan (2026-10-18-lightweight-model-novel-eval.md:189, 264-266) maps "(없음)" and the entry-kind labels. Any new Korean label or rule added to renderContextPack or the continuity prompt must be added to the localize table, or the English run leaks Korean.
13. Interview reliability plan (docs/superpowers/plans/2026-10-18-interview-ai-reliability.md:103-105): responders parse section tags and the fact/entry ref format from renderContextPack (read src/ai/context.ts). Changing the ref format or tags also breaks these fakes.
14. Lightweight design §6.7 and line 78: local models run one at a time. The recall runs must respect this.

DECISIONS ALREADY MADE, NOT TO RE-LITIGATE
- AI never writes wiki tables; it only proposes (mvp-design.md:1.3 item 1, line 19; §1.4 anti-goals). Continuity output is advisory and a fix is applied only by the author.
- Every fact has a source, and [가정]/[미정] items are marked (mvp-design.md:1.3 items 2-3).
- Quotes must be verbatim substrings of the manuscript; ungrounded flags are dropped (F7, line 232).
- Default model claude-haiku-5-5 (mvp-design.md §13 item 5, §7.1).
- Daily token limit 3,000,000 (§13 item 9).
- Context budget 12,000 chars and per-entry 15-fact cap (F9, line 245, 248).
- Textarea editor, not rich text (§13 item 3).
- Eval tooling is not app runtime (interview design, line 60). Eval runs call the real service functions (lightweight design §2, line 30).
- Lightweight design §6.4: no deterministic auto-judge for the novel harness (line ~200).

CONFLICTS THE CHANGE WOULD CREATE (need an explicit decision, not silent override)
A. "Every mentioned card" versus the 12,000-char budget with lowest-rank trimming (F9, line 248). The change must either raise or exempt the budget, or prove the 4 missing items fall outside the budget.
B. The 2-character minimum for names and aliases (line 364) prevents matching 1-character names.
C. Changing the exact continuity system prompt (plan line 568) and the renderContextPack output (plan line 411, eval localize, interview responders) are changes to pinned text that tests and eval code depend on.
D. The fixture's expected-error count is fixed at 11 (answers.json). Adding a planted-error manuscript changes the eval baseline and must be recorded as a new baseline, not compared to the old one.

OPEN QUESTIONS
- Does "모든 카드" mean every card whose name appears, or every card with a fact valid at N? F9 implies the former, but the budget trims it.
- Is the recall measurement the deterministic eval:continuity (requires an API key, not present in this survey) or the lightweight harness Sonnet judge? The specs describe both and they measure different things.
- Are the 4 cloud runs with 0 findings supposed to be re-checked under the same eval:continuity fixture? The specs do not say.

Files:
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 1-40, 229-249, 315-404 - F7 continuity-check contract (lines 229-237), F9 context pack and budget (242-249), AI task table (337-351), findMentions 2-char rule (364), eval plan (387), decisions list (390-404)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-16-daeumhwa-mvp.md` 396-411, 547-600, 889-900 - T08 context.ts contract, budget 12000, deterministic render (396-411); T13 exact continuity system prompt, effort high, postProcess and fake (547-600); T27 eval harness scoreIssues and fixture (889-900)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` 78, 181, 187-200, 294 - Continuity judgment rule (181), metrics (294), localization rule (187-200), local model serialization (78), no deterministic judge (around 200)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md` 189, 264-266, 484-485 - Continuity step and localize mapping of renderContextPack labels (189, 264-266, 484-485)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/plans/2026-10-18-interview-ai-reliability.md` 103-105 - Responders parse renderContextPack section tags and ref format (103-105)
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-18-interview-ai-reliability-design.md` 60 - eval:continuity --fake is test-only, not app runtime (60)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/answers.json` 1-40 - 11 expected defects plus 1 notDefects entry (chapter 7 age change, lines 31-37), matches T27
- `/home/xogud/documents/github/DaeumHwa/package.json` 21 - eval:continuity script (line 21): tsx eval/run-continuity.ts

Open questions:
- Does 'every card whose name occurs in the manuscript' mean every mentioned card, or every card with a fact valid at N? F9 mentions the budget trim, which conflicts with the first reading.
- Should the 2-character minimum for names and aliases (mvp-design.md:364) be kept for single-character names, or is a spec change needed to match 1-character names?
- Which measurement counts as 'recall': the deterministic eval:continuity scoreIssues (needs an API key) or the lightweight-harness Sonnet judgment? The specs define both separately.
- Is the exact continuity system prompt (mvp plan line 568) still binding, or may it be revised? The plan labels it exact.
- Do the 4 cloud runs that reported 0 findings need a re-run against the same eval:continuity fixture to measure recall?

## survey:H:tests

TRACK H test map (read-only survey, nothing edited). All citations are path:line from files read in this session.

== 1. Code the change touches, and the current behavior ==
- Context pack: src/ai/context.ts. buildContextPack (l.114-305) picks entries ONLY by findMentions on input.text (l.140-149), plus extraEntryIds. Facts per entry capped at 15 (l.65), threads at 15 (l.66), previous summaries at 2 (l.67), budget DEFAULT_BUDGET_CHARS=12000 (l.64). Over budget, it pops relations, then threads, then summaries, then ENTRIES from the end (l.285-300). Entries arrive ordered by mention count desc (mentions.ts l.57), so the least-mentioned named card is the first entry dropped. This is the likely mechanism for the missing 종루 card (Luna ko review: luna-6-ko.md l.75, l.151; summary.md l.117), but I did NOT verify it against the run's calls/027 prompt; the run artifacts are not in the repo.
- renderContextPack (l.308-354): entry header `[E1] name (kind label)` at l.314, fact line `[F1][status] content (…)` at renderFact l.412-419, section tags <entries>/<threads>/<relations>/<previous_chapters>/<naming>.
- Mention matcher: src/lib/korean/mentions.ts findMentions (l.15-58). Names shorter than 2 chars skipped (l.20); Hangul/Latin/digit directly before the match rejects it (l.40); a particle run is required (l.41-42, isParticleRun l.60-63). No kind filter, so place and item cards match too.
- Continuity task: src/ai/tasks/continuity-check.ts. CONTINUITY_SYSTEM l.50-61 (rules at l.51-59; TAG_DATA_RULE l.60). It has NO "언급 없음은 모순이 아니다" rule (verified by reading all rules). buildPrompt l.142-152 (wiki = renderContextPack(pack), manuscript tagged). postProcess l.153 (locateIssues l.77-117 drops issues whose quote is not found or whose refs are both invalid; usableSuggestion l.67 clears thread/timeline suggestions). resolveContinuityIssues l.119.
- Chapter check service: src/server/chapter-check.ts runChapterCheck l.126-; buildContextPack call l.144 (no extraEntryIds, default budget); continuity call l.163-173 via Promise.allSettled with the extraction call.
- Draft path also uses buildContextPack: src/server/ai-features.ts l.313-316 (extraEntryIds = input.entryIds). Any budget or selection change therefore also changes draft prompts.
- Eval runner: eval/run-continuity.ts. Builds the fixture into PGlite (l.139-206), calls buildContextPack with the chapter body (l.223-226), scores with score.ts. Flags: `pnpm eval:continuity` (real API, prints skip message without a key) and `pnpm eval:continuity --fake` (FakeAiClient). Results go to eval/results/continuity-<stamp>.json (l.345-348). package.json l.21 has the script.
- Existing planted-error fixture: eval/fixtures/continuity/{work.json, answers.json, chapters/01..10.md}. answers.json already has 11 expected errors in ch 3-10 (kinds: naming, contradiction, thread, timeline) and 1 notDefect (ch7 "세린은 17살이 된 뒤로"). So the planted-error recall set ALREADY EXISTS. Recall can be measured with `pnpm eval:continuity` without a new fixture. I found no docs result for this fixture in the docs/ tree (searched summary and reviews only).
- Numeric facts: no code compares numbers. The only age check is test-only, src/test/ai-fakes/continuity-check.ts fakeAgeIssue (l.63-80), which regex-matches `(\d+)\s*살` against facts. fakeHandIssue l.42-61 handles 왼손/오른손 only. fakeContinuity l.13-40 applies severity low for non-confirmed facts.
- Fixture facts: work.json has 한세린 facts "16살" (validTo 6) and "17살" (validFrom 7) (work.json l.119-134); 종루 card is kind place with alias 종루 (work.json l.74-80).
- Evidence for the "no mention" false positive: qwen ko review (qwen3.8-27b-ko.md l.275, l.282); summary.md l.114.
- Evidence for the context gap: luna-6-ko.md l.75-76, l.151-152; summary.md l.117 (luna en: 4 of 10 cards, missing 은색 열쇠 and 종루).

== 2. Existing test files covering touched code ==
- src/ai/context.test.ts: describe buildContextPack (l.34-212): mention selects card E1 (l.35); archived excluded (l.47); extraEntryIds after mentions (l.55); fact validity 11 vs 12 (l.69); fact rank confirmed/assumed/undecided (l.87); lowest-ranked entries dropped over budget (l.100, budget 500, expects only 이서윤); threads planted-after excluded (l.114); relations only between selected and valid (l.139); previous summaries (l.163); previous title no duplicate episode number (l.175); naming rules (l.185); F refs (l.193). describe renderContextPack (l.214): byte-identical (l.215); status labels and validity text and section tags (l.229).
- src/lib/korean/mentions.test.ts: counts particles/vocative (l.14), ignores 1-char names (l.24), rejects name inside longer word (l.28), sorts by count then index (l.33), copula/quotative endings (l.43-74).
- src/ai/tasks/continuity-check.test.ts (16 tests): postProcess drops unlocatable quote (l.68), nulls unknown factRef and drops without entryRef (l.76), keeps valid ref and resolves offsets (l.92), clears suggestion for thread/timeline (l.112), keeps contradiction suggestion (l.125), clears suggestion equal to quote (l.130), dedupes same range (l.139); fakeContinuity hand contradiction (l.149), no issues when nothing contradicts (l.161), Korean system prompt startsWith and wiki/manuscript layout (l.166); prompt isolation for </manuscript> and </wiki> (l.182, l.191); suggestion rule line must start with '- suggestion에는' and contain 'quote', '빈 문자열', 'explanation' (l.223); TAG_DATA_RULE in system (l.233).
- src/server/chapter-check.test.ts: runChapterCheck: sibling abort and both runs error (l.81); hand contradiction with fact id and offsets (l.118, FakeAiClient); naming variant issue (l.148); correct name containing variant (l.169); rerun replaces open issues, keeps dismissed (l.203); pending post_chapter proposals replaced (l.235); expired fact not flagged (l.265); AI issue with no ref dropped via scriptedClient (l.287, keyed on system startsWith '당신은 장기 연재 웹소설의 설정 오류'); FORBIDDEN/NOT_FOUND (l.318); planted thread once (l.416); relation not reproposed (l.458). runProofread tests l.338-398, 497-531.
- e2e/ai-stub/responders.test.ts: continuity scenario l.170-184 (CONTINUITY_PACK l.17, parses the output of responders.ts continuityAnswer l.131 with parseCards l.99-121 which regex-matches `^\[(E\d+)\] (.+?) \(` and `^- \[(F\d+)\]\[([^\]]+)\] (.+)$`).
- src/test/fake-ai.test.ts: generic FakeAiClient (registry output, schema validation, override).
- eval/fixture.test.ts: 10 chapters of 900-1300 chars (l.18); counts >=6 entries, 20 facts, 3 planted threads, 2 naming rules (l.26); keys and positions (l.44); exactly 11 expected errors in ch 3-10, quotes verbatim (l.52); 17살 not-defect (l.61).
- eval/score.test.ts: scoreIssues hits, misses, false positives, max matching, precision and recall (l.10-110).
- src/lib/korean/sentences.test.ts exists (locateQuote, splitSentences used by the fake and locateIssues); not read in detail.
- src/server/ai-features.test.ts and src/ai/tasks/draft-chapter.test.ts (packText is passed as a string, l.19, l.102): not read in detail for pack assertions.

== 3. Factories and fake wiring ==
- src/test/factories.ts: createTestUser(db,{name?,email?}) l.20; createTestWork(db, ownerId, {title?,settings?}) inserts owner membership l.33; addTestMember(db,workId,userId,role) l.50; createTestChapter(db,workId,{position,title,body,status,publishedOn}) computes charCount l.59; createTestEntry(db,workId,{name,kind='character',aliases,summary}) l.87; createTestFact(db,workId,{content,entryId,status='confirmed',sourceChapterId,validFromPosition,validToPosition}) l.105; createTestThread(db,workId,{title,status='planted',plantedChapterId,targetChapterPosition}) l.132. No factories for relations or naming rules (tests insert via db.insert). src/test/db.ts createTestDb(): in-memory PGlite plus migrateDb (l.8-12).
- FakeAiClient: src/test/fake-ai.ts l.19-65. generateObject parses args.schema on structuredOutput (l.28-32); structuredOutput uses overrides first, then FAKE_OUTPUTS, else throws (l.46-52). streamText uses FAKE_TEXT.
- ai-fakes: src/test/ai-fakes/index.ts l.12-23 maps 'continuity-check' to fakeContinuity (l.18). FAKE_TEXT only maps draft-chapter.
- Scripted client pattern: src/server/chapter-check.test.ts l.56-78 (pick(system) returns object or undefined to fall through to FAKE_OUTPUTS). It cannot capture the prompt as written; a new test needs args.prompt capture.

== 4. Exact vitest commands ==
- Touched unit tests: pnpm vitest run src/ai/context.test.ts src/lib/korean/mentions.test.ts src/ai/tasks/continuity-check.test.ts src/server/chapter-check.test.ts e2e/ai-stub/responders.test.ts src/test/fake-ai.test.ts --maxWorkers=2
- Eval fixture and scoring: pnpm vitest run eval/fixture.test.ts eval/score.test.ts --maxWorkers=2
- Draft-path check: pnpm vitest run src/server/ai-features.test.ts src/ai/tasks/draft-chapter.test.ts --maxWorkers=2
- Recall: pnpm eval:continuity (real key needed; skips otherwise) and pnpm eval:continuity --fake (flow only, not quality).
- vitest.config.ts includes src/**/*.test.{ts,tsx}, eval/**/*.test.ts, e2e/ai-stub/**/*.test.ts.

== 5. NEW test cases that must exist (name | input | expected) ==
Context (src/ai/context.test.ts):
a) "a place card named only in the manuscript is kept when the budget trims lower-mention cards" | entries 이서윤 (aliases 서윤), 잿빛 종루 (kind place, aliases 종루), 민준 (summary '가'.repeat(600)); text '서윤은 웃었다. 서윤은 떠났다. 종루의 문이 열렸다. 민준은 울었다.'; budgetChars 500 | expected: 잿빛 종루 present with ref E-something and renderContextPack contains '(장소)'. CONFLICTS with existing test l.100 (expects only 이서윤): the rule must be decided first (see open questions).
b) "every entry named in the text is selected regardless of order of mention count" | 3 named entries, mention counts 3/2/1 | expected: all three in pack.entries, refs E1..E3 in mention order. (Breaks l.100 under option A.)
c) "a card named only by alias with a particle (종루의, 종루가) is selected" | entry 잿빛 종루 alias 종루; text '종루의 문' and '종루가 열렸다' | expected: mentionCount 2 and selected. (Probably passes already; add to pin behavior.)
d) "renderContextPack writes the place card header with the 장소 label" | entry kind place | expected: contains '[E1] 잿빛 종루 (장소)'. Verify the label rendering against ENTRY_KIND_LABEL in src/lib/labels.ts (place: '장소', l.21).
Mentions (src/lib/korean/mentions.test.ts):
e) "a two-word place name matches by its one-word alias" | name '잿빛 종루', aliases ['종루']; text '언덕 위 종루에 올랐다' | expected: one mention, count 1 for that entry.
Continuity prompt (src/ai/tasks/continuity-check.test.ts):
f) "system prompt has a rule that absence of mention is not a contradiction" | CONTINUITY_SYSTEM | expected: a '- ' line containing '언급' and '모순이 아니다' (exact wording to be fixed by the implementer; pin it like the l.223 test).
g) "prompt keeps the rule line numbering and the first line unchanged" | none | expected: startsWith existing first line (l.166 test) still passes.
h) "buildPrompt puts an entry card named in the manuscript into the wiki section" | pack from context with 종루 card | expected: prompt contains '[E2] 잿빛 종루' inside <wiki>.
Numeric check (new module, e.g. src/ai or src/lib; name TBD):
i) "a manuscript age that differs from the fact valid at this chapter is flagged in code" | fact '한세린의 나이는 16살이다.' validTo 6, entry 한세린; chapter 3 text '세린은 17살이다.' | expected: one contradiction issue, quote '세린은 17살이다.', severity medium, factId set.
j) "an age change that matches the fact valid at this chapter is not flagged" | facts 16살 (to 6) and 17살 (from 7); chapter 7 text '세린은 17살이 된 뒤로 달라졌다.' | expected: zero issues (matches notDefects in answers.json l.31-37).
k) "a number with no fact or no subject sentence is not flagged" | chapter 3 text '도윤서는 25살이다.' with no 도윤서 card | expected: zero issues.
l) "a sentence with the card name in a different entry's fact is not compared" | two cards with different ages | expected: only same-subject comparisons.
Chapter check (src/server/chapter-check.test.ts):
m) "runChapterCheck sends the matched place card to the continuity prompt" | chapter body '종루 문 앞에 섰다.', place card 잿빛 종루 alias 종루, capturing client that records args.prompt for continuity-check | expected: captured prompt contains '잿빛 종루' inside <wiki> and the card's fact text.
n) "a place-level contradiction found by the model is kept when the card is in the pack" | scripted client returns issue factRef F1 on the place card, quote '종루는 언덕 아래에 있었다.' | expected: one issue, kind contradiction, factId equals the place fact id.
o) "a model issue that cites absence (no quote contradicting a fact) is dropped" | scripted issue with explanation '언급이 없다' and suggestion '' | expected: dropped (ONLY if the implementer adds a code filter; otherwise this is a prompt-only rule and must NOT be asserted).
Recall (eval):
p) "fixture v2 planted-error set (if a new manuscript set is added): every answers.json quote is verbatim in its chapter" | new dir eval/fixtures/continuity-<name>/ | expected: same as fixture.test.ts l.52-59. Do NOT edit the existing 10-chapter fixture counts (l.18, l.52) in place.
q) "eval:continuity --fake writes a results file with totals" | pnpm eval:continuity --fake | expected: exit 0, results json with totals and runs. (Script smoke, not a vitest case.)
Scoring (eval/score.test.ts): r) "a location error quoted in a chapter counts as a hit for kind contradiction" | expected quote '종루는 열한 층으로' style fragment | expected hit=1. Existing tests cover the logic (l.10-110), so this is a fixture-level assertion, not a new scorer case.

== 6. Existing tests that will break, and why ==
- src/ai/context.test.ts l.100 'drops the lowest-ranked entries first when over budget': expects only 이서윤 and 민준 dropped. BREAKS if named cards bypass or reserve against the budget (cases a and b).
- src/ai/context.test.ts l.229 'renders fact status labels and validity ranges': asserts '[E1] 이서윤 (인물)' and '[F1][가정] 검은 머리 (출처 5화, 12화부터)'. Breaks only if the render format changes.
- e2e/ai-stub/responders.test.ts l.170 and e2e/ai-stub/responders.ts l.99-121 (parseCards): regexes depend on the exact card and fact line format. Breaks if renderContextPack format changes, or if the stub must be updated to see the new rule.
- src/ai/tasks/continuity-check.test.ts l.223 (suggestion line must start with '- suggestion에는'): breaks if the rule list is reworded or reordered. Insert the new rule without changing that line's prefix.
- src/server/chapter-check.test.ts l.287: scriptedClient keys on system.startsWith('당신은 장기 연재 웹소설의 설정 오류'). Breaks if the first line of CONTINUITY_SYSTEM changes.
- src/ai/tasks/continuity-check.test.ts l.166: startsWith the same first line. Same risk.
- eval/fixture.test.ts l.18 (10 chapters) and l.52 (exactly 11 expected errors): break if the planted-error set is extended in place. Use a separate fixture directory.
- Draft path (src/server/ai-features.ts l.313): any budget change also changes the draft prompt. Not asserted in the test files I read, but check src/server/ai-features.test.ts.
- NOT expected to break: mentions.test.ts (matcher unchanged), chapter-check.test.ts l.118 (fake still yields 1 hand issue; if more cards appear, toHaveLength(1) still holds only if no extra hand/age facts are added), context.test.ts l.35/l.55 (selection of mentioned or extra ids unchanged), fake-ai.test.ts.

== 7. Gaps and what was not verified ==
- Cause of the missing 종루 card in Luna ko: not confirmed. Budget trimming is the likely cause; mention miss is not excluded, and the run artifacts (calls/027) are not in the repo.
- No test file asserts the continuity prompt rules beyond the lines listed. 'Absence is not a contradiction' has no test today.
- No code-level numeric check exists in src (only test-only fakeAgeIssue).
- No documents tree result for eval/fixtures/continuity was found, so the 0-recall baseline for this fixture is unknown.
- ai-features.test.ts and localize.test.ts (uses renderContextPack at l.311) were not read in detail.

Files:
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.ts` 64-67, 114-305, 308-354, 412-419 - buildContextPack selection by mention (l.140-149), default budget 12000 (l.64), trim order that drops least-mentioned entries first (l.285-300), renderContextPack format (l.308-354), fact line format (l.412-419)
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.ts` 50-61, 67-117, 137-160 - CONTINUITY_SYSTEM rules without a 'no mention' rule (l.50-61), buildPrompt (l.142-152), postProcess and locateIssues (l.67-117, l.153)
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.ts` 126-260 - runChapterCheck: buildContextPack call (l.144), continuity call (l.163-173), resolveContinuityIssues (l.212)
- `/home/xogud/documents/github/DaeumHwa/src/lib/korean/mentions.ts` 15-63 - findMentions matcher, no kind filter, particle and boundary rules
- `/home/xogud/documents/github/DaeumHwa/src/ai/context.test.ts` 34-240 - buildContextPack and renderContextPack tests; l.100 budget test conflicts with new rule
- `/home/xogud/documents/github/DaeumHwa/src/ai/tasks/continuity-check.test.ts` 67-240 - postProcess, fake, and prompt tests; l.223 rule-line check; l.166 first-line check
- `/home/xogud/documents/github/DaeumHwa/src/server/chapter-check.test.ts` 56-78, 80-335 - runChapterCheck and runProofread tests; scriptedClient helper; l.287 system-prefix match
- `/home/xogud/documents/github/DaeumHwa/src/test/factories.ts` 20-153 - factories: createTestUser, createTestWork, addTestMember, createTestChapter, createTestEntry, createTestFact, createTestThread
- `/home/xogud/documents/github/DaeumHwa/src/test/fake-ai.ts` 19-65 - FakeAiClient wiring: overrides then FAKE_OUTPUTS, throws when missing
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/index.ts` 12-23 - FAKE_OUTPUTS registry; continuity-check maps to fakeContinuity
- `/home/xogud/documents/github/DaeumHwa/src/test/ai-fakes/continuity-check.ts` 13-80 - test-only deterministic continuity fake: hand contradictions and age contradictions only
- `/home/xogud/documents/github/DaeumHwa/src/test/db.ts` 8-12 - createTestDb: in-memory PGlite with migrations
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.ts` 99-135 - e2e stub continuity answer; parseCards regexes depend on the render format
- `/home/xogud/documents/github/DaeumHwa/e2e/ai-stub/responders.test.ts` 17-60, 170-184 - continuity scenario test (l.170) against CONTINUITY_PACK
- `/home/xogud/documents/github/DaeumHwa/eval/run-continuity.ts` 39-372 - eval runner: loads fixture, buildContextPack per chapter, scores, writes eval/results json; --fake flag
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/answers.json` 1-38 - existing planted-error answer key: 11 expected in ch 3-10, 1 notDefect (ch7 age change)
- `/home/xogud/documents/github/DaeumHwa/eval/fixtures/continuity/work.json` 52-150 - fixture cards: 한세린 age facts (16살 to 6화, 17살 from 7화), 잿빛 종루 place card with alias 종루
- `/home/xogud/documents/github/DaeumHwa/eval/fixture.test.ts` 17-71 - fixture counts and verbatim checks (l.18 chapters, l.52 exactly 11 errors)
- `/home/xogud/documents/github/DaeumHwa/eval/score.test.ts` 10-110 - scoreIssues tests for hits, misses, false positives, precision and recall
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/luna-6-ko.md` 75-76, 151-152, 276 - evidence: 6 of 10 wiki items in the continuity context, 종루 card missing, no-mention and missing-style-card analysis
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/summary.md` 112-117 - evidence: cloud runs report 0 issues, luna ko 6/10 cards, qwen no-mention false positive
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md` 275-282 - evidence: no-mention false positive (언급이 없다 as the reason)
- `/home/xogud/documents/github/DaeumHwa/docs/eval/novel/follow-up-ai-improvement.md` H section - backlog item H: 맥락 카드 포함, 언급 없음 규칙, 숫자 대조, 재현율 측정
- `/home/xogud/documents/github/DaeumHwa/docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 231, 242-247 - F9 design intent: load only needed cards, mention-based, about 12,000 char budget with lowest-ranked dropped first

Open questions:
- Budget versus named-card guarantee: should every card named in the manuscript always be included even if it exceeds the 12,000-char budget? Option A (always include) breaks the existing test at src/ai/context.test.ts l.100. Option B (reserve a minimum for named cards and trim the rest) keeps l.100 passing only if the reserve is smaller than the test budget. The decision must be made before writing the tests in section 5a and 5b.
- Is the missing 종루 card in Luna ko caused by budget trimming (context.ts l.285-300) or by a mention miss? Not verified; the run's calls/027 prompt is outside the repo. A test case for the cause should be written against a reproduced pack, not the reviewer's summary.
- Where should the numeric fact check live? No production code compares numbers today; the only age logic is test-only in src/test/ai-fakes/continuity-check.ts l.63-80. Choosing a module changes the test paths in section 5i-5l.
- Should the 'absence is not a contradiction' rule also get a code-level filter in postProcess (case 5o), or stay prompt-only? If prompt-only, no deterministic test is possible beyond the prompt-text assertion (5f).
- Recall measurement: the existing 10-chapter fixture already has 11 planted errors with answers.json. Does the team want to measure recall on this set first (pnpm eval:continuity, real key) before creating a new planted-error set? A new set needs a separate fixture directory so eval/fixture.test.ts l.18 and l.52 keep passing.
- Does the draft path (src/server/ai-features.ts l.313) also need the new named-card rule? A change to buildContextPack affects draft prompts, and src/server/ai-features.test.ts was not read in detail for pack assertions.


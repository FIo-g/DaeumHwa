# AI 개선 라운드 설계 (2026-10-19)

경량 모델 소설 평가(2026-10-18, haiku/luna/qwen 6회)에서 나온 후속 과제를 구현하는 설계. 근거와 항목은 `docs/eval/novel/follow-up-ai-improvement.md` 2절(A~J)과 3절(하네스)이다. 4절(API 키 연동, 역할별 모델)과 로컬 모델 추가 실행, Haiku·Luna 재평가, 2화 이상 평가는 이번 범위가 아니다.

상태: 10절의 결정 7건이 모두 정해졌다(2026-10-19). 구현 계획(writing-plans)과 실행 방식 선택 전에는 코드를 건드리지 않는다.

## 1. 목표와 성공 기준

- 클라우드 모델(Haiku, Luna)에서 평가 지표가 좋아진다: 분량 T3 통과 1/4 → 4/4, 한 문단 4문장 이상 0에 가깝게, 견본 문장 베끼기·반복어 감소, 추출 중복·인용 변조 감소, 이해할 수 없는 교정 제안 감소.
- 로컬 모델용 트랙(C, D, F1~F4)은 코드와 단위 테스트(가짜 AI)까지만 만든다. 효과는 로컬 모델을 다시 돌릴 때 잰다.
- 단위 테스트가 통과해도 AI 품질이 좋아졌다는 증거는 아니다. 임계값(GUARDS, E2 반복어 8회, H 16,000자, J, 재현율 목표)은 임시값이고 작성자 기기의 저장된 실행 결과로 보정한다.
- 기존 규칙 유지: 사용자 문구 한국어, `AppError`/`ActionResult`, 위키 변경은 같은 트랜잭션에 `change_log`, AI는 위키 표에 직접 쓰지 않음, 패키지 변경 없음.

## 2. 브랜치와 모델 배치

- `feat/ai-improvement-cloud`(main에서) → 검토·수정 → `feat/ai-improvement-local`(cloud 끝에서). main에 합치지 않고 PR만 낸다(cloud 먼저, local 나중).
- 트랙마다 worktree `track/<cloud|local>/<ID>`, 웨이브 시작 시점의 합쳐진 끝에서 분기.
- 모델: 구현 haiku(TDD), 트랙별 검토 haiku, 통합 sonnet, 전체 검토 opus. 막히면 sonnet으로 올린다.
- 구현자는 자기 브리프의 파일 목록만 수정한다. `pnpm vitest run <경로> --maxWorkers=2`와 `pnpm exec tsc --noEmit`(typegen 없이)만 실행한다. `git add -A`, 전체 포맷, 설치 금지.

## 3. 트랙 (21개)

브리프는 `docs/superpowers/handoff/2026-10-19-ai-improvement/briefs/<ID>.md`. 크기는 브리프 기준(S/M/L).

| 트랙 | 브랜치 | 내용 | 크기 |
|---|---|---|---|
| GUARDS | cloud | `src/ai/guards/` 공용 라이브러리 | L |
| A | cloud | 분량 보장: 프롬프트에 최소 분량, 짧으면 이어쓰기 1회 | L |
| E1 | cloud | 문단당 문장 수 검사와 해당 문단만 다시 쓰기 | L |
| E2 | cloud | 견본 베끼기·반복어 검사와 해당 구간만 고치기 | L |
| B | cloud | 인물 말투(기존 말투 필드로 제안, DB 마이그레이션 없음) | L |
| I | cloud | 인터뷰 질문 전략("미정" 처리, 한 번에 하나) | L |
| G1 | cloud | 추출 중복 제거, 인용문 원문 검증 | L |
| G2 | cloud | 이름 잘림, 관계 끝점, 떡밥 상태 | M |
| H | cloud | 연속성 점검 맥락과 규칙 | L |
| J | cloud | 교정 범위와 같은 인용 병합 | M |
| HX1 | cloud | 평가자 눈가림(`model` 마스킹) | L |
| HX2 | cloud | 영어 치환표에 `새 회차` | S |
| HX3 | cloud | 작성자 에이전트가 위키와 이전 결정을 봄 | M |
| HX4 | cloud | 요약 저장, RESUME.md 오류 경우, 복사 재시도, `resummarize --date` | M |
| HX5 | cloud | 측정 연결: G·J·H 지표와 호출별 시간 초과 수를 실행 요약에 연결 (사용자 결정으로 추가, 브리프는 웨이브 0에서 작성) | S |
| C | local | 외래 문자(한자·가나·키릴) 차단 | L |
| D | local | 장면 비트 → 본문 2단계 초안, 장면만 다시 쓰기 | L |
| F1 | local | 교정을 3등분 | M |
| F2 | local | 회차 추출을 사실·떡밥·관계 3호출로 분리 | L |
| F3 | local | 독자 시뮬레이션을 페르소나별 병렬 호출로 | M |
| F4 | local | 로컬 서버 직렬화, 보조 기능 effort 전환 | L |

## 4. 웨이브 (opus 판정 결과)

같은 웨이브 안에서는 쓰는 파일이 겹치지 않는다. 겹치는 파일이 48개라서 순서로 푼다. `ai-features.ts`를 A, E1, E2, B가 모두 고치므로 A가 가장 먼저다.

| 웨이브 | 트랙 | 비고 |
|---|---|---|
| 0 | (통합자) | 브리프 커밋·수정, seam 커밋(5절), 기준선 tsc·vitest |
| 1 | GUARDS, A, H, HX3, HX1 | 가장 위험하고 의존 많은 것 먼저 |
| 2 | G2, J, I, E2 | E2는 GUARDS와 A 위에서 |
| 3 | G1, E1, HX2, HX4 | G1은 GUARDS·G2·I·J·H 뒤 |
| 4 | B, HX5 | B는 마지막, 최종 모양 위에 선택 필드만 추가. HX5는 G1·G2·J·H가 만든 `dropped`·`stats`·`proofreadStats`와 H 재현율을 `finish.ts`/`buildRunSummary`에 연결하고 호출별 시간 초과 수를 더한다(`finish.ts`는 HX4가 웨이브 3에서 먼저 고침, B와는 쓰는 파일이 겹치지 않음). 그동안 opus가 1~3 diff 검토 |
| (게이트) | | 전체 tsc, lint, `pnpm test --maxWorkers=2`, build, 가능하면 e2e → opus 전체 검토 → cloud에 수정 |
| L0 | (통합자) | 검토 끝난 cloud 끝에서 local 분기, 로컬 작업명 사전 등록 |
| L1 | F3, F4, F1 | |
| L2 | D, F2 | |
| L3 | C | D·E2 뒤에 E2의 `draft-repair.ts` 확장 |
| (게이트) | | local 전체 검사, opus가 cloud 대비 diff 검토(로컬 전용 동작이 제품 경로로 새지 않는지) |

병합은 트랙마다 `git merge --no-ff`, 병합마다 tsc·변경 파일 eslint·영향 vitest를 돌리고 웨이브 끝에 태그(`cloud-w1`…`cloud-w4`)를 붙인다. 실패한 트랙은 한 번 고쳐 보내고(그다음 sonnet), 그래도 안 되면 되돌린다. 같은 웨이브의 다른 트랙은 막지 않는다. 앞선 병합 때문에 낡은 고정 문구 테스트는 통합자가 고친다(동작을 되돌려 맞추지 않는다).

## 5. 웨이브 0 seam (겹침을 없애는 사전 작업)

1. `eval/novel/localize/en-systems.ts`를 작업별 모듈 `en/<task>.ts` + `en/shared.ts`로 쪼개고 `en-systems.ts`는 조립만 한다. 각 트랙은 자기 작업의 모듈만 고친다.
2. 작업명을 미리 등록(`AI_TASKS`, `EN_SYSTEMS`, `FAKE_OUTPUTS`, 견본): cloud는 `draft-continue`, `paragraph-trim`, `draft-repair`. local은 L0에서 `draft-beats`, `scene-rewrite`, `chapter-extract-facts|threads|relations`. 소유 트랙은 자리표시 파일만 채운다.
3. `localize.test.ts`의 `PROMPTS` 견본을 `samples/<task>.ts`로 옮긴다. 공유 테스트 파일에는 새 테스트를 `<이름>.<ID>.test.ts`로 따로 만든다.
4. `metrics.ts`가 빈 모듈 `metrics-interview.ts`, `metrics-proofread.ts`를 다시 내보낸다(I, J 지표는 각자 모듈에 쓴다).
5. worktree마다 `node_modules` 링크, 별도 PGlite 데이터 폴더. seam은 tsc, lint, localize·metrics 테스트를 통과해야 한다.

사용자가 en-systems 분리를 거부하면: 파일을 그대로 두고 맵 줄만 미리 심고, 남는 한 줄 충돌은 통합자가 푼다.

## 6. 탐지기 소유권 (중복 제거, 웨이브 0에서 브리프에 반영)

opus 점검의 가장 큰 위험은 같은 탐지기를 여러 트랙이 따로 만드는 것이다. 한 이름은 한 곳에서만 정의한다.

- **GUARDS(5개 공개 함수)**: `foreignScriptSpans`, `foreignScriptRuns`, `repeatedWords`, `sampleCopies`, `isNearDuplicateFact` + 타입 `Lang`, `ForeignScript`, `ForeignSpan`, `RepeatedWord`, `SampleCopyHit`. 파일: `types.ts`, `scripts.ts`, `repeats.ts`, `similarity.ts`(`normalizeForCompare`, `bigramDice`, `gramContainment`, 배럴에서 제외), `sample-copy.ts`, `fact-similarity.ts`, 배럴 `index.ts`. 순수 함수, import는 `@/lib/korean/sentences`, `@/lib/korean/josa`만. GUARDS는 `eval/novel/metrics.ts`의 `foreignRuns`를 `foreignScriptRuns`로 바꾸고, 먼저 옛 코드로 통과시킨 골든 테스트 `metrics.foreign.test.ts`로 고정한다.
- GUARDS에서 뺀 것: 문단·문장 수(E1이 `src/lib/korean/paragraphs.ts`), 분량(A가 `src/lib/draft-length.ts`), 인용문 검증(G1이 `evidence-quote.ts`), J의 같은 인용 전부 찾기(J의 `locateAllQuotes`). 길이·인용·일괄 중복 API는 두 설계 모두 버렸다.
- E2는 `src/lib/korean/style-copy.ts`에서 GUARDS의 `sampleCopies`, `repeatedWords`를 얇게 감싼다. G1은 `isNearDuplicateFact`를 가져다 쓴다. C는 외래 문자 로직을 새로 만들지 않고 `foreignScriptSpans`를 가져와 쓴다.
- **`draft-repair` 작업은 E2가 소유**(`draftRepairTask`, `DraftRepairSchema`, `applyDraftEdits`, `repairDraft`). C는 별도 파일을 만들지 않고 외래 문자 문장 수정을 확장(`repairDraftForeignScript`, `DraftAttempt.foreign`)한다.
- "미정" 답 판정은 I가 `src/lib/interview-plan.ts`의 `isUndecidedAnswer`로 소유하고, G1의 `isUndecidedOnlyAnswer`는 그 패턴 목록 위에 만든다.
- `extractionToProposals` 반환은 `{ proposals, pendingThreadEvents, stats, dropped }` 하나로 통일: G2(웨이브 2)가 `stats {fragmentNamesFixed, relationsDropped}`, G1(웨이브 3)이 `dropped {duplicateFacts, unverifiedEvidence}`를 추가. 항상 채우고 카운터는 0으로 시작.
- 인터뷰 추출 `knownFacts`는 G1부터 필수로 바꾸고 G1이 모든 리터럴·가짜·스텁을 고친다. `normalizeQuestion`은 I가 `src/lib/interview-plan.ts`로 옮기고 `src/server/interview.ts`에서 다시 내보낸다.

## 7. 초안 경로 (A가 단독 소유)

- `startDraft`의 서명과 반환 타입은 그대로, `done`은 이어쓰기를 합친 전체 글로 끝난다. 이어쓰기는 `draft-continue` 작업으로 기록한다.
- 추가: `draftLengthPlan`·`continuationPlan`(`src/lib/draft-length.ts`), `createTextPipe`(`src/lib/text-pipe.ts`), `replaceRunOutput`(`src/ai/run.ts`), `buildContinuationPrompt`. 290초 예산은 `startDraft` 첫 줄부터 전체에 적용.
- 이어쓰기 실패 정책(사용자 결정): 이어쓰기가 실패하면 `done`을 reject하지 않고 첫 글을 그대로 쓰며 경고만 남긴다(실행 기록과 평가 요약에 "이어쓰기 실패" 표시). 공백뿐인 이어쓰기도 실패로 보고 첫 글을 유지한다. 사용자가 직접 중단(abort)한 경우만 reject한다. A 브리프의 reject 표는 웨이브 0에서 이 정책으로 고친다. 평가에서 제공자 오류가 외부 한도·네트워크 문제로 분류되어야 하는 경우는 경고에 오류 코드를 담아 `withModelRetry`가 구분하게 한다.
- 평가 단계 순서(`eval/novel/steps/chapter.ts`): D 비트(local, 초안 전) → A 이어쓰기(`startDraft` 안) → E1 문단 줄이기 → E2 수리(C가 외래 문자까지 확장, 최종 글에 1회) → 교정 → 연속성 점검 → D 장면 다시 쓰기(local). 단계마다 자기 원본 파일(`draft.raw.txt`, `draft.trimmed.txt`, `draft.repaired.txt`)을 쓰고 남의 파일을 덮어쓰지 않는다. 2단계 초안과 장면 다시 쓰기는 제품 경로에 연결하지 않는다(비트 120초 + 스트림 280초가 `maxDuration` 300을 넘음).
- 나머지 트랙(E1, E2, B, D)은 `draft-chapter.ts`와 `startDraft`에 선택 필드만 추가하고 A의 규칙 문구는 고치지 않는다. B·C·D·E1 브리프의 "DRAFT_SYSTEM·responders.ts 고정" 문장은 A가 먼저 바꾸므로 웨이브 0에서 고친다.

## 8. 공통 규칙

- `ChapterMetrics`의 새 필드는 모두 선택 또는 기본값이 있어 저장된 실행이 계속 읽힌다. `foreignRuns`(GUARDS), `sampleCopyHits`·`repeatedWords`(E2), `overlongParagraphs`(E1), 외래 문자 수리 필드(C).
- `scaffold.ts` 작성 순서: A → I → HX2 → B → D. 규칙은 추가만 한다. `cli.ts`: HX1 → E2 → HX4 → F4. `novel-eval.js`는 HX1, HX4가 각자 구역만 쓴다. `README.md`: HX3 → HX4.
- 로컬 전용 동작은 제공자·프로필로 막고 `FakeAiClient`와 `@/test/ai-fakes`로만 시험한다. `runAiTaskSplit`(F3)은 `runAiTask` 동작을 바꾸지 않는다. F2는 자체 `shouldSplitChapterExtract(provider)`와 `AI_EXTRACT_SPLIT`을 쓴다.
- **B 말투 기능(사용자 결정)**: 말투 질문·추출·초안 맥락은 제품에 추가한다. 평가 하네스는 이 기능을 끄고 돌린다(`eval/novel/bible.json`의 답 은행은 수정하지 않는다, 인터뷰 핵심 주제에 말투를 넣지 않는다). 그래서 2026-10-18 기준선과 계속 비교할 수 있다. B의 평가 지표(Q5, 말투 모순 수)는 이번에 재지 않고, 나중에 말투를 켠 별도 실행에서 잰다. 구현은 선택 필드(`hasSpeech`, `voices`, `speech`, `pendingSpeechEntryIds`)와 기능 꺼짐 기본값으로 하고, 꺼진 상태의 출력이 B 이전과 같다는 테스트를 둔다.
- 기본값(웨이브 0에 기록, 사용자가 바꿀 수 있음): 영어 최소 비율 0.8·최대 1.3, 문단은 비어 있지 않은 한 줄(`---`, `***`, `* * *` 제외), E1 한도 3문장, G1 근접 중복 Dice 0.8, H 연속성 예산 16,000자, 반복어 8회, G2 고정 테스트 736/848은 그대로.

## 9. 위험

1. 설계 미승인 상태에서 구현을 시작하면 합의된 절차를 어기게 된다.
2. 탐지기 중복이 합칠 때 충돌하는 가장 큰 위험. 6절의 소유권을 브리프에 반영하기 전에 웨이브 1을 시작하지 않는다.
3. 초안 경로의 의미 충돌(A가 `done`을 바꾸고 E1·E2·C·D가 같은 글을 고침)은 단위 테스트를 통과하고도 평가를 깨뜨릴 수 있다. opus가 웨이브 3 뒤와 L3 뒤에 `steps/chapter.ts`와 `startDraft`를 통째로 검토한다.
4. G1의 `knownFacts` 필수화는 빠뜨린 리터럴이 전체 `pnpm test`나 e2e에서만 드러난다. 웨이브 3 끝에서 전체 테스트를 돌린다.
5. A·E2·B가 합쳐지면 `DRAFT_SYSTEM` 기대 배열 같은 낡은 고정 테스트가 깨진다. 통합자가 테스트를 고친다.
6. 크기 L 브리프를 haiku가 중간에 멈추거나 목록 밖 파일을 고칠 수 있다. 트랙별 검토가 `git diff --name-only`로 확인하고 한 번 고친 뒤 sonnet으로 올린다.
7. WSL2에서 웨이브당 최대 5레인이 vitest와 tsc를 돌린다. `--maxWorkers=2`, worktree별 PGlite 폴더.
8. cloud가 local 분기 뒤에 바뀌면 다음 웨이브 전에 cloud를 local에 병합한다(리베이스 금지).
9. 효과 검증은 API 키와 로컬 모델이 필요해서 지금은 불가능하다. 병합 메모에 임시값으로 표시하고 나중에 잰다.
10. `.claude/workflows/novel-eval.js`의 `/Users/taehyeong` 경로 하드코딩과 요약 저장을 막은 도구 가드 원인은 이번 라운드가 고치지 못한다(HX4는 우회만).

## 10. 사용자 결정

1. B 말투 기능: 제품에 추가하되 평가에서는 끈다(8절). **결정됨.**
2. 측정 연결 트랙 `HX5` 추가(3절, 웨이브 4). **결정됨.**
3. A의 이어쓰기 실패: 첫 글을 유지하고 경고만 남긴다(7절). **결정됨(추천대로).**
4. `author.md`가 짧은 초안을 받아들이는 문제: 측정 도구를 바꾸지 않으므로 이번에는 고치지 않고 `docs/eval/novel/follow-up-ai-improvement.md`에 기록만 한다. **결정됨(추천대로).**
5. 웨이브 0에서 `en-systems.ts` 분리와 작업명 사전 등록. **결정됨(추천대로).**
6. GUARDS 5함수 축소와 6절 소유권 표. **결정됨(추천대로).**
7. 8절의 기본값은 그대로. **결정됨(추천대로).**

## 11. 다음 단계

사용자 검토 → 승인 후 `superpowers:writing-plans`로 구현 계획(웨이브 0 상세 포함) 작성 → 실행 방식 선택. 실행은 다이나믹 워크플로를 가능한 한 크게, 같은 웨이브의 트랙은 병렬로 돌린다. 동시 실행 상한은 22로 설정되어 있다.

# 다음화 MVP 구현 설계서

- 작성일: 2026-10-16
- 기반 문서: `docs/다음화-MVP-설계서.md` (기획 초안, 17개 기능)
- 상태: 확정. 사용자가 설계 결정을 위임했으므로 아래의 "(설계 판단)" 표시 항목은 설계자가 정한 것이다.

## 1. 목적과 범위

### 1.1 한 줄 설명
설정과 떡밥을 기억해 주고, 그 기억을 바탕으로 연재 방향 조언, 초안, 교정까지 이어 주는 웹소설 연재 파트너.

### 1.2 이번 구현의 목적
- MVP 사용자는 사용자 본인과 개발 팀원이다. 나중에 서비스가 되면 장기 연재 웹소설 작가가 대상이다.
- 목표는 기획서의 17개 기능을 **모두 동작하는 형태로** 구현해, 팀이 실제 원고로 아이디어를 검증할 수 있게 하는 것이다.
- 판매 수준의 완성도(결제, 대규모 트래픽, 정교한 디자인)는 목표가 아니다. 그러나 데이터가 사라지거나 AI가 승인 없이 위키를 바꾸는 일은 절대 없어야 한다.

### 1.3 반드시 지킬 원칙 (기획서 3장)
1. 작가가 승인한 것만 위키(정본)에 반영한다. AI는 제안만 한다.
2. AI가 추측한 설정은 [가정]으로 표시하고 정본과 구분한다.
3. 모든 사실에 출처(회차 또는 인터뷰/작가 입력)를 붙인다.
4. 질문은 한 번에 하나, 언제든 건너뛸 수 있다.
5. 기획 때는 질문형, 집필 중에는 빠른 점검만 한다.
6. 변경은 덮어쓰지 않고 이력으로 쌓는다. 삭제도 보관(archive) 처리하고 이력에 남긴다.

### 1.4 실패로 보는 것 (anti-goals)
- AI 출력이 작가 승인 없이 위키, 사실, 떡밥, 관계를 바꾼다.
- 오기 지적에 원고 문장이나 위키 근거가 빠져 있다.
- 한글 입력(IME)이 깨지는 편집기.
- 저장하지 않은 원고가 새로고침/탭 닫기로 사라진다.
- API 키 없이 앱이 아예 동작하지 않는다(데모 모드로라도 모든 화면이 돌아가야 한다).

### 1.5 이번 범위에서 하지 않는 것 (non-goals)
- 카카오/네이버 로그인, 이메일 인증, 비밀번호 재설정 메일 (메일 발송 수단 없음)
- 실시간 공동 편집(CRDT). 동시 편집은 버전 충돌 경고로 처리
- HWP/HWPX 가져오기 (docx/txt로 저장해 올리도록 안내)
- 백업 파일에서 복원 (내보내기만)
- 결제, 요금제, 독자용 공개 위키, 웹툰 기능 (기획서에서 폐지/보류)
- 외부 맞춤법 서비스 연동 (어댑터 자리만 남김)

## 2. 기술 스택 (확정)

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16 (App Router, `src/`), React 19, TypeScript | Turbopack 기본 |
| 스타일/UI | Tailwind CSS v4 + shadcn/ui | 시스템 한글 폰트 스택 (폰트 패키지 없음, 설계 판단) |
| DB | PostgreSQL + Drizzle ORM (`drizzle-orm`, `drizzle-kit`) | DB 교체 고려 안 함. Postgres 전용 기능 사용 가능 |
| 로컬 DB | PGlite (`@electric-sql/pglite`, 파일 저장 `./.data/pglite`) | `DATABASE_URL`이 없으면 PGlite, 있으면 `postgres`(postgres.js) 드라이버 |
| 테스트 DB | PGlite 메모리 인스턴스 (테스트 파일마다 새로 생성) | 병렬 실행 시 충돌 없음 |
| 인증 | Better Auth (이메일+비밀번호, Drizzle 어댑터, DB 세션) | 소셜 로그인은 나중 |
| AI | 공식 Anthropic SDK `@anthropic-ai/sdk` + 자체 `AiClient` 인터페이스 | 기본 모델 `claude-opus-5-5` (환경변수로 변경). 키가 없으면 가짜(Fake) 클라이언트로 데모 모드 |
| 검증 | zod 4 | 서버 액션 입력, AI 구조화 출력 |
| 백그라운드 작업 | Inngest (선택). 설정이 없으면 브라우저가 단계별로 진행시키는 방식 | 원고 가져오기에 사용 |
| 브라우저 처리 | Web Worker + Comlink, IndexedDB(`idb`) | 파싱, 회차 분할, 검색, diff, 백업 zip, 일정 계산 |
| 파일 파싱 | `mammoth`(docx), 내장 `TextDecoder`(UTF-8/EUC-KR) | |
| diff / zip | `diff`(jsdiff), `fflate` | |
| 관계 그래프 | `cytoscape` (내장 cose 레이아웃) | React 래퍼 없이 직접 사용 |
| 날짜 | `date-fns` | |
| 한글 도구 | `es-hangul` (초성 검색 등) + 자체 조사 처리 | |
| 테스트 | Vitest + Testing Library(jsdom), Playwright(E2E) | |
| 배포 | Vercel(서버리스) + Neon(Postgres) | 무료 플랜이 비상업 개인용과 맞음 |

라이선스: 위 의존성은 모두 MIT/Apache/BSD/ISC 계열이다. GPL/AGPL 코드는 가져오지 않는다(나중 서비스 가능성 + 공개 저장소).

## 3. 아키텍처

### 3.1 계층
```
브라우저 (React 클라이언트 컴포넌트)
  ├─ Web Worker (Comlink): 파일 파싱, 회차 분할, 카드 검색 인덱스, diff, 백업 zip, 일정 계산
  └─ IndexedDB (idb): 원고 자동 저장 캐시, UI 상태
        │  Server Actions / Route Handlers
Next.js 서버 (Node 런타임)
  ├─ src/server/actions/*  : 'use server' 진입점. 세션 확인 → zod 검증 → 서비스 호출 → ActionResult 반환
  ├─ src/server/*          : 도메인 서비스 (db, actor, input) → 결과. 권한 확인과 변경 이력 기록 담당
  ├─ src/ai/*              : AI 작업 정의(프롬프트, 스키마, 가짜 출력), 실행기(사용량 제한, ai_runs 기록)
  └─ src/db/*              : Drizzle 스키마와 클라이언트
PostgreSQL (Neon / 로컬 PGlite)
```

### 3.2 공통 규칙
- 서비스 함수 시그니처: `fn(db: Db, actor: Actor, input) => Promise<T>`. `Actor = { userId: string }`.
- 모든 서비스는 시작할 때 `requireWorkRole(db, workId, actor.userId, minRole)`로 권한을 확인한다.
- 위키 계열 테이블(wiki_entries, facts, threads, thread_events, relations, naming_rules, style_cards, chapters.summary)의 모든 생성/수정/보관은 같은 트랜잭션 안에서 `change_log`에 기록한다.
- 오류는 `AppError(code, message)`로 던진다. `code`: `NOT_FOUND | FORBIDDEN | CONFLICT | VALIDATION | AI_LIMIT | AI_ERROR | BAD_STATE | UNAUTHENTICATED`. `message`는 사용자에게 보여 줄 한국어 문장.
- 서버 액션은 예외를 던지지 않고 `ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code; message } }`를 반환한다.
- 읽기는 서버 컴포넌트에서 서비스를 직접 호출한다. 쓰기는 서버 액션 → 성공 시 `revalidatePath`.
- Next.js 16 규칙: 페이지의 `params`/`searchParams`는 Promise다 (`const { workId } = await params`).

### 3.3 권한 (팀 모드)
역할 순위: `viewer(0) < commenter(1) < editor(2) < owner(3)`.

| 동작 | 최소 역할 |
|---|---|
| 작품/원고/위키/이력 읽기 | viewer |
| 코멘트 작성, 자기 코멘트 해결 | commenter |
| 원고 편집, 위키 편집, 제안 승인/거절, AI 실행, 일정 편집, 되돌리기 | editor |
| 멤버/초대 관리, 작품 설정·보관, 내보내기 | owner |

작품 생성자는 `work_members`에 `owner`로 들어간다. 1인 사용이 기본이고 팀 모드는 초대해야 생긴다.

## 4. 데이터 모델

규칙: id는 `uuid` 기본값 `gen_random_uuid()` (Better Auth 테이블은 text id). 시간은 `timestamptz`, 기본 `now()`. 날짜(연재일)는 `date` (문자열 `YYYY-MM-DD` 모드). 상태값은 `text` + TypeScript 유니언 타입(+ zod)으로 관리하고 pgEnum은 쓰지 않는다(설계 판단: 값 추가가 쉬움). 소프트 삭제는 `archived_at`.

### 4.1 인증 (Better Auth 생성 스키마)
`user`, `session`, `account`, `verification` — Better Auth CLI가 생성하는 Drizzle 스키마를 그대로 쓴다 (`src/db/auth-schema.ts`).

### 4.2 도메인 테이블
(TS 속성명은 camelCase, 컬럼명은 snake_case)

**works** — 작품
- id, ownerId(text→user.id, cascade), title(text), genre(text, ''), logline(text, ''), synopsis(text, ''), settings(jsonb `WorkSettings`, {}), status('active'|'archived'), createdAt, updatedAt
- `WorkSettings` (모두 선택, 코드에서 기본값 적용): `absenceThreshold`(기본 10, 이 회차 수 이상 안 나온 인물 경고), `publishDays`(0=일~6=토, 기본 [1,2,3,4,5]), `chaptersPerPublishDay`(기본 1), `bufferTarget`(기본 5), `targetChars`(기본 5500)

**work_members** — 팀 구성원: workId, userId, role, createdAt. PK(workId, userId)

**work_invites** — 초대 링크: id, workId, token(unique), role(owner 제외), createdBy, expiresAt, acceptedBy?, acceptedAt?, revokedAt?, createdAt

**chapters** — 회차
- id, workId, position(int, 1부터, 작품 내 순서), title, body(text, 원고), status('draft'|'done'), publishedOn(date?), summary(text, '', 승인된 회차 요약 = 위키의 "회차별 요약"), charCount(int, 공백 포함), charCountNoSpaces(int), version(int, 1, 낙관적 동시성), archivedAt?, createdAt, updatedAt
- position 유일성은 코드에서 보장(재정렬 트랜잭션).

**chapter_versions** — 회차 이력: id, chapterId, version, title, body, charCount, source('save'|'restore'|'import'|'ai_draft'), createdBy?, createdAt, updatedAt
- 같은 사용자가 10분 안에 다시 저장하면 마지막 버전 행을 갱신(병합)하고, 그 밖에는 새 행을 만든다 (설계 판단: 자동 저장으로 이력이 폭증하지 않게).

**wiki_entries** — 설정 카드 (인물/장소/세계관 등을 한 테이블로, 설계 판단: 관계 그래프·카드 선택·승인을 단순하게)
- id, workId, kind('character'|'place'|'organization'|'item'|'rule'|'event'|'term'|'other'), name, aliases(text[], 별칭), summary, body(markdown), fields(jsonb `Record<string,string>`, 종류별 고정 필드), customFields(jsonb `{key,value}[]`, 자유 필드), createdByType('ai'|'author'), archivedAt?, createdAt, updatedAt
- 인물 고정 필드 키: `role`(역할), `age`(나이), `gender`(성별), `appearance`(외모), `personality`(성격), `speech`(말투), `goal`(목표), `background`(배경). 장소: `location`, `features`. 그 밖의 종류는 자유 필드 위주.

**entry_appearances** — 등장 기록 (원고 저장 시 이름/별칭 매칭으로 계산): entryId, chapterId, mentionCount. PK(entryId, chapterId)

**facts** — 사실 한 건
- id, workId, entryId?(카드 연결), subjectName(무엇에 관한 사실인지 이름, 나중 연결용), content, status('confirmed'|'assumed'|'undecided' = 확정/가정/미정), sourceType('chapter'|'interview'|'author'|'import'), sourceChapterId?, evidence(근거 문장), validFromPosition?(이 회차부터 유효), validToPosition?(이 회차까지 유효), supersededByFactId?(이 사실을 대체한 새 사실), createdByType, archivedAt?, createdAt, updatedAt
- 유효 범위가 비어 있으면 작품 전체에서 유효하다(나중 회차에서 밝혀진 과거 설정도 앞 회차에 적용된다). 나이, 계급, 부상, 소속처럼 이야기 속에서 바뀌는 상태는 "N화부터 바뀜"으로 기록한다: 옛 사실의 validToPosition = N-1, 새 사실의 validFromPosition = N, 옛 사실의 supersededByFactId = 새 사실 id (설계 판단: 장기 연재에서 정상적인 전개를 오기로 잡지 않기 위해).

**threads** — 떡밥
- id, workId, title, description, status('planned'|'planted'|'developing'|'resolved'|'discarded'), plantedChapterId?, resolvedChapterId?, targetChapterPosition?(회수 목표 회차), importance('low'|'medium'|'high'), createdByType, archivedAt?, createdAt, updatedAt
- 'planned'(계획됨)은 인터뷰 단계에서 아직 원고에 심지 않은 떡밥용으로 추가했다 (설계 판단).

**thread_entries**: threadId, entryId (관련 인물/장소). PK 복합

**thread_events** — 떡밥 기록: id, threadId, kind('planted'|'developed'|'resolved'|'discarded'|'note'), chapterId?, note, evidence, createdByType, archivedAt?, createdAt
- 규칙: `developed`의 회차 position ≥ 심은 회차 position. `resolved`의 회차 position > 심은 회차 position (심은 회차 이후만 회수 인정). 심은 회차가 없으면 developed/resolved 불가.

**relations** — 관계 그래프 연결: id, workId, sourceEntryId, targetEntryId, kind(자유 텍스트: 가족, 연인, 적대, 동료, 소속, 스승 등), description, directed(bool), startPosition?(유효 시작 회차), endPosition?(유효 끝 회차), createdByType, archivedAt?, createdAt, updatedAt

**naming_rules** — 표기 통일: id, workId, canonical(올바른 표기), variants(text[], 잘못된 표기), note, entryId?, archivedAt?, createdAt, updatedAt

**style_cards** — 문체 카드: id, workId, entryId?(없으면 작품 서술 문체), name, tone, rules, examples, createdByType, archivedAt?, createdAt, updatedAt

**proposals** — 승인 대기 (AI 제안)
- id, workId, type(아래), payload(jsonb), status('pending'|'approved'|'rejected'), source('interview'|'import'|'post_chapter'|'style'|'manual'), sourceRef(text? 인터뷰 턴/가져오기 작업/AI 실행 id), chapterId?, decidedBy?, decidedAt?, decisionNote, appliedTargetId?, createdAt
- type과 payload:
  - `entry_create`: { kind, name, aliases[], summary, fields }
  - `entry_update`: { entryId, entryName, patch: { summary?, aliases?, fields? } }
  - `fact_create`: { subjectName, entryId|null, content, suggestedStatus, sourceChapterId|null, evidence, supersedesFactId|null } (supersedesFactId가 있으면 승인 시 "그 회차부터 바뀜"으로 처리)
  - `thread_create`: { title, description, status('planned'|'planted'), plantedChapterId|null, targetChapterPosition|null, importance, relatedNames[], evidence, events: [{ kind('developed'|'resolved'), chapterId, evidence }] }
  - `thread_event`: { threadId, threadTitle, kind('planted'|'developed'|'resolved'|'discarded'), chapterId|null, note, evidence }
  - `relation_create`: { sourceName, targetName, kind, description, directed, startPosition|null, evidence }
  - `chapter_summary`: { chapterId, summary }
  - `style_card`: { entryName|null, name, tone, rules, examples }

**change_log** — 모든 위키 변경 이력
- id, workId, targetTable, targetId, action('create'|'update'|'archive'|'restore'|'revert'), before(jsonb?), after(jsonb?), proposerType('ai'|'author'), actorId?(변경하거나 승인한 사용자), proposalId?, revertsChangeId?, summary(한국어 한 줄 설명, 예: "인물 '이서윤' 생성"), createdAt

**issues** — 오기 지적 (AI 제안 + 결정적 표기 점검)
- id, workId, chapterId, runId?, kind('contradiction'|'naming'|'timeline'|'thread'|'character'|'other'), severity('high'|'medium'|'low'), quote(원고 문장, 원고의 실제 부분 문자열), quoteStart?, quoteEnd?, entryId?, factId?, wikiExcerpt(근거 위키 항목 문구), explanation, suggestion, status('open'|'accepted'|'dismissed'|'wiki_updated'), resolvedBy?, resolvedAt?, createdAt

**comments** — 편집자 코멘트: id, workId, chapterId, authorId, parentId?(답글), body, quote, quoteStart?, quoteEnd?, status('open'|'resolved'), resolvedBy?, resolvedAt?, createdAt, updatedAt

**interview_sessions**: id, workId, status('active'|'completed'), createdBy, createdAt, updatedAt
**interview_turns**: id, sessionId, topic, question, rationale, answer?, skipped(bool), proposalCount, createdAt, answeredAt?

**import_jobs** — 원고 가져오기 진행 상태
- id, workId, fileName, status('uploading'|'queued'|'running'|'paused'|'done'|'error'|'cancelled'), chapterIds(uuid[], 처리 순서), cursor(int), totalChapters, processedChapters, proposalCount, state(jsonb: { knownEntities: {name, kind, aliases[]}[], threadTitles: string[] }), error?, runner('client'|'inngest'), createdBy, createdAt, updatedAt, startedAt?, finishedAt?

**schedule_items** — 연재 일정: id, workId, kind('deadline'|'publish'|'hiatus'|'event'), title, date, endDate?(휴재 기간 끝), chapterId?, note, done(bool), createdAt, updatedAt

**ai_runs** — AI 호출 기록 (사용량 제한 + 결과 보관)
- id, workId?, userId, task, chapterId?, status('running'|'done'|'error'), model, inputTokens, outputTokens, output(jsonb?), error?, createdAt, finishedAt?
- 독자 시뮬레이션 결과, 연재 방향 조언 결과, 초안은 여기 `output`에 남는다.

**user_work_state** — 이어쓰기 지점: userId, workId, lastChapterId?, lastCursor?, lastPath, updatedAt. PK(userId, workId)

## 5. 기능별 설계 (17개)

### F1 질문형 인터뷰
- 화면 `/works/[workId]/interview`. 질문은 한 번에 하나만 보인다. 버튼: 답하기, 건너뛰기, 인터뷰 끝내기.
- 다음 질문: AI 작업 `interview-question`이 현재 위키 상태(종류별 카드 수, 주요 카드 이름, 비어 있는 주제)와 최근 Q&A 10개를 보고 질문 1개(topic, question, rationale)를 만든다. 주제 후보: 주인공, 주요 인물, 세계관 규칙, 장소, 갈등, 떡밥, 결말 방향, 문체.
- 답변 처리: AI 작업 `interview-extract`가 답을 후보로 정리 → `proposals`(source 'interview')로 저장 → 같은 화면에서 바로 카드 목록으로 보여 주고 작가가 확정/가정/미정 태그를 골라 승인하거나 거절한다(승인 대기 화면에도 남음).
- 인터뷰 세션과 턴은 저장되어 다시 들어오면 이어진다.

### F2 설정 위키
- 화면 `/works/[workId]/wiki`: 탭 = 인물 / 세계관(장소·조직·물건·규칙·사건·용어·기타) / 떡밥 장부 / 관계 그래프 / 표기 통일 / 회차 요약 / 문체 카드.
- 카드 상세 `/works/[workId]/wiki/entries/[entryId]`: 이름, 별칭, 요약, 고정 필드, 자유 필드, 설명, 사실 목록(태그와 출처 회차, 근거 문장), 관계, 등장 회차, 이 카드의 변경 이력.
- 작가가 직접 만들고 고치는 것은 바로 반영(proposerType 'author')되고 이력에 남는다.

### F3 사실 태그
- 태그 3종: 확정(초록), 가정(주황, 앞에 "[가정]" 표시), 미정(회색). 출처: "3화" 링크 / "인터뷰" / "작가 입력" / "가져오기".
- 유효 범위가 있으면 "12화부터", "~11화"처럼 표시하고, 대체된 사실은 흐리게 "(12화부터 바뀜)"과 새 사실 링크를 보인다.
- 사실 편집 메뉴: "내용 수정"(틀린 사실 고치기) / "N화부터 바뀜"(상태 변화 기록, 새 사실 생성) / "보관".
- 사실 태그 변경도 이력에 남는다.

### F4 떡밥 장부
- 화면 `/works/[workId]/wiki/threads`: 상태별 열(계획됨/심음/발전 중/회수/폐기) 또는 표. 각 떡밥: 제목, 심은 회차, 회수 목표 회차, 중요도, 관련 인물, 기록 타임라인.
- 기록 추가 시 회차 순서 규칙(4.2 thread_events)을 서버에서 검사하고 어기면 `VALIDATION` 오류: "회수는 떡밥을 심은 회차(N화) 이후에만 기록할 수 있습니다."

### F5 변경 이력, 되돌리기, 내보내기
- 화면 `/works/[workId]/history`: change_log 목록(필터: 대상 종류, 제안자 AI/작가), 항목마다 before/after 요약.
- 되돌리기: 그 대상의 **가장 최근 변경**만 되돌릴 수 있다(이후 변경이 있으면 `CONFLICT`: "이후 변경이 있어 먼저 그 변경을 되돌려야 합니다."). 되돌리기는 새 'revert' 이력을 쌓는다. create → 보관, update → before 값 복원, archive → 보관 해제, restore → 다시 보관.
- 원고 버전 이력은 회차별 `/works/[workId]/chapters/[chapterId]/history`: 버전 목록, 현재 원고와 diff(Web Worker), 이 버전으로 복원(새 버전 생성).
- 내보내기(owner): 서버가 작품 전체 JSON을 내려주고, 브라우저 Worker가 zip을 만든다: `work.json`(전체), `chapters/001-제목.md`, `wiki/인물.md`, `wiki/세계관.md`, `wiki/떡밥.md`, `wiki/표기.md`, `history.md`. 파일명 `다음화-백업-<작품명>-<YYYYMMDD>.zip`. 한글 파일명은 NFC 정규화.

### F6 기존 원고 가져오기
- 화면 `/works/[workId]/import`. 지원 형식: .txt, .md, .docx (HWP는 안내 문구로 docx/txt 저장 권장).
- 1단계(브라우저 Worker): 파일 디코딩 — BOM 확인 → UTF-8(fatal) 시도 → 실패 시 EUC-KR. docx는 mammoth로 텍스트 추출.
- 2단계(브라우저 Worker): 회차 분할 — 제목 줄 패턴: `1화`, `제1화`, `제 1 화`, `1화. 제목`, `<1화>`, `[1화]`, `【1화】`, `프롤로그`, `에필로그`, `외전`, `번외`, `Episode 1`, `EP.1`, `Chapter 1`, 마크다운 `#` 제목. 패턴이 없으면 구분선(`***`, `---`, `* * *`)으로, 그것도 없으면 약 5,500자 단위로 문단 경계에서 자른다.
- 3단계: 미리보기 — 회차 목록(제목, 글자 수, 첫 줄). 제목 수정, 앞 회차와 합치기, 제외 가능.
- 4단계: 업로드 — `createImportJob` → 50회차씩 `appendImportChapters` (Vercel 본문 4.5MB 제한 회피) → `startImportJob`. 회차는 기존 회차 뒤에 status 'done'으로 추가된다.
- 5단계: 처리 — 회차마다 AI 작업 `chapter-extract`로 카드/사실/떡밥/관계/요약 후보를 뽑아 proposals(source 'import')로 저장. 이미 아는 이름 목록(state.knownEntities)과 기존 카드 이름을 넘겨 중복 카드를 줄인다. 같은 작업에서 앞서 제안된 떡밥이 다시 나오면(제목 일치) 그 `thread_create` 제안의 `events`에 발전/회수를 덧붙인다.
- 진행 방식: `INNGEST_EVENT_KEY`(또는 `INNGEST_DEV=1`)가 있으면 Inngest 함수가 회차마다 step으로 진행. 없으면 가져오기 화면이 열려 있는 동안 브라우저가 `POST /api/import-jobs/[jobId]/advance`를 반복 호출(회차 1개씩). 진행 상태는 서버에 저장되어, 화면을 닫았다 열면 이어서 진행한다. 일시정지/재개/취소 가능.
- 중복 처리 방지: 한 회차 처리 결과(제안 저장 + cursor 증가)는 한 트랜잭션이며 `WHERE cursor = 기대값` 조건으로 갱신해 동시 호출 시 한쪽만 반영한다.
- 대량 원고(수백 화) 대비 (설계 판단):
  - 하루 AI 사용량 한도에 걸리면 작업을 실패시키지 않고 'paused'로 바꾸고 "오늘 AI 사용량 한도에 도달해 일시정지했습니다. 내일 이어서 진행하세요."를 남긴다.
  - 가져오기 추출에 쓰는 모델은 `ANTHROPIC_MODEL_IMPORT`로 따로 지정할 수 있다(기본값은 `ANTHROPIC_MODEL`과 같음).
  - 승인 대기 화면은 "카드별 묶음"(카드 생성 제안 아래에 그 카드의 사실 제안을 모아 보여 줌)을 기본으로 하고 "회차별"로 바꿀 수 있다. "이 가져오기의 제안 모두 승인"(AI가 제안한 태그 그대로) 일괄 동작을 둔다.
  - 처리 예상 안내: 시작 전에 "N화, 회차당 AI 호출 1회"를 보여 준다.

### F7 근거 붙은 오기 점검
- 집필 화면의 "회차 점검" 버튼: 저장 → (1) 결정적 표기 점검(naming_rules) + (2) AI 작업 `continuity-check` + (3) AI 작업 `chapter-extract`(새 사실 후보)를 실행.
- `continuity-check` 입력: 원고(문장 번호 포함), F9의 컨텍스트 묶음(관련 카드+사실 id, 열린 떡밥, 직전 회차 요약, 표기 규칙). 출력: issues[{ quote, kind, severity, factId|null, entryName|null, wikiExcerpt, explanation, suggestion }].
- 사후 검증(코드): quote가 원고의 실제 부분 문자열이 아니면 공백 정규화 후 다시 찾고, 그래도 없으면 버린다. factId가 컨텍스트에 없는 id면 null로 바꾸고, factId도 entry 연결도 없으면 버린다(근거 없는 지적 금지).
- 다시 점검하면 그 회차의 'open' 지적은 지우고 새로 만든다(해결된 지적은 유지).
- 점검은 그 회차 position N에서 유효한 사실만 쓴다(유효 범위가 N을 포함하거나 범위가 없는 사실). 프롬프트에 "상태가 바뀌는 전개 자체는 오기가 아니다. N화 시점에 유효한 위키와 설명 없이 어긋날 때만 지적하라"를 넣는다.
- 결과 패널: 지적마다 [원고 문장] ↔ [위키 근거]를 나란히, 설명, 제안. 버튼: 제안대로 고치기(편집기 텍스트에서 해당 문장을 교체, 상태 accepted), 무시(dismissed), 위키를 고침 → "사실 내용 수정" 또는 "이 회차부터 바뀜"(wiki_updated). 원고의 해당 문장은 편집기에서 형광 표시.
- 새 사실 후보는 "승인 모달"로 바로 보여 주고(태그 선택, 승인/거절), 승인 대기 화면에도 남는다.

### F8 주기 점검
- 서비스 `getPeriodicAlerts(workId)`: (a) 회수 목표 회차가 지났는데 열려 있는 떡밥(planted/developing, 최신 회차 position > target), (b) 등장한 적 있는 인물 중 마지막 등장 이후 `absenceThreshold` 회차 이상 안 나온 인물, (c) 7일 넘게 대기 중인 제안 수, (d) 비축분 부족(F15 계산).
- 작품 홈과 작품 목록 카드에 표시. 요청 시 계산(크론 없음).

### F9 필요한 카드만 불러오기
- `buildContextPack(db, workId, { text, position })`:
  1. 원고에서 카드 이름/별칭 언급 찾기 (`findMentions`: 한국어 조사·호격 처리, 단어 시작 경계 확인).
  2. 언급된 카드(언급 수 순), 그 카드의 사실(현재 회차에서 유효한 것만, 확정 우선, 카드당 최대 15개), 선택된 카드 사이의 관계(현재 회차에 유효한 것).
  3. 열린 떡밥(심은 회차 ≤ 현재, 중요도·지연 순 최대 15개), 직전 회차 요약 2개, 표기 규칙.
  4. 전체 약 12,000자 예산 안으로 순위 낮은 것부터 잘라 낸다.
- `renderContextPack(pack)`은 항상 같은 순서로 문자열을 만든다(프롬프트 캐시를 위해).
- 집필 화면 "관련 카드" 패널은 브라우저에서 같은 `findMentions`를 Worker로 돌려 실시간(1초 디바운스) 표시한다.

### F10 관계 그래프
- 화면 `/works/[workId]/wiki/graph`: cytoscape로 카드(노드, 종류별 색)와 관계(엣지, 라벨=kind)를 그린다. 회차 슬라이더(1~최신): 그 회차에 유효한 관계(start ≤ N ≤ end, null은 열림)와 첫 등장 회차 ≤ N인 카드만 보인다(첫 등장 기록이 없는 카드는 항상 표시). 노드 클릭 → 카드 상세 링크, 관계 추가/수정 폼.

### F11 독자 시뮬레이션
- AI 작업 `reader-sim`. 기본 페르소나 4종(코드 상수): 정주행 독자, 가볍게 보는 독자, 장르 매니아, 신규 유입 독자. 입력: 회차 원고 + 직전 요약 3개 + 장르/로그라인. 출력: 페르소나별 { 평점 1~5, 이탈 위험, 순간들[{ quote, reaction('confused'|'bored'|'excited'|'dropoff'|'moved'), comment }], 총평 } + 전체 요약.
- 집필 화면에서 실행, 결과는 `/works/[workId]/reader-sim`에 회차별 기록으로 남는다. quote는 원고 부분 문자열 검증.

### F12 연재 방향 조언
- AI 작업 `direction-advice`. 입력: 열린 떡밥(지연 여부 포함), 인물 상태(최근 등장, 핵심 사실), 최근 회차 요약 5개, 장르/로그라인/시놉시스. 출력: 다음 전개 선택지 3개 { 제목, 요약, 다음 화 비트 3~5개, 사용하는 떡밥, 등장 인물, 위험 } + 경고 목록 + 추천 선택지 번호.
- 화면 `/works/[workId]/advice`: 실행 버튼과 지난 조언 기록.

### F13 초안 작성 (문체 카드 기반)
- 문체 카드 CRUD(위키 탭). "AI로 문체 카드 제안": 인물 이름 근처 대사 줄을 원고에서 모아 AI 작업 `style-suggest` → proposals(type style_card, source 'style').
- 초안: 집필 화면의 "AI 초안" 패널. 입력: 작가 지시(무슨 일이 일어나야 하는지), 목표 분량, 등장 인물 선택. 서버가 문체 카드(작품 + 선택 인물), 컨텍스트 묶음, 직전 회차 요약과 끝부분 1,500자를 넣어 `draft-chapter`를 스트리밍(`POST /api/works/[workId]/draft`).
- 결과는 바로 원고에 쓰지 않는다. 버튼: "새 회차로 만들기"(버전 source 'ai_draft'), "현재 원고 끝에 붙이기"(편집기에만 붙고 저장은 작가가).

### F14 맞춤법, 어색한 표현
- 결정적 규칙 검사(코드 내장, 약 40개 흔한 오류: 되/돼, 안/않, 웬/왠, 며칠, 어떡해, 금세, 오랜만, 희한, 설거지, 일부러, 역할, -ㄹ게, 됐 등)는 즉시 실행.
- AI 작업 `proofread`: 맞춤법·띄어쓰기·문법·어색한 표현 제안 { quote, replacement, kind, reason }. quote 부분 문자열 검증.
- 패널에서 "적용" → 편집기 텍스트 교체. `SpellChecker` 인터페이스로 만들어 나중에 바른(Bareun) 같은 외부 도구를 붙일 수 있게 한다.

### F15 연재 일정 관리
- 화면 `/works/[workId]/schedule`: 월 달력(직접 구현한 격자) + 요약.
- 작품 설정: 연재 요일, 요일당 회차 수, 비축 목표.
- 계산(브라우저): 비축분 = status 'done'이고 아직 연재하지 않은(publishedOn 없음 또는 미래) 회차. 오늘부터 연재 요일 슬롯을 만들고 휴재 기간은 건너뛰며 비축 회차를 배정 → 예상 연재일, 비축 소진일, 경고(비축 < 목표, 3일 안 마감).
- 일정 항목 추가/수정/완료(마감, 휴재 기간, 기타), 회차 "연재함" 표시(publishedOn 설정).

### F16 팀 모드
- 작품 설정 `/works/[workId]/settings`의 팀 탭: 구성원 목록과 역할 변경/제거(owner), 초대 링크 만들기(역할, 7일 만료), 초대 취소. 초대 수락 `/invite/[token]`(로그인 필요, 아니면 로그인 후 돌아옴).
- 코멘트: 집필 화면에서 문장을 선택해 코멘트 달기(quote+위치 저장), 답글, 해결. 편집기에 코멘트 구간 표시.

### F17 작품 보관함과 이어쓰기
- `/works`: 내 작품 카드(제목, 회차 수, 마지막 수정, 승인 대기 수, 열린 떡밥 수, 경고 수) + "새 작품" + 상단 "이어서 쓰기"(마지막 작품/회차).
- `/works/[workId]`(작품 홈): "다음 화 쓰기"(마지막 초안 회차가 있으면 열고, 없으면 다음 position으로 `N화` 생성), 승인 대기 수, 열린 떡밥 요약, 주기 점검 경고, 일정 요약, 최근 변경.
- `/works/[workId]/chapters`: 회차 목록, 새 회차, 위/아래 이동, 상태(초안/완료), 연재일, 보관.
- 승인 대기 `/works/[workId]/approvals`: 제안을 회차/출처별로 묶어 표시, 항목마다 태그 선택·내용 수정·승인/거절, 선택 일괄 승인(기본 태그 적용). 일괄 승인은 의존 순서(entry_create → entry_update → fact_create → thread_create → thread_event → relation_create → chapter_summary → style_card)로 처리.
- 이어쓰기: 회차를 열 때와 편집기 포커스를 잃을 때 user_work_state(마지막 회차, 커서) 저장.

## 6. 화면과 경로

| 경로 | 화면 |
|---|---|
| `/login`, `/signup` | 로그인, 가입 |
| `/works` | 작품 목록 대시보드 (F17) |
| `/works/new` | 새 작품 → 시작 방식 선택(인터뷰 / 원고 가져오기 / 바로 쓰기) |
| `/works/[workId]` | 작품 홈 (F8, F17) |
| `/works/[workId]/interview` | 인터뷰 (F1) |
| `/works/[workId]/import` | 원고 가져오기 (F6) |
| `/works/[workId]/chapters` | 회차 관리 (F17) |
| `/works/[workId]/chapters/[chapterId]` | 집필 화면 (원고 + 관련 카드/떡밥/점검/맞춤법/코멘트/AI 초안 패널 + 승인 모달) |
| `/works/[workId]/chapters/[chapterId]/history` | 원고 버전 이력과 diff (F5) |
| `/works/[workId]/wiki` (+ `entries/[entryId]`, `threads`, `graph`) | 설정 보드 (F2, F3, F4, F10, 표기, 요약, 문체) |
| `/works/[workId]/approvals` | 승인 대기 (F1, F6, F7, F17) |
| `/works/[workId]/history` | 변경 이력, 되돌리기, 내보내기 (F5) |
| `/works/[workId]/schedule` | 연재 일정 (F15) |
| `/works/[workId]/advice` | 연재 방향 조언 (F12) |
| `/works/[workId]/reader-sim` | 독자 시뮬레이션 결과 (F11) |
| `/works/[workId]/settings` | 작품 설정, 팀 (F16) |
| `/invite/[token]` | 초대 수락 (F16) |

작품 안 화면은 왼쪽 사이드바(홈, 집필(최근 회차), 회차, 설정 보드, 승인 대기(개수 배지), 이력, 일정, 방향 조언, 독자 시뮬레이션, 설정)를 공유한다.

API 경로(Route Handler): `/api/auth/[...all]`(Better Auth), `/api/inngest`, `/api/import-jobs/[jobId]/advance`(POST), `/api/import-jobs/[jobId]`(GET 상태), `/api/works/[workId]/export`(GET JSON), `/api/works/[workId]/draft`(POST 스트리밍).

## 7. AI 계층

### 7.1 클라이언트
```ts
interface AiClient {
  provider: 'anthropic' | 'fake'
  generateObject<T>(args: { system: string; prompt: string; schema: ZodType<T>; effort: AiEffort; maxTokens: number; fake: () => T }): Promise<{ object: T; usage: AiUsage; model: string }>
  streamText(args: { system: string; prompt: string; effort: AiEffort; maxTokens: number; fake: () => string }): { textStream: AsyncIterable<string>; final: Promise<{ text: string; usage: AiUsage; model: string }> }
}
```
- `AnthropicAiClient`: `@anthropic-ai/sdk`. 구조화 출력은 `client.messages.parse` + `output_config: { format: zodOutputFormat(schema), effort }`, 결과는 `parsed_output`. 스트리밍은 `client.messages.stream`. 시스템 프롬프트에 `cache_control: { type: 'ephemeral' }`. 모델이 opus/fable/sonnet 5.5 계열이면 서버 측 대체 모델(`fallbacks: 'default'`, 베타 `server-side-fallback-2026-07-01`)을 켠다(SDK 타입이 지원하는 경우). `stop_reason`이 `refusal`/`max_tokens`면 `AI_ERROR`.
- `FakeAiClient`: 각 작업이 함께 정의한 `fake(input)`을 호출해 결정적인 예시 출력을 돌려준다. 테스트와 데모 모드에서 사용. 토큰 수는 0.
- 선택: `AI_PROVIDER` 환경변수(`anthropic`|`fake`). 없으면 `ANTHROPIC_API_KEY`가 있을 때 anthropic, 아니면 fake. 데모 모드일 때 화면 상단에 "AI 데모 모드" 배너.
- 모델: `ANTHROPIC_MODEL`(기본 `claude-opus-5-5`). 원고 가져오기 추출만 `ANTHROPIC_MODEL_IMPORT`로 따로 지정 가능(기본값 = `ANTHROPIC_MODEL`). 비용 때문에 기본 모델을 낮추지 않는다(그것은 사용자 결정).
- 구조화 출력 스키마 제약: 객체/배열/문자열/숫자/불리언/enum/nullable만 쓴다. min/max/regex/default 금지. 모든 필드는 required로 두고 선택값은 nullable.

### 7.2 실행기 `runAiTask`
1. 사용량 확인: 오늘(한국 시간 자정 기준) 해당 사용자의 ai_runs 토큰 합이 `AI_DAILY_TOKEN_LIMIT`(기본 3,000,000, 0이면 무제한) 이상이면 `AI_LIMIT`.
2. ai_runs에 running 행 삽입 → 클라이언트 호출 → 작업별 사후 처리(postProcess) → ai_runs done(토큰, 모델, 출력) → 결과 반환. 실패 시 ai_runs error 후 `AI_ERROR`("AI 호출에 실패했습니다: ...").

### 7.3 작업 목록

| 작업 | 기능 | effort | 출력 |
|---|---|---|---|
| `interview-question` | F1 | low | { topic, question, rationale } |
| `interview-extract` | F1 | medium | 제안 목록(entry_create/entry_update/fact_create/thread_create/relation_create) |
| `chapter-extract` | F6, F7 | medium | { summary, entries[], facts[], threads[], relations[] } → 제안 |
| `continuity-check` | F7 | high | issues[] |
| `proofread` | F14 | medium | suggestions[] |
| `reader-sim` | F11 | medium | personas[], summary |
| `direction-advice` | F12 | high | options[3], warnings[], recommended |
| `draft-chapter` | F13 | high | 스트리밍 텍스트 |
| `style-suggest` | F13 | medium | { name, tone, rules, examples } |

모든 프롬프트는 한국어 출력, "추측은 [가정]으로", "원고에 없는 내용은 지어내지 말 것", "근거 문장은 원고에서 그대로 인용"을 명시한다. 원고와 위키는 `<manuscript>`, `<wiki>` 같은 태그로 감싸 지시문과 구분한다.

## 8. 브라우저 처리 (Web Worker + IndexedDB)

- `src/workers/text.worker.ts`(Comlink로 노출): `parseFile`, `splitChapters`, `diffTexts`, `buildBackupZip`, `findMentions`, `buildSearchIndex`/`search`, `computeSchedule`. 실제 로직은 `src/lib/*` 순수 함수에 두고 Worker는 얇게 감싼다(테스트는 순수 함수로).
- `getTextWorker()`: 지연 생성 싱글톤. Worker를 못 쓰면 같은 함수를 메인 스레드에서 실행.
- IndexedDB(`idb`): `drafts`(chapterId → { title, body, savedAt, baseVersion }), `kv`(UI 상태).
- 자동 저장: 편집 → 0.5초 디바운스로 IndexedDB 저장 → 3초 디바운스(및 blur, 페이지 숨김)로 서버 저장(`saveChapter`, expectedVersion 포함). 서버 버전이 더 새로우면 `CONFLICT` → "다른 곳에서 수정된 원고가 있습니다" 안내와 선택(내 것으로 덮기 / 서버 것 불러오기). 페이지를 열 때 IndexedDB 초안이 서버보다 새로우면 복구 제안.
- 편집기: `<textarea>` 기반(한글 IME 안정성, 설계 판단) + 같은 글꼴/줄바꿈의 배경 레이어에 형광 표시(오기 지적, 맞춤법, 코멘트, 독자 반응). textarea는 내용 높이에 맞춰 늘어나 내부 스크롤이 없게 해 배경 레이어와 정렬을 단순하게 유지한다. 글자 수(공백 포함/제외, 목표 대비 %) 표시.

## 9. 한글 처리 (`src/lib/korean`)
- `countChars(text)`: 공백 포함 = 줄바꿈(\r, \n) 제외 모든 코드 포인트, 공백 제외 = 모든 공백 문자 제외.
- `stripJosa(word)`: 끝의 조사(은/는/이/가/을/를/의/에/에게/에서/와/과/로/으로/도/만/께/께서/한테/랑/이랑/나/이나/야/아/여/이여/부터/까지/처럼/보다/조차/마저/라도/이라도 등) 제거.
- `findMentions(text, entries)`: 이름/별칭(2자 이상) 출현 위치 중 앞 글자가 한글·영문·숫자가 아닌 곳(단어 시작)만 인정. 뒤에 조사나 호격 '아/야', 받침 이름 뒤 '이'(+조사)가 와도 인정. 결과: [{ entryId, count, firstIndex }].
- `splitSentences(text)`: 마침표류(. ! ? …)와 닫는 따옴표, 줄바꿈 기준 문장 분리, 위치 포함.
- `findNamingIssues(text, rules)`: variants 출현 위치와 바꿀 표기.
- `ruleBasedSpellcheck(text)`: 내장 규칙 결과(quote, replacement, reason, 위치).

## 10. 백그라운드 작업 (Inngest)
- `inngest` 클라이언트 id `daeumhwa`. 함수 `import-run`(이벤트 `import/run`, data { jobId }): 최대 2,000회 반복하며 `step.run('advance-<i>')`로 `advanceImportJob` 호출, done/stopped면 종료.
- `/api/inngest` 라우트에 serve. 설정이 없으면 이 경로는 비활성 응답.

## 11. 보안과 운영
- 모든 서버 액션과 라우트: 세션 확인 → 역할 확인 → zod 입력 검증.
- 초대 토큰: 32바이트 무작위 base64url.
- AI 키는 서버 환경변수에만. 클라이언트 번들에 노출 금지.
- 환경변수: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_IMPORT`, `AI_PROVIDER`, `AI_DAILY_TOKEN_LIMIT`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_DEV`. `.env.example`에 설명.
- 마이그레이션: `drizzle/` SQL 파일. `pnpm db:migrate`(대상 DB에 적용). 로컬은 `pnpm dev` 전에 자동으로 `db:migrate`가 돈다(predev).
- AI를 부르는 페이지/라우트는 `export const maxDuration = 300`(Vercel 무료 플랜 상한)을 둔다.
- 배포(Vercel/Neon/Inngest 계정 연결)는 계정 접근 권한이 없어 이번 구현 범위에서 빼고, README에 절차를 쓴다. 이번 완료 기준은 로컬 개발 서버와 프로덕션 빌드에서의 동작이다.

## 12. 테스트 전략
- 순수 함수(`src/lib/**`): 단위 테스트.
- 서비스(`src/server/**`): PGlite 메모리 DB 통합 테스트 (`createTestDb()`가 마이그레이션 적용). 권한 거부, 이력 기록, 회차 순서 규칙 같은 규칙을 반드시 테스트.
- AI 작업: FakeAiClient로 흐름 테스트 + 사후 검증 로직 단위 테스트(부분 문자열 아닌 quote 제거 등).
- E2E(Playwright, 데모 모드): 가입 → 작품 생성 → 회차 작성 → 회차 점검 → 제안 승인 → 위키 확인 / txt 가져오기 / 그래프 표시 / 내보내기.
- AI 정확도 평가 도구(기획서 11장 검증 계획 3번): 직접 지어낸 10화 분량의 한국어 예제 원고(`eval/fixtures/`)에 일부러 넣은 설정 오류, 떡밥, 표기 오류의 정답표를 두고, `pnpm eval:continuity`가 실제 API로 점검을 돌려 적중률과 오탐률을 출력한다. `ANTHROPIC_API_KEY`가 없으면 안내만 하고 끝난다. 실제 모델 품질 조정은 키와 예산이 생긴 뒤의 일이다.
- 완료 기준: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, E2E 모두 통과.

## 13. 설계자가 정한 것 (사용자 확인용 목록)
1. 인물·장소·세계관을 `wiki_entries` 한 테이블로 합침 (기획서의 characters/world_entries 분리 대신).
2. 떡밥 상태에 '계획됨(planned)' 추가.
3. 편집기는 textarea + 형광 배경 레이어 (리치 텍스트 편집기 대신, 한글 입력 안정성 우선).
4. 원고 버전은 같은 사용자가 10분 안에 다시 저장하면 한 버전으로 합침.
5. AI 기본 모델 `claude-opus-5-5` (환경변수로 바꿀 수 있음), 키가 없으면 데모 모드.
6. 맞춤법은 내장 규칙 + AI. 외부 검사기는 연결 자리만.
7. 지원 파일 형식 txt/md/docx. HWP 제외.
8. 백그라운드 작업은 Inngest(선택) + 브라우저 진행 방식.
9. 사용량 제한 기본값: 사용자당 하루 300만 토큰.
10. 폰트 패키지 없이 시스템 한글 폰트 사용.
11. 사실에 유효 회차 범위와 "N화부터 바뀜"(대체) 추가.
12. 대량 가져오기: 한도 도달 시 자동 일시정지, 가져오기 전용 모델 환경변수, 카드별 묶음 승인.
13. 실제 AI 품질은 평가 도구까지만 만들고, 키가 생기면 조정한다.
14. 배포는 이번 범위에서 제외(README 안내).

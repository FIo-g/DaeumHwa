# 다음화 (DaeumHwa)

장기 연재 웹소설 작가를 위한 **설정 위키 + AI 연재 파트너**입니다. 인물, 장소, 설정 규칙과 떡밥을 한 곳에 모아 두고, 회차를 쓸 때와 발행 전에 설정 충돌과 복선 누락을 점검합니다.

AI는 위키를 직접 고치지 않습니다. AI가 낸 변경은 제안으로만 올라오고, 작가가 승인해야 위키에 반영됩니다. 모든 위키 변경은 이력으로 남습니다.

자세한 설계는 `docs/superpowers/specs/2026-10-16-daeumhwa-mvp-design.md` 를 봅니다.

## 주요 기능

- **설정 보드**: 인물, 장소, 세계관 규칙, 별칭과 이름 규칙을 관리합니다.
- **집필 화면**: 원고 편집, 자동 저장, 오프라인 임시 저장, 버전 이력.
- **회차 점검**: 설정과 맞지 않는 문장, 이름 표기 차이, 떡밥 회수 누락을 찾습니다.
- **떡밥 장부와 관계도**: 복선을 심은 회차와 회수 목표 회차를 추적하고, 인물 관계를 그래프로 봅니다.
- **승인 대기와 이력**: AI 제안을 검토하고, 누가 무엇을 바꿨는지 봅니다.
- **인터뷰와 원고 가져오기**: 질문에 답해 설정을 만들거나, 기존 원고(`.txt`, `.md`, `.docx`)를 회차 단위로 나눠 설정을 추출합니다.
- **일정, 방향 조언, 독자 시뮬레이션**: 연재 일정, 다음 회차 방향 제안, 독자 반응 예측.
- **백업 내보내기와 팀 초대**: 작품 전체를 zip으로 내려받고, 편집자나 독자를 초대 링크로 부릅니다.

HWP 파일은 지원하지 않습니다. 실시간 동시 편집도 아직 없습니다.

## 요구 사항

- Node 24
- pnpm 12 (`packageManager` 필드에 고정되어 있습니다)
- 로컬 실행에는 별도 데이터베이스가 필요 없습니다. PGlite 파일 DB(`.data/pglite`)를 씁니다.

## 설치와 실행

```bash
pnpm install
cp .env.example .env.local   # 값을 채웁니다 (아래 환경변수 참고)
pnpm dev                     # http://localhost:3000
```

`pnpm dev` 와 `pnpm start` 는 실행 전에 `pnpm db:migrate` 를 먼저 돌립니다.

### 환경변수

| 이름 | 설명 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 로그인 세션 암호화 키. 32자 이상 무작위 문자열 |
| `BETTER_AUTH_URL` | 앱 공개 주소. 로컬은 `http://localhost:3000` |
| `AUTH_RATE_LIMIT` | `off` 면 로그인·가입 요청 제한을 끕니다. 제한은 운영 빌드에서 IP당 10초에 3회로 걸립니다. e2e 테스트 전용이며 비워 둡니다 |
| `DATABASE_URL` | Postgres 연결 주소. 없으면 PGlite 파일 DB를 씁니다 |
| `PGLITE_DATA_DIR` | PGlite 데이터 폴더. 기본값은 `.data/pglite` |
| `ANTHROPIC_API_KEY` | Anthropic API 키. 서버에서만 읽습니다 |
| `ANTHROPIC_MODEL` | 기본 AI 모델. 기본값은 `claude-opus-5-5` |
| `ANTHROPIC_MODEL_IMPORT` | 원고 가져오기 전용 모델. 없으면 `ANTHROPIC_MODEL` |
| `AI_PROVIDER` | `fake` 면 키가 있어도 데모 응답을 씁니다. `anthropic` 이면 키가 없을 때도 실제 AI 모드로 둡니다. 비워 두면 키 유무로 정합니다 |
| `AI_DAILY_TOKEN_LIMIT` | 사용자당 하루 AI 토큰 한도. 기본값은 3,000,000 |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | 원고 가져오기 백그라운드 작업용 (선택). 서명 키는 운영 환경에서만 씁니다 |
| `INNGEST_DEV` | `1` 이면 Inngest 로컬 개발 서버를 씁니다 (선택) |

### 데모 모드와 실제 AI

- `ANTHROPIC_API_KEY` 가 없거나 `AI_PROVIDER=fake` 이면 **데모 모드**로 동작합니다. 모든 화면과 흐름은 쓸 수 있고, AI 응답은 미리 정해진 예시입니다. 화면 위에 데모 안내 배너가 뜹니다.
- 실제 AI를 쓰려면 `ANTHROPIC_API_KEY` 를 설정합니다. 원고 가져오기만 다른 모델을 쓰게 하려면 `ANTHROPIC_MODEL_IMPORT` 를 설정합니다.
- 원고 가져오기는 Inngest 키가 없으면 브라우저가 50화 단위로 나눠 단계별로 진행합니다. 키가 있으면 백그라운드에서 진행합니다.

## 명령어

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 (먼저 DB 마이그레이션) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 프로덕션 서버 (먼저 DB 마이그레이션) |
| `pnpm db:migrate` | DB 마이그레이션 적용 |
| `pnpm db:generate` | `src/db/schema.ts` 변경 후 마이그레이션 파일 생성 |
| `pnpm test` | 단위 테스트 (Vitest) |
| `pnpm typecheck` | 타입 검사 |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier 포맷 |

## 테스트

```bash
pnpm test                     # 전체
pnpm vitest run src/server    # 경로로 일부만
```

테스트는 각 파일 옆에 `*.test.ts(x)` 로 둡니다. 서비스 테스트는 메모리 PGlite(`createTestDb`)를 쓰고, AI는 `FakeAiClient` 로 대체합니다. 테스트에서 실제 AI API를 호출하지 않습니다.

## 배포

배포 대상은 Vercel과 Neon(Postgres)을 기준으로 합니다.

1. Neon에 Postgres 데이터베이스를 만들고 연결 주소를 `DATABASE_URL` 로 설정합니다.
2. Vercel 프로젝트의 환경변수에 `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`(배포 주소), `DATABASE_URL`, `ANTHROPIC_API_KEY` 등을 넣습니다. 키를 넣지 않으면 데모 모드로 뜹니다.
3. 빌드 명령을 `pnpm db:migrate && pnpm build` 로 설정합니다.
4. (선택) Inngest를 쓰려면 `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` 를 설정하고, Inngest 대시보드에서 `/api/inngest` 주소를 동기화합니다.

## 프로젝트 구조

```
src/
  app/          Next.js 라우트 (페이지, 라우트 핸들러)
  server/       도메인 서비스 (fn(db, actor, input)) 와 server actions
  db/           Drizzle 스키마, DB 연결, 타입
  ai/           AI 클라이언트 (Anthropic / Fake), 작업 정의, 실행기
  lib/          순수 유틸리티 (한글 처리, 가져오기 파싱, 날짜, 백업 등)
  workers/      원고 나누기 등 무거운 작업용 Web Worker
  components/   화면 컴포넌트 (ui/ 는 shadcn 기반)
  inngest/      백그라운드 작업 정의
docs/superpowers/   설계 명세와 구현 계획
drizzle/            마이그레이션 파일
```

## 알려진 한계

- HWP, HWPX 파일 가져오기는 지원하지 않습니다. `.txt`, `.md`, `.docx` 만 됩니다.
- 여러 명이 같은 원고를 실시간으로 함께 편집하지 않습니다.
- 위키 변경은 작가 작업이나 승인된 제안으로만 반영됩니다. AI가 직접 위키를 고치지 않습니다.

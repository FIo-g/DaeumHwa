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

`pnpm dev` 와 `pnpm start` 는 실행 전에 `pnpm db:migrate` 를 먼저 돌립니다. `pnpm db:migrate` 도 `.env.local`, `.env` 를 읽습니다. 셸에 직접 지정한 값이 파일 값보다 우선합니다.

### 환경변수

| 이름                                       | 설명                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                       | 로그인 세션 암호화 키. 32자 이상 무작위 문자열                                                                                                        |
| `BETTER_AUTH_URL`                          | 앱 공개 주소. 로컬은 `http://localhost:3000`                                                                                                          |
| `AUTH_RATE_LIMIT`                          | `off` 면 로그인·가입 요청 제한을 끕니다. 제한은 운영 빌드에서 IP당 10초에 3회로 걸립니다. e2e 테스트 전용이며 비워 둡니다                             |
| `DATABASE_URL`                             | Postgres 연결 주소. 없으면 PGlite 파일 DB를 씁니다. Vercel에서는 필수이며 Production·Preview 모두에 설정합니다                                        |
| `PGLITE_DATA_DIR`                          | PGlite 데이터 폴더. 기본값은 `.data/pglite`                                                                                                           |
| `ANTHROPIC_API_KEY`                        | Anthropic API 키. 서버에서만 읽습니다                                                                                                                 |
| `ANTHROPIC_MODEL`                          | Anthropic 기본 AI 모델. 기본값은 `claude-haiku-5-5`                                                                                                   |
| `ANTHROPIC_MODEL_IMPORT`                   | Anthropic 원고 가져오기 전용 모델. 없으면 `ANTHROPIC_MODEL`                                                                                           |
| `OPENCODE_API_KEY`                         | OpenCode Go API 키. 서버에서만 읽습니다. `Authorization: Bearer` 로 보냅니다                                                                          |
| `OPENCODE_MODEL`                           | OpenCode Go 기본 AI 모델. 기본값은 `claude-haiku-5-5`. Anthropic 형식과 OpenAI(Responses) 형식 모델을 모두 씁니다. 형식은 모델 이름으로 자동 정합니다 |
| `OPENCODE_MODEL_IMPORT`                    | OpenCode Go 원고 가져오기 전용 모델. 없으면 `OPENCODE_MODEL`                                                                                          |
| `OPENCODE_BASE_URL`                        | OpenCode Go Anthropic 형식 주소 재정의. 기본값은 `https://opencode.ai/inference/go/anthropic`                                                         |
| `OPENCODE_OPENAI_BASE_URL`                 | OpenCode Go OpenAI(Responses) 형식 주소 재정의. 기본값은 `https://opencode.ai/inference/go/openai/v1`                                                 |
| `OPENCODE_API_FORMAT`                      | `anthropic` 또는 `responses` 로 모든 OpenCode 모델의 API 형식을 강제합니다. 비우면 모델 이름으로 정합니다. 다른 값은 무시합니다                       |
| `AI_PROVIDER`                              | `anthropic`, `opencode` 중 하나를 강제합니다. 그 밖의 값은 무시합니다. 비워 두면 `ANTHROPIC_API_KEY`, 다음으로 `OPENCODE_API_KEY` 유무로 정합니다     |
| `AI_DAILY_TOKEN_LIMIT`                     | 사용자당 하루 AI 토큰 한도. 기본값은 3,000,000                                                                                                        |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | 원고 가져오기 백그라운드 작업용 (선택). `INNGEST_DEV` 를 쓰지 않으면 서명 키도 필요합니다                                                             |
| `INNGEST_DEV`                              | `1` 이면 Inngest 로컬 개발 서버를 씁니다 (선택). `1` 이외의 값(`true` 등)은 인식하지 않습니다                                                         |

### AI 공급자

- `ANTHROPIC_API_KEY` 와 `OPENCODE_API_KEY` 가 모두 없으면 AI 기능은 쓸 수 없습니다. AI 기능을 실행하면 `AI 키가 설정되지 않아 AI 기능을 쓸 수 없습니다.` 메시지가 뜨고, 화면 상단에는 `AI 키가 설정되지 않았습니다. ANTHROPIC_API_KEY 또는 OPENCODE_API_KEY를 설정하면 AI 기능을 쓸 수 있습니다.` 안내가 뜹니다. 나머지 화면은 그대로 쓸 수 있습니다.
- AI를 쓰려면 `ANTHROPIC_API_KEY` 또는 `OPENCODE_API_KEY` 중 하나를 설정합니다. 둘 다 있으면 Anthropic을 씁니다. OpenCode를 우선하려면 `AI_PROVIDER=opencode` 를 설정합니다.
- 기본 모델은 두 공급자 모두 `claude-haiku-5-5` 입니다. 원고 가져오기만 다른 모델을 쓰게 하려면 `ANTHROPIC_MODEL_IMPORT` 또는 `OPENCODE_MODEL_IMPORT` 를 설정합니다.
- OpenCode Go 는 두 가지 API 형식을 씁니다. Anthropic 호환(`/v1/messages`)과 OpenAI Responses(`/responses`)입니다. 호출마다 모델 이름으로 형식을 고르므로, `OPENCODE_MODEL` 과 `OPENCODE_MODEL_IMPORT` 가 서로 다른 형식이어도 됩니다. `OPENCODE_API_FORMAT` 으로 모든 모델의 형식을 강제할 수 있습니다.
- Anthropic 형식 모델: `claude-haiku-5-5`, `qwen3.8-flash`, `qwen3.8-max`, `minimax-m3`, `qwen3.7-plus`. 게이트웨이가 구조화 출력(`output_config`)을 거부하거나 JSON이 아닌 답을 주면 한 번 JSON 텍스트 모드로 다시 요청합니다. `qwen3.7-plus` 는 처음부터 JSON 텍스트 모드로 요청합니다.
- OpenAI Responses 형식 모델: `gpt-6-luna`, `gpt-5.6-luna`, `grok-4.7`, `muse-spark-1.3-contributor`, `muse-spark-1.2-contributor`. 이름이 `gpt-`, `grok-`, `muse-` 로 시작하면 이 형식으로 보냅니다. 구조화 출력이 거부되면 JSON 텍스트 모드로, 추론 설정(`reasoning`)이 거부되면 추론 설정 없이 한 번 다시 요청합니다.
- **모델 학습 주의**: `*-contributor` 모델(`muse-spark-1.3-contributor`, `muse-spark-1.2-contributor`)은 보낸 프롬프트와 응답이 모델 학습에 쓰일 수 있습니다(ZDR 아님). 공개 전 원고나 설정을 보낸다면 다른 모델을 쓰세요. 기본 모델 또는 가져오기 모델이 이런 모델이면 화면 상단에 경고가 뜹니다. `claude-haiku-5-5`, `gpt-6-luna`, `gpt-5.6-luna`, `grok-4.7` 은 학습에 쓰지 않고 30일 보관합니다.
- Muse Spark 모델은 지역 제한이 있습니다. 한국에서의 제공 여부는 확인되지 않았습니다. 호출이 실패하면 다른 모델을 쓰세요.
- `gemini-4-argon-contributor` 같은 Gemini Contributor 모델도 학습 경고 대상이지만, 이 앱의 형식 자동 선택 목록에는 없습니다.
- 원고 가져오기는 Inngest 키가 없으면 브라우저가 50화 단위로 나눠 단계별로 진행합니다. 키가 있으면 백그라운드에서 진행합니다.

## 명령어

| 명령               | 설명                                              |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | 개발 서버 (먼저 DB 마이그레이션)                  |
| `pnpm build`       | 프로덕션 빌드                                     |
| `pnpm start`       | 프로덕션 서버 (먼저 DB 마이그레이션)              |
| `pnpm db:migrate`  | DB 마이그레이션 적용                              |
| `pnpm db:generate` | `src/db/schema.ts` 변경 후 마이그레이션 파일 생성 |
| `pnpm test`        | 단위 테스트 (Vitest)                              |
| `pnpm typecheck`   | 타입 검사                                         |
| `pnpm lint`        | ESLint                                            |
| `pnpm format`      | Prettier 포맷                                     |

## 테스트

```bash
pnpm test                     # 전체
pnpm vitest run src/server    # 경로로 일부만
```

테스트는 각 파일 옆에 `*.test.ts(x)` 로 둡니다. 서비스 테스트는 메모리 PGlite(`createTestDb`)를 쓰고, AI는 `@/test/fake-ai` 의 `FakeAiClient` 로 대체합니다. 작업별 고정 응답은 `@/test/ai-fakes` 에 있습니다. 테스트에서 실제 AI API를 호출하지 않습니다.

### E2E와 AI 스텁

- `pnpm e2e` 는 실제 모델을 쓰지 않습니다. `e2e/ai-stub` 의 로컬 HTTP 서버(`pnpm e2e:ai-stub`, 포트 3199)가 Anthropic Messages API를 흉내 내고, 요청한 작업에 맞는 고정 응답을 돌려줍니다.
- Playwright가 스텁을 먼저 띄우고, 앱은 `AI_PROVIDER=anthropic`, `ANTHROPIC_BASE_URL=http://127.0.0.1:3199` 와 더미 키 `e2e-stub` 으로 뜹니다.

## 배포

배포 대상은 Vercel과 Neon(Postgres)을 기준으로 합니다.

1. Neon에 Postgres 데이터베이스를 만들고 연결 주소를 `DATABASE_URL` 로 설정합니다.
2. Vercel 프로젝트의 환경변수에 `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`(배포 주소), `DATABASE_URL`, `ANTHROPIC_API_KEY` 또는 `OPENCODE_API_KEY` 등을 넣습니다. `DATABASE_URL` 은 Production 뿐 아니라 Preview 환경에도 넣어야 합니다. 없으면 DB 오류로 실패합니다. 키를 넣지 않으면 AI 기능만 쓸 수 없습니다.
3. 빌드 명령을 `pnpm db:migrate && pnpm build` 로 설정합니다.
4. (선택) Inngest를 쓰려면 `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` 를 설정하고, Inngest 대시보드에서 `/api/inngest` 주소를 동기화합니다.

## 프로젝트 구조

```
src/
  app/          Next.js 라우트 (페이지, 라우트 핸들러)
  server/       도메인 서비스 (fn(db, actor, input)) 와 server actions
  db/           Drizzle 스키마, DB 연결, 타입
  ai/           AI 클라이언트 (Anthropic / OpenCode / OpenAI Responses), 작업 정의, 실행기
  test/         테스트 전용 가짜 AI (앱 코드에서 가져오지 않습니다)
  lib/          순수 유틸리티 (한글 처리, 가져오기 파싱, 날짜, 백업 등)
  workers/      원고 나누기 등 무거운 작업용 Web Worker
  components/   화면 컴포넌트 (ui/ 는 shadcn 기반)
  inngest/      백그라운드 작업 정의
e2e/            Playwright E2E 테스트와 AI 스텁 서버 (e2e/ai-stub)
docs/superpowers/   설계 명세와 구현 계획
drizzle/            마이그레이션 파일
```

## 알려진 한계

- HWP, HWPX 파일 가져오기는 지원하지 않습니다. `.txt`, `.md`, `.docx` 만 됩니다.
- 여러 명이 같은 원고를 실시간으로 함께 편집하지 않습니다.
- 위키 변경은 작가 작업이나 승인된 제안으로만 반영됩니다. AI가 직접 위키를 고치지 않습니다.

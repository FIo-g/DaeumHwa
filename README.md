# 다음화 (DaeumHwa)

웹소설 작가를 위한 설정 위키와 연재 일관성 점검 도구입니다. 자세한 설계는 `docs/superpowers/specs/` 를 봅니다.

## 개발 환경

- Node 24, pnpm 12
- 로컬 DB는 PGlite 파일(`.data/pglite`)을 쓰므로 별도 DB 설치가 필요 없습니다.
- 환경변수는 `.env.example` 을 참고해 `.env.local` 을 만듭니다. `AI_PROVIDER=fake` 면 AI 키 없이 데모 모드로 동작합니다.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## 배포

이번 범위에서는 배포하지 않습니다. 로컬 개발 서버와 프로덕션 빌드에서 동작하는 것이 기준입니다.

# OpenCode 시작 프롬프트

아래 블록을 그대로 붙여 넣는다.

```text
다음화(DaeumHwa) 저장소의 "가벼운 직렬 하네스" 작업을 이어서 해 줘. 저장소는 /Users/taehyeong/Documents/GitHub/DaeumHwa, 브랜치는 feat/lean-harness다.

먼저 읽을 것:
1. AGENTS.md, CLAUDE.md (저장소 규칙)
2. docs/superpowers/handoff/2026-10-25-lean-harness-stage2/README.md (지금 상태, 할 일 순서, Claude Code 없이 평가를 돌리는 법, 지켜야 할 규칙)
3. docs/superpowers/plans/2026-10-20-lean-harness-stage2.md 의 "Measurement M2 (orchestrator)" 절
4. docs/eval/harness/2026-10-21-stage1.md (결과 문서의 형식과 M1 비교값)

할 일은 README의 "To do, in order" 1~4번이다.
1. 측정 워크트리 ../DaeumHwa-s2 에서 남은 실행 3개를 끝낸다. 실행이 끝나면 검토서를 쓴다.
   - s2fb: 실행은 끝났고 검토만 남았다.
   - s2mns: 말투를 끈 3화 실행이다. 인터뷰 답을 기다리고 있다.
   - s2l: Luna 재측정이다. 아직 시작하지 않았다.
2. 계획서의 채택 규칙으로 채택 여부를 정한다.
3. 결과 문서 docs/eval/harness/2026-10-24-stage2-ledger.md 를 한국어로 쓴다.
4. 워크트리의 새 docs 폴더를 메인 체크아웃으로 옮겨 커밋하고, 워크트리를 지운다.
5번(단계 3)은 내가 따로 말할 때까지 시작하지 마.

꼭 지킬 것:
- 평가 명령은 ../DaeumHwa-s2 에서 실행한다. 그래야 그 폴더의 .env.local 이 읽힌다. 측정은 한 번에 2개까지만 돌린다.
- 대기 중인 항목(pending.json)에는 eval/novel/agents/author.md 대로 답한다.
- 검토는 eval/novel/agents/reviewer.md 를 따른다. 블라인드 폴더와 그 지침만 받은 새 서브에이전트에게 맡긴다. 검토자에게 모델 이름을 알려 주지 않는다.
- 호출이 5분 넘게 첫 토큰 없이 멈추거나 "취소했습니다." 오류가 나면 게이트웨이 장애다. 상태를 확인하고 기다린다. 그런 실행은 새 날짜 폴더로 다시 돌리고 비교에 섞지 않는다.
- git add -A 나 git add . 는 쓰지 않는다. 파일 이름으로 추가한다.
- push 하지 않는다. push 가 필요하면 나에게 알린다.
- 패키지를 추가, 삭제, 업그레이드하지 않는다.
- 테스트는 바꾼 경로만, --maxWorkers=2 로 돌린다.
- 로컬 모델은 돌리지 않는다.
- 크게 되돌려야 할 때는 먼저 나에게 묻는다.
- 나에게 하는 말은 한국어로 짧게 한다. 끝나면 실행별 숫자, 결정, 커밋 해시를 보고한다.
```

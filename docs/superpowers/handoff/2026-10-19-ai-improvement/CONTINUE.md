/superpowers:brainstorming 이전 세션에서 이어서 진행한다. 먼저 `docs/superpowers/handoff/2026-10-19-ai-improvement/README.md`를 읽고, `docs/eval/novel/follow-up-ai-improvement.md`와 `survey/*.md`를 훑어라.

상태: 후속 과제 A~J와 하네스 보강을 20개 트랙으로 나눠 조사했다(조사 워크플로 wf_f22cee2a-947, 조사원 결과 95건 저장됨, 브리프 작성 단계에서 중단). 브랜치는 cloud(main에서)와 local(cloud 끝에서)로 나눈다. 모델 배치는 구현 haiku, 트랙별 검토 haiku, 통합 sonnet, 전체 검토 opus. 재평가와 로컬 모델 실행은 나중에 한다. 동시 실행 상한은 settings.json의 env로 22로 올려 두었다(재시작 후 적용, 워크플로 로그에서 `concurrent agent gate = 22` 확인).

할 일:
1. 위 조사 워크플로를 `resumeFromRunId`로 이어서 끝까지 실행한다. 캐시가 없으면 README의 BRIEF_DIR 안내대로 경로를 고쳐 다시 돌린다.
2. 결과(트랙 브리프, 파일 충돌 목록, 웨이브 계획, 가드 API, 누락 점검)로 스펙 `docs/superpowers/specs/2026-10-19-ai-improvement-design.md`를 쓰고 커밋한 뒤 내게 검토를 요청한다. 설계는 아직 승인 전이니 코드는 건드리지 마라.
3. 승인 뒤 writing-plans로 플랜을 쓰고, 실행 방식은 내게 묻는다. 실행은 다이나믹 워크플로를 최대한 크게, 가능한 한 병렬로 한다.

주의: `git add -A`는 쓰지 말고 파일을 이름으로 추가한다. 사용자에게 보이는 문구는 한국어, 식별자와 주석은 영어.

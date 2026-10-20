# 경량 모델 소설 평가: 진행 상황과 이어하기 안내

다음화의 AI 기능을 경량 모델로 돌렸을 때 어디가 부족한지 같은 조건으로 재는 평가다. 앱의 실제 서비스(인터뷰, 초안, 맞춤법, 설정 추출, 연속성 검사, 독자 시뮬레이션)를 거쳐 소설 1화를 만든다. 작가 역할과 검토는 Sonnet이 맡는다.

- 설계서: `docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md`
- 채점 기준: `docs/eval/novel-quality-criteria.md` (조사 원문은 `docs/eval/research/2026-10-18-novel-quality/`)
- 구현 계획: `docs/superpowers/plans/2026-10-18-lightweight-model-novel-eval.md`
- 로컬 모델 설정 기록: `docs/eval/novel/model-setup.md`
- 하네스 코드: `eval/novel/`, 저장 워크플로: `.claude/workflows/novel-eval.js`
- **이번 결과 비교 요약:** `docs/eval/novel/2026-10-18/summary.md`
- **후속 과제 (AI 응답 개선):** `docs/eval/novel/follow-up-ai-improvement.md`

## 1. 현재 상황 (2026-10-19 기준)

실행 날짜 폴더는 `2026-10-18`이고, 모든 실행이 1화짜리다.

| 모델 | 한국어 | 영어 | 비고 |
|---|---|---|---|
| qwen3.8 27B (로컬, MLX) | 완료 | 완료 | 한 화 처리 84~98분 |
| gpt-oss 20B (로컬, GGUF) | 완료 (2026-10-19) | **미실행** | 한국어 1화 모델 시간 149분, 일부 저전력 모드 |
| exaone3.5 32B (로컬, GGUF) | **미실행** | **미실행** | 다음에 이어서 돌림 |
| Haiku 5.5 (클라우드) | 완료 | 완료 | effort high |
| GPT 6 Luna (클라우드) | 완료 | 완료 | effort high |

결과가 있는 곳은 두 군데다.
- 실행별 검토서와 비교 요약: `docs/eval/novel/2026-10-18/` (커밋됨)
- 원본 기록: `eval/results/novel/2026-10-18/run-NN-<lang>/` (gitignore, 이 맥에만 있음)
  - 폴더 이름의 NN은 모델 순서 번호다: 01 qwen, 02 gpt-oss, 03 exaone, 04 Haiku, 05 Luna.
  - 작가와 검토자가 모델을 모르게 하려고 폴더 이름에 모델 이름을 넣지 않았다.

## 2. 그동안 정한 것 (사용자 결정)

- **클라우드 effort는 high.** 시험 운행에서 Haiku를 `max`로 돌렸더니 출력 한도 32,000토큰을 생각에 다 써서 초안이 잘렸다. 로컬은 최대로 둔다(qwen 생각 모드, gpt-oss `high`).
- **모든 모델 1화까지.** qwen 1화에 모델 시간만 152분이 걸려서 정했다. 그래서 연재 조언과 인물 문체 제안은 이번 평가에 나오지 않는다. 둘 다 2화부터 도는 기능이다.
- **오늘은 qwen까지.** gpt-oss와 exaone은 나중에 이어서 돌린다.
- **시험 운행 결과 재사용.** 설정이 본 실행과 같은 시험 운행 결과는 그대로 썼다. qwen 한국어, 그리고 effort 버그를 고친 뒤의 Haiku·Luna 한국어가 해당한다. 해당 검토서 첫 줄에 "> 참고:"로 표시했다.

## 3. 이어서 돌리는 법

### 준비

1. **Ollama 서버.** 동시 처리를 1개로 둔 채 떠 있어야 한다.

   ```bash
   launchctl setenv OLLAMA_NUM_PARALLEL 1
   launchctl setenv OLLAMA_MAX_LOADED_MODELS 1
   # 서버를 셸에서 띄우는 경우
   OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 nohup ollama serve > /tmp/ollama.log 2>&1 &
   curl -s http://127.0.0.1:11434/api/version
   ```

2. **모델.** `ollama list`에 `qwen3.8:27b-mlx`, `gpt-oss:20b`, `exaone3.5:32b`가 있어야 한다.
3. **API 키.** `.env.local`에 `OPENCODE_API_KEY`가 있어야 한다. Haiku와 Luna를 다시 돌릴 때만 필요하다.
4. **브랜치와 점검.** 이 문서가 있는 브랜치에서 `pnpm install`을 한 뒤 `pnpm test`가 통과하는지 확인한다.
5. **전원과 에너지 모드.** 로컬 모델 실행 전에 전원을 연결하고, 시스템 설정의 배터리에서 에너지 모드를 '자동' 또는 '고성능'으로 둔다. '저전력'이면 속도가 떨어져 시간 값을 다른 실행과 비교할 수 없다. 지금 값은 `pmset -g`의 `powermode`로 볼 수 있다(1이 저전력, 0이 자동, 2가 고성능으로 읽는다. 화면 이름은 macOS 버전마다 다를 수 있다).

### 남은 로컬 실행 돌리기 (Claude Code에서)

Claude Code에 이렇게 요청하면 된다.

> `.claude/workflows/novel-eval.js` 워크플로를 date `2026-10-18`, chapters 1로 gpt-oss와 exaone(한국어, 영어)에 대해 돌려 줘. 끝나면 summary: true로 요약을 다시 써 줘.

직접 부를 때의 인자는 아래와 같다. 저장 워크플로가 이름으로 안 잡히면 `scriptPath`로 부른다.

```js
Workflow({
  scriptPath: '.claude/workflows/novel-eval.js',
  args: {
    date: '2026-10-18',
    chapters: 1,
    // repo: '/절대/경로/DaeumHwa-r2a', // 선택. 빼면 메인 체크아웃
    runs: [
      { model: 'gpt-oss-20b', lang: 'ko' },
      { model: 'gpt-oss-20b', lang: 'en' },
      { model: 'exaone3.5-32b', lang: 'ko' },
      { model: 'exaone3.5-32b', lang: 'en' },
    ],
  },
})
```

- 로컬 모델은 메모리 때문에 한 번에 하나만 돈다. 같은 호출 안의 로컬 실행은 차례로 진행된다.
- 워크플로 한 번에 쓸 수 있는 에이전트는 1,000개까지다. 1화짜리 실행 하나가 약 60개를 쓰므로, 로컬 4개를 한 번에 넣어도 된다.
- 모두 끝나면 비교 요약을 다시 쓴다: `args: { date: '2026-10-18', runs: [], summary: true }`
- 요약은 `eval/results/novel/<날짜>/summary.md`에 쓰고, 워크플로가 그것을 `docs/eval/novel/<날짜>/summary.md`로 복사한다. 에이전트는 `docs/`에 직접 쓰지 않는다.
- 검토와 요약의 복사는 `pnpm eval:novel publish --src <실행 쪽 파일> --dest <docs 파일> [--attempts N] [--if-missing]`로 한다. `--src`는 `eval/results/novel/` 아래, `--dest`는 `docs/eval/novel/` 아래여야 한다. 실패하면 최대 3번 다시 복사하고, 결과를 `status`(`copied`, `skipped`, `failed`)가 든 JSON 한 줄로 낸다. `--if-missing`은 목적지가 있으면 건너뛴다. 이 플래그는 맨 뒤에 붙인다.
- **주의:** `chapters`를 빼면 기본값 5화로 돈다. 비교를 맞추려면 반드시 `chapters: 1`을 넘긴다.
- `repo`(선택)는 실행할 체크아웃의 절대 경로다. 별도 worktree에서 돌릴 때 쓴다. 영문, 숫자, `_`, `.`, `-`, `/`만 쓸 수 있다(공백과 `..`는 안 된다). 빼면 워크플로의 `DEFAULT_REPO`(메인 체크아웃)를 쓴다.
- worktree에는 `node_modules`가 있어야 하고, `.env.local`과 `eval/results`는 메인 체크아웃을 가리키는 링크여야 한다. 그러면 실행 결과는 메인 체크아웃의 `eval/results/novel/<날짜>/`에 쌓인다.
- 검토서와 요약의 docs 복사본은 그 worktree의 `docs/eval/novel/<날짜>/`에 생긴다. 메인 체크아웃에 커밋하려면 그 파일을 옮긴다.
- 멈춘 실행의 `RESUME.md`에는 `repo`가 들어간 재시작 명령이 적힌다.

### 멈춘 실행 이어하기

- OpenCode 한도나 Ollama 중단으로 멈춘 실행에는 실행 폴더에 `RESUME.md`가 생긴다.
- 같은 `date`와 `runs`로 워크플로를 다시 부르면 멈춘 단계부터 이어서 돈다. 이미 끝난 실행은 다시 진행하지 않는다.
- 끝난 실행의 검토는 다시 하지 않는다. 실행 폴더에 `review.md`가 이미 있으면 검토는 건너뛰지만 `docs/eval/novel/<날짜>/` 복사본이 없으면 복사만 다시 한다. 그래서 손으로 붙인 "> 참고:" 메모가 지워지지 않는다. 검토를 새로 쓰려면 `args: { ..., rereview: true }`를 준다. 그러면 그 호출의 모든 끝난 실행을 다시 검토해 복사본을 덮어쓴다. 두 번째 검토는 `review-2.md`가 없을 때만 만든다. `rereview: true`는 첫 검토만 다시 쓴다.
- 워크플로가 실행 하나를 `error`로 기록하면 그 실행의 `RESUME.md`에 이유가 적힌다. 같은 대기 항목이 작가 답 뒤에도 서른 번 연속 돌아오면 `error`로 멈춘다.
- 손으로 진행 상태를 보거나 한 단계씩 밀 때는 CLI를 쓴다.

  ```bash
  pnpm eval:novel status --all
  pnpm eval:novel advance --dir eval/results/novel/2026-10-18/run-02-ko   # 최대 540초 진행 후 상태 한 줄 출력
  ```

- `pending` 상태면 작가 답이 필요하다. 워크플로가 Sonnet 작가를 부르고, 사람이 손으로 `answer.json`을 써도 된다. 형식은 `eval/novel/agents/author.md`를 따른다.

### 기록 다시 계산하기

코드의 지표를 고치면 끝난 실행의 숫자를 다시 계산할 수 있다. DB와 `calls/` 기록은 건드리지 않는다.

```bash
pnpm eval:novel resummarize --dir eval/results/novel/2026-10-18/run-01-ko   # 실행 하나
pnpm eval:novel resummarize --date 2026-10-18                               # 날짜 폴더 안의 모든 실행
```

- `chapters/NN.md`에서 `metrics/NN.json`을, `calls/`와 `state.json`에서 `run-summary.json`을 다시 쓴다.
- `--dir <실행>`은 실행 하나를 다시 계산하고, 워커가 잡고 있으면 오류로 멈춘다. `--date <날짜>`는 날짜 폴더의 모든 실행을 다시 계산하고, 워커가 잡은 실행은 건너뛰어 `skipped: "worker-running"`으로 알린다.
- 이미 기록된 실패 호출의 청구 토큰은 되살릴 수 없다. 그 호출의 `usage`는 원래 기록에 없었기 때문이다. 고친 뒤에 생긴 실패 호출부터 청구 토큰이 `calls/`에 남는다.

### 다른 모델이나 프롬프트로 다시 재기

1. 새 모델은 `eval/novel/models.ts`의 `MODEL_PROFILES`에 추가한다. 로컬 모델이면 컨텍스트 크기를 먼저 잰다.

   ```bash
   pnpm eval:novel probe-ctx --model <id> --sizes 131072,65536,32768
   ```

2. 프롬프트를 고친 뒤 다시 잴 때는 새 `date`(예: `2026-10-25`)로 돌린다. 그래야 이번 결과와 섞이지 않는다.
   - 보조 작업의 생각 설정만 바꿔 재려면 `--helper-think <off|low|medium|high>`를 쓴다. 비교 실행에만 쓰고 새 폴더를 쓴다. qwen은 `off`만, gpt-oss는 `low`, `medium`, `high`만 받는다(gpt-oss는 `off`를 무시한다). 클라우드 모델과 exaone은 거절한다. 초안, 이어 쓰기, 장면 고쳐 쓰기는 모델 설정을 그대로 쓴다.
   - 말투 기능을 켜고 재려면 `--speech on`을 쓴다. 실행하는 동안 `AI_SPEECH_STYLE=on`이 되어 인터뷰가 인물 말투를 묻고 초안에 `<voices>`가 실린다. 실행 폴더에 `bible.json` 사본이 생긴다. 사본은 원본 설정집의 답 은행에서 인물 답 뒤에 그 인물의 `voice`를 덧붙인 것이고, 작가는 폴더에 `bible.json`이 있으면 그것을 읽는다. 원본 설정집은 그대로다. 비교 실행에만 쓰고 새 폴더를 쓴다(말투 실행은 `2026-10-19-r2speech`처럼 날짜 폴더를 따로 쓴다). 값은 `on`뿐이고 만들 때 정한다.
   - 확인: 말투 실행이 사본을 읽는지는 첫 인터뷰 답이 쌓인 뒤 `author-decisions.jsonl`에서 본다. `bankKeys`에 `protagonist`가 든 답에 `반말`이 있어야 한다(원본 답 은행에는 없는 말이다). 없으면 작가가 원본을 읽은 것이니 그 실행은 버린다.
   - 클라우드 모델에서도 두 단계 초안과 장면 다시 쓰기를 켜고 재려면 `--two-step on`을 쓴다. 초안 앞에 `draft-beats` 호출이 한 번 더 들고, 연속성 검사에서 작가가 맞다고 한 높음 이슈는 장면 다시 쓰기로 간다. 외국 문자 수리는 켜지 않는다. 로컬 모델은 이미 이렇게 돌아서 `--two-step on`을 거절한다. 비교 실행에만 쓰고 새 날짜 폴더를 쓴다(두 단계 실행은 `2026-10-19-r2twostep`처럼 날짜 폴더를 따로 쓴다). 값은 `on`뿐이고 만들 때 정한다.
   - 스킬로 돌리려면 스킬이 쓸 폴더에 먼저 실행을 만든다. 폴더는 `eval/results/novel/<새 날짜>/run-NN-<lang>`이고 NN은 1절의 모델 번호다.

     ```bash
     pnpm eval:novel init --model qwen3.8-27b --lang ko --helper-think off --chapters 1 --dir eval/results/novel/<새 날짜>/run-01-ko
     pnpm eval:novel init --model gpt-oss-20b --lang ko --helper-think low --chapters 1 --dir eval/results/novel/<새 날짜>/run-02-ko
     pnpm eval:novel init --model haiku-5.5 --lang ko --speech on --chapters 1 --dir eval/results/novel/<새 날짜>/run-04-ko
     pnpm eval:novel init --model luna-6 --lang ko --speech on --chapters 1 --dir eval/results/novel/<새 날짜>/run-05-ko
     pnpm eval:novel init --model haiku-5.5 --lang ko --two-step on --chapters 1 --dir eval/results/novel/<새 날짜>/run-04-ko
     pnpm eval:novel init --model luna-6 --lang ko --two-step on --chapters 1 --dir eval/results/novel/<새 날짜>/run-05-ko
     ```

   - 출력 한도를 작업 자체의 값으로 재려면 `--product-limits`를 쓴다(초안 16,000 등). 하한 32,000을 적용하지 않는다. effort는 그대로 high다. 비교 실행에만 쓰고 새 폴더를 쓴다. 클라우드 모델용이다(로컬 모델은 생각이 길어 한도에 자주 걸리고, 작업 한도를 넘기기도 한다). 만들 때 정한 값은 바꿀 수 없다. `--product-limits off`는 받지만 이 옵션 없이 만든 실행과만 맞는다.

     ```bash
     pnpm eval:novel init --model haiku-5.5 --lang ko --product-limits --chapters 1 --dir eval/results/novel/2026-10-19-r2limits/run-04-ko
     pnpm eval:novel init --model haiku-5.5 --lang en --product-limits --chapters 1 --dir eval/results/novel/2026-10-19-r2limits/run-04-en
     ```

   - 그다음 스킬을 같은 `date`와 `chapters: 1`로 부른다. 스킬의 init은 그 폴더만 이어 쓴다. 폴더가 다르면 생각 설정이 없는 새 실행이 만들어진다.
   - 실행의 화 수는 만들 때 정해진다. `--chapters 1`을 빼면 5화로 만들어진다.

## 4. 알아 둘 점

- **로컬 속도.** qwen 27B는 프롬프트를 초당 약 90토큰으로 읽고, 초당 약 27~35토큰으로 쓴다. 맞춤법 한 번에 45분, 연속성 검사에 21분이 걸렸다. Haiku는 초당 약 220토큰으로 쓴다.
- **Ollama 응답 헤더.** Ollama는 프롬프트를 다 읽은 뒤에야 응답 헤더를 보낸다. 32k 토큰 프롬프트에서 358초가 걸렸다. 그래서 하네스는 Node 기본 fetch(5분 헤더 시간 제한)가 아니라 시간 제한 없는 `node:http` 전송을 쓴다.
- **Claude Code 사용량.** 클라우드 1화 실행 하나가 에이전트 약 57개, 서브에이전트 토큰 약 260만 개, 약 36분을 썼다. 대부분은 Sonnet 작가가 판단마다 설정집과 지침을 새로 읽는 데 든다.
- **OpenCode Go 한도.** 모델마다 월 약 $15, 5시간마다 그 20%다. 1화 실행은 한도 안에서 충분히 돈다.
- **채점 한계.** Sonnet 채점은 모델끼리 순위를 매기는 데 쓰고, 회차 하나의 절대 점수는 참고로만 본다. Haiku는 Sonnet과 같은 계열이라 후하게 채점될 위험이 있다. 자세한 내용은 기준 문서 4절에 있다.
- **시간 값.** 로컬 호출은 하네스가 한 번에 하나씩 돌린다. 호출 시간(`durationMs`)에는 큐 대기가 들어가지 않고, 대기 시간은 호출마다 `queueMs`에 남는다. `waitInclusiveMs`는 큐 대기를 더한 시간이다. 클라우드 호출은 여전히 겹쳐 돈다. `run-summary.json`의 `perChapterMs`는 한 화 호출들이 점유한 시간의 합집합이다. 겹친 시간은 한 번만 세고, 작가를 기다린 틈은 빼고, 큐 대기는 포함한다(`startedAt - queueMs`부터 `startedAt + durationMs`까지). `perChapterModelMs`, 작업별 `totalMs`, `timeouts`는 큐 대기를 뺀 실제 호출 시간이다. 그래서 이 변경 전 실행과는 직접 비교할 수 없다. 로컬 `firstTokenMs`에는 생각 시간이 들어간다. 독자 시뮬레이션의 제품 시간 제한은 클라우드에서 270,000ms(한 번의 호출에 페르소나 넷), 로컬에서 페르소나 호출마다 120,000ms이고, 호출 기록의 `productTimeoutMs`와 `wouldTimeOut`이 이를 따른다. R2a까지 클라우드 실행은 120,000ms 기준이라 R2b와 이 수치는 직접 비교하지 않는다.
- **로컬 호출 시간의 내역.** 로컬 호출의 `calls/*.json`에는 `ollama` 항목이 있다. 시도(attempt)마다 `loadMs`, `promptEvalMs`, `evalMs`, `totalMs`, `otherMs`, 토큰 수, `doneReason`, 생각 길이(`thinkingChunks`, `thinkingChars`)를 적는다. 생각 길이는 개수와 글자 수뿐이고 내용은 없다. `unaccountedMs`는 호출 시간에서 Ollama의 `totalMs`를 뺀 값으로, Ollama 타이머 밖에서 쓴 시간이다. 시도가 끝나지 않았으면 `null`이다. 같은 프롬프트를 이 프로세스에서 이미 보냈거나 프롬프트 속도가 초당 5,000토큰을 넘으면 캐시로 보고 프롬프트 속도를 비운다(`null`, `promptCacheSuspected: true`). `run-summary.json`의 `speed.ollama`는 시간이 어디로 갔는지 합산한다(`timed.wallMs`는 적재, 프롬프트, 생성, 기타, 밖의 시간의 합). `speed.slow`는 출력 속도가 실행의 보통 속도(중앙값)의 70% 아래인 호출을 나열한다. 출력 50토큰 이상인 호출이 5개 이상 있어야 한다. 이 변경 전 실행에는 `ollama` 항목이 없고, `resummarize`는 그런 실행에 `speed.slow`만 채운다. 응답 스트림을 받기 전에 연결이 실패한 시도는 세지 않는다.
- **전원과 에너지 모드 기록.** 로컬 모델 호출은 시작할 때 읽은 전원과 에너지 모드를 호출 기록의 `power`(`source`: `ac`, `battery`, `ups`, `unknown` / `mode`: `low`, `automatic`, `high`, `unknown` / `modeRaw`: `pmset`의 원래 줄)에 남긴다. 호출 도중에 바뀐 값은 잡지 못하고 다음 호출에서야 드러난다. `run-summary.json`의 `power`에는 모드별, 전원별 호출 수가 들어간다. 지금 저전력이거나 저전력으로 시작한 호출이 하나라도 있으면 `advance`와 `status`가 내는 JSON 한 줄에 `warning`이 붙는다. 실행은 멈추지 않는다. 클라우드 실행과 이 변경 전 실행에는 `power`가 없다. 검토자용 복사본에서는 `power`를 뺀다(로컬 실행임이 드러나기 때문이다).
- **작가 에이전트의 시야.** 2026-10-19부터 작가는 대기 중인 항목, 설정집(bible), 지침 말고도 `author-context.json`을 읽는다. 이 파일에는 지금까지 승인된 위키, 앞서 내린 판단(거절한 항목 포함), 중복 힌트가 들어 있다. 힌트는 조언일 뿐이고 판단은 작가가 한다. 2026-10-18 이전 결과는 작가가 보는 것이 달라서 직접 비교할 수 없다. 새 실행에서 중복 승인은 `countDecisionMetrics`로 센다.
- **호출 기록의 한도 값.** `effortRequested`와 `maxTokens`는 하네스가 모델에 보낸 값이다. `taskEffort`와 `taskMaxTokens`는 제품 작업이 정한 값이고, `maxTokensRule`이 `floor`면 보낸 `maxTokens`는 둘 중 큰 값, `product`면 작업 값이다. 이 변경 전 호출 기록에는 작업 값이 없다. 보낸 effort는 모든 호출에서 모델 프로필 값이라(클라우드는 high), 작업이 낮은 effort를 정한 호출(인터뷰 질문 등)도 high로 돈다. `run-summary.json`의 `outputCap`은 출력 한도에 걸려 끊긴 호출(`cutOff`)과 출력이 작업 한도를 넘은 호출(`overTaskCap`)을 작업별로 센다. 하한 32,000으로 돈 실행의 `overTaskCap`은 제품 한도였다면 끊겼을 호출 수다. 하한 실행에서는 끊긴 호출이 `cutOff`와 `overTaskCap`에 함께 들 수 있다. 제품 한도 실행에서 한도에 맞춰 끊긴 호출은 `cutOff`에만 든다.
- **문단 첫 말 반복.** 장 지표(`metrics/NN.json`)의 `paragraphOpeners`는 대사가 아닌 문단이 어떤 말로 시작하는지 센다. 문단의 첫 단어를 쓰고, 한국어는 조사를 뗀다(세린은, 세린이, 세린의는 모두 `세린`). `counted`는 센 문단 수, `top`은 4문단 이상을 여는 말을 많은 순서로 5개까지, `repeated`는 그런 말로 시작한 문단 수다. 점수 판단에만 쓰고 문턱으로 두지 않는다. 2026-10-18 저장 실행 여섯 개에서는 가장 많은 첫 말이 대사가 아닌 문단의 약 26~28%였다(한국어는 주인공 이름 `세린`, 영어는 `she`나 `serin`). 이 지표가 없던 실행은 `resummarize`로 다시 계산해야 나온다.
- **두 단계 실행의 연속성 검사 입력.** 두 단계 초안을 쓰는 실행(로컬 프로필, 그리고 `--two-step on`으로 만든 클라우드 실행)의 연속성 검사는 고른 초안의 장면 위치 목록(`<scene_plan>`: 장면마다 장소, 인물, 물건 위치)도 받는다. 목록은 두 단계 초안이 남긴 `chapters/NN.attempt-K.beats.json`에서 온다. 기본 클라우드 실행과 제품은 그대로다. 이 변경 전의 로컬 실행과는 연속성 검사 입력이 달라서 지적 건수를 직접 비교할 수 없다.

## 5. 시험 운행 기록

| 시험 | 내용 | 결과 |
|---|---|---|
| 가짜 모델 1화 | 흐름 확인 | 끝까지 돎. 에이전트 59개, 토큰 258만 개, 20분 |
| qwen 한국어 1화 | 로컬 시간 측정 | 호출 32번, 모델 시간 152분. 본 실행 결과로 재사용 |
| Haiku 한국어 1화 (1, 2차) | 클라우드 비용 측정 | effort max에서 초안이 잘림. 2차는 하네스가 설정을 무시하고 max를 보내던 버그 때문에 같은 실패가 났다. 결과는 버림 |
| Haiku·Luna 한국어 1화 (3차) | 버그를 고친 뒤 확인 | 정상. Haiku는 모델 시간 7분, Luna는 11분, 오류 0건. 본 실행 결과로 재사용 |

시험 운행 중 고친 하네스 문제는 세 가지다.
1. Ollama 긴 호출이 5분 헤더 시간 제한에 걸리던 문제
2. 응답 도중 연결이 끊기면 모델 실패로 잘못 분류되던 문제
3. 모델별 effort 설정이 무시되던 문제

## 6. 검토 규칙 (2026-10-19 고정)

### 6.1 T2 집계 범위

- T2는 설정집이나 승인된 위키가 적은 사실과 어긋난 곳만 센다. 인물의 말투도 설정집이나 위키에 적혀 있으면 센다.
- 문체 카드의 글쓰기 규칙을 어긴 곳(문단 세 문장 이하 등)은 T2에 넣지 않는다. Q6~Q8 점수에 반영하고 검토서에 "문체 카드 위반" 목록으로 따로 적는다. 회차 안의 자체 모순은 "내부 모순", 지시문의 계획 순서 이탈은 "세지 않은 항목"에 적는다.
- 자세한 기준은 `docs/eval/novel-quality-criteria.md` 3.5절이다. Q5도 같이 좁혔다. 문체 카드의 글쓰기 규칙은 Q5가 아니라 Q6~Q8에서 본다. 그래서 1라운드 Q5와는 정의가 조금 다르다.
- 2026-10-18 검토서는 이 범위가 정해지기 전에 쓰였다. 같은 범위로 다시 센 값은 아래 표다. 1라운드와 T2를 비교할 때는 이 표를 쓴다.

| 실행 | 검토서의 T2 | 이 범위의 T2 | 바뀐 이유 |
|---|---|---|---|
| qwen ko | 7건 | 7건 | 없음 |
| qwen en | 4건 | 4건 | 없음. 문체 위반(C8)과 내부 모순(C5~C7)은 검토서가 이미 따로 적었다 |
| haiku ko | 2건 | 1건 | 문체 카드 위반 1건(5곳)을 뺐다 |
| haiku en | 1건 | 1건 | 없음 |
| luna ko | 2건 | 2건 | 없음 |
| luna en | 0건 | 0건 | 없음 |

### 6.2 두 번째 검토자

- 첫 검토서 끝의 "판정 데이터"(JSON)로 판정선 근처 실행을 가린다. 품질 점수 평균이 3.65 이상 3.85 이하이거나 걸린 문턱이 딱 1건이면 근처다. 판정 데이터가 없거나 읽을 수 없어도 근처로 본다.
- 근처이면 첫 검토서가 없는 별도 복사본(`blind-2/`)을 만들고, 두 번째 검토자가 처음부터 독립으로 채점한다. 결과는 실행 폴더의 `review-2.md`와 `docs/eval/novel/<날짜>/second/<모델>-<언어>.md`에 둔다.
- 비교 요약은 두 판정을 모두 적고, 판정이 다르면 "판정 불일치"로 표시한다. 두 점수를 평균 내지 않는다.
- 워크플로가 자동으로 한다. 끄려면 `args: { ..., secondReview: false }`를 준다. 판정 데이터가 없는 옛 검토서(2026-10-18 폴더)에 워크플로를 다시 부를 때는 반드시 끈다.
- 손으로 확인하려면 `pnpm eval:novel review-gate --dir <실행 폴더>`를 쓴다. 이미 `review-2.md`가 있으면 다시 만들지 않는다. 다시 만들려면 `review-2.md`를 지우고 워크플로를 다시 부른다.

### 6.3 반복 실행 규칙

이번 라운드에는 반복 실행을 하지 않는다. 규칙만 둔다. 한 번 돌린 결과는 표본 하나다.

1. 한 번의 실행 차이로 코드 변경의 효과를 단정하지 않는다. Q 평균 차이가 0.2 미만이거나(두 번째 검토자 대역 3.65~3.85의 폭이다) 통과한 문턱 수 차이가 1 이하이면 "방향 참고"로만 적는다.
2. 판정선 근처 실행이 결론을 좌우하면 같은 조합을 같은 코드로 두 번 더 돌려 모두 세 번으로 맞춘다. 그 사이에 코드를 바꾸지 않는다.
3. 반복 실행은 새 날짜 폴더에 둔다. 폴더 이름의 접미사는 영문 소문자와 숫자만 쓸 수 있으므로 `2026-10-19-r2brep2`, `2026-10-19-r2brep3`처럼 쓴다.
4. 세 번의 결과는 각각 적는다. 합칠 때는 Q 평균의 중앙값과 "출판 가능 n/3"으로 적는다. 평균을 새로 내거나 가장 좋은 실행만 고르지 않는다.
5. 같은 본문을 검토자에게 다시 채점시키지 않는다. 채점 편차는 두 번째 검토자로 본다.
6. 로컬 모델은 한 화 처리에 84~98분이 걸리므로 반복 대신 두 번째 검토자만 쓴다.

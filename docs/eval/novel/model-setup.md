# 로컬 모델 설정 기록 (소설 평가용)

작성일: 2026-10-18. 대상 머신: Apple M5 Pro, 48 GB, Ollama.

## 요약

- gpt-oss와 EXAONE 3.5는 MLX 빌드를 Ollama 라이브러리에서 찾지 못했다. 두 모델의 라이브러리 태그 목록에는 `-mlx` 태그가 없고, Ollama의 safetensors 가져오기 목록(`create/create.go`)에도 두 아키텍처가 없었다. 그래서 두 모델은 기본 태그(GGUF 계열)를 받았다.
- `qwen3.8:27b-mlx`는 이미 설치되어 있어 다시 받지 않았다.
- 샘플링 값은 공식 모델 카드의 권장값을 따랐다. EXAONE 3.5는 공식 권장값이 없어서 Ollama 패키지 기본값(temperature 1.0)을 썼고, 그 사실을 표에 표시했다.

## 설정표

| model | Ollama tag used | variant | size | max context | temperature | top_p | top_k | min_p | thinking setting | sources |
|---|---|---|---|---|---|---|---|---|---|---|
| Qwen3.8 27B | `qwen3.8:27b-mlx` | mlx | 18 GB | 262,144 (Ollama 표기 256K) | 1.0 | 0.95 | 20 | 0.0 | 기본 켜짐(thinking). 끄려면 `enable_thinking: false` (단, 아래 주의) | [S1][S2] |
| gpt-oss 20B | `gpt-oss:20b` | gguf (기본 태그, MLX 아님) | 13 GB | 131,072 | 1.0 | 1.0 | 권장값 없음 (미설정) | 권장값 없음 (미설정) | reasoning effort: `high` 선택 (low/medium/high 중 선택 가능) | [S3][S4][S5] |
| EXAONE 3.5 32B | `exaone3.5:32b` | gguf (기본 태그, MLX 아님) | 19 GB | 32,768 | 1.0 (Ollama 패키지 기본값, 벤더 권장 없음) | 미설정 | 미설정 | 미설정 | 없음 (thinking 모드 없음, 카드에 근거 없음으로 확인) | [S6][S7] |

설명:
- **variant**: 세 모델 모두 MLX 빌드 태그가 없어 gpt-oss와 EXAONE은 기본 태그를 사용했다. 기본 태그의 정확한 포맷(GGUF)은 Ollama 태그 페이지가 명시하지 않아 추정이다.
- **size**: 세 모델 모두 `ollama list` 실측값이다(gpt-oss 13 GB, EXAONE 19 GB, Qwen 18 GB). Ollama 태그 페이지의 gpt-oss 표기 14GB와는 약간 다르다.
- **Qwen 샘플링**: 공식 카드의 thinking 모드 기본값(temperature 1.0, top_p 0.95, top_k 20)을 썼다. 비사고 모드 값(0.7, 0.8, 20, presence_penalty 1.5)은 쓰지 않는다.
- **gpt-oss 샘플링**: 공식 권장은 temperature 1.0, top_p 1.0뿐이다. top_k와 min_p는 권장된 적이 없어 설정하지 않는다.
- **gpt-oss reasoning effort**: 품질 우선으로 `high`를 골랐다. 응답이 느려질 수 있으므로 지연 측정 후 `medium`과 비교할 수 있다.
- **EXAONE 샘플링**: 공식 카드는 temperature, top_p, top_k를 권장하지 않는다. 공식 quickstart는 `do_sample=False`(greedy)를 쓴다. 이 평가는 greedy 대신 Ollama 패키지 기본 temperature 1.0을 쓴다. `ollama show exaone3.5:32b --parameters` 결과는 `temperature 1`, `repeat_penalty 1`이다. 카드의 "repetition penalty not exceeding 1.0" 문구에 맞춰 repeat_penalty는 1.0으로 둔다. generation_config.json에는 샘플링 필드가 없다.
- **주의(Qwen)**: 공식 카드는 `enable_thinking: false`를 문서화하지만, HF 커뮤니티 토론 #113은 "3.8에서는 더 이상 지원되지 않는다"고 주장한다. 이 충돌은 확인하지 못했다. 끄기 설정은 실제 테스트 후에 확정한다.

## Ollama 서버 설정

- 설정값: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`. 한 번에 한 모델, 한 요청만 처리해서 병렬 요청이 KV 캐시 메모리를 곱하지 않게 한다.
- 적용 방법: `launchctl setenv`로 GUI 실행 환경에 설정했다. 이 머신의 Ollama 서버는 brew services나 앱이 아니라 셸에서 직접 `ollama serve`로 떠 있었기 때문에, 기존 프로세스를 종료하고 두 변수를 붙여 `ollama serve`를 다시 띄웠다.
- 확인: `ps eww`로 서버 프로세스 환경에서 두 변수가 설정된 것을 확인했다. `launchctl getenv`도 두 값 모두 `1`을 반환했다.

## num_ctx 측정값

- Qwen3.8 27B (`qwen3.8:27b-mlx`): num_ctx(측정값): 262144, 로드 크기 19.2 GB, 긴 프롬프트 30,012 토큰 평가 통과
- gpt-oss 20B (`gpt-oss:20b`): num_ctx(측정값): 131072, 13.6 GB, 30,063 토큰 평가 통과
- EXAONE 3.5 32B (`exaone3.5:32b`): num_ctx(측정값): 32768, 28.2 GB, 30,035 토큰 평가 통과
- EXAONE 출력 상한 8,192: 컨텍스트가 32,768이고 thinking 모드가 없어서, 출력 하한 32,000을 적용하면 프롬프트가 들어갈 자리가 남지 않는다. 그래서 `maxTokensFloor`를 8,192로 낮췄다.
- 응답 헤더 지연: Ollama는 프롬프트 평가가 끝나야 응답 헤더를 보낸다. Qwen에서 32k 토큰 프롬프트는 358초가 걸렸고(약 90 tok/s), 그래서 하네스는 시간 제한 없는 전송 계층(`node:http`)을 쓴다. 기본 fetch의 헤더 타임아웃에 걸리지 않게 하기 위해서다.

## 출처

조사는 Aside 브라우저 CLI로 수행했다. 아래 인용문은 Aside가 보고한 내용이며, 조사 후 원문을 직접 다시 열어 확인하지는 않았다.

- [S1] Qwen3.8-27B 모델 카드, https://huggingface.co/Qwen/Qwen3.8-27B
  - 인용: "We recommend using the following sets of sampling parameters for generation." (Thinking 모드: temperature 1.0, top_p 0.95, top_k 20, min_p 0.0, presence_penalty 0.0)
  - 인용: "Context Length: 262,144 natively and extensible up to 1,000,000 tokens."
  - 인용: "Qwen3.8 models operate in thinking mode by default, generating thinking content signified by `<think>\n...</think>\n\n` before producing the final response."
  - 참고: 정확히 "qwen3.8"이라는 HF 저장소는 없고, Ollama 페이지 https://ollama.com/library/qwen3.8 의 `qwen3.8:27b`가 이 카드와 이름과 크기로 대응한다고 판단했다.
- [S2] Ollama 라이브러리, https://ollama.com/library/qwen3.8
  - 인용(Aside 보고): "qwen3.8:27b (also latest), 27B, 256K context, thinking."
- [S3] gpt-oss-20b 모델 카드, https://huggingface.co/openai/gpt-oss-20b 및 https://github.com/openai/gpt-oss
  - 인용: "We recommend sampling with `temperature=1.0` and `top_p=1.0`."
  - 인용: "Low: Fast responses for general dialogue. Medium: Balanced speed and detail. High: Deep and detailed analysis."
  - 인용: "should only be used with the harmony response format as it will not work correctly otherwise."
- [S4] gpt-oss 모델 논문 카드, https://arxiv.org/abs/2508.10925
  - 인용: "extend[s] the context length of dense layers to 131,072 tokens using YaRN."
- [S5] Ollama 라이브러리 태그, https://ollama.com/library/gpt-oss/tags
  - 인용(Aside 보고): "gpt-oss:20b | 14GB | 128K | Text (carries the 'latest' badge)". MLX 태그 없음.
- [S6] EXAONE-3.5-32B-Instruct 모델 카드, https://huggingface.co/LGAI-EXAONE/EXAONE-3.5-32B-Instruct 및 https://github.com/LG-AI-EXAONE/EXAONE-3.5
  - 인용: "We highly recommend to use repetition penalty not exceeding 1.0 for better generation quality."
  - 인용(Aside 보고): 카드는 temperature, top_p, top_k를 권장하지 않으며, quickstart는 `do_sample=False`를 쓴다. vLLM/SGLang 예시의 `"temperature": 0.7`은 예시일 뿐 권장이 아니다.
  - 참고: 카드에 thinking 모드 언급이 없어 "없음"은 부재에 따른 추론이다.
  - 최대 컨텍스트: 32,768 토큰(Aside 보고).
- [S7] Ollama 라이브러리 태그, https://ollama.com/library/exaone3.5/tags
  - 인용(Aside 보고): "exaone3.5:32b | 19GB | 32K | Text". MLX 태그 없음.

## MLX 경로 조사 결과

- Ollama 라이브러리에는 gpt-oss와 EXAONE의 MLX 태그가 없다.
- Ollama 소스의 safetensors 가져오기 목록(`create/create.go`)에는 Qwen3.5/Qwen3Next, Gemma4 등이 있지만 gpt-oss와 EXAONE은 없었다. 이 목록은 Aside가 소스를 읽은 결과다.
- mlx-community 저장소 존재 여부는 확인하지 못했다.

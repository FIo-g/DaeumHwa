# Round 2 brief cross-check (opus)

## Builder check (sonnet)

중요도 순으로 정리한 질문 6개입니다.

**1. P6 "다듬기"는 어떤 텍스트에 돌고, 적용과 버리기가 저장된 초안에 어떻게 닿는가**
- 설계서는 두 가지를 말합니다. 하나는 초안 패널에서 초안이 끝난 뒤 버튼을 두는 것입니다. 다른 하나는 맞춤법 패널의 적용 흐름을 따르라는 것입니다.
- 맞춤법 패널은 에디터 원고에 `api.replaceQuote`로 적용합니다. 반면 초안은 "붙이기"를 누르기 전까지 에디터에 없고, 패널의 `draft` 상태와 ai_runs 행에만 있습니다.
- `repairDraft`는 호출하는 순간 run 행을 덮어쓰고, 한 번 돌면 다시 돌지 않습니다(`src/server/ai-features.ts`).
- "새 회차로 만들기"는 저장된 run 텍스트를 읽습니다. 그 액션은 `body`를 받지 않도록 일부러 막혀 있습니다.
- 그래서 작가가 수리 결과를 버려도 "새 회차로 만들기"에는 수리된 글이 들어갑니다. "작가가 누르기 전에는 바꾸지 않는다"를 지키려면 저장 없이 결과만 돌려주는 서비스 함수와 별도의 적용 액션이 필요합니다.
- 어느 텍스트(초안 미리보기 또는 에디터 원고)에 돌리고, "적용"이 정확히 무엇을 저장하는지가 서비스·액션·UI 세 계층의 설계를 정합니다.

**2. P2 "결정 상태"의 정의, 그리고 "조사 항목" 번호의 원문 위치**
- 표의 1-5, 1-9, 3-4 같은 번호는 이번 라운드 조사 결과를 가리킵니다. 그 문서는 레포에 없습니다. 있는 것은 1라운드 `docs/superpowers/handoff/.../survey/`뿐입니다.
- P2의 "결정 상태"는 코드에서 정의를 알아낼 방법이 없습니다. 값(열거형인지 불리언인지), 누구의 결정인지(시점 인물인지 장면 인물 전체인지), 초안 프롬프트에서 어떻게 쓰이는지가 모두 비어 있습니다. 이것이 비트 스키마와 BEATS_RULE의 모양을 정합니다.
- P11도 "저장된 실행으로 재현"이 갈림길입니다. 재현의 기준이 없으면 P11을 구현 작업으로 잡을지 기록 작업으로 잡을지 정할 수 없습니다.
- 원문이 있다면 위치를 알려 주세요. 없다면 P2의 필드 정의와 P11의 재현 기준을 알려 주세요.

**3. R2a가 가리키는 커밋과 M7·M3의 순서**
- R2a의 코드는 "M1~M6 뒤, P 전"입니다. M7은 `style-copy.ts`의 8회·0.5, 유사도 0.8, `CONTINUITY_BUDGET_CHARS` 16,000 같은 앱 상수를 바꿀 수 있습니다. M7이 R2a 앞에도 뒤에도 명시돼 있지 않습니다.
- R2a 앞이면 R2a는 "A~J 그대로"가 아닙니다. R2a와 R2b 사이이면 R2b 대 R2a 비교에 P와 M7의 효과가 섞입니다. 어느 쪽인지에 따라 작업 순서와 결과 문서의 한계 서술이 달라집니다.
- M3으로 T2 집계 범위가 바뀝니다. 1라운드 검토서는 T2를 검토자마다 다르게 셌고(요약 61행), 설계서는 재채점을 제외했습니다. 그러면 "R2a 대 1라운드의 T2 건수"는 같은 기준이 아닙니다. 비교하지 않고 각주만 달면 되는지, 1라운드 T2를 새 범위로 다시 세는 작업이 필요한지 알려 주세요.

**4. `--two-step on`이 어디까지 켜는가**
- 설계서는 "두 단계 초안과 장면 다시 쓰기"만 말합니다. 코드에서 이 둘은 `chapter.ts`의 `isLocalProfile`(294행, 733행)로 막혀 있습니다.
- P3(비트 위치 목록을 연속성 검사로 넘기기)과 P9(재시도 예산 변경)도 "로컬 eval 전용"입니다. 이것들을 프로필(`queue === 'local'`)로 막으면 R2t에서는 꺼져 있습니다. 그러면 R2t가 재는 Q2·T2는 로컬이 실제로 쓸 두 단계 흐름이 아니게 됩니다.
- P3의 입력은 비트가 있을 때만 켜지게 할지, 프로필로 막을지 알려 주세요. 특히 P3이 R2t에 포함되는지가 중요합니다.

**5. R2c와 P13의 측정 방법**
- 기존 심은 오류 세트(`eval/fixtures/continuity`, `continuity-planted`)에는 나이(살), "열한 층", "세 번 연달아"만 있습니다. P13이 더하는 연도와 영어 숫자 표현은 사례가 없고, 연속성 픽스처도 한국어뿐입니다.
- 숫자 대조는 모델 없이 코드로 도는 `numeric-facts.ts`입니다. 기존 픽스처로 전후를 재면 바뀐 것은 거의 모델 편차뿐입니다.
- 연도·영어 사례를 심은 픽스처를 추가하는 것이 P13 범위에 들어가는지 알려 주세요. 들어간다면 "P13 전" 측정은 그 픽스처를 넣고 P13 이전 커밋에서 해야 합니다.
- "클라우드 Haiku"를 고정하는 방법도 정해 주세요. `eval/run-continuity.ts`는 `getAiClient()`를 쓰고, 키가 있으면 Anthropic을 먼저 고릅니다. 모델은 환경변수에 따라 정해집니다. 프로필의 effort high도 적용되지 않습니다.

**6. 진행 중인 gpt-oss 한국어 로컬 실행과 같은 머신에서 일할 때의 규칙**
- 지금 `DaeumHwa-baseline` 워크트리(b4d49a9)에서 gpt-oss 한국어 실행이 돌고 있습니다. 결과 폴더는 메인 체크아웃의 `eval/results`와 심볼릭 링크로 공유합니다. 이 실행의 목적 중 하나가 시간 측정입니다.
- 설계서는 전원 모드만 위험으로 적었습니다. 구현 중 vitest, typecheck, build, e2e와 클라우드 워커가 같은 맥의 CPU를 쓰는 것은 다루지 않았습니다.
- 이 실행이 끝나기 전에 M 묶음 구현(Haiku TDD)과 전체 테스트를 돌려도 되는지 알려 주세요. 안 된다면 순서를 어떻게 잡을지도 필요합니다. 허용된다면 `--maxWorkers=2`나 e2e·build 금지 같은 제한이 필요한지 알려 주세요.
- 이 실행의 검토서는 baseline 워크트리의 `docs/`에 쓰입니다. 메인 체크아웃으로 옮길 주체도 정해 주세요. R2a/R2b 워크트리의 검토서도 같은 문제입니다.

## Cross-check

Cross-check of the round 2 briefs is below. I corrected 12 brief files in place; the originals are in `/private/tmp/claude-501/-Users-taehyeong-Documents-GitHub-DaeumHwa/81c3ba4b-8c31-49f6-8172-7a1c04363700/scratchpad/round2/briefs-backup-before-crosscheck/`. Three things need the orchestrator: P3 gating (I widened it), P10 count-only, and where the round 2 survey list lives.

## 1. File ownership (W = edit existing, C = create)

**Eval harness**
- `eval/novel/eval-client.ts`: W by M1, M2, M4, P7 (only the `taskTimeout` line in `prepare`), P9
- `eval/novel/run.ts` (`createRun`, `openRun`): W by M1, M2, M4, M5, P9
- `eval/novel/cli.ts`: W by M1 (status warning, `runWorker`), M3 (`review-gate`, `--second`), M4 and M5 (`init` flags)
- `eval/novel/steps/finish.ts`: W by M1 (power), M2 (`speed.slow`, `speed.ollama`), M4 (`outputCap`), P10 (`ExtractionCountsSchema`, `sumExtraction`)
- `eval/novel/blind.ts`: W by M1, M2, M3, P9. M4 leaves it alone on purpose.
- `eval/novel/models.ts`: W by M2, M4 (comment only), M5, P9
- `eval/novel/state.ts`: W by M4, M5
- `eval/novel/steps/chapter.ts`: W by M5 (`twoStepOn`), P3 (`sceneLocationsOf`, `check` step)
- Single-track edits:
  - `eval/novel/bible.ts`: M5
  - `eval/novel/steps/util.ts`: P9
  - `eval/novel/metrics.ts` and `author-io.ts`: P8
- New files:
  - M1: `power.ts`
  - M2: `ollama-detail.ts`
  - M3: `review-verdict.ts`
  - M7: `thresholds*.ts`
  - P8: `metrics-openers.ts`
  - P9: `retry-budget.ts`
- `.claude/workflows/novel-eval.js`: W by M3, then M6
- Agent instructions in `eval/novel/agents/`:
  - `author.md`: M5 (step 3 and the Rules line), M6 (`root` input)
  - `reviewer.md`: M3, P8 (one sentence)
  - `summary.md`: M3, M6
  - `resume-note.md`: M6
- `docs/eval/novel/README.md`: W by M1, M2, M3 (new section 6), M4, M5, M6, P3, P7, P8, P9, P10. M7 does not touch it.
- `docs/eval/novel-quality-criteria.md`: M3
- Docs created:
  - M7: `docs/eval/novel/2026-10-19-thresholds.md`
  - P13: `docs/eval/continuity/2026-10-19-pending-P13.md`
- `eval/fixtures/continuity-numeric/*`: C by P13
- English localization:
  - `eval/novel/localize/scaffold.ts`: P2, P3 (first `RULES` entry), P5, P12
  - `en/draft-beats.ts`: P1, P2
  - `en/draft-chapter.ts`: P4, P5
  - `en/reader-sim.ts`: P7
  - `__fixtures__/en-systems.snapshot.json`: P4 and P5 (`draft-chapter` key), P7 (`reader-sim` key)

**App (`src`)**
- `src/ai/ollama.ts`: M2
- `src/ai/guards/fact-similarity.ts`: M7 (`minDice` parameter; constant change in commit 3), then P15
- `src/ai/guards/fact-similarity.test.ts`: M7 commit 3 only (one test)
- `src/lib/korean/style-copy.ts`: M7 (adds `export` to two constants)
- `src/ai/tasks/draft-beats.ts`: P1, P2, P3 (P3 only appends `renderBeatLocations`)
- `src/ai/tasks/draft-beats.test.ts`: P1 (one assertion)
- `src/lib/draft-length.ts`: P1
- `src/ai/tasks/draft-chapter.ts`: P1 (`beatSceneCount`), P4 (two `DRAFT_SYSTEM` lines), P5 (one `DRAFT_SYSTEM` line)
- Pinned prompt goldens: `src/ai/tasks/draft-chapter.test.ts` and `src/ai/speech-off.test.ts`, both edited by P4 and then P5
- `src/server/ai-features.ts`: P1 and P5 (both in `startDraft`), P7 (`runReaderSimulation`)
- `src/ai/context.ts`: P5
- `src/ai/tasks/continuity-check.ts`: P3, P13 (comment only)
- `src/server/chapter-check.ts`: P3 (`runChapterCheck` input), P10 (extraction counts, return value), P14 (imports, `expandQuote`)
- `src/server/chapter-check.HX5.test.ts`: P10 (one assertion)
- `src/ai/extraction.ts`: P10
- `src/server/interview.ts`: P11 (`answerTurn`), P12 (`askNextQuestion`)
- `src/ai/tasks/interview-question.ts`: P12
- `src/ai/tasks/reader-sim.ts` and its test: P7
- `src/ai/tasks/proofread.ts`, `src/lib/korean/sentences.ts`, and four existing tests (`'awkward'` changed to `'spacing'`): P14
- `src/ai/numeric-facts.ts` (rewrite) and new `numeric-quantities.ts`: P13
- New `src/lib/korean/numbers.ts`: P15
- P6, new files: `src/lib/draft-refine.ts`, `src/server/draft-refine.ts`, the `draft/refine` route, `src/components/writing/panels/draft-refine.tsx`
- P6, edited files: `src/server/actions/ai-features.ts` (adds one action), `src/components/writing/panels/draft-panel.tsx`
- New single-track modules:
  - P10: `src/ai/evidence-anchor.ts`
  - P11: `src/ai/interview-style.ts`
  - P12: `src/lib/interview-names.ts`

## 2. Conflicts and how to resolve them

1. **Test file name collisions (fixed).**
   - Plain `.r2.test.ts` names were shared by several tracks:
     - `eval-client`, `steps/finish`, `blind`: M1 and M2
     - `run`: M1, M5 and P3
     - `cli`: M1, M5 and P8
     - `models`: M2 and M5
     - `ai-features` and `localize`: P1 and P5
     - `draft-chapter`: P4 and P5
     - `fact-similarity`: M7 and P15
   - I renamed them to track-tagged names, so no track appends to another track's test file.
2. **P3 gating against M5 and R2t (fixed, may be reverted).**
   - P3 gated on `isLocalProfile`. P1 and P2 already act in every two-step run, so R2t on cloud would have run P1 and P2 but not P3, and P3 would never be measured this round.
   - P3 now gates on M5's `twoStepOn(ctx)` plus an existing `beats.json`. I added a test for a cloud run with two-step on.
   - The default cloud path is still unchanged. To revert, change one line back to `isLocalProfile`.
3. **P4 and P5 disagreed on where P5's line goes in `DRAFT_SYSTEM` (fixed).** P4's text said "after the introduction rule"; P5's design says "after the first rule". P4's tests anchor only on the paragraph-rhythm rule, so P5's placement works. I corrected the P4 text. Order: P4 before P5. Both edit the same three pinned places; each inserts lines only.
4. **M7 and P15 both change `isNearDuplicateFact` (fixed).**
   - P15's interface dropped M7's `minDice` parameter, and its text said M7 might *raise* the threshold. M7 actually *lowers* it to 0.7.
   - The P15 brief now keeps `minDice` and records a hand check at 0.7: the only negative test pair that reaches the Dice step is `열일곱 살` / `17세` (Dice 0.714), and the content-word step still keeps it apart.
   - Order: M7 commit 3, then P15.
5. **M6 missed one relative path from M3 (fixed).** M3 adds a summary-prompt line that reads `docs/eval/novel/<date>/second/` as a relative path. M6 now makes it absolute under `${REPO}` and tests that.
6. **M4 and M5 both edit the default run folder name (fixed).** M5 now keeps M4's `-product-limits` part in front of `-speech` and `-twostep`.
7. **`eval/novel/eval-client.ts` has five editors (no brief change).**
   - Order M1 → M2 → M4 → P7 → P9. Each adds fields to `CallRecord`, `Prepared`, `prepare` and `settle`; nothing replaces another track's lines.
   - P9 rebuilds the `new EvalClient(...)` call in `openRun`. It must keep M1's `readPower`, M2's `onAttempt` and M4's `productLimits`.
8. **`src/server/chapter-check.ts` edited by P3, P14 and P10 (no change).** The hunks don't overlap. Order P3 → P14 → P10.
9. **README edited by about 11 tracks (no change).** Rule for every track: run `prettier --check` before editing, use `--write` only if the file was clean, and add bullets only.
10. **P8 timing (decided, P8 brief updated).** P8 moves into the M batch, before the R2a cut.
    - It adds one sentence to `reviewer.md`. Landing after R2a would give R2a and R2b reviewers different instructions and blur Q7.
    - It touches no app code, so R2a still measures the A–J app.
    - R2a's metrics get the opener field without a `resummarize`.
11. **M3 narrows the Q5 anchor (no change; footnote needed).** Style-card rules move from Q5 to Q6–Q8. That moves Q5 and Q6–Q8 in the "R2a vs round 1" comparison the spec asks for. The results doc must say so, and treat those Q deltas as direction only.
12. **R2b effects cannot be separated (no change; footnote needed).** R2b mixes P4, P5 and P7 (draft and reader prompts), P11 (adds a second work-level style card), and M7 commit 3 together with P15 (duplicate facts). R2t mixes two-step drafting with P1, P2, P3 and the scene rewrite.
13. **P7 runs `prettier --write` on the snapshot JSON; P5 says not to (minor, not changed).** Prettier leaves that file as it is, so it is harmless.
14. **Flag style differs (minor, not changed).** M4 accepts a bare flag, `on` or `off`. M5 accepts only `on`.

## 3. Execution order (one working tree, sequential)

**Step 0.** Cherry-pick `e597bc3` onto `feat/ai-improvement-round2`. It adds the gpt-oss review and one README table row. Do it before M1 touches the README; it is a clean pick then. Do not bring over the uncommitted agent edits in the `DaeumHwa-baseline` worktree (that is the round 1 workflow fork).

**M batch (all before R2a):**
1. M1
2. M2
3. M3
4. M4
5. M5
6. M6 (after M3 and M5, because of the workflow and `author.md`)
7. M7 commits 1 and 2 (replay tool and report). No behaviour change: `minDice` defaults to the current value.
8. P8 (moved here)

Then cut `../DaeumHwa-r2a` from the P8 commit and start R2a with `args.repo` set to that worktree.

**P batch:**
1. M7 commit 3 (fact Dice 0.8 → 0.7)
2. P1 → P2 → P3 (`draft-beats.ts` chain; P3 needs M5's `twoStepOn`)
3. P4 → P5 (`DRAFT_SYSTEM` and the pinned goldens)
4. P7 (after the P4/P5 snapshot edits and the M2/M4 `prepare` edits)
5. P9 (last editor of `eval-client.ts` and `run.ts`)
6. P13. Its fixture can be copied into the R2a worktree for the R2c "before" run as soon as it lands.
7. P14 → P10 (`chapter-check.ts`)
8. P11 → P12 (`interview.ts`; P12 also after the other `scaffold.ts` edits)
9. P15 (after M7 commit 3)
10. P6 (independent and the largest; last)

Then integration, full review, fixes, the `../DaeumHwa-r2b` worktree, and R2b, R2s, R2t, R2l and R2c "after".

## 4. Spec violations and deviations

- **P10 (needs sign-off).** The spec says weak evidence means no proposal. The brief only counts.
  - Data behind it: the drop rule would remove 47 of 67 saved facts, about 36 of them fine, and it catches 0 of the 2 unsupported threads.
  - Recommendation: accept count-only. Update the spec or plan row, and do not credit P10 in "추출 거절 수".
- **P3 (my correction).** P3 now also runs in cloud runs created with `--two-step on`. That goes beyond the literal "로컬 eval 전용", but the default cloud path stays unchanged. The orchestrator should confirm or revert.
- **P12 is narrower than the spec.** "고유명사" is detected only as capitalized Latin names and short quoted terms; unquoted Korean names are not detected. The saved runs give it almost nothing to catch.
- **P14 is smaller than the spec.** Half of the word-boundary rule already existed (commit 2cff60a); the brief only closes the remaining gap.
- **M3 adds mechanisms the spec does not name.** A JSON "verdict data" block at the end of every review, and the Q5 narrowing in conflict 11.
- **Copy rules.**
  - M1's warning string is English. It is an eval CLI operator message (F4 precedent), so acceptable.
  - P13's pending doc has an English "not run" line inside Korean text. This follows the precedent of the existing `2026-10-19-pending-H.md`; minor.
- **No violations found** for: packages, schema migrations, tests calling a real API (P9 uses a local HTTP stub), or unintended cloud default changes.
  - M4 adds three call-record fields and a summary block; harness only.
  - P7 changes the cloud reader-sim `productTimeoutMs` label in R2b, so R2a and R2b `wouldTimeOut` counts are not comparable.

## 5. Briefs too big for one sitting

- **M1**
  - a: `power.ts`, `eval-client.ts`, `run.ts`, `finish.ts`, `blind.ts` and their tests
  - b: CLI warning and README
- **M2**
  - a: `src/ai/ollama.ts` attempts plus `ollama-detail.ts`
  - b: `models.ts`, `run.ts`, `eval-client.ts` wiring
  - c: `finish.ts` blocks, `blind.ts`, README
- **M3**
  - a: `review-verdict.ts`, `blind.ts`, `cli.ts`
  - b: criteria doc, `reviewer.md`, `summary.md`, README section 6, agents test
  - c: workflow second-review flow and its test
- **M5**
  - a: `--speech on`
  - b: `--two-step on`
- **M7**
  - a: guard parameter, exported constants, labels, pure sweeps
  - b: report and CLI, real run, report doc, memo
  - c: constant commit (start of the P batch)
- **P6**
  - a: lib, service, route, action and their 4 tests
  - b: `DraftRefine` component, panel wiring and their 2 tests
- **P9**
  - a: `retry-budget.ts`, cap widening, `beginRetry`/`endRetry`, `util.ts`, `blind.ts`, README
  - b: lower-think retry client in `models.ts`, `retryInner`, `openRun` wiring
- **P10**
  - a: `evidence-anchor.ts` and its test
  - b: mapper, `chapter-check.ts`, `finish.ts`, HX5 assertion, README
- **P13**
  - 1: fixture, fixture test (red), pending doc
  - 2: `numeric-quantities.ts`
  - 3: `numeric-facts.ts` rewrite and comment

## Builder answers

**Q1 (P6: text and apply).** The P6 brief answers this.
- "다듬기" runs on the finished draft run's stored text (`ai_runs.output.text`, the same text the panel shows), never on the editor manuscript.
- The preview stores a server-side candidate under `output.refinement` (`base`, `text`, counts) and leaves `output.text` unchanged.
- "적용" calls the new `applyDraftRefinementAction`. It checks `candidate.base === output.text`, writes the candidate into `output.text`, keeps the first original in `originalText`, records the `refined` counts, and removes the candidate.
- The panel's draft is updated, so "붙이기" and "새 회차로 만들기" both use the refined text. "버리기" is client-only; the stored draft stays unchanged and the base check guards a stale candidate.
- `repairDraft`, `repairDraftAction` and `createChapterFromDraft` (no `body` field) are untouched. There is no 되돌리기. Recommend accepting.

**Q2 (P2 decision state, P11 reproduction, survey numbers).**
- **P2:** `decision?: string` and `stake?: string` on each beat scene, both optional free sentences, not an enum.
  - `decision` is what the scene's main (viewpoint) character has decided by the end of the scene, or has not decided yet.
  - `stake` is what that character expected and what was lost.
  - They render as `결정 상태:` / `기대한 것과 잃은 것:` lines. One rule (`BEATS_STATE_RULE`, don't reverse a stated decision without a reason; show the loss through gestures or objects) is added inside the prose prompt's `<beats>` block, only when a scene has a state. The one-step cloud draft prompt is byte-identical.
- **P11:** the reproduction criterion is the saved runs. 3 of the 4 style-topic extractions leaked into the wiki:
  - run-04-ko: a fact on 한세린
  - run-05-ko: a card named after the work title
  - run-05-en: a `rule` card

  So P11 is an implementation track, and its Step 0 turns the saved Haiku ko output into a failing test.
- **Survey numbers (needs orchestrator):** the round 2 survey list (1-1 … 4-3) is not in the repo or the scratchpad. The only survey folder is round 1's `docs/superpowers/handoff/2026-10-19-ai-improvement/survey/`. Suggest committing the list under a `2026-10-19-ai-improvement-round2` handoff folder.

**Q3 (R2a commit, M7 and M3 order).**
- **R2a commit:** cut after M1–M6, M7 commits 1–2 and P8. None of these changes app behaviour, so R2a is "A–J as is".
- **M7 values:** only `FACT_DUPLICATE_DICE` changes (0.8 → 0.7, commit 3), and it lands after the cut. Repeated words 8, sample Dice 0.5, containment 0.5 and the 16,000-char continuity budget stay. R2b vs R2a therefore also includes that one constant; the results doc should say it affects only duplicate-fact drops.
- **T2:** no re-scoring is needed. M3 puts a table in README 6.1 that recounts round-1 T2 from the review texts under the new scope (only haiku ko changes, 2 → 1). That is a re-reading, not a re-scoring, so it stays within the spec. Use it as the round-1 comparator with a footnote, and add the Q5 caveat from conflict 11.

**Q4 (`--two-step on` scope).**
- It turns on `twoStep` in the draft step (`chapter.ts:294`) and the scene rewrite (`chapter.ts:733`).
- Foreign-script repair (`chapter.ts:344`) stays local-only.
- P1 and P2 ride on beats existing. P3 is now gated on `twoStepOn` plus `beats.json`, so it is part of R2t (correction above).
- P9 stays local by queue on purpose: its levers (Ollama think, `numCtx`) don't exist on cloud, and cloud runs had 0 retries.

**Q5 (R2c and P13).**
- The fixture `eval/fixtures/continuity-numeric` (4 Korean and 2 English chapters, 8 errors the code can read, 1 only the model can find, 10 traps) is already part of P13.
- "Before" run: copy that fixture into the R2a worktree (pre-P13 code) and run there. Code-only recall is deterministic: 1/8 before, 8/8 after.
- Pin cloud Haiku with: `AI_PROVIDER=opencode OPENCODE_MODEL=claude-haiku-5-5 node --env-file=.env.local --import tsx eval/run-continuity.ts --fixture continuity-numeric`
  - `run-continuity.ts` does not load `.env.local` itself.
  - Command-line variables win over `--env-file`.
  - This matches the `haiku-5.5` profile's provider and model.
  - Check that `model` in the result JSON is `claude-haiku-5-5`, and that stderr has no AI_PROVIDER fallback warning.
- Effort is not a problem: the runner calls the product task directly, and `continuityCheckTask` is already `effort: 'high'`, `maxTokens: 16000` (`src/ai/tasks/continuity-check.ts:164`).

**Q6 (gpt-oss run and the same machine).**
- The run is finished:
  - `2026-10-18/run-02-ko/state.json` says `done` (23:01).
  - `review.md` was written at 23:12.
  - It is committed as `e597bc3` on `eval/round1-local-rest`.
- No eval worker is running. Ollama still holds gpt-oss in memory, idle (about 19 GB). Suggest `ollama stop gpt-oss:20b` before the test-heavy phases.
- M-batch work and tests can start now. Rules:
  - vitest with `--maxWorkers=2`
  - no `pnpm format`
  - avoid `pnpm build` and `pnpm e2e` while an R2a or R2b run is in a timed step; run them at the integration gate instead
  - each P track runs targeted tests plus `eval/novel` or its own folders
- Moving docs is the orchestrator's job:
  - gpt-oss review: cherry-pick `e597bc3` at step 0.
  - R2a/R2b: after each date folder's reviews and summary are done, copy `<worktree>/docs/eval/novel/<date>/` (including `second/`) into the main checkout and commit by file name (spec step 7). Don't commit inside the worktrees.

## Corrections made

All under `/private/tmp/claude-501/-Users-taehyeong-Documents-GitHub-DaeumHwa/81c3ba4b-8c31-49f6-8172-7a1c04363700/scratchpad/round2/briefs/`.

- **M1.md:** test names renamed to `eval-client`, `run`, `steps/finish`, `blind` and `cli` `.m1.r2.test.ts`. Risk note updated: the gpt-oss run is finished.
- **M2.md:** test names renamed to `eval-client`, `models`, `steps/finish` and `blind` `.m2.r2.test.ts`.
- **M5.md:**
  - `models`, `cli` and `run` tests renamed to `.m5.r2.test.ts`, with the naming text updated
  - default folder name keeps M4's `-product-limits` part first
  - Risks note now records how P1, P2 and P3 gate
- **M6.md:** M3's second-review summary line is made absolute under `${REPO}`, and the test checks it.
- **M7.md:** the R2a cut may be the P8 commit; commit 3 lands first in the P batch.
- **P1.md:** `ai-features` and `localize` tests renamed to `.p1.r2.test.ts`; the sharing note is fixed.
- **P2.md:** the note about P1's test names is fixed.
- **P3.md:** gate changed to `twoStepOn(ctx)` plus `beats.json`:
  - title, goal, design step 5, JSDoc text, README bullet, gating section and open question 4 updated
  - new test: cloud run with two-step on gets the plan
  - `run.r2.test.ts` renamed to `run.p3.r2.test.ts`
- **P4.md:** P5's insertion point now matches P5's brief; the collision notes are updated.
- **P5.md:** `draft-chapter`, `ai-features` and `localize` tests renamed to `.p5.r2.test.ts`; the "append to P4's file" notes are fixed.
- **P8.md:** `cli` test renamed to `cli.p8.r2.test.ts`. The R2a timing paragraph and the related risk now record the move into the M batch.
- **P15.md:**
  - test renamed to `fact-similarity.p15.r2.test.ts`
  - keeps M7's `minDice` parameter in the design and the interface
  - M7 dependency text corrected (lowered to 0.7, plus the hand check on the `17세` pair)

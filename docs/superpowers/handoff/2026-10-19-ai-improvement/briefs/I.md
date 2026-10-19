# Brief I: Interview question strategy

Implement with TDD in an isolated worktree. Follow CLAUDE.md (Korean user copy, English identifiers/comments, no new packages, no DB migration). All paths are repo-relative. Verified against the code on 2026-10-19.

Where to read this brief: `docs/superpowers/handoff/` is untracked (`git status` shows `??`), so a worktree created from main does not contain it. Read the brief from its absolute path in the main checkout (`/home/xogud/documents/github/DaeumHwa/docs/superpowers/handoff/2026-10-19-ai-improvement/briefs/I.md`). Never `git add` or commit `docs/superpowers/handoff/`; stage only the files this brief lists.

## Goal

1. Close a topic once the author answered "미정" (or skipped it). The model-declared `topic` of the next question must not repeat a closed topic (canonical match, see step 2). Known gap: a re-ask of a closed topic under a different `topic` label (for example an ending question labelled "다음 전개") is not caught by `violatesPlan`, does not trigger the retry, and is not counted by `sameTopicAfterUndecided`. The prompt rule (step 6) is the only guard against it. Do not widen this with a question-text check in this track (false positives on questions that merely mention a closed name, such as "주인공과 백지원의 관계").
2. After two consecutive "미정" answers, the next question switches to another core setting or to a `story` question.
3. When no core topic is left untouched, the next question is `story`.
4. Each question asks one thing (prompt rule + a heuristic metric; no retry for this). `multiAsk` is a lower bound: it flags sentence/`?` splits, comma or conjunction joins and repeated interrogative words (step 5), not every compound question.
5. Add eval metrics: share of "미정", setting/story ratio, duplicate questions, re-asks after "미정", multi-ask count.

Decision (resolves survey conflicts): detection is deterministic code (no extra AI call, no schema change). The model still chooses the question; code gives a `<plan>` signal and reuses the EXISTING single repeat retry when the answer violates the plan (max 2 calls per ask, same as today; a second violation is stored anyway, spec 5.B).

## Evidence (numbers)

- Luna ko: 12 questions; 9 of 12 answers contain "아직 정하지 않았어요" or "아직 드러나지 않아요" (luna-6-ko.md:103-104; summary.md:85 words it loosely as "미정"). The KO regex in step 1 covers the first phrasing only, so `undecidedShare` will not reproduce 9/12 on the old run. 12 setting / 0 story (docs/eval/novel/2026-10-18/summary.md:85-86, luna-6-ko.md:99-106). Luna en 10 of 12 contain a "not decided" style answer (same loose wording).
- Story count 0 in 4 of 6 runs (qwen ko, haiku en, luna ko, luna en). qwen en and haiku ko: 10 setting / 2 story.
- Repeats of a covered topic: luna ko 2, luna en 2, haiku en 2, haiku ko 1, qwen ko 1, qwen en 1.
- Multi-part questions: qwen ko 9, haiku ko 5 (summary.md:83).
- Cause in code: `src/ai/tasks/interview-question.ts:71` allows re-asking a covered topic "한 걸음 더 나아간"; the prompt never mentions "미정"; `topic` is free text (`z.string()`, line 48), so code never checks coverage; `normalizeQuestion` (`src/server/interview.ts:279`) only catches exact repeats.
- Confound: answers in eval come from the bible answer bank (`eval/fixtures/novel/ko/bible.json:151-166`, entries 152-165); the author agent answers "not decided yet" for anything outside it (`eval/novel/agents/author.md:51`). `eval/novel/fake-author.ts:18` falls back to `answerBank[0]`, so the fake author never answers "미정".

## Files

Write (existing):
- `src/ai/tasks/interview-question.ts` (SYSTEM lines 65-77, input type 10-37, `buildInterviewQuestionPrompt` 111-190)
- `src/server/interview.ts` (`askNextQuestion` 95-149, `buildQuestionInput` 360-544)
- `src/test/ai-fakes/interview-question.ts` (fake honours `plan.storyDue`)
- `eval/novel/localize/en-systems.ts` (EN mirror of SYSTEM, lines 92-104)
- `eval/novel/localize/scaffold.ts` (RULES, translate new plan labels and core topic names)
- `eval/novel/metrics.ts` (add `interviewMetrics`)
- `eval/novel/state.ts` (optional `interviewTurns` in `RunData`, line 42)
- `eval/novel/steps/interview.ts` (record turn stats, near line 105)
- `eval/novel/steps/finish.ts` (`buildRunSummary`, lines 101-121: add `interview`)
- Tests to extend: `src/ai/tasks/interview.test.ts`, `src/server/interview.test.ts`, `eval/novel/localize/localize.test.ts`, `eval/novel/metrics.test.ts`

Create (new):
- `src/lib/interview-plan.ts` (pure: undecided detection, question compaction, topic canonicalisation, plan, violation, multi-ask)
- `src/lib/interview-plan.test.ts`

Read-only: `src/db/types.ts` (INTERVIEW_FOCUSES line 52), `src/ai/prompt-utils.ts` (`neutralizeDeep`), `e2e/ai-stub/responders.ts` (do NOT change; it counts "- " lines inside `<covered>` only, lines 216-228), `e2e/ai-stub/responders.test.ts`, `eval/novel/agents/author.md`, `eval/novel/fake-author.ts`, `eval/fixtures/novel/ko/bible.json`.

Do not touch: `src/ai/tasks/interview-extract.ts`, `answerTurn`, `skipTurn`, `src/db/schema.ts`, `e2e/*`.

## Design (ordered)

1. `src/lib/interview-plan.ts`, `isUndecidedAnswer(answer)`. Order of checks: (a) `null` or blank -> false; (b) compute the compact of the whole answer (lowercase, strip `[\s\p{P}\p{S}]+`, flag `u`) and return false at once when its length is over 120, BEFORE any regex runs (so long author answers never pay for the regex); (c) split the raw answer on `/[.!?。…\n]+/` and compact each piece; (d) undecided iff at least one non-empty piece exists and every piece matches an anchored pattern. No nested quantifiers: the filler group is `(?:음|글쎄요?|…)*`, never `(?:음+|…)*`. Patterns (suggestion; the tests in the Tests section are the source of truth, widen the regex if a test needs it):
   - KO: `^(?:[가-힣a-z0-9]{1,10}?(?:은|는))?(?:음|글쎄요?|그건|그것은|그부분은|아직은|아직|지금은|딱히)*(?:미정(?:이에요|입니다|이야|이다|임)?|(?:정하지|정해두지|정해놓지|결정하지|확정하지|생각해보지)(?:않았(?:어요|습니다|어|다)|못했(?:어요|습니다|어|다))|못정했(?:어요|습니다|어|다)|모르겠(?:어요|습니다|어|네요))$`
   - EN: `^(?:(?:that|it|this)(?:is|s)?)?(?:(?:isnt|isnot|not)(?:yet)?(?:decided|determined|settled)(?:yet)?|undecided|stillundecided|tbd)$` and `^i?(?:dont|donot|havent|havenot)(?:know|decided)(?:yet)?$`.
   A sentence with real content (for example `세린이 종루 지하에서 어머니의 흔적을 찾는다는 방향만 정했어요`) is not undecided, so a mixed answer such as the bible's `ending` answer is "answered". A bare substring test is forbidden. Phrasings such as `아직 드러나지 않아요` (the bible's `conflict` answer) are NOT matched: they are partial answers with content, and the metric undercounts "미정" accordingly. Do not widen the regex to cover them.
2. Same file, `canonicalTopic(topic, core)`. `core: readonly CoreTopic[]`, `CoreTopic = { name: string; aliases: readonly string[] }`. Apply the same compaction (lowercase, strip `[\s\p{P}\p{S}]+`) to the topic, to every core name and to every alias BEFORE any comparison (aliases such as `main characters` and names such as `주요 인물` contain spaces and never match a compacted topic otherwise); all comparisons below are between compacted strings. Order: (a) exact match to a core name or alias; (b) the topic (length 2 or more) is contained in a core name/alias, or a core name/alias (length 2 or more) is contained in the topic, checked in core order; (c) no match returns the compact topic itself. Returns the core `name` (not compacted) on a match.
3. Same file, `planInterviewTopics(turns, core): InterviewPlan`. `turns` are oldest first. Ignore open turns (`answer === null && !skipped`) for status but count them as touched. Per canonical topic keep the status of the LATEST non-open turn: `closed` if `skipped` or `isUndecidedAnswer(answer)`, else `open`. Fields:
   - `closedTopics`: display names of closed topics (core name, or the raw topic text for non-core).
   - `remainingCore`: core names with no turn at all (any status).
   - `undecidedStreak`: walk from the newest turn back, skip turns that are skipped or open, count undecided answers, stop at the first answered-with-content turn.
   - `storyDue`: `remainingCore.length === 0`.
4. Same file, `violatesPlan(q: { focus; topic }, plan, core): boolean`. True when `canonicalTopic(q.topic, core)` equals the canonical form of any `plan.closedTopics`, or when `plan.storyDue && q.focus === 'setting'`.
5. Same file, `isMultiAsk(question)` (a heuristic lower bound, not a proof of "one thing"). True when any of: (a) the number of non-empty pieces after splitting on `/[.?!。？！]+/` is 2 or more; (b) the count of `?`/`？` is 2 or more; (c) a comma-joined compound: a non-final clause ending in `이고`, `이며`, `하고`, `하며`, `이면서` or `이자` immediately followed by `,`/`，` and then more text (`/(?:이고|이며|하고|하며|이면서|이자)[,，]\s*\S/`); (d) a conjunction word `그리고`, `및`, `또는` (compact text contains it); (e) two or more DISTINCT interrogative words from `누구|무엇|뭐|어디|언제|왜|어떻게|어떤|몇|얼마` (a repeated single word does not count). The qwen ko review (`docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md:235`) counts questions that ask two or three things at once; the brief's own example `주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?` has one sentence and one `?`, so (a)/(b) alone cannot see it.
6. `src/ai/tasks/interview-question.ts`:
   - Add `TOPIC_ALIASES: Record<(typeof INTERVIEW_TOPICS)[number], readonly string[]>` (typed, so a new topic breaks compile until filled). English aliases are exactly the `EN_INTERVIEW_TOPICS` entries (`eval/novel/localize/en-systems.ts:20-29`), no extras: 주인공 `['protagonist']`, 주요 인물 `['main characters']`, 세계관 규칙 `['world rules']`, 주요 장소 `['main places']`, 중심 갈등 `['central conflict']`, 떡밥 `['threads']`, 결말 방향 `['ending direction']`, 문체 `['style']`. Export `CORE_TOPICS: CoreTopic[]` built from both.
   - Add optional `plan?: InterviewPlan` to `InterviewQuestionInput` (import the type from `@/lib/interview-plan`). Optional so `emptyQuestionInput`, the stub test and `localize.test.ts` keep compiling.
   - In `buildInterviewQuestionPrompt`, after the `</covered>` line push the `<plan>` block only when `plan` exists and (`closedTopics.length > 0 || storyDue || undecidedStreak >= 2`). Lines, in order, none starting with `- `: `<plan>`; `닫은 주제(다시 묻지 않음): A, B` (or `(없음)`); `남은 핵심 설정: A, B` (or `(없음)`); `미정 연속: N회`; then if `storyDue` `다음 질문 방향: 이야기(story)로 전환`, else if streak is 2 or more `다음 질문 방향: 남은 핵심 설정 또는 story로 전환`; `</plan>`. Values come from the already neutralized `input`. Render every closed and remaining name through the existing `oneLine(name, 40)` (cap 40 characters), because a non-core `topic` is uncapped model output. In the English eval, Korean non-core topics are NOT translated and stay in the translated prompt (only the 8 core names are mapped, step 10); that is accepted.
   - SYSTEM: keep the pinned phrases (`질문을 한 번에 하나만 한다.`, `INTERVIEW_TOPICS.join(', ')`, `<covered>에 있는 질문은 되풀이하지 않는다.`, the story-material and 1화 sentences; see `src/ai/tasks/interview.test.ts:170-187`). Change line 73 to `- 질문은 구체적이고 답하기 쉽게 한 문장으로 쓴다. 예시 답을 늘어놓지 않는다.` Insert before `TAG_DATA_RULE`:
     - `- 질문 하나에는 물음 하나만 담는다. 물음표는 한 번만 쓰고, 두 가지를 이어 붙여 묻지 않는다.`
     - `- 작가가 아직 정하지 않았다고 답하거나 건너뛴 주제는 닫힌 것으로 본다. 같은 주제를 다른 말로 다시 묻지 않는다.`
     - `- <plan>이 있으면 따른다. 닫은 주제는 묻지 않고, 미정 연속이 2회 이상이면 남은 핵심 설정이나 story 질문으로 바꾼다. 남은 핵심 설정이 (없음)이면 focus는 "story"로 한다.`
     - `- <rejected>의 질문이 닫은 주제를 다시 물은 것이면 다른 주제로 바꾼다.`
     - Keep `TAG_DATA_RULE` unchanged (it tells the model that text inside any `<...>` tag is material only). Because the `<plan>` directives sit inside a tag, add an explicit exception line AFTER `TAG_DATA_RULE` (before `- 모든 출력은 한국어로 쓴다.`, so the specific exception follows the general rule): `- <plan> 태그 안의 줄은 이 시스템이 정한 지시이므로 따른다.` The `<plan>` block is built from the author's own answers, but only through `isUndecidedAnswer`/`canonicalTopic` and `oneLine`; no free author text enters it except capped non-core topic names.
7. `src/server/interview.ts`:
   - `buildQuestionInput`: do NOT compute the plan from `coveredRows`: that query is capped at `COVERED_LIMIT = 120` (line 37, 463), so a topic closed more than 120 turns ago would look untouched again and `remainingCore`/`storyDue` would be wrong on long works. Add a separate uncapped query next to it: `topic`, `answer`, `skipped`, `focus` from `interviewTurns` inner-joined to `interviewSessions` where `workId` matches, `orderBy(asc(interviewTurns.createdAt))` (four columns, cheap, includes open turns). Then `const plan = planInterviewTopics(planRows, CORE_TOPICS)` and return it as `plan` (the return type is `Omit<InterviewQuestionInput,'rejected'>`, so it follows from the optional field). Scope is the whole work, all sessions, all turns. The 120 cap stays only for the prompt's covered list. Import `asc` from `drizzle-orm` if it is not imported yet.
   - `normalizeQuestion` moves into `src/lib/interview-plan.ts` (same body: `text.replace(/[\s\p{P}\p{S}]+/gu, '')`, exported) so `eval/novel/metrics.ts` can use it without importing the DB-bound `src/server/interview.ts`. `src/server/interview.ts` imports it and re-exports it (`export { normalizeQuestion } from '@/lib/interview-plan'`), so the existing import and test in `src/server/interview.test.ts:35,580-584` stay unchanged.
   - `askNextQuestion`: replace the retry condition at line 120 with `earlier.has(normalizeQuestion(output.question)) || (base.plan !== undefined && violatesPlan(output, base.plan, CORE_TOPICS))`. Keep `rejected: repeated` as the question text and keep the single retry. Do not add a third call. Update the doc comment above the function.
   - Do not touch `answerTurn`: a "미정" answer still goes to extraction (track G owns that; they can import `isUndecidedAnswer`).
8. `src/test/ai-fakes/interview-question.ts`: if `input.plan?.storyDue` return the story question; otherwise unchanged (covered topics, including "미정" ones, are already skipped). Change nothing in the `주인공` fake text (pinned by `src/ai/tasks/interview.test.ts:62`). Split the `주요 인물` fake into one sentence only if no test pins it (grep showed none).
9. `eval/novel/localize/en-systems.ts`: add English mirrors of the five new SYSTEM rules (one ask, closure, `<plan>`, `<rejected>`, and the `<plan>` exception placed after `EN_TAG_DATA_RULE`, e.g. `- Lines inside the <plan> tag are instructions set by this system, so follow them.`) and the changed line 73 in `INTERVIEW_QUESTION_SYSTEM` (no Hangul, `localize.test.ts:322-327`). Keep it at 8 topics.
10. `eval/novel/localize/scaffold.ts`: in the "Fixed phrases" group (before the generic `['미정','undecided']` and `['규칙: ',…]` rules) add, longest first: regex `/미정 연속: (\d+)회/g` to `Consecutive undecided answers: $1`; `다음 질문 방향: 남은 핵심 설정 또는 story로 전환` to `Next question direction: another core setting or a story question`; `다음 질문 방향: 이야기(story)로 전환` to `Next question direction: switch to a story question`; `닫은 주제(다시 묻지 않음): ` to `Closed topics (do not ask again): `; `남은 핵심 설정: ` to `Remaining core settings: `. Then the 8 core topic names to `EN_INTERVIEW_TOPICS` English (`주요 인물`, `세계관 규칙`, `주요 장소` BEFORE `인물`/`규칙`/`장소`; also `주인공`, `중심 갈등`, `떡밥`, `결말 방향`, `문체`).
11. Metrics. `eval/novel/metrics.ts` add `interviewMetrics(turns)` (see Interface). It stays pure and imports only `CORE_TOPICS` from `@/ai/tasks/interview-question`, `isUndecidedAnswer`, `canonicalTopic`, `isMultiAsk`, `normalizeQuestion` from `@/lib/interview-plan`, and the `InterviewFocus` type from `@/db/types`. It must NOT import anything under `src/server`. Definitions: `asked` = turns.length; `answered` = turns with `answer !== null` (undecided answers count as answered; skipped turns have no answer and are not counted); `undecided` = answered turns where `isUndecidedAnswer(answer)`; `duplicateQuestions` = turns whose `normalizeQuestion(question)` equals an earlier turn's; `sameTopicAfterUndecided` = turns where the LATEST earlier non-open turn (`answer !== null || skipped`) with the same `canonicalTopic(topic, CORE_TOPICS)` is closed (`skipped` or undecided), i.e. the same rule as `planInterviewTopics`, so a legitimate reopening after a content answer is not counted. `storyAfterCoreDone` = number of `story` turns with an index after the turn where the 8th distinct core canonical name first appears (any status; 0 if fewer than 8 core names appear). `undecidedShareInBank` = undecided / answered counted only over turns whose canonical topic equals a core name (0 when none). `eval/novel/state.ts`: add `interviewTurns?: InterviewTurnStat[]` to `RunData` (optional, so old state files resume). `eval/novel/steps/interview.ts`: right after the `focusCounts` line (105), reload the turn with the existing `loadTurn(ctx, turnId)` and push `{ turnId, focus, topic, question, answer, skipped }` unless an entry with that `turnId` exists, then `persist` happens via the existing `mark`. `eval/novel/steps/finish.ts` `buildRunSummary`: add `interview: interviewMetrics(state.data.interviewTurns ?? [])` (stays pure, so `resummarize` works).

## Interface

```ts
// src/lib/interview-plan.ts
import type { InterviewFocus } from '@/db/types'
export type CoreTopic = { name: string; aliases: readonly string[] }
export type PlanTurn = { topic: string; answer: string | null; skipped: boolean; focus: InterviewFocus }
export type InterviewPlan = {
  closedTopics: string[]; remainingCore: string[]; undecidedStreak: number; storyDue: boolean
}
export function isUndecidedAnswer(answer: string | null): boolean
export function canonicalTopic(topic: string, core: readonly CoreTopic[]): string
export function planInterviewTopics(turns: readonly PlanTurn[], core: readonly CoreTopic[]): InterviewPlan
export function violatesPlan(q: { focus: InterviewFocus; topic: string }, plan: InterviewPlan, core: readonly CoreTopic[]): boolean
export function isMultiAsk(question: string): boolean
export function normalizeQuestion(text: string): string // moved from src/server/interview.ts, re-exported there

// src/ai/tasks/interview-question.ts
export const CORE_TOPICS: CoreTopic[]
// InterviewQuestionInput gains: plan?: InterviewPlan

// eval/novel/metrics.ts
export type InterviewTurnStat = { turnId: string; focus: InterviewFocus; topic: string; question: string; answer: string | null; skipped: boolean }
export type InterviewMetrics = {
  asked: number; answered: number  // answered = answer !== null (includes undecided answers)
  undecided: number
  undecidedShare: number      // undecided / answered, 0 when answered is 0
  setting: number; story: number
  storyShare: number          // story / asked, 0 when asked is 0
  duplicateQuestions: number  // turns whose compact question equals an earlier one
  sameTopicAfterUndecided: number // turns whose canonical topic's latest earlier non-open turn is closed (undecided/skipped)
  multiAsk: number            // turns where isMultiAsk(question); a lower bound
  storyAfterCoreDone: number  // story turns after the turn where the 8th distinct core topic first appears (0 if never)
  undecidedShareInBank: number // undecided / answered, over turns whose canonical topic is a core name (the bible bank covers those)
}
export function interviewMetrics(turns: readonly InterviewTurnStat[]): InterviewMetrics
```

## Tests (TDD; write each before the code)

`src/lib/interview-plan.test.ts`
- undecided exact (also see the length/ReDoS cases below): `"미정"`, `" 미정. "`, `"그건 아직 정하지 않았어요."`, `"아직 정하지 않았어요. 그건 미정이에요."`, `"That is not decided yet."`, `"That isn't decided yet."`, `"I don't know yet."` -> true.
- answered: `"서윤은 시계탑 수리공이다."`, `"미정이 아니라 서윤이다"`, `"미정인 떡밥이 있다"`, the bible `ending` answer `"결말은 아직 정하지 않았어요. 세린이 종루 지하에서 어머니의 흔적을 찾는다는 방향만 정했어요."`, `""`, `null` -> false; `"아직 드러나지 않아요"` -> false (documented non-match).
- undecided length and speed: a 121-character answer built from `"미정"`-like fragments -> false (length check first); `'음'.repeat(60) + '가'` -> false and finishes in well under 50 ms (assert elapsed time loosely, for example below 200 ms).
- canonicalTopic: `'주인공의 목표'`->`'주인공'`; `'세계관'`->`'세계관 규칙'`; `'protagonist'`->`'주인공'`; `'main characters'`->`'주요 인물'`; `'주요 인물'`->`'주요 인물'` (exact, name with a space); `'World Rules'`->`'세계관 규칙'`; `'다음 전개'` stays compact `'다음전개'`. The alias list for 주인공 is `['protagonist']` only.
- plan, 미정 closes topic: turns [주인공 answered "미정"] -> `closedTopics ['주인공']`, `remainingCore` has 7 names, streak 1, `storyDue` false.
- plan, skipped closes topic but not the streak: [주인공 skipped] -> closed `['주인공']`, streak 0.
- plan, streak 2: [주인공 미정, 주요 인물 미정] -> streak 2, both closed.
- plan, streak broken: [미정, 내용 있는 답, 미정] -> streak 1; [미정, 미정, 내용 있는 답] -> streak 0.
- plan, skipped turns do not break the streak: [미정, skipped, 미정] -> streak 2.
- plan, latest turn wins: [주인공 미정, 주인공 내용 있는 답] -> 주인공 not closed.
- plan, story due: all 8 core topics touched (some answered, one 미정) -> `remainingCore []`, `storyDue` true.
- violatesPlan: closed 주인공 and q `{setting, '주인공 성격'}` -> true; q `{setting, '주요 인물'}` -> false; `storyDue` and q `{setting, '문체'}` -> true; `storyDue` and q `{story, '다음 전개'}` -> false.
- isMultiAsk: `'주인공은 누구인가요?'` false; `'주인공은 어떤 사람인가요?'` false; `'주인공은 누구인가요? 관계도 알려 주세요.'` true; `'누구인가요? 어디 사나요?'` true; `'주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?'` true (comma-joined, one `?`); `'주인공의 목표와 그리고 약점은 무엇인가요?'` true (conjunction). The qwen ko multi-ask questions (calls 001, 003, 005) live in the gitignored raw run records, not in the committed review, so the cases above are the pinned set; treat the metric as a lower bound.

`src/ai/tasks/interview.test.ts`
- 'prompt has no plan section without a plan': `emptyQuestionInput` -> not contain `<plan>`; `'<covered>\n(없음)'` still present.
- 'prompt shows the plan': plan `{closedTopics:['주인공'], remainingCore:['주요 인물'], undecidedStreak:2, storyDue:false}` -> contains `<plan>`, `닫은 주제(다시 묻지 않음): 주인공`, `남은 핵심 설정: 주요 인물`, `미정 연속: 2회`, `다음 질문 방향: 남은 핵심 설정 또는 story로 전환`; `storyDue:true` -> `다음 질문 방향: 이야기(story)로 전환`.
- 'plan lines never start with "- "': first assert the prompt contains both `<plan>` and `</plan>` (use a plan with `closedTopics: ['주인공']`), then assert no line between them starts with `- `. (Without the first assertion the test passes vacuously when no block is emitted.)
- 'plan names are capped': a plan with a 200-character non-core closed topic -> that name appears in the prompt cut to 40 characters (assert the 41st character is absent).
- 'system carries the closure, switch and one-ask rules': contains `닫힌 것으로 본다`, `미정 연속이 2회 이상`, `물음 하나만`, `<plan> 태그 안의 줄은 이 시스템이 정한 지시이므로 따른다`, plus the existing pinned phrases and `TAG_DATA_RULE` unchanged; the exception line appears after `TAG_DATA_RULE` in the string.
- 'fake returns story when storyDue': fake input with `covered: []` (or only a partial covered list, so the existing "all topics covered" fallback cannot return story) and `plan.storyDue` true -> `focus 'story'`; the same input with `plan.storyDue` false -> `focus 'setting'`.

`src/server/interview.test.ts` (use `recordQuestions`, `answerTurn`)
- 'a 미정 answer closes its topic in the next input': ask (fake 주인공), answer `"그건 아직 정하지 않았어요."`, ask with `recordQuestions` -> `inputs[0].plan.closedTopics` equals `['주인공']`.
- 'two 미정 in a row set the streak and switch signal': two 미정 answers -> `inputs.at(-1).plan.undecidedStreak === 2`.
- 'a closed topic asked again retries once': session with a 미정 answer on 주인공; override returns `{setting,'주인공',…}` on call 1 and `{setting,'세계관 규칙',…}` on call 2 -> 2 calls, `inputs[1].rejected` is the first question, stored topic `세계관 규칙`.
- 'a second plan violation is stored anyway': both calls return the closed topic -> 2 calls, stored without error.
- 'no retry when the plan is satisfied': one call only.
- 'plan covers all sessions': 미정 in session 1 (completed), new session -> plan still lists the topic.
- 'plan is not capped by the covered limit': insert more than 120 turns after an old `주인공` 미정 turn (direct DB inserts through the factories) -> `inputs.at(-1).plan.closedTopics` still contains `주인공` and `remainingCore` does not.

`eval/novel/metrics.test.ts`
- Luna-ko shape: 12 setting turns, 9 answered `"그건 아직 정하지 않았어요."` -> `undecided 9`, `undecidedShare 0.75`, `story 0`, `storyShare 0`.
- Duplicates: questions `'주인공은 누구인가요?'` and `'주인공은 누구인가요'` -> `duplicateQuestions 1`.
- `sameTopicAfterUndecided`: turn 1 `주인공` 미정, turn 2 topic `주인공 성격` -> 1. Reopening: turns `주인공` 미정, `주인공` content answer, `주인공 성격` -> 0 (latest earlier non-open turn has content). Open turn between: `주인공` 미정, `주인공` open (`answer null`, not skipped), `주인공 성격` -> 1. Skipped counts as closed.
- `answered` is `answer !== null`: a skipped turn and an open turn are not answered.
- `storyAfterCoreDone`: 8 distinct core topics then 3 story turns -> 3; 7 core topics then story turns -> 0. `undecidedShareInBank`: undecided answers on non-core topics are excluded from numerator and denominator.
- Empty list -> all zeros, no NaN. `multiAsk` counts two-sentence questions and the comma-joined example from the `isMultiAsk` tests.
- Import guard: `fs.readFileSync('eval/novel/metrics.ts')` contains no `src/server` import (assert with a regex on the import lines).

`eval/novel/localize/localize.test.ts`
- Build an interview-question prompt with a `plan` (closed `['protagonist']`, remaining the Korean core names) -> `findHangul(translateScaffold(prompt))` is `[]`.
- `EN_SYSTEMS['interview-question']` contains `closed`, `one question` mirror text and `Lines inside the <plan> tag` (assert each new EN rule by a short substring) and has no Hangul.
- A plan whose closed list holds a non-core Korean topic: the translated prompt keeps that Korean name (documented, not asserted as Hangul-free); the core-name case above stays Hangul-free.

## Acceptance metrics

Measure with `interviewMetrics` on a new-date eval rerun, real author agent (author.md), 12 questions, ko and en, 1 chapter. Do not compare to old numbers from the fake author; the bank is a confound.

| Metric | Current (luna ko / worst) | Target |
|---|---|---|
| undecidedShare (미정 / answered) | about 0.75 (luna ko, loose wording, see Evidence); luna en about 0.83 | Informational, at most 0.25 (3/12) as a goal. Also report `undecidedShareInBank` (core topics only). The bank confound limits this target: the author answers 미정 to anything outside the bank, regardless of this track |
| sameTopicAfterUndecided | 2 (luna ko) | at most 1 per run (a second plan violation is stored anyway, spec 5.B, so 0 is not guaranteed by construction) |
| story questions per run | 0 in 4 of 6 runs | `story` at least 2 of 12 in the run, and `storyAfterCoreDone` at least 1 whenever `storyAfterCoreDone` can occur (all 8 core topics touched) |
| duplicateQuestions | 1-2 per run | at most 1 per run (same reason as above) |
| multiAsk (heuristic lower bound) | 9 (qwen ko), 5 (haiku ko) | at most 1 of 12 by this heuristic (prompt-only, no retry) |
| model calls per ask | 1, 2 on repeat | still at most 2 |

## Dependencies on other tracks

- B (speech question): shares `src/ai/tasks/interview-question.ts` SYSTEM (lines 65-77), `en-systems.ts` `INTERVIEW_QUESTION_SYSTEM`, and the SYSTEM asserts in `src/ai/tasks/interview.test.ts:170-187`. Agreement: B does NOT add a 9th entry to `INTERVIEW_TOPICS`; it adds one bullet to SYSTEM asking each main character's speech (존댓말/반말/말버릇) under the existing `주요 인물` topic. I merges first, B rebases and places its bullet after the I rules. If B insists on a new topic it must also edit: `INTERVIEW_TOPICS`, `TOPIC_ALIASES` (compile error forces it), `FAKE_QUESTIONS` (compile error forces it), `EN_INTERVIEW_TOPICS` plus the length-8 assertion `localize.test.ts:331`, scaffold topic rules (step 10), the 8-topic list at `src/ai/tasks/interview.test.ts:78-87`.
- G (extraction skip on pure "미정" answers): can import `isUndecidedAnswer` from `src/lib/interview-plan.ts`. Track I does not change `answerTurn`.
- HX3 (author sees wiki) changes the author's "미정" baseline; compare metrics only within the same author setup.
- F4/A (effort, timeouts): none; this track adds no AI call.

## Risks

- Narrowing AI judgment: `storyDue` forces `story` once every core topic is touched, which overrides the earlier decision that the model picks the focus (eval design section 12, item 10, `docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:342`; reliability spec 5.B) and the model's own "얕으면 더 묻는다". Flag in the PR; to soften, drop `storyDue` from `violatesPlan` and keep it as a prompt signal only (one-line change in step 4).
- Enforcement and metrics key on the model-declared `topic` label. A re-ask under a different label is not caught (see Goal 1); `sameTopicAfterUndecided` is blind to the same evasion.
- `<plan>` directives sit inside a tag while `TAG_DATA_RULE` says tag contents are ignorable; the SYSTEM exception line after `TAG_DATA_RULE` (step 6) resolves this, and a test pins it.
- Topic matching is heuristic (free-text `topic`). A wrong match can close or touch a core topic early. Aliases and the 2-character minimum limit it; unmatched topics fall back to their own compact key.
- The regex for "미정" can miss odd phrasings (false negative = old behaviour) or hit a short real answer (false positive closes a topic). Anchored, whole-answer match keeps false positives low.
- A retry on a plan violation can double latency on slow local models (120 s per call). Same worst case as the current repeat retry; no third call.
- Story topics: if the author answers "미정" to a story question, the topic closes, and a second story question must pick another angle; the `<plan>` gives no story topic list.
- Do not add "- " lines inside `<covered>` (the E2E stub counts them). The `<plan>` block is separate.
- Eval comparability: the prompt changed, so rerun under a new date.

## Open questions

1. Should `storyDue` stay enforced (retry) or be a prompt signal only? Default in this brief: enforced.
2. Skipped turns close their topic but do not count toward the streak (default here). Confirm.
3. Closure is per work (all sessions), and a later content answer on the same topic reopens it. Confirm.
4. Should the eval fake author get an undecided path (for run.test.ts coverage)? Default: no; measure with the real author agent.
5. English "미정" variants beyond the listed patterns are not covered (the author agent writes "not decided yet").

## Definition of done

```
pnpm vitest run src/lib/interview-plan.test.ts src/ai/tasks/interview.test.ts src/server/interview.test.ts eval/novel/metrics.test.ts eval/novel/localize/localize.test.ts e2e/ai-stub/responders.test.ts 'src/app/api/works/[workId]/interview/next/route.test.ts' src/components/interview/interview-session.test.tsx --maxWorkers=2
pnpm vitest run eval/novel/run.test.ts eval/novel/state.test.ts --maxWorkers=2
pnpm exec tsc --noEmit        # filter output to the files in this brief
pnpm eslint src/lib/interview-plan.ts src/lib/interview-plan.test.ts src/ai/tasks/interview-question.ts src/server/interview.ts src/test/ai-fakes/interview-question.ts eval/novel
```
All pass, no existing assertion edited except where this brief says so. `pnpm db:generate` must report no schema change. Before committing, `git status` must show nothing under `docs/superpowers/handoff/` staged.

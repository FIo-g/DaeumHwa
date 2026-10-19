# Brief A: Chapter length guarantee (T3)

Read CLAUDE.md first. Work TDD in your worktree: write the failing test, see it fail, then implement. Do not add or upgrade packages.

## Goal
A draft from `startDraft` (`src/server/ai-features.ts`) must reach the minimum length. Three changes:
1. The draft prompt states a minimum, a maximum and a per-scene length, computed from the work's `targetChars` (never a literal 5,000).
2. Right after the first draft stream ends, code counts characters. If short, ONE continuation call (new task `draft-continue`) is made. Its text is appended to the stream and the joined text is stored in the first run row.
3. The English eval prompts (system + scaffold) stay in step with the Korean ones.

## Evidence
- T3 (`eval/novel/metrics.ts` `chapterMetrics`): ko needs chars >= target (5000) and <= 1.3 x target; en needs >= 0.8 x target (9,680 of 12,100). Chars = `countChars(text.trim()).withSpaces`.
- 2026-10-18 runs, 1 chapter each: Haiku ko 3,505/5,000 = 70.1% (fail), Haiku en 9,096 = 75.2% (fail), Luna ko 3,473 = 69.5% (fail), Luna en 9,888 = 81.7% (pass, thin), Qwen ko 109% and Qwen en 124.5% (pass). Cloud T3 1/4, all 3/6. Each failing run made 1 draft call (about 68 to 83 s each: haiku ko 67.9 s, haiku en 69.1 s, luna ko 82.5 s; Luna en, which passed, took 116 s).
- Cause: `DRAFT_SYSTEM` in `src/ai/tasks/draft-chapter.ts` only has the rule "목표 분량에 가깝게 쓴다." (about line 13); `buildDraftPrompt` has the line `<target_length>약 ${input.targetChars}자</target_length>` (about line 42). `startDraft` (ai-features.ts, about lines 328-340) makes one `startAiStream` call. `eval/novel/agents/author.md:53` never treats length as unusable, so no redraft.
- `createChapterFromDraft` (ai-features.ts ~347) reads only ONE run's `output.text`. The eval (`eval/novel/steps/chapter.ts:123`) only does `await run.done`; it never reads `textStream`.

## Files
Write (existing):
- `e2e/ai-stub/responders.ts` and `e2e/ai-stub/responders.test.ts`: the stub matches by system text only, so the continuation (same `DRAFT_SYSTEM`) would get `DRAFT_TEXT` (about 24 characters) again, and every e2e draft (default target 5500) would become the stub text twice. Make the `draft-chapter` answer use its `prompt` argument: return a separate `CONTINUE_TEXT` (a different short sentence) when `prompt.includes('<draft_so_far>')`, else `DRAFT_TEXT`. Add a case in `responders.test.ts` (next to 'answers the draft prompt with plain text', about line 158) for the continuation answer.
- `src/ai/tasks/draft-chapter.ts`: system rules, prompt tags, `buildContinuationPrompt`, constants.
- `src/ai/tasks/draft-chapter.test.ts`: exact `DRAFT_SYSTEM` array (about lines 26-39) and prompt tests.
- `src/server/ai-features.ts`: `startDraft` continuation driver.
- `src/server/ai-features.test.ts`: describe `draft` (about lines 173-321).
- `src/ai/run.ts`: add `replaceRunOutput`.
- `src/ai/run.test.ts`: test for it.
- `src/db/types.ts`: add `'draft-continue'` to `AI_TASKS` (line 142). `ai_runs.task` is a text column, so no migration.
- `src/test/ai-fakes/draft-chapter.ts` and `src/test/ai-fakes/index.ts`: fake continuation text.
- `src/app/api/works/[workId]/draft/route.test.ts`: keep it green, add 1 test.
- `eval/novel/localize/en-systems.ts`: English draft system + `EN_SYSTEMS['draft-continue']`.
- `eval/novel/localize/scaffold.ts`: translate the new prompt strings.
- `eval/novel/localize/localize.test.ts`: `PROMPTS` needs a `'draft-continue'` entry (it is `Record<AiTaskName, string>`).
Create:
- `src/lib/draft-length.ts` and `src/lib/draft-length.test.ts`
- `src/lib/text-pipe.ts` and `src/lib/text-pipe.test.ts`
Read-only: `src/lib/korean/chars.ts`, `src/lib/chapter-length.ts` (do not duplicate or change), `src/lib/draft-stream.ts`, `src/app/api/works/[workId]/draft/route.ts` (no change needed), `src/ai/prompt-utils.ts`, `src/ai/types.ts`, `src/test/fake-ai.ts`, `eval/novel/steps/chapter.ts`, `eval/novel/metrics.ts`, `eval/novel/eval-client.ts`, `eval/novel/steps/finish.ts`, `eval/novel/agents/author.md` (do NOT edit: it is the measuring instrument), `docs/eval/novel/follow-up-ai-improvement.md` (section A).

## Design (do in this order)
1. `src/lib/draft-length.ts` (pure, no imports except `countChars`):
   - `draftLengthPlan(target)`: `minChars = target`; `maxChars = Math.floor(target*1.2)`; `sceneCount = Math.max(2, Math.round(target/1500))`; `charsPerScene = Math.ceil(target/sceneCount)`. (5000 gives 5000, 6000, 3, 1667. 12100 gives 12100, 14520, 8, 1513.)
   - `draftCharCount(text)` = `countChars(text.trim()).withSpaces`.
   - `continuationPlan(count, target)`: returns `null` when `count >= target`. Else `remaining = target - count`, `askMin = Math.ceil(remaining*1.3)` (models undershoot asks), `askMax = Math.max(askMin, maxChars - count)`. Return `{ count, askMin, askMax }`. (3505, 5000 gives askMin 1944, askMax 2495.)
   - `continuationSeparator(first)`: `''` if `first` ends with `\n\n`, `'\n'` if it ends with one `\n`, else `'\n\n'`.
2. `src/lib/text-pipe.ts`: `createTextPipe()` is an unbounded queue. `push(chunk)`, `end()`, `fail(error)`, and `iterable` (AsyncIterable<string>). A consumer receives every buffered chunk first, then ends normally or throws the `fail` error. Pushes after `end`/`fail` are ignored. It works even if nobody iterates (the eval never reads it).
3. `src/ai/run.ts`: export `replaceRunOutput(db, runId, output: unknown): Promise<void>`, an `update aiRuns set output where id` (same style as `finishRun`).
4. `src/db/types.ts`: add `'draft-continue'` to `AI_TASKS`.
5. `src/ai/tasks/draft-chapter.ts`. Line numbers in steps 5 and 6 are hints only and shift after edits; anchor every edit by its quoted text. Do the `DRAFT_SYSTEM` edit and the `buildDraftPrompt` edit as two separate edits, each with its own exact before/after string:
   - In the `DRAFT_SYSTEM` array, replace the exact rule string `- 목표 분량에 가깝게 쓴다.` (about line 13) with: `- <target_length>의 최소 분량 이상 쓰고 최대 분량은 넘기지 않는다. 분량이 모자라면 사건을 늘리지 말고 장면 묘사와 대사를 더 쓴다. <scene_budget>이 있으면 장면마다 그 분량을 채운다.` Insert right after it: `- <draft_so_far>가 있으면 그 글 바로 뒤에서 이어 쓴다. 앞부분을 다시 쓰거나 요약하지 않고 이어 쓸 부분만 출력한다. <continue_length>의 분량을 지킨다.`
   - In `buildDraftPrompt` replace the exact line `<target_length>약 ${input.targetChars}자</target_length>` (about line 42) with two lines (compute with `draftLengthPlan(input.targetChars)`; plain digits, no thousands commas):
     `<target_length>공백 포함 ${minChars}자 이상, ${maxChars}자 이하</target_length>`
     `<scene_budget>장면 ${sceneCount}개, 장면마다 공백 포함 ${charsPerScene}자 안팎</scene_budget>`
   - Add `buildContinuationPrompt(raw: DraftPromptInput, draftSoFar: string): string`: `buildDraftPrompt(raw)` + `\n\n<draft_so_far>\n` + `neutralizeTags(draftSoFar)` + `\n</draft_so_far>\n<continue_length>지금까지 ${count}자를 썼다. 이어서 공백 포함 ${askMin}자 이상, ${askMax}자 이하로 쓴다.</continue_length>`. Use `continuationPlan(draftCharCount(draftSoFar), raw.targetChars)`. If it returns null, throw a plain `Error`: this is a pure prompt builder and the throw is an internal invariant (the caller never calls it when the plan is null), so the CLAUDE.md rule "services throw AppError" does not apply to it. Import `neutralizeTags` from `@/ai/prompt-utils`.
   - Export `CONTINUE_EFFORT = 'low' as const` and `CONTINUE_MAX_TOKENS = DRAFT_MAX_TOKENS`. The continuation uses the same `DRAFT_SYSTEM` (so the e2e stub and the system-keyed tests keep working).
6. `src/server/ai-features.ts` `startDraft` (find it by name; the line numbers above are hints): make `const startedAt = Date.now()` the FIRST statement of `startDraft`, before the `instructions` check and before `requireWorkRole` (the role check, `getWork`, `listChapters`, `listStyleCards`, `buildContextPack` and `buildDraftPrompt` all take time that counts against the route's 300 s `maxDuration`). Keep everything else up to building `prompt` as today; keep the `DraftPromptInput` object in a variable `promptInput`. Then:
   - `first = await startAiStream(...)` exactly as today (task `draft-chapter`).
   - `const pipe = createTextPipe()`; `const done = (async () => {...})()`; `done.catch(() => {})`. Return `{ runId: first.runId, textStream: pipe.iterable, done }`.
   - Inside `done` (no dependency on anyone reading `textStream`):
     a. `try { for await (const c of first.textStream) pipe.push(c); firstText = await first.done } catch (e) { pipe.fail(e); throw e }`.
     b. `plan = continuationPlan(draftCharCount(firstText), targetChars)`. If `plan === null`, or `signal?.aborted`, or the remaining time is below `MIN_CONTINUATION_MS = 30_000`: `pipe.end(); return firstText`. Remaining time: `DRAFT_TOTAL_BUDGET_MS = 290_000` (route `maxDuration` is 300 s) minus `Date.now() - startedAt`, capped at `STREAM_AI_TIMEOUT_MS` (already exported from `@/ai/run`). The 290 s guard is enforced in code here and proven by the unit test only: the eval harness sets `setAiTimeoutOverride(profile.timeoutMs)` (`eval/novel/run.ts:126`) and `startAiStream` uses `timeoutOverrideMs ?? meta.timeoutMs` (`src/ai/run.ts:143`), so in the eval the continuation's timeout is the model profile's, not `remaining`. Do not change `startAiStream` for this. `draft-continue` needs no entry in `eval/novel/eval-client.ts` `TASK_DEFS` (`draft-chapter` has none either): both use the `STREAM_AI_TIMEOUT_MS` (280000) fallback for `wouldTimeOut`.
     c. Start the continuation: `startAiStream(db, { userId, workId, chapterId, signal, timeoutMs: remaining }, { task: 'draft-continue', input: { instructions }, effort: CONTINUE_EFFORT, maxTokens: CONTINUE_MAX_TOKENS, system: DRAFT_SYSTEM, prompt: buildContinuationPrompt(promptInput, firstText) }, client)`. Pass the same `client`.
     d. Stream the continuation with exactly this loop (`separator` is computed once as `continuationSeparator(firstText)`). The separator is pushed lazily, only together with the first non-whitespace continuation text, so a failure or an empty answer before any text leaves the stream clean:
        ```ts
        const separator = continuationSeparator(firstText)
        let started = false
        let streamedContinuation = '' // exactly what was pushed after firstText
        for await (const c of cont.textStream) {
          let chunk = c
          if (!started) {
            chunk = chunk.trimStart()
            if (chunk === '') continue // whitespace-only chunks are never pushed
            started = true
            streamedContinuation += separator
            if (separator) pipe.push(separator)
          }
          streamedContinuation += chunk
          pipe.push(chunk)
        }
        ```
        `started` is false until some text was pushed. For a non-empty answer, `streamedContinuation === separator + contText.trimStart()` where `contText = await cont.done`.
     e. `contText = await cont.done`. If `started` is false (the continuation returned nothing or only whitespace, no error), nothing was pushed: `pipe.end(); return firstText` and do NOT call `replaceRunOutput` (the first run row stays as is; no separator is added). Otherwise `joined = firstText + streamedContinuation` (the same text the stream carried, so `streamed === await done`). `await replaceRunOutput(db, first.runId, { text: joined })`; `pipe.end()`; `return joined`.
     f. Continuation errors (from `startAiStream` or from the stream), decided by this table:
        - `signal?.aborted`: `pipe.fail(error); throw error`.
        - `started` is true (some continuation text was already pushed): `pipe.fail(error); throw error` (the author sees the error after the partial text; the first run row keeps the first text).
        - nothing pushed and `error instanceof AppError && (error.code === 'AI_LIMIT' || error.code === 'CONFLICT')` (our own start guards in `assertCanStartRun`: daily limit, concurrent-run cap): swallow, `pipe.end(); return firstText` (a short draft; the completion warning in `chapter-length.ts` still applies).
        - nothing pushed and any other error (provider failure, timeout, provider rate limit, network): `pipe.fail(error); throw error`. Reason: the eval classifies provider usage/rate-limit and network errors as external failures (`eval/novel/eval-client.ts` `LIMIT_PATTERN`, `NETWORK_PATTERN`) from the client's recorded failure, which `withModelRetry` (`eval/novel/steps/util.ts`) reads with `takeLastFailure()` only when `startDraft`/`done` rejects. A swallowed provider error would hide an external limit hit from the pause logic and leave a stale recorded failure that a later call could be blamed for. In the product the author keeps the first text: its run row is `done` and `createChapterFromDraft` works on that `runId`.
        Effect to document and test: in the eval a continuation failure rejects `done`, so `withModelRetry` (`eval/novel/steps/chapter.ts` ~112-124) retries the whole `startDraft` once for a model failure (a second `draft-chapter` call and possibly a second continuation), and an external failure pauses the run. The "draft-chapter calls per attempt = 1" metric therefore holds only for runs without a continuation failure; the acceptance table records the extra calls.
   - `startAiStream` runs `assertCanStartRun` (daily token limit and the concurrent-run cap, `src/ai/run.ts`) on each call. The first run is already finished when the continuation starts (step 6a awaited `first.done`), so the concurrency cap is not hit by our own run. A daily-limit error (`AI_LIMIT`) or a cap error (`CONFLICT`) at the continuation start is a start error under rule f: nothing was pushed, so it is swallowed and the first text is returned.
   - Never write wiki tables. Only `ai_runs` rows change. `requireWorkRole` already ran at the top; do not add a second path.
7. Fakes: in `src/test/ai-fakes/draft-chapter.ts` add `fakeDraftContinue(input)` returning `'(데모 이어쓰기) '` plus the `FILLER` sentences joined by `\n\n`, at least 600 characters. Register `'draft-continue': fakeDraftContinue` in `FAKE_TEXT` (`src/test/ai-fakes/index.ts`).
8. Existing tests: fakeDraft is about 700 chars, below the default target 5500, so a continuation now fires in tests that omit `targetChars`. Add `targetChars: 500` to the `startDraft` calls and route request bodies in `ai-features.test.ts` and `route.test.ts` that do not test continuation (500 is the route minimum; fake text >= 600 passes without a continuation). Update `draft-chapter.test.ts`: the exact `DRAFT_SYSTEM` array (new line 13 and the new line after it), and the prompt tests (target now appears as `공백 포함 5500자 이상`).
9. English eval parity (`eval/novel/localize`):
   - `en-systems.ts`: in `DRAFT_CHAPTER_SYSTEM` replace the "Aim close to the target length." rule with `- Write at least the minimum length in <target_length> and do not exceed the maximum. If the text runs short, do not add events; write more scene description and dialogue. If <scene_budget> is given, fill that length in every scene.` and add after it `- If <draft_so_far> is given, continue right after that text. Do not rewrite or summarize the earlier part; output only the continuation. Keep to the length in <continue_length>.` Add `'draft-continue': DRAFT_CHAPTER_SYSTEM` to `EN_SYSTEMS`.
   - `scaffold.ts`: add these rules in the "Fixed phrases" block, BEFORE the existing `약 (\d+)자` rule and in this order (the first must precede the second; avoid the bare word 목표 in new strings because a later rule turns it into "Goal"):
     1. `/지금까지 (\d+)자를 썼다\. 이어서 공백 포함 (\d+)자 이상, (\d+)자 이하로 쓴다\./g` to `Written so far: $1 characters. Continue with at least $2 and at most $3 characters including spaces.`
     2. `/공백 포함 (\d+)자 이상, (\d+)자 이하/g` to `at least $1 and at most $2 characters including spaces`
     3. `/장면 (\d+)개, 장면마다 공백 포함 (\d+)자 안팎/g` to `$1 scenes, about $2 characters per scene including spaces`
   - `localize.test.ts`: add `'draft-continue': buildContinuationPrompt({...same input as the draft-chapter entry}, 'Mina opened the door.')` to `PROMPTS`.

## Interface
```ts
// src/lib/draft-length.ts
export function draftLengthPlan(target: number): { minChars: number; maxChars: number; sceneCount: number; charsPerScene: number }
export function draftCharCount(text: string): number
export function continuationPlan(count: number, target: number): { count: number; askMin: number; askMax: number } | null
export function continuationSeparator(first: string): '' | '\n' | '\n\n'
// src/lib/text-pipe.ts
export function createTextPipe(): { push(chunk: string): void; end(): void; fail(error: unknown): void; iterable: AsyncIterable<string> }
// src/ai/run.ts
export async function replaceRunOutput(db: Db, runId: string, output: unknown): Promise<void>
// src/ai/tasks/draft-chapter.ts
export function buildContinuationPrompt(raw: DraftPromptInput, draftSoFar: string): string
export const CONTINUE_EFFORT: 'low'
export const CONTINUE_MAX_TOKENS: number
// startDraft keeps its signature and return type: { runId; textStream; done }. done resolves with the full (joined) text.
```

## Tests (TDD cases)
`src/lib/draft-length.test.ts`
- plan 5000: `{5000, 6000, 3, 1667}`; plan 12100: sceneCount 8; plan 500: sceneCount 2, charsPerScene 250.
- `draftCharCount('가 나\r\n다 ')` = 4 (trim, CR/LF excluded, inner space counted).
- `continuationPlan(3505, 5000)` = `{count:3505, askMin:1944, askMax:2495}`; `(5000, 5000)` and `(5200, 5000)` = null; `(100, 500)` gives askMin 520, askMax 520.
- separator: `'a\n\n'` gives `''`, `'a\n'` gives `'\n'`, `'a'` gives `'\n\n'`.
`src/lib/text-pipe.test.ts`
- chunks pushed before iteration are read in order, then end. A `fail` after chunks throws after the buffered chunks. Push after `end` is ignored. Works with no consumer (no unhandled rejection).
`src/ai/run.test.ts`
- `replaceRunOutput` changes `output` of a done run and leaves status and tokens unchanged.
`src/ai/tasks/draft-chapter.test.ts`
- Exact system array updated. Prompt for target 5500 contains `공백 포함 5500자 이상, 6600자 이하` and `<scene_budget>장면 4개, 장면마다 공백 포함 1375자 안팎</scene_budget>` and no `약 5500자`.
- `buildContinuationPrompt` contains the base sections, the draft text inside `<draft_so_far>`, and `지금까지 3000자를 썼다` for a 3000-char draft with target 5500 (askMin 3250). A draft containing `</draft_so_far>` has the closing tag neutralized (`＜/draft_so_far>`). A draft at or above target throws.
`src/server/ai-features.test.ts` (use `vi.spyOn(client, 'streamText')`; `FakeAiClient` overrides only see `task.input`)
- "continues once when the first draft is short": `targetChars: 5000`, fake text about 700 chars. `streamText` called 2 times; second call `task.name` is `draft-continue` and its prompt contains the first text. `streamed === await done`; done text equals first text + separator + continuation text; the first run row `output` is `{ text: done }`; the continuation row exists with task `draft-continue`.
- "does not continue when the first draft reaches the target": `overrides['draft-chapter']` returns 600 chars, `targetChars: 500`. One call.
- "continues at most once": the continuation also stays short. Exactly 2 calls, no error.
- "createChapterFromDraft keeps the continuation": chapter body equals done text.
- "start guard error before any text keeps the first text": spy `streamText` so call 2 throws `new AppError('CONFLICT', '...')` (rule 6f swallows `AI_LIMIT` and `CONFLICT` only). `done` resolves with the first text; the first run is `done`; the `draft-continue` row has status `error`.
  ```ts
  const original = client.streamText.bind(client)
  vi.spyOn(client, 'streamText')
    .mockImplementationOnce(original)
    .mockImplementationOnce(() => { throw new AppError('CONFLICT', 'busy') })
  ```
- "other continuation error before any text rejects": same spy, but call 2 throws `new Error('boom')` (startAiStream wraps it as an `AI_ERROR`). `done` rejects, `textStream` yields the first text and then throws, the first run row output is still the first text and its status is `done`.
- "continuation failure after partial text rejects": call 2 returns a hand-built stream (`FakeAiClient` overrides must return a string, so they cannot do this). Attach a catch handler to `final` before returning it, otherwise the rejected promise is an unhandled rejection:
  ```ts
  const original = client.streamText.bind(client)
  const final = Promise.reject(new Error('boom'))
  final.catch(() => {})
  vi.spyOn(client, 'streamText')
    .mockImplementationOnce(original)
    .mockImplementationOnce(() => ({
      textStream: (async function* () { yield 'partial'; throw new Error('boom') })(),
      final,
    }))
  ```
  `textStream` yields the first text, then the separator and `partial`, then throws; `done` rejects; the first run row output is still the first text.
- "skips the continuation when the signal is aborted": abort after the first stream. No second call.
- "skips the continuation when under 30 s remain": do NOT use `vi.useFakeTimers` (it does not control the `AbortSignal.timeout` made inside `startAiStream` and can hang the first stream). Use a Date spy: `const base = Date.now(); let offset = 0; const now = vi.spyOn(Date, 'now').mockImplementation(() => base + offset)`, and restore it in `afterEach` (`now.mockRestore()`). Set `offset = 270_000` inside the `overrides['draft-chapter']` function (it runs after `startedAt` was read in step 6 and before the remaining-time read in step 6b, so remaining = min(290_000 - 270_000, 280_000) = 20_000 < 30_000). A uniform offset does not disturb other code that reads `Date.now`. Assert `streamText` was called once and `done` resolves with the first text.
- "continuation returning only whitespace keeps the first text": override `draft-continue` to return `'   '`. `done` resolves with the first text, the first run row `output` is unchanged, and `streamed === first text`.
- "daily limit reached before the continuation keeps the first text": `FakeAiClient.streamText` always reports zero usage (`src/test/fake-ai.ts`), so the first run alone cannot push the user over the limit. Set `process.env.AI_DAILY_TOKEN_LIMIT = '1000'` in the test (restore the old value in `afterEach`). Wrap the first call's `final` so that, after the stream finishes and before `startAiStream` stores the run, an `aiRuns` row is inserted:
  ```ts
  const original = client.streamText.bind(client)
  vi.spyOn(client, 'streamText').mockImplementationOnce((args) => {
    const stream = original(args)
    return {
      ...stream,
      final: stream.final.then(async (result) => {
        await db.insert(aiRuns).values({ userId: actor.userId, workId, task: 'draft-chapter', status: 'done', model: 'fake', inputTokens: 1_000_000, outputTokens: 0 })
        return result
      }),
    }
  })
  ```
  (Adjust the column list to the required `ai_runs` columns, `src/db/schema.ts` ~535-545; later calls use the real `streamText`.) Then `assertCanStartRun` throws `AI_LIMIT` for the continuation before `insertRun`, so rule 6f swallows it: `done` resolves with the first text, the first run is `done`, no `draft-continue` row exists.
- "done resolves without reading textStream" (the eval path): short first draft, `await done` only. Two calls were made.
`route.test.ts`: "streams the continuation after the first part in one body": body request with `targetChars: 5000`; response text length is above the fake draft length and starts with `(데모 초안) ` and contains `(데모 이어쓰기) `.
`localize.test.ts`: the existing generic tests must pass with the new entry (no Hangul left, same tag order).

## Acceptance metrics
Measured by re-running the eval harness (new date folder; do not overwrite 2026-10-18). Unit tests prove the logic; the numbers need the orchestrator's eval run.
| metric | current | target |
|---|---|---|
| T3 pass, cloud (haiku ko/en, luna ko/en) | 1/4 | 4/4 |
| T3 pass, all six | 3/6 | 6/6 |
| chapter chars, any run | min 69.5% of target | ko >= 100%, en >= 80%, all <= 130% |
| draft-chapter calls per attempt (`calls.byTask['draft-chapter'].count` divided by attempts) | 1 | 1, except when a continuation fails after partial text or with a provider error: the eval then retries `startDraft` once (see step 6f), so a second `draft-chapter` call and its tokens are expected and must be listed in the report |
| draft-continue calls per attempt (`run-summary.json` `calls.byTask`) | none | <= 1; 0 when the first draft already passes (Luna en may or may not trigger) |
| draft time per attempt (reported, not gated) | one `draft-chapter` call | the sum of `durationMs` of the `draft-chapter` and `draft-continue` entries in `calls/*.json` for one attempt (or `run-summary.json` `calls.byTask` / `speed.byTask` totals of those two tasks) is about one extra draft call (about 90 s on cloud). The 290 s route budget is enforced in code (step 6b) and proven by the unit test; the eval overrides the stream timeout with the model profile's, so it reports this number and does not gate on it |
| whole-chapter time (reported only) | haiku ko 213 s, luna ko 400 s model time (2026-10-18) | record `run-summary.json` `speed.perChapterMs` (union of all calls of a chapter, built in `eval/novel/steps/finish.ts`) and `speed.perChapterModelMs`; it includes extract, check, proofread and reader-sim calls, so there is no 290000 limit on it |
| total draft tokens per chapter (`run-summary.json` `calls.byTask['draft-chapter'].tokens` + `calls.byTask['draft-continue'].tokens`, input + output, built in `buildRunSummary`, `eval/novel/steps/finish.ts`; the same data is in `usage` of `calls/*.json`) | one call | record before and after; the continuation resends the wiki pack and the whole first draft, so expect up to about 2x input tokens |
| quality mean (reviewer) | haiku ko 3.67, en 3.78 | no drop over 0.1 |

## Dependencies on other tracks
- A is the first track to change `DRAFT_SYSTEM` and the e2e stub's draft answer (`e2e/ai-stub/responders.ts` line 45, `answer: () => DRAFT_TEXT`). Other briefs assert the opposite ("unchanged", "pinned": D.md lines 25, 48, 161, 207; E1.md lines 50, 154; C.md lines 127, 176) and B.md line 53 says to keep the `DRAFT_SYSTEM` line count while A inserts a line. After A merges, those assertions are superseded: the orchestrator must update the exact-array tests (`draft-chapter.test.ts` `DRAFT_SYSTEM`) and `EN_SYSTEMS['draft-chapter']` in merge order (A, then B, E1, E2), and the "no change to `DRAFT_SYSTEM`/`responders.ts`" final checks in D.md and E1.md and the line-count note in B.md need an update before those briefs are handed out (this brief does not edit them). Until then, a worker on D, E1 or C must treat A's change as the new baseline.
- D (two-step draft with beat list) edits the same `startDraft` and `draft-chapter.ts`. Land A first; D should reuse `draftLengthPlan` for per-beat budgets.
- C (foreign script), E1/E2 (paragraph, style copy) add rules to `DRAFT_SYSTEM`. Each such change must update the exact array test, `EN_SYSTEMS['draft-chapter']` and the scaffold, as in step 9.
- Eval-side tracks that edit `eval/novel/steps/chapter.ts`/`metrics.ts` are independent of this brief.

## Risks
- Route `maxDuration` is 300 s while one stream may run 280 s. The time guard in step 6b prevents a second call from passing 290 s in total. A local model whose first draft takes over 260 s gets no continuation (acceptable; Qwen already passes T3).
- DRAFT_MAX_TOKENS is 16000 in the product, but the eval floors it at 32000 for most models (`eval/novel/eval-client.ts` ~451: `Math.max(productMaxTokens, profile.maxTokensFloor)`; exaone3.5-32b is 8192, `models.ts` ~68-69). Truncation of a 5,000 ko draft at 16000 tokens is possible for Haiku (it used about 13,200 output tokens for 3,505 chars) and the eval cannot show it. Do not change the cap in this track.
- Overshoot above 130%: prompt max is 120% and the continuation ask is capped by `askMax`; a model may still exceed it. Not enforced in code.
- Eval tests (`eval/novel/run.test.ts`, `eval-client.test.ts`, `finish.test.ts`) use `FakeAiClient` drafts shorter than the 5000 target, so a continuation now occurs there. Fix any call-count assertions by passing the target-aware fake or adjusting counts; do not change production code for them.
- The continuation doubles the daily token use of a short draft (the full context pack and the first draft are sent again) and can hit the daily limit; rule 6f swallows that error and returns the first text.
- Changing `DRAFT_SYSTEM` changes the measured prompt for every model; results are not comparable to 2026-10-18 without a new date folder.
- Eval en counts characters, product has no language setting; the en prompt text states characters, not words (the "en word range" wording in the backlog is wrong).

## Open questions (decided here unless the orchestrator objects)
- Minimum = work `targetChars` (not 5,000), trigger = below 100% of target, same as ko T3 and `lengthShortfall`. The en eval floor stays 0.8 in `metrics.ts`; the app asks for more, which is safe.
- One continuation, separate `draft-continue` run row, text merged into the first run row (so `createChapterFromDraft` is unchanged and exports do not list the continuation as a draft).
- Open: should `author.md` stop accepting short drafts? Out of scope (it changes the instrument); needs the orchestrator.
- Open: show "이어 쓰는 중" in `draft-panel.tsx`? Not done; the stream just continues.

## Definition of done
Run in the worktree, all green, before reporting:
- `pnpm vitest run src/lib/draft-length.test.ts src/lib/text-pipe.test.ts src/ai src/server/ai-features.test.ts "src/app/api/works/[workId]/draft/route.test.ts" src/components/writing/panels/draft-panel.test.tsx eval/novel --maxWorkers=2`
- `pnpm exec tsc --noEmit` (filter output to your files; nothing new)
- `pnpm eslint src/lib src/ai src/server src/test eval/novel e2e/ai-stub`
- `pnpm format` (or prettier on touched files)
- `pnpm vitest run e2e/ai-stub --maxWorkers=2`
- E2E: `e2e/core-flow.spec.ts` and `e2e/editor-scroll.spec.ts` mention drafts only in comments (the editor draft, not the AI draft) and no spec asserts AI draft output, so no e2e spec should change. If a browser is available, run `pnpm e2e` once and confirm it stays green; otherwise state that it was not run.

# Lightweight-Model Novel Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project the orchestrator (Opus) dispatches each task to a Haiku implementer through Claude Code Workflows; Sonnet reviews each wave and the whole branch at the end.

**Goal:** A rerunnable harness that drives the real app services through a 5-chapter novel with one model under test (3 local Ollama models, Haiku, Luna; Korean and English), with Sonnet playing the author and reviewing each run against `docs/eval/novel-quality-criteria.md`, then records per-run reviews and a 10-run comparison.

**Architecture:** `eval/novel/` holds a resumable step machine (`runUntilBlocked`) over a file-backed PGlite DB per run. Every AI call goes through `EvalClient`, which wraps the model client (new `OllamaAiClient`, or the existing `OpencodeAiClient`), forces max effort and a high output floor, swaps Korean prompts for English ones on English runs, logs each call, and classifies failures (external limit / external network / model). Author decisions are exchanged through `pending.json` / `answer.json` in the run folder; a CLI (`pnpm eval:novel`) runs a detached worker so long local steps never die with an agent timeout. A saved Claude Code workflow (`.claude/workflows/novel-eval.js`) loops runner (Haiku) → author (Sonnet) per run, two queues in parallel (local, cloud), then reviewer and summary (Sonnet).

**Tech Stack:** TypeScript 5.9, tsx, Node 24, Drizzle 0.45 + PGlite 0.5.10, zod 4, Vitest 5, Ollama 0.32 HTTP API (`/api/chat`), existing `@/ai/*` clients. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md` (Korean, §-numbers point into it) and `docs/eval/novel-quality-criteria.md` (review rubric: T1–T7, Q1–Q9, verdicts).

## Global Constraints

- No package added, removed or upgraded (spec §10).
- Product behaviour unchanged: Korean prompts, per-task effort, time limits and the daily limit default stay as they are. The only product-code change is the timeout override seam in `src/ai/run.ts` (Task 2), which is a no-op unless the harness calls it (spec §10).
- No English text in product code. English prompts live in `eval/novel/localize/` (spec §6.5).
- Tests never call a real AI API or a real Ollama server; inject `fetch` / use `FakeAiClient` from `@/test/fake-ai`.
- Identifiers and comments English; author-facing and review documents Korean for `ko` runs, English for `en` runs.
- Run folders live under `eval/results/novel/` (already gitignored). Committed records go to `docs/eval/novel/<date>/`.
- Fixed values: chapters `5`; interview questions `12`; draft redos `2` (3 attempts); external pauses before `blocked` `3`; harness extra model retry `1`; output-token floor `32000`; worker poll window default `540` s; Korean target `5000` chars with spaces.
- Model ids: `qwen3.8-27b`, `gpt-oss-20b`, `exaone3.5-32b`, `haiku-5.5` (`claude-haiku-5-5`), `luna-6` (`gpt-6-luna`), plus `fake` for tests.
- Parallel agents: run `pnpm vitest run <paths> --maxWorkers=2` and `pnpm exec tsc --noEmit 2>&1 | grep <your files>`; do not run `pnpm build` or `pnpm e2e`.
- Do not commit. The orchestrator commits after each wave. Pushing to the public GitHub repo needs the user's OK.

## Review Focus

1. **Korean leaking into English runs at runtime** — service-built strings (stored questions, chapter labels, DB rows) can carry Hangul that the scaffold table never saw. Each call log must record `hangulLeft`, and the run summary must total it. Test in Task 3 (`eval-client.test.ts`: en mode, prompt with residual `회차` → log `hangulLeft > 0`).
2. **Silent context truncation in Ollama** — Ollama drops prompt tokens past `num_ctx` without an error. A call whose `inputTokens + outputTokens >= numCtx` must be logged `contextOverflow: true`. Test in Task 3.
3. **Crash between a side effect and the state save** — the worker dies after `createChapterFromDraft` but before `saveState`. Resume must not create a second chapter. Test in Task 6 (`throwAfter` hook fires once after chapter creation → resume → exactly one chapter at position 1).
4. **Bad author answers** — malformed JSON, wrong `kind`, missing ids. The run stays `pending`, the answer file is moved aside and `answer.error.txt` says why. Test in Task 5.
5. **Thinking text in content** — local models may put `<think>…</think>` inside `message.content` (or think when asked not to). The Ollama client strips leading think blocks before parsing or streaming. Test in Task 1.

## Spec Deviations Decided in Planning

These were found while reading the code. The spec text is updated to match.

- **§6.5 English seam.** No language seam in product code. Every AI call carries `task: { name, input }` and passes through the client, so `EvalClient` can do the swap itself: it replaces `system` by task name and runs `translateScaffold` over the finished prompt. Product code gets only the timeout seam.
- **§6.3 style.** `suggestStyleCard` builds a card from a character's dialogue lines in saved chapters (at least 3). So it cannot run before chapter 1.
  - The bible's sample becomes the work style card. The author seeds it in `setup`.
  - Character style suggestions run after chapter 2 (`style:suggest`, `style:review`) and feed drafts 3–5.
- **§6.3 interview focus.** The question model picks `setting` or `story` itself. The harness asks 12 questions and records the split in `focusCounts`, instead of forcing 8 and 4.

---

## Execution Model (orchestrator notes)

| Wave | Tasks (parallel inside a wave) | Why this order |
|---|---|---|
| 1 | Task 1 (Ollama client), Task 4 (bible schema + loader), Task 7 (chapter metrics) | No shared files; later tasks import them |
| 2 | Task 2 (models + timeout seam), Task 3 (eval client + localize), Task 5 (state + author I/O) | Task 3 needs Task 1 types only through `AiClient`; Task 2 needs Task 1 |
| 3 | Task 6 (step machine) | Needs 2, 3, 4, 5, 7 |
| 4 | Task 8 (CLI + worker), Task 9 (agents + workflow) | Need Task 6 |
| 5 | Task 10 (model setup), then Task 11 (pilot) | Operational; real models |
| 6 | Task 12 (full matrix, reviews, summary) | Operational; stops and reports to the user |

Sonnet reviews each of waves 1–4 before the next wave starts. Task 3's English prompts get an extra Sonnet parity review against the Korean originals (spec §6.5).

Fixtures written by Opus together with this plan (not a Haiku task): `eval/fixtures/novel/ko/bible.json`, `eval/fixtures/novel/en/bible.json`, `eval/fixtures/novel/ko/author-guide.md`, `eval/fixtures/novel/en/author-guide.md`.

## File Map

| File | Responsibility |
|---|---|
| `src/ai/ollama.ts` | `OllamaAiClient`: `/api/chat` structured + streaming, think stripping, JSON retry |
| `src/ai/run.ts` (modify) | `setAiTimeoutOverride(ms)` seam |
| `eval/novel/models.ts` | `MODEL_PROFILES`, `createModelClient(profile)` |
| `eval/novel/eval-client.ts` | `EvalClient` wrapper, `CallLog`, `classifyError` |
| `eval/novel/localize/en-systems.ts` | English system prompt per `AiTaskName` |
| `eval/novel/localize/scaffold.ts` | `translateScaffold`, `findHangul` |
| `eval/novel/bible.ts` | `BibleSchema`, `loadBible(lang)` |
| `eval/novel/metrics.ts` | `chapterMetrics(text, lang, targetChars)` |
| `eval/novel/state.ts` | `RunConfig`, `RunState`, atomic load/save, run plan |
| `eval/novel/author-io.ts` | Pending/Answer zod schemas, `writePending`, `readAnswer`, decisions log |
| `eval/novel/fake-author.ts` | `fakeAnswer(pending, bible)` for tests and `--fake-author` |
| `eval/novel/steps/*.ts` | Step implementations (setup, interview, chapter, style, finish) |
| `eval/novel/run.ts` | `openRun`, `runUntilBlocked`, `withModelRetry` |
| `eval/novel/cli.ts` | `init`, `advance`, `worker`, `status`, `probe-ctx` |
| `eval/novel/agents/{author,reviewer,resume-note,summary}.md` | Prompts the workflow agents read |
| `.claude/workflows/novel-eval.js` | Saved workflow |
| `docs/eval/novel/model-setup.md` | Model variants, sampling sources, measured `num_ctx` (Task 10) |

---

### Task 1: Ollama client

**Files:**
- Create: `src/ai/ollama.ts`
- Test: `src/ai/ollama.test.ts`

**Interfaces:**
- Consumes: `AiClient`, `GenerateObjectArgs`, `StreamTextArgs`, `AiUsage` from `@/ai/types`; `safeParseAnswer`, `jsonInstruction`, `FORMAT_MESSAGE`, `MAX_TOKENS_MESSAGE` from `@/ai/anthropic`; `AppError` from `@/lib/errors`.
- Produces:
  ```ts
  export type OllamaThink = boolean | 'low' | 'medium' | 'high'
  export interface OllamaOptions {
    model: string; numCtx: number; baseUrl?: string /* default process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434' */
    temperature?: number; topP?: number; topK?: number; minP?: number
    think?: OllamaThink; keepAlive?: string /* default '30m' */; fetch?: typeof fetch
  }
  export class OllamaHttpError extends Error { readonly status: number }
  export class OllamaAiClient implements AiClient { readonly provider = 'ollama'; readonly defaultModel: string; constructor(o: OllamaOptions) }
  export function stripThink(text: string): string
  ```

- [ ] **Step 1: Write the failing tests** (`ollama.test.ts`, injected `fetch` that records the request body and returns canned JSON / NDJSON):
  - `sends schema, options and think`: `generateObject` with `z.object({ a: z.string() })`, `maxTokens: 4000`, client `{ numCtx: 65536, temperature: 0.6, topP: 0.95, topK: 20, think: true }` → body has `stream: false`, `format` equal to `z.toJSONSchema(schema)`, `options: { num_ctx: 65536, temperature: 0.6, top_p: 0.95, top_k: 20, num_predict: 4000 }`, `think: true`, messages `[system, user]`; returns `{ object: { a: 'x' }, usage: { inputTokens: 10, outputTokens: 5 }, model }` from `prompt_eval_count: 10, eval_count: 5`.
  - `retries once with a JSON instruction`: first reply content `not json`, second `{"a":"x"}` → 2 requests, second user message ends with `jsonInstruction(schema)`, usage summed.
  - `fails with FORMAT_MESSAGE after the retry`: both invalid → throws `AppError` code `AI_ERROR`, message `FORMAT_MESSAGE`, `details.usage` summed.
  - `length stop`: `done_reason: 'length'` → `AppError` with `MAX_TOKENS_MESSAGE`.
  - `strips think blocks`: content `<think>plan</think>\n{"a":"x"}` parses; `stripThink('<think>a</think>본문')` → `'본문'`; text without a think block is unchanged.
  - `streams content, not thinking`: NDJSON chunks with `message.thinking` then `message.content` pieces `'가'`, `'나'`, final chunk `done: true, prompt_eval_count: 7, eval_count: 3` → collected text `'가나'`, `final` resolves `{ text: '가나', usage: { inputTokens: 7, outputTokens: 3 } }`; a leading `<think>…</think>` in streamed content is not yielded.
  - `http error`: status 500 → rejects with `OllamaHttpError` whose `status === 500`.
  - `abort`: aborting `args.signal` passes the signal to `fetch`.

- [ ] **Step 2: Run** `pnpm vitest run src/ai/ollama.test.ts --maxWorkers=2` → FAIL (module missing).

- [ ] **Step 3: Implement `OllamaAiClient`** in `src/ai/ollama.ts`.
  - POST `${baseUrl}/api/chat`. `num_predict` is `args.maxTokens`. Omit undefined sampling fields.
  - Policy matches `AnthropicAiClient` with `jsonFallback`: one structured attempt, then one retry with `jsonInstruction`.
  - Errors billed after a reply carry `{ usage }` in `AppError` details.
  - For streaming, parse NDJSON line by line. Buffer the beginning until a think block can be ruled out, then yield.

- [ ] **Step 4: Run** the same command → PASS.

---

### Task 2: Model profiles and the timeout seam

**Files:**
- Create: `eval/novel/models.ts`
- Modify: `src/ai/run.ts` (`runAiTask` and `startAiStream` timeout lines)
- Test: `eval/novel/models.test.ts`, `src/ai/run.test.ts` (add cases)

**Interfaces:**
- Consumes: `OllamaAiClient`, `OllamaOptions` (Task 1); `OpencodeAiClient` (`new OpencodeAiClient(undefined, model)`); `FakeAiClient`.
- Produces:
  ```ts
  // src/ai/run.ts
  export function setAiTimeoutOverride(ms: number | null): void   // timeoutMs = override ?? meta.timeoutMs ?? task/default
  // eval/novel/models.ts
  export const MODEL_IDS = ['qwen3.8-27b', 'gpt-oss-20b', 'exaone3.5-32b', 'haiku-5.5', 'luna-6', 'fake'] as const
  export type ModelId = (typeof MODEL_IDS)[number]
  export type ModelProfile = {
    id: ModelId; queue: 'local' | 'cloud' | 'test'; provider: 'ollama' | 'opencode' | 'fake'
    model: string; effort: AiEffort; maxTokensFloor: number; timeoutMs: number
    ollama?: Omit<OllamaOptions, 'model' | 'fetch' | 'baseUrl'>
    variant: string   // e.g. 'mlx' | 'gguf' | 'api'; filled by Task 10
  }
  export const MODEL_PROFILES: Record<ModelId, ModelProfile>
  export function createModelClient(profile: ModelProfile, o?: { fetch?: typeof fetch }): AiClient
  ```

**Initial profile values:**
- All profiles use `effort: 'max'`, `maxTokensFloor: 32000`.
- `timeoutMs` is `3_600_000` for local models and `900_000` for cloud models.
- Task 10 replaces the ollama numbers and tags with researched and measured ones and records sources.

| id | model | ollama |
|---|---|---|
| qwen3.8-27b | `qwen3.8:27b-mlx` | `numCtx: 65536, temperature: 0.6, topP: 0.95, topK: 20, minP: 0, think: true` |
| gpt-oss-20b | `gpt-oss:20b` | `numCtx: 65536, temperature: 1.0, topP: 1.0, think: 'high'` |
| exaone3.5-32b | `exaone3.5:32b` | `numCtx: 32768, think: false` |
| haiku-5.5 | `claude-haiku-5-5` | — |
| luna-6 | `gpt-6-luna` | — |
| fake | `fake` | — (`FakeAiClient`) |

- [ ] **Step 1: Write failing tests**
  - `run.test.ts`: `setAiTimeoutOverride(30)` + a client whose `generateObject` waits for `signal` abort → `runAiTask` rejects with `AI_TIMEOUT_MESSAGE` within ~200 ms. After `setAiTimeoutOverride(null)`, the timeout passed to the client equals `DEFAULT_AI_TIMEOUT_MS`. Same two checks for `startAiStream` with `STREAM_AI_TIMEOUT_MS`. Reset in `afterEach`.
  - `models.test.ts`:
    - every `MODEL_IDS` entry has a profile with matching `id`
    - local profiles have `ollama.numCtx >= 32768`
    - `createModelClient(MODEL_PROFILES['qwen3.8-27b'])` is an `OllamaAiClient` with `defaultModel 'qwen3.8:27b-mlx'`
    - `luna-6` → `OpencodeAiClient` with `defaultModel 'gpt-6-luna'`
    - `fake` → `FakeAiClient`
- [ ] **Step 2: Run** `pnpm vitest run src/ai/run.test.ts eval/novel/models.test.ts --maxWorkers=2` → new cases FAIL.
- [ ] **Step 3: Implement** the module-level override in `run.ts` (one `let`, used in both functions; doc comment says it is for the eval harness only) and `models.ts`.
- [ ] **Step 4: Run** the same command → PASS; existing `run.test.ts` cases still pass.

---

### Task 3: Eval client and English localization

**Files:**
- Create: `eval/novel/eval-client.ts`, `eval/novel/localize/en-systems.ts`, `eval/novel/localize/scaffold.ts`
- Test: `eval/novel/eval-client.test.ts`, `eval/novel/localize/localize.test.ts`

**Interfaces:**
- Consumes: `AiClient` and arg types; `AI_TASKS`, `AiTaskName` from `@/db/types`; every task def and builder under `src/ai/tasks/*`; `renderContextPack`; `buildDraftPrompt`; `READER_PERSONAS`; `ModelProfile` (Task 2).
- Produces:
  ```ts
  // localize
  export const EN_SYSTEMS: Record<AiTaskName, string>
  export function translateScaffold(prompt: string): string
  export function findHangul(text: string): string[]          // distinct Hangul runs, in order of appearance
  // eval-client
  export type FailureKind = 'external-limit' | 'external-network' | 'model'
  export function classifyError(error: unknown): FailureKind
  export type CallRecord = {
    seq: number; task: AiTaskName; kind: 'object' | 'stream'; startedAt: string; durationMs: number
    model: string; effortRequested: AiEffort; maxTokens: number; productTimeoutMs: number; wouldTimeOut: boolean
    system: string; prompt: string; output: unknown | null; usage: AiUsage | null
    hangulLeft: number; contextOverflow: boolean; error: { kind: FailureKind; message: string; status?: number } | null
  }
  export interface EvalClientOptions {
    inner: AiClient; profile: ModelProfile; lang: 'ko' | 'en'; callsDir: string
    startSeq?: number                       // continue numbering on resume
    now?: () => number
  }
  export class EvalClient implements AiClient {
    constructor(o: EvalClientOptions)
    takeLastFailure(): CallRecord['error']   // returns and clears the last failed call's error
    readonly records: CallRecord[]           // this process only
    get nextSeq(): number                    // seq the next call will get
  }
  ```

- [ ] **Step 1: Write failing tests**

  `localize.test.ts`:
  - `EN_SYSTEMS has an English prompt for every task`: for each name in `AI_TASKS`, the entry is non-empty and `findHangul` returns `[]`.
  - `Korean scaffolding is fully translated`:
    - For each task, build the product prompt from English-content sample inputs written in the test.
      - Structured tasks: `taskDef.buildPrompt(input)`.
      - Draft: `buildDraftPrompt` with a `renderContextPack` of a two-entry English pack.
      - Reader-sim input: `READER_PERSONAS`.
    - Then assert `findHangul(translateScaffold(prompt))` is `[]`.
    - This is the drift guard. A new Korean fragment in a product builder fails here.
  - `XML tags are preserved`: the sequence of `<tag>`/`</tag>` names in the translated prompt equals that in the original for each task.
  - `content is untouched`: an English sentence inside `<instructions>` survives byte-for-byte.

  `eval-client.test.ts` (inner = spy `AiClient`, `callsDir` = temp dir):
  - `forces max effort, profile model and the output floor`: inner receives `effort: 'max'`, `model: profile.model`, `maxTokens: 32000` when the task asked 16000, and `40000` when it asked 40000.
  - `writes one call record per call`: `calls/001-proofread.json` exists with `seq: 1`, `task: 'proofread'`, `usage`, `durationMs >= 0`. `productTimeoutMs` is `120000` for proofread and `280000` for `draft-chapter` streams.
  - `en mode swaps system and translates prompt`: inner receives `EN_SYSTEMS.proofread` and `translateScaffold(prompt)`.
  - `en mode counts Hangul left` (Review Focus 1): a prompt with an untranslated `'회차 메모'` → record `hangulLeft === 4`.
  - `ko mode passes prompts through unchanged`.
  - `flags context overflow` (Review Focus 2): profile `numCtx 1000`, inner usage `{ inputTokens: 990, outputTokens: 20 }` → `contextOverflow: true`. Cloud profile → always `false`.
  - `classifies errors`:

    | error | kind |
    |---|---|
    | `{ status: 429 }` | `external-limit` |
    | `Error('usage limit reached')` | `external-limit` |
    | `TypeError('fetch failed')` | `external-network` |
    | `{ code: 'ECONNREFUSED' }` | `external-network` |
    | `OllamaHttpError(503)` | `external-network` |
    | `AppError('AI_ERROR', FORMAT_MESSAGE)` | `model` |
    | `AppError('AI_ERROR', AI_TIMEOUT_MESSAGE)` | `model` |

  - `records and rethrows failures`: inner throws `{ status: 429 }` → `generateObject` rejects with the same error, the record has `error.kind 'external-limit'`, and `takeLastFailure()` returns it once, then `null`.
  - `streams pass through`: chunks reach the caller unchanged, and the record is written when `final` settles (text in `output.text`).

- [ ] **Step 2: Run** `pnpm vitest run eval/novel --maxWorkers=2` → FAIL.

- [ ] **Step 3: Implement**
  - `EN_SYSTEMS`: faithful English translations of each task's `system` string (read the source of each task file).
    - Keep every rule, its order and the XML tag names.
    - Replace "모든 출력은 한국어로 쓴다"-type lines with "Write all output in English."
    - Translate `TAG_DATA_RULE` too.
    - The interview-question prompt lists `INTERVIEW_TOPICS`; translate them as: protagonist, main characters, world rules, main places, central conflict, foreshadowing, ending direction, style.
  - `translateScaffold`: one ordered replacement table, longest fragments first, built by running the drift-guard test until no Hangul remains. Labels in the table:
    - `현재 회차: N화` → `Current chapter: N`
    - `(없음)` → `(none)`
    - `약 N자` → `about N characters`
    - entry kind labels and character field labels from `renderContextPack`
    - persona names and descriptions
    - `N화` chapter labels → `Chapter N`
  - `EvalClient`: wrap both methods, as specified by the interfaces and tests.
    - `productTimeoutMs` comes from the task def's `timeoutMs ?? DEFAULT_AI_TIMEOUT_MS`, or `STREAM_AI_TIMEOUT_MS` for streams.
    - `numCtx` comes from `profile.ollama?.numCtx`.
    - Records are written with `writeFileSync` as pretty JSON. File names use the zero-padded seq.

- [ ] **Step 4: Run** the same command → PASS.

- [ ] **Step 5 (orchestrator):** Sonnet parity review of `en-systems.ts` against each Korean `system` string. It checks that rules match one-to-one and no rule was added or dropped. Fix before Wave 3.

---

### Task 4: Bible schema and loader

**Files:**
- Create: `eval/novel/bible.ts`
- Test: `eval/novel/bible.test.ts`
- Read (fixtures already written by Opus): `eval/fixtures/novel/{ko,en}/bible.json`

**Interfaces:**
- Produces:
  ```ts
  export const BibleSchema = z.object({
    lang: z.enum(['ko', 'en']),
    work: z.object({ title: z.string(), genre: z.string(), logline: z.string(), synopsis: z.string() }),
    targetChars: z.number().int(),
    characters: z.array(z.object({ key: z.string(), name: z.string(), aliases: z.array(z.string()), role: z.string(), voice: z.string(), main: z.boolean(), summary: z.string() })),
    places: z.array(z.object({ key: z.string(), name: z.string(), aliases: z.array(z.string()), summary: z.string() })),
    items: z.array(z.object({ key: z.string(), name: z.string(), aliases: z.array(z.string()), summary: z.string() })),
    facts: z.array(z.object({ key: z.string(), subject: z.string(), content: z.string(), validFrom: z.number().int().nullable(), validTo: z.number().int().nullable() })),
    threads: z.array(z.object({ key: z.string(), title: z.string(), description: z.string(), plannedChapter: z.number().int().nullable(), targetChapter: z.number().int().nullable(), importance: z.enum(IMPORTANCE) })),
    namingRules: z.array(z.object({ canonical: z.string(), variants: z.array(z.string()), note: z.string() })),
    workStyle: z.object({ name: z.string(), tone: z.string(), rules: z.string(), examples: z.string() }),
    answerBank: z.array(z.object({ key: z.string(), topics: z.array(z.string()), answer: z.string() })),
    chapters: z.array(z.object({ position: z.number().int(), title: z.string(), instructions: z.string(), mustInclude: z.array(z.string()), summary: z.string() })),
  })
  export type Bible = z.infer<typeof BibleSchema>
  export function loadBible(lang: 'ko' | 'en'): Bible
  export function bibleDir(lang: 'ko' | 'en'): string     // eval/fixtures/novel/<lang>
  ```

- [ ] **Step 1: Write failing tests:**
  - both files parse
  - `chapters.length === 5` with positions 1–5
  - every `facts[].subject` names a character, place or item in the same file
  - every `answerBank[].key` is unique
  - **parity:** ko and en have the same keys in every keyed array, the same chapter count, the same `mustInclude` lengths per chapter, and the same `validFrom`/`validTo`/`plannedChapter`/`targetChapter`/`importance` per key
  - `ko.targetChars === 5000`
  - `en.targetChars` is between 9000 and 13000 (Opus measured the ratio on the style sample)
  - `findHangul(JSON.stringify(en))` is empty. Inline a minimal `/[가-힣]/` check so this task does not depend on Task 3.
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/bible.test.ts --maxWorkers=2` → FAIL.
- [ ] **Step 3: Implement** `bible.ts` (`readFileSync` + `BibleSchema.parse`).
- [ ] **Step 4: Run** → PASS. If a fixture fails a check, report it to the orchestrator instead of editing the fixture.

---

### Task 5: Run state and author I/O

**Files:**
- Create: `eval/novel/state.ts`, `eval/novel/author-io.ts`, `eval/novel/fake-author.ts`
- Test: `eval/novel/state.test.ts`, `eval/novel/author-io.test.ts`

**Interfaces:**
- Consumes: `ModelId` (Task 2), `Bible` (Task 4), `ProposalType`, `IssueKind` from `@/db/types`, `AdviceResult` type, `ChapterMetrics` (Task 7, type only).
- Produces:
  ```ts
  // state.ts
  export type RunConfig = { runId: string; modelId: ModelId; lang: 'ko' | 'en'; chapters: number; questions: number; maxDraftAttempts: number; createdAt: string; commit: string }
  export type RunStatus = 'new' | 'running' | 'pending' | 'done' | 'paused-limit' | 'paused-error' | 'blocked'
  export type DraftAttempt = { runId: string; usable: boolean | null; quality: number | null; reason: string }
  export type RunData = {
    userId?: string; workId?: string; sessionId?: string
    asked: number; openTurnId?: string; turnProposalIds?: string[]            // interview progress
    chapterIds: Record<number, string>; drafts: Record<number, DraftAttempt[]>
    marks: Record<string, true>                                               // idempotency markers, e.g. 'ch1:chapter-created'
    styleProposalIds?: string[]; focusCounts: Record<string, number>
  }
  export type RunState = {
    status: RunStatus; cursor: number; plan: string[]; data: RunData
    pauses: Record<string, number>; retried: Record<string, number>
    failed: { step: string; message: string }[]; message: string | null; nextSeq: number; updatedAt: string
  }
  export function buildPlan(c: Pick<RunConfig, 'chapters'>): string[]
  export function newState(c: RunConfig): RunState
  export function loadConfig(dir: string): RunConfig
  export function saveConfig(dir: string, c: RunConfig): void
  export function loadState(dir: string): RunState
  export function saveState(dir: string, s: RunState): void                 // write tmp + rename
  // author-io.ts
  export const PendingSchema: z.ZodDiscriminatedUnion<...>   // kinds below
  export type Pending = z.infer<typeof PendingSchema>
  export const AnswerSchema: z.ZodDiscriminatedUnion<...>
  export type Answer = z.infer<typeof AnswerSchema>
  export function writePending(dir: string, p: Pending): void               // also deletes stale answer.json
  export function readPending(dir: string): Pending | null
  export function readAnswer(dir: string, p: Pending): Answer | null        // null = no answer yet or invalid (see below)
  export function clearPending(dir: string): void
  export function logDecision(dir: string, p: Pending, a: Answer): void     // appends to author-decisions.jsonl
  // fake-author.ts
  export function fakeAnswer(p: Pending, bible: Bible): Answer
  ```

**Run plan (`buildPlan`):**
- `setup`, `interview`
- For each chapter `n` from 1 to N:
  - `ch{n}:advice` (only when n ≥ 2), `ch{n}:draft`, `ch{n}:proofread`, `ch{n}:check`, `ch{n}:continuity`, `ch{n}:proposals`
  - after chapter 2 only: `style:suggest`, `style:review`
  - `ch{n}:reader`
- `finish`

**Pending kinds** (each has `step: string`):

| kind | payload | answer | answer rule |
|---|---|---|---|
| `interview_answer` | `turnId`, `focus`, `topic`, `question`, `asked`, `limit` | `answer: string`, `bankKeys: string[]` | — |
| `proposals` | `source: 'interview' \| 'post_chapter' \| 'style'`, `chapter: number \| null`, `chapterFile: string \| null`, `items: { id, type, payload }[]` | `decisions: { id, approve: boolean, reason }[]` | covers every item id exactly once |
| `draft_review` | `chapter`, `attempt`, `maxAttempts`, `instructions`, `mustInclude`, `textFile`, `metrics` | `usable: boolean`, `quality: 1–5`, `reason` | — |
| `proofread` | `chapter`, `textFile`, `items: { id, quote, replacement, kind, reason, source }[]` | `decisions: { id, accept: boolean, reason }[]` | covers every id |
| `continuity` | `chapter`, `textFile`, `items: { id, kind, severity, quote, explanation, suggestion }[]` | `decisions: { id, valid: boolean, reason }[]` | covers every id |
| `advice_note` | `chapter`, `result: AdviceResult`, `nextInstructions` | `matchingOption: number \| null`, `note` | — |

- [ ] **Step 1: Write failing tests:**
  - `buildPlan({ chapters: 5 })`: starts `['setup', 'interview', 'ch1:draft', …]`, has `ch2:advice` but no `ch1:advice`, has `style:suggest` right after `ch2:proposals`, and ends with `'finish'`.
  - `saveState`/`loadState` round-trip; no `.tmp` file is left behind.
  - `readAnswer` returns null when `answer.json` is missing.
  - Bad answers (Review Focus 4): for each case below, `readAnswer` returns `null`, `answer.json` is renamed to `answer.rejected-<n>.json`, `answer.error.txt` names the problem, and `pending.json` stays.

    | bad answer | `answer.error.txt` names |
    |---|---|
    | malformed JSON | the parse error |
    | `kind` differs from the pending kind | the kind mismatch |
    | a `proposals` answer missing an item id | the missing id |
    | a duplicated id | the duplicate id |

  - `logDecision` appends one JSON line per call.
  - `fakeAnswer` returns a schema-valid answer for every kind:
    - approves and accepts everything
    - `usable: true, quality: 3`
    - interview answer = the first bank entry whose `topics` share a word with the question, else the first bank entry
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/state.test.ts eval/novel/author-io.test.ts --maxWorkers=2` → FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** → PASS.

---

### Task 6: Step machine

**Files:**
- Create: `eval/novel/run.ts`, `eval/novel/steps/setup.ts`, `eval/novel/steps/interview.ts`, `eval/novel/steps/chapter.ts`, `eval/novel/steps/style.ts`, `eval/novel/steps/finish.ts`, `eval/novel/steps/util.ts`
- Test: `eval/novel/run.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5 and 7. Services:
  - `createWork`, `createNamingRule`, `createThread`, `createStyleCard`
  - `startInterview`, `askNextQuestion`, `answerTurn`, `completeInterview`
  - `listProposals`, `approveProposal`, `rejectProposal`
  - `runDirectionAdvice`, `startDraft`, `createChapterFromDraft`, `runProofread`, `saveChapter`, `setChapterStatus`, `runChapterCheck`
  - `listIssues`, `resolveIssue`, `suggestStyleCard`, `runReaderSimulation`
  - `createTestUser` from `@/test/factories`; `migrateDb`
- Produces:
  ```ts
  export type RunContext = { dir: string; config: RunConfig; db: Db; client: EvalClient; bible: Bible; actor: Actor
                             autoAuthor?: (p: Pending) => Answer; throwAfter?: string /* test hook: throw once after this mark is set */ }
  export type StepResult = 'done' | 'pending'
  export type StepFn = (ctx: RunContext, key: string, state: RunState) => Promise<StepResult>
  export async function openRun(dir: string, o?: { inner?: AiClient; autoAuthor?: boolean }): Promise<RunContext & { close(): Promise<void> }>
  export async function runUntilBlocked(ctx: RunContext): Promise<RunState>
  export async function withModelRetry<T>(ctx: RunContext, state: RunState, label: string, fn: () => Promise<T>): Promise<T | null>
  // steps/util.ts
  export function selectDraftEntries(entries: { id: string; name: string; aliases: string[] }[], instructions: string): string[]
  export function applySuggestions(text: string, accepted: { quote: string; replacement: string; start: number; end: number }[]): string
  ```

**Loop rules (`runUntilBlocked`):**
- Load state, set `status: 'running'`, and call `STEPS[stepName(plan[cursor])]`.
- `'done'` → `cursor++`, save.
- `'pending'` → with `autoAuthor`, write `answer.json` from it and loop. Otherwise set `status: 'pending'`, save and return.
- **External failure.** When `client.takeLastFailure()` reports `external-limit` or `external-network`:
  - `pauses[key]++`
  - `status` becomes `blocked` when `pauses[key] >= 3`, else `paused-limit` (for a limit) or `paused-error` (for a network failure)
  - `message` = the error text; save and return
- **Error with no AI failure recorded** (a harness or service bug) → `paused-error` with the stack in `message`.
- `withModelRetry`: runs `fn`. On a `model` failure it retries once (`retried[label]++`). A second failure pushes `{ step: label, message }` to `failed` and returns `null`. External failures propagate.
- Cursor past the plan → `status: 'done'`.
- Every step saves state after each side effect it marks. A re-entered step skips work whose mark is set.
- Every save sets `state.nextSeq = client.nextSeq`, so call numbering continues after a resume.

**Step behaviour** (spec §6.3; the actor is the test user created in `setup`):
- **`setup`**
  - `createTestUser`, then `createWork` from `bible.work`.
  - Seed what the author types in the UI: `namingRules` → `createNamingRule`, `threads` → `createThread` with `status: 'planned'` and `targetChapterPosition`, `workStyle` → `createStyleCard` (`entryId: null`).
  - Seed nothing else.
- **`interview`**
  - Start the session once (`marks['interview:started']`).
  - Loop while `asked < questions`:
    - Ask: `withModelRetry` → `askNextQuestion`. Store `openTurnId`. A `null` result counts as asked.
    - Write `interview_answer` pending, wait for the answer, then `answerTurn`.
    - Write `proposals` pending (source `interview`) for the proposals this turn created. Apply the decisions with `approveProposal` (suggested fact status, note = reason) or `rejectProposal`.
    - `focusCounts[turn.focus]++`
  - Then `completeInterview`.
- **`ch{n}:advice`** → `runDirectionAdvice` → `advice_note` pending with `nextInstructions = bible.chapters[n-1].instructions`.
- **`ch{n}:draft`**
  - `startDraft` with:
    - `instructions` = `bible.chapters[n-1].instructions`
    - `targetChars` = `bible.targetChars`
    - `entryIds` = `selectDraftEntries(current entries, instructions)`
  - Await `done` and write `chapters/0n.attempt-k.md`.
  - `draft_review` pending carries `chapterMetrics`.
  - An unusable verdict with attempts left → new attempt.
  - Then `createChapterFromDraft({ runId: chosen, title: bible.chapters[n-1].title })` once (`marks['ch{n}:chapter-created']`).
  - The chosen attempt is the first usable one. If none is usable, it is the highest quality, latest on ties.
- **`ch{n}:proofread`**
  - `runProofread({ chapterId, useAi: true })` → `proofread` pending (ids are the suggestion indexes as strings).
  - `applySuggestions` with the accepted ones → `saveChapter` → `setChapterStatus('done')`.
  - Write `chapters/0n.draft.md` (before) and `chapters/0n.md` (after), and `metrics/0n.json`.
- **`ch{n}:check`** → `runChapterCheck` (via `withModelRetry`).
- **`ch{n}:continuity`**
  - `listIssues(chapterId, { statuses: ['open'] })` → `continuity` pending (skip it when there are no issues).
  - `resolveIssue`: `accepted` when valid, `dismissed` when not.
- **`ch{n}:proposals`** → pending `post_chapter` proposals for this chapter → approve or reject.
- **`style:suggest`** → for each main character in the bible that exists as an approved entry, `suggestStyleCard`. A `BAD_STATE` (fewer than 3 dialogue lines) is recorded in `failed` as `style:<name>: no dialogue`. Successful proposal ids go to `styleProposalIds`.
- **`style:review`** → `proposals` pending (source `style`) → apply.
- **`ch{n}:reader`** → `runReaderSimulation({ chapterId })` and write `reader/0n.json`.
- **`finish`** → write:
  - `wiki-final.json`: entries with facts, threads, relations, naming rules, style cards
  - `run-summary.json`: calls by task (count, tokens, total ms), `wouldTimeOut` count, `contextOverflow` count, `hangulLeft` total, `failed`, `pauses`, draft attempts, `focusCounts`

- [ ] **Step 1: Write failing tests** (`run.test.ts`, temp dirs, `fake` model, `autoAuthor`, timeout 120 s each):
  - `fake run reaches done`:
    - `chapters/01.md`–`05.md`, `wiki-final.json` and `run-summary.json` exist.
    - `author-decisions.jsonl` has exactly 12 `interview_answer` lines.
    - the DB has 5 chapters with status `done`, naming rules that include the 2 seeded canonicals, and threads that include the 4 seeded titles.
  - `stops at pending without an author`: no `autoAuthor` → status `pending`, `pending.json` kind `interview_answer`; write a valid answer → next `runUntilBlocked` continues.
  - `external limit pauses and resumes`:
    - Inner fake throws `{ status: 429 }` on the first `draft-chapter` call → `paused-limit`, cursor at `ch1:draft`.
    - Rerun with a normal inner → done.
    - No `interview-question` call records are written after the resume, so finished steps are not redone.
    - Call numbering continues: `seq` values have no gaps or repeats.
  - `three external pauses block`: inner always 429 on `draft-chapter` → after 3 runs status `blocked`.
  - `model failure is recorded and skipped`: inner throws `AppError('AI_ERROR', FORMAT_MESSAGE)` for every `chapter-extract` → done. `failed` has 5 `ch{n}:check` entries (each after one retry), and the chapters are still saved.
  - `draft redo`: `autoAuthor` marks attempt 1 of chapter 1 unusable → `chapters/01.attempt-2.md` exists, and the chapter body equals attempt 2.
  - `no duplicate chapter after a crash` (Review Focus 3): `throwAfter: 'ch1:chapter-created'` → run throws (`paused-error`) → rerun without the hook → done, one chapter at position 1.
  - `selectDraftEntries`: matches by name or alias substring (`'세린'` alias picks 한세린), case-insensitive for Latin, no duplicates.
  - `applySuggestions`: applies right to left; skips one whose `text.slice(start, end) !== quote`; skips overlaps (keeps the earlier start).
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/run.test.ts --maxWorkers=2` → FAIL.
- [ ] **Step 3: Implement** `run.ts` and the step files. `openRun`:
  - opens `new PGlite(join(dir, 'db'))` and runs `migrateDb(db, 'pglite')`
  - loads the config and the bible, and builds the `EvalClient`
    - its `inner` is `o.inner ?? createModelClient(profile)`
    - `startSeq` is `state.nextSeq`
  - calls `setAiTimeoutOverride(profile.timeoutMs)`
  - sets `process.env.AI_DAILY_TOKEN_LIMIT = '0'`
- [ ] **Step 4: Run** → PASS. Then `pnpm vitest run eval --maxWorkers=2` → all eval tests pass.

---

### Task 7: Chapter metrics

**Files:**
- Create: `eval/novel/metrics.ts`
- Test: `eval/novel/metrics.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ChapterMetrics = {
    chars: number                 // with spaces, trimmed
    targetChars: number; lengthOk: boolean        // T3: chars >= target (ko) / >= 0.8*target (en) and <= 1.3*target
    foreignRuns: string[]         // T5: ko → Latin runs of 4+ letters; en → Hangul runs
    metaHits: string[]            // T4: matches of META_PATTERNS
    endsCleanly: boolean          // T7: last non-space char in . ! ? … " ” ' ’ 」 』 ) ~ or a Hangul sentence ending (다 요 까 네 지 죠)
    paragraphs: number; avgParagraphChars: number; dialogueLineRatio: number   // informational for Q6
  }
  export const META_PATTERNS: RegExp[]
  export function chapterMetrics(text: string, lang: 'ko' | 'en', targetChars: number): ChapterMetrics
  ```
- `META_PATTERNS`:
  - Korean meta lines: `^#`, `^\*\*?\d+화`, `초안입니다`, `다음은 .*초안`, `^제목:`, `작가의 말`
  - English meta lines: `^Here is`, `^Chapter \d+[:.]`, `^Title:`, `^Note:`
  - Patterns are anchored per line (`m` flag).
- [ ] **Step 1: Write failing tests:**
  - 5,000 Hangul chars → `lengthOk` true for target 5000; 4,999 → false; 6,600 → false
  - `'… 그녀는 OK라고 했다.'` → `foreignRuns` `[]` (shorter than 4); `'Status report였다'` → `['Status']`
  - `'다음은 1화 초안입니다.\n본문'` → one meta hit
  - `'문장이 끝나지 않고'` → `endsCleanly` false; `'"가자."'` → true
  - dialogue ratio: 2 of 4 non-empty lines start with a quote → `0.5`
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/metrics.test.ts --maxWorkers=2` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.

---

### Task 8: CLI and detached worker

**Files:**
- Create: `eval/novel/cli.ts`, `eval/novel/worker-lock.ts`
- Modify: `package.json` (script `"eval:novel": "tsx eval/novel/cli.ts"`)
- Test: `eval/novel/cli.test.ts`

**Interfaces:**
- Consumes: Task 6 `openRun`, `runUntilBlocked`; Task 5 state helpers; `MODEL_PROFILES`.
- Produces (commands; every command prints exactly one JSON line on stdout):
  - `init --model <ModelId> --lang <ko|en> [--chapters 5] [--questions 12] [--dir <path>]`
    - Default dir: `eval/results/novel/<YYYY-MM-DD Asia/Seoul>-<model>-<lang>`.
    - It is idempotent: an existing dir with the same model and lang returns it unchanged.
    - Writes `config.json` (commit from `git rev-parse --short HEAD`) and `state.json`.
    - Prints `{ "dir": "...", "status": "new" }`.
  - `advance --dir <path> [--max-seconds 540] [--fake-author]`
    - If no live worker holds the lock, spawn `tsx eval/novel/cli.ts worker --dir <path> [--fake-author]` detached, with stdout and stderr appended to `<dir>/worker.log`.
    - Then poll `state.json` every 2 s until the worker exits or the window ends.
    - Prints `{ "status": RunStatus | "running", "step": string | null, "pendingKind": string | null, "message": string | null }`.
  - `worker --dir <path> [--fake-author]`
    - Takes `worker.pid` (stale when `process.kill(pid, 0)` throws).
    - `openRun` → `runUntilBlocked` → `close` → release the lock.
    - Before running, it calls `process.loadEnvFile('.env.local')` if that file exists.
  - `status [--dir <path> | --all]` → the state summary of one run or every run under `eval/results/novel/`.
  - `probe-ctx --model <ModelId> [--sizes 131072,65536,32768]`
    - For each size, descending, it calls Ollama `/api/generate` with `options.num_ctx` and a short prompt, then reads `/api/ps`.
    - The first size that loads without error and with `size` ≤ 40 GiB wins. A follow-up call with a ~30k-token synthetic prompt must report `prompt_eval_count` ≥ 29k.
    - Writes `eval/results/novel/ctx-probe-<model>.json` and prints the chosen size.
- [ ] **Step 1: Write failing tests** (call the exported command functions, not a subprocess):
  - `init` twice → same dir; `config.json` has `modelId`, `lang`, `chapters: 5`, `questions: 12`, `maxDraftAttempts: 3`
  - `acquireLock` with a dead pid in `worker.pid` succeeds
  - `acquireLock` with `process.pid` already holding it fails
  - `formatStatus(state)` returns the documented JSON shape
  - `advance` with `--fake-author` on the `fake` model, run in-process via an injectable `spawnWorker` that calls the worker function directly → final status `done`
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/cli.test.ts --maxWorkers=2` → FAIL.
- [ ] **Step 3: Implement.** Parse argv by hand (no new package).
- [ ] **Step 4: Run** → PASS. Manual check:
  - `pnpm eval:novel init --model fake --lang ko --dir /tmp/novel-fake` then `pnpm eval:novel advance --dir /tmp/novel-fake --fake-author` → prints `"status":"done"`.
  - This is a scratch run; delete it afterwards.

---

### Task 9: Agent prompts and the saved workflow

**Files:**
- Create: `eval/novel/agents/author.md`, `eval/novel/agents/reviewer.md`, `eval/novel/agents/resume-note.md`, `eval/novel/agents/summary.md`, `.claude/workflows/novel-eval.js`
- Read: `eval/fixtures/novel/{ko,en}/author-guide.md`, `docs/eval/novel-quality-criteria.md`, Task 5 schemas

**Interfaces:**
- Consumes: CLI JSON lines (Task 8), Pending/Answer schemas (Task 5).
- Produces: workflow `novel-eval` with `args`:
  ```js
  {
    date: 'YYYY-MM-DD',            // required (no Date.now in workflows); names docs/eval/novel/<date>/
    runs: [{ model, lang }],       // default: all 5 models × ['ko', 'en']
    chapters: 5
  }
  ```

**Agent prompt files** (Korean for `ko` runs and English for `en` runs, where the file says so; each states its inputs as paths):
- **`author.md`** (Sonnet, one fresh agent per pending, spec §6.4)
  - Read `<dir>/pending.json`, the bible and the author guide for the run's language. For chapter judgments, also read the files the pending names.
  - Write `<dir>/answer.json` matching the answer shape for that kind. Copy the table from Task 5 into the prompt.
  - Never edit any other file, never write prose for the novel, never see the model id (the prompt passes only `dir` and `lang`).
  - Return one line: the kind answered.
- **`reviewer.md`** (Sonnet)
  - Inputs: run dir, `docs/eval/novel-quality-criteria.md`, and spec §9.
  - Writes `docs/eval/novel/<date>/<model>-<lang>.md`:
    - per chapter: T1–T7 with the harness metrics, Q1–Q9 with quotes, and the verdict
    - the whole run: per-feature scores (interview, extraction, continuity, proofread, reader-sim, advice, style) with evidence from the `calls/` and `author-decisions.jsonl` files
    - operations: failures, retries, `wouldTimeOut`, `contextOverflow`, `hangulLeft`, tokens, time
    - TTCW pass count
    - a weakness list with improvement candidates
  - The reviewer learns the model id from `config.json` only after scoring the chapters. Quotes are mandatory.
- **`resume-note.md`** (Sonnet) → writes `<dir>/RESUME.md`:
  - the step, the error text, when to retry (OpenCode Go: the 5-hour window)
  - the exact resume command: rerun the workflow with the same `date` and `runs`, or `pnpm eval:novel advance --dir <dir>`
- **`summary.md`** (Sonnet) → `docs/eval/novel/<date>/summary.md`:
  - a 10-run table: verdict counts, mean Q score, TTCW pass rate
  - per-feature gaps of the local models against Haiku and Luna
  - a Korean-vs-English diagnosis
  - improvement candidates ordered by expected effect
  - runs still paused or blocked, with their `RESUME.md`
  - the judge-bias caveat (criteria §4)

**Workflow outline** (plain JS, no `Date.now`):
- **Queues:** split `runs` by `MODEL_QUEUES = { 'qwen3.8-27b': 'local', 'gpt-oss-20b': 'local', 'exaone3.5-32b': 'local', 'haiku-5.5': 'cloud', 'luna-6': 'cloud', fake: 'local' }`. Run the two queues with `parallel([...])`. Inside a queue, runs go sequentially.
- **Per run:**
  1. A runner agent (`model: 'haiku'`, schema `{ type: 'object', properties: { status: { type: 'string' }, detail: { type: 'string' } }, required: ['status', 'detail'] }`) runs `pnpm eval:novel init …`. Then it repeats `pnpm eval:novel advance --dir <dir>` until the status is not `running`, at most 20 times, and reports the last JSON line (`detail` = the line).
  2. `pending` → author agent (`model: 'sonnet'`) → back to step 1 (advance only).
  3. `done` → start the reviewer agent (`model: 'sonnet'`) without awaiting it, and go on to the next run in the queue.
  4. `paused-limit`, `paused-error` or `blocked` → resume-note agent (`model: 'sonnet'`), then the next run.
  - At most 400 loop iterations per run, logged if hit.
- **End:** `await Promise.all(reviews)`, then the summary agent. Return `{ runs: [{ model, lang, status }] }`.
- [ ] **Step 1:** Write the four prompt files and the workflow.
- [ ] **Step 2: Verify the script parses:**
  - `node --check` on a copy with the `export const meta` line rewritten to `const meta`: `sed 's/^export const meta/const meta/' .claude/workflows/novel-eval.js > /tmp/nw.mjs && node --check /tmp/nw.mjs`
  - `grep -nE "Date\.now|Math\.random|new Date\(\)" .claude/workflows/novel-eval.js` → no output
- [ ] **Step 3 (orchestrator):** dry run with `Workflow({ name: 'novel-eval', args: { date: '<today>', runs: [{ model: 'fake', lang: 'ko' }], chapters: 1 } })`. Expect a real Sonnet author to answer each pending, a review file in `docs/eval/novel/<today>/fake-ko.md`, and a final status of `done`. Delete the dry-run docs afterwards.

---

### Task 10: Model setup (operational, Haiku with Aside)

**Files:**
- Modify: `eval/novel/models.ts` (tags, variants, sampling, `numCtx`)
- Create: `docs/eval/novel/model-setup.md`

- [ ] **Step 1:** For `gpt-oss:20b` and `exaone3.5:32b`, try the MLX tags first (`ollama pull <name>` with the `-mlx` suffix and the tags listed on ollama.com/library).
  - If no MLX tag exists or the pull fails, research with the Aside browser (`aside exec`, report wrapped in `<<<REPORT`/`REPORT>>>`).
  - If still no MLX build, pull the default tag.
  - Record the tag, variant (`mlx` or `gguf`), size and source URL. `qwen3.8:27b-mlx` is already installed.
- [ ] **Step 2:** Research each model's official recommended sampling for quality (temperature, top_p, top_k, min_p) and its thinking or reasoning setting, from the model card or vendor docs via Aside. Record the quotes and URLs.
- [ ] **Step 3:** Configure the Ollama server for one model and one request at a time, so parallel calls queue instead of multiplying KV-cache memory (spec §5):
  - `launchctl setenv OLLAMA_NUM_PARALLEL 1` and `launchctl setenv OLLAMA_MAX_LOADED_MODELS 1`, then restart Ollama (`brew services restart ollama`, or quit and reopen the app).
  - Confirm with `ollama ps` after a call. Record the settings in `model-setup.md`.
  - Then run `pnpm eval:novel probe-ctx --model <id>` for each local model. Set `numCtx` to the chosen size, capped at the model's own maximum.
- [ ] **Step 4:** Update `MODEL_PROFILES`, rerun `pnpm vitest run eval/novel --maxWorkers=2` → PASS, and write `model-setup.md` with a table: model, tag, variant, size, `numCtx`, temperature, top_p, top_k, min_p, think, sources.

---

### Task 11: Pilot (operational, orchestrator)

- [ ] **Step 1:** Run `pnpm typecheck`, `pnpm lint` and `pnpm test` → all pass, including the fake 5-chapter run in `eval/novel/run.test.ts`.
- [ ] **Step 2:** Run workflow `novel-eval` with `{ date: '<today>-pilot', runs: [{ model: 'qwen3.8-27b', lang: 'ko' }, { model: 'haiku-5.5', lang: 'ko' }], chapters: 1 }`.
- [ ] **Step 3:** From `run-summary.json`, write `docs/eval/novel/<today>-pilot/pilot.md`:
  - time per step, tokens per task
  - projected totals for 10 runs × 5 chapters: hours per queue, and OpenCode Go spend against the $15 monthly and $3 five-hour allowances
  - anything in the call logs that breaks the plan (`contextOverflow`, `hangulLeft`, repeated failures)
- [ ] **Step 4:** If the projection differs from the spec's estimate by more than 2×, report the numbers to the user before Task 12 (spec §6.7). Otherwise continue. Pilot runs are not part of the results.

---

### Task 12: Full matrix (operational, orchestrator)

- [ ] **Step 1:** Run workflow `novel-eval` with `{ date: '<today>', chapters: 5 }` (default runs: 5 models × ko/en).
- [ ] **Step 2:** For paused runs, wait as `RESUME.md` says, then rerun the same args. Done runs are skipped, because `advance` on a done run returns `done` at once and its review file already exists.
- [ ] **Step 3:** Check that `docs/eval/novel/<today>/` has 10 run reviews (or `RESUME.md` references for blocked runs) and `summary.md`.
- [ ] **Step 4:** The orchestrator commits the docs and reports to the user:
  - the summary's headline numbers
  - the weakest features of the local models
  - the Korean-vs-English finding

  Then wait for the user's next instruction. No prompt or code improvements in this round (spec §2).

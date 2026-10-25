# Lean Serial Harness, Stage 4 (requests learned from edits, chosen examples, cache lifetime) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution (since stage 3, 2026-10-25): OpenCode (Muse Spark) implements each task (TDD) in its own worktree and another OpenCode session reviews it, driven by a scheduler that retests after every rebase before the fast-forward; opus reviews the stage, then the orchestrator measures.

**Goal:** The ledger also fills itself from what the author changes in AI drafts (proposals only, never applied without the author), the draft gets the two or three author example passages closest to this chapter instead of all of them, and the cache lifetime can be raised where the gateway allows it.

**Architecture:** When a chapter that started from an AI draft is marked done, a cheap task `directive-infer` reads the edit hunks between the AI text and the saved text and proposes at most two concrete lasting requests; vague ones are dropped in code. Proposals live in that run's output; the ledger tab lists them and the author adds or ignores each. Example selection is a pure scorer over style-card example passages and author-written chapters. Cache lifetime is an env switch per provider path, probed first.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + PGlite, Vitest, `FakeAiClient`, shadcn on Base UI, novel-eval workflow. No package changes.

**Spec:** `docs/superpowers/specs/2026-10-20-lean-serial-harness-design.md` sections 6.3 (third way in), 6.4 (example selection), 6.6 (cache, batch), 7 (CIPHER, "Catch Me If You Can? Not Yet") and the stage 4 row of section 9. Earlier plans: stages 0–3 in `docs/superpowers/plans/2026-10-20-lean-harness-stage{0,1,2,3}.md`.

**Branch:** `feat/lean-harness`, after stage 3's gate, review fixes and M3 decision.

**Stage 3 note (2026-10-25):** the scene and voice fixes write the accepted text back into the draft run's `output.text`, so task 2's "AI text" already holds every fix the author applied; only the author's own changes become hunks.

**Not in this stage:** the batch API. The M0 gateway probe (2026-10-20) got 404 from both `…/anthropic/v1/messages/batches` and `…/openai/v1/batches`, so the gateway does not offer it (design 6.6: "게이트웨이가 지원할 때만 한다").

## Global Constraints

- User-facing copy is Korean, short and plain; the exact strings below are fixed. Identifiers and comments are English.
- AI never writes `author_directives`. An inferred proposal becomes a row only when the author presses `추가`, through `createDirective` with `source: 'inferred'` (`DIRECTIVE_SOURCES` gains `'inferred'`; text column, no migration).
- The inference never sends the whole chapter: only edit hunks (task 1), at most 12, each side at most 300 characters.
- No package changes. No migration.
- With example selection off, no example store, and the cache env unset, every prompt and request is byte-identical to stage 3's.
- English eval runs need every new Korean scaffold string translated, with no Hangul left; `EN_SYSTEMS` gets `directive-infer`.
- Tests never call a real AI API. New tests go in new files `<name>.<topic>.s4.test.ts(x)`.
- Implementer commands, commit rules and README rule: as in the stage 0 plan.

## Review Focus

1. A proposal that repeats an active or ignored request, or that is vague (`간결하게`, `자연스럽게` with nothing concrete), never reaches the author. Test: task 1.
2. Marking the same chapter done twice runs the inference once; a chapter that did not start from an AI draft, or whose edit ratio is under 5%, runs none. Test: task 2.
3. An example passage that is already copied into this chapter's text, or that would push the block over its budget, is not sent. Test: task 4.
4. A cache lifetime the gateway rejects never breaks a draft: the switch is off by default, and the probe decides. Test: task 5.
5. Old ledgers without inferred rows, and works with one short example, keep working with selection on (the one example is sent as today). Test: tasks 3 and 4.

---

## Task 1: `directive-infer` task and pure helpers

**Files:**
- Create: `src/ai/tasks/directive-infer.ts`, `src/lib/edit-hunks.ts`, `eval/novel/localize/en/directive-infer.ts`, `eval/novel/localize/samples/directive-infer.ts`
- Modify: `src/db/types.ts` (`AI_TASKS` gains `'directive-infer'`; `DIRECTIVE_SOURCES` gains `'inferred'`), `eval/novel/localize/en-systems.ts`, `eval/novel/localize/scaffold.ts`, the en-systems snapshot
- Test: `src/lib/edit-hunks.s4.test.ts`, `src/ai/tasks/directive-infer.s4.test.ts`

**Interfaces:**
- Produces in `src/lib/edit-hunks.ts`:
  - `type EditHunk = { before: string; after: string }`
  - `editHunks(ai: string, saved: string, o = { max: 12, side: 300 }): EditHunk[]` — word diff (`diffTextsBounded` from the stage 0 fix; `[]` when it returns null); adjacent removed and added parts with at most 2 unchanged words between them form one hunk; each side gets one sentence of context on each side and is cut to `side` characters; hunks where both sides are whitespace-only, or that only change punctuation, are dropped; the `max` hunks with the most changed characters are kept, in text order.
  - `isVagueRequest(text: string): boolean` — true when the text has no quoted span, no character name or alias passed in, no digit, and contains one of `간결하게`, `자연스럽게`, `더 재미있게`, `생생하게`, `깔끔하게`, `잘`, `좋게`, `몰입감`, `매끄럽게` (en: `concise`, `natural`, `more fun`, `vivid`, `smoother`, `better`, `engaging`). Signature: `isVagueRequest(text: string, names: string[]): boolean`.
- Produces in `src/ai/tasks/directive-infer.ts`: `type DirectiveInferInput = { hunks: EditHunk[]; requests: DirectiveForPrompt[]; names: string[] }`; schema `{ proposals: { text: string (max 120); kind: 'style' | 'speech' | 'ban' | 'content'; entryName: string | null; pattern: string | null; evidence: number[] (hunk indexes, 1–3) }[] (max 2) }`; `directiveInferTask` — effort `'low'`, maxTokens `2000`, system `DIRECTIVE_INFER_SYSTEM`; `postProcess` drops proposals whose `evidence` is empty or out of range, whose `entryName` is not in `names`, or that `isVagueRequest`.
- Prompt: `renderRequestsBlock(requests)` when any, then `<edits>` with `[수정 N]` lines `- 전: {before}` and `- 후: {after}`.
- `DIRECTIVE_INFER_SYSTEM` (Korean; English twin) says: the author edited an AI draft; find at most two rules the author would want in every chapter, each backed by at least two edits (or one edit that shows an explicit pattern such as removing one phrase everywhere); write each as one concrete sentence a writer can follow (name the phrase, the character or the form); leave out one-off fixes of this chapter's events, typo fixes, and anything already in `<author_requests>`; return `{"proposals": []}` when nothing is clear.

- [ ] **Step 1: Write the failing tests:** `editHunks` on an AI text where the author replaced `입꼬리가 올라갔다` with `웃었다` twice and fixed one comma gives two hunks (the comma fix is dropped), each with context, in text order; a 40-edit text keeps the 12 largest; a timeout from the bounded diff gives `[]`; `isVagueRequest('문장을 간결하게', [])` is true, `isVagueRequest("'입꼬리'는 쓰지 않는다", [])` and `isVagueRequest('세린은 반말을 쓴다', ['세린'])` are false; `postProcess` drops a vague proposal, one with evidence `[]`, one with evidence 13 of 12, and one naming an unknown character; the prompt lists `[수정 1]` with `전:` and `후:`; English localization leaves no Hangul.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/edit-hunks.s4.test.ts src/ai/tasks/directive-infer.s4.test.ts eval/novel/localize --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): infer lasting requests from author edits`.

## Task 2: Inference service, trigger and proposals

**Files:**
- Create: `src/server/directive-infer.ts`, `src/app/api/works/[workId]/directives/infer/route.ts`
- Modify: `src/server/actions/wiki.ts` (`decideInferredAction`), `src/db/types.ts` (`USAGE_EVENT_KINDS` gains `'directive_inferred'`, `'directive_inferred_added'`)
- Test: `src/server/directive-infer.s4.test.ts`

**Interfaces:**
- Consumes: task 1; stage 0 `draft_used` events and `updateDraftEditRatio`'s ratio row; stage 2 `activeDirectivesFor`, `listDirectives`, `createDirective`.
- Produces: `inferDirectives(db, actor, { workId, chapterId }, client?, signal?): Promise<{ runId: string | null; proposals: InferredProposal[] }>` — editor role; runs only when the chapter is `done`, has a `draft_used` event with `priorChars` 0 whose run text is available, its `draft_edit_ratio` is at least 0.05, and no earlier `directive-infer` run exists for this chapter (then it returns that run's undecided proposals without a call). The hunks come from the AI text vs the current chapter body. Requests passed = every non-archived row (active and off), so known ones are not proposed again. Records `directive_inferred` (value = proposals count).
- Produces: `type InferredProposal = { runId: string; index: number; text: string; kind: DirectiveKind; entryId: string | null; entryName: string | null; pattern: string | null }`; the run output keeps `proposals` and `decided: Record<number, 'added' | 'ignored'>`.
- Produces: `listInferredProposals(db, actor, workId): Promise<InferredProposal[]>` — viewer; undecided proposals of the work's `directive-infer` runs, newest first, at most 10.
- Produces: `decideInferred(db, actor, { workId, runId, index, decision: 'add' | 'ignore' })` — editor; `add` calls `createDirective` (`scope` `character` when `entryId`, else `work`; `kind` and `pattern` from the proposal; `source: 'inferred'`) and records `directive_inferred_added`; both write `decided[index]` with a conditional update; deciding twice throws `BAD_STATE` `이미 정한 제안입니다.`
- Route `POST /api/works/[workId]/directives/infer` with `{ chapterId }`, `maxDuration = 300`.

- [ ] **Step 1: Write the failing tests** (`FakeAiClient`): a done chapter from a draft with ratio 0.2 gives one call and its proposals; a second call returns the same proposals with no new run; a chapter at ratio 0.03, a chapter in `draft` status, and a chapter without `draft_used` give no call; the prompt never holds the full chapter (a sentence far from any edit is absent); `add` creates a row with `source: 'inferred'` and one change_log row; `ignore` creates nothing; a second decision throws the message above; a non-member gets `NOT_FOUND`.
- [ ] **Step 2: Run** `pnpm vitest run src/server/directive-infer.s4.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(directives): propose requests from the author's edits`.

## Task 3: Proposals in the ledger tab and the trigger

**Files:**
- Modify: `src/components/wiki/directive-list.tsx`, `src/app/(app)/works/[workId]/wiki/page.tsx`, the component that sets a chapter to done (find the caller of `setChapterStatus` in `src/components/writing`), `src/components/writing/panels/draft-panel.tsx`
- Test: `src/components/wiki/directive-list.inferred.s4.test.tsx`, a test for the done trigger next to its component

**Interfaces:**
- Produces (copy, exact): section `수정에서 찾은 요청` above `적용 중인 요청`, shown when proposals exist, with the hint `작가님이 고친 곳을 보고 찾은 것입니다. 추가해야 적용됩니다.`; per proposal its text, a scope badge as in stage 2, buttons `추가` and `무시`; after `추가` the row moves to the active list.
- When the author sets a chapter to done, the client fires `POST …/directives/infer` without waiting and ignores its errors; the draft panel shows `새 요청 제안 {n}개` with a link `보기` to `?tab=requests` when `n > 0`.

- [ ] **Step 1: Write the failing tests:** the section renders with two proposals and hides with none; `추가` and `무시` call `decideInferredAction` with the index; setting done calls the route once and a 500 from it shows nothing; the panel line shows the count.
- [ ] **Step 2: Run** the new tests with `pnpm vitest run <paths> --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/components --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(wiki): show requests found in the author's edits`.

## Task 4: Chosen example passages

**Files:**
- Create: `src/lib/examples.ts`
- Modify: `src/ai/tasks/draft-chapter.ts` (`renderCard` gains an `examples` override; block B gains `<voice_examples>`), `src/server/ai-features.ts` (`buildDraftContext`), `eval/novel/localize/scaffold.ts`
- Test: `src/lib/examples.s4.test.ts`, `src/server/ai-features.examples.s4.test.ts`

**Interfaces:**
- Produces in `src/lib/examples.ts`:
  - `type ExamplePassage = { text: string; source: 'card' | 'chapter' }`
  - `examplePassages(cardExamples: string[], authorChapters: string[]): ExamplePassage[]` — card examples split on blank-line groups of 1–4 paragraphs (a passage ends at 600 characters); author chapters split the same way, keeping only passages with a quoted line.
  - `selectExamples(passages: ExamplePassage[], o: { names: string[]; cue: string; draftText?: string; max = 3; budget = 1200 }): ExamplePassage[]` — score = 2 × names present + character-bigram Dice between the passage and `cue`; ties keep input order; skip a passage whose sentences already appear in `draftText` (the existing `findDraftFlags` `sample-copy` check on it); stop at `max` or when the next passage would pass `budget`.
  - `EXAMPLE_SELECTION_ENV = 'AI_EXAMPLE_SELECTION'`, `isExampleSelectionEnabled(env)` (on for `1`/`true`/`on`; default off until M4 decides).
- Produces: with selection on and the work's card examples longer than `budget` in total, `buildDraftContext` sends each card without its `examples` and adds block B's first part `<voice_examples>\n작가 예문. 문체와 말투만 참고하고 문장을 그대로 옮기지 않는다.\n{passages joined by a blank line and ---}\n</voice_examples>`; `names` = this chapter's character names, `cue` = the instructions plus (with a plan) every scene's `trigger` and `summary`; author chapters = up to 5 earlier chapters of the work whose first version's `source` is not `ai_draft`. Otherwise everything is as in stage 3.
- Scaffold rule: `작가 예문. 문체와 말투만 참고하고 문장을 그대로 옮기지 않는다.` → `The author's example passages. Use them only for style and voice; do not copy their sentences.`

- [ ] **Step 1: Write the failing tests:** splitting gives the expected passages; a passage naming two of this chapter's characters beats one with a better Dice and no names; the budget stops at the passage that would pass 1200 characters; a passage copied into `draftText` is skipped; with selection off the draft prompt equals the stage 3 prompt for the same input; with selection on and a 3000-character example store the cards carry no examples and `<voice_examples>` holds at most 3 passages; with a store under the budget nothing changes; the English localization leaves no Hangul.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/examples.s4.test.ts src/server/ai-features.examples.s4.test.ts eval/novel/localize --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/ai src/server --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(draft): send the author examples closest to this chapter`.

## Task 5: Cache lifetime switch and probe

**Files:**
- Modify: `src/ai/anthropic.ts`, `src/ai/responses.ts`, `eval/probe-gateway.ts`, `.env.example`
- Create: `eval/cache-gaps.ts`
- Test: `src/ai/cache-ttl.s4.test.ts`, `eval/probe-gateway.ttl.s4.test.ts`, `eval/cache-gaps.s4.test.ts`

**Interfaces:**
- Produces: `AI_CACHE_TTL` — `1h` makes every Anthropic `cache_control` `{ type: 'ephemeral', ttl: '1h' }`; anything else keeps today's object. `AI_CACHE_RETENTION` — `24h` adds `prompt_cache_retention: '24h'` to Responses requests; anything else adds nothing. Both default off; `.env.example` documents them commented out.
- Produces: `probe-gateway --ttl 1h --gap <seconds>` — sends the cached request, waits `gap` seconds, sends it again, and reports `{ ttl, gapSeconds, firstWrite, secondRead, accepted }` for the chosen path (Anthropic `ttl`, Responses `retention`), with `accepted` false on a 4xx naming the field.
- Produces: `eval/cache-gaps.ts --db <postgres url or pglite dir>` — reads `ai_runs` of writing tasks (`draft-*`, `scene-fix`) and prints, per work, how many calls came 5–60 minutes after the previous writing call of the same work, and the share; no writes.

- [ ] **Step 1: Write the failing tests:** request snapshots with each env value and unset (unset equals the stage 3 body); the probe reports `accepted: false` for a 400 naming `ttl`; `cache-gaps` on a seeded PGlite DB with gaps of 2, 10 and 90 minutes counts one of three.
- [ ] **Step 2: Run** `pnpm vitest run src/ai/cache-ttl.s4.test.ts eval/probe-gateway.ttl.s4.test.ts eval/cache-gaps.s4.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/ai --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): optional longer cache lifetime, probed first`.

## Task 6: Eval — learned requests and the example bank

**Files:**
- Create: `eval/novel/learn-edits.ts`, `eval/fixtures/novel/{ko,en}/example-bank.json`
- Modify: `eval/novel/cli.ts`, `eval/novel/state.ts`, `eval/novel/run.ts`, `eval/novel/steps/chapter.ts`, `eval/novel/steps/setup.ts`, `eval/novel/author-io.ts`, `eval/novel/agents/author.md`, `eval/fixtures/novel/{ko,en}/author-guide.md`, `eval/novel/harness-summary.ts`, `.claude/workflows/novel-eval.js`, `docs/eval/novel/README.md`
- Test: `eval/novel/learn-edits.s4.test.ts`, `eval/novel/run.learn.s4.test.ts`, `eval/novel/workflow-static.learn.s4.test.ts`

**Interfaces:**
- Produces: `--directives learn` (config `directivesMode: 'learn'`, suffix `-learn`): nothing is planted or said. After each chapter's draft is applied and before its first save, `applyAuthorEdits(text, lang): string` (in `learn-edits.ts`) makes the edits an author with the four probes would make:
  - `ban-1`: a sentence matching the stage 0 ban-1 check loses its nod clause (ko: the matched `고개를 … 끄덕였다/끄덕이며` phrase is replaced by `눈짓했다`/`눈짓하며`; en: `nodded`/`nods`/`nodding` → `looked up`/`looks up`/`looking up`).
  - `ban-2`: ko `입꼬리가 (살짝 )?올라갔다` → `웃었다`, other `입꼬리` phrases drop the clause; en `for a moment` is deleted with its comma.
  - `tic`: the last line of dialogue said by 도윤서 / Do Yunseo (attributed as in stage 2's speech check) gets `조심하십시오.` / `Watch your step.` appended inside its quotes when absent.
  - `end-dialogue`: when the chapter does not end on a dialogue line, the last paragraph is followed by a line of dialogue from the point-of-view character that repeats the chapter's last question or threat in one sentence; when none can be built, `"…이제 어떻게 할 거야?"` / `"…What now?"`.
  The saved chapter then goes through the product save, so the stage 0 edit ratio and the stage 4 inference see these edits. When a chapter is set to done, `inferDirectives` runs; its proposals go to the author agent as a pending `directive_proposals` = `{ kind, chapter, proposals: { index, text }[] }`, answered `{ add: number[] }`; the author guide (learn mode only) lists the four probes as the author's own habits and says to add a proposal only when it states one of them.
- Produces: `--example-bank on` (config `exampleBank: true`, suffix `-bank`): setup appends the bank's passages to the seeded work style card's `examples`, so stage 3 behaviour (all examples sent) and stage 4 selection run on the same store.
- Produces: `example-bank.json` per language: 10 passages of 2–4 paragraphs in the bible's work style (Serin's limited third person; dry; fog, sound and cold), each with at least one line of dialogue, covering these character × feeling pairs once each: 세린 × fear, 세린 × anger, 세린 × suspicion, 도윤서 × calm warning, 도윤서 × concealment, 한서연 (memory) × grief, a minor bible character × relief, 세린 and 도윤서 × argument, 세린 × resolve, 세린 × shame. Names and facts must agree with the bible; no event from the bible's chapter instructions is told.
- Produces: harness `learnedAdded` per chapter (proposals the author added) and `inferMs`; old runs give 0.
- `ALLOWED_RUN_FLAGS` gains `'--directives learn'` and `'--example-bank on'`.

- [ ] **Step 1: Write the failing tests:** `applyAuthorEdits` on fixed ko and en chapters makes each edit and is idempotent (a second pass changes nothing); after the edits the stage 0 directive checks report `kept` for all four; a fake learn run sets chapter 1 done, records one `directive-infer` call and a `directive_proposals` pending, and an answer `{ add: [0] }` creates a ledger row with `source: 'inferred'` used by chapter 2's draft prefix; `--example-bank on` seeds the card with the 10 passages; the bank JSON has 10 passages and every name in it is a bible name; the allowlist has both flags.
- [ ] **Step 2: Run** `pnpm vitest run eval/novel/learn-edits.s4.test.ts eval/novel/run.learn.s4.test.ts eval/novel/workflow-static.learn.s4.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** README: bullets for both flags.
- [ ] **Step 4: Run** the new tests plus `pnpm vitest run eval --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(eval): learn requests from simulated author edits and add an example bank`.

## Gate S4 (sonnet)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run --maxWorkers=2`, `pnpm build`. Only stale pinned tests are fixed here; defects go back to the owning task.

## Stage review (opus)

- [ ] Review the stage 4 range along: AI never writes the ledger (proposals only), what the inference sends (hunks only, no full chapter), vague and duplicate proposals, example selection against copying and the budget, the cache switches when unset, and the eval's simulated edits (do they read like an author's edits; does anything leak the probes to the model before the author adds them). Each finding goes to an opus skeptic; confirmed ones are fixed with the task procedure, then Gate S4 again.

## Measurement M4 (orchestrator)

Worktree `../DaeumHwa-s4` detached at the reviewed commit, set up as in M0.

- [ ] **Probes:** `probe-gateway --model haiku-5.5 --ttl 1h --gap 400` and `--model luna-6 --ttl 1h --gap 400` (luna uses retention). Record `accepted` and whether the second call read the cache after the 5-minute default would have expired.
- [ ] **Runs (6):**
  - learned requests: D ko 3 chapters `--directives learn` (G4: probes learned by chapter 1's proposals, kept in chapters 2–3; compare retention with M2's ledger run A, where the probes were written by the author);
  - examples: D ko 1 chapter `--example-bank on` with `AI_EXAMPLE_SELECTION` off, and the same with it on, twice (Q5 voice, copying flags, input tokens);
  - checks: O ko 1 chapter and D en 1 chapter with every adopted setting.
- [ ] **Decide:** inference stays when at least two of the four probes were proposed and added after chapter 1 and retention in chapters 2–3 is no worse than M2's; example selection turns on by default when Q5 is not lower, Q mean is within the 0.1 rule and input tokens fall; the cache lifetime turns on for a path only when the probe shows a read after 400 seconds and `cache-gaps` on real usage (later) shows enough 5–60 minute gaps — until there is usage data, leave it off and say so in the results doc.
- [ ] **Results doc (sonnet, Korean):** `docs/eval/harness/2026-10-2x-stage4-learn.md` with the numbers and the decisions, plus the stage 0 → 4 summary table (Q mean, failed T, must-fix per 1,000 characters, chapter cost, first-char time, retention) for the default model in Korean.
- [ ] Copy the worktree's `docs/eval/novel/2026-10-2x-s4*/` into the main checkout and commit by name. Remove `../DaeumHwa-s4` after the copy.

# Brief HX2: English substitution table, `새 회차` label

Track: Harness 2 (cloud branch). Harness-only change. Do NOT touch product code under `src/`.

## Goal

English eval runs report `hangulLeft: 3` because the draft prompt carries the Korean label `1화 (새 회차)`.
The English translator (`translateScaffold`) turns `1화` into `Chapter 1` but has no rule for `(새 회차)`,
so the prompt keeps `Chapter 1 (새 회차)`. Add one rule so the label becomes `Chapter 1 (new chapter)`,
and make the existing drift-guard test exercise the real product label. The fixture is a hand-copied string, so a
cheap check (test 7) also reads `src/server/ai-features.ts` as text and fails if the product label wording changes.

Scope: CLAUDE.md product rules (Korean copy, AppError, ActionResult, change_log) do not apply. This track changes only
eval/novel test and harness files. English output in the harness is intended.

## Evidence (numbers)

- `hangulLeft` is 3 in all three English runs of 2026-10-18: `haiku-5.5-en`, `luna-6-en`, `qwen3.8-27b-en`.
  All 3 come from one call each, `calls/025` (task `draft-chapter`). Output text is clean (foreignRuns empty).
  Sources: `docs/eval/novel/2026-10-18/haiku-5.5-en.md:103`, `luna-6-en.md:151` (expected 0 at :221),
  `qwen3.8-27b-en.md:50,162`, `summary.md:62,244`, `docs/eval/novel/follow-up-ai-improvement.md:152`.
- The "three leftover Hangul strings" in the task text is really ONE label, `새 회차`, with 3 Hangul syllables
  (새, 회, 차). `countHangul` counts syllables (3). `findHangul` returns 2 runs: `['새', '회차']`.
- The label is built in product code `src/server/ai-features.ts:294`: `` promptLabel = `${position}화 (새 회차)` ``,
  and emitted as `<chapter>${chapterLabel}</chapter>` by `src/ai/tasks/draft-chapter.ts` (buildDraftPrompt).
- It is NOT in `eval/novel/localize/en-systems.ts` (zero Hangul there). That file holds system prompts only.
  The fix goes in the `RULES` array of `eval/novel/localize/scaffold.ts` (lines 9-118).
- Why the test misses it: `eval/novel/localize/localize.test.ts:314` uses `chapterLabel: 'Chapter 4'` (already English),
  so the loop at :338-343 passes with or without a rule.
- Where it is measured: `eval/novel/eval-client.ts:439` `prompt = translateScaffold(productPrompt)` (en only),
  `:495` `hangulLeft = countHangul(system + "\n" + prompt)`. Summed in `eval/novel/steps/finish.ts:115`.

## Files

Write (existing, edit):
- `eval/novel/localize/scaffold.ts`: add one rule to `RULES`.
- `eval/novel/localize/localize.test.ts`: change the draft fixture label, add test cases.
- `eval/novel/eval-client.test.ts`: add one end-to-end en-mode test (stream draft call).

Create: none.

Read-only (do not edit):
- `eval/novel/localize/en-systems.ts` (no change needed)
- `eval/novel/eval-client.ts` (call sites, lines 438-439 and 495)
- `src/server/ai-features.ts` (label source, line 294; product must stay Korean)
- `src/ai/tasks/draft-chapter.ts`, `src/ai/tasks/draft-chapter.test.ts` (product prompt test already uses `'4화 (새 회차)'`)
- `eval/novel/steps/finish.ts`
- `docs/eval/novel/follow-up-ai-improvement.md`, `docs/eval/novel/2026-10-18/*.md` (evidence only; already-run results are not regenerated)

## Design (ordered steps)

Work in the worktree the orchestrator gives for HX2 on the cloud branch (created from main). Do not run in the main
checkout. If no worktree path or branch name was given, ask the orchestrator before editing anything.

0. Baseline. On the untouched tree run `pnpm vitest run eval/novel --maxWorkers=2` and write the names of any failing
   tests into the track notes. The Definition of done is judged against this list: only failures that are not in it count
   as HX2 regressions.
1. TDD first. In `eval/novel/localize/localize.test.ts`, edit the `'draft-chapter'` sample in `PROMPTS`
   (line 314): change `chapterLabel: 'Chapter 4'` to `chapterLabel: '4화 (새 회차)'`. Do not change anything else
   in the fixture. Run the localize test: `translateScaffold leaves Korean-free scaffolding fully translated for every task`
   must now FAIL for `draft-chapter` (Hangul `['새', '회차']` left). This proves the guard works.
2. Add the new tests listed under Tests (cases 1 to 5 and 7 in `localize.test.ts`, case 6 in `eval-client.test.ts`).
   Run them; cases 1, 2, 5, 6 fail, cases 3, 4, 7 pass.
3. In `eval/novel/localize/scaffold.ts`, inside `RULES`, in the block "Section headers and fixed sentences",
   add this tuple directly after `['현재 회차', 'Current chapter'],` (currently line 61):
   `['(새 회차)', '(new chapter)'],`
   Use the narrow form with parentheses, not bare `새 회차`, so manuscript text that merely contains the words is not rewritten
   (the product label always has parentheses). It runs before the last rule `[/(\d+)화/g, 'Chapter $1']` (line 117), which is fine
   because the two do not overlap: `4화 (새 회차)` becomes `Chapter 4 (new chapter)`.
4. Do NOT add a bare `회차` rule. `eval/novel/eval-client.test.ts:215-220` (`'회차 메모'` input at :218, expect `hangulLeft` 4 at :219) and
   `localize.test.ts:358` (`'현재 회차: 3화'` becomes `Current chapter: 3`) depend on `회차` staying untouched.
5. Run the verification commands in "Definition of done". Do not edit `en-systems.ts`, `eval-client.ts`, or anything in `src/`.
6. Leave the file header comment of `scaffold.ts` as is. Do not edit docs under `docs/eval/` (past run results stay as recorded).

## Interface (TypeScript signatures)

No signature changes. Existing exports in `eval/novel/localize/scaffold.ts`:

```ts
export function translateScaffold(prompt: string): string
export function findHangul(text: string): string[]   // distinct Hangul runs
export function countHangul(text: string): number    // Hangul syllables
```

New rule (data only), type `Rule = readonly [pattern: string | RegExp, replacement: string]`:

```ts
['(새 회차)', '(new chapter)'],
```

## Tests (TDD cases)

In `eval/novel/localize/localize.test.ts`. Add `countHangul` to the import on line 15:
`import { countHangul, findHangul, translateScaffold } from './scaffold'`.

Inside `describe('translateScaffold', ...)`, after the test at lines 357-360:

1. `translates the new-chapter draft label`
   - input `translateScaffold('3화 (새 회차)')`
   - expect `'Chapter 3 (new chapter)'`
2. `leaves no Hangul in a draft prompt built with the product label`
   - input `translateScaffold(PROMPTS['draft-chapter'])` (the fixture now has `'4화 (새 회차)'` after step 1)
   - expect `findHangul(result)` toEqual `[]` and `result` toContain `'<chapter>Chapter 4 (new chapter)</chapter>'`
3. `leaves a bare Korean word that is not in the table alone`
   - input `translateScaffold('회차 메모')`
   - expect `'회차 메모'` (pins that no bare `회차` rule exists)
4. `keeps the generic chapter-number rule for other labels`
   - input `translateScaffold('3화')`
   - expect `'Chapter 3'`
5. `countHangul is 0 after translating the draft label`
   - input `countHangul(translateScaffold('3화 (새 회차)'))`
   - expect `0`
7. `product draft label still matches the fixture and the rule` (drift check, read-only on `src`)
   - read `src/server/ai-features.ts` as text, resolved from the test file so it does not depend on the directory vitest
     starts in: `readFileSync(fileURLToPath(new URL('../../../src/server/ai-features.ts', import.meta.url)), 'utf8')`
     (`localize.test.ts` is in `eval/novel/localize/`, three levels below the repo root; verify the depth before writing).
     Add `import { readFileSync } from 'node:fs'` and `import { fileURLToPath } from 'node:url'` to the test file
   - expect the text toContain `'화 (새 회차)'` (the same literal that `['(새 회차)', ...]` and the fixture rely on)
   - if this fails, the product wording changed: update the rule, the fixture and tests 1, 2, 5, 6 together

In `eval/novel/eval-client.test.ts`, after the existing `'counts Hangul left in en mode'` test (around line 220):

6. `en mode streamed draft with the new-chapter label reports hangulLeft 0`
   - setup: `const spy = spyClient()`; `const client = new EvalClient({ inner: spy.client, profile: QWEN, lang: 'en', callsDir })`
   - prompt: build it with the real builder so the test measures product output, not a hand-typed string. Add
     `buildDraftPrompt` to the existing import `import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'` (line 28).
     Minimal valid input (same fields as the `'draft-chapter'` sample in `localize.test.ts`, trimmed):
     `buildDraftPrompt({ instructions: 'Mina finds the letter.', targetChars: 3000, styleCards: [], packText: 'Pack.', previousSummary: null, previousTail: null, chapterLabel: '3화 (새 회차)' })`
     (`(없음)` placeholders are already translated by the `['(없음)', '(none)']` rule, so the only Hangul left is the label.)
   - call: `const { final } = client.streamText({ task: { name: 'draft-chapter', input: {} }, system: DRAFT_SYSTEM, prompt, effort: 'high', maxTokens: 16000 }); await final`
     (same shape as the existing call at lines 134-140.)
   - expect `(spy.calls[0].args as StreamTextArgs).prompt` toContain `'Chapter 3 (new chapter)'`
   - expect `readRecord('001-draft-chapter.json').hangulLeft` toBe `0`
   - `StreamTextArgs` is already imported in that file (line 20). If `readRecord` does not accept that file name, check its definition at line 102 and use the same pattern as line 143 (`readRecord('002-draft-chapter.json')`).

Existing tests that must stay green unchanged: `eval-client.test.ts` `'counts Hangul left in en mode'` (expects 4),
`'en mode swaps the system prompt and translates the prompt'`, and `localize.test.ts` lines 345-360.

## Acceptance metrics

| Metric | Current | Target |
|---|---|---|
| `findHangul(translateScaffold(PROMPTS['draft-chapter']))` with the real-label fixture `4화 (새 회차)` | `['새','회차']` (guard fails after fixture change) | `[]` |
| `translateScaffold('3화 (새 회차)')` | `Chapter 3 (새 회차)` | `Chapter 3 (new chapter)` |
| `hangulLeft` of an en-mode draft call whose prompt is `buildDraftPrompt` output with label `3화 (새 회차)` (test 6) | 3 (Hangul in the label only) | 0 |
| `translateScaffold('회차 메모')` | unchanged | unchanged |
| `pnpm vitest run eval/novel` | green | green |
| Drift check (test 7): `src/server/ai-features.ts` contains `화 (새 회차)` | n/a | passes |

## Post-merge verification (outside this track)

Not part of Definition of done: a real re-run calls paid model APIs. The `novel-eval` skill resumes by rerunning with the
same `date` and runs, so completed calls (including `calls/025`, which produced `hangulLeft 3`) are not re-issued and a
same-date rerun would keep the old record. The 3 to 0 check therefore needs a fresh run: after merge, run the English evals
with a NEW `date` (and/or new run ids) for `haiku-5.5-en`, `luna-6-en`, `qwen3.8-27b-en` (one invocation per model), or
remove the old run directories first. Then check `hangulLeft` is 0 in each. Within this track, test 6 (offline) is the only
proxy; the real-run check cannot be done on the 2026-10-18 run directories.

## Dependencies on other tracks

- None blocking. Merge ordering requirement for the wave plan: HX2 goes in the FIRST wave, before A, B, D, I, J, E2 and F2
  (and the other tracks that add Korean labels, G1, H, F1, F3). Shared edit spots: the `RULES` array in
  `eval/novel/localize/scaffold.ts` and the `PROMPTS` map in `eval/novel/localize/localize.test.ts`; those tracks append
  to them, so on any conflict keep both sides. The orchestrator reads this section, so the wave plan must encode the order;
  it is not enforced anywhere else.
- HX2 edits `scaffold.ts` only among the localize sources (not `en-systems.ts`; `F2.md` line 190 says otherwise and is wrong,
  fix it there).
- No file overlap with HX1, HX3, HX4 except `eval/novel/eval-client.test.ts` (HX2 adds one test; resolve by keeping both).
- Product label wording at `src/server/ai-features.ts:294` is owned by no track here. If a track changes it, the rule
  `['(새 회차)', ...]` and the fixture in step 1 must be updated together.

## Risks

- Ordering: the rule must stay before `[/(\d+)화/g, 'Chapter $1']`. Since the new rule matches only `(새 회차)`, either order
  works functionally, but keep it in the fixed-phrase block.
- Substring rules above it: no earlier rule matches `새 회차` or `(새 회차)` (checked: `현재 회차`, `회수`, `목표`, `최신 회차` differ).
  After the edit, confirm with test 1.
- A bare `회차` or bare `새 회차` rule can rewrite manuscript text or break `eval-client.test.ts:219` (hangulLeft 4). Do not add them.
- `findHangul` returns runs, not syllables: assert "no Hangul" with `findHangul(...)` toEqual `[]`, not by counting 3.
- Already-run reviews keep `hangulLeft 3`; they are historical and are not edited.

## Open questions

- English wording: chosen `(new chapter)`. Reviews only require `hangulLeft` 0; wording is a harness choice, no product impact.
  If the orchestrator prefers `(new episode)`, change the replacement and tests 1, 2, 6 together.
- Narrow `(새 회차)` chosen over bare `새 회차`. Revisit only if the product label loses its parentheses.
- Optional, out of scope: store `findHangul` runs on the call record so reviewers see WHICH string leaked
  (today only the count exists). Not part of this track.

## Definition of done

Run from the HX2 worktree root (see Design), after the step 0 baseline:

```
pnpm vitest run eval/novel/localize eval/novel/eval-client.test.ts --maxWorkers=2
pnpm vitest run eval/novel src/ai/tasks/draft-chapter.test.ts --maxWorkers=2
pnpm eslint eval/novel/localize eval/novel/eval-client.test.ts
! pnpm exec tsc --noEmit 2>&1 | grep -qE "eval/novel/(localize|eval-client)"
```

All tests pass except any that were already failing in the step 0 baseline (list them; none may be new), eslint is clean,
and the tsc line exits 0 (it exits non-zero if tsc reports any error for these files). `git diff --stat` shows only
`eval/novel/localize/scaffold.ts`, `eval/novel/localize/localize.test.ts`, `eval/novel/eval-client.test.ts`.
If the orchestrator confirms the commit step, use one commit (rule and test changes together, since step 1 makes the
guard fail without the rule). Never use `git add -A` or `git add .`; add the files by name:

```
git add eval/novel/localize/scaffold.ts eval/novel/localize/localize.test.ts eval/novel/eval-client.test.ts
```

Commit only if the orchestrator confirms the commit step; otherwise leave changes uncommitted.

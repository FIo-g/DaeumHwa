# Track J (cloud branch): Proofread scope and quote merging

Read this whole file before editing. Work in an isolated worktree, TDD: write the failing test, see it fail, then implement. Do not add or upgrade packages. Identifiers and comments in English; prompt text and user-facing copy in Korean (the eval English mirror in English).

## Goal

1. The proofread prompt says "표준어 규범 위반만 고친다", forbids taste edits, and explicitly allows an empty list.
2. A quote the model returns once is applied at EVERY place it occurs in the manuscript (one `ProofreadSuggestion` per occurrence, each with its own `start`/`end`). Duplicate quotes from the model are merged first.
3. A pure eval metric computes the proofread acceptance ratio (no wiring into the runner).

The wire shape (`ProofreadSuggestion`, the route JSON, `ProofreadItem` in the panel) does NOT change. The `awkward` kind stays in the enum (spec F14 lists it); only the prompt narrows it.

## Evidence (numbers)

- Cloud proofread, 4 runs: 12 suggestions, 4 valid (33%), 8 invalid. haiku ko 1 (awkward, 0 valid), luna ko 4 (all awkward, 1 valid), luna en 4 (all awkward, 0 valid, the text had no real error so `[]` was ideal), haiku en 3 (spelling, valid). Sources: `docs/eval/novel/2026-10-18/summary.md:243`, `luna-6-en.md:137-138`, `luna-6-ko.md:156-168`.
- qwen ko: 6 raw suggestions, 3 distinct valid. `4층이상은` was proposed twice; both pointed at the first occurrence (offset 585-590, line 19) so the second occurrence (line 67) stayed unfixed (`qwen3.8-27b-ko.md:286-300`).
- Root causes in code (verified):
  - `PROOFREAD_SYSTEM` (`src/ai/tasks/proofread.ts:25-33`) has no "표준어 규범" wording and no empty-list sentence; line 30 offers `awkward` freely.
  - `proofreadTask.postProcess` (`proofread.ts:42-52`) does not dedupe.
  - `aiSpellChecker.check` (`src/server/chapter-check.ts:84-102`) calls `locateQuote(text, s.quote)` without a hint (line 89); `locateQuote` (`src/lib/korean/sentences.ts:63-88`) returns the FIRST exact occurrence. So every duplicate maps to the same start.
  - Eval `applySuggestions` (`eval/novel/steps/util.ts:283-306`) drops a span whose `start < edge`, so a second item with the same start is lost. After this track, per-occurrence starts differ and both survive.
- No code computes a proofread acceptance ratio today (`eval/novel/metrics.ts` exports only `ChapterMetrics`, `META_PATTERNS` and `chapterMetrics`; none computes it).

## Files

Write (existing, verified):
- `src/ai/tasks/proofread.ts` (prompt, `postProcess`)
- `src/ai/tasks/proofread.test.ts`
- `src/lib/korean/sentences.ts` (add `locateAllQuotes`)
- `src/lib/korean/sentences.test.ts`
- `src/server/chapter-check.ts` (`aiSpellChecker.check`)
- `src/server/chapter-check.test.ts` (inside `describe('runProofread')`, after the test at line 360)
- `eval/novel/localize/en-systems.ts` (`PROOFREAD_SYSTEM`, lines 31-39)
- `eval/novel/eval-client.test.ts` (add one assertion test near line 152)
- `eval/novel/metrics.ts` (add `proofreadStats`)
- `eval/novel/metrics.test.ts`

Create: none.

Read-only (do not edit):
- `src/components/writing/panels/proofread-panel.tsx` (apply at 97-107 uses `replaceQuote(quote, replacement, item.start)`; `applyAllRules` 110-123 rules only)
- `src/components/writing/text-ops.ts` (`replaceQuoteText` 20-32: uses the hint if the text there starts with the quote, else `indexOf`; so same-quote items still reach a remaining occurrence after earlier replacements shift offsets)
- `eval/novel/steps/chapter.ts` (proofread step 182-247, ids are array indexes), `eval/novel/steps/util.ts` (`applySuggestions`)
- `eval/novel/author-io.ts` (decision schema), `src/ai/run.ts` (`postProcess` runs at line 109), `src/test/fake-ai.ts`, `src/test/ai-fakes/proofread.ts`, `e2e/ai-stub/responders.ts:41` (stub keyed on `proofreadTask.system`, follows prompt changes automatically), `src/server/chapter-check.test.ts:60` (`scriptedClient` helper)

## Design (ordered)

1. `src/lib/korean/sentences.ts`: add exported `locateAllQuotes(text, quote, limit = 20)`. Exact match only, non-overlapping (advance by `quote.length`), original-text offsets, stops at `limit`, returns `[]` for an empty quote or no exact hit. Do not touch `locateQuote`. Put it right after `locateQuote`. Decision: this track keeps its own `locateAllQuotes` and does NOT import `findQuoteOccurrences` from `@/ai/guards` (GUARDS section 8 lists J as a consumer; this is a deliberate deviation, see Dependencies). Reason: the two differ on purpose. `findQuoteOccurrences` allows overlaps and falls back to a whitespace-collapsed match; here overlapping ranges would only be dropped again by the overlap guard in step 4, and the whitespace fallback is already handled by `expandQuote` through `locateQuote`. Keeping it local also keeps J independent of the foundation track.
2. `src/ai/tasks/proofread.ts`, `PROOFREAD_SYSTEM`: keep the first line, line 27, 28 and the line 29 sentence "대사 속 구어체, 사투리, 인물 말투, 의도된 비문은 고치지 않는다. 문체를 바꾸는 제안은 하지 않는다." VERBATIM (existing test asserts the first sentence). Insert after line 29 these exact lines:
   - `- 표준어 규범 위반만 고친다. 취향에 따라 표현을 다듬는 제안은 하지 않는다.`
   - `- 고칠 곳이 없으면 suggestions를 빈 배열로 낸다. 억지로 채우지 않는다.`
   - `- 같은 표현이 여러 곳에 있어도 항목은 하나만 낸다. 모든 위치는 앱이 찾아서 고친다.`
   Replace the kind line (30) with: `- kind는 spelling(맞춤법), spacing(띄어쓰기), grammar(문법), awkward(어색한 표현) 중 하나다. awkward는 문장이 문법상 성립하지 않을 때만 쓴다.` Keep `${TAG_DATA_RULE}` and the final "모든 출력은 한국어로 쓴다." lines.
3. `proofread.ts`, `postProcess`: skip a suggestion whose final `quote` was already kept (first one wins, regardless of replacement; the same text cannot take two replacements). Use a `Set<string>`. ORDER matters: run the existing drops first (empty quote, `replacement === quote`, unlocatable), re-slice the quote, check the Set, and add the quote to the Set only when the suggestion is pushed. Otherwise a dropped item (for example `replacement === quote`) would block a later valid item with the same quote and break the existing test (test 9).
4. `src/server/chapter-check.ts`, `aiSpellChecker.check`: replace the single `locateQuote` call with a module-private helper `expandQuote(text, quote)` returning `{start, end}[]`:
   - If `quote.trim().length >= 2`, use `locateAllQuotes(text, quote)`; if that is non-empty return it.
   - Otherwise (1-char quote, or no exact hit such as a whitespace-normalized quote) return `[locateQuote(text, quote)]` filtered to non-null (old behavior).
   Matching is substring-based (not word-aware), like `locateQuote` and the panel's `replaceQuoteText`: a quote `그는` also matches inside `그는커녕`. This is a known over-fix kept for now (open decision, see Risks); test 22 records it and may be replaced when a boundary rule is chosen. The 20-occurrence cap is silent: occurrences 21 and later stay unfixed and nothing is reported on the wire (no new field); test 11 pins it, and the re-eval reviewer checks long repeats by hand.
   Then for each model suggestion emit one `ProofreadSuggestion` per range, same `quote/replacement/kind/reason`, `source: 'ai'`. Keep `quote` as the model's `s.quote` when the range came from an exact match; use `text.slice(start, end)` when it came from the `locateQuote` fallback. Skip any range that overlaps a range already emitted by an earlier AI suggestion, where "earlier" means model output order (the order of `output.suggestions`), not text position (`start < kept.end && kept.start < end`), so ranges never collide. The result therefore depends on the order the model returns; that is accepted, and `runProofread` sorts by start afterwards. Import `locateAllQuotes`. `runProofread` is unchanged (rule-overlap filter and sort stay).
5. `eval/novel/localize/en-systems.ts` `PROOFREAD_SYSTEM`: mirror step 2 in English, no Hangul. Insert after the "Do not fix colloquial speech..." line: `- Fix only violations of standard language norms. Do not suggest taste-based rewording.`, `- If there is nothing to fix, return an empty suggestions array. Do not pad the list.`, `- If the same expression appears in several places, give one item only. The app finds and fixes every place.` Replace the existing kind line (line 36 of `eval/novel/localize/en-systems.ts`) with this full line: `- kind is one of spelling (spelling error), spacing (spacing error), grammar (grammar error) or awkward (awkward phrasing). Use awkward only when the sentence is ungrammatical.` Keep the `${EN_TAG_DATA_RULE}` and final "Write all output in English." lines.
6. `eval/novel/metrics.ts`: add pure `proofreadStats` (signature below). No change to `chapterMetrics`, `finish.ts` or the runner. Document in a comment the caller contract: `chapters/NN.proofread.json` holds the raw `ProofreadSuggestion[]` (quote, replacement, kind, reason, source, start, end) with NO `id`, and the decision ids are array indexes (`eval/novel/steps/chapter.ts` maps `Number(d.id)` into that array). So the caller builds `items = suggestions.map((s, i) => ({ id: String(i), quote: s.quote, replacement: s.replacement, kind: s.kind }))` from ALL suggestions (rule items included, so ids line up with `decisions` from `author-decisions.jsonl`). To measure AI quality only, filter to `source === 'ai'` while keeping the original index as the id, and pass only the matching decisions (or leave the rest; unknown ids are ignored). `acceptanceRatio` therefore counts rule items unless the caller filters. 'Invalid' in this brief means `accept: false` in the author decisions.
7. Run the Definition of done commands.

## Interface

```ts
// src/lib/korean/sentences.ts
export function locateAllQuotes(
  text: string,
  quote: string,
  limit?: number, // default 20
): { start: number; end: number }[]

// eval/novel/metrics.ts
export type ProofreadStats = {
  total: number            // items
  accepted: number
  acceptanceRatio: number | null // accepted / total, null when total is 0
  awkward: number          // items with kind 'awkward'
  sameQuoteItems: number   // items beyond the first for the same quote and replacement; after this track one model item expands to one item per occurrence, so this counts expansion by design, NOT model duplication
  distinctQuotes: number   // number of distinct `quote` values among items
  acceptedQuotes: number   // distinct quotes with at least one accepted item
  quoteAcceptanceRatio: number | null // acceptedQuotes / distinctQuotes, null when distinctQuotes is 0
}
export function proofreadStats(
  items: { id: string; quote: string; replacement: string; kind: string }[],
  decisions: { id: string; accept: boolean }[],
): ProofreadStats
// accepted counts decisions with accept true whose id matches an item; unknown ids are ignored.
// Unit: acceptanceRatio is per item (one item per occurrence after this track); quoteAcceptanceRatio is per distinct quote.
// Report both in the review note: expansion grows the item denominator, so only the per-quote ratio is on the same unit before and after.
```
`ProofreadSuggestion`, `proofreadTask`, `runProofread`, `ProofreadSchema` keep their signatures.

## Tests (TDD cases: name | input | expected)

`src/lib/korean/sentences.test.ts` (new `describe('locateAllQuotes')`):
1. returns every occurrence | text `'4층이상은 안 된다. 그러나 4층이상은 된다.'`, quote `'4층이상은'` | two ranges, starts `[0, text.indexOf('4층이상은', 1)]`, each `end = start + 5`.
2. non-overlapping | text `'aaa'`, quote `'aa'` | `[{start:0,end:2}]`.
3. empty quote or absent | text `'가나다'`, quote `''` and quote `'없음'` | `[]` for both.
4. respects limit | text `'가나 '.repeat(30)`, quote `'가나'`, limit 5 | length 5.
22. known: substring hit inside a longer word is expanded | text `'그는커녕 그는 갔다.'`, quote `'그는'` | two ranges, starts `[0, text.indexOf('그는', 1)]` (matches inside `그는커녕` too; the author skips one in the panel if unwanted). This records current behavior, not an endorsement; replace the test when a boundary rule is decided.

`src/ai/tasks/proofread.test.ts`:
5. `system prompt limits fixes to standard-norm violations` | `proofreadTask.system` | contains `표준어 규범 위반만 고친다.`
6. `system prompt allows an empty list` | system | contains `빈 배열`.
7. `system prompt still forbids style edits and keeps the data rule` | system | `import { TAG_DATA_RULE } from '@/ai/prompt-utils'` (as the existing test near line 50 does), then `expect(proofreadTask.system).toContain('문체를 바꾸는 제안은 하지 않는다.')` and `expect(proofreadTask.system).toContain(TAG_DATA_RULE)` (the constant's value, not its name).
8. `postProcess merges the same quote` | text `'그건 어색해요. 저것도 어색해요.'`, output two items quote `'어색해요'` (replacements `'어색합니다'`, `'어색하군요'`) | one item, replacement `'어색합니다'`.
9. Existing tests at lines 29-51 must stay green unchanged.

`src/server/chapter-check.test.ts` (in `describe('runProofread')`, use `scriptedClient` as in the test at line 360, `useAi: true`):
10. `applies one AI quote to every occurrence` | text `'그건 어색해요. 저것도 어색해요.'`, AI returns one `어색해요` item | two `ai` suggestions, starts `[text.indexOf('어색해요'), text.lastIndexOf('어색해요')]`, ends `start + 4`, sorted.
11. `expansion stops at 20 occurrences per quote` | text `'어색해요. '.repeat(21)`, AI returns one `어색해요` item | exactly 20 `ai` suggestions (the 21st occurrence is not expanded; pins the silent cap).
12. `a one-character quote stays on the first occurrence` | text `'나는 나를 본다.'`, AI quote `'나'` replacement `'내'` | exactly one suggestion, start 0.
13. `overlapping AI ranges keep the earlier suggestion in model order` | text `'그는 서있다.'`, AI items in this order: `서있다`->`서 있다`, then `있다`->`있어` | only the first (start of `서있다`). The scripted client returns the items in exactly this order; the rule is model order, not lower start.
14. `an empty AI list returns only rule suggestions` | text `'안 되요.'`, AI `{suggestions: []}` | `runId` not null, one `rule` suggestion (start 2). Passes today; guards the empty list.

The merge of duplicate model items is proven by test 8 (postProcess). There is no chapter-check test for it, because the overlap guard would drop the repeated ranges even without the dedupe, so such a test would pass either way.
15. Existing test at line 360 must stay green unchanged.

`eval/novel/eval-client.test.ts` (near line 152, reuse its setup):
16. `English proofread system carries the scope rules` | `EN_SYSTEMS.proofread` | contains `Fix only violations of standard language norms.` and `return an empty suggestions array`, and has no Hangul (`/[가-힣]/` false).

`eval/novel/metrics.test.ts` (new `describe('proofreadStats')`):
17. ratio | 4 items (ids `'0'..'3'`), decisions accept `0,1` true and `2,3` false | `total 4, accepted 2, acceptanceRatio 0.5`.
18. empty | `[]`, `[]` | `acceptanceRatio` null, all counts 0.
19. awkward and same-quote items | items: two with identical quote+replacement, one `kind:'awkward'` | `sameQuoteItems 1`, `awkward 1`.
20. unknown decision id ignored | decision id `'9'` accept true | `accepted 0`.
21. per-quote ratio | 3 items: quote `A` ids `'0'`,`'1'` (accept `'0'` true, `'1'` false), quote `B` id `'2'` (false) | `distinctQuotes 2, acceptedQuotes 1, quoteAcceptanceRatio 0.5, acceptanceRatio` 1/3; empty input gives `quoteAcceptanceRatio` null (extend test 18).

TDD order: the red-first tests (must fail before the change) are 1-6, 8, 10, 11, 13, 16, 17-22. Tests 7, 12 and 14 already pass today and are regression guards; tests 9 and 15 are the existing tests that must stay green.

## Acceptance metrics

Raw run data (`chapters/NN.proofread.json`, `author-decisions.jsonl`) is NOT available in this checkout or on this machine (`docs/eval/novel/2026-10-18/` holds only the summary and run review .md files; `eval/results/` is gitignored). So every "before" value for `proofreadStats` fields is n/a here; it must be produced on the author machine that ran the 2026-10-18 eval (source: `eval/results/<run>/chapters/NN.proofread.json` and `author-decisions.jsonl`), or left as n/a until a re-eval is run with the new code.

Two measures, never mixed: HAND validity (a person judged each suggestion valid or invalid; baseline exists, from the summary) and AUTHOR acceptance (the author agent's `accept` decision, computed by `proofreadStats`; no baseline here).

| Metric | Current | Target |
|---|---|---|
| Hand validity ratio, cloud (haiku/luna, ko+en, same chapters), per suggestion | 4/12 = 0.33 (hand-checked, from the 2026-10-18 summary; NOT produced by `proofreadStats`) | >= 0.8, hand-checked on a re-eval (same measure on both sides) |
| Author acceptance ratio per item (`proofreadStats.acceptanceRatio`, AI items only) | n/a (raw data not available here, see above) | trend only, no numeric target; compare with the before-value from the author machine when it exists. Per item AFTER expansion: one bad quote adds several rejected items, so also report `quoteAcceptanceRatio` (per distinct quote) before and after |
| `awkward` share of suggestions, cloud | 9 of 12 | 0 unless the sentence is ungrammatical |
| Invalid suggestions on a clean chapter (luna en) | 4 (hand-checked; `proofreadStats` sees them only as `accept: false` decisions) | 0 (empty list) |
| Prompt carries "표준어 규범 위반만 고친다." and the empty-list rule (ko and en mirror) | absent | present (tests 5, 6, 16) |

Manual review checklist for the re-eval (not measured by any metric, `proofreadStats` has no occurrence-coverage field and the 20-per-quote cap is silent):
- qwen ko duplicate quote pair (`4층이상은`, lines 19 and 67): both occurrences get their own item (before: 1 pair left unfixed, 67행 uncovered). Also check long repeats for occurrences beyond 20.

Prompt effect on model quality is only verified by the later eval re-run; unit tests prove the wording and the merging.

## Dependencies on other tracks

- F1 (proofread split in three chunks): same functions. Expansion and dedupe must run on the WHOLE text after chunk offsets are remapped. If F1 lands first, keep `expandQuote` where the whole-text offsets are known; do not run it per chunk. Merge conflicts in `aiSpellChecker` are likely: resolve by keeping both behaviors.
- HX2 (English substitution table): does not edit `en-systems.ts` (its brief says no change there), so no conflict on `PROOFREAD_SYSTEM`. Its `eval-client.test.ts` edit is a different test; keep both.
- GUARDS (`briefs/GUARDS.md`): no code dependency. GUARDS section 8 exports `findQuoteOccurrences` (overlapping, whitespace-collapsed fallback) and names J as a consumer; J deliberately keeps its own `locateAllQuotes` (non-overlapping, exact only, in `sentences.ts`), see design step 1. Ask the orchestrator to correct the GUARDS consumer list. Merge order for `eval/novel/metrics.ts`: GUARDS step 10 changes only the top of the file (regex constants and the `foreignRuns` line); J only appends `ProofreadStats` and `proofreadStats` at the end. The hunks do not overlap, so either order works; on conflict keep both.
- G1 (quote verification): uses the GUARDS `verifyQuote`; it does not touch `locateAllQuotes`. If G1 or another track has already added an exported all-occurrence locator to `sentences.ts` with the same signature as `locateAllQuotes`, reuse it instead of adding a second one.
- E1/E2/C: if they add rule kinds or proofread passes, they must go through the same expansion; the `kind` enum stays unchanged here.
- HX3 (author sees wiki) changes author decisions and shifts the acceptance baseline; no code dependency.

## Risks

- Expanding to every occurrence may fix a place where the quote is intentional (dialogue dialect). Mitigations: quotes shorter than 2 chars are not expanded; at most 20 occurrences; prompt already forbids dialect fixes; per-item apply remains in the panel (the author can skip one).
- Substring over-fix (more likely than the dialect case): a short quote such as `그는` or `할게` also matches inside longer words (`그는커녕`, `할게요`) and each hit becomes an item. Open decision: this track keeps substring matching for now and records it with test 22 (named "known"); whether to add a word-boundary rule is not decided here. A later track may add it, for example as an optional parameter of `locateAllQuotes` with the default unchanged. Mitigation for now is the same per-item apply in the panel; watch for it in the re-eval.
- The 20-per-quote cap silently leaves occurrences 21+ unfixed and unreported (test 11). Expected; note long repeats in the review.
- Panel apply is one item at a time; after the first replacement later `start` values are stale when the replacement length differs. `replaceQuoteText` falls back to `indexOf`, so a remaining occurrence is still found. Do not change the panel; if a regression is suspected, add a jsdom test, not code.
- Review item count and author decision ids change (one per occurrence); the eval id contract (ids = array indexes, exact coverage) still holds.
- Existing tests that would break: `proofread.test.ts` lines 10-13 only if line 25 or the line 29 sentence is reworded (keep verbatim). `chapter-check.test.ts:360` assumes one `어색해요`, which still holds.
- qwen empty-list runs cost 696 s and 11.8k output tokens; the empty-list rule must not raise thinking. Not measurable here; note it for the re-eval.
- Dropping the whitespace-normalized quote's original text: in the fallback path use `text.slice(start, end)` as the quote, otherwise `replaceQuote` cannot find it.

## Open questions

1. Should `awkward` be removed from the enum? Decision for this track: NO, narrow it by prompt only (spec F14 and plan T13 list it). A later track may filter it.
2. Metric unit: `acceptanceRatio` is per item (chosen), but expansion changes the denominator, so `proofreadStats` also returns `quoteAcceptanceRatio` (per distinct quote); compare both before and after.
3. Does gray/grey consistency count as a real error? Not decided; the author rule (`eval/novel/agents/author.md:54`) is untouched.
4. Should the panel group same-quote items ("2곳") or offer "apply everywhere"? Out of scope.
5. Wire `proofreadStats` into `buildRunSummary` (`eval/novel/steps/finish.ts`)? Not now; it needs file reads (`chapters/NN.proofread.json`, `author-decisions.jsonl`). Orchestrator decides.

## Definition of done

Run from the worktree root:
```
pnpm vitest run src/ai/tasks/proofread.test.ts src/lib/korean/sentences.test.ts src/server/chapter-check.test.ts src/server/actions/checks.test.ts "src/app/api/works/[workId]/chapters/[chapterId]/proofread/route.test.ts" src/components/writing/panels/proofread-panel.test.tsx eval/novel/metrics.test.ts eval/novel/eval-client.test.ts eval/novel/localize/localize.test.ts eval/novel/run.test.ts e2e/ai-stub/stub.test.ts --maxWorkers=2
pnpm exec tsc --noEmit   # filter output to the files in this brief
pnpm eslint src/ai/tasks/proofread.ts src/lib/korean/sentences.ts src/server/chapter-check.ts eval/novel/metrics.ts eval/novel/localize/en-systems.ts
pnpm exec prettier --check <every file under Files (write)>   # never run `pnpm format` on the whole repo; it must not reformat untouched files
```
All listed tests pass, no new type or lint errors in touched files, prettier check is clean on the touched files, and `git status` shows only the files under Files (write). Commit by file name, never `git add -A`.

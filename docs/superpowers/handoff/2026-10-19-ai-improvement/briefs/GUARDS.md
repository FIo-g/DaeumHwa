# Brief: track GUARDS (shared detector library, `src/ai/guards`)

Branch: cloud. Implementer: haiku, TDD, isolated worktree. All paths are relative to the repo root.
Foundation track, wave 1, merged first. Consumers (they import from `@/ai/guards`, spec section 6): C (`foreignScriptSpans`, `foreignScriptRuns`), E2 (`sampleCopies`, `repeatedWords`), G1 (`isNearDuplicateFact`). Do NOT wire the guards into services, tasks, prompts or UI. Pure functions only.
Binding source: spec `docs/superpowers/specs/2026-10-19-ai-improvement-design.md` section 6 (five public functions). If this brief and the spec disagree, the spec wins.

## 1. Goal

Create `src/ai/guards/` with five public pure functions and their types: `foreignScriptSpans`, `foreignScriptRuns`, `repeatedWords`, `sampleCopies`, `isNearDuplicateFact`; types `Lang`, `ForeignScript`, `ForeignSpan`, `RepeatedWord`, `SampleCopyHit`. Then make `eval/novel/metrics.ts` use `foreignScriptRuns` for `foreignRuns`, with identical output (pinned by a new golden test written against the old code first, step 7).
Not in this track (owned elsewhere, do not build): sentence or paragraph counting (E1, `src/lib/korean/paragraphs.ts`), length checks (A, `src/lib/draft-length.ts`), quote verification (G1, `evidence-quote.ts`), all-occurrence quote search (J, `locateAllQuotes`), a batch near-duplicate API.
No DB, no AI client, no Actor, no AppError, no Next.js API, no new packages. Return data; callers pick the Korean message.

## 2. Evidence (numbers; source docs/eval/novel/2026-10-18/summary.md and the six run reviews in the same folder)

- Foreign script: qwen ko final text kept `嬷嬷`; all 3 draft attempts had Han. Eval-only detection exists, strings only, no offsets.
- Repeated words: qwen ko `오른손`/`왼손` 37 times; qwen en `did not` 27 (source: docs/eval/novel/2026-10-18/summary.md line 238).
- Sample copy: 5 of 6 runs reused style-card example sentences. Haiku ko `쇠가 손바닥에 달라붙을 만큼 차가워서` vs card `쇠가 손바닥에 들러붙을 만큼 차가웠다.` (exact match misses it).
- Near-duplicate facts re-proposed: haiku ko 12/72 (about 17%), luna en about 9/58, luna ko about 6, qwen en 4 fact pairs (plus 4 relation pairs, 8 total).

## 3. Files

Verified to exist (read-only unless listed under write):
- write: `eval/novel/metrics.ts` (step 7 only: replace the 3 regex constants, lines 36-39, and the `foreignRuns` computation, lines 52-55)
- create: `eval/novel/metrics.foreign.test.ts` (golden test for `chapterMetrics(...).foreignRuns`, step 7)
- read-only: `src/lib/korean/sentences.ts` (`splitSentences`, type `Sentence`), `src/lib/korean/josa.ts` (`stripJosa`), `eval/novel/metrics.test.ts` (must pass unchanged), `eval/novel/author-io.ts` (MetricsSchema; unchanged because `foreignRuns` stays `string[]`), `vitest.config.ts`, `docs/eval/novel/follow-up-ai-improvement.md`.

Create (do not exist yet; the `src/ai/guards` directory does not exist):
- `src/ai/guards/types.ts`, `scripts.ts`, `repeats.ts`, `similarity.ts`, `sample-copy.ts`, `fact-similarity.ts`, `index.ts` (barrel)
- tests: `scripts.test.ts`, `repeats.test.ts`, `similarity.test.ts`, `sample-copy.test.ts`, `fact-similarity.test.ts`, `index.test.ts` (`types.ts` holds types only and is covered by `tsc` and the type assertions in `index.test.ts`)
- No other file names in `src/ai/guards`. No `counts.ts`, `sentences.ts`, `quotes.ts`, `near-duplicate.ts`, `evidence-quote.ts`.

What already exists (reuse, do not copy): `splitSentences(text)` returns `{text,start,end}[]` (UTF-16 offsets, trimmed), splits at `.!?…` plus closers and at line breaks. `stripJosa(word)` (`오른손으로` -> `오른손`, `종루에서` -> `종루`, verified). Allowed imports in `src/ai/guards` non-test files: only `./*`, `@/lib/korean/sentences`, `@/lib/korean/josa`.
Not usable for similarity: `src/lib/diff.ts` (history diff), `src/lib/search.ts` (card search), `normalizeProposalText` (exact-dedupe key only).

## 4. Design (do the steps in order; red test first for each)

All offsets are UTF-16 indices into the given string (same as `splitSentences`).

1. `types.ts`: `Lang = 'ko' | 'en'`, `ForeignScript = 'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul'`, `ForeignSpan = { start; end; text; script: ForeignScript }`, `RepeatedWord`, `SampleCopyHit` (shapes in section 5).
2. `similarity.ts` (not exported from the barrel; internal helpers shared by steps 5 and 6):
   - `normalizeForCompare(s)` = `s.normalize('NFC')`, lowercase, remove all `[\s\p{P}\p{S}]`.
   - `bigramDice(a, b)` on normalized strings: character (code point) bigram multisets, `2*shared/(totalA+totalB)`, 0 when both have no bigrams.
   - `gramContainment(example, draft, n = 3)` on normalized strings: share of the example's DISTINCT character n-grams (code points, a `Set`) that also occur in the draft's n-gram set; 0 when the example has no n-grams. Asymmetric on purpose: it catches an example sentence embedded in a longer draft sentence, where Dice drops.
3. `scripts.ts` `foreignScriptSpans(text, lang, opts?: {allow?: string[]})`: use the same regexes as `eval/novel/metrics.ts`: `OTHER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}�]+/gu` (write U+FFFD as the escape `�` exactly as `eval/novel/metrics.ts` line 37 does; never paste the literal replacement character into the regex, it is invisible and easy to drop), `LATIN = /[A-Za-z]{4,}/g` (only when lang `ko`), `HANGUL = /[가-힣]+/g` (only when lang `en`). Use `matchAll` to get offsets. `script` of an OTHER run is decided by its first char: Han -> `han`, Hiragana/Katakana -> `kana`, Cyrillic -> `cyrillic`, U+FFFD -> `replacement`; LATIN runs are `latin`, HANGUL runs `hangul`. Result sorted by `start`. Spans whose lowercased text is in `allow` (lowercased) are dropped. Add `foreignScriptRuns(text, lang)` returning strings in the eval order: Latin (ko) or Hangul (en) runs first, then OTHER runs, each in text order (built from the regexes directly, not from the sorted span list). Callers that need the containing sentence (C) use `splitSentences` and `sentenceIn` themselves; there is no sentence helper here.
4. `repeats.ts` `repeatedWords(text, opts?)`: pipeline, in this order: (1) tokenize with `text.match(/[\p{L}\p{N}]+/gu)` keeping offsets, lowercase, and apply `stripJosa` to all-Hangul tokens; this is the token list. (2) `ngram: 1`: filter the token list by `minLength` (default ko 2, en 4, lang default `ko`), by `allow` words, and, for lang `en`, by `EN_STOPWORDS` (the, and, that, with, was, were, had, has, have, her, his, she, they, them, this, there, from, for, not, but, you, your, said, what, when, then, into, been). (2') `ngram: 2`: pair ADJACENT tokens of the unfiltered step-1 list (no minLength or stopword filter, so a short or stop word still sits in a pair), join with one space, then drop pairs whose joined text is in `allow`. Pairs are never formed across a dropped token because nothing is dropped before pairing. Count; keep `count >= minCount` (default 8, spec section 8). Return `{word, count, per1000, positions}[]` sorted by count desc then word asc; `per1000 = count*1000/[...text].length` rounded to 2 decimals (code points: the one intentional exception to the UTF-16 rule). `positions` = the UTF-16 start offset in the original text of every counted token (for `ngram: 2`, the offset of the first token of the pair), in text order. No verb-ending filter here; E2 may filter in its wrapper (section 10, question 2). Defaults are uncalibrated (section 9).
5. `sample-copy.ts` `sampleCopies(text, examples, opts?)`: split every example string and the draft with `splitSentences` (the examples array may hold several sentences per string); example sentences are de-duplicated and those whose `normalizeForCompare` length is under `minChars` are dropped. For each draft sentence whose normalized length is >= `minChars` (default ko 10, en 24; lang default `ko`): for every example sentence compute `dice = bigramDice(example, sentence)` and `cont = gramContainment(example, sentence)`; an example qualifies when `dice >= threshold` (default 0.6) or `cont >= minContainment` (default 0.5); among qualifying examples take the one with the highest `score = max(dice, cont)`. Return `{start,end,text,example,score}` per draft sentence (start/end = the draft sentence, `example` = the example sentence text), score rounded to 3 decimals, in text order. Never flag sentences below `minChars`. Known limit (comment in code): `splitSentences` has no English abbreviation handling, so `Mr.` splits a sentence; the `minChars` floor hides the fragments, and a copied sentence that contains an abbreviation may be missed.
6. `fact-similarity.ts` `isNearDuplicateFact(a, b): boolean` (replaces the old batch finder; one pair per call, G1 loops). `export const FACT_DUPLICATE_DICE = 0.8` (spec section 8). Steps: `na`/`nb` = `normalizeForCompare`; if either is empty return false; if `na === nb` return true; compare the sorted lists of `/\d+/g` matches of the RAW strings, and if they differ return false (digits differ means a different fact); if either normalized string has fewer than 2 code points return false; else return `bigramDice(a, b) >= FACT_DUPLICATE_DICE`. Document in a comment these known limits, each pinned by a test: antonym pairs inside long sentences score above 0.8 (`왼손잡이`/`오른손잡이` in a longer sentence is 0.828, `left-handed`/`right-handed` 0.809) and are reported as duplicates; no number or synonym normalization (`19` vs `nineteen` is 0.583, `열아홉` forms are not compared). No `hasConflict`, no contrast-pair list, no word lists.
7. `eval/novel/metrics.ts`. FIRST, before touching it, create `eval/novel/metrics.foreign.test.ts` with golden cases and run it green against the current code: record the current `chapterMetrics(text, lang, 1000).foreignRuns` for fixtures covering (a) ko with mixed Latin and Han (Latin runs before Han runs), (b) en with Hangul, (c) kana, (d) Cyrillic, (e) U+FFFD, (f) several runs of each kind in one text, (g) clean ko and clean en (`[]`). Write the expected arrays by hand from the recorded output. THEN delete `OTHER_SCRIPT_RUN`, `LATIN_RUN`, `HANGUL_RUN` and set `foreignRuns = foreignScriptRuns(trimmed, lang)` (import from `@/ai/guards`); the golden test and the unchanged `eval/novel/metrics.test.ts` must both stay green. Do nothing else in `metrics.ts` (E1, E2 and I/J may add fields or re-exports there; keep the diff tiny). Track C no longer edits these lines (it imports the guard), so this edit has no competitor.
8. `index.ts` (barrel): explicit named exports only, no `export *`: `export type { Lang, ForeignScript, ForeignSpan, RepeatedWord, SampleCopyHit } from './types'`, `export { foreignScriptSpans, foreignScriptRuns } from './scripts'`, `export { repeatedWords } from './repeats'`, `export { sampleCopies } from './sample-copy'`, `export { isNearDuplicateFact } from './fact-similarity'`. `similarity.ts` helpers and `FACT_DUPLICATE_DICE` stay out of the barrel (the constant is importable from `@/ai/guards/fact-similarity`).

## 5. Interface (exact signatures)

Defaults, stated once: every optional `lang` (`repeatedWords`, `sampleCopies`) defaults to `'ko'`; `minChars`, `threshold`, `minContainment`, `minCount` defaults are the ones in section 4; `isNearDuplicateFact` takes no options and no `lang`.

```ts
// types.ts
export type Lang = 'ko' | 'en'
export type ForeignScript = 'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul'
export type ForeignSpan = { start: number; end: number; text: string; script: ForeignScript }
export type RepeatedWord = { word: string; count: number; per1000: number; positions: number[] }
export type SampleCopyHit = { start: number; end: number; text: string; example: string; score: number }
// scripts.ts
export function foreignScriptSpans(text: string, lang: Lang, opts?: { allow?: string[] }): ForeignSpan[]
export function foreignScriptRuns(text: string, lang: Lang): string[]
// repeats.ts
export function repeatedWords(text: string, opts?: { lang?: Lang; minCount?: number; minLength?: number; ngram?: 1 | 2; allow?: string[] }): RepeatedWord[]
// sample-copy.ts
export function sampleCopies(text: string, examples: string[], opts?: { lang?: Lang; threshold?: number; minContainment?: number; minChars?: number }): SampleCopyHit[]
// fact-similarity.ts
export const FACT_DUPLICATE_DICE = 0.8
export function isNearDuplicateFact(a: string, b: string): boolean
// similarity.ts (internal, not in the barrel)
export function normalizeForCompare(s: string): string
export function bigramDice(a: string, b: string): number
export function gramContainment(example: string, draft: string, n?: number): number
```

## 6. Tests (TDD; name | input | expected). Dice and containment values below were computed with a prototype of the same algorithm.

scripts.test.ts
- Han span with offsets | `'그는 以上是 말했다'`, ko | `[{text:'以上是', script:'han', start:3, end:6}]`
- kana, Cyrillic, replacement | `'ひらがな 카타カナ Привет 깨짐�'`, ko | scripts `kana`, `kana`, `cyrillic`, `replacement`, in text order
- ko Latin threshold | `'그는 OK 말하고 Hello 했다'`, ko | only `Hello` (`latin`)
- en Hangul | `'She said 안녕 and left.'`, en | `[{text:'안녕', script:'hangul'}]`; the same text as ko -> two latin spans, texts `['said','left']` (4+ letter Latin runs; `She` and `and` are too short) and no Hangul span
- clean pair | `'그는 문을 열었다.'` as ko -> `[]`; `'He opened the door.'` as en -> `[]`
- allow | `'그는 Hello 했다'`, ko, allow `['hello']` | `[]`
- runs order equals eval | `'그는 嬷嬷에게 말했다. ひらがな 카타カナ Привет 깨짐� 끝.'`, ko | `['嬷嬷','ひらがな','カナ','Привет','�']`
- runs, Latin before Han | `'嬷嬷 hello 三楼'`, ko | `['hello','嬷嬷','三楼']` (Latin first even though Han comes first in the text), while `foreignScriptSpans` is sorted by start

repeats.test.ts
- josa stripped | `'오른손으로 잡고 오른손을 뻗었다 오른손'`, ko, minCount 3 | `[{word:'오른손', count:3}]` (positions length 3)
- below default minCount | same text, default minCount | `[]`
- default minCount is 8 | `'오른손을 '.repeat(8)` ko | one hit, count 8; `'오른손을 '.repeat(7)` -> `[]`
- bigram | `'He did not go. She did not stop. We did not care.'`, en, ngram 2, minCount 3 | `[{word:'did not', count:3}]`
- en stopwords and short words ignored | `'the the the the the the cat'`, en, minCount 3 | `[]`
- allow | the 오른손 text with allow `['오른손']`, minCount 3 | `[]`
- bigram pairs are adjacent in the unfiltered list | `'did not go. did not stop. did not care. did not'`, en, ngram 2, minCount 4 | `[{word:'did not', count:4}]` and `'not go'` is absent; also `'red the fox. red the fox. red the fox.'`, en, ngram 2, minCount 3 | contains `'red the'` and `'the fox'` (stopword `the` is not dropped before pairing)
- per1000 | 3 hits in a 60-char text | `per1000 = 50`

similarity.test.ts
- normalize | `'Hello, World!'` | `'helloworld'`
- identical | `bigramDice('서윤은 왼손잡이다','서윤은 왼손잡이다')` | 1
- values | `'서윤은 왼손잡이다'` vs `'서윤은 오른손잡이다'` | about 0.667 (`toBeCloseTo(0.667, 2)`)
- empty | `bigramDice('', 'a')` | 0
- containment | `gramContainment('쇠가 손바닥에 들러붙을 만큼 차가웠다.', '쇠가 손바닥에 달라붙을 만큼 차가웠다.')` | about 0.714 (`toBeCloseTo(0.714, 2)`)
- containment is asymmetric | `gramContainment('가나다','가나다라마')` -> 1; `gramContainment('가나다라마','가나다')` -> about 0.333
- containment empty | `gramContainment('가나', '가나다')` (example has no 3-gram) | 0

sample-copy.test.ts (examples = `['안개가 계단을 반쯤 삼키고 있었다. 세린은 왼손으로 난간을 짚었다. 쇠가 손바닥에 들러붙을 만큼 차가웠다.']`)
- near copy hit | `'비가 그쳤다. 쇠가 손바닥에 달라붙을 만큼 차가웠다. 그녀는 계단을 올랐다.'` | 1 hit, text `'쇠가 손바닥에 달라붙을 만큼 차가웠다.'`, example `'쇠가 손바닥에 들러붙을 만큼 차가웠다.'`, score 0.8, start 8, end 29
- haiku case | `'쇠가 손바닥에 달라붙을 만큼 차가워서'` | 1 hit, score 0.667
- embedded copy (Dice 0.571 misses, containment 0.714 hits) | `'쇠가 손바닥에 달라붙을 만큼 차가웠다는 것을 그녀는 그제야 알았다.'` | 1 hit, score 0.714
- paraphrase not flagged | `'안개가 계단 절반을 가리고 있었다.'` | `[]` (best Dice 0.538, containment 0.417)
- unrelated | `'그는 문고리를 쥐고 오래 서 있었다.'` | `[]`
- short never flagged | draft `'"여기 누구 있어?"'`, examples same string | `[]`
- en exact | examples `['The fog had swallowed half the stairs. Serin braced her left hand on the railing.']`, draft `'Rain fell. The fog had swallowed half the stairs. She waited.'`, lang en | 1 hit, score 1; `'Mist covered most of the steps.'` -> `[]`
- empty examples | `[]` | `[]`
- thresholds are options | the haiku case with `threshold: 0.7, minContainment: 0.6` | `[]`

fact-similarity.test.ts
- identical after spacing and final period | `서윤은 검을 쓴다.` / `서윤은  검을 쓴다` | true
- close rewording | `종루의 종은 밤마다 떨린다.` / `종루의 종은 밤마다 떨린다고 한다.` | true (Dice 0.87)
- rephrase | `서윤은 왼손잡이다` / `서윤은 왼손잡이이다` | true (0.933)
- different fact, same subject | `서윤은 검을 쓴다.` / `서윤은 왼손잡이다.` | false (0.308)
- contradiction by age word | `서윤은 열일곱 살이다.` / `서윤은 열여덟 살이다.` | false (0.625)
- digits differ in near-equal text | `세린은 청해항 고아원에서 자란 16살 소녀다` / `...19살 소녀다` | false (Dice 0.889, blocked by the digit rule); `서윤은 3층에 산다.` / `서윤은 4층에 산다.` | false
- negation | `서윤은 검을 쓴다.` / `서윤은 검을 쓰지 못한다.` | false (0.533)
- short antonym | `서윤은 왼손잡이다` / `서윤은 오른손잡이다` | false (0.667)
- en | `Serin is left handed.` / `Serin is left-handed.` | true (1)
- documented limit, long antonym (Dice 0.828) | `서윤은 청해항 출신이며 왼손잡이다` / `서윤은 청해항 출신이며 오른손잡이다` | true; and `Serin is right-handed and calm.` / `Serin is left-handed and calm.` | true (0.809). Comment on the tests: they lock in a known miss; when antonym handling lands, invert them (expect false) instead of deleting them
- documented limit, number words | `Seoyun is 19.` / `Seoyun is nineteen.` | false (0.583); same comment
- empty and short | `''` / `'서윤'`; `'a'` / `'b'` | false; false

index.test.ts
- barrel runtime exports | `Object.keys(await import('./index')).sort()` | exactly `['foreignScriptRuns','foreignScriptSpans','isNearDuplicateFact','repeatedWords','sampleCopies']` (so `normalizeForCompare`, `bigramDice`, `gramContainment` are not exported)
- types | `expectTypeOf<ForeignSpan['script']>()` equals the six-member union; `Lang` is `'ko' | 'en'`

## 7. Acceptance metrics

| metric | current | target |
|---|---|---|
| public functions exported from `@/ai/guards` | none | exactly 5: `foreignScriptSpans`, `foreignScriptRuns`, `repeatedWords`, `sampleCopies`, `isNearDuplicateFact` (+ 5 types); checked by `index.test.ts` |
| foreign-script regexes outside the guard (src + eval) | 3 (eval) | 0 after this track lands; `eval/novel/metrics.ts` imports the guard |
| `eval/novel/metrics.test.ts` | 121-line file passes | passes unchanged |
| `chapterMetrics(...).foreignRuns` identical before and after step 7 | not pinned by any test | `eval/novel/metrics.foreign.test.ts` golden cases written against the old code pass after the change |
| all eval tests (`pnpm vitest run eval --maxWorkers=2`) | pass | pass |
| guard unit tests (`pnpm vitest run src/ai/guards`) | none | all pass, every case in section 6 |
| `sample-copy.test.ts` haiku case (`쇠가 … 차가워서`) | no detector | 1 hit, score 0.667 (the eval-level `sampleCopyHits` metric belongs to E2's acceptance table, not this track) |
| Han `嬷嬷` span with offsets | strings only | `{start,end,script:'han'}` |
| non-test guard files importing anything but `./*`, `@/lib/korean/sentences`, `@/lib/korean/josa` | n/a | 0; see the grep in section 11 (eslint only restricts `@/test/*`, it cannot show this) |

## 8. Dependencies on other tracks

- GUARDS depends on none. Merge it first (wave 1). Do not change signatures after merge; add optional params only.
- Ownership (spec section 6, decided): one name, one owner. GUARDS owns the five functions above and nobody else defines them.
  - C imports `foreignScriptSpans`/`foreignScriptRuns` from `@/ai/guards` (two-argument form) and creates no foreign-script module of its own. C does not edit `eval/novel/metrics.ts`; this track's step 7 is the only edit of those lines.
  - E2 builds `src/lib/korean/style-copy.ts` as a thin wrapper over `sampleCopies` and `repeatedWords`.
  - G1 imports `isNearDuplicateFact` from `@/ai/guards` and creates no `fact-similarity.ts`; it keeps its own `evidence-quote.ts` and `undecided-answer.ts` (outside this library's scope).
  - E1 (paragraph and sentence counts), A (length), J (all-occurrence quote search) do not use GUARDS.
  - A, B, D, E1, G2, H, I, J, HX* do not import `@/ai/guards`.
- Conflict risk: E1, E2, I and J also touch `eval/novel/metrics.ts` (new fields, or re-exports of `metrics-interview.ts`, `metrics-proofread.ts`); step 7 edits only the regex constants and the `foreignRuns` lines.

## 9. Risks

- Thresholds are uncalibrated: sample-copy Dice 0.6 and containment 0.5 (haiku case 0.667/0.571, paraphrase 0.538/0.417, so the margin is thin), near-duplicate Dice 0.8, repeated-word minCount 8. Expose them as options (the near-duplicate constant is exported), never hardcode in callers. Texts of the six runs are gitignored; calibration needs the author's machine.
- Dice flags antonym facts inside long sentences; the guard has no conflict list on purpose (decision in spec section 6, no word lists). The digit rule is the only conflict check. G1 accepts this as a known miss.
- `splitSentences` is unchanged and its tests (`src/lib/korean/sentences.test.ts`) plus the fakes in `src/test/ai-fakes` depend on it. Never edit `src/lib/korean/*` in this track.
- Hangul in English text is flagged unconditionally (eval behaviour). `Chapter 1 (새 회차)` label leaks are a harness bug (HX2), not a guard concern.
- Offsets are UTF-16 (JS string indices), not code points; only `per1000` divides by the code point count.
- Guards must not import `@/server`, `@/db`, `@/test`, `eval/*`, or any `@/lib` module other than the two named above.

## 10. Open questions (use the stated default; do not block)

1. Calibrate thresholds on the 6 saved runs later (author machine); defaults above are placeholders.
2. `repeatedWords` in ko counts verb and adjective forms too (no ending filter). Default: leave it; E2's wrapper may drop result words by its own ending rule or exempt list through `allow`.
3. Should near-duplicate normalize numbers (`19`/`nineteen`/`열아홉`) or handle antonyms? Default: no, documented limit with inverted-later tests.

## 11. Definition of done

Run in the worktree, all must pass:
- `pnpm vitest run src/ai/guards eval/novel/metrics.test.ts eval/novel/metrics.foreign.test.ts src/lib/korean --maxWorkers=2`
- `pnpm vitest run eval --maxWorkers=2` (other eval tests import `metrics.ts`: cli, run, steps, author-io)
- `! grep -rnE "from '(@/|eval/)" src/ai/guards --include='*.ts' --exclude='*.test.ts' | grep -vE "@/lib/korean/(sentences|josa)'"` (no output; this grep, not eslint, is the import check)
- `pnpm exec tsc --noEmit` (no errors in `src/ai/guards/*` or `eval/novel/metrics.ts`)
- `pnpm eslint src/ai/guards eval/novel/metrics.ts eval/novel/metrics.foreign.test.ts`
- `pnpm format` leaves no diff in the new files
- `git diff --stat main` shows only `src/ai/guards/*` (new), `eval/novel/metrics.foreign.test.ts` (new) and `eval/novel/metrics.ts`; no `package.json` or lockfile change.

# Brief: track GUARDS (shared guard library, `src/ai/guards`)

Branch: cloud. Implementer: haiku, TDD, isolated worktree. All paths are relative to the repo root.
Foundation track. Intended consumers are C, E2 and G1 (see section 8: today their briefs build parallel copies, the integrator must switch them to import from `@/ai/guards`). Do NOT wire the guards into services, tasks, prompts or UI. Pure functions only.

## 1. Goal

Create `src/ai/guards/` with pure, unit-tested functions: character counts and a length check, Korean/English sentence and paragraph splitting, foreign-script span finder with offsets, repeated-word counter, sample-copy detector, exact-quote verifier, near-duplicate fact finder. Reuse `src/lib/korean/*`. Then make `eval/novel/metrics.ts` use the guard for foreign runs, with identical output (pinned by a new golden test, step 10).
No DB, no AI client, no Actor, no AppError, no Next.js API, no new packages. Return data; callers pick the Korean message.

## 2. Evidence (numbers; source docs/eval/novel/2026-10-18/summary.md and the six run reviews in the same folder)

- Length (T3, chars with spaces): ko qwen 5,450 / haiku 3,505 (70.1%) / luna 3,473 (69.5%); en qwen 15,069 / haiku 9,096 (75.2%) / luna 9,888 (81.7%).
- Foreign script: qwen ko final text kept `嬷嬷`; all 3 draft attempts had Han. Eval-only detection exists, no offsets.
- Paragraph rule "문단은 세 문장을 넘기지 않는다": violations qwen ko 33/141, qwen en 34, haiku en 14/72+, haiku ko 5, luna en 1/146, luna ko 0.
- Repeated words: qwen ko `오른손`/`왼손` 37 times; qwen en `did not` 27 (source: docs/eval/novel/2026-10-18/summary.md line 238).
- Sample copy: 5 of 6 runs reused style-card example sentences. Haiku ko `쇠가 손바닥에 달라붙을 만큼 차가워서` vs card `쇠가 손바닥에 들러붙을 만큼 차가웠다.` (exact match misses it).
- Near-duplicate facts re-proposed: haiku ko 12/72 (about 17%), luna en about 9/58, luna ko about 6, qwen en 4 fact pairs (plus 4 relation pairs, 8 total).
- Evidence quotes: haiku ko 60/61 exact in source; qwen ko `철문로` for `철문으로` was approved.
- Repeated quote: qwen ko `4층이상은` second occurrence stayed unfixed (`locateQuote` returns the first match when no hint).

## 3. Files

Verified to exist (read-only unless listed under write):
- write: `eval/novel/metrics.ts` (step 10 only: replace the 3 regex constants and the `foreignRuns` computation)
- create: `eval/novel/metrics.foreign.test.ts` (golden test for `chapterMetrics(...).foreignRuns`, step 10)
- read-only: `src/lib/korean/chars.ts` (`countChars`), `src/lib/korean/sentences.ts` (`splitSentences`, `sentenceAt`, `sentenceIn`, `locateQuote`, type `Sentence`), `src/lib/korean/josa.ts` (`stripJosa`), `src/lib/chapter-length.ts` (`lengthShortfall`, UI only; intentionally NOT changed and NOT replaced by `checkLength` in this track: it has no English 0.8 floor and no 1.3 max, so the UI and the guard differ by design; do not "unify" them), `src/lib/proposal-payloads.ts` (`normalizeProposalText`), `eval/novel/metrics.test.ts` (121 lines, must pass unchanged), `eval/novel/author-io.ts` (MetricsSchema; unchanged because `foreignRuns` stays `string[]`), `vitest.config.ts`, `docs/eval/novel/follow-up-ai-improvement.md` (items A, C, E, G, J).

Create (do not exist yet; `src/ai/guards` directory does not exist):
- `src/ai/guards/index.ts` (barrel), `counts.ts`, `sentences.ts`, `scripts.ts`, `repeats.ts`, `similarity.ts`, `sample-copy.ts`, `quotes.ts`, `near-duplicate.ts`
- one colocated test per module: `counts.test.ts`, `sentences.test.ts`, `scripts.test.ts`, `repeats.test.ts`, `similarity.test.ts`, `sample-copy.test.ts`, `quotes.test.ts`, `near-duplicate.test.ts`

What already exists (reuse, do not copy):
- Counts: `countChars(text)` returns `{withSpaces, withoutSpaces}`, code points, withSpaces excludes only `\r` `\n`. Used by `src/server/chapters.ts` and the editor.
- Sentences: `splitSentences(text)` returns `{text,start,end}[]` (UTF-16 offsets, trimmed), splits at `.!?…` plus closers and at line breaks.
- Quote: `locateQuote(text, quote, hint?)` exact (nearest to hint), then whitespace-collapsed; returns offsets or null.
- Particles: `stripJosa(word)` (`오른손으로` -> `오른손`, `종루에서` -> `종루`, verified).
- Not usable for similarity: `src/lib/diff.ts` (history diff), `src/lib/search.ts` (card search). `normalizeProposalText` is an exact-dedupe key only.

Missing (written here): paragraph splitter and sentences-per-paragraph, English abbreviation/decimal handling, script spans with offsets, repeated-word counter, sample-copy detector, similarity function, near-duplicate finder, all-occurrences quote finder.

## 4. Design (do the steps in order; red test first for each)

All offsets are UTF-16 indices into the given string (same as `splitSentences`). Export every public function from `index.ts`.

1. `counts.ts`: `charCounts` = `countChars` re-exported under the new name (no re-implementation). Add `checkLength(text, {targetChars, lang})`: count = `countChars(text.trim()).withSpaces` (same as eval `chapterMetrics`); `min = lang==='ko' ? target : target*EN_MIN_RATIO`; `max = target*MAX_RATIO`; return `{chars, min, max, ok, short, over}` where `short = max(0, ceil(min-chars))`, `over = max(0, chars-floor(max))` (equivalent, for integer chars, to eval's `chars <= 1.3*target` check), and `ok = (short === 0 && over === 0)`. Constants `EN_MIN_RATIO = 0.8`, `MAX_RATIO = 1.3` (identical to `eval/novel/metrics.ts`).
2. `sentences.ts` `splitSentencesFor(text, lang)`: start from `splitSentences(text)`, then merge each segment into the previous one when (a) next.start === prev.end (no space), prev ends with a single `.`, and the char before that `.` is a digit and next starts with a digit (decimal `3.5`), any lang; (b) lang `en` only: next.start === prev.end, prev ends with a single `.`, and next starts with a letter or digit (`e.g.`, `U.S.A`; `He ran!Then` is NOT merged); (c) lang `en` only: prev ends with `.` and its last word (letters and dots, lowercased, without the final dot) is in `ABBREVIATIONS = ['mr','mrs','ms','dr','prof','sr','jr','st','mt','vs','e.g','i.e']`. Merged text is `text.slice(prev.start, next.end)`. Merge repeatedly (loop) so `e.g. a dog` becomes one sentence.
3. `sentences.ts` `splitParagraphs(text, lang)`: a paragraph is one non-empty line (Korean web novels use single newlines; matches eval). Skip blank lines and scene-separator lines (regex `/^(?:[-*_=~#·•]\s*){3,}$/`). Each result `{text,start,end,sentences}` with trimmed offsets, `sentences = splitSentencesFor(text, lang).length`. Add `paragraphsOver(text, lang, maxSentences = 3)` returning the paragraphs whose `sentences > maxSentences`. The default 3 is only a default; callers pass the number read from the style card.
4. `similarity.ts`: `normalizeForCompare(s)` = lowercase, remove all `[\s\p{P}\p{S}]`. `bigramDice(a, b)` on normalized strings: character (code point) bigram multisets, `2*shared/(totalA+totalB)`, 0 when both have no bigrams. Used by steps 7 and 9.
5. `scripts.ts` `foreignScriptSpans(text, lang, opts?: {allow?: string[]})`: use the same regexes as `eval/novel/metrics.ts`: `OTHER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\uFFFD]+/gu` (write U+FFFD as the escape `\uFFFD` exactly as `eval/novel/metrics.ts` line 37 does; never paste the literal replacement character into the regex, it is invisible and easy to drop), `LATIN = /[A-Za-z]{4,}/g` (only when lang `ko`), `HANGUL = /[가-힣]+/g` (only when lang `en`). Use `matchAll` to get offsets. `script` of an OTHER run is decided by its first char: Han -> `han`, Hiragana/Katakana -> `kana`, Cyrillic -> `cyrillic`, U+FFFD -> `replacement`. Result sorted by `start`. Spans whose lowercased text is in `allow` are dropped. Add `foreignScriptRuns(text, lang)` returning strings in the eval order: Latin (ko) or Hangul (en) runs first, then OTHER runs, each in text order. Add `foreignSentences(text, lang)`: for each span, the sentence containing it (use `sentenceIn` from `@/lib/korean/sentences` over `splitSentencesFor` output), de-duplicated, so a caller can rewrite only that sentence.
6. `repeats.ts` `repeatedWords(text, opts?)`: pipeline, in this order: (1) tokenize with `text.match(/[\p{L}\p{N}]+/gu)` keeping offsets, lowercase, and apply `stripJosa` to all-Hangul tokens; this is the token list. (2) `ngram: 1`: filter the token list by `minLength` (default ko 2, en 4, lang default `ko`), by `allow` words, and, for lang `en`, by `EN_STOPWORDS` (the, and, that, with, was, were, had, has, have, her, his, she, they, them, this, there, from, for, not, but, you, your, said, what, when, then, into, been). (2') `ngram: 2`: pair ADJACENT tokens of the unfiltered step-1 list (no minLength or stopword filter, so a short or stop word still sits in a pair), join with one space, then drop pairs whose joined text is in `allow`. Pairs are never formed across a dropped token because nothing is dropped before pairing. Count; keep `count >= minCount` (default 6). Return `{word, count, per1000, positions}[]` sorted by count desc then word asc; `per1000 = count*1000/[...text].length` rounded to 2 decimals (code points: the one intentional exception to the UTF-16 rule). `positions` = the UTF-16 start offset in the original text of every counted token (for `ngram: 2`, the offset of the first token of the pair), in text order. Defaults are uncalibrated (see section 9).
7. `sample-copy.ts` `sampleCopies(text, examples, opts?)`: split every example string and the draft with `splitSentencesFor`; example sentences are de-duplicated. For each draft sentence whose `normalizeForCompare` length >= `minChars` (default ko 10, en 24), take the best-scoring example sentence (also length >= `minChars`) by `bigramDice`; if `score >= threshold` (default 0.6) return `{start,end,text,example,score}` (start/end = the draft sentence). Score is rounded to 3 decimals. Never flag sentences below `minChars`.
8. `quotes.ts`: `verifyQuote(source, quote, opts?: {hint?: number, ignoreCase?: boolean})` returns `{start,end} | null` through `locateQuote`; with `ignoreCase` lowercase both sides, but only if the lowercased source has the same length (otherwise fall back to case-sensitive). `quoteInSource(source, quote)` returns boolean. `findQuoteOccurrences(source, quote)` returns every exact occurrence `{start,end}[]` (overlap allowed, loop `indexOf(quote, idx+1)`); if none, return the single `locateQuote` whitespace-collapsed result as a one-item list, else `[]`. Empty quote -> null / false / [].
9. `near-duplicate.ts` `findNearDuplicateFacts(candidates, existing = [], opts?)`: for candidate i, compare against every `existing` string and every earlier candidate (j < i). Skip strings whose normalized length < `minChars` (default 4). Score = `bigramDice`. A pair counts when `score >= threshold` (default 0.75) and `!hasConflict(a, b)`. Keep the best-scoring match per candidate; return `{index, of: {source: 'existing'|'candidate', index}, score}[]` in candidate order. `hasConflict(a,b)`: tokens = `/[\p{L}\p{N}]+/gu` lowercased, `stripJosa` on all-Hangul tokens; `uniqA` = tokens of a not in b, `uniqB` likewise. Conflict if both unique lists contain a token with a digit, or if a `CONTRAST_PAIRS` pair hits: the pair `[x, y]` hits when the joined unique text of one side contains `x` as a substring and the joined unique text of the other side contains `y` as a substring (substring, not token; either direction). Pairs: `['왼','오른']`, `['있','없']`, `['살아','죽']`, `['left','right']`, `['alive','dead']`, `['male','female']`. Known false positives of substring matching (document in a comment): `있` inside `있었다`, `살아` inside `살아남은`. Export `hasConflict`. Known limit (document in a comment): `서윤의 나이는 열아홉이다` vs `서윤은 열아홉 살이다` (Dice 0.444) and `19` vs `nineteen` (0.583) are NOT detected; no number or synonym normalization.
10. `eval/novel/metrics.ts`. FIRST, before touching it, create `eval/novel/metrics.foreign.test.ts` with golden cases and run it green against the current code: record the current `chapterMetrics(text, lang, 1000).foreignRuns` for fixtures covering (a) ko with mixed Latin and Han (`['Hello'...]` before Han runs), (b) en with Hangul, (c) kana, (d) Cyrillic, (e) U+FFFD, (f) several runs of each kind in one text, (g) clean ko and clean en (`[]`). Write the expected arrays by hand from the recorded output. THEN delete `OTHER_SCRIPT_RUN`, `LATIN_RUN`, `HANGUL_RUN` and set `foreignRuns = foreignScriptRuns(trimmed, lang)` (import from `@/ai/guards/scripts`); the golden test and the unchanged `eval/novel/metrics.test.ts` must both stay green. Do nothing else in `metrics.ts` (E1 and E2 may add fields there; keep the diff tiny). Track C step 2 edits the same lines: the integrator lands exactly one of the two (GUARDS first), the other rebases onto it and drops its own edit.
11. `index.ts`: `export *` from each module. Types: `Span`, `ForeignSpan`, `Paragraph`, `RepeatedWord`, `SampleCopyHit`, `NearDuplicate`, `LengthCheck`.

## 5. Interface (exact signatures)

Defaults, stated once: every optional `lang` (`repeatedWords`, `sampleCopies`) defaults to `'ko'`. `minChars` and `threshold` defaults are the ones given in section 4 (`sampleCopies` minChars: ko 10, en 24; `findNearDuplicateFacts` minChars 4 for any language, it takes no `lang`).

```ts
export type Lang = 'ko' | 'en'
export type Span = { start: number; end: number }
// counts.ts
export const EN_MIN_RATIO = 0.8
export const MAX_RATIO = 1.3
export function charCounts(text: string): { withSpaces: number; withoutSpaces: number }
export type LengthCheck = { chars: number; min: number; max: number; ok: boolean; short: number; over: number }
export function checkLength(text: string, opts: { targetChars: number; lang: Lang }): LengthCheck
// sentences.ts
export type Paragraph = { text: string; start: number; end: number; sentences: number }
export function splitSentencesFor(text: string, lang: Lang): Sentence[] // Sentence from '@/lib/korean/sentences'
export function splitParagraphs(text: string, lang: Lang): Paragraph[]
export function paragraphsOver(text: string, lang: Lang, maxSentences?: number): Paragraph[]
// scripts.ts
export type ForeignSpan = Span & { text: string; script: 'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul' }
export function foreignScriptSpans(text: string, lang: Lang, opts?: { allow?: string[] }): ForeignSpan[]
export function foreignScriptRuns(text: string, lang: Lang): string[]
export function foreignSentences(text: string, lang: Lang): Sentence[]
// repeats.ts
export type RepeatedWord = { word: string; count: number; per1000: number; positions: number[] }
export function repeatedWords(text: string, opts?: { lang?: Lang; minCount?: number; minLength?: number; ngram?: 1 | 2; allow?: string[] }): RepeatedWord[]
// similarity.ts
export function normalizeForCompare(s: string): string
export function bigramDice(a: string, b: string): number
// sample-copy.ts
export type SampleCopyHit = Span & { text: string; example: string; score: number }
export function sampleCopies(text: string, examples: string[], opts?: { lang?: Lang; threshold?: number; minChars?: number }): SampleCopyHit[]
// quotes.ts
export function verifyQuote(source: string, quote: string, opts?: { hint?: number; ignoreCase?: boolean }): Span | null
export function quoteInSource(source: string, quote: string): boolean
export function findQuoteOccurrences(source: string, quote: string): Span[]
// near-duplicate.ts
export type NearDuplicate = { index: number; of: { source: 'existing' | 'candidate'; index: number }; score: number }
export function findNearDuplicateFacts(candidates: string[], existing?: string[], opts?: { threshold?: number; minChars?: number }): NearDuplicate[]
export function hasConflict(a: string, b: string): boolean
```

## 6. Tests (TDD; name | input | expected). Values below were computed with a prototype of the same algorithm.

counts.test.ts
- withSpaces excludes line breaks | `'안녕 하세요\n반가워'` | `{withSpaces: 9, withoutSpaces: 8}`
- empty and emoji | `''`, `'😀a'` | `{0,0}`, `{2,2}`
- ko length ok at target | 100 chars `'가'.repeat(100)`, target 100 ko | `ok true`, `short 0`
- ko one under | 99 chars target 100 ko | `ok false`, `short 1`
- en floor 0.8 | 80 chars target 100 en | `ok true`; 79 chars -> `ok false`, `short 1`
- over 1.3 | 131 chars target 100 | `ok false`, `over 1`
- trims before counting | `'  ' + '가'.repeat(100) + '\n'` target 100 ko | `chars 100`

sentences.test.ts
- en abbreviation | `'Mr. Smith left. He sat.'`, en | 2 sentences: `'Mr. Smith left.'`, `'He sat.'`
- e.g. | `'Take one, e.g. a dog. Done.'`, en | 2 sentences
- decimal in ko | `'길이는 3.5미터였다. 끝.'`, ko | `['길이는 3.5미터였다.', '끝.']`
- ko unchanged vs base | `'그가 말했다. "정말?" 그녀는 웃었다…\n다음 줄'`, ko | same texts and starts as `splitSentences`
- paragraphs | `'첫 문장. 둘째 문장.\n\n다음 문단'` | `[{start 0, end 12, sentences 2}, {start 14, end 19, sentences 1}]`
- separators and blanks skipped | `'가.\n---\n   \n* * *\n나.'` | 2 paragraphs
- over limit | `'가. 나. 다. 라.\n마. 바.'`, ko, max 3 | only the first paragraph (sentences 4)
- custom limit | same text, max 1 | both paragraphs

scripts.test.ts
- Han span with offsets | `'그는 以上是 말했다'`, ko | `[{text:'以上是', script:'han', start:3, end:6}]`
- kana, Cyrillic, replacement | `'ひらがな 카타カナ Привет 깨짐�'`, ko | scripts `kana`, `kana`, `cyrillic`, `replacement`, in text order
- ko Latin threshold | `'그는 OK 말하고 Hello 했다'`, ko | only `Hello` (`latin`)
- en Hangul | `'She said 안녕 and left.'`, en | `[{text:'안녕', script:'hangul'}]`; the same text as ko -> two latin spans, texts `['said','left']` (4+ letter Latin runs; `She` and `and` are too short) and no Hangul span
- en/ko clean pair for the symmetric case | `'그는 문을 열었다.'` as ko -> `[]`; `'He opened the door.'` as en -> `[]`
- clean ko, clean en | plain text | `[]`
- allow | `'그는 Hello 했다'`, ko, allow `['hello']` | `[]`
- runs order equals eval | `'그는 嬷嬷에게 말했다. ひらがな 카타カナ Привет 깨짐� 끝.'`, ko | `['嬷嬷','ひらがな','カナ','Привет','�']`
- foreignSentences | `'안녕했다. 그는 以上是 말했다. 끝.'`, ko | one sentence `'그는 以上是 말했다.'`

repeats.test.ts
- josa stripped | `'오른손으로 잡고 오른손을 뻗었다 오른손'`, ko, minCount 3 | `[{word:'오른손', count:3}]` (positions length 3)
- below minCount | same text, default minCount 6 | `[]`
- bigram | `'He did not go. She did not stop. We did not care.'`, en, ngram 2, minCount 3 | `[{word:'did not', count:3}]`
- en stopwords and short words ignored | `'the the the the the the cat'`, en, minCount 3 | `[]`
- allow | the 오른손 text with allow `['오른손']`, minCount 3 | `[]`
- bigram pairs are adjacent in the unfiltered list | `'did not go. did not stop. did not care. did not'`, en, ngram 2, minCount 4 | `[{word:'did not', count:4}]`, and no `'not go'`-style pair is skipped over (`'not go'` has count 1, absent); also `'red the fox. red the fox. red the fox.'`, en, ngram 2, minCount 3 | contains `'red the'` and `'the fox'` (stopword `the` is not dropped before pairing)
- per1000 | 3 hits in a 60-char text | `per1000 = 50`

similarity.test.ts
- normalize | `'Hello, World!'` | `'helloworld'`
- identical | `bigramDice('서윤은 왼손잡이다','서윤은 왼손잡이다')` | 1
- values | `'서윤은 왼손잡이다'` vs `'서윤은 오른손잡이다'` | about 0.667 (`toBeCloseTo(0.667, 2)`)
- empty | `bigramDice('', 'a')` | 0

sample-copy.test.ts (examples = `['안개가 계단을 반쯤 삼키고 있었다. 세린은 왼손으로 난간을 짚었다. 쇠가 손바닥에 들러붙을 만큼 차가웠다.']`)
- near copy hit | `'비가 그쳤다. 쇠가 손바닥에 달라붙을 만큼 차가웠다. 그녀는 계단을 올랐다.'` | 1 hit, text `'쇠가 손바닥에 달라붙을 만큼 차가웠다.'`, score 0.8, start 8, end 29
- haiku case | `'쇠가 손바닥에 달라붙을 만큼 차가워서'` | 1 hit, score 0.667
- paraphrase not flagged | `'안개가 계단 절반을 가리고 있었다.'` | `[]` (best 0.538)
- unrelated | `'그는 문고리를 쥐고 오래 서 있었다.'` | `[]`
- short never flagged | draft `'"여기 누구 있어?"'`, examples same string | `[]`
- en exact | examples `['The fog had swallowed half the stairs. Serin braced her left hand on the railing.']`, draft `'Rain fell. The fog had swallowed half the stairs. She waited.'`, lang en | 1 hit, score 1; `'Mist covered most of the steps.'` -> `[]`
- empty examples | `[]` | `[]`

quotes.test.ts
- exact | source `'철수는 철문으로 갔다.'`, quote `'철문으로'` | `{start:4,end:8}`
- paraphrased quote | quote `'철문로'` | null and `quoteInSource` false
- whitespace collapsed | source `'철수는   떠났다'`, quote `'철수는 떠났다'` | `{start:0,end:9}`
- hint nearest | source `'가나 가나 가나'`, quote `'가나'`, hint 7 | `{start:6,end:8}`
- ignoreCase | source `'Anyone up here?'`, quote `'anyone UP'` | `{start:0,end:9}`; without the option -> null
- all occurrences | source `'4층이상은 안 되고 4층이상은 닫는다'`, quote `'4층이상은'` | 2 spans
- empty quote | `''` | null, false, `[]`

near-duplicate.test.ts
- rephrase of existing | candidates `['서윤은 왼손잡이다']`, existing `['서윤은 왼손잡이이다']` | `[{index:0, of:{source:'existing', index:0}, score≈0.933}]`
- opposite fact | `['서윤은 왼손잡이다']` vs existing `['서윤은 오른손잡이다']` | `[]`
- long opposite (Dice 0.828, conflict) | `'서윤은 청해항 출신이며 왼손잡이다'` vs `'서윤은 청해항 출신이며 오른손잡이다'` | `[]`
- digit conflict (Dice 0.889) | `'세린은 청해항 고아원에서 자란 16살 소녀다'` vs `'...19살 소녀다'` | `[]`
- within candidates | `['세린은 열여섯 살이고 청해항 고아원에서 자랐다.', '세린은 청해항 고아원에서 자란 열여섯 살이다.']`, threshold 0.7 | `[{index:1, of:{source:'candidate', index:0}}]`
- en | `['Serin is left handed.']` vs existing `['Serin is left-handed.']` | hit, score 1; `'Serin is right-handed and calm.'` vs `'Serin is left-handed and calm.'` -> `[]`
- documented limit: 19 vs nineteen is not detected | `'Seoyun is 19.'` vs `'Seoyun is nineteen.'` | `[]` (Dice 0.583). Put a comment on the test: this locks in a known miss; when number normalization lands, invert the test (expect a hit) instead of deleting it
- short skipped | `['', 'a']` | `[]`
- hasConflict direct | `hasConflict('나이는 16살','나이는 19살')` true; `hasConflict('왼손잡이다','왼손잡이이다')` false

## 7. Acceptance metrics

| metric | current | target |
|---|---|---|
| guard functions in `src/ai/guards` | 0 | 17 exported functions: the 14 listed in section 5 (`charCounts`, `checkLength`, `splitSentencesFor`, `splitParagraphs`, `paragraphsOver`, `foreignScriptSpans`, `foreignScriptRuns`, `foreignSentences`, `repeatedWords`, `sampleCopies`, `verifyQuote`, `quoteInSource`, `findQuoteOccurrences`, `findNearDuplicateFacts`) plus `hasConflict`, `bigramDice`, `normalizeForCompare` |
| foreign-script regexes outside the guard (src + eval) | 3 (eval) | 0; `eval/novel/metrics.ts` imports the guard |
| `eval/novel/metrics.test.ts` | 121-line file passes | passes unchanged |
| `chapterMetrics(...).foreignRuns` identical before and after step 10 | not pinned by any test | `eval/novel/metrics.foreign.test.ts` golden cases written against the old code pass after the change |
| all eval tests (`pnpm vitest run eval --maxWorkers=2`) | pass | pass |
| guard unit tests (`pnpm vitest run src/ai/guards`) | none | all pass, every case in section 6 |
| `sample-copy.test.ts` haiku case (`쇠가 … 차가워서`) | no detector | unit test returns 1 hit, score 0.667 (the eval-level `sampleCopyHits` metric belongs to E2's acceptance table, not this track) |
| Han `嬷嬷` span with offsets | strings only | `{start,end,script:'han'}` |
| guard files importing `eval/`, `@/test`, `@/server`, `@/db` | n/a | 0; checked by `! grep -rnE "from '(eval/|@/test|@/server|@/db)" src/ai/guards` (eslint only restricts `@/test/*`, it cannot show this) |

## 8. Dependencies on other tracks

- GUARDS depends on none. Merge it first. Do not change signatures after merge; add optional params only.
- Current state (verified in the other briefs): NO other brief imports from `@/ai/guards`. They build parallel copies of the same detectors with different thresholds:
  - C creates `src/lib/korean/foreign-script.ts` (`findForeignScriptSpans(text)`, one-argument `foreignScriptRuns(text)`) and its step 2 deletes `OTHER_SCRIPT_RUN` in `eval/novel/metrics.ts`, the same edit as step 10 here.
  - E2 creates `findSampleCopies` (3-gram containment, 0.5) and a repeated-word counter in `src/lib/korean/style-copy.ts`, and says it does not wait for GUARDS.
  - G1 creates `src/ai/guards/fact-similarity.ts` (`isNearDuplicateFact`) and `evidence-quote.ts` (`verifyEvidenceQuote`), which overlap `findNearDuplicateFacts` and `verifyQuote`, and imports none of them.
  - A, E1, G2, H, J do not use GUARDS (E1 uses `prompt-utils`, H creates `src/ai/numeric-facts.ts`, G2 and J build their own helpers). Their briefs are unaffected.
- Required integrator decision BEFORE GUARDS merges (this brief cannot make it; it only edits GUARDS.md): assign each detector to exactly one owner. Default owner is GUARDS for `foreignScriptSpans`/`foreignScriptRuns(text, lang)`, `sampleCopies`, `repeatedWords`, `findNearDuplicateFacts`, `verifyQuote`, `findQuoteOccurrences`. Then C, E2 and G1 are rewritten to import from `@/ai/guards` and drop their duplicates (C drops `src/lib/korean/foreign-script.ts` and uses the two-argument guard; E2 keeps only its `DraftFlag` wrapper around `sampleCopies`/`repeatedWords`; G1 keeps `undecided-answer.ts` and thin wrappers over the guards). The alternative is to remove those functions from this brief. Do not merge both copies.
- Metrics edit: GUARDS step 10 and C step 2 are mutually exclusive. Exactly one lands (GUARDS first by default); the other rebases onto it and removes its own edit.
- Conflict risk: E1/E2 may also edit `eval/novel/metrics.ts` and `eval/novel/author-io.ts`; step 10 touches only the regex constants and the `foreignRuns` lines.

## 9. Risks

- Thresholds are uncalibrated: sample-copy 0.6 (haiku case 0.667, paraphrase 0.538, so the margin is thin), near-duplicate 0.75, repeated-word minCount 6. Expose them as options, never hardcode in callers. Texts of the six runs are gitignored; calibration needs the author's machine.
- Dice flags antonym facts; `hasConflict` covers only digits and the small CONTRAST_PAIRS list. Do not extend it with long word lists.
- `splitSentences` is unchanged and its tests (`src/lib/korean/sentences.test.ts`) plus the fakes in `src/test/ai-fakes` depend on it. Never edit `src/lib/korean/*` in this track.
- Counting: `checkLength` trims, the editor does not; differences are only leading/trailing whitespace.
- English floor 0.8 is copied from eval; it is an open question only in this brief (section 10, question 1).
- Hangul in English text is flagged unconditionally (eval behaviour). `Chapter 1 (새 회차)` label leaks are a harness bug (HX2), not a guard concern.
- Offsets are UTF-16 (JS string indices), not code points; do not mix with `countChars`.
- Guards must not import `@/server`, `@/db`, `@/test`, `eval/*`.

## 10. Open questions (use the stated default; do not block)

1. English minimum ratio: keep 0.8 and max 1.3 (default). Orchestrator may change `EN_MIN_RATIO` later.
2. Paragraph = one non-empty line; separators `---`, `***`, `* * *` excluded (default). Eval's own paragraph count keeps counting all non-empty lines.
3. Should `normalizeQuestion` (`src/server/interview.ts`) move into the library? Default: no, leave it.
4. Should near-duplicate normalize numbers (`19`/`nineteen`/`열아홉`)? Default: no, documented limit.
5. Calibrate thresholds on the 6 saved runs later (author machine); defaults above are placeholders.

## 11. Definition of done

Run in the worktree, all must pass:
- `pnpm vitest run src/ai/guards eval/novel/metrics.test.ts eval/novel/metrics.foreign.test.ts src/lib/korean --maxWorkers=2`
- `pnpm vitest run eval --maxWorkers=2` (other eval tests import `metrics.ts`: cli, run, steps, author-io)
- `! grep -rnE "from '(eval/|@/test|@/server|@/db)" src/ai/guards` (no output; this grep, not eslint, is the import check)
- `pnpm exec tsc --noEmit` (no errors in `src/ai/guards/*` or `eval/novel/metrics.ts`)
- `pnpm eslint src/ai/guards eval/novel/metrics.ts`
- `pnpm format` leaves no diff in the new files
- `git diff --stat main` shows only `src/ai/guards/*` (new), `eval/novel/metrics.foreign.test.ts` (new) and `eval/novel/metrics.ts`; no `package.json` or lockfile change.

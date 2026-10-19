# Brief H: continuity check context and rules (cloud branch)

Repo: /home/xogud/documents/github/DaeumHwa. Work in your own worktree. TDD: write the failing test first, then the code. All paths below are repo-relative and were checked against the code on 2026-10-19. User-facing copy is Korean; identifiers and comments are English. No package changes.

## Goal
Make the continuity check (`runChapterCheck` -> `continuityCheckTask`) see every wiki card whose name occurs in the manuscript, stop it from reporting "not mentioned" as a contradiction, catch explicit age mismatches in code, and make recall on planted errors measurable with `pnpm eval:continuity`.

## Evidence (numbers)
- Luna ko: wiki block had 6 of 10 cards, the 잿빛 종루 card was missing (docs/eval/novel/2026-10-18/luna-6-ko.md:151). Luna en: 4 entries (luna-6-en.md:134). Other runs: no card count recorded.
- Cloud continuity runs (haiku ko/en, luna ko/en): 0 findings each, so recall is unmeasured (summary.md:112-117). qwen ko: 1 finding, 1 false positive: it flagged the 종루 location as a contradiction for a missing mention (author label "언급이 빠진 것을 모순으로 본 헛지적", qwen3.8-27b-ko.md:275; the literal wording "언급이 없다" is only in the proposed rules at :282). It missed the age conflict 도윤서 `스물여덟쯤`(113행) vs F8 `스물일곱 살` (qwen3.8-27b-ko.md:278).
- Cause 1 (verified in code): `buildContextPack` selects cards only through `findMentions` (src/ai/context.ts:140-149). `findMentions` needs the name or an alias followed by a josa run or nothing (src/lib/korean/mentions.ts:41-42), so "종루지기" never matches the alias "종루". Names under 2 chars are skipped (:20).
- Cause 2 (verified): over the 12,000-char budget (context.ts:64) the loop pops relations, threads, summaries, then entries from the END, so the least-mentioned card (a place or item named once) goes first (context.ts:285-300, mentions.ts:57 sorts by count desc).
- Which cause hit Luna is NOT verifiable (run data is not in the repo). Fix both.
- Existing fixture: eval/fixtures/continuity has 11 expected errors in ch 3-10 and 1 notDefect (ch7 "세린은 17살이 된 뒤로"); it already contains the 25살 error (ch10: "옆에서 25살의 도윤서는 말없이 고개를 끄덕였다.", wiki "도윤서의 나이는 27살이다."). eval/results/ does not exist, so there is no baseline. Its 8 cards fit the budget, so it cannot show the H1 effect; that is why a second small fixture is added.
- No `src/ai/guards/` exists yet (GUARDS track). No production code compares numbers; the only age logic is the test-only `fakeAgeIssue` in src/test/ai-fakes/continuity-check.ts:63-80.

## Files
Write (existing):
- src/lib/korean/mentions.ts (add `findNamedAnywhere`)
- src/lib/korean/mentions.test.ts
- src/ai/context.ts (option `keepNamed`, export `CONTINUITY_BUDGET_CHARS`, fact trimming)
- src/ai/context.test.ts
- src/ai/tasks/continuity-check.ts (rule line, numeric merge in `postProcess`)
- src/ai/tasks/continuity-check.test.ts
- eval/novel/localize/en-systems.ts (English rule line in `CONTINUITY_SYSTEM`, lines 57-68)
- src/server/chapter-check.ts (line 2 import, line 144 call)
- src/server/chapter-check.test.ts
- eval/run-continuity.ts (flags, coverage, trap count)
- eval/score.ts, eval/score.test.ts (add `scoreNotDefects`)
Create:
- src/ai/numeric-facts.ts, src/ai/numeric-facts.test.ts
- eval/coverage.ts, eval/coverage.test.ts
- eval/fixture-numeric.test.ts
- eval/fixtures/continuity-planted/work.json, answers.json, chapters/01.md to 04.md
- eval/fixture-planted.test.ts
- docs/eval/continuity/2026-10-19-pending-H.md (no-key case) or 2026-10-19-baseline-before-H.md and 2026-10-19-after-H.md (key case), see step 0
Read-only: src/ai/run.ts (postProcess runs at :109 for every caller), src/lib/korean/sentences.ts (`splitSentences`, `locateQuote`), src/ai/prompt-utils.ts, src/server/ai-features.ts:313 (draft path, must stay unchanged), e2e/ai-stub/responders.ts:99-155 (parses the render format, do not change the format), src/test/factories.ts, src/test/fake-ai.ts, eval/fixtures/continuity/*, eval/fixture.test.ts (keep its counts untouched).

## Design (ordered)
0. Baseline FIRST, before any edit (needs an API key). If there is NO key: do not run or invent any numbers; write `docs/eval/continuity/2026-10-19-pending-H.md` containing the line `not run, no key` and the exact commands still to run (`pnpm eval:continuity`, `pnpm eval:continuity --fixture continuity-planted`, `pnpm eval:continuity --fixture continuity-planted --budget 800`, and which result file each one should be saved to), put "no key" in the commit message, and skip the rest of this step. With a key: on the unchanged code run `pnpm eval:continuity` (the planted fixture and the `--fixture` flag do not exist yet, so `continuity-planted` has NO before-run; only its after-run is recorded). Save the printed summary and the results JSON content to `docs/eval/continuity/2026-10-19-baseline-before-H.md` (create the directory). `eval/results/` is generated and deleted before commit, so it is NOT the baseline location. After the change, run `pnpm eval:continuity` and `pnpm eval:continuity --fixture continuity-planted` (the latter again with `--budget 800`) and save them to `docs/eval/continuity/2026-10-19-after-H.md`. The before/after recall comparison for `continuity` lives in these two files; `continuity-planted` appears only in the after file.
1. mentions.ts: add `export function findNamedAnywhere(text: string, targets: MentionTarget[]): { entryId: string; firstIndex: number }[]`. For each target, take names (trimmed, at least 2 chars, same rule as `findMentions`), find the smallest `text.indexOf(name)` over its names; keep targets with a hit. Plain substring, no josa or boundary rule. Sort by firstIndex asc, then entryId. Pure.
2. context.ts: `export const CONTINUITY_BUDGET_CHARS = 16_000`. Extend the input type with `keepNamed?: boolean` (default false; the draft path in ai-features.ts:313 is not touched and must keep behaving exactly as now).
3. context.ts `buildContextPack`, selection (lines 140-149): after `chosenIds` is built from mentions and BEFORE the `extraEntryIds` loop, if `keepNamed`, call `findNamedAnywhere(input.text, same targets)` and append entry ids not yet in `chosenIds` (in the returned order). Track `namedIds = new Set(chosenIds)` at that moment (mention hits plus substring hits). Extra ids are not "named". Add `named: boolean` to the internal `SelectedEntry` (not to `PackEntry`, so the public pack type and render format do not change).
4. context.ts trimming loop (lines 285-300): keep the loop as is when `keepNamed` is false. When true, in this order: `selection.relations.pop()`, then `selection.threads.pop()`, then `selection.previousSummaries.shift()` (the existing loop drops the OLDEST summary with shift, context.ts:291; do not use pop), then drop un-named entries from the end (the extras); then, if still over budget, pop the LAST fact of the entry that has the most facts (tie: the later entry), repeat; when no entry has facts left, cap each named entry's `summary` at 200 characters (one pass, append `…` when cut) and re-check; if still over budget, `break` (never drop a named entry; never throw). Fields, aliases and naming rules are not trimmed, so the overflow is bounded only by those. Accept it, but make it visible: `eval/run-continuity.ts` counts chapters whose `pack.approxChars > budget` and prints `예산 초과 N장` (also in the results JSON as `overBudgetChapters`). Relations of dropped entries are filtered as today.
5. continuity-check.ts: add one bullet to `CONTINUITY_SYSTEM`, directly after the first rule bullet (line 52, "- <wiki>의 사실(F ref)..."): `- 원고가 위키의 내용을 언급하지 않았거나 위키에 없는 내용을 새로 쓴 것은 모순이 아니다. 위키와 정면으로 어긋나는 문장만 지적하고, "언급이 없다"는 이유로는 지적하지 않는다.` Do not change the first line (tests at continuity-check.test.ts:166-169 (the literal is on :169) and chapter-check.test.ts:297 (`system.startsWith('당신은 장기 연재 웹소설의 설정 오류')`) match it) and do not touch the `- suggestion에는` line.
6. en-systems.ts: add after the first rule bullet of `CONTINUITY_SYSTEM` (the bullet on line 59, so the insertion goes after line 59): `- A manuscript that does not mention a wiki fact, or that adds something the wiki does not cover, is not a contradiction. Flag only a sentence that directly conflicts with the wiki, never because "it is not mentioned."` No Hangul (eval/novel/localize/localize.test.ts:326 checks it).
7. numeric-facts.ts (new, pure, no DB, no AI, never throws): implement `findNumericFactMismatches` (interface below). Rules, all conservative:
   a. Only `pack.entries[].facts` with `status === 'confirmed'` and content containing `나이` and exactly one match of `/(\d{1,3})\s*살/`. Only `살` is supported (not 세, not Hangul numerals).
   b. If an entry has confirmed age facts with two different numbers, skip that entry.
   c. Subject sentences: `splitSentences(chapterText)`; a sentence is about the entry when it includes the entry name or an alias (2+ chars). Skip the sentence if it also includes the name or alias of ANY other pack entry (multi-subject). Skip it if it has not exactly one `/(\d{1,3})\s*살/` match. Skip it if it matches `/(때|시절|무렵|전에|이었|였던|예전|과거|년 전|년 뒤|년 후|이후|뒤에|후에|나중)/` (flashback, time skip or other time frame). Skip it if any occurrence of the entry's name or alias in the sentence is directly followed by `의` (possessive: "세린의 동생은 9살이다." is about a sibling). Residual risk: a sentence that contains the name but is about an unnamed other person (no skip word, no possessive) still produces a hit; the quote and severity medium let the author dismiss it.
   d. If the sentence number differs from the fact number, emit a hit: `quote` = sentence text, `start`/`end` from the splitter, `explanation` = `위키의 나이(${wiki}살)와 원고의 나이(${found}살)가 다릅니다.`, `suggestion` = quote with the matched text replaced by `${wiki}살`.
8. continuity-check.ts `postProcess` (line 153): build `numericIssues: ContinuityIssue[]` from `findNumericFactMismatches({ chapterText: input.chapterText, pack: input.pack })` (kind `'contradiction'`, severity `'medium'`, `factRef` = hit.factRef, `entryRef` = hit.entryRef, `wikiExcerpt` = fact content). Then call `locateIssues({ issues: [...numericIssues, ...output.issues] }, input)`. Numeric issues go first so they win the same-range dedupe. Do not change `resolveContinuityIssues` (the stored output is already post-processed). Wrap the numeric call in try/catch returning `[]` so a bug cannot fail the check (chapter-check rethrows any failure, chapter-check.ts:205).
9. chapter-check.ts line 144: `buildContextPack(db, workId, { text, position: chapter.position, keepNamed: true, budgetChars: CONTINUITY_BUDGET_CHARS })`. Change the line 2 import to exactly `import { buildContextPack, CONTINUITY_BUDGET_CHARS, resolveRefs } from '@/ai/context'`. The same pack also feeds chapter-extract (`knownFacts`), which gets a larger list; accepted.
10. eval/score.ts: add `export function scoreNotDefects(notDefects: { chapter: number; quoteIncludes: string }[], found: FoundIssue[]): FoundIssue[]` returning found issues that hit a notDefect (same chapter, and ONLY `found.quote.includes(quoteIncludes)`; do not reuse `isHit`, which also matches when the trap fragment contains the found quote, so a very short found quote such as '윤서는' would be counted as a trap false positive). Leave `isHit` and `scoreIssues` unchanged.
11. eval/coverage.ts (new): see interface. Uses `findNamedAnywhere` for the named set, with one target per card whose `names` are `[name, ...aliases]` (the same names pack selection uses in step 3; the entry id is the card name, only to map hits back to cards), so a card named only by an alias inside a compound ('종루지기' -> alias '종루') counts as named. It checks presence in the RENDERED pack text: a card counts as in the pack when `renderedPack` has a line starting with `[E<n>] <name> ` (the format `renderContextPack` prints, e.g. `[E1] 잿빛 종루 (장소)`). Comparing against `pack.entries[].name` would be a tautology under `keepNamed` (100% by construction), so that version is only a consistency check, not the metric.
12. eval/run-continuity.ts: (a) new flag `--fixture <dir>` (default `continuity`, resolved under eval/fixtures; the new set is `continuity-planted`); `FIXTURE_DIR` becomes a function of argv. (b) flag `--budget <n>` (number) passed as `budgetChars` to stress trimming; default `CONTINUITY_BUDGET_CHARS`. (c) `checkChapter` calls `buildContextPack` with `{ text, position, keepNamed: true, budgetChars }` exactly like the product. (d) `ChapterRun.pack` gets `named: number` and `namedInPack: number` from `packCoverage(chapter.body, work.entries, renderContextPack(pack))` (import `renderContextPack` from '@/ai/context'; pass `work.entries` into `checkChapter`). (e) `printSummary` prints `함정 오탐 N건` using `scoreNotDefects`, and `맥락 포함률 X%` (sum namedInPack / sum named; 100% when named is 0). (f) the results JSON adds `trapHits` (array) and `coverage` ({named, inPack, rate}).
13. Fixture eval/fixtures/continuity-planted (same JSON schema as eval/fixtures/continuity, read eval/run-continuity.ts:44-94 first). work.json: title "재현율 점검용 소설"; chapters 1-4 (title, summary may be ""); entries: 한세린 (character, aliases ["세린"]), 도윤서 (character, ["윤서"]), 잿빛 종루 (place, ["종루"]), 은색 열쇠 (item, ["열쇠"]), 청해항 (place, []). Facts (all confirmed, no validity): 한세린의 나이는 16살이다. / 도윤서는 단검을 오른손에 쥔다. / 잿빛 종루는 9층 높이의 석조 건물이다. / 은색 열쇠는 달이 찬 밤에만 자물쇠에 꽂을 수 있다. / 청해항 시장은 낮에만 문을 연다. threads [] and namingRules [] are allowed. Each chapter is 400 to 800 characters of plain Korean prose with no other facts that conflict with the wiki. Sentences that must appear verbatim: ch1 (trap, no defect) `청해항에 도착한 세린은 시장 골목을 걸었다.`; ch2 `19살의 세린은 말없이 고개를 숙였다.` (kind contradiction, numeric); ch3 `종루지기가 열한 층 꼭대기에서 손을 흔들었다.` (contradiction; the card is reachable only by substring, never by findMentions) and `윤서는 왼손에 단검을 쥐고 문 앞에 섰다.` (contradiction); ch4 `세린은 낮에 은색 열쇠를 자물쇠에 꽂았다.` (contradiction) and trap `윤서는 말없이 지도를 펼쳤다.` Do not use the words 종루 or 은색 열쇠 elsewhere in ch3 in a way findMentions already matches... (ch3 may mention 종루 only inside 종루지기). answers.json: 4 expected (chapter, quoteIncludes = the sentences above minus the final period, kind), notDefects: the 2 trap sentences with a reason string.

## Interface
```ts
// src/lib/korean/mentions.ts
export function findNamedAnywhere(text: string, targets: MentionTarget[]): { entryId: string; firstIndex: number }[]

// src/ai/context.ts
export const CONTINUITY_BUDGET_CHARS: number // 16_000
export async function buildContextPack(db: Db, workId: string,
  input: { text: string; position: number; extraEntryIds?: string[]; budgetChars?: number; keepNamed?: boolean }): Promise<ContextPack>

// src/ai/numeric-facts.ts
export type NumericFactHit = { factRef: string; entryRef: string; wikiValue: number; foundValue: number
  quote: string; start: number; end: number; wikiExcerpt: string; explanation: string; suggestion: string }
export function findNumericFactMismatches(input: { chapterText: string; pack: ContextPack }): NumericFactHit[]

// eval/score.ts
export function scoreNotDefects(notDefects: { chapter: number; quoteIncludes: string }[], found: FoundIssue[]): FoundIssue[]

// eval/coverage.ts
export function packCoverage(text: string, cards: { name: string; aliases: string[] }[], renderedPack: string):
  { named: string[]; missing: string[]; rate: number } // rate = 1 when named is empty
```

## Tests (TDD; name | input | expected)
mentions.test.ts
- findNamedAnywhere finds a name inside a compound | text '종루지기가 웃었다.', target {id:'a', names:['잿빛 종루','종루']} | [{entryId:'a', firstIndex:0}]
- findNamedAnywhere orders by first index | text '민준이 서윤을 봤다.', targets 서윤 (listed first), 민준 | ids [민준, 서윤]
- findNamedAnywhere ignores 1-char names | text '강물이 민준이를 봤다.', targets 강 (names ['강']), 민준 | ids [민준] only (강 occurs in the text, so deleting the 2-char minimum fails this test)
context.test.ts (use createTestEntry/createTestFact, existing helpers)
- keepNamed false leaves a compound-only name out | entry 잿빛 종루 alias 종루, text '종루지기가 문을 열었다.' | entries [] (pins the draft path)
- keepNamed true adds the compound-only card after mention cards | same plus entry 이서윤 alias 서윤, text '서윤이 왔다. 종루지기가 웃었다.' | names ['이서윤','잿빛 종루'], refs E1,E2
- keepNamed true keeps a named entry over budget and trims facts instead | 이서윤 (alias 서윤) with 10 facts of '가'.repeat(100); 민준 summary '가'.repeat(600); text '서윤은 웃었다. 서윤은 떠났다. 서윤은 왔다. 민준은 울었다.'; budgetChars 1500 | both names present, approxChars <= 1500, 이서윤 facts fewer than 10, 민준 present
- keepNamed true with an impossible budget returns all named entries without throwing | same data, budgetChars 50 | both names present, every facts array empty
- existing test 'drops the lowest-ranked entries first when over budget' must still pass unchanged
- named overflow is bounded | 40 entries, each named in the text, each with a 300-char summary and 3 facts of 100 chars, budgetChars 2000, keepNamed true | all 40 present, every facts array empty, every summary at most 201 chars, no throw; assert `pack.approxChars <= 40 * 400` so unbounded growth fails (comment in the test: each rendered entry is a summary of at most 201 chars plus a short header line with ref, name and type; these test entries have no aliases, fields or relations, so 400 chars per entry is a safe constant)
- extra id is not protected | keepNamed true, extraEntryIds [민준 id], text mentions only 서윤, budgetChars 500 | 민준 dropped first
continuity-check.test.ts
- system prompt says absence is not a contradiction | CONTINUITY_SYSTEM lines | one line starting '- ' contains '언급' and '모순이 아니다'; first line unchanged; the '- suggestion에는' line unchanged
- postProcess adds the numeric issue when the model returns nothing | pack: 한세린 (alias 세린) with confirmed fact '한세린의 나이는 16살이다.' (F1,E1), chapterText '19살의 세린은 말없이 고개를 숙였다.', output {issues: []} | one issue, kind contradiction, severity medium, factRef F1, entryRef E1, quote '19살의 세린은 말없이 고개를 숙였다.'
- numeric issue wins the dedupe over a model issue on the same sentence | same input plus a model issue with that quote | exactly one issue, explanation contains '16살'
- postProcess does not flag an age that matches | chapterText '세린은 16살이 된 뒤로 달라졌다.' | []
numeric-facts.test.ts
- flags a ch10-like error (synthetic pack; the real fixture is covered by the last test of this list) | entry 도윤서 (alias 윤서) fact '도윤서의 나이는 27살이다.', text '옆에서 25살의 도윤서는 말없이 고개를 끄덕였다.' | 1 hit, wikiValue 27, foundValue 25, suggestion '옆에서 27살의 도윤서는 말없이 고개를 끄덕였다.'
- no hit when numbers equal | 27살 in text | []
- no hit for an assumed or undecided fact | status assumed | []
- skips a sentence naming two entries | '세린은 도윤서에게 25살이냐고 물었다.' with both cards | []
- skips a flashback | '도윤서는 25살 때 마을을 떠났다.' | []
- skips a time skip | pack fact '한세린의 나이는 16살이다.' (alias 세린), text '세린은 3년 뒤 19살이 되었다.' | []
- skips a sentence with two ages | '도윤서는 25살과 30살 사이였다.' | []
- skips an entry with two different confirmed ages | facts 27살 and 28살 | []
- skips a possessive sentence | pack fact '한세린의 나이는 16살이다.' (alias 세린), text '세린의 동생은 9살이다.' | []
- ignores a fact without 나이 | '도윤서는 27살에 검을 처음 쥐었다.' | []
- never throws on empty text and empty pack | [] 
- real fixture interaction (new file eval/fixture-numeric.test.ts, DB test with `createTestDb`; seed entries, facts (with validFromPosition/validToPosition) and chapters from eval/fixtures/continuity/work.json, chapters 07 and 10, the same way eval/run-continuity.ts seeds them) | `buildContextPack(..., { text: ch7 body, position: 7, keepNamed: true })` then `findNumericFactMismatches`; same for ch10 at position 10 | ch7 gives 0 hits (the trap "세린은 17살이 된 뒤로" relies on the 16살 fact ending at position 6 and the 17살 fact starting at 7, so only 17살 is in the pack); ch10 gives exactly 1 hit (wikiValue 27, foundValue 25). Do not edit eval/fixture.test.ts.
chapter-check.test.ts
- runChapterCheck sends a compound-only place card to the continuity prompt | chapter body '종루지기가 문 앞에 섰다.', place card 잿빛 종루 alias 종루 with one fact; client: a wrapper `recordingClient` around `scriptedClient` (lines 56-78) whose `generateObject(args)` does `if (args.task.name === 'continuity-check') prompts.push(args.prompt)` and then delegates to the scripted client (`pick` only receives `args.system`, so match the task by `args.task.name`, not by system text); assert on the recorded string, not on a call count | recorded prompt contains '[E1] 잿빛 종루 (장소)' and the fact text inside <wiki>
coverage.test.ts / score.test.ts / fixture-planted.test.ts
- packCoverage reports a missing named card | text '종루지기가 왔다. 세린이 웃었다.', cards 잿빛 종루 [종루], 한세린 [세린], 청해항 [], renderedPack '[E1] 한세린 (인물)\n- [F1] ...' | named ['잿빛 종루','한세린'], missing ['잿빛 종루'], rate 0.5
- packCoverage with no named card | text '' | rate 1
- packCoverage counts a card only by its `[E<n>] <name> ` line | renderedPack that mentions 잿빛 종루 only inside a fact line of another card | 잿빛 종루 is missing
- end-to-end through the product pack (in eval/fixture-numeric.test.ts) | planted ch3 text, `buildContextPack` with keepNamed, `packCoverage(..., renderContextPack(pack))` | rate 1; the same with `keepNamed` false gives rate < 1
- scoreNotDefects returns the found issue that hits a trap | trap ch4 '윤서는 말없이 지도를 펼쳤다', found same chapter with that quote | 1 item; other chapter | 0
- scoreNotDefects ignores a short found quote | same trap, found ch4 quote '윤서는' | 0 items (a found quote that is only a fragment of the trap does not count)
- planted fixture numeric check (in eval/fixture-planted.test.ts) | `findNumericFactMismatches` over the planted ch1-ch4 bodies with a pack built from the planted wiki (age fact only, confirmed); then `scoreNotDefects(trap notDefects, found)` on the resulting hits | exactly 1 hit in total, in ch2 (quote '19살의 세린은 말없이 고개를 숙였다.'); 0 hits in ch1 and ch4 (both trap sentences); scoreNotDefects returns 0 items
- planted fixture | read the files like eval/fixture.test.ts | 4 chapters, 400-800 chars, 4 expected (all quotes verbatim in their chapter), 2 notDefects verbatim, ch3 contains '종루지기' and findMentions on ch3 with the 잿빛 종루 card finds no mention of it, findNamedAnywhere finds it
Do not edit eval/fixture.test.ts (11 expected errors, 10 chapters stay).

## Acceptance metrics
| metric | current | target | how |
|---|---|---|---|
| named cards in pack (mentioned by plain name, alias or substring) | Luna ko 6/10, Luna en 4 (reviews), unmeasured elsewhere | 100% with `keepNamed` | measured on the rendered pack text (`[E<n>] <name>` lines, `packCoverage` + `renderContextPack`); unit tests above; `eval:continuity` prints 맥락 포함률. The pack-name comparison is only a consistency check |
| named cards dropped by budget | unknown | 0 (facts are trimmed instead) | context tests |
| explicit "N살" mismatch found in code, model output empty | 0 (no code) | fixture ch10 and planted ch2 found, ch7 trap not flagged | numeric-facts (synthetic and real-fixture) + postProcess + eval/fixture-planted tests |
| "언급 없음" rule present in ko and en system prompts | absent | present | prompt tests, localize.test.ts |
| draft path pack output | current | byte-identical (flag default off) | existing context and ai-features tests |
| recall on eval/fixtures/continuity (real model) | not measured | at least 8/11 recall, trap false positives 0 to 1 | needs an API key: orchestrator or user runs `pnpm eval:continuity`; compare with `docs/eval/continuity/2026-10-19-baseline-before-H.md` (step 0) and save the result to `docs/eval/continuity/2026-10-19-after-H.md`; without a key only `docs/eval/continuity/2026-10-19-pending-H.md` ("not run, no key") exists and this row stays open; `eval/results/` is not a baseline location; `--fake` only checks flow |
| recall on continuity-planted (real model) | not measured | at least 3/4, 0 trap hits | `pnpm eval:continuity --fixture continuity-planted` and again with `--budget 800`; new fixture, so no before-run; without a key see the pending file |
Targets for the model-dependent rows are proposals, not guarantees; the implementer cannot run them without a key. Do not claim them as met.

## Dependencies on other tracks
- GUARDS: if `src/ai/guards/` exists when you start, still create `src/ai/numeric-facts.ts` (it is imported only by continuity-check.ts, so the orchestrator can move it later). Reuse `splitSentences` from src/lib/korean/sentences.ts, do not copy it.
- B (speech style) and any track editing `CONTINUITY_SYSTEM` (continuity-check.ts, en-systems.ts): conflict risk on the same lines. Keep your edit to the single inserted bullet in each file.
- F2 (chapter-extract split) and F4 (local serialization, effort switch) touch chapter-check.ts and the continuity task: keep your chapter-check.ts edit to the line 2 import and the line 144 call and your continuity-check.ts edits to the prompt bullet and `postProcess`. F4 lowering `effort` works against this track's recall goal.
- D (two-step draft) may consume continuity issues later; no interface needed now.

## Risks
- A bigger pack (16,000 chars, plus substring-only cards) raises input tokens and time. qwen continuity already exceeds the 120 s limit (summary 2.7). The budget applies to continuity only; do not change `DEFAULT_BUDGET_CHARS`.
- The prompt-only absence rule may lower recall on omission-type errors. Compare recall before and after (step 0 files) when a key is available.
- Named-entry overflow past 16,000 chars is bounded only by entry fields (step 4); `예산 초과 N장` makes it visible. It feeds a call that already times out on qwen.
- Code-found age issues can be wrong when a story intentionally shows another age; hence severity medium, confirmed facts only, and the conservative skips in step 7. The wiki stays the author's call (AI never writes wiki rows).
- Numeric explanations are Korean even in English eval runs; they are output, not prompt, so `hangulLeft` is not affected.
- e2e stub (e2e/ai-stub/responders.ts) parses the render format; the format is unchanged. If an e2e manuscript contains `N살`, the numeric check could add an issue; grep e2e for `\d\s*살` first (none found on 2026-10-19; the plain `살` matches in e2e/ai-stub/responders.ts:279 and e2e/fixtures/sample-3ch.txt are 살피며 only).
- Existing chapter-check tests use `toHaveLength(1)`; substring-only cards add context, not issues. If one fails, inspect before changing it.

## Open questions (default applied; the orchestrator may overrule)
1. Budget 16,000 for continuity (default applied). Raise per-task `timeoutMs` for local models? Left to track F4.
2. Draft path unchanged (default). Should drafts also get substring-named cards? Not in this track.
3. Substring matching instead of fixing aliases: applied, plain `includes` with 2-char minimum (1-char names stay unmatched per spec).
4. Numeric severity medium, kind `contradiction`, no new issue kind (default).
5. Whether the 종루 card in the live Luna run lacked the alias 종루 is unknown; the fix covers both causes.
6. Positive-conflict labelling (qwen ko: "항구 끝" vs wiki "언덕 위" was counted as false by the author agent) is a harness labelling question, not handled here.
7. Absence rule stays prompt-only; no code filter on explanations.

## Definition of done
```
pnpm vitest run src/lib/korean/mentions.test.ts src/ai/context.test.ts src/ai/numeric-facts.test.ts src/ai/tasks/continuity-check.test.ts src/server/chapter-check.test.ts e2e/ai-stub/responders.test.ts eval --maxWorkers=2
pnpm vitest run src/server/ai-features.test.ts src/ai/tasks/draft-chapter.test.ts eval/novel/localize --maxWorkers=2
pnpm vitest run src/ai/tasks src/server --maxWorkers=2   # chapter-extract and every other consumer of the changed chapter-check pack (knownFacts)
pnpm e2e e2e/core-flow.spec.ts   # runs the chapter-check flow through the stub; if the e2e server cannot run here, grep e2e for count-based assertions on check issues or wiki candidates (e.g. toHaveLength, toHaveCount) and say in the report that it was not run
pnpm eval:continuity --fake
pnpm eval:continuity --fake --fixture continuity-planted
pnpm exec tsc --noEmit   # filter output to the files above
pnpm eslint src/ai src/lib/korean src/server/chapter-check.ts eval
```
All green, `eval/fixture.test.ts` unchanged and passing, no change to renderContextPack output, and `git diff --stat` limited to the files listed under Write and Create plus docs/eval/continuity/. Delete eval/results/ output before committing (it is a generated directory); the files under docs/eval/continuity/ ARE committed. They depend on the key: WITH a key, `2026-10-19-baseline-before-H.md` (only for `continuity`; the planted fixture has no before-run) and `2026-10-19-after-H.md` (both fixtures, planted also with `--budget 800`) are required and carry the recall numbers; WITHOUT a key, only `2026-10-19-pending-H.md` ("not run, no key" plus the commands) is required, no recall number may be written anywhere, and the report says the model-dependent metric rows are open.

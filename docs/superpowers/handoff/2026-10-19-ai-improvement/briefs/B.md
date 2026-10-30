# Track B: character speech style (Q5), off by default

Branch: `feat/ai-improvement-cloud`. Wave 4 (cloud), the last writer of the wave: work in a worktree `track/cloud/B` created from the `cloud-w3` tag, after A, E1, E2, I, G1, G2, HX2 and HX4 have merged. TDD: write each test first, see it fail, then implement. Repo root: `/home/xogud/documents/github/DaeumHwa`. Read `CLAUDE.md` rules first (Korean user-facing copy, identifiers and comments in English, no package changes, no DB migration here).

Line numbers below were taken on `main` and will have moved. Find every edit point by the quoted text anchor, not by line number.

## Goal

Make main characters' speech (존댓말, 반말, 말버릇) reach the wiki and the draft prompt, as a product feature that is **OFF by default and OFF in the eval** (spec section 8, user decision):
1. The interview asks each main character's 말투 (one SYSTEM bullet plus a per-card "말투 없음" marker on every character card without speech; the question model decides who is main, see step 5).
2. The interview extractor writes the answer into the existing character field `fields.speech` (label 말투), also for a card that already exists.
3. The draft prompt carries a `<voices>` block with the speech of every character that has one, whether or not the instructions mention them.

Switch: `isSpeechStyleEnabled()` in `src/ai/voice.ts` reads env `AI_SPEECH_STYLE` (`1`, `true` or `on`, case-insensitive, trimmed; anything else or unset is off). It is read at call time, never cached at module load. The eval harness never sets it.

Off means B changes nothing observable: the interview-question, interview-extract and draft prompts (system and user parts) are byte-identical to the `cloud-w3` state, and `extractionToProposals` behaves as before. A test pins this (step 0, tests 29-35). All new input fields are optional and unset when off, so nothing else needs the flag.

Decision (no migration): store speech in `wiki_entries.fields.speech`. Do NOT add a `voice` key, a new proposal type, or change `ExtractionSchema`. Style cards stay as they are (post-chapter-2 `suggestStyleCard`); only the draft filter is widened when the flag is on (step 4).

## Evidence (numbers, the baseline for a later flag-on run)

- Q5 (인물 목소리, Character voice) ko = 3 in all three runs (qwen, haiku, luna); en = 4 in all three. Rubric `docs/eval/novel-quality-criteria.md:92-96`.
- Speech contradictions counted by reviewers (T2, manual): ko qwen 1 (`docs/eval/novel/2026-10-18/qwen3.8-27b-ko.md:201`), haiku 1 (`haiku-5.5-ko.md:44`), luna 1 (`luna-6-ko.md:69`); en haiku 1 minor, qwen 1 medium, luna not counted (`luna-6-en.md:56`).
- Haiku ko: 16 of 16 lines of 세린 are 해요체, but the bible says 반말 (`haiku-5.5-ko.md:102`, `eval/fixtures/novel/ko/bible.json:16`).
- Interview never asked speech. `INTERVIEW_TOPICS` (`src/ai/tasks/interview-question.ts`) has no speech item and the card list shows name, kind, fact count and the first 40 chars of the summary, never fields.
- Extraction drops fields of an existing card: `src/ai/extraction.ts` entry loop, `if (locate(name, e.kind)) continue`.
- Draft context: `src/server/ai-features.ts` `startDraft` keeps a style card only if `entryId` is null or in `input.entryIds`; `buildContextPack` picks entries only by mention or `extraEntryIds` and drops entries over the 12000-char budget (`src/ai/context.ts`).
- No "main character" flag exists in the schema. The bible's roles are 주인공/조력자/감시관, so a role-text rule would miss two of three mains. Hence the definition below.

## Files

Write (existing, edit):
- `src/ai/tasks/interview-question.ts` (system built from a lines array, input type, card rendering)
- `src/ai/tasks/interview-extract.ts` (system built from a lines array)
- `src/ai/extraction.ts` (field key normalization, speech update for an existing card, context types)
- `src/server/known-entries.ts` (return `speech` for active entries and `pendingSpeechEntryIds`)
- `src/server/interview.ts` (`buildQuestionInput`: pass `hasSpeech` when on; extractor call: pass `speechStyle` and `pendingSpeechEntryIds`)
- `src/ai/tasks/draft-chapter.ts` (`DraftPromptInput.voices`, `<voices>` block; `DRAFT_SYSTEM` is NOT touched)
- `src/server/ai-features.ts` (`startDraft`: voices and widened style card filter, only when on)
- `eval/novel/localize/en/interview-question.ts`, `eval/novel/localize/en/interview-extract.ts` (English speech rule exports; these files come from the Task 0.4 seam), `eval/novel/localize/en-systems.ts` (assembler: the two entries become getters that add the speech rules when on)
- `eval/novel/localize/scaffold.ts` (RULES entries for `말투 없음` and the voices note)
- `.env.example` (one commented line `# AI_SPEECH_STYLE=on`)
- Tests: `src/ai/tasks/interview.test.ts`, `src/ai/tasks/draft-chapter.test.ts`, `src/ai/extraction.test.ts`, `src/server/ai-features.test.ts`, `src/server/interview.test.ts`, `src/server/known-entries.test.ts`, `src/server/chapter-check.test.ts` (one added case, test 20b), `eval/novel/localize/localize.test.ts` (scaffold case, test 27b)
- `src/test/factories.ts` (`createTestEntry` gets an optional `fields`)

Create:
- `src/ai/voice.ts`, `src/ai/voice.test.ts`
- `src/ai/speech-off.test.ts` (golden tests that the flag-off prompts equal the pre-B ones, step 0)

Read-only: `src/lib/labels.ts` (CHARACTER_FIELD_LABELS.speech = 말투), `src/server/proposals.ts` (entry_update merges `patch.fields` over current fields), `src/lib/proposal-payloads.ts`, `src/ai/prompt-utils.ts` (`neutralizeDeep`, `TAG_DATA_RULE`), `src/server/wiki.ts` (`listEntries`), `src/server/styles.ts`, `src/db/schema.ts`, `src/test/ai-fakes/interview-extract.ts`, `eval/novel/eval-client.ts` (`translateScaffold` is applied to English user prompts, `EN_SYSTEMS[task]` is used as the system), `eval/novel/localize/localize.seam.test.ts` (Task 0.4), `eval/novel/agents/author.md`, `e2e/ai-stub/responders.test.ts`, `e2e/ai-stub/stub.test.ts` (run only, change them only if they fail while the flag is off). Do NOT edit `eval/fixtures/novel/ko/bible.json`, `eval/fixtures/novel/en/bible.json` (the answer bank), or add speech to `INTERVIEW_TOPICS` or `EN_INTERVIEW_TOPICS`: the eval baseline of 2026-10-18 must stay comparable.

## Design (ordered)

0. Golden first. Before any B edit, on the `cloud-w3` code, write `src/ai/speech-off.test.ts` with `toMatchInlineSnapshot` for fixed inputs (flag unset in `beforeEach` via `vi.unstubAllEnvs()` and `delete process.env.AI_SPEECH_STYLE`): `interviewQuestionTask.system`, `interviewExtractTask.system`, `DRAFT_SYSTEM`, `buildInterviewQuestionPrompt` for an input with two character cards, `buildDraftPrompt` for a fixed input without `voices`. Run it green and commit it before step 1; every later step must keep it green without editing the snapshots.

1. In `src/test/factories.ts` `createTestEntry`, add option `fields?: Record<string, string>` and insert `fields: o.fields ?? {}`. Test helper only.

2. New `src/ai/voice.ts` (pure, no DB). Export `SPEECH_STYLE_ENV = 'AI_SPEECH_STYLE'` and `isSpeechStyleEnabled(env = process.env)`. "Main voice" = a non-archived `character` entry whose `fields.speech` is non-empty after trim. `selectMainVoices(sources, limit = MAIN_VOICE_LIMIT)`: drop empty speech; sort selected first (`selected: true`), then `createdAt` ascending, then `entryId`; take `limit` (6). Each line: entryId, name, and speech with whitespace runs collapsed to one space and cut at 200 chars (append `…`). `renderVoiceLines(lines)` returns `- <name>: <speech>` joined with `\n`, or `(없음)` for an empty list.

3. `src/ai/tasks/draft-chapter.ts` (`DRAFT_SYSTEM` stays as A left it; A is the first writer of it and of `e2e/ai-stub/responders.ts`, B edits neither):
   - Add optional `voices?: Pick<VoiceLine, 'name' | 'speech'>[]` to `DraftPromptInput`.
   - In `buildDraftPrompt`, only when `input.voices !== undefined` (where `input` is the neutralized copy returned by `neutralizeDeep`, never the raw argument), insert immediately before `<style_cards>` the block `<voices>`, the note line `인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.`, then `renderVoiceLines(input.voices)`, then `</voices>`, followed by a blank line like the other blocks. When `voices` is `undefined` the prompt is byte-identical to before (no block, no extra blank line). The note line carries the instruction, so the system prompt needs no change.

4. `src/server/ai-features.ts` `startDraft`: read `const speech = isSpeechStyleEnabled()` once. When `speech` is false, nothing below runs (no extra DB read, `voices` stays `undefined`, the style card filter is the existing one). When true, before building style cards: `const characters = await listEntries(db, actor, workId, { kinds: ['character'] })`; `voices = selectMainVoices(characters.map(e => ({ entryId: e.id, name: e.name, speech: e.fields.speech ?? '', selected: selected.has(e.id), createdAt: e.createdAt })))`; style card filter keeps a card when `card.entryId === null || selected.has(card.entryId) || voiceIds.has(card.entryId)` (`voiceIds` = entry ids of `voices`); pass `voices: voices.map(v => ({ name: v.name, speech: v.speech }))` to `buildDraftPrompt`. Keep `buildContextPack` unchanged (voices live outside the 12000-char pack, so the budget never drops them). Add only these lines to A's/E1/E2's `startDraft`; do not touch the length plan, continuation or budget code.

5. `src/ai/tasks/interview-question.ts` (I owns the SYSTEM text and `buildInterviewQuestionPrompt`; B edits after I merged):
   - Turn the SYSTEM literal into `SYSTEM_LINES` (unchanged text) and export `buildInterviewQuestionSystem(speech: boolean)`: it returns `SYSTEM_LINES.join('\n')` when false, and when true inserts `SPEECH_QUESTION_RULE` directly after the line that starts with `- 핵심 설정은`. `interviewQuestionTask` defines `get system() { return buildInterviewQuestionSystem(isSpeechStyleEnabled()) }`. Before editing, grep every use of `.system` and every spread of the task object (`eval/novel/eval-client.ts`, `src/ai/run.ts`, e2e stub) to make sure nothing copies the value at module load.
   - `SPEECH_QUESTION_RULE`: `- 주인공과 주요 인물은 인물마다 말투(존댓말·반말·말버릇)도 확인해야 한다. <wiki>에서 주인공이나 주요 인물 카드에 "말투 없음"이 붙어 있으면 focus를 "setting"으로 하고 topic을 "주요 인물"로 하여 그 인물의 말투를 먼저 묻는다. 조연 카드의 "말투 없음"은 주인공과 주요 인물을 확인한 뒤에 묻는다.` Do not change `INTERVIEW_TOPICS` (a new topic would break `src/test/ai-fakes/interview-question.ts`, `localize.test.ts` and track I).
   - `wiki.entries[]` gets optional `hasSpeech?: boolean`. In the card line add `, 말투 없음` inside the parentheses when `e.kind === 'character' && e.hasSpeech === false`. Example: `- 한세린 (인물, 사실 2개, 말투 없음): 요약`. Output is unchanged when `hasSpeech` is undefined or true. The marker goes on every character card without speech (no role-text rule, the schema has no main flag); the SYSTEM rule limits "ask first" to the protagonist and main characters, so a minor character is not asked before the protagonist.

6. `src/server/interview.ts` `buildQuestionInput`: add `fields: wikiEntries.fields` to the `entries` select and map `hasSpeech: e.kind === 'character' ? Boolean(e.fields?.speech?.trim()) : undefined` into `wiki.entries` only when `isSpeechStyleEnabled()`; when off `hasSpeech` is always `undefined`. Do not change `ENTRY_LIMIT`.

7. Extractor:
   - `src/ai/tasks/interview-extract.ts`: turn SYSTEM into `SYSTEM_LINES` (unchanged text) and export `buildInterviewExtractSystem(speech: boolean)`. When true: append ` 단, 답에 인물의 말투(존댓말·반말·말버릇)가 나오면 이미 있는 카드여도 그 인물을 entries에 넣고 fields에 key "speech"로 말투를 한 문장으로 쓴다.` to the line that starts with `- 이미 있는 카드(<known>)` (G1/G2 may have reworded it; keep their text, only append), and insert `- 인물 카드의 말투는 항상 fields의 key "speech"에 쓴다. 다른 key(말투, 화법, voice)를 쓰지 않는다.` directly before the `ENTITY_NAME_RULES` line. `interviewExtractTask` gets `get system()` the same way as step 5. The builder throws if the anchor line is missing, so a drifted anchor fails a test instead of silently dropping the rule.
   - `src/ai/extraction.ts`:
     a. Add `speech?: string` to `ExtractionContext.existingEntries` items and optional `speechStyle?: boolean` and `pendingSpeechEntryIds?: string[]` to `ExtractionContext`. Everything in b and c runs only when `ctx.speechStyle === true`; otherwise the entry loop is exactly the old code.
     b. `SPEECH_KEYS = new Set(['speech', '말투', '화법', '말버릇', 'voice'])` and `normalizeFieldKey(key)` returning `'speech'` for those (lowercased, trimmed compare), else the trimmed key. Compute `normalizedFields = new Map<string,string>()` once per entry (trimmed keys through `normalizeFieldKey`, trimmed values; for `speech` keep the first non-empty value, for other keys the first) before the `locate(name, e.kind)` branch, and reuse it in both the speech update (c) and the entry_create field loop.
     c. Replace `if (locate(name, e.kind)) continue` with `const hit = locate(name, e.kind); if (hit) { <speech update when speechStyle>; continue }`. Speech update only when `ctx.source === 'interview'` (chapter-check and other sources keep the old behavior, test 20b), `hit.source === 'wiki'`, the entry's `speech` is a string empty after trim (unknown `undefined` never overwrites), `hit.entry.id` is not in `ctx.pendingSpeechEntryIds`, not in a local `speechUpdated` set, and `normalizedFields` has a non-empty `speech`. Then push `makeProposal(ctx, 'entry_update', { entryId: hit.entry.id, entryName: hit.entry.name, patch: { fields: { speech } } })` and add the id to `speechUpdated`. Do not mutate `hit.entry` or any `ctx.existingEntries` item. Pending and created hits stay ignored (known limitation).
   - `src/server/known-entries.ts`: select `fields: wikiEntries.fields` for `active` and return `speech: fields.speech ?? ''` per item (type `KnownEntries['active']`). Add `'entry_update'` to the pending proposal types query and `pendingSpeechEntryIds: string[]` to `KnownEntries`. The pending loop has an `entry_create` branch and an unconditional `else` that treats every other row as `thread_create`, so selected `entry_update` rows would push `undefined` into `pendingThreadTitles`. Replace the `else` with `else if (row.type === 'thread_create')` (push title) and `else if (row.type === 'entry_update')` (push `payload.entryId` to `pendingSpeechEntryIds` only when `payload.patch.fields.speech` is a non-empty string after trim; other `entry_update` rows are ignored). The `excludePostChapterOf` skip applies to all branches; `pending` still lists `entry_create` only. G1 has already added `loadKnownFactTexts` there; do not touch it. These are additive data and run regardless of the flag.
   - `src/server/interview.ts` extractor call: pass `speechStyle: isSpeechStyleEnabled()` and `pendingSpeechEntryIds: known.pendingSpeechEntryIds`. `chapter-check.ts` passes neither.
   - `src/test/ai-fakes/interview-extract.ts`: leave as is unless a test needs it.

8. English mirrors, `eval/novel/localize/en/interview-question.ts` and `en/interview-extract.ts`: keep the existing off text byte-identical (the seam snapshot test `localize.seam.test.ts` must pass unchanged). Add exports `EN_SPEECH_QUESTION_RULE`, `EN_SPEECH_EXTRACT_APPEND`, `EN_SPEECH_EXTRACT_RULE` (same positions and tag names as the Korean ones, no Hangul, key name stays `speech`, topic name "main characters"). In `en-systems.ts` make `EN_SYSTEMS['interview-question']` and `['interview-extract']` getters that return the off text, or the text with the rules inserted at the same anchors when `isSpeechStyleEnabled()`. Check first that nothing spreads or caches `EN_SYSTEMS` (`eval-client.ts` reads `EN_SYSTEMS[task]` per call). The English question rule must quote exactly `"no speech style"`, e.g. `- Ask about each main character's speech style too (formal or casual, verbal tics). If the protagonist's or a main character's card in <wiki> carries "no speech style", set focus to "setting" and topic to "main characters" and ask about that character's speech first. Ask about a supporting character's missing speech style only after the protagonist and main characters.`
   `eval/novel/localize/scaffold.ts`: add to `RULES`, next to `['말투: ', 'Speech: ']`, `['말투 없음', 'no speech style']` and `['인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.', 'Speech style per character. Dialogue follows it and never changes it.']`. Neither string occurs in a flag-off prompt, so English output is unchanged when off. The draft-chapter English system needs no change.

## Interface

```ts
// src/ai/voice.ts
export const SPEECH_STYLE_ENV = 'AI_SPEECH_STYLE'
export function isSpeechStyleEnabled(env?: Record<string, string | undefined>): boolean // default off
export const MAIN_VOICE_LIMIT = 6
export type VoiceSource = { entryId: string; name: string; speech: string; selected: boolean; createdAt: Date }
export type VoiceLine = { entryId: string; name: string; speech: string }
export function selectMainVoices(sources: VoiceSource[], limit?: number): VoiceLine[]
export function renderVoiceLines(lines: Pick<VoiceLine, 'name' | 'speech'>[]): string

// draft-chapter.ts
export type DraftPromptInput = { /* existing fields */ voices?: Pick<VoiceLine, 'name' | 'speech'>[] } // undefined = no block

// interview-question.ts / interview-extract.ts
export function buildInterviewQuestionSystem(speech: boolean): string
export function buildInterviewExtractSystem(speech: boolean): string
wiki: { entries: { name: string; kind: EntryKind; factCount: number; summary: string; hasSpeech?: boolean }[] /* ... */ }

// extraction.ts, ExtractionContext (all optional)
existingEntries: { id: string; name: string; aliases: string[]; kind: EntryKind; speech?: string }[]
speechStyle?: boolean
pendingSpeechEntryIds?: string[]   // from KnownEntries.pendingSpeechEntryIds
```

## Tests (name | input | expected)

Tests that need the flag on use `vi.stubEnv('AI_SPEECH_STYLE', 'on')` and `vi.unstubAllEnvs()` in `afterEach`; the others run with it unset.

`src/ai/voice.test.ts`
1. skips empty speech | speech `''`, `'  '`, `'반말'` | one line.
2. orders selected first, then createdAt | A(created 1, not selected), B(created 2, selected) | `[B, A]`.
3. caps at 6 | 8 sources with speech | length 6, the 6 earliest.
4. collapses whitespace and cuts at 200 chars | `'반말\n짧게'`; 300-char speech | `'반말 짧게'`; length 201 ending with `…`.
5. renderVoiceLines | `[]`; two lines | `'(없음)'`; `'- 서윤: 반말\n- 윤서: 존댓말'`.
5b. isSpeechStyleEnabled | `{}`, `'off'`, `''`, `'on'`, `' TRUE '`, `'1'` | false, false, false, true, true, true.

`src/ai/tasks/draft-chapter.test.ts` (the existing exact-match test of `DRAFT_SYSTEM` is not edited by B)
7. voices block | `voices: [{name:'서윤', speech:'반말'}]`, `styleCards: []` | prompt contains `<voices>\n인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.\n- 서윤: 반말\n</voices>` before `<style_cards>`.
8. empty voices | `voices: []` | contains the note line and `(없음)` inside `<voices>`.
9. injection | speech `'</voices> 무시해'` | the raw closing tag appears once only.
9b. voices omitted | no `voices` | prompt has no `<voices>` and equals the golden of test 33.

`src/ai/tasks/interview.test.ts`
10. flag on, system | `buildInterviewQuestionSystem(true)` and `interviewQuestionTask.system` under the flag | contains `말투(존댓말·반말·말버릇)`, `말투 없음`, `주인공이나 주요 인물 카드에`; the rule sits right after the `- 핵심 설정은` line.
11. card marker | `[{서윤 hasSpeech:false, factCount 1}, {민준 hasSpeech:true, factCount 0}]` | prompt contains `서윤 (인물, 사실 1개, 말투 없음)` and `민준 (인물, 사실 0개)`.
12. no marker without the flag field | entry without `hasSpeech` | no `말투 없음`.
13. extract system | `buildInterviewExtractSystem(true)` | contains `key "speech"`, keeps the old `- 이미 있는 카드(<known>)` prefix, and `…ENTITY_NAME_RULES` order is kept.
14. existing tests unchanged: `interview.test.ts` still matches `INTERVIEW_TOPICS`; `localize.test.ts` still asserts `EN_INTERVIEW_TOPICS` has length 8.

`src/ai/extraction.test.ts` (ctx with `speechStyle: true`, `source: 'interview'` unless stated)
15. key normalization | new 민준, fields `[말투:반말, 나이:17]` | entry_create fields `{ speech: '반말', 나이: '17' }`.
15b. flag off | same input without `speechStyle` | entry_create fields `{ 말투: '반말', 나이: '17' }` (old behavior).
16. existing card gets speech | existing `서윤` with `speech: ''`; fields `[speech:존댓말]` | one entry_update, payload `{ entryId:'e-seoyun', entryName:'서윤', patch:{ fields:{ speech:'존댓말' } } }`, no entry_create.
16b. flag off | same as 16 without `speechStyle` | zero proposals.
17. existing speech never overwritten | existing `speech: '반말'` | zero proposals.
18. unknown speech not touched | existing entry without `speech` key | zero proposals.
19. no speech field | fields `[나이:17]` | zero proposals.
19b. Korean key on existing card | `speech: ''`; fields `[말투:존댓말]` | one entry_update, patch `{ fields: { speech: '존댓말' } }`.
19c. pending blocks a second update | `pendingSpeechEntryIds: ['e-seoyun']` | zero proposals.
19d. same card twice in one extraction | two 서윤 entries with speech | exactly one entry_update; `ctx.existingEntries[0].speech` still `''`.
19e. non-interview source | `source: 'post_chapter'`, input of test 16 | zero proposals.

`src/server/ai-features.test.ts` (flag on, `createTestEntry(..., { fields: { speech: '반말' } })`)
20. voice without selection or mention | 서윤 has speech, `entryIds: []`, instructions `'민준이 웃는다.'` | prompt contains `<voices>` and `- 서윤: 반말`.
21. character without speech stays out | 철수 no speech | `<voices>` does not contain 철수.
22. non-character with speech ignored | place entry with `fields.speech` | not in `<voices>`.
23. voice character's style card included | card for 서윤, `entryIds: []` | prompt contains the card name.
24. existing test (철수 has no speech, `not.toContain('철수 말투')`) still passes.
24b. flag off | same data as 20 and 23, flag unset | prompt has no `<voices>` and not the card name; equals the prompt of a work without any speech data.

`src/server/chapter-check.test.ts`
20b. speech update is interview-only | flag on; post_chapter extraction returns existing 서윤 (empty speech) with `[speech:존댓말]` | no entry_update with `patch.fields.speech`.

`src/server/interview.test.ts`
25. question input marks missing speech | flag on; 서윤 no speech, 민준 speech; spy on the client prompt | contains `서윤 (인물, 사실 0개, 말투 없음)`, 민준 has no marker.
25b. flag off | same data, flag unset | prompt has no `말투 없음`; the question and extract `system` sent equal the pre-B golden.
25c. extract call | flag on, answer names an existing speechless 서윤 | an `entry_update` proposal with `patch.fields.speech` is created; flag off: none.

`src/server/known-entries.test.ts`
26. active entries carry speech | `fields.speech='반말'`, another without | `'반말'` and `''`.
26b. pending speech update reported | pending `entry_update` with `patch.fields.speech` for 서윤, another with only `patch.aliases` | `pendingSpeechEntryIds` is `[서윤.id]`; `pending` unchanged; `pendingThreadTitles` has no `undefined`.

`eval/novel/localize/localize.test.ts`
27. existing `EN_SYSTEMS` no-Hangul test passes, with the flag unset and with it on; `EN_INTERVIEW_TOPICS` stays 8; `localize.seam.test.ts` passes unchanged.
27b. scaffold | `translateScaffold('- (인물, 사실 0개, 말투 없음): x')` (no Hangul name) | `findHangul` is `[]` and the result contains `no speech style`; with the flag on `EN_SYSTEMS['interview-question']` contains `no speech style`, with it off it does not. `translateScaffold` of the voices note line has no Hangul.

`src/ai/speech-off.test.ts` (flag unset; inline snapshots written in step 0, never regenerated)
29. interview-question system equals the pre-B golden. 30. interview-extract system equals it. 31. `DRAFT_SYSTEM` equals it. 32. `buildInterviewQuestionPrompt` golden (cards without `hasSpeech`). 33. `buildDraftPrompt` golden (no `voices`). 34. `EN_SYSTEMS['interview-question']` and `['interview-extract']` equal the pre-B text and contain no `speech`. 35. with the flag on, each of 29, 30 differs from its golden by exactly the added rule text (diff is only the inserted/appended sentences).

## Acceptance

| check | target | how |
|---|---|---|
| Flag off is byte-identical | interview-question, interview-extract, draft prompts (system and user parts) and English systems equal the pre-B golden | tests 29-35, 9b, 16b, 24b, 25b; step 0 snapshots are not edited |
| Flag on works | voices block, marker, speech update behave as specified, never overwrite, never duplicate while pending | tests 1-28 plus 19b-e, 20b, 25c, 26b, 27b |
| Eval baseline untouched | no diff in `eval/fixtures/novel/*/bible.json`, `INTERVIEW_TOPICS`, `EN_INTERVIEW_TOPICS`, `docs/eval/novel/2026-10-18/` | `git diff --stat` |
| Q5, speech contradictions (T2), interview asks speech early, `<voices>` seen in `calls/*.json` | not measured in this round | A later, separate eval run with `AI_SPEECH_STYLE=on` and an answer bank that carries speech sentences measures them against the Evidence numbers above. That run decides its own fixtures. |

## Dependencies on other tracks

- A: first writer of `DRAFT_SYSTEM`, `responders.ts`, `startDraft`'s length and continuation code. B only adds an optional `voices` field, a flag-gated block in `buildDraftPrompt` and a flag-gated block in `startDraft`; B edits no rule text of `DRAFT_SYSTEM`.
- E1, E2, D: same `draft-chapter.ts` and `startDraft`; B (wave 4) merges after E1 and E2 and rebases on them. D (local) merges after B and keeps B's gate.
- I (interview strategy): wave 2, merged before B. B inserts one SYSTEM bullet after I's `- 핵심 설정은` line and adds the card suffix; I's text is not changed. `scaffold.ts` order is A, I, HX2, B, D, and rules are only added.
- G1, G2: waves 3 and 2, merged before B. B appends to their `interview-extract.ts` line instead of rewording it, finds the `extraction.ts` entry loop by text, and leaves `loadKnownFactTexts` alone. G1 made `knownFacts` required; B's extractor-call edit keeps it.
- HX2: wave 3, adds `새 회차` to `scaffold.ts` before B. HX5: wave 4, writes `eval/novel/steps/finish.ts` only, no overlap.
- H (continuity): will read `fields.speech` through the pack. No code dependency.
- GUARDS: none; B does not use a guard.
- HX1/HX3: independent. B does not touch fixtures or `author.md`.

## Risks

- With the flag on and the unchanged answer bank the author agent has no speech answer for the protagonist and improvises one, so a flag-on eval run needs its own fixtures (see Acceptance).
- Task `system` fields become getters that read the env at call time. Anything that copies a task object or caches `.system` at load would freeze the flag at its first value; step 5 requires a grep, and test 10 flips the env within one test file.
- A repeated speech answer does not replace an existing `speech` (skipped on purpose). A revised voice needs an author edit in the wiki form. Two answers for the same card before approval give one `entry_update` (`pendingSpeechEntryIds`); the second is dropped.
- The speech update runs for interview extraction with the flag on only; chapter text never proposes speech.
- A card that is still a pending proposal ignores a later speech answer, and its interview question shows `말투 없음` until approved. `listEntries` and `buildQuestionInput` read active rows only, so an interview-created character reaches `<voices>` only after its `entry_create` is approved (in the eval the author agent decides per turn; a rejected protagonist is not measurable and must be marked so in that later review).
- `<voices>` adds at most 6 lines of 200 chars (about 1.3k chars); the same speech may also appear in `<wiki>`. "Main" is approximated by "has speech, capped at 6, selected and oldest first".
- The English systems are getters: a test that compares `EN_SYSTEMS` by `toEqual` after a spread would read them once. No such use exists today; test 34 guards the off state.
- `listEntries` calls `requireWorkRole(viewer)` again inside `startDraft` (flag on only); harmless since editor role was already checked.

## Open questions

1. Should `hasSpeech` also require the card to be "main" (3 per bible)? Chosen: no, any character without speech is marked and the SYSTEM rule orders the questions.
2. Should a speech change from an interview overwrite an existing value after author confirmation? Chosen: no (fill-only), revisit later.
3. Is a code metric for speech contradictions wanted? The eval spec chooses no deterministic judge (`docs/superpowers/specs/2026-10-18-lightweight-model-novel-eval-design.md:175`), so contradictions stay a reviewer count. Not built.
4. Env flag or per-work setting? Chosen: env flag per deployment (spec 8 asks for off by default); a per-work toggle needs a schema change, out of scope.

## Definition of done

```
pnpm vitest run src/ai/voice.test.ts src/ai/speech-off.test.ts src/ai/tasks/interview.test.ts src/ai/tasks/draft-chapter.test.ts src/ai/extraction.test.ts src/ai/context.test.ts src/server/ai-features.test.ts src/server/interview.test.ts src/server/known-entries.test.ts src/server/chapter-check.test.ts src/server/proposals.test.ts src/test/fake-ai.test.ts eval/novel/localize eval/novel/eval-client.test.ts e2e/ai-stub/responders.test.ts e2e/ai-stub/stub.test.ts --maxWorkers=2
pnpm exec tsc --noEmit        # filter output to files listed above
pnpm eslint src/ai src/server eval/novel e2e/ai-stub
```

All pass. The track is complete when the unit tests, typecheck and lint above pass and the step 0 snapshots are unchanged (`git diff` of `src/ai/speech-off.test.ts` after its first commit is empty). The speech metrics are not part of this round. No new package, no change under `drizzle/` or `src/db/schema.ts`, and `git diff --name-only` touches only the files in the Files section.

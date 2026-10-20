// Scene expansion (stage 1b): a first draft that is short is fixed by rewriting its short scenes
// longer in place. Each span is sent with the end of the span before it and the start of the span
// after it, so the rewrite joins both. The service in src/server/ai-features.ts calls it once per
// span and checks the answer with acceptExpansion before anything is spliced in.
// Streamed text, not a structured task: the answer is the expanded scene text itself.

import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import { renderCard, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { splitSentences } from '@/lib/korean/sentences'
import { draftCharCount, isContinuationCommentary, QUOTED } from '@/lib/draft-length'
import { isBreakLine } from '@/lib/scene'

export const DRAFT_EXPAND_SYSTEM = `너는 웹소설 장면을 늘려 다시 쓰는 보조 작가다.
- <scene>의 사건, 인물, 장소, 순서, 대사의 뜻을 그대로 두고 새 사건을 더하지 않는다.
- 감각 묘사, 인물의 몸짓과 표정, 짧은 대사 주고받기, 장면 안의 머뭇거림을 더해 <length>의 분량까지 늘린다.
- 같은 문장, 같은 동작, 같은 묘사를 되풀이해 분량을 채우지 않는다.
- <before>의 끝에서 자연스럽게 이어지고 <after>의 시작으로 넘어가게 쓴다. <before>와 <after>는 다시 쓰지 않는다.
- 문체와 시점, 문단 길이는 <scene>을 따른다. 장면 구분선은 쓰지 않는다.
- <style_cards>가 있으면 그 말투와 규칙을 지킨다.
- <instructions>는 작가가 이 회차 전체에 준 지시다. 금지 표현, 말투, 회차 끝 방식 같은 규칙을 지킨다. <instructions>에 있어도 <scene>에 없는 사건은 더하지 않는다.
${TAG_DATA_RULE}
- 해설이나 질문 없이 늘린 장면 본문만 출력한다.`

export const EXPAND_EFFORT = 'low' as const
export const EXPAND_MAX_TOKENS = 8000

/** An expansion must be at least this many times as long as its span. */
const MIN_GROWTH = 1.05
/** Shortest sentence (in characters) that counts as a repeat. Shorter ones match by chance. */
const REPEAT_MIN_CHARS = 8

export type DraftExpandInput = {
  /** The last two paragraphs of the span before, or an empty string for the first span. */
  before: string
  /** The span to expand. */
  scene: string
  /** The first paragraph of the span after, or an empty string for the last span. */
  after: string
  targetChars: number
  styleCards: DraftPromptInput['styleCards']
  /** The author's instructions for the whole chapter (bans, voice, how the chapter ends). */
  instructions: string
}

/**
 * The user message for one expansion: style cards, the author's instructions, the text on each
 * side, the span and its length line. Every block is neutralized so that the text cannot close a
 * tag early.
 */
export function buildExpandPrompt(raw: DraftExpandInput): string {
  const input = neutralizeDeep(raw)
  const cards =
    input.styleCards.length > 0 ? input.styleCards.map(renderCard).join('\n\n') : '(없음)'
  return [
    `<style_cards>\n${cards}\n</style_cards>`,
    `<instructions>\n${orNone(input.instructions)}\n</instructions>`,
    `<before>\n${orNone(input.before)}\n</before>`,
    `<scene>\n${input.scene}\n</scene>`,
    `<after>\n${orNone(input.after)}\n</after>`,
    `<length>공백 포함 약 ${input.targetChars}자 (지금 ${draftCharCount(input.scene)}자)</length>`,
  ].join('\n\n')
}

function orNone(text: string): string {
  return text.trim() === '' ? '(없음)' : text
}

/**
 * Notes a model writes to the author about a rewrite, as opposed to story text. They are tested on
 * the new sentences of an expansion only (see expansionRejection), one sentence per line, after
 * quoted dialogue is removed. The continuation's own list (COMMENTARY_MARKERS in
 * src/lib/draft-length.ts) stays unchanged so that the continue mode behaves as before.
 */
const EXPAND_NOTE_MARKERS = [
  // The input tags echoed back.
  /<\/?(?:scene|before|after|length|style_cards|instructions)>/,
  // A first line that announces the text.
  /^\s*(?:다음은|아래는|여기)[^\n]{0,40}(?:장면|본문)[^\n]{0,20}(?:입니다|이다)[.:：]?\s*$/m,
  // A bare length note.
  /^\s*\(?\s*(?:공백\s*포함\s*)?약?\s*[\d,]+\s*자\s*\)?\s*$/m,
  // The English forms, for the eval runs.
  /^\s*here(?:'s| is) the (?:expanded|rewritten|longer)\b/im,
  /^\s*\(?\s*(?:about|approximately|~)?\s*[\d,]+\s*(?:characters|chars)\s*\)?\s*$/im,
]

/** Why an expansion was refused: too short, a scene break line, a note to the author, a repeat. */
export type ExpansionRejection = 'short' | 'break' | 'note' | 'repeat'

/**
 * The first check an expansion fails, or null when it is usable. The checks run in this order:
 * - 'short': less than 5% longer than the original span;
 * - 'break': a scene break line;
 * - 'note': a note to the author. Only sentences that are not sentences of the original are read,
 *   so narration the span already had (for example "그는 아무 말도 덧붙이지 않았다.") passes, and
 *   quoted dialogue is left out;
 * - 'repeat': a sentence of 8 or more characters that appears twice in the expansion while
 *   appearing at most once in the original.
 */
export function expansionRejection(original: string, expanded: string): ExpansionRejection | null {
  if (draftCharCount(expanded) < draftCharCount(original) * MIN_GROWTH) return 'short'
  if (expanded.split('\n').some((line) => isBreakLine(line))) return 'break'
  const fresh = newSentences(original, expanded)
  if (isContinuationCommentary(fresh)) return 'note'
  if (EXPAND_NOTE_MARKERS.some((marker) => marker.test(fresh))) return 'note'
  const before = sentenceCounts(original)
  const after = sentenceCounts(expanded)
  for (const [sentence, count] of after) {
    if (count >= 2 && (before.get(sentence) ?? 0) <= 1) return 'repeat'
  }
  return null
}

/** True only when the expansion is usable (see expansionRejection). */
export function acceptExpansion(original: string, expanded: string): boolean {
  return expansionRejection(original, expanded) === null
}

/**
 * The sentences of the expansion that the original does not have, one per line, outside quoted
 * dialogue. The expansion keeps the span's own sentences, so only the rest can be a note.
 */
function newSentences(original: string, expanded: string): string {
  const known = new Set(splitSentences(original).map((sentence) => sentence.text.trim()))
  // Blank out with spaces of the same length, so the offsets of the sentences stay valid.
  let masked = expanded.replace(QUOTED, (quote) => ' '.repeat(quote.length))
  for (const sentence of splitSentences(expanded)) {
    if (!known.has(sentence.text.trim())) continue
    masked =
      masked.slice(0, sentence.start) +
      ' '.repeat(sentence.end - sentence.start) +
      masked.slice(sentence.end)
  }
  return splitSentences(masked)
    .map((sentence) => sentence.text)
    .join('\n')
}

/** How many times each sentence of the text occurs, counting only sentences long enough to matter. */
function sentenceCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const sentence of splitSentences(text)) {
    const trimmed = sentence.text.trim()
    if (trimmed.length < REPEAT_MIN_CHARS) continue
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }
  return counts
}

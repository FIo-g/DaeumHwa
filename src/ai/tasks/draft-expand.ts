// Scene expansion (stage 1b): a first draft that is short is fixed by rewriting its short scenes
// longer in place. Each span is sent with the end of the span before it and the start of the span
// after it, so the rewrite joins both. The service in src/server/ai-features.ts calls it once per
// span and checks the answer with acceptExpansion before anything is spliced in.
// Streamed text, not a structured task: the answer is the expanded scene text itself.

import { neutralizeDeep } from '@/ai/prompt-utils'
import { renderCard, type DraftPromptInput } from '@/ai/tasks/draft-chapter'
import { splitSentences } from '@/lib/korean/sentences'
import { draftCharCount, isContinuationCommentary } from '@/lib/draft-length'
import { isBreakLine } from '@/lib/scene'

export const DRAFT_EXPAND_SYSTEM = `너는 웹소설 장면을 늘려 다시 쓰는 보조 작가다.
- <scene>의 사건, 인물, 장소, 순서, 대사의 뜻을 그대로 두고 새 사건을 더하지 않는다.
- 감각 묘사, 인물의 몸짓과 표정, 짧은 대사 주고받기, 장면 안의 머뭇거림을 더해 <length>의 분량까지 늘린다.
- 같은 문장, 같은 동작, 같은 묘사를 되풀이해 분량을 채우지 않는다.
- <before>의 끝에서 자연스럽게 이어지고 <after>의 시작으로 넘어가게 쓴다. <before>와 <after>는 다시 쓰지 않는다.
- 문체와 시점, 문단 길이는 <scene>을 따른다. 장면 구분선은 쓰지 않는다.
- <style_cards>가 있으면 그 말투와 규칙을 지킨다.
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
}

/**
 * The user message for one expansion: style cards, the text on each side, the span and its length
 * line. Every block is neutralized so that the text cannot close a tag early.
 */
export function buildExpandPrompt(raw: DraftExpandInput): string {
  const input = neutralizeDeep(raw)
  const cards =
    input.styleCards.length > 0 ? input.styleCards.map(renderCard).join('\n\n') : '(없음)'
  return [
    `<style_cards>\n${cards}\n</style_cards>`,
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
 * True only when the expansion is usable: at least 5% longer than the original span, no scene
 * break line, not a note to the author, and no sentence of 8 or more characters that appears twice
 * in the expansion while appearing at most once in the original.
 */
export function acceptExpansion(original: string, expanded: string): boolean {
  if (draftCharCount(expanded) < draftCharCount(original) * MIN_GROWTH) return false
  if (expanded.split('\n').some((line) => isBreakLine(line))) return false
  if (isContinuationCommentary(expanded)) return false
  const before = sentenceCounts(original)
  const after = sentenceCounts(expanded)
  for (const [sentence, count] of after) {
    if (count >= 2 && (before.get(sentence) ?? 0) <= 1) return false
  }
  return true
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

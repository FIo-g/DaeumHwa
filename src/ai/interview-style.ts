import { CORE_TOPICS } from '@/ai/tasks/interview-question'
import { isUndecidedAnswer } from '@/lib/interview-plan'
import { splitSentences } from '@/lib/korean/sentences'
import type { ProposalPayloadMap } from '@/lib/proposal-payloads'

// Style answers from the interview become one work-level style card. No AI call: the first
// sentence is the tone and the rest are rule lines, so nothing is paraphrased or invented.

/** The core topic name for the writing style. */
export const STYLE_TOPIC = '문체'

const NAME_CHARS = 40
const FALLBACK_NAME = '작품 문체'
const LIST_MARKER = /^[-*•·]\s+/

/** Writing-style phrasings that do not start with 문체, compacted. */
const STYLE_PHRASINGS = new Set([
  'writingstyle',
  'narrativestyle',
  'narrationstyle',
  'prosestyle',
  'styleandpov',
])

/** Lowercase, with whitespace, punctuation and symbols removed (same rule as the topic planner). */
function compactTopic(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

/**
 * True when an interview topic (in Korean or English) is the writing-style topic itself. Only
 * the core name, its aliases, a 문체 prefix and a short allow-list match. Other topics that
 * merely contain "style" or "문체" (e.g. "Combat style") are character topics and stay out.
 */
export function isStyleTopic(topic: string): boolean {
  const key = compactTopic(topic)
  const styleEntry = CORE_TOPICS.find((entry) => entry.name === STYLE_TOPIC)
  const exact = styleEntry
    ? [styleEntry.name, ...styleEntry.aliases].map(compactTopic)
    : [compactTopic(STYLE_TOPIC)]
  if (exact.includes(key)) return true
  if (key.startsWith(compactTopic(STYLE_TOPIC))) return true
  return STYLE_PHRASINGS.has(key)
}

/**
 * Builds the style card payload from a style answer, or null when no sentence is left.
 * Sentences without a letter and undecided sentences are dropped. The first sentence is the
 * tone; the rest become `- ` rule lines. The name is the topic, so nothing is translated.
 */
export function styleCardFromAnswer(
  topic: string,
  answer: string,
): ProposalPayloadMap['style_card'] | null {
  const sentences = splitSentences(answer)
    .map((sentence) => sentence.text.replace(LIST_MARKER, '').trim())
    .filter((text) => /\p{L}/u.test(text) && !isUndecidedAnswer(text))
  const [tone, ...rest] = sentences
  if (tone === undefined) return null

  const name = Array.from(topic.trim()).slice(0, NAME_CHARS).join('').trim()
  return {
    entryName: null,
    name: name === '' ? FALLBACK_NAME : name,
    tone,
    rules: rest.map((line) => `- ${line}`).join('\n'),
    examples: '',
  }
}

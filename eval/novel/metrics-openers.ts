import { stripJosa } from '@/lib/korean/josa'

// Paragraph opener metric (round 2, P8). Re-exported from metrics.ts. Measurement only: no
// threshold, no prompt and no product code reads it. Tokenizer rules follow repeatedWords
// (src/ai/guards/repeats.ts): letters and digits, lowercased, Hangul tokens lose their particle.

/** An opener is listed when it starts at least this many narration paragraphs. Provisional, not calibrated. */
export const OPENER_MIN_COUNT = 4
/** At most this many openers are listed in `top`. */
export const OPENER_TOP_LIMIT = 5

export type ParagraphOpeners = {
  counted: number // narration paragraphs that have an opener word
  repeated: number // paragraphs whose opener is listed (all listed openers, not only `top`)
  top: { word: string; count: number }[] // listed openers, count desc then word asc, cut to the limit
}

const TOKEN = /[\p{L}\p{N}]+/u
const HANGUL_ONLY = /^[가-힣]+$/

/** The opener of one paragraph, or null when it has no letter or digit. */
export function openerWord(paragraph: string): string | null {
  const match = TOKEN.exec(paragraph)
  if (!match) return null
  const word = match[0].toLowerCase()
  return HANGUL_ONLY.test(word) ? stripJosa(word) : word
}

/**
 * Counts the opener words of the given paragraphs. The caller passes narration paragraphs only;
 * the dialogue filter lives in metrics.ts so this file does not import it (no cycle).
 */
export function countParagraphOpeners(
  paragraphs: readonly string[],
  opts?: { minCount?: number; limit?: number },
): ParagraphOpeners {
  const minCount = opts?.minCount ?? OPENER_MIN_COUNT
  const limit = opts?.limit ?? OPENER_TOP_LIMIT
  const counts = new Map<string, number>()
  let counted = 0
  for (const paragraph of paragraphs) {
    const word = openerWord(paragraph)
    if (word === null) continue
    counted++
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const listed = [...counts]
    .filter(([, count]) => count >= minCount)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
  return {
    counted,
    repeated: listed.reduce((sum, item) => sum + item.count, 0),
    top: listed.slice(0, limit),
  }
}

import type { SpeechLevel } from '@/db/types'
import { QUOTED_LINE_RE, speechLevelOf } from '@/lib/directive-check'

// Speech-level words in a wiki entry's `fields.speech` (stage 3, task 8). Pure: no DB, no AI.
// `voiceLevelOf` reads which level the entry asks for; `quotedLines` and `markLines` prepare the
// draft for the `voice-fix` call.

const BANMAL_WORDS = ['반말'] as const
const JONDAET_WORDS = ['존댓말', '높임말', '합쇼체', '해요체'] as const

const NEGATIVE_RE = /없이|대신|말고|않/
const POSITIVE_VERB_RE = /^(?:을|를|로|만|도)?\s*(?:쓰|한다|말하|하)/

type LevelWord = { word: string; level: SpeechLevel }

/** Every level word with the level it asks for. */
function levelWords(): LevelWord[] {
  return [
    ...BANMAL_WORDS.map((word) => ({ word, level: 'banmal' as SpeechLevel })),
    ...JONDAET_WORDS.map((word) => ({ word, level: 'jondaet' as SpeechLevel })),
  ]
}

/** Occurrences of `word` in `text`, as the end offset of each match. */
function occurrences(text: string, word: string): number[] {
  const ends: number[] = []
  let from = 0
  for (;;) {
    const index = text.indexOf(word, from)
    if (index === -1) break
    ends.push(index + word.length)
    from = index + word.length
  }
  return ends
}

/**
 * The speech level a wiki `speech` field asks for, or null when it asks for none.
 * A word is positive when an optional particle and then `쓰`, `한다`, `하` or `말하` follows
 * it; a word is negative when `없이`, `대신`, `말고` or `않` follows it within 4 characters.
 * The result is the level of the only positive word; with no positive word, the level of the
 * only non-negative word that appears. Both levels positive, or nothing usable, reads as null.
 */
export function voiceLevelOf(speech: string): SpeechLevel | null {
  const positive = new Set<SpeechLevel>()
  const present = new Set<SpeechLevel>()
  for (const { word, level } of levelWords()) {
    for (const end of occurrences(speech, word)) {
      const tail = speech.slice(end, end + 4)
      const negative = NEGATIVE_RE.test(tail)
      if (negative) continue
      present.add(level)
      const rest = speech.slice(end)
      if (POSITIVE_VERB_RE.test(rest)) positive.add(level)
    }
  }
  if (positive.size === 1) {
    const [only] = positive
    return only ?? null
  }
  if (positive.size > 1) return null
  if (present.size === 1) {
    const [only] = present
    return only ?? null
  }
  return null
}

/** One quoted line with its offsets and its speech level. `id` counts from 1. */
export type QuotedLine = {
  id: number
  start: number
  end: number
  quote: string
  level: SpeechLevel | null
}

/**
 * Every quoted line by stage 2's `QUOTED_LINE_RE`, in text order. The pattern is reused from
 * `directive-check` so the code and the fix see the same lines.
 */
export function quotedLines(text: string): QuotedLine[] {
  const pattern = new RegExp(QUOTED_LINE_RE.source, 'g')
  const lines: QuotedLine[] = []
  let id = 0
  for (const match of text.matchAll(pattern)) {
    const quote = match[0]
    const start = match.index ?? 0
    id += 1
    lines.push({ id, start, end: start + quote.length, quote, level: speechLevelOf(quote) })
  }
  return lines
}

/** The text with `⟦N⟧` right before each quoted line, so the model can name the lines it fixes. */
export function markLines(text: string, lines: QuotedLine[]): string {
  const ordered = [...lines].sort((a, b) => b.start - a.start)
  let out = text
  for (const line of ordered) {
    out = `${out.slice(0, line.start)}⟦${line.id}⟧${out.slice(line.start)}`
  }
  return out
}

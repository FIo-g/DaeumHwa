export type Sentence = { text: string; start: number; end: number }

const TERMINATORS = '.!?…'
const CLOSERS = '"\'”’」』)'

/**
 * Splits text into sentences at terminator runs (with any closing quotes or brackets)
 * and at line breaks. `start` and `end` cover the trimmed sentence text.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = []
  const pushSegment = (rawStart: number, rawEnd: number) => {
    let start = rawStart
    while (start < rawEnd && /\s/.test(text.charAt(start))) start++
    let end = rawEnd
    while (end > start && /\s/.test(text.charAt(end - 1))) end--
    if (end > start) sentences.push({ text: text.slice(start, end), start, end })
  }

  let segmentStart = 0
  let i = 0
  while (i < text.length) {
    const ch = text.charAt(i)
    if (ch === '\n' || ch === '\r') {
      pushSegment(segmentStart, i)
      i++
      segmentStart = i
    } else if (TERMINATORS.includes(ch)) {
      let j = i + 1
      while (j < text.length && TERMINATORS.includes(text.charAt(j))) j++
      while (j < text.length && CLOSERS.includes(text.charAt(j))) j++
      pushSegment(segmentStart, j)
      segmentStart = j
      i = j
    } else {
      i++
    }
  }
  pushSegment(segmentStart, text.length)
  return sentences
}

/** The sentence containing `index`, or the nearest one before it. */
export function sentenceAt(text: string, index: number): Sentence {
  return sentenceIn(splitSentences(text), index)
}

/** `sentenceAt` over an already split list. */
export function sentenceIn(sentences: Sentence[], index: number): Sentence {
  if (sentences.length === 0) return { text: '', start: 0, end: 0 }
  let found = sentences[0]
  for (const s of sentences) {
    if (s.start > index) break
    found = s
  }
  return found
}

/**
 * Finds a quote in text. Tries an exact match (nearest to `hint` when given), then a match
 * where runs of whitespace are treated as one space. Returns original-text offsets.
 */
export function locateQuote(
  text: string,
  quote: string,
  hint?: number,
): { start: number; end: number } | null {
  if (quote === '') return null

  const exact: number[] = []
  for (let idx = text.indexOf(quote); idx !== -1; idx = text.indexOf(quote, idx + 1)) {
    exact.push(idx)
  }
  if (exact.length > 0) {
    const start =
      hint === undefined
        ? exact[0]
        : exact.reduce((best, idx) => (Math.abs(idx - hint) < Math.abs(best - hint) ? idx : best))
    return { start, end: start + quote.length }
  }

  const { norm, map } = collapseWhitespace(text)
  const normQuote = quote.trim().replace(/\s+/g, ' ')
  const normStart = normQuote === '' ? -1 : norm.indexOf(normQuote)
  if (normStart === -1) return null
  const normEnd = normStart + normQuote.length
  return { start: map[normStart], end: map[normEnd - 1] + 1 }
}

/**
 * Every exact, non-overlapping occurrence of `quote` in text, in text order, at most `limit`.
 * Returns original-text offsets. Whitespace-normalized matches are left to `locateQuote`.
 */
export function locateAllQuotes(
  text: string,
  quote: string,
  limit = 20,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  if (quote === '') return ranges
  for (
    let idx = text.indexOf(quote);
    idx !== -1 && ranges.length < limit;
    idx = text.indexOf(quote, idx + quote.length)
  ) {
    ranges.push({ start: idx, end: idx + quote.length })
  }
  return ranges
}

/** Collapses whitespace runs to one space, remembering each output char's original index. */
function collapseWhitespace(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  let i = 0
  while (i < text.length) {
    if (/\s/.test(text.charAt(i))) {
      map.push(i)
      norm += ' '
      while (i < text.length && /\s/.test(text.charAt(i))) i++
    } else {
      map.push(i)
      norm += text.charAt(i)
      i++
    }
  }
  return { norm, map }
}

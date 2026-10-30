import { diffTextsBounded } from '@/lib/diff'

// One author edit between the AI draft text and the saved chapter body, with one sentence of
// context on each side. Produced by editHunks and sent to the directive-infer task.
export type EditHunk = { before: string; after: string }

/** Time budget of the word diff, shared with the stage 0 edit-ratio check. */
const DIFF_BUDGET_MS = 100

const QUOTE_RE = /'[^']+'|"[^"]+"|‘[^’]+’|“[^”]+”|「[^」]+」/

const VAGUE_KO = [
  '간결하게',
  '자연스럽게',
  '더 재미있게',
  '생생하게',
  '깔끔하게',
  '좋게',
  '몰입감',
  '매끄럽게',
]

const VAGUE_KO_WORD = /(^|\s)잘(\s|$)/

const VAGUE_EN = ['concise', 'natural', 'more fun', 'vivid', 'smoother', 'better', 'engaging']

/**
 * True when the request text is vague: it has no quoted span, names no known character, has no
 * digit, and contains a vague adverb. Quoted, named or counted requests stay concrete.
 */
export function isVagueRequest(text: string, names: string[]): boolean {
  if (QUOTE_RE.test(text)) return false
  if (names.some((name) => name !== '' && text.includes(name))) return false
  if (/\d/.test(text)) return false
  const lower = text.toLowerCase()
  return (
    VAGUE_KO.some((word) => text.includes(word)) ||
    VAGUE_KO_WORD.test(text) ||
    VAGUE_EN.some((word) => lower.includes(word))
  )
}

type Token = { text: string; type: 'equal' | 'insert' | 'delete' }

/** Splits a diff part value the same way the word diff tokenizes, keeping whitespace runs. */
function splitTokens(value: string): string[] {
  return value.split(/(\s+)/).filter((token) => token.length > 0)
}

function isWord(token: string): boolean {
  return /\S/.test(token)
}

/** Sentence ranges of `text`, enders kept. Splits on . ! ? … and newlines. */
function sentenceRanges(text: string): [number, number][] {
  const ranges: [number, number][] = []
  const re = /[^.!?…\n]+[.!?…\n]?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[0].trim() !== '') ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

/** The slice covering `start..end` plus one neighbour sentence on each side, trimmed. */
function withContext(text: string, start: number, end: number): { slice: string; offset: number } {
  const ranges = sentenceRanges(text)
  if (ranges.length === 0) return { slice: text.trim(), offset: 0 }
  let first = ranges.length - 1
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i][1] > start) {
      first = i
      break
    }
  }
  let last = 0
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (ranges[i][0] < end) {
      last = i
      break
    }
  }
  const from = ranges[Math.max(0, first - 1)][0]
  const to = ranges[Math.min(ranges.length - 1, last + 1)][1]
  return { slice: text.slice(from, to).trim(), offset: from }
}

/** Cuts `slice` to `side` code points, centred on the change. */
function cutToSide(slice: string, changeStart: number, changeEnd: number, side: number): string {
  const chars = Array.from(slice)
  if (chars.length <= side) return slice
  const middle = Math.floor((changeStart + changeEnd) / 2)
  let start = Math.max(0, middle - Math.floor(side / 2))
  let end = start + side
  if (end > chars.length) {
    end = chars.length
    start = end - side
  }
  return chars.slice(start, end).join('')
}

/** Letters and digits only, so a comma or spacing fix compares equal. */
function lettersOnly(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Word hunks between the AI text and the saved text. Adjacent removals and insertions with at
 * most two unchanged words between them form one hunk. Each side covers the changed sentences
 * plus one sentence of context, cut to `side` characters. Whitespace-only hunks and hunks that
 * only change punctuation are dropped. The `max` hunks with the most changed characters are
 * kept, in text order. A diff that exceeds its time budget gives [].
 */
export function editHunks(
  ai: string,
  saved: string,
  o: { max?: number; side?: number } = {},
): EditHunk[] {
  const max = o.max ?? 12
  const side = o.side ?? 300
  const parts = diffTextsBounded(ai, saved, 'words', { timeoutMs: DIFF_BUDGET_MS })
  if (parts === null) return []

  const tokens: Token[] = []
  for (const part of parts) {
    for (const text of splitTokens(part.value)) tokens.push({ text, type: part.type })
  }

  const changed = tokens.map((token, i) => (token.type === 'equal' ? -1 : i)).filter((i) => i >= 0)
  if (changed.length === 0) return []

  // Cluster changed tokens: a gap of more than two unchanged words starts a new hunk.
  const clusters: [number, number][] = []
  let start = changed[0]
  for (let k = 1; k <= changed.length; k++) {
    const prev = changed[k - 1]
    const next = changed[k]
    if (next === undefined) {
      clusters.push([start, prev])
      break
    }
    let gapWords = 0
    for (let i = prev + 1; i < next; i++) {
      if (tokens[i].type === 'equal' && isWord(tokens[i].text)) gapWords++
    }
    if (gapWords > 2) {
      clusters.push([start, prev])
      start = next
    }
  }

  type Hunk = { before: string; after: string; size: number; order: number }
  const hunks: Hunk[] = []
  clusters.forEach(([from, to], order) => {
    let deleted = ''
    let inserted = ''
    let aiStart = -1
    let aiEnd = -1
    let savedStart = -1
    let savedEnd = -1
    let aiOff = 0
    let savedOff = 0
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const inCluster = i >= from && i <= to
      if (token.type === 'equal') {
        if (inCluster) {
          if (aiStart < 0) aiStart = aiOff
          aiEnd = aiOff + token.text.length
          if (savedStart < 0) savedStart = savedOff
          savedEnd = savedOff + token.text.length
        }
        aiOff += token.text.length
        savedOff += token.text.length
      } else if (token.type === 'delete') {
        if (inCluster) {
          deleted += token.text
          if (aiStart < 0) aiStart = aiOff
          aiEnd = aiOff + token.text.length
        }
        aiOff += token.text.length
      } else {
        if (inCluster) {
          inserted += token.text
          if (savedStart < 0) savedStart = savedOff
          savedEnd = savedOff + token.text.length
        }
        savedOff += token.text.length
      }
    }
    if (deleted.trim() === '' && inserted.trim() === '') return
    if (lettersOnly(deleted) === lettersOnly(inserted)) return
    if (aiStart < 0 || savedStart < 0) return
    const beforeCtx = withContext(ai, aiStart, aiEnd)
    const afterCtx = withContext(saved, savedStart, savedEnd)
    const before = cutToSide(
      beforeCtx.slice,
      aiStart - beforeCtx.offset,
      aiEnd - beforeCtx.offset,
      side,
    )
    const after = cutToSide(
      afterCtx.slice,
      savedStart - afterCtx.offset,
      savedEnd - afterCtx.offset,
      side,
    )
    const size = Array.from(deleted).length + Array.from(inserted).length
    hunks.push({ before, after, size, order })
  })

  return hunks
    .sort((a, b) => b.size - a.size)
    .slice(0, max)
    .sort((a, b) => a.order - b.order)
    .map(({ before, after }) => ({ before, after }))
}

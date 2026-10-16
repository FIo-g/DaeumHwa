export type SplitChapter = { title: string; body: string; startLine: number }

export type SplitMethod = 'headings' | 'separators' | 'size' | 'single'

const MAX_HEADING_LENGTH = 40
const PREAMBLE_MIN_CHARS = 200
const DEFAULT_FALLBACK_CHARS = 5500

// Each pattern must match the whole trimmed line prefix; the lookahead keeps prose such as
// "1화는 재미있었다" from becoming a heading.
const NUMBERED_HEADING = /^[<[【]?\s*(?:제\s*)?\d{1,4}\s*화\s*[>\]】]?(?=$|\s|[.:\-–—])/
const EPISODE_HEADING = /^(?:episode|ep\.?|chapter)\s*\d{1,4}(?=$|\s|[.:\-–—])/i
const KEYWORD_HEADING =
  /^[<[【]?\s*(?:프롤로그|에필로그|외전|번외)\s*\d{0,3}\s*[>\]】]?(?=$|\s|[.:\-–—])/
const MARKDOWN_HEADING = /^#{1,6}\s+\S/
const SEPARATOR = /^(?:\*\s*\*\s*\*|＊＊＊|---)$/

/** Returns the chapter title when the line is a chapter heading, otherwise null. */
export function detectHeading(line: string): string | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) return null

  if (MARKDOWN_HEADING.test(trimmed)) {
    return trimmed.replace(/^#{1,6}\s*/, '')
  }
  if (
    NUMBERED_HEADING.test(trimmed) ||
    EPISODE_HEADING.test(trimmed) ||
    KEYWORD_HEADING.test(trimmed)
  ) {
    return trimmed
  }
  return null
}

/**
 * Splits a manuscript into chapters: chapter heading lines first, then separator lines,
 * then paragraph-bounded chunks of about `fallbackChars` characters.
 */
export function splitChapters(
  text: string,
  options: { fallbackChars?: number } = {},
): { chapters: SplitChapter[]; method: SplitMethod } {
  if (text.trim().length === 0) return { chapters: [], method: 'single' }

  const lines = text.split('\n')
  const headingIndexes: number[] = []
  const headingTitles: string[] = []
  lines.forEach((line, index) => {
    const title = detectHeading(line)
    if (title !== null) {
      headingIndexes.push(index)
      headingTitles.push(title)
    }
  })

  if (headingIndexes.length > 0) {
    return { chapters: splitByHeadings(lines, headingIndexes, headingTitles), method: 'headings' }
  }

  const separatorIndexes = lines.flatMap((line, index) =>
    SEPARATOR.test(line.trim()) ? [index] : [],
  )
  if (separatorIndexes.length > 0) {
    return { chapters: splitBySeparators(lines, separatorIndexes), method: 'separators' }
  }

  const fallbackChars = options.fallbackChars ?? DEFAULT_FALLBACK_CHARS
  const chunks = splitBySize(lines, fallbackChars)
  return {
    chapters: chunks.map((chunk, i) => ({
      title: `${i + 1}화`,
      body: chunk.body,
      startLine: chunk.startLine,
    })),
    method: chunks.length > 1 ? 'size' : 'single',
  }
}

function splitByHeadings(
  lines: string[],
  headingIndexes: number[],
  titles: string[],
): SplitChapter[] {
  const chapters: SplitChapter[] = []

  const preamble = lines.slice(0, headingIndexes[0]).join('\n').trim()
  if (countNonSpace(preamble) >= PREAMBLE_MIN_CHARS) {
    chapters.push({ title: '머리말', body: preamble, startLine: 0 })
  }

  headingIndexes.forEach((start, i) => {
    const end = i + 1 < headingIndexes.length ? headingIndexes[i + 1] : lines.length
    chapters.push({
      title: titles[i],
      body: lines
        .slice(start + 1, end)
        .join('\n')
        .trim(),
      startLine: start,
    })
  })
  return chapters
}

function splitBySeparators(lines: string[], separatorIndexes: number[]): SplitChapter[] {
  const bounds = [-1, ...separatorIndexes, lines.length]
  const chapters: SplitChapter[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i] + 1
    const body = lines
      .slice(from, bounds[i + 1])
      .join('\n')
      .trim()
    if (body.length === 0) continue
    chapters.push({ title: `${chapters.length + 1}화`, body, startLine: from })
  }
  return chapters
}

/**
 * Greedy packing of whole lines up to `limit` characters per chunk (lines joined with `\n`).
 * A single line longer than the limit is cut hard into limit-sized pieces.
 */
function splitBySize(lines: string[], limit: number): { body: string; startLine: number }[] {
  const chunks: { body: string; startLine: number }[] = []
  let parts: string[] = []
  let length = 0
  let startLine = 0

  const flush = () => {
    const body = parts.join('\n').trim()
    if (body.length > 0) chunks.push({ body, startLine })
    parts = []
    length = 0
  }

  lines.forEach((line, index) => {
    if (line.length > limit) {
      flush()
      for (let offset = 0; offset < line.length; offset += limit) {
        const piece = line.slice(offset, offset + limit).trim()
        if (piece.length > 0) chunks.push({ body: piece, startLine: index })
      }
      return
    }
    const joinedLength = parts.length === 0 ? line.length : length + 1 + line.length
    if (parts.length > 0 && joinedLength > limit) flush()
    if (parts.length === 0) {
      startLine = index
      length = line.length
    } else {
      length += 1 + line.length
    }
    parts.push(line)
  })
  flush()
  return chunks
}

function countNonSpace(text: string): number {
  return text.replace(/\s/g, '').length
}

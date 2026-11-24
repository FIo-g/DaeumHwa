export type TitleCell = { glyph: string; index: number }

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko') : null
const space = /^\s+$/u

export function titleCells(text: string): TitleCell[] {
  const letters = graphemes
    ? Array.from(graphemes.segment(text), ({ segment }) => segment)
    : Array.from(text)
  return letters.map((glyph, index) => ({ glyph: space.test(glyph) ? '' : glyph, index }))
}

type Part = { start: number; end: number; word: number }
type Layout = { lines: number; cost: number; start: number }

function titleParts(cells: TitleCell[], columns: number): Part[] {
  const parts: Part[] = []
  let word = 0
  for (let start = 0; start < cells.length;) {
    if (!cells[start].glyph) {
      start++
      continue
    }
    let end = start + 1
    while (end < cells.length && cells[end].glyph) end++
    for (let offset = start; offset < end; offset += columns) {
      parts.push({ start: offset, end: Math.min(end, offset + columns), word })
    }
    word++
    start = end
  }
  return parts
}

function bestLayout(parts: Part[], width: number, keepFinalWords: boolean) {
  const best: (Layout | undefined)[] = [{ lines: 0, cost: 0, start: 0 }]
  for (let end = 1; end <= parts.length; end++) {
    let next: Layout | undefined
    for (let start = end - 1; start >= 0; start--) {
      const length = parts[end - 1].end - parts[start].start
      if (length > width) break
      if (keepFinalWords && end === parts.length && parts[start].word === parts[end - 1].word)
        continue
      const previous = best[start]
      if (!previous) continue
      const lines = previous.lines + 1
      const cost = previous.cost + length * length
      if (!next || lines < next.lines || (lines === next.lines && cost < next.cost))
        next = { lines, cost, start }
    }
    best[end] = next
  }
  return best
}

/** Keep the fewest rows, then the fewest cells on the longest row.
 * Among equally short layouts, prefer a final row with two words and even row lengths.
 */
export function titleRows(cells: TitleCell[], columns: number): TitleCell[][] {
  const parts = titleParts(cells, columns)
  if (!parts.length) return []

  const end = parts.length
  const lineCount = bestLayout(parts, columns, false)[end]!.lines
  // Only relax the final-word rule if it would add a row or exceed the available width.
  const keepFinalWords = lineCount > 1 && bestLayout(parts, columns, true)[end]?.lines === lineCount
  let low = 1
  let high = columns
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (bestLayout(parts, mid, keepFinalWords)[end]?.lines === lineCount) high = mid
    else low = mid + 1
  }

  const layout = bestLayout(parts, low, keepFinalWords)
  const rows: TitleCell[][] = []
  for (let cursor = end; cursor > 0;) {
    const { start } = layout[cursor]!
    rows.push(cells.slice(parts[start].start, parts[cursor - 1].end))
    cursor = start
  }
  return rows.reverse()
}

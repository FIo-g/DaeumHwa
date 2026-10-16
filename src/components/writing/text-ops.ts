import type { Highlight, HighlightKind } from './types'

// Pure text helpers used by the workspace API. Offsets are UTF-16 indices into the body,
// the same indices the editor's selection and the highlight ranges use.

/** Replaces the half-open range [start, end) with `replacement`. */
export function replaceRangeText(
  text: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return text.slice(0, start) + replacement + text.slice(end)
}

/**
 * Replaces one occurrence of `quote`. When `hintStart` points at the quote, that occurrence is
 * used; otherwise the first one. Returns null when the quote is empty or not found.
 */
export function replaceQuoteText(
  text: string,
  quote: string,
  replacement: string,
  hintStart?: number,
): string | null {
  if (quote.length === 0) return null
  let index = -1
  if (hintStart !== undefined && text.startsWith(quote, hintStart)) index = hintStart
  else index = text.indexOf(quote)
  if (index < 0) return null
  return replaceRangeText(text, index, index + quote.length, replacement)
}

export type LayerSegment = {
  text: string
  id?: string
  kind?: HighlightKind
  active?: boolean
}

/**
 * Splits the text into segments for the highlight layer. Where highlights overlap, the one
 * listed first wins. Adjacent segments with the same highlight are merged. Empty or
 * out-of-range highlights are ignored.
 */
export function segmentText(text: string, highlights: Highlight[]): LayerSegment[] {
  const valid = highlights
    .map((h) => ({ ...h, start: Math.max(0, h.start), end: Math.min(text.length, h.end) }))
    .filter((h) => h.start < h.end)

  const cuts = new Set<number>([0, text.length])
  for (const h of valid) {
    cuts.add(h.start)
    cuts.add(h.end)
  }
  const points = [...cuts].sort((a, b) => a - b)

  const out: LayerSegment[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]
    const to = points[i + 1]
    const piece = text.slice(from, to)
    if (piece.length === 0) continue
    const owner = valid.find((h) => h.start <= from && to <= h.end)
    const next: LayerSegment = owner
      ? { text: piece, id: owner.id, kind: owner.kind, active: owner.active ?? false }
      : { text: piece }

    const last = out.at(-1)
    if (last && last.id === next.id && last.kind === next.kind) {
      last.text += next.text
    } else {
      out.push(next)
    }
  }
  return out
}

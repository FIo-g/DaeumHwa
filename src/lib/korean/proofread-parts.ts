// Splits a manuscript into contiguous parts for proofreading (track F1). Pure functions only.

export type ProofreadPart = { start: number; end: number; text: string }

export const PROOFREAD_MAX_PARTS = 3
export const PROOFREAD_MIN_PART_CHARS = 1500

/** Characters that end a sentence or a quoted/bracketed span. */
const SENTENCE_END = '.!?…"\'”’」』)'

/** Cut right after a blank line. */
const isBlankLineCut = (text: string, p: number): boolean =>
  /\n[ \t\r]*\n$/.test(text.slice(Math.max(0, p - 20), p))

/** Cut right after a single newline. */
const isNewlineCut = (text: string, p: number): boolean => text[p - 1] === '\n'

/** Cut right after a sentence end. */
const isSentenceCut = (text: string, p: number): boolean =>
  SENTENCE_END.includes(text[p - 1]) && !SENTENCE_END.includes(text[p])

const isHighSurrogate = (ch: string | undefined): boolean =>
  ch !== undefined && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdbff

const isLowSurrogate = (ch: string | undefined): boolean =>
  ch !== undefined && ch.charCodeAt(0) >= 0xdc00 && ch.charCodeAt(0) <= 0xdfff

/**
 * Picks a cut index in [lo, hi]. Boundaries are tried in tiers (blank line, newline, sentence end);
 * the first tier with a candidate wins, and inside it the candidate nearest to `target`.
 * With no candidate the cut is hard, moved off a surrogate pair when needed.
 */
function chooseCut(text: string, target: number, lo: number, hi: number): number {
  if (lo > hi) return hi
  for (const isCut of [isBlankLineCut, isNewlineCut, isSentenceCut]) {
    let best = -1
    for (let p = lo; p <= hi; p++) {
      if (!isCut(text, p)) continue
      if (best < 0 || Math.abs(p - target) < Math.abs(best - target)) best = p
    }
    if (best >= 0) return best
  }
  let p = Math.min(hi, Math.max(lo, target))
  if (isHighSurrogate(text[p - 1]) && isLowSurrogate(text[p])) {
    // Prefer the pair's end; step back instead when that is past the window.
    p = p + 1 <= hi ? p + 1 : p - 1
  }
  return p
}

/**
 * Splits `text` into up to `maxParts` contiguous parts of at least about `minPartChars` each.
 * Texts shorter than two minimum parts stay whole. Joining the part texts gives `text` back.
 */
export function splitProofreadParts(
  text: string,
  maxParts: number = PROOFREAD_MAX_PARTS,
  minPartChars: number = PROOFREAD_MIN_PART_CHARS,
): ProofreadPart[] {
  const count = Math.min(maxParts, Math.max(1, Math.floor(text.length / minPartChars)))
  const cuts: number[] = []
  let prevCut = 0
  for (let i = 1; i < count; i++) {
    const target = Math.round((text.length * i) / count)
    const window = Math.floor(text.length / count / 3)
    const lo = Math.max(prevCut + 1, target - window)
    const hi = Math.min(text.length - 1, target + window)
    const p = chooseCut(text, target, lo, hi)
    if (p <= prevCut || p < 1 || p > text.length - 1) continue
    cuts.push(p)
    prevCut = p
  }
  const bounds = [0, ...cuts, text.length]
  return bounds.slice(0, -1).map((start, k) => {
    const end = bounds[k + 1]
    return { start, end, text: text.slice(start, end) }
  })
}

/**
 * Concatenates suggestion groups in part order. A later item with the same quote and replacement
 * as an earlier one is dropped, so the whole-text quote expansion does not repeat it.
 */
export function mergeSuggestionGroups<S extends { quote: string; replacement: string }>(
  groups: S[][],
): S[] {
  const seen = new Set<string>()
  const merged: S[] = []
  for (const group of groups) {
    for (const item of group) {
      const key = JSON.stringify([item.quote, item.replacement])
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
  }
  return merged
}

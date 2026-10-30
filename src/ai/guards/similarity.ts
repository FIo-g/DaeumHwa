// Internal comparison helpers shared by sample-copy.ts and fact-similarity.ts. Not exported from
// the barrel. Offsets never leave these helpers; they only score strings.

/** NFC, lowercase, and without whitespace, punctuation and symbols. */
export function normalizeForCompare(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

/** Code point n-grams of an already normalized string, as a multiset of counts. */
function gramCounts(s: string, n: number): Map<string, number> {
  const chars = [...s]
  const counts = new Map<string, number>()
  for (let i = 0; i + n <= chars.length; i++) {
    const gram = chars.slice(i, i + n).join('')
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

function countTotal(counts: Map<string, number>): number {
  let total = 0
  for (const value of counts.values()) total += value
  return total
}

/** Dice coefficient over character bigram multisets, on normalized strings. */
export function bigramDice(a: string, b: string): number {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  const countsA = gramCounts(na, 2)
  const countsB = gramCounts(nb, 2)
  const totalA = countTotal(countsA)
  const totalB = countTotal(countsB)
  if (totalA + totalB === 0) return 0

  let shared = 0
  for (const [gram, count] of countsA) {
    shared += Math.min(count, countsB.get(gram) ?? 0)
  }
  return (2 * shared) / (totalA + totalB)
}

/**
 * Share of the example's distinct n-grams that also occur in the draft, on normalized strings.
 * Asymmetric on purpose: an example sentence embedded in a longer draft sentence scores high
 * here even when Dice drops. Returns 0 when the example has no n-gram.
 */
export function gramContainment(example: string, draft: string, n = 3): number {
  const exampleGrams = new Set(gramCounts(normalizeForCompare(example), n).keys())
  if (exampleGrams.size === 0) return 0
  const draftGrams = new Set(gramCounts(normalizeForCompare(draft), n).keys())

  let found = 0
  for (const gram of exampleGrams) {
    if (draftGrams.has(gram)) found++
  }
  return found / exampleGrams.size
}

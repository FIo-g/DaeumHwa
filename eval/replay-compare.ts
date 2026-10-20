import type { Extraction } from '@/ai/extraction'
import { bigramDice, normalizeForCompare } from '@/ai/guards/similarity'

// Pure comparison of two chapter-extract outputs (replay-calls). No I/O.
// Two items match when their text is similar enough; each item matches at most once.

const MATCH_DICE = 0.6

export type ExtractionCompare = {
  refFacts: number
  facts: number
  matchedFacts: number
  refThreads: number
  threads: number
  matchedThreads: number
}

/**
 * Greedy one-to-one matching, best score first. `score` returns null when the pair cannot match.
 * Each reference item and each output item is used at most once.
 */
function countMatches<A, B>(refs: A[], outs: B[], score: (a: A, b: B) => number | null): number {
  const pairs: { ref: number; out: number; score: number }[] = []
  refs.forEach((a, ref) => {
    outs.forEach((b, out) => {
      const s = score(a, b)
      if (s !== null) pairs.push({ ref, out, score: s })
    })
  })
  pairs.sort((x, y) => y.score - x.score || x.ref - y.ref || x.out - y.out)

  const usedRefs = new Set<number>()
  const usedOuts = new Set<number>()
  let matched = 0
  for (const pair of pairs) {
    if (usedRefs.has(pair.ref) || usedOuts.has(pair.out)) continue
    usedRefs.add(pair.ref)
    usedOuts.add(pair.out)
    matched++
  }
  return matched
}

/** Similarity of two texts, or null when it is below the match threshold. */
function textScore(a: string, b: string): number | null {
  const score = bigramDice(normalizeForCompare(a), normalizeForCompare(b))
  return score >= MATCH_DICE ? score : null
}

/** Facts match on the same subject and similar content; threads match on similar title. */
export function compareExtraction(ref: Extraction, out: Extraction): ExtractionCompare {
  const matchedFacts = countMatches(ref.facts, out.facts, (a, b) =>
    normalizeForCompare(a.subjectName) === normalizeForCompare(b.subjectName)
      ? textScore(a.content, b.content)
      : null,
  )
  const matchedThreads = countMatches(ref.threads, out.threads, (a, b) =>
    textScore(a.title, b.title),
  )
  return {
    refFacts: ref.facts.length,
    facts: out.facts.length,
    matchedFacts,
    refThreads: ref.threads.length,
    threads: out.threads.length,
    matchedThreads,
  }
}

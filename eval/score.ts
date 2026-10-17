import type { IssueKind } from '@/db/types'

// Scoring for the continuity accuracy eval (spec §12). Pure functions, no I/O.

/** An error planted in the fixture manuscript. */
export type ExpectedIssue = { chapter: number; quoteIncludes: string; kind: IssueKind }

/** An issue the continuity check reported for a chapter. */
export type FoundIssue = { chapter: number; quote: string; kind: IssueKind }

export type IssueScore = {
  hits: number
  misses: ExpectedIssue[]
  falsePositives: FoundIssue[]
  /** hits / found. 0 when nothing was found. */
  precision: number
  /** hits / expected. 1 when nothing was expected. */
  recall: number
}

/**
 * A found issue hits an expected one when both are in the same chapter and the found quote
 * contains the expected fragment, or the expected fragment contains the found quote. Kind is not
 * compared: the eval measures whether the right sentence was flagged.
 */
export function isHit(expected: ExpectedIssue, found: FoundIssue): boolean {
  if (expected.chapter !== found.chapter) return false
  if (expected.quoteIncludes === '' || found.quote === '') return false
  return (
    found.quote.includes(expected.quoteIncludes) || expected.quoteIncludes.includes(found.quote)
  )
}

/**
 * Scores found issues against the answer key. Matching is one-to-one and maximal (augmenting
 * paths), so a found issue that fits two expected issues cannot hide a hit for another one.
 */
export function scoreIssues(expected: ExpectedIssue[], found: FoundIssue[]): IssueScore {
  // expectedOwner[j] = index of the found issue matched to expected j, or -1.
  const expectedOwner: number[] = expected.map(() => -1)
  const foundMatch: number[] = found.map(() => -1)

  const tryAssign = (fi: number, seen: boolean[]): boolean => {
    for (let ei = 0; ei < expected.length; ei++) {
      if (seen[ei] || !isHit(expected[ei], found[fi])) continue
      seen[ei] = true
      const owner = expectedOwner[ei]
      if (owner === -1 || tryAssign(owner, seen)) {
        expectedOwner[ei] = fi
        foundMatch[fi] = ei
        return true
      }
    }
    return false
  }

  for (let fi = 0; fi < found.length; fi++) {
    tryAssign(
      fi,
      expected.map(() => false),
    )
  }

  const hits = foundMatch.filter((ei) => ei !== -1).length
  return {
    hits,
    misses: expected.filter((_, ei) => expectedOwner[ei] === -1),
    falsePositives: found.filter((_, fi) => foundMatch[fi] === -1),
    precision: found.length === 0 ? 0 : hits / found.length,
    recall: expected.length === 0 ? 1 : hits / expected.length,
  }
}

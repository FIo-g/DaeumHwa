import { bigramDice, normalizeForCompare } from './similarity'

/** Bigram Dice at or above which two fact sentences count as the same fact (spec section 8). */
export const FACT_DUPLICATE_DICE = 0.8

/**
 * True when two fact sentences are probably the same fact re-proposed. One pair per call.
 *
 * Known limits, each pinned by a test in fact-similarity.test.ts:
 * - Antonyms inside long sentences keep a high Dice (왼손잡이/오른손잡이 in a longer sentence is
 *   about 0.83) and are reported as duplicates. Short antonym pairs stay apart.
 * - No number or synonym normalization: `19` and `nineteen` score about 0.58, so they are not
 *   duplicates. Korean number words such as 열아홉 are not compared with digits.
 * - The digit rule is the only conflict check: a different number always means a different fact.
 */
export function isNearDuplicateFact(a: string, b: string): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (na === '' || nb === '') return false
  if (na === nb) return true

  const digitsA = (a.match(/\d+/g) ?? []).sort()
  const digitsB = (b.match(/\d+/g) ?? []).sort()
  if (digitsA.join(' ') !== digitsB.join(' ')) return false

  if ([...na].length < 2 || [...nb].length < 2) return false
  return bigramDice(a, b) >= FACT_DUPLICATE_DICE
}

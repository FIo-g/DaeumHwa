import { stripJosa } from '@/lib/korean/josa'
import { bigramDice, normalizeForCompare } from './similarity'

/** Bigram Dice at or above which two fact sentences count as the same fact (spec section 8). */
export const FACT_DUPLICATE_DICE = 0.8

/**
 * True when two fact sentences are probably the same fact re-proposed. One pair per call.
 *
 * Known limits, each pinned by a test in fact-similarity.test.ts:
 * - Korean sentences must also agree on their content words: after Dice, the Hangul words (particles
 *   stripped) of one sentence must all occur in the other. One changed word (좋다/나쁘다,
 *   북쪽/남쪽, a negation) keeps the pair apart even when Dice is above 0.8. Words that only one
 *   side adds, or a word with a short ending added (떨린다 / 떨린다고 한다), still count as a
 *   rewording.
 * - English antonyms inside long sentences keep a high Dice (left-/right-handed and calm is
 *   about 0.83) and are reported as duplicates; the word check covers Hangul words only.
 * - No number or synonym normalization: `19` and `nineteen` score about 0.58, so they are not
 *   duplicates. Korean number words such as 열아홉 are not compared with digits.
 * - A different number always means a different fact (digit rule).
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
  if (bigramDice(a, b) < FACT_DUPLICATE_DICE) return false

  return contentWordsContained(a, b)
}

/** Hangul words of a sentence, one trailing particle pair stripped, as a set. */
function hangulWords(s: string): Set<string> {
  const words = new Set<string>()
  for (const raw of s.split(/\s+/)) {
    const word = normalizeForCompare(raw)
    if (!/\p{Script=Hangul}/u.test(word)) continue
    words.add(/^[가-힣]+$/.test(word) ? stripJosa(word) : word)
  }
  return words
}

/** True when the smaller Hangul word set sits inside the larger one (spacing variants pass). */
function contentWordsContained(a: string, b: string): boolean {
  const wa = hangulWords(a)
  const wb = hangulWords(b)
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa]
  return [...small].every((word) => large.has(word) || [...large].some((w) => extendsWord(w, word)))
}

/** True when `long` is `short` plus a short ending (떨린다 -> 떨린다고), not a different word. */
function extendsWord(long: string, short: string): boolean {
  const extra = [...long].length - [...short].length
  return [...short].length >= 2 && extra > 0 && extra <= 2 && long.startsWith(short)
}

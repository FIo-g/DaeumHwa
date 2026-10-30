import { splitSentences } from '@/lib/korean/sentences'
import { bigramDice, gramContainment, normalizeForCompare } from './similarity'
import type { Lang, SampleCopyHit } from './types'

/**
 * Draft sentences that look copied from the example sentences (style-card samples). A draft
 * sentence is flagged when some example has Dice >= `threshold` or n-gram containment >=
 * `minContainment`; the best such example is reported. Thresholds are uncalibrated placeholders.
 *
 * Known limit: `splitSentences` has no English abbreviation handling, so `Mr.` splits a sentence.
 * The `minChars` floor hides the fragments, but a copied sentence that contains an abbreviation
 * may be missed.
 */
export function sampleCopies(
  text: string,
  examples: string[],
  opts?: { lang?: Lang; threshold?: number; minContainment?: number; minChars?: number },
): SampleCopyHit[] {
  const lang = opts?.lang ?? 'ko'
  const threshold = opts?.threshold ?? 0.6
  const minContainment = opts?.minContainment ?? 0.5
  const minChars = opts?.minChars ?? (lang === 'ko' ? 10 : 24)

  const sampleSentences = [
    ...new Set(examples.flatMap((example) => splitSentences(example).map((s) => s.text))),
  ].filter((sentence) => compareLength(sentence) >= minChars)
  if (sampleSentences.length === 0) return []

  const hits: SampleCopyHit[] = []
  for (const sentence of splitSentences(text)) {
    if (compareLength(sentence.text) < minChars) continue

    let best: { example: string; score: number } | null = null
    for (const example of sampleSentences) {
      const dice = bigramDice(example, sentence.text)
      const containment = gramContainment(example, sentence.text)
      if (dice < threshold && containment < minContainment) continue
      const score = Math.max(dice, containment)
      if (best === null || score > best.score) best = { example, score }
    }

    if (best !== null) {
      hits.push({
        start: sentence.start,
        end: sentence.end,
        text: sentence.text,
        example: best.example,
        score: Math.round(best.score * 1000) / 1000,
      })
    }
  }
  return hits
}

/** Length in code points of the normalized sentence (the minChars unit). */
function compareLength(sentence: string): number {
  return [...normalizeForCompare(sentence)].length
}

import { sentenceIn, splitSentences } from '@/lib/korean/sentences'

export type NamingIssueHit = {
  ruleId: string
  variant: string
  canonical: string
  start: number
  end: number
  sentence: string
}

const WORD_CHAR = /[가-힣A-Za-z0-9]/

/** Finds non-canonical spellings (variants) of named things, at word starts only. */
export function findNamingIssues(
  text: string,
  rules: { id: string; canonical: string; variants: string[] }[],
): NamingIssueHit[] {
  const sentences = splitSentences(text)
  const hits: NamingIssueHit[] = []
  for (const rule of rules) {
    for (const raw of rule.variants) {
      const variant = raw.trim()
      if (variant === '' || variant === rule.canonical) continue
      for (let idx = text.indexOf(variant); idx !== -1; idx = text.indexOf(variant, idx + 1)) {
        if (idx > 0 && WORD_CHAR.test(text.charAt(idx - 1))) continue
        hits.push({
          ruleId: rule.id,
          variant,
          canonical: rule.canonical,
          start: idx,
          end: idx + variant.length,
          sentence: sentenceIn(sentences, idx).text,
        })
      }
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

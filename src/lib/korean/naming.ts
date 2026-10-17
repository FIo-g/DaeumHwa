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

type Range = { start: number; end: number }

/**
 * Every occurrence of each rule's canonical name, across all rules. A variant that lies
 * fully inside one of these is part of a correct name (카일 inside 카일론), not a misspelling.
 */
function canonicalRanges(text: string, rules: { canonical: string }[]): Range[] {
  const ranges: Range[] = []
  for (const rule of rules) {
    const name = rule.canonical.trim()
    if (name === '') continue
    for (let idx = text.indexOf(name); idx !== -1; idx = text.indexOf(name, idx + 1)) {
      ranges.push({ start: idx, end: idx + name.length })
    }
  }
  return ranges
}

/** Finds non-canonical spellings (variants) of named things, at word starts only. */
export function findNamingIssues(
  text: string,
  rules: { id: string; canonical: string; variants: string[] }[],
): NamingIssueHit[] {
  const sentences = splitSentences(text)
  const canonicalSpans = canonicalRanges(text, rules)
  const hits: NamingIssueHit[] = []
  for (const rule of rules) {
    for (const raw of rule.variants) {
      const variant = raw.trim()
      if (variant === '' || variant === rule.canonical) continue
      for (let idx = text.indexOf(variant); idx !== -1; idx = text.indexOf(variant, idx + 1)) {
        if (idx > 0 && WORD_CHAR.test(text.charAt(idx - 1))) continue
        const end = idx + variant.length
        if (canonicalSpans.some((r) => idx >= r.start && end <= r.end)) continue
        hits.push({
          ruleId: rule.id,
          variant,
          canonical: rule.canonical,
          start: idx,
          end,
          sentence: sentenceIn(sentences, idx).text,
        })
      }
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

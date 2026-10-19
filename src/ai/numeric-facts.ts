import type { ContextPack, PackEntry } from '@/ai/context'
import { splitSentences } from '@/lib/korean/sentences'

// Numeric fact check (H): finds a sentence whose "N살" age contradicts a confirmed wiki age.
// Runs in code, not in the model, so an empty model answer cannot hide it. It is deliberately
// narrow: a sentence with a flashback or time skip word, two ages, two named entries or a
// possessive ("세린의 동생은 9살이다") is skipped. Only the age in a confirmed fact is compared.

export type NumericFactHit = {
  factRef: string
  entryRef: string
  wikiValue: number
  foundValue: number
  quote: string
  start: number
  end: number
  wikiExcerpt: string
  explanation: string
  suggestion: string
}

const AGE = /(\d{1,3})\s*살/g
const TIME_FRAME = /(때|시절|무렵|전에|이었|였던|예전|과거|년 전|년 뒤|년 후|이후|뒤에|후에|나중)/

/** Names and aliases that can identify an entry in a sentence (at least 2 characters). */
function namesOf(entry: PackEntry): string[] {
  return [entry.name, ...entry.aliases]
    .map((name) => name.trim())
    .filter((name) => Array.from(name).length >= 2)
}

/**
 * The single confirmed age of an entry, taken from confirmed facts whose content has "나이" and
 * exactly one "N살". Two different ages make the entry unusable (the wiki is itself unclear).
 */
function confirmedAge(
  entry: PackEntry,
): { value: number; factRef: string; excerpt: string } | null {
  const ages = new Map<number, { factRef: string; excerpt: string }>()
  for (const fact of entry.facts) {
    if (fact.status !== 'confirmed' || !fact.content.includes('나이')) continue
    const matches = [...fact.content.matchAll(AGE)]
    if (matches.length !== 1) continue
    const value = Number(matches[0][1])
    if (!ages.has(value)) ages.set(value, { factRef: fact.ref, excerpt: fact.content })
  }
  if (ages.size !== 1) return null
  const [value, source] = [...ages.entries()][0]
  return { value, factRef: source.factRef, excerpt: source.excerpt }
}

/**
 * Compares each sentence that is about exactly one pack entry (and has exactly one "N살") with
 * that entry's confirmed age. A mismatch becomes a hit. Never throws: empty input gives no hits.
 */
export function findNumericFactMismatches(input: {
  chapterText: string
  pack: ContextPack
}): NumericFactHit[] {
  const entries = input.pack.entries
  const ages = new Map(entries.map((entry) => [entry, confirmedAge(entry)]))
  const hits: NumericFactHit[] = []

  for (const sentence of splitSentences(input.chapterText)) {
    const ageMatches = [...sentence.text.matchAll(AGE)]
    if (ageMatches.length !== 1) continue
    if (TIME_FRAME.test(sentence.text)) continue

    const named = entries.filter((entry) =>
      namesOf(entry).some((name) => sentence.text.includes(name)),
    )
    if (named.length !== 1) continue
    const [entry] = named
    const age = ages.get(entry)
    if (!age) continue
    if (isPossessive(sentence.text, namesOf(entry))) continue

    const found = Number(ageMatches[0][1])
    if (found === age.value) continue

    hits.push({
      factRef: age.factRef,
      entryRef: entry.ref,
      wikiValue: age.value,
      foundValue: found,
      quote: sentence.text,
      start: sentence.start,
      end: sentence.end,
      wikiExcerpt: age.excerpt,
      explanation: `위키의 나이(${age.value}살)와 원고의 나이(${found}살)가 다릅니다.`,
      suggestion: sentence.text.replace(ageMatches[0][0], `${age.value}살`),
    })
  }
  return hits
}

/** A name directly followed by 의 marks a possessive ("세린의 동생"), so the age may belong to someone else. */
function isPossessive(text: string, names: string[]): boolean {
  for (const name of names) {
    for (let idx = text.indexOf(name); idx !== -1; idx = text.indexOf(name, idx + 1)) {
      if (text.charAt(idx + name.length) === '의') return true
    }
  }
  return false
}

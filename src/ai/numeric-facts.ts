import type { ContextPack, PackEntry } from '@/ai/context'
import {
  eventWords,
  QUANTITY_KINDS,
  QUANTITY_LABEL,
  readQuantities,
  type QuantityKind,
} from '@/ai/numeric-quantities'
import { splitSentences } from '@/lib/korean/sentences'

// Numeric fact check (H, widened by P13): finds a sentence whose number contradicts the one in a
// confirmed wiki fact about the same card. Four kinds are read (see numeric-quantities.ts): age
// ("N살", "N years old"), absolute year, floor count and headcount.
// Runs in code, not in the model, so an empty model answer cannot hide it. It is deliberately
// narrow: a sentence with a flashback or time skip word, two numbers of the kind, two named
// entries or a possessive ("세린의 동생은 9살이다") is skipped. So is a relative or rough number
// ("5살 어린 동생", "5살짜리", "about twenty years old", "동생보다 5살 많다"). Only a number in a
// confirmed fact is compared, and only when the entry has exactly one such number. Year, floor,
// headcount and the English age forms also need the entry to be the subject of the sentence;
// a year also needs a shared event word (건국, built). Korean number words (스물일곱) are not read.

export type NumericFactHit = {
  kind: QuantityKind
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

// Words in a manuscript sentence that put the number in another time or make it relative.
const TIME_FRAME = /(때|시절|무렵|전에|예전|과거|년 전|년 뒤|년 후|이후|뒤에|후에|나중)/
// Past-state words: only an age skips on them ("25살이었다"); a year or a count is often past tense.
const AGE_PAST_FRAME = /(이었|였던)/
const EN_TIME_FRAME =
  /\b(?:when|while|ago|later|before|after|since|until|once|formerly|used to|back then|by then|then|that year|next year|last year|at the age of)\b/i
// Words right after a number that make it a relative age or a rough guess ("5살 어린 동생",
// "20살이 넘은", "5살짜리"), not the number of the named entry.
const RELATIVE_AFTER_NUMBER =
  /^\s*(?:더\s*)?(어리|어린|어려|많|위|아래|차이|터울|연상|연하|배기|짜리|남짓|쯤|정도|이 넘|가 넘)/
const EN_APPROX_BEFORE =
  /\b(?:about|around|nearly|almost|roughly|approximately|some|over|under|maybe|perhaps|barely)\s+$/i
const EN_SUBJECT_VERB =
  /^\s+(?:is|was|are|were|has|had|stood|stands|rose|rises|towered|towers|kept|keeps|numbered|held|holds)\b/i
// An English age fact reads "X is sixteen years old" or "X, age 16"; it must not be about a time.
const EN_AGE_FACT = /\b(?:age|aged|is|are)\b/i

/** Names and aliases that can identify an entry in a sentence (at least 2 characters). */
function namesOf(entry: PackEntry): string[] {
  return [entry.name, ...entry.aliases]
    .map((name) => name.trim())
    .filter((name) => Array.from(name).length >= 2)
}

const LATIN_NAME = /^[A-Za-z][A-Za-z '’.-]*$/
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when the name occurs in the text. A Latin name must not sit inside a longer word. */
function mentions(text: string, name: string): boolean {
  if (!LATIN_NAME.test(name)) return text.includes(name)
  return new RegExp(`(?<![A-Za-z])${escapeRegExp(name)}(?![A-Za-z])`).test(text)
}

type WikiQuantity = {
  value: number
  /** The number as the fact wrote it ("27", "sixteen"); the suggestion uses it. */
  token: string
  factRef: string
  excerpt: string
  /** Year-event words of the fact(s) that state this year. Empty for the other kinds. */
  events: Set<string>
}

/** A Korean age fact says "나이"; an English one says "is ... years old" or "age". */
function isAgeFact(content: string): boolean {
  return content.includes('나이') || (EN_AGE_FACT.test(content) && !EN_TIME_FRAME.test(content))
}

/**
 * The single confirmed number of one kind for an entry: from confirmed facts that state exactly
 * one number of the kind (an age fact must pass `isAgeFact`, a year fact must hold a year-event
 * word). Two different numbers make the entry unusable for this kind (the wiki is itself unclear).
 */
function wikiQuantity(entry: PackEntry, kind: QuantityKind): WikiQuantity | null {
  const byValue = new Map<number, WikiQuantity>()
  for (const fact of entry.facts) {
    if (fact.status !== 'confirmed') continue
    if (kind === 'age' && !isAgeFact(fact.content)) continue
    const found = readQuantities(fact.content, kind)
    if (found.length !== 1) continue
    const events = kind === 'year' ? eventWords(fact.content) : new Set<string>()
    if (kind === 'year' && events.size === 0) continue
    const [quantity] = found
    const same = byValue.get(quantity.value)
    if (same) {
      for (const word of events) same.events.add(word)
      continue
    }
    byValue.set(quantity.value, {
      value: quantity.value,
      token: quantity.token,
      factRef: fact.ref,
      excerpt: fact.content,
      events,
    })
  }
  if (byValue.size !== 1) return null
  return [...byValue.values()][0]
}

/** A name directly followed by 의 or 's marks a possessive ("세린의 동생", "Serin's brother"). */
function isPossessive(text: string, names: string[]): boolean {
  for (const name of names) {
    for (let idx = text.indexOf(name); idx !== -1; idx = text.indexOf(name, idx + 1)) {
      const rest = text.slice(idx + name.length)
      if (rest.startsWith('의') || /^['’]s\b/.test(rest)) return true
    }
  }
  return false
}

/** True when a name before `before` is followed by a subject particle (은 는 이 가) or an English verb. */
function isSubject(text: string, names: string[], before: number): boolean {
  for (const name of names) {
    for (let idx = text.indexOf(name); idx !== -1; idx = text.indexOf(name, idx + 1)) {
      const end = idx + name.length
      if (end > before) continue
      const rest = text.slice(end)
      if (/^[은는이가]/.test(rest) || EN_SUBJECT_VERB.test(rest)) return true
    }
  }
  return false
}

/**
 * Compares each sentence that is about exactly one pack entry (and has exactly one number of a
 * kind) with that entry's confirmed number of the same kind. A mismatch becomes a hit; a sentence
 * gives at most one hit. Never throws: empty input gives no hits.
 */
export function findNumericFactMismatches(input: {
  chapterText: string
  pack: ContextPack
}): NumericFactHit[] {
  const entries = input.pack.entries
  const wikiCache = new Map<string, WikiQuantity | null>()
  const wikiOf = (entry: PackEntry, kind: QuantityKind) => {
    const key = `${entry.ref}:${kind}`
    if (!wikiCache.has(key)) wikiCache.set(key, wikiQuantity(entry, kind))
    return wikiCache.get(key) ?? null
  }
  const hits: NumericFactHit[] = []

  for (const sentence of splitSentences(input.chapterText)) {
    const text = sentence.text
    if (TIME_FRAME.test(text) || EN_TIME_FRAME.test(text)) continue
    if (text.includes('보다') || /\bthan\b/i.test(text)) continue

    for (const kind of QUANTITY_KINDS) {
      const found = readQuantities(text, kind)
      if (found.length !== 1) continue
      const [quantity] = found
      if (kind === 'age' && AGE_PAST_FRAME.test(text)) continue
      if (RELATIVE_AFTER_NUMBER.test(text.slice(quantity.end))) continue
      if (EN_APPROX_BEFORE.test(text.slice(0, quantity.start))) continue

      const named = entries.filter((entry) => namesOf(entry).some((name) => mentions(text, name)))
      if (named.length !== 1) continue
      const [entry] = named
      const wiki = wikiOf(entry, kind)
      if (!wiki) continue
      const names = namesOf(entry)
      if (isPossessive(text, names)) continue
      if (quantity.needsSubject && !isSubject(text, names, quantity.start)) continue
      if (kind === 'year' && ![...eventWords(text)].some((word) => wiki.events.has(word))) continue
      if (quantity.value === wiki.value) continue

      const { label, unit } = QUANTITY_LABEL[kind]
      hits.push({
        kind,
        factRef: wiki.factRef,
        entryRef: entry.ref,
        wikiValue: wiki.value,
        foundValue: quantity.value,
        quote: text,
        start: sentence.start,
        end: sentence.end,
        wikiExcerpt: wiki.excerpt,
        explanation: `위키의 ${label}(${wiki.value}${unit})와 원고의 ${label}(${quantity.value}${unit})가 다릅니다.`,
        suggestion: text.slice(0, quantity.tokenStart) + wiki.token + text.slice(quantity.tokenEnd),
      })
      break
    }
  }
  return hits
}

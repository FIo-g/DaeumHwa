import type { EntryKind } from '@/db/types'
import { stripJosa } from '@/lib/korean/josa'

// Pure checks (round 2, P10): does an evidence sentence name the subject of a fact, and does it
// share a keyword with a thread. No DB and no AI call. The chapter check only counts these
// results; nothing is dropped by default.

const HAS_HANGUL = /[가-힣]/
const HANGUL_ONLY = /^[가-힣]+$/
const LATIN_ONLY = /^[a-z]+$/
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const THREAD_SPLIT = /[\s,.;:!?"“”‘’()[\]{}/·–—~…-]+/u

const KEYWORD_STOP_KO = new Set([
  '아직',
  '않았다',
  '않은',
  '않는',
  '있는',
  '없는',
  '드러나지',
  '드러난',
  '그의',
  '그녀',
  '대해',
  '때문',
  '이후',
  '모두',
  '다시',
  '그리고',
  '하지만',
  '그래서',
])

const KEYWORD_STOP_EN = new Set(
  (
    'the and for with from into onto upon are was were been being its this that these those who ' +
    'whom whose what which when where why how whether then than but not nor yet still also just ' +
    'only even very too any all some each both either neither one two has have had having did ' +
    'does done doing can could will would shall should may might must get got let her his she ' +
    'him they them their there here about after before between over under down out off again ' +
    'once while because since until though although else ever never every other another such own ' +
    'same more most much many few less'
  ).split(' '),
)

// Lowercases and unifies quotes and spaces so that a name and a sentence can be compared.
function normalizeForMatch(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()
}

// True when the term occurs in the text. A term with a Hangul syllable matches as a plain
// substring, because a particle follows the name directly. Any other term must not start in the
// middle of a word ("key" does not match inside "monkey"); there is no right-side check.
function containsTerm(text: string, term: string): boolean {
  if (term === '') return false
  if (HAS_HANGUL.test(term)) return text.includes(term)
  let from = 0
  for (;;) {
    const at = text.indexOf(term, from)
    if (at === -1) return false
    const prev = at === 0 ? '' : text.charAt(at - 1)
    if (prev === '' || !LETTER_OR_DIGIT.test(prev)) return true
    from = at + 1
  }
}

// Strips a trailing 's or ' from an English word ("mother's" -> "mother").
function stripPossessive(word: string): string {
  if (word.endsWith("'s")) return word.slice(0, -2)
  if (word.endsWith("'")) return word.slice(0, -1)
  return word
}

// The normalized forms a sentence may use to name a card. Kind is the card's entry kind, or
// undefined when unknown; person-like cards (character or unknown) also get Hangul name tails.
export function subjectForms(names: readonly string[], kind: EntryKind | undefined): string[] {
  const personLike = kind === undefined || kind === 'character'
  const forms: string[] = []
  const add = (form: string) => {
    if (!forms.includes(form)) forms.push(form)
  }
  for (const raw of names) {
    const name = normalizeForMatch(raw)
    if (Array.from(name).length < 2) continue
    add(name)
    const words = name.split(' ')
    if (words.length >= 2) {
      for (const word of words) {
        const bare = stripPossessive(word)
        if (HAS_HANGUL.test(bare)) {
          if (Array.from(bare).length >= 2) add(bare)
        } else if (LATIN_ONLY.test(bare)) {
          const minLength = personLike ? 4 : 3
          if (bare.length >= minLength && bare !== 'the' && bare !== 'and' && bare !== 'for') {
            add(bare)
          }
        }
      }
    }
    if (personLike && words.length === 1 && HANGUL_ONLY.test(name)) {
      const chars = Array.from(name)
      if (chars.length === 3) add(chars.slice(1).join(''))
      if (chars.length === 4) {
        add(chars.slice(1).join(''))
        add(chars.slice(2).join(''))
      }
    }
  }
  return forms
}

// True when the evidence names the subject, or when there is no form to check against.
export function evidenceNamesSubject(
  evidence: string,
  names: readonly string[],
  kind: EntryKind | undefined,
): boolean {
  const forms = subjectForms(names, kind)
  if (forms.length === 0) return true
  const text = normalizeForMatch(evidence)
  return forms.some((form) => containsTerm(text, form))
}

// Keywords of a thread text: Korean words without particles, English words of three letters or
// more. Stop words are removed in both languages.
export function threadKeywords(text: string): string[] {
  const keywords: string[] = []
  const tokens = text.replace(/’/g, "'").split(THREAD_SPLIT)
  for (const raw of tokens) {
    const token = raw.replace(/^'+|'+$/g, '')
    if (token === '') continue
    if (HAS_HANGUL.test(token)) {
      const word = stripJosa(token).toLowerCase()
      if (Array.from(word).length >= 2 && !KEYWORD_STOP_KO.has(word)) keywords.push(word)
      continue
    }
    const word = stripPossessive(token.toLowerCase())
    if (LATIN_ONLY.test(word) && word.length >= 3 && !KEYWORD_STOP_EN.has(word)) {
      keywords.push(word)
    }
  }
  return [...new Set(keywords)]
}

// True when the evidence shares a keyword with the thread texts (title and description), or when
// the texts have no keyword to check against.
export function evidenceHasThreadKeyword(evidence: string, texts: readonly string[]): boolean {
  const keywords = texts.flatMap(threadKeywords)
  if (keywords.length === 0) return true
  const text = normalizeForMatch(evidence)
  return keywords.some((keyword) => containsTerm(text, keyword))
}

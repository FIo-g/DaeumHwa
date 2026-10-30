// Names an interview question uses that the work never gave. Pure: the interview service passes
// the text the author wrote, and re-asks once when a name has no source in it.
//
// Two kinds of candidate are read, because nothing else is reliable without a dictionary:
// capitalized Latin words (English works, romanized names) and short quoted terms (any language).
// Unquoted Korean names are not detected.

/** Most names reported for one question. */
export const MAX_UNKNOWN_NAMES = 5

const QUOTED_MIN_CHARS = 2
const QUOTED_MAX_CHARS = 12

export type NameCandidate = { text: string; kind: 'latin' | 'quoted'; index: number }

/** Capitalized words that are not names. Lowercase. */
const NOT_NAMES: ReadonlySet<string> = new Set([
  'chapter',
  'chapters',
  'episode',
  'episodes',
  'part',
  'act',
  'volume',
  'book',
  'korean',
  'english',
  'mr',
  'mrs',
  'ms',
  'dr',
  'sir',
])

// Unicode letters, so 'Chloé', 'Björn' and inner capitals ('McAllister') stay whole words.
const CAP_WORD = String.raw`\p{Lu}[\p{Ll}\p{M}]+(?:\p{Lu}[\p{Ll}\p{M}]+)*(?:-[\p{L}\p{M}]+)*(?:['’]s)?`
const CAP_SEQUENCE = new RegExp(`${CAP_WORD}(?: ${CAP_WORD})*`, 'gu')
const POSSESSIVE = /['’]s$/
/** Text before a match that makes the match start a sentence or a quoted phrase. */
const SENTENCE_END = /[.!?:;—–…\n]$/
const OPENING_QUOTE_END = /["'“‘「『(（[]\s*$/u
const TRAILING_OPENERS = /[\s"'“‘「『(（[]+$/u

const QUOTE_PATTERNS: readonly RegExp[] = [
  /「([^」]*)」/g,
  /『([^』]*)』/g,
  /《([^》]*)》/g,
  /〈([^〉]*)〉/g,
  /“([^”]*)”/g,
  /"([^"]*)"/g,
  // An apostrophe sits inside a word, so a quote must not open right after a letter. A closing
  // quote may be followed by a Korean particle, so only ASCII letters and digits are refused.
  /(?<![\p{L}\p{N}])'([^']+?)'(?![A-Za-z0-9])/gu,
  /(?<![\p{L}\p{N}])‘([^’]+?)’(?![A-Za-z0-9])/gu,
]

/** Lowercase text with whitespace, punctuation and symbols removed (as interview-plan compares). */
function squeeze(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function latinCandidates(question: string): NameCandidate[] {
  const found: NameCandidate[] = []
  for (const match of question.matchAll(CAP_SEQUENCE)) {
    const index = match.index ?? 0
    const head = question.slice(0, index)
    const bare = head.replace(TRAILING_OPENERS, '')
    const opensSentence = bare === '' || SENTENCE_END.test(bare) || OPENING_QUOTE_END.test(head)
    let words = match[0].split(' ')
    // The first word of a sentence is capitalized anyway, so it says nothing about a name.
    if (opensSentence) words = words.slice(1)
    words = words
      .map((word) => word.replace(POSSESSIVE, ''))
      .filter((word) => !NOT_NAMES.has(word.toLowerCase()))
    if (words.length > 0) found.push({ text: words.join(' '), kind: 'latin', index })
  }
  return found
}

function quotedCandidates(question: string): NameCandidate[] {
  const found: NameCandidate[] = []
  for (const pattern of QUOTE_PATTERNS) {
    for (const match of question.matchAll(pattern)) {
      const inner = match[1].trim()
      const length = Array.from(inner).length
      if (length < QUOTED_MIN_CHARS || length > QUOTED_MAX_CHARS) continue
      if (!/\p{L}/u.test(inner)) continue
      // A quoted sentence is a remark, not a name.
      if (/[.?!…]/.test(inner)) continue
      found.push({ text: inner, kind: 'quoted', index: match.index ?? 0 })
    }
  }
  return found
}

/** Name candidates of a question in reading order, one per distinct squeezed text. */
export function extractNameCandidates(question: string): NameCandidate[] {
  const all = [...latinCandidates(question), ...quotedCandidates(question)].sort(
    (a, b) => a.index - b.index,
  )
  const seen = new Set<string>()
  return all.filter((candidate) => {
    const key = squeeze(candidate.text)
    if (key === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** True when `word` stands alone (not inside a longer word) in `haystack`, ignoring case. */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'iu').test(haystack)
}

/**
 * The candidates of `question` that no text in `grounding` supports, at most MAX_UNKNOWN_NAMES.
 * A Latin name is supported when each of its words appears as a whole word; a quoted term when
 * it appears, ignoring case, spaces and punctuation.
 */
export function findUngroundedNames(question: string, grounding: readonly string[]): string[] {
  const candidates = extractNameCandidates(question)
  if (candidates.length === 0) return []
  const haystack = grounding.join('\n')
  const squeezed = squeeze(haystack)
  const unknown: string[] = []
  for (const candidate of candidates) {
    const supported =
      candidate.kind === 'latin'
        ? candidate.text.split(' ').every((word) => hasWord(haystack, word))
        : squeezed.includes(squeeze(candidate.text))
    if (!supported) unknown.push(candidate.text)
    if (unknown.length === MAX_UNKNOWN_NAMES) break
  }
  return unknown
}

/** The parts of the question input that hold the author's own words. */
export type GroundingSource = {
  work: { title: string; genre: string; logline: string; synopsis: string }
  wiki: {
    entries: { name: string; summary: string }[]
    openThreads: { title: string }[]
  }
  story: {
    recentSummaries: { title: string; summary: string }[]
    readerReactions: { digest: string }[]
  }
}

/**
 * Texts a question may take names from: the work, the wiki, the story so far, then `extra`
 * (the caller adds every interview answer and the core topic names). Questions are left out on
 * purpose, so a name only an earlier question used stays unknown.
 */
export function groundingTexts(source: GroundingSource, extra: readonly string[]): string[] {
  const { work, wiki, story } = source
  return [
    work.title,
    work.genre,
    work.logline,
    work.synopsis,
    ...wiki.entries.flatMap((entry) => [entry.name, entry.summary]),
    ...wiki.openThreads.map((thread) => thread.title),
    ...story.recentSummaries.flatMap((chapter) => [chapter.title, chapter.summary]),
    ...story.readerReactions.map((reaction) => reaction.digest),
    ...extra,
  ]
}

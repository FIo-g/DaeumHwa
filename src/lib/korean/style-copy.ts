// Draft flags from the shared guard detectors (src/ai/guards). This file adds no detector of its
// own: it maps sampleCopies and repeatedWords hits to flags, sets the thresholds and filters the
// returned word list. The draft repair (src/ai/tasks/draft-repair.ts) and the eval metrics use it.

import { type Lang, repeatedWords, sampleCopies } from '@/ai/guards'
import { stripJosa } from '@/lib/korean/josa'
import { sentenceIn, splitSentences } from '@/lib/korean/sentences'

export type DraftFlagKind = 'sample-copy' | 'repeated-word' | 'foreign-script'

/** A draft sentence the repair may rewrite. Offsets are UTF-16 indices into the draft text. */
export type DraftFlag = {
  kind: DraftFlagKind
  start: number
  end: number
  quote: string
  reason: string
}

export type RepeatedWordOptions = {
  lang?: Lang
  minCount?: number
  keep?: number
  maxFlags?: number
  exempt?: readonly string[]
}

/** Provisional thresholds (spec 8). Calibrated only on hand counts; see the brief's section 10. */
export const SAMPLE_COPY_THRESHOLD = 0.5
export const REPEATED_WORD_MIN_COUNT = 8
const REPEATED_WORD_KEEP = 3
const REPEATED_WORD_MAX_FLAGS = 12
const DRAFT_MAX_FLAGS = 20

/** Korean function words and pronouns that repeat in any chapter. */
const EXEMPT_KO =
  '그녀 그는 그가 그의 그리고 하지만 그러나 그때 이제 다시 아니 그냥 정말 이미 모두 지금 여기 거기 우리 자신 사람'.split(
    ' ',
  )

/** English function words. GUARDS' bigrams are formed before any stop list, so they are dropped here. */
const EN_STOP = new Set(
  'the and was were did not had has have her his she they that with for but from said this then them there when what into over'.split(
    ' ',
  ),
)

/** Verb and adjective endings. Also drops some nouns (바다, 가면, 그네); see the countRepeatedWords test. */
const KO_VERB_ENDING = /[다고며면니네요죠까]$/
const HANGUL = /[가-힣]/

/** Draft sentences that look copied from style-card examples. Threshold 0.5, not GUARDS' 0.6. */
export function findSampleCopies(
  text: string,
  examples: readonly string[],
  opts?: { lang?: Lang; threshold?: number; minChars?: number },
): DraftFlag[] {
  const hits = sampleCopies(text, [...examples], {
    lang: opts?.lang,
    threshold: opts?.threshold ?? SAMPLE_COPY_THRESHOLD,
    minChars: opts?.minChars,
  })
  return hits.map((hit) => ({
    kind: 'sample-copy',
    start: hit.start,
    end: hit.end,
    quote: hit.text,
    reason: '견본 문장과 거의 같다.',
  }))
}

/** Words or word pairs repeated at least `minCount` times, after the filters in repeatedHits. */
export function countRepeatedWords(
  text: string,
  opts?: Pick<RepeatedWordOptions, 'lang' | 'minCount' | 'exempt'>,
): { word: string; count: number }[] {
  return repeatedHits(text, opts).map(({ word, count }) => ({ word, count }))
}

/** One flag per sentence for each repeated word past its first `keep` occurrences. */
export function findRepeatedWords(text: string, opts?: RepeatedWordOptions): DraftFlag[] {
  const lang = opts?.lang ?? 'ko'
  const keep = opts?.keep ?? REPEATED_WORD_KEEP
  const sentences = splitSentences(text)
  // Hits arrive by count desc, so the first word to claim a sentence is the most repeated one.
  const bySentence = new Map<number, DraftFlag>()
  for (const hit of repeatedHits(text, { lang, minCount: opts?.minCount, exempt: opts?.exempt })) {
    for (const position of hit.positions.slice(keep)) {
      const sentence = sentenceIn(sentences, position)
      if (bySentence.has(sentence.start)) continue
      bySentence.set(sentence.start, {
        kind: 'repeated-word',
        start: sentence.start,
        end: sentence.end,
        quote: sentence.text,
        reason: `같은 말 반복: '${hit.word}' ${hit.count}번`,
      })
    }
  }
  return [...bySentence.values()]
    .sort((a, b) => a.start - b.start)
    .slice(0, opts?.maxFlags ?? REPEATED_WORD_MAX_FLAGS)
}

/**
 * All draft flags: sample copies first, then repeated-word flags that do not overlap a sample
 * copy, sorted by start, at most 20.
 */
export function findDraftFlags(
  text: string,
  o: { examples: readonly string[]; exempt?: readonly string[]; lang?: Lang },
): DraftFlag[] {
  const samples = findSampleCopies(text, o.examples, { lang: o.lang })
  const repeats = findRepeatedWords(text, { lang: o.lang, exempt: o.exempt })
  const kept = repeats.filter((repeat) => !samples.some((sample) => overlaps(sample, repeat)))
  return [...samples, ...kept].slice(0, DRAFT_MAX_FLAGS).sort((a, b) => a.start - b.start)
}

type RepeatedHit = { word: string; count: number; positions: number[] }

/**
 * GUARDS' repeatedWords with this file's thresholds and filters. Only filters the returned list,
 * never re-counts. Korean: exempt words and verb endings are dropped, and only Hangul words count.
 * English: bigrams with a stop word or a short token, or with an exempt token, are dropped.
 */
function repeatedHits(
  text: string,
  opts?: Pick<RepeatedWordOptions, 'lang' | 'minCount' | 'exempt'>,
): RepeatedHit[] {
  const lang = opts?.lang ?? 'ko'
  const exempt = opts?.exempt ?? []
  const minCount = opts?.minCount ?? REPEATED_WORD_MIN_COUNT

  if (lang === 'ko') {
    const allow = [...EXEMPT_KO, ...exempt].map((word) => stripJosa(word))
    return repeatedWords(text, { lang, minCount, ngram: 1, allow })
      .filter((hit) => HANGUL.test(hit.word) && !KO_VERB_ENDING.test(hit.word))
      .map(({ word, count, positions }) => ({ word, count, positions }))
  }

  const exemptWords = new Set(exempt.flatMap((word) => word.toLowerCase().split(' ')))
  return repeatedWords(text, { lang, minCount, ngram: 2 })
    .filter((hit) => {
      const [first, second] = hit.word.split(' ')
      return [first, second].every(
        (token) => token.length >= 3 && !EN_STOP.has(token) && !exemptWords.has(token),
      )
    })
    .map(({ word, count, positions }) => ({ word, count, positions }))
}

function overlaps(a: DraftFlag, b: DraftFlag): boolean {
  return a.start < b.end && b.start < a.end
}

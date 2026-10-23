import type { SpeechLevel } from '@/db/types'
import { draftCharCount } from '@/lib/draft-length'
import { type DirectiveForPrompt, matchBan } from '@/lib/directives'
import { splitParagraphs } from '@/lib/korean/paragraphs'

// Code checks for the checkable author requests (ban, speech level, length). Pure: no database and
// no AI. Style and content requests are not checked here.

/** One request a draft breaks. `paragraphs` are paragraph indexes, the first 5 at most. */
export type DirectiveFinding = {
  directiveId: string
  kind: 'ban' | 'speech' | 'length'
  count: number
  paragraphs: number[]
}

const PATH_LIMIT = 5
const QUOTED_LINE_RE = /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』/g
const QUOTE_MARKS_RE = /["“”「」『』]/g
const JONDAET_ENDING_RE = /(요|니다|니까|세요|십시오|습니까|죠)$/
const HANGUL_SYLLABLE_RE = /[가-힣]$/

/**
 * The speech level of a quoted line, from the last sentence of the line (quotes stripped, trailing
 * `.?!…~` stripped). Null when the line has no sentence or ends in something other than Hangul.
 */
export function speechLevelOf(line: string): SpeechLevel | null {
  const bare = line
    .replace(QUOTE_MARKS_RE, '')
    .trim()
    .replace(/[.?!…~]+$/, '')
    .trim()
  const sentences = bare.split(/[.?!…]+/).map((part) => part.trim())
  const last = sentences.filter((part) => part !== '').pop() ?? ''
  if (last === '') return null
  if (JONDAET_ENDING_RE.test(last)) return 'jondaet'
  if (HANGUL_SYLLABLE_RE.test(last)) return 'banmal'
  return null
}

/**
 * The findings of a draft against the requests it was sent with. `names` maps an entry id to its
 * name and aliases. Only ban, speech (with a level) and length requests are checked; a finding is
 * returned only when it has a count.
 */
export function checkDraftDirectives(
  text: string,
  directives: DirectiveForPrompt[],
  names: Record<string, string[]>,
): DirectiveFinding[] {
  const paragraphs = splitParagraphs(text)
  const findings: DirectiveFinding[] = []

  for (const d of directives) {
    if (d.kind === 'ban' && d.pattern) {
      const hitParagraphs: number[] = []
      let count = 0
      for (const p of paragraphs) {
        const hits = matchBan(p.text, d.pattern).length
        if (hits > 0) {
          count += hits
          hitParagraphs.push(p.index)
        }
      }
      if (count > 0) {
        findings.push({
          directiveId: d.id,
          kind: 'ban',
          count,
          paragraphs: hitParagraphs.slice(0, PATH_LIMIT),
        })
      }
    }

    if (d.kind === 'speech' && d.speechLevel && d.entryId) {
      const own = names[d.entryId] ?? (d.entryName ? [d.entryName] : [])
      const others = Object.entries(names)
        .filter(([id]) => id !== d.entryId)
        .flatMap(([, list]) => list)
      const hitParagraphs: number[] = []
      let count = 0
      for (const p of paragraphs) {
        const quotes = p.text.match(QUOTED_LINE_RE) ?? []
        if (quotes.length !== 1 || own.length === 0) continue
        if (!own.some((name) => p.text.includes(name))) continue
        if (others.some((name) => p.text.includes(name))) continue
        const level = speechLevelOf(quotes[0])
        if (level !== null && level !== d.speechLevel) {
          count++
          hitParagraphs.push(p.index)
        }
      }
      if (count > 0) {
        findings.push({
          directiveId: d.id,
          kind: 'speech',
          count,
          paragraphs: hitParagraphs.slice(0, PATH_LIMIT),
        })
      }
    }

    if (d.kind === 'length' && d.targetChars) {
      const length = draftCharCount(text)
      if (length < d.targetChars * 0.85 || length > d.targetChars * 1.15) {
        findings.push({ directiveId: d.id, kind: 'length', count: 1, paragraphs: [] })
      }
    }
  }

  return findings
}

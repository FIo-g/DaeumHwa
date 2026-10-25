import type { SpeechLevel } from '@/db/types'
import { draftCharCount } from '@/lib/draft-length'
import { type DirectiveForPrompt, matchBan } from '@/lib/directives'
import { findMentions, type MentionTarget } from '@/lib/korean/mentions'
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
export const QUOTED_LINE_RE = /"[^"\n]+"|“[^”\n]+”|「[^」\n]+」|『[^』\n]+』/g
const QUOTE_MARKS_RE = /["“”「」『』]/g
const HANGUL_SYLLABLE_RE = /[가-힣]$/
const SUBJECT_PARTICLE_RE = /^(은|는|이|가|께서)/
// Yes/no words are jondaet on their own, though 네 is also a banmal ending.
const POLITE_WORD_RE = /^(네|예|아뇨|아니요)$/
const JONDAET_ENDING_RE = /(요|십시오|죠)$/
// 니다/니까 are polite only after a ㅂ final or 습 (입니다, 합니까). Otherwise -니까 is plain.
const FORMAL_NIDA_RE = /(.)니(다|까)$/
// Plain endings. Any other ending is not read as banmal.
const BANMAL_ENDING_RE = /(다|어|아|야|지|해|라|자|냐|니|군|걸|게|래|네|니까)$/

function hasBieupFinal(syllable: string): boolean {
  const code = syllable.charCodeAt(0) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 === 17
}

/** The speech level a sentence ending gives, or null when the ending is not recognized. */
function endingLevel(part: string): SpeechLevel | null {
  if (POLITE_WORD_RE.test(part) || JONDAET_ENDING_RE.test(part)) return 'jondaet'
  const formal = FORMAL_NIDA_RE.exec(part)
  if (formal && hasBieupFinal(formal[1])) return 'jondaet'
  if (BANMAL_ENDING_RE.test(part)) return 'banmal'
  return null
}

/**
 * A tail that is unambiguously polite: 요, 죠, 십시오, or 니다/니까 after a ㅂ final or 습.
 * Only such a tail can override the head of a comma clause.
 */
function isPoliteTail(part: string): boolean {
  if (JONDAET_ENDING_RE.test(part)) return true
  const formal = FORMAL_NIDA_RE.exec(part)
  return formal !== null && hasBieupFinal(formal[1])
}

/**
 * The speech level of one sentence. A trailing comma vocative of up to two words (", 아가씨") is
 * dropped: the head decides, so a kin vocative ending in 니 or 지 (", 어머니") does not override a
 * polite head. The tail decides only when it is unambiguously polite, and is read only when the
 * head is not recognized.
 */
function sentenceLevel(sentence: string): SpeechLevel | null {
  const comma = sentence.lastIndexOf(',')
  if (comma > 0) {
    const head = sentence.slice(0, comma).trim()
    const tail = sentence.slice(comma + 1).trim()
    if (head !== '' && tail !== '' && tail.split(/\s+/).length <= 2) {
      if (isPoliteTail(tail)) return 'jondaet'
      const headLevel = endingLevel(head)
      if (headLevel !== null) return headLevel
      const tailLevel = endingLevel(tail)
      if (tailLevel !== null) return tailLevel
    }
  }
  return endingLevel(sentence)
}

/**
 * The speech level of a quoted line, from the last sentence of the line (quotes stripped, trailing
 * `.?!…~` stripped). When the last sentence has no recognized ending (a bare name, a fragment), the
 * sentence before it is read instead. Null when nothing is recognized or the line ends in something
 * other than Hangul.
 */
export function speechLevelOf(line: string): SpeechLevel | null {
  const bare = line
    .replace(QUOTE_MARKS_RE, '')
    .trim()
    .replace(/[.?!…~]+$/, '')
    .trim()
  const sentences = bare
    .split(/[.?!…]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const last = sentences[sentences.length - 1]
  if (last === undefined || !HANGUL_SYLLABLE_RE.test(last)) return null
  const level = sentenceLevel(last)
  if (level !== null) return level
  const previous = sentences[sentences.length - 2]
  return previous === undefined ? null : sentenceLevel(previous)
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
      const targets: MentionTarget[] = Object.entries(names).map(([id, list]) => ({
        id,
        names: list,
      }))
      if (!(d.entryId in names) && d.entryName) {
        targets.push({ id: d.entryId, names: [d.entryName] })
      }
      const ownNames = targets.find((t) => t.id === d.entryId)?.names ?? []
      const hitParagraphs: number[] = []
      let count = 0
      for (const p of paragraphs) {
        const quotes = p.text.match(QUOTED_LINE_RE) ?? []
        if (quotes.length !== 1 || ownNames.length === 0) continue
        // Names are read from the narration only: the quoted line is blanked out, so a name the
        // speaker addresses or mentions inside the line does not decide who speaks it.
        const narration = p.text.replace(QUOTED_LINE_RE, (quote) => ' '.repeat(quote.length))
        const mentions = findMentions(narration, targets)
        const own = mentions.find((m) => m.entryId === d.entryId)
        if (!own || mentions.some((m) => m.entryId !== d.entryId)) continue
        if (!own.positions.some((pos) => isSubjectMention(narration, pos, ownNames))) continue
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

/** True when one of `names` starts at `pos` and a subject particle follows it. */
function isSubjectMention(text: string, pos: number, names: string[]): boolean {
  const matched = names
    .filter((name) => name.trim() !== '' && text.startsWith(name.trim(), pos))
    .sort((a, b) => b.length - a.length)[0]
  if (matched === undefined) return false
  return SUBJECT_PARTICLE_RE.test(text.slice(pos + matched.trim().length))
}

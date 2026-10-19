import { countChars } from '@/lib/korean/chars'
import { foreignScriptRuns } from '@/ai/guards'

export * from './metrics-interview'
export * from './metrics-proofread'

export type ChapterMetrics = {
  chars: number // with spaces, trimmed
  targetChars: number
  lengthOk: boolean // T3: chars >= target (ko) / >= 0.8*target (en) and <= 1.3*target
  // T5: ko → Latin runs of 4+ letters plus Han, kana, Cyrillic and U+FFFD runs; en → Hangul plus
  // Han, kana, Cyrillic and U+FFFD runs. Runs are grouped by rule, each group in text order.
  foreignRuns: string[]
  metaHits: string[] // T4: lines matching META_PATTERNS
  endsCleanly: boolean // T7: last non-space char is a closing mark or Hangul sentence ending
  paragraphs: number
  avgParagraphChars: number
  dialogueLineRatio: number // informational for Q6
}

export const META_PATTERNS: RegExp[] = [
  // Korean meta lines
  /^#/m,
  /^\*\*?\d+화/m,
  /초안입니다/m,
  /다음은 .*초안/m,
  /^제목:/m,
  /작가의 말/m,
  // English meta lines
  /^Here is/m,
  /^Chapter \d+[:.]/m,
  /^Title:/m,
  /^Note:/m,
]

const CLEAN_ENDINGS = new Set([...'.!?…"”\'’」』)~', ...'다요까네지죠'])
const DIALOGUE_OPENERS = new Set(['"', '“', "'", '‘', '「', '『'])

export function chapterMetrics(
  text: string,
  lang: 'ko' | 'en',
  targetChars: number,
): ChapterMetrics {
  const trimmed = text.trim()
  // Same "공백 포함" definition the editor shows: line breaks are not counted.
  const chars = countChars(trimmed).withSpaces
  const minChars = lang === 'ko' ? targetChars : targetChars * 0.8
  const lengthOk = chars >= minChars && chars <= targetChars * 1.3

  const foreignRuns = foreignScriptRuns(trimmed, lang)

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  // One hit per line, even when several patterns match that line.
  const metaHits = lines.flatMap((line) => {
    const pattern = META_PATTERNS.find((candidate) => candidate.test(line))
    return pattern ? [line] : []
  })

  const lastChar = trimmed.at(-1) ?? ''
  const endsCleanly = CLEAN_ENDINGS.has(lastChar)

  const paragraphChars = lines.reduce((sum, line) => sum + [...line].length, 0)
  const paragraphs = lines.length
  const avgParagraphChars = paragraphs === 0 ? 0 : Math.round(paragraphChars / paragraphs)

  const dialogueLines = lines.filter((line) => DIALOGUE_OPENERS.has(line.charAt(0))).length
  const dialogueLineRatio = paragraphs === 0 ? 0 : dialogueLines / paragraphs

  return {
    chars,
    targetChars,
    lengthOk,
    foreignRuns,
    metaHits,
    endsCleanly,
    paragraphs,
    avgParagraphChars,
    dialogueLineRatio,
  }
}

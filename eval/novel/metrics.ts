export type ChapterMetrics = {
  chars: number // with spaces, trimmed
  targetChars: number
  lengthOk: boolean // T3: chars >= target (ko) / >= 0.8*target (en) and <= 1.3*target
  foreignRuns: string[] // T5: ko → Latin runs of 4+ letters; en → Hangul runs
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
const LATIN_RUN = /[A-Za-z]{4,}/g
const HANGUL_RUN = /[가-힣]+/g

export function chapterMetrics(text: string, lang: 'ko' | 'en', targetChars: number): ChapterMetrics {
  const trimmed = text.trim()
  const chars = [...trimmed].length
  const minChars = lang === 'ko' ? targetChars : targetChars * 0.8
  const lengthOk = chars >= minChars && chars <= targetChars * 1.3

  const foreignRuns = trimmed.match(lang === 'ko' ? LATIN_RUN : HANGUL_RUN) ?? []

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

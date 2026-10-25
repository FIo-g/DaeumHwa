import { countChars } from '@/lib/korean/chars'
import { foreignScriptRuns } from '@/ai/guards'
import { countRepeatedWords, findSampleCopies } from '@/lib/korean/style-copy'
import { overlongParagraphs } from '@/lib/korean/paragraphs'
import { splitScenes } from '@/lib/scene'
import type { Bible } from './bible'
import { countParagraphOpeners, type ParagraphOpeners } from './metrics-openers'

export * from './metrics-interview'
export * from './metrics-openers'
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
  // E2: draft sentences that copy a style-card example. Counts the work card only (see cli.ts).
  sampleCopyHits: number
  // E2: words or pairs repeated at least 8 times, from countRepeatedWords.
  repeatedWords: { word: string; count: number }[]
  // E1: paragraphs over PARAGRAPH_MAX_SENTENCES sentences. Informational for Q6, not a T threshold.
  overlongParagraphs: number
  // P8: first words of the non-dialogue paragraphs. Informational for Q7, not a T threshold.
  paragraphOpeners: ParagraphOpeners
  // Stage 1: chars of each scene against the plan's per-scene targets. Null targets without a plan.
  sceneLengths: SceneLengths
}

export type SceneLengths = {
  scenes: number
  /** The plan's per-scene targets, or null when the run had no plan. */
  targets: number[] | null
  /** Chars (with spaces) of each scene, in text order. */
  chars: number[]
  /** Scenes whose chars are 70 to 130 percent of their target; null without a plan. */
  within: number | null
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
  // A trailing plan label copied from the card ("회차 끝" line).
  /^\s*[\[(\-–—*]*\s*회차 끝\s*[\])\-–—*]*\s*$/m,
  /^\s*[\[(\-–—*]*\s*(Ending|End of chapter)\s*[\])\-–—*]*\s*$/im,
]

const CLEAN_ENDINGS = new Set([...'.!?…"”\'’」』)~', ...'다요까네지죠'])
const DIALOGUE_OPENERS = new Set(['"', '“', "'", '‘', '「', '『'])

/**
 * Names and aliases of the bible's characters, places and items. repairDraft exempts every wiki
 * entry name and alias from its repeated-word flags, so the metric exempts the same words.
 */
export function bibleExempt(bible: Bible): string[] {
  return [...bible.characters, ...bible.places, ...bible.items].flatMap((entry) => [
    entry.name,
    ...entry.aliases,
  ])
}

/** Per-scene chars of a text, checked against the plan's targets when the run had a plan. */
export function sceneLengthsOf(text: string, targets: readonly number[] | null): SceneLengths {
  const chars = splitScenes(text).map((scene) => countChars(scene).withSpaces)
  const within =
    targets === null
      ? null
      : chars.filter((count, i) => {
          const target = targets[i]
          return target !== undefined && count >= target * 0.7 && count <= target * 1.3
        }).length
  return { scenes: chars.length, targets: targets ? [...targets] : null, chars, within }
}

/** The per-scene targets of a stored plan, or null when the run has none (quick runs, old runs). */
export function planTargetsOf(
  plan: { card: { scenes: { targetChars: number }[] } } | undefined,
): number[] | null {
  return plan ? plan.card.scenes.map((scene) => scene.targetChars) : null
}

export function chapterMetrics(
  text: string,
  lang: 'ko' | 'en',
  targetChars: number,
  styleExamples: readonly string[] = [],
  exempt: readonly string[] = [],
  sceneTargets: readonly number[] | null = null,
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
  const narrationLines = lines.filter((line) => !DIALOGUE_OPENERS.has(line.charAt(0)))

  const sampleCopyHits = findSampleCopies(trimmed, styleExamples.filter(Boolean), { lang }).length
  const repeatedWords = countRepeatedWords(trimmed, { lang, exempt })
  const overlong = overlongParagraphs(trimmed).length

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
    sampleCopyHits,
    repeatedWords,
    overlongParagraphs: overlong,
    paragraphOpeners: countParagraphOpeners(narrationLines),
    sceneLengths: sceneLengthsOf(trimmed, sceneTargets),
  }
}

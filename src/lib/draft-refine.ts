// Client-safe types and copy for the draft refine preview ("다듬기"). No server imports: the panel
// imports this file. The server builds the values in src/server/draft-refine.ts.
import type { DiffPart } from '@/lib/diff'

/** `failed`: the sentence repair threw and the trim result is kept. `skipped`: no time was left. */
export type RefineRepairState = 'none' | 'done' | 'skipped' | 'failed'

export type DraftRefinePreview = {
  runId: string
  /** Names the stored candidate; apply must send the token of the preview the author saw. */
  token: string
  changed: boolean
  /** [] when !changed. Equal + delete parts join to the stored draft; equal + insert to the refined text. */
  parts: DiffPart[]
  /** Paragraphs over the sentence limit before the trim. */
  paragraphsBefore: number
  /** Same count after the trim; dialogue paragraphs that cannot be split stay. */
  paragraphsAfter: number
  /** Flags found on the trimmed text. */
  flagged: number
  /** Edits applied by the sentence repair. */
  repaired: number
  repairState: RefineRepairState
  beforeChars: number
  afterChars: number
}

export type AppliedRefinement = { runId: string; text: string }

/** One line naming what the refine changed. */
export function refineSummary(p: DraftRefinePreview): string {
  const fixed = Math.max(0, p.paragraphsBefore - p.paragraphsAfter)
  const pieces: string[] = []
  if (fixed > 0) pieces.push(`긴 문단 ${fixed}곳`)
  if (p.repaired > 0) pieces.push(`문장 ${p.repaired}곳`)
  let line = pieces.length > 0 ? `${pieces.join(', ')}을 고쳤어요.` : '글을 다듬었어요.'
  if (p.paragraphsAfter > 0) {
    line += ` 문장이 많은 문단 ${p.paragraphsAfter}곳은 안 고쳤어요.`
  }
  return line
}

/** A note about the sentence repair, or null when there is nothing to say. */
export function refineRepairNote(p: DraftRefinePreview): string | null {
  if (p.repairState === 'failed') return '문장 고치기는 못했어요. 문단 다듬기 결과만 보여요.'
  if (p.repairState === 'skipped') return '시간이 모자라 문장 고치기는 건너뛰었어요.'
  return null
}

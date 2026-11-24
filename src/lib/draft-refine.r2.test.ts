import { describe, expect, it } from 'vitest'
import { type DraftRefinePreview, refineRepairNote, refineSummary } from '@/lib/draft-refine'

function preview(overrides: Partial<DraftRefinePreview> = {}): DraftRefinePreview {
  return {
    runId: 'run-1',
    token: 'token-1',
    changed: true,
    parts: [],
    paragraphsBefore: 0,
    paragraphsAfter: 0,
    flagged: 0,
    repaired: 0,
    repairState: 'none',
    beforeChars: 100,
    afterChars: 100,
    ...overrides,
  }
}

describe('refineSummary', () => {
  it('names the paragraphs and sentences that were fixed', () => {
    expect(refineSummary(preview({ paragraphsBefore: 2, paragraphsAfter: 0, repaired: 3 }))).toBe(
      '긴 문단 2곳, 문장 3곳을 고쳤어요.',
    )
  })

  it('leaves out a part that is zero', () => {
    expect(refineSummary(preview({ paragraphsBefore: 1, paragraphsAfter: 0, repaired: 0 }))).toBe(
      '긴 문단 1곳을 고쳤어요.',
    )
    expect(refineSummary(preview({ paragraphsBefore: 0, paragraphsAfter: 0, repaired: 2 }))).toBe(
      '문장 2곳을 고쳤어요.',
    )
  })

  it('reports paragraphs it could not fix', () => {
    expect(refineSummary(preview({ paragraphsBefore: 2, paragraphsAfter: 1, repaired: 0 }))).toBe(
      '긴 문단 1곳을 고쳤어요. 문장이 많은 문단 1곳은 안 고쳤어요.',
    )
  })

  it('has a fallback when nothing was counted', () => {
    expect(refineSummary(preview({ changed: true }))).toBe('글을 다듬었어요.')
  })
})

describe('refineRepairNote', () => {
  it('explains a failed sentence repair and a skipped one', () => {
    expect(refineRepairNote(preview({ repairState: 'failed' }))).toBe(
      '문장 고치기는 못했어요. 문단 다듬기 결과만 보여요.',
    )
    expect(refineRepairNote(preview({ repairState: 'skipped' }))).toBe(
      '시간이 모자라 문장 고치기는 건너뛰었어요.',
    )
  })

  it('has no note when the repair was not needed or finished', () => {
    expect(refineRepairNote(preview({ repairState: 'none' }))).toBeNull()
    expect(refineRepairNote(preview({ repairState: 'done' }))).toBeNull()
  })
})

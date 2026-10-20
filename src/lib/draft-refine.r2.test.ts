import { describe, expect, it } from 'vitest'
import { type DraftRefinePreview, refineRepairNote, refineSummary } from '@/lib/draft-refine'

function preview(overrides: Partial<DraftRefinePreview> = {}): DraftRefinePreview {
  return {
    runId: 'run-1',
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
      '긴 문단 2곳, 문장 3곳을 고쳤습니다.',
    )
  })

  it('leaves out a part that is zero', () => {
    expect(refineSummary(preview({ paragraphsBefore: 1, paragraphsAfter: 0, repaired: 0 }))).toBe(
      '긴 문단 1곳을 고쳤습니다.',
    )
    expect(refineSummary(preview({ paragraphsBefore: 0, paragraphsAfter: 0, repaired: 2 }))).toBe(
      '문장 2곳을 고쳤습니다.',
    )
  })

  it('reports paragraphs it could not fix', () => {
    expect(refineSummary(preview({ paragraphsBefore: 2, paragraphsAfter: 1, repaired: 0 }))).toBe(
      '긴 문단 1곳을 고쳤습니다. 문장이 많은 문단 1곳은 그대로 뒀습니다.',
    )
  })

  it('has a fallback when nothing was counted', () => {
    expect(refineSummary(preview({ changed: true }))).toBe('글을 다듬었습니다.')
  })
})

describe('refineRepairNote', () => {
  it('explains a failed sentence repair and a skipped one', () => {
    expect(refineRepairNote(preview({ repairState: 'failed' }))).toBe(
      '문장 고치기는 하지 못했습니다. 문단 다듬기 결과만 보입니다.',
    )
    expect(refineRepairNote(preview({ repairState: 'skipped' }))).toBe(
      '시간이 모자라 문장 고치기는 건너뛰었습니다.',
    )
  })

  it('has no note when the repair was not needed or finished', () => {
    expect(refineRepairNote(preview({ repairState: 'none' }))).toBeNull()
    expect(refineRepairNote(preview({ repairState: 'done' }))).toBeNull()
  })
})

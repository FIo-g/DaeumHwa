import { describe, expect, it } from 'vitest'
import { continuityCheckTask } from './continuity-check'
import { CONTINUE_MAX_TOKENS, DRAFT_EFFORT, DRAFT_MAX_TOKENS } from './draft-chapter'

// Values chosen from the stage 0 measurements (docs/eval/harness/2026-10-20-stage0-baseline.md).
describe('task effort and limits after stage 0', () => {
  it('runs the continuity check at low effort', () => {
    expect(continuityCheckTask.effort).toBe('low')
  })

  it('keeps the draft at high effort with room for its thinking', () => {
    expect(DRAFT_EFFORT).toBe('high')
    expect(DRAFT_MAX_TOKENS).toBe(32000)
    expect(CONTINUE_MAX_TOKENS).toBe(DRAFT_MAX_TOKENS)
  })
})

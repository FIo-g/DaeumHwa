import { describe, expect, it } from 'vitest'
import { blindRunSummary } from './blind'

// The reviewer's copy of the run summary has no harness block (cost and time) and no directives block.

describe('blindRunSummary harness', () => {
  it('drops harness and directives and keeps calls', () => {
    const summary = {
      calls: { total: 2, byTask: {} },
      harness: { settings: 'deploy', priceSource: 'official', chapters: [], total: {} },
      directives: { chapters: [] },
    }
    const blinded = blindRunSummary(summary) as Record<string, unknown>
    expect(blinded).not.toHaveProperty('harness')
    expect(blinded).not.toHaveProperty('directives')
    expect(blinded).toHaveProperty('calls')
  })
})

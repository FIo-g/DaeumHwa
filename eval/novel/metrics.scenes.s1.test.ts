import { describe, expect, it } from 'vitest'
import { chapterMetrics, sceneLengthsOf } from './metrics'

// Per-scene lengths against the plan's targets (stage 1). Korean characters count one each.

const TWO_SCENES = `${'가'.repeat(1000)}\n\n***\n\n${'가'.repeat(400)}`

describe('sceneLengthsOf', () => {
  it('counts the scenes and how many are within 70 to 130 percent of their target', () => {
    expect(sceneLengthsOf(TWO_SCENES, [1000, 1000])).toEqual({
      scenes: 2,
      targets: [1000, 1000],
      chars: [1000, 400],
      within: 1,
    })
  })

  it('has no within count without a plan', () => {
    expect(sceneLengthsOf('가나다', null)).toEqual({
      scenes: 1,
      targets: null,
      chars: [3],
      within: null,
    })
  })
})

describe('chapterMetrics sceneLengths', () => {
  it('carries the scene lengths measured against the plan targets', () => {
    const metrics = chapterMetrics(TWO_SCENES, 'ko', 1400, [], [], [1000, 1000])
    expect(metrics.sceneLengths).toEqual({
      scenes: 2,
      targets: [1000, 1000],
      chars: [1000, 400],
      within: 1,
    })
  })
})

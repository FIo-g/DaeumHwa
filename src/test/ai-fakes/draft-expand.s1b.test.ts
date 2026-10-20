import { describe, expect, it } from 'vitest'
import { acceptExpansion } from '@/ai/tasks/draft-expand'
import { sceneSpans } from '@/lib/scene'
import { fakeDraft, fakeDraftExpand } from './draft-chapter'

// Stage 1b fix F9: the demo expansion passes acceptExpansion for every span of the demo draft.

describe('fakeDraftExpand', () => {
  const samples = [
    { instructions: '' },
    { instructions: '비가 내리는 밤. 그녀는 말하지 않는다.\n금지 표현: 갑자기' },
    { instructions: '회차 끝은 문을 열고 나가는 장면으로 맺는다. '.repeat(12) },
  ]

  for (const input of samples) {
    it(`is accepted for every span of the demo draft (${input.instructions.length} chars of instructions)`, () => {
      const draft = fakeDraft(input)
      const spans = sceneSpans(draft, 3)
      expect(spans.length).toBeGreaterThan(0)
      for (const span of spans) {
        const original = draft.slice(span.start, span.end)
        expect(acceptExpansion(original, fakeDraftExpand(input))).toBe(true)
      }
    })
  }

  it('starts with the demo marker and holds no scene break line', () => {
    const text = fakeDraftExpand({ instructions: '첫 장면. 둘째 장면.' })
    expect(text.startsWith('(데모 확장)')).toBe(true)
    expect(text.split('\n').some((line) => /^\s*\*{3}\s*$/.test(line))).toBe(false)
  })
})

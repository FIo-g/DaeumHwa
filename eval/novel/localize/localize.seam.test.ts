import { describe, expect, it } from 'vitest'
import { EN_TAG_DATA_RULE } from './en/shared'
import { EN_SYSTEMS } from './en-systems'
import snapshot from './__fixtures__/en-systems.snapshot.json'

// Recorded before the en-systems.ts split (Wave 0 seam). Prompt text changed by a later track
// must update the fixture in the same commit; the split itself must not change a single byte.
describe('EN_SYSTEMS seam snapshot', () => {
  const recorded = snapshot as Record<string, string>
  for (const [task, text] of Object.entries(recorded)) {
    it(`keeps the recorded English system for ${task}`, () => {
      expect(EN_SYSTEMS[task as keyof typeof EN_SYSTEMS]).toBe(text)
    })
  }

  it('maps draft-continue to the draft-chapter system', () => {
    expect(EN_SYSTEMS['draft-continue']).toBe(EN_SYSTEMS['draft-chapter'])
  })

  // Wave L0 seam: names pre-registered for tracks D and F2, whose placeholder text they replace.
  for (const task of [
    'draft-beats',
    'scene-rewrite',
    'chapter-extract-facts',
    'chapter-extract-threads',
    'chapter-extract-relations',
  ] as const) {
    it(`registers an English system with the tag data rule for ${task}`, () => {
      expect(EN_SYSTEMS[task]).toContain(EN_TAG_DATA_RULE)
    })
  }
})

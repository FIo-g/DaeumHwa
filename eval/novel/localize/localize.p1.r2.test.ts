import { describe, expect, it } from 'vitest'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { renderBeats } from '@/ai/tasks/draft-beats'
import { EN_TAG_DATA_RULE } from './en/shared'
import { EN_SYSTEMS } from './en-systems'
import { draftBeatsInput, draftBeatsSample } from './samples/draft-beats'
import { findHangul, translateScaffold } from './scaffold'

// Round 2 P1: the English beat scaffold names the count tag and has no fixed range.

describe('draft-beats English scene count (round 2)', () => {
  it('English beat system names the count tag and has no fixed range', () => {
    const system = EN_SYSTEMS['draft-beats']
    expect(system).toContain('<scene_count>')
    expect(system).not.toMatch(/1 to 6/)
    expect(findHangul(system)).toEqual([])
    const lines = system.split('\n')
    expect(lines[lines.length - 2]).toBe(EN_TAG_DATA_RULE)
    expect(lines[lines.length - 1]).toBe('- Write all output in English.')
  })

  it('translated beat prompt keeps the count tag and has no Hangul', () => {
    const translated = translateScaffold(draftBeatsSample)
    expect(translated).toContain('<scene_count>2</scene_count>')
    expect(findHangul(translated)).toEqual([])
  })

  it('translated prose prompt keeps the A-form scene budget with a beat-list count', () => {
    const prompt = buildDraftPrompt({
      ...draftBeatsInput,
      beats: renderBeats({
        scenes: [
          { place: 'Clock tower gate', characters: [], objects: [], sequence: ['Mina waits.'] },
        ],
      }),
      beatSceneCount: 6,
    })
    const translated = translateScaffold(prompt)
    expect(translated).toMatch(
      /<scene_budget>6 scenes, about 500 characters per scene including spaces<\/scene_budget>/,
    )
    expect(findHangul(translated)).toEqual([])
  })
})

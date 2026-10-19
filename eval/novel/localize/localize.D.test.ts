import { describe, expect, it } from 'vitest'
import { buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { type DraftBeats, renderBeats } from '@/ai/tasks/draft-beats'
import { draftBeatsInput, draftBeatsSample } from './samples/draft-beats'
import { findHangul, translateScaffold } from './scaffold'

// Brief D, part 1: the English scaffold for the beat list and the draft prompt that carries it.

const sampleScene: DraftBeats = {
  scenes: [
    {
      place: 'Clock tower gate',
      characters: ['Mina Park', 'Caretaker'],
      objects: ['brass key (held by Caretaker)'],
      sequence: ['The caretaker takes out the key.', 'Mina takes the key.'],
    },
    {
      place: 'Tower stairs',
      characters: ['Mina Park'],
      objects: [],
      sequence: ['Mina climbs the stairs.'],
    },
  ],
}

describe('draft-beats English scaffold (track D)', () => {
  it('leaves no Hangul in a two-step draft prompt that carries the beat list', () => {
    const prompt = buildDraftPrompt({ ...draftBeatsInput, beats: renderBeats(sampleScene) })
    const translated = translateScaffold(prompt)
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('<beats>')
    expect(translated).toContain(
      'Scene 1\nPlace: Clock tower gate\nCharacters: Mina Park, Caretaker',
    )
    expect(translated).toContain('Objects: brass key (held by Caretaker)')
  })

  it('keeps the translated length line in the A form', () => {
    const prompt = buildDraftPrompt({ ...draftBeatsInput, beats: renderBeats(sampleScene) })
    const translated = translateScaffold(prompt)
    expect(translated).toMatch(
      /<scene_budget>\d+ scenes, about \d+ characters per scene including spaces<\/scene_budget>/,
    )
  })

  it('translates the beat list sample without Hangul', () => {
    expect(findHangul(translateScaffold(draftBeatsSample))).toEqual([])
  })
})

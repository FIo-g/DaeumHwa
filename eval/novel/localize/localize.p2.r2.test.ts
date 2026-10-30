import { describe, expect, it } from 'vitest'
import { buildDraftPrompt, BEATS_RULE } from '@/ai/tasks/draft-chapter'
import { BEATS_STATE_RULE, type DraftBeats, renderBeats } from '@/ai/tasks/draft-beats'
import { draftBeatsInput } from './samples/draft-beats'
import { EN_SYSTEMS } from './en-systems'
import { EN_TAG_DATA_RULE } from './en/shared'
import { findHangul, translateScaffold } from './scaffold'

// Brief P2: the English scaffold for decision and stake, and the English beat system prompt.

const EN_STATE_RULE =
  'If a scene has a "Decision state", do not reverse what the character decided in later sentences without a reason. Show "Expected and lost" through the character\'s gestures or the objects in their hands, without naming the emotion.'

const fixture: DraftBeats = {
  scenes: [
    {
      place: 'Clock tower gate',
      characters: ['Mina Park', 'Caretaker'],
      objects: ['brass key (held by Caretaker)'],
      sequence: ['The caretaker takes out the key.', 'Mina takes the key.'],
      decision: 'Mina decides not to open the letter yet.',
      stake: 'She hoped for news of her mother but the letter stays sealed.',
    },
    {
      place: 'Tower stairs',
      characters: ['Mina Park'],
      objects: [],
      sequence: ['Mina climbs the stairs.'],
    },
  ],
}

const withoutState: DraftBeats = {
  scenes: fixture.scenes.map((scene) => ({
    place: scene.place,
    characters: scene.characters,
    objects: scene.objects,
    sequence: scene.sequence,
  })),
}

describe('draft-beats English state scaffold (P2)', () => {
  it('translates the state labels and the state rule without Hangul', () => {
    const translated = translateScaffold(
      buildDraftPrompt({ ...draftBeatsInput, beats: renderBeats(fixture) }),
    )
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('Decision state: Mina decides not to open the letter yet.')
    expect(translated).toContain(
      'Expected and lost: She hoped for news of her mother but the letter stays sealed.',
    )
    expect(translated.split(EN_STATE_RULE).length - 1).toBe(1)
    expect(translated).toContain(
      'Keep the places, characters, object locations and event order of the scene list above exactly',
    )
  })

  it('adds no state text to a beat list without states', () => {
    const translated = translateScaffold(
      buildDraftPrompt({ ...draftBeatsInput, beats: renderBeats(withoutState) }),
    )
    expect(translated).not.toContain('Decision state')
    expect(translated).not.toContain('Expected and lost')
    expect(translated).not.toContain(EN_STATE_RULE)
    expect(findHangul(translated)).toEqual([])
  })

  it('asks the English beat model for decision and stake', () => {
    const system = EN_SYSTEMS['draft-beats']
    expect(system).toContain('(decision)')
    expect(system).toContain('(stake)')
    expect(findHangul(system)).toEqual([])

    const lines = system.split('\n')
    expect(lines[lines.length - 2]).toBe(EN_TAG_DATA_RULE)
    expect(lines[lines.length - 1]).toBe('- Write all output in English.')

    const decisionIndex = lines.findIndex((line) => line.includes('(decision)'))
    const orderIndex = lines.findIndex((line) => line.startsWith('- Write the ordered actions'))
    expect(decisionIndex).toBeGreaterThan(orderIndex)
  })

  it('keeps the English BEATS_RULE sentence in the prompt', () => {
    expect(BEATS_RULE).toContain('장면')
    const translated = translateScaffold(
      buildDraftPrompt({ ...draftBeatsInput, beats: renderBeats(fixture) }),
    )
    expect(translated).toContain(
      'Keep the places, characters, object locations and event order of the scene list above exactly',
    )
  })

  it('is wired to the Korean state rule constant', () => {
    expect(BEATS_STATE_RULE).toContain('결정 상태')
  })
})

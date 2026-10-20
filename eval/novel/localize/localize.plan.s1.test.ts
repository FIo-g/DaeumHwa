import { describe, expect, it } from 'vitest'
import type { DraftPlanCard } from '@/lib/draft-plan'
import { renderPlanInstructions } from '@/lib/draft-plan'
import { EN_SYSTEMS } from './en-systems'
import { draftPlanSample } from './samples/draft-plan'
import { findHangul, translateScaffold } from './scaffold'

// Stage 1 (draft-plan): the English system prompt and the plan scaffold carry no Hangul.

const sampleCard: DraftPlanCard = {
  scenes: [
    {
      summary: 'Mina finds the letter under the stairs.',
      goal: 'Learn who wrote it.',
      decision: 'She hides the letter.',
      stake: 'If caught, she loses the key.',
      trigger: 'Footsteps on the stairs.',
      role: 'opening',
      place: 'Clock tower stairs',
      characters: ['Mina Park'],
      targetChars: 1250,
    },
    {
      summary: 'The caretaker opens the door.',
      goal: 'See what Mina is hiding.',
      decision: '',
      stake: '',
      trigger: '',
      role: 'ending',
      place: 'Tower gate',
      characters: ['Caretaker'],
      targetChars: 1250,
    },
  ],
  ending: { device: 'crisis', line: 'The door opens.' },
  threads: ['Brass key'],
}

describe('draft-plan English scaffold (stage 1)', () => {
  it('has an English system prompt with no Hangul', () => {
    expect(EN_SYSTEMS['draft-plan']).toBeTruthy()
    expect(findHangul(EN_SYSTEMS['draft-plan'])).toEqual([])
  })

  it('lets the author note in <revision> bring in an instructed-only thread', () => {
    const line = EN_SYSTEMS['draft-plan']
      .split('\n')
      .find((l) => l.includes('use only if the instructions mention it'))
    expect(line).toBeTruthy()
    expect(line).toContain('<revision>')
  })

  it('translates the plan prompt sample without Hangul', () => {
    expect(findHangul(translateScaffold(draftPlanSample))).toEqual([])
  })

  it('translates the rendered plan card without Hangul', () => {
    const translated = translateScaffold(renderPlanInstructions('', sampleCard))
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('Scene 1 (opening, about 1,250 characters including spaces)')
    expect(translated).toContain('Ending (crisis): The door opens.')
  })
})

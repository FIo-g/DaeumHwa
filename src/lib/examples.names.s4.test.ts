import { describe, expect, it } from 'vitest'
import { selectExamples, type ExamplePassage } from '@/lib/examples'

// Task 4 review: one character scores once, even when a passage names both the name and an alias.
describe('selectExamples name groups (s4)', () => {
  it('ranks a name-and-alias match equal to a single-name match', () => {
    const serin: ExamplePassage = { text: '한세린이 문을 열었다.', source: 'card' }
    const yunseo: ExamplePassage = { text: '도윤서가 문을 열었다.', source: 'card' }

    const picked = selectExamples([yunseo, serin], {
      names: [['한세린', '세린'], ['도윤서']],
      cue: '',
    })

    // Equal scores keep input order: 도윤서 comes first.
    expect(picked.map((passage) => passage.text)).toEqual([yunseo.text, serin.text])
  })
})

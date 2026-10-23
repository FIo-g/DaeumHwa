import { describe, expect, it } from 'vitest'
import type { DirectiveForPrompt } from '@/lib/directives'
import { checkDraftDirectives } from '@/lib/directive-check'

// Stage 2 review fixes, group C (C1, item 10): a speech line is attributed by the names in the
// narration only, with whole-name matching.

function speech(overrides: Partial<DirectiveForPrompt>): DirectiveForPrompt {
  return {
    id: 'sp',
    scope: 'character',
    kind: 'speech',
    text: '',
    pattern: null,
    speechLevel: 'jondaet',
    targetChars: null,
    chapterPosition: null,
    entryId: 's',
    entryName: '서윤',
    ...overrides,
  }
}

function count(text: string, directive: DirectiveForPrompt, names: Record<string, string[]>) {
  const found = checkDraftDirectives(text, [directive], names)
  return found.reduce((sum, f) => sum + f.count, 0)
}

describe('speech attribution: the speaker is named in the narration', () => {
  it('does not count a line where the name is only the person addressed', () => {
    const banmal = speech({ speechLevel: 'banmal' })
    expect(count('"서윤 씨, 이것 좀 봐 주세요."', banmal, { s: ['서윤'] })).toBe(0)
  })

  it('does not count a line where the name is an object in the narration', () => {
    const banmal = speech({ speechLevel: 'banmal' })
    expect(count('직원이 서윤을 보며 "어서 오세요." 하고 인사했다.', banmal, { s: ['서윤'] })).toBe(
      0,
    )
  })

  it('still counts a line the named speaker says with a subject particle', () => {
    const banmal = speech({ speechLevel: 'banmal' })
    expect(count('서윤이 말했다. "알겠어요."', banmal, { s: ['서윤'] })).toBe(1)
  })

  it('does not count a line for a named character when the name is only in the quote', () => {
    const names = { s: ['서윤'], d: ['도윤서'] }
    const banmal = speech({ speechLevel: 'banmal', entryId: 'd', entryName: '도윤서' })
    expect(count('세린이 물었다. "도윤서 씨는 어디 계세요?"', banmal, names)).toBe(0)
  })

  it('counts the narration speaker even when another name is inside the quote', () => {
    const names = { s: ['서윤'], d: ['도윤서'] }
    const jondaet = speech({ speechLevel: 'jondaet', entryId: 's', entryName: '서윤' })
    expect(count('서윤이 말했다. "도윤서 씨, 알겠어."', jondaet, names)).toBe(1)
  })

  it('skips a paragraph where another character is named in the narration', () => {
    const names = { s: ['서윤'], d: ['도윤서'] }
    const banmal = speech({ speechLevel: 'banmal' })
    expect(count('서윤이 도윤서를 보며 말했다. "알겠어요."', banmal, names)).toBe(0)
  })

  it('does not match a name inside a longer word or name', () => {
    const jondaet = speech({ speechLevel: 'jondaet', entryId: 's', entryName: '서윤' })
    const names = { s: ['서윤'], w: ['윤'] }
    expect(count('서윤이 웃으며 말했다. "그래, 내일 보자."', jondaet, names)).toBe(1)
  })

  it('ignores a one-syllable name inside a word of the narration', () => {
    const jondaet = speech({ speechLevel: 'jondaet', entryId: 'g', entryName: '결' })
    expect(count('결국 그는 고개를 들었다. "가자."', jondaet, { g: ['결'] })).toBe(0)
  })

  it('still flags a two-syllable name followed by a particle', () => {
    const jondaet = speech({ speechLevel: 'jondaet', entryId: 'd', entryName: '도윤서' })
    expect(count('도윤서가 말했다. "알겠어."', jondaet, { d: ['도윤서'] })).toBe(1)
  })
})

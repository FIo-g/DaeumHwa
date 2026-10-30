import { describe, expect, it } from 'vitest'
import type { DirectiveForPrompt } from '@/lib/directives'
import { checkDraftDirectives, speechLevelOf } from '@/lib/directive-check'

// Stage 2 review fixes, group C (C2 follow-up): a trailing comma vocative that ends in a banmal
// syllable (니, 지) must not override a polite head, and a banmal head must not be read as polite.

describe('speechLevelOf: a kin vocative does not decide the level', () => {
  it.each([
    ['"네, 어머니."', 'jondaet'],
    ['"알겠습니다, 아버지."', 'jondaet'],
    ['"예, 언니."', 'jondaet'],
    ['"알겠어요, 할머니."', 'jondaet'],
    ['"됐습니다, 어머니."', 'jondaet'],
    ['"알겠습니다, 선배야."', 'jondaet'],
  ])('reads %s as jondaet', (line, level) => {
    expect(speechLevelOf(line)).toBe(level)
  })

  it.each([
    ['"그래, 알겠어."', 'banmal'],
    ['"가자, 서윤아."', 'banmal'],
  ])('keeps %s as banmal', (line, level) => {
    expect(speechLevelOf(line)).toBe(level)
  })

  it('still lets a polite tail decide over a banmal head', () => {
    expect(speechLevelOf('"그래, 알겠어요."')).toBe('jondaet')
  })
})

describe('checkDraftDirectives: a polite line with a kin vocative', () => {
  const speech = (level: 'banmal' | 'jondaet'): DirectiveForPrompt => ({
    id: 'sy',
    scope: 'character',
    kind: 'speech',
    text: '',
    pattern: null,
    speechLevel: level,
    targetChars: null,
    chapterPosition: null,
    entryId: 'sy',
    entryName: '서윤',
  })
  const names = { sy: ['서윤'] }

  it('gives no speech finding for 네, 어머니. under a 존댓말 request', () => {
    const found = checkDraftDirectives('서윤이 말했다. "네, 어머니."', [speech('jondaet')], names)
    expect(found).toEqual([])
  })

  it('gives no speech finding for 가자, 서윤아. under a 반말 request', () => {
    const found = checkDraftDirectives('서윤이 말했다. "가자, 서윤아."', [speech('banmal')], names)
    expect(found).toEqual([])
  })
})

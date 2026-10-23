import { describe, expect, it } from 'vitest'
import type { DirectiveForPrompt } from '@/lib/directives'
import { checkDraftDirectives, speechLevelOf } from '@/lib/directive-check'

// Stage 2 review fixes, group C (C2): what speechLevelOf reads from the last sentence of a line.

describe('speechLevelOf: yes/no words and vocatives', () => {
  it.each(['"네."', '"예."', '"아뇨."', '"아니요."'])('reads %s as jondaet', (line) => {
    expect(speechLevelOf(line)).toBe('jondaet')
  })

  it('drops a trailing comma vocative before reading the ending', () => {
    expect(speechLevelOf('"내려가세요, 아가씨."')).toBe('jondaet')
    expect(speechLevelOf('"거기서 멈추십시오, 아가씨."')).toBe('jondaet')
    expect(speechLevelOf('"알겠습니다, 선배."')).toBe('jondaet')
    expect(speechLevelOf('"허락 없이 여기에 오시면 안 됩니다, 아가씨."')).toBe('jondaet')
  })

  it('keeps the ending of a comma clause that is a predicate', () => {
    expect(speechLevelOf('"그래, 알겠어요."')).toBe('jondaet')
  })
})

describe('speechLevelOf: 니다 and 니까 need a formal stem', () => {
  it('reads 아니다 as banmal', () => {
    expect(speechLevelOf('"아니다."')).toBe('banmal')
  })

  it('reads a plain line ending in 다 as banmal', () => {
    expect(speechLevelOf('"그건 내 일이 아니다."')).toBe('banmal')
  })

  it('reads a connective 니까 after a plain stem as banmal', () => {
    expect(speechLevelOf('"내가 간다니까!"')).toBe('banmal')
    expect(speechLevelOf('"그거 닦아야 하니까."')).toBe('banmal')
  })

  it('reads 입니다 and 입니까 as jondaet', () => {
    expect(speechLevelOf('"한세린 씨입니까."')).toBe('jondaet')
    expect(speechLevelOf('"백지원입니다."')).toBe('jondaet')
  })
})

describe('speechLevelOf: fragments fall back to the previous sentence', () => {
  it('uses the previous sentence when the last one is a bare name', () => {
    expect(speechLevelOf('"도윤서입니다. 검사."')).toBe('jondaet')
  })

  it('gives null for a single name with no sentence before it', () => {
    expect(speechLevelOf('"한세린 씨."')).toBeNull()
  })

  it('keeps the plain banmal endings', () => {
    expect(speechLevelOf('"그만해."')).toBe('banmal')
    expect(speechLevelOf('"도윤서다."')).toBe('banmal')
    expect(speechLevelOf('"알겠어요."')).toBe('jondaet')
  })
})

describe('checkDraftDirectives: a fragment line is not a misread', () => {
  it('gives no finding for a polite self-introduction the speaker asked to keep', () => {
    const directive: DirectiveForPrompt = {
      id: 'sp',
      scope: 'character',
      kind: 'speech',
      text: '',
      pattern: null,
      speechLevel: 'jondaet',
      targetChars: null,
      chapterPosition: null,
      entryId: 'd',
      entryName: '도윤서',
    }
    const found = checkDraftDirectives('도윤서가 말했다. "도윤서입니다. 검사."', [directive], {
      d: ['도윤서'],
    })
    expect(found).toEqual([])
  })
})

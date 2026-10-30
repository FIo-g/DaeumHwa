import { describe, expect, it } from 'vitest'
import type { DirectiveForPrompt } from '@/lib/directives'
import { checkDraftDirectives, speechLevelOf } from '@/lib/directive-check'

// Stage 2 (task 5): code checks for the checkable author requests (ban, speech level, length).

function directive(overrides: Partial<DirectiveForPrompt>): DirectiveForPrompt {
  return {
    id: 'd',
    scope: 'work',
    kind: 'style',
    text: '',
    pattern: null,
    speechLevel: null,
    targetChars: null,
    chapterPosition: null,
    entryId: null,
    entryName: null,
    ...overrides,
  }
}

const SPEECH_NAMES = { m: ['민준'], s: ['서윤'] }

describe('speechLevelOf', () => {
  it('reads a polite ending as jondaet', () => {
    expect(speechLevelOf('"알겠어요."')).toBe('jondaet')
  })

  it('reads a plain ending as banmal inside curly quotes', () => {
    expect(speechLevelOf('“그만해.”')).toBe('banmal')
  })

  it('gives null for a line with no sentence', () => {
    expect(speechLevelOf('"…"')).toBeNull()
  })
})

describe('checkDraftDirectives', () => {
  it('skips a paragraph with two quoted lines or with two character names', () => {
    const text = [
      '민준이 말했다. "그만해." "알겠어요."',
      '민준과 서윤이 같이 말했다. "그만해."',
      '민준이 말했다. "그만해."',
    ].join('\n')
    const findings = checkDraftDirectives(
      text,
      [
        directive({
          id: 'sp',
          kind: 'speech',
          speechLevel: 'jondaet',
          entryId: 'm',
          entryName: '민준',
        }),
      ],
      SPEECH_NAMES,
    )
    expect(findings).toEqual([{ directiveId: 'sp', kind: 'speech', count: 1, paragraphs: [2] }])
  })

  it('gives one ban finding with the count and paragraph indexes of a pattern', () => {
    const text = [
      '그녀의 입꼬리가 올라갔다.',
      '별일 아니라는 듯 입꼬리를 내렸다.',
      '비가 왔다.',
    ].join('\n')
    const findings = checkDraftDirectives(
      text,
      [directive({ id: 'ban', kind: 'ban', pattern: '입꼬리' })],
      {},
    )
    expect(findings).toEqual([{ directiveId: 'ban', kind: 'ban', count: 2, paragraphs: [0, 1] }])
  })

  it('flags a draft far from the requested length', () => {
    const text = '가'.repeat(4000)
    const findings = checkDraftDirectives(
      text,
      [directive({ id: 'len', kind: 'length', targetChars: 5000 })],
      {},
    )
    expect(findings).toEqual([{ directiveId: 'len', kind: 'length', count: 1, paragraphs: [] }])
  })

  it('flags a paragraph of the named character whose line has the other speech level', () => {
    const findings = checkDraftDirectives(
      '민준이 말했다. "그만해."',
      [
        directive({
          id: 'sp',
          kind: 'speech',
          speechLevel: 'jondaet',
          entryId: 'm',
          entryName: '민준',
        }),
      ],
      SPEECH_NAMES,
    )
    expect(findings).toEqual([{ directiveId: 'sp', kind: 'speech', count: 1, paragraphs: [0] }])
  })

  it('gives nothing for style, content and speech requests without a level', () => {
    const findings = checkDraftDirectives(
      '민준이 말했다. "알겠어요."',
      [
        directive({ id: 'a', kind: 'style' }),
        directive({ id: 'b', kind: 'content' }),
        directive({ id: 'c', kind: 'speech', entryId: 'm', entryName: '민준' }),
      ],
      SPEECH_NAMES,
    )
    expect(findings).toEqual([])
  })
})

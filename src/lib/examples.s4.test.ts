import { describe, expect, it } from 'vitest'
import { examplePassages, isExampleSelectionEnabled, selectExamples } from '@/lib/examples'
import { findHangul, translateScaffold } from '../../eval/novel/localize/scaffold'

describe('examplePassages', () => {
  it('splits card examples into blank-line groups of up to 4 paragraphs', () => {
    const card = ['문단1이다.\n\n문단2이다.\n\n문단3이다.\n\n문단4이다.\n\n문단5이다.']
    const passages = examplePassages(card, [])
    expect(passages).toHaveLength(2)
    expect(passages[0].source).toBe('card')
    expect(passages[0].text).toBe('문단1이다.\n\n문단2이다.\n\n문단3이다.\n\n문단4이다.')
    expect(passages[1].text).toBe('문단5이다.')
  })

  it('ends a passage at 600 characters', () => {
    const card = [`${'가'.repeat(400)}\n\n${'나'.repeat(400)}`]
    const passages = examplePassages(card, [])
    expect(passages).toHaveLength(2)
    expect(passages[0].text).toBe('가'.repeat(400))
    expect(passages[1].text).toBe('나'.repeat(400))
  })

  it('keeps only author passages with a quoted line', () => {
    const passages = examplePassages(
      [],
      ['일반 서술이다. 날씨가 맑았다.', '"안녕." 세린이 말했다.'],
    )
    expect(passages).toHaveLength(1)
    expect(passages[0].source).toBe('chapter')
    expect(passages[0].text).toContain('"안녕."')
  })
})

describe('selectExamples', () => {
  it('prefers two chapter names over a better Dice with no names', () => {
    const cue = 'The foggy room was cold and silent.'
    const highDice = {
      text: 'The foggy room was cold and silent and dark.',
      source: 'card' as const,
    }
    const withNames = {
      text: '세린 and 도윤서 walked through the foggy place.',
      source: 'card' as const,
    }
    const picked = selectExamples([highDice, withNames], {
      names: ['세린', '도윤서'],
      cue,
    })
    expect(picked[0].text).toBe(withNames.text)
  })

  it('stops before the passage that would pass the budget', () => {
    const passages = [500, 500, 500].map((n) => ({
      text: '가'.repeat(n),
      source: 'card' as const,
    }))
    const picked = selectExamples(passages, { names: [], cue: '', budget: 1200 })
    expect(picked).toHaveLength(2)
  })

  it('skips a passage already copied into the draft text', () => {
    const copied = '세린이 문을 열고 안개 속으로 들어갔다.'
    const fresh = '도윤서가 칼을 내려놓고 창문을 보았다.'
    const picked = selectExamples(
      [
        { text: copied, source: 'card' as const },
        { text: fresh, source: 'card' as const },
      ],
      { names: [], cue: '', draftText: `${copied} 그리고 밤이 깊었다.` },
    )
    expect(picked.map((p) => p.text)).toEqual([fresh])
  })
})

describe('isExampleSelectionEnabled', () => {
  it('is on for 1/true/on and off otherwise', () => {
    expect(isExampleSelectionEnabled({ AI_EXAMPLE_SELECTION: '1' })).toBe(true)
    expect(isExampleSelectionEnabled({ AI_EXAMPLE_SELECTION: 'true' })).toBe(true)
    expect(isExampleSelectionEnabled({ AI_EXAMPLE_SELECTION: 'on' })).toBe(true)
    expect(isExampleSelectionEnabled({})).toBe(false)
    expect(isExampleSelectionEnabled({ AI_EXAMPLE_SELECTION: 'off' })).toBe(false)
  })
})

describe('voice examples scaffold', () => {
  it('translates the header with no Hangul left', () => {
    const ko = '작가 예문. 문체와 말투만 참고하고 문장을 그대로 옮기지 않는다.'
    const translated = translateScaffold(ko)
    expect(findHangul(translated)).toEqual([])
    expect(translated).toBe(
      "The author's example passages. Use them only for style and voice; do not copy their sentences.",
    )
  })
})

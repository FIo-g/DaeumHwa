import { describe, expect, it } from 'vitest'
import { loadBible } from './bible'
import { directiveBlock } from './directives'
import { chapterInstructions, firstSentence } from './instructions'

// Chapter instruction text for full and few-instruction runs (stage 0). Kept apart from the bible tests.

const KO_FIRST =
  '입춘 아침, 고아원 심부름으로 종루에 빨래를 배달하러 간 한세린이 처음으로 9층 꼭대기까지 올라간다.'
const EN_FIRST =
  'On the first morning of spring, Han Serin, sent by the orphanage to deliver laundry to the bell tower, climbs all the way to the top of the nine-story tower for the first time.'

describe('chapterInstructions full mode', () => {
  it('returns the bible text for ch1', () => {
    const bible = loadBible('ko')
    expect(chapterInstructions(bible, 1, { lang: 'ko' })).toBe(bible.chapters[0]?.instructions)
  })

  it('appends the directive block to ch1 only when directives is on', () => {
    const bible = loadBible('ko')
    const ch1 = chapterInstructions(bible, 1, { lang: 'ko', directives: true })
    expect(ch1).toBe(`${bible.chapters[0]?.instructions}\n\n${directiveBlock('ko')}`)
    expect(chapterInstructions(bible, 2, { lang: 'ko', directives: true })).toBe(
      bible.chapters[1]?.instructions,
    )
  })
})

describe('firstSentence', () => {
  it('returns the first sentence of ko ch1', () => {
    expect(firstSentence(loadBible('ko').chapters[0]?.instructions ?? '')).toBe(KO_FIRST)
  })

  it('returns the first sentence of en ch1', () => {
    expect(firstSentence(loadBible('en').chapters[0]?.instructions ?? '')).toBe(EN_FIRST)
  })
})

describe('chapterInstructions few mode', () => {
  it('gives only the first sentence of ch1', () => {
    const bible = loadBible('ko')
    expect(chapterInstructions(bible, 1, { lang: 'ko', fewInstructions: true })).toBe(KO_FIRST)
  })

  it('gives the first sentence plus the directive block on ch1 when directives is on', () => {
    const bible = loadBible('ko')
    expect(
      chapterInstructions(bible, 1, { lang: 'ko', fewInstructions: true, directives: true }),
    ).toBe(`${KO_FIRST}\n\n${directiveBlock('ko')}`)
  })
})

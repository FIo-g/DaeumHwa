import { describe, expect, it } from 'vitest'
import { acceptExpansion, expansionRejection, unwrapExpansion } from '@/ai/tasks/draft-expand'
import { isContinuationCommentary } from '@/lib/draft-length'

/** Sentences that differ from each other by their number, so none repeats. */
function uniqueSentences(from: number, count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `서윤은 ${from + i}번째 계단을 오르며 난간의 차가운 쇠를 손끝으로 더듬었다.`,
  ).join(' ')
}

describe('unwrapExpansion (F5)', () => {
  it('drops a first line that is exactly the scene tag and a last line that is the closing tag', () => {
    expect(unwrapExpansion('<scene>\n서윤은 문을 열었다.\n</scene>')).toBe('서윤은 문을 열었다.')
  })

  it('compares each line after trimming it', () => {
    expect(unwrapExpansion('  <scene>  \n서윤은 문을 열었다.\n  </scene> ')).toBe(
      '서윤은 문을 열었다.',
    )
  })

  it('keeps a tag that is not on the first or last line, so it is still a note', () => {
    const text = '서윤은 문을 열었다.\n</scene>\n더 쓴 문장.'
    expect(unwrapExpansion(text)).toBe(text)
    const original = uniqueSentences(1, 10)
    expect(expansionRejection(original, `${original}\n${uniqueSentences(500, 6)}\n${text}`)).toBe(
      'note',
    )
  })
})

describe('acceptExpansion and the narration the span already had (F5)', () => {
  const original = `${uniqueSentences(1, 10)} ${uniqueSentences(20, 2)}`

  it('passes a new sentence that is narration saying nothing was added outside dialogue', () => {
    const expanded = `${original} ${uniqueSentences(500, 8)} 그는 아무것도 덧붙이지 않았다.`
    expect(expansionRejection(original, expanded)).toBeNull()
  })

  it('rejects a new sentence in the polite form of the continuation note', () => {
    const expanded = `${original} ${uniqueSentences(500, 8)} 이어 쓸 내용이 없어 덧붙이지 않았습니다.`
    expect(expansionRejection(original, expanded)).toBe('note')
  })

  it('keeps the continuation check, with the loose phrase, unchanged', () => {
    expect(isContinuationCommentary('그는 아무것도 덧붙이지 않았다.')).toBe(true)
  })

  it('passes a middle sentence that announces the scene inside the text', () => {
    const expanded = `${original} ${uniqueSentences(500, 8)} 여기가 바로 그가 기다리던 장면이다.`
    expect(expansionRejection(original, expanded)).toBeNull()
  })

  it('rejects a first line that announces the expanded scene', () => {
    const expanded = `다음은 분량을 늘린 장면입니다.\n\n${original} ${uniqueSentences(500, 8)}`
    expect(acceptExpansion(original, expanded)).toBe(false)
    expect(expansionRejection(original, expanded)).toBe('note')
  })
})

import { describe, expect, it } from 'vitest'
import { isContinuationCommentary } from './draft-length'

// Real continuation answers from the stage 1 measurement (2026-10-21-s1few, haiku-5.5): the model
// explained why it did not continue instead of writing prose.
const NOTE_KEEP_ENDING =
  '초안은 이미 회차 끝 장면과 "조심하십시오."로 끝나 있어서, 그 뒤에 이어 쓰면 마지막 대사가 두 번 나오고 회차 끝이 무너집니다. 그래서 이어 쓰지 않았습니다.\n\n원하시면 앞부분을 늘리고 이 두 가지를 고친 회차 전체본을 다시 써 드리겠습니다.'
const NOTE_TAG =
  '<draft_so_far>가 이미 회차 마지막 대사인 "조심하십시오."로 끝나 있어서, 그 뒤에 이어 쓰면 회차 끝 규칙을 어기게 됩니다. 그래서 이어 쓴 부분은 출력하지 않았습니다.'
const NOTE_OPTIONS =
  '현재 초안은 약 3,888자입니다. 목표 분량인 공백 포함 5,000자 이상에 못 미치므로 다음 중 하나를 골라 주세요.\n\n1. **앞부분을 늘리는 방식**: 장면 1과 2를 늘립니다.\n\n어느 쪽으로 진행할지 알려 주시면 바로 쓰겠습니다.'

const NOTE_NOTHING_TO_ADD =
  '이어 쓸 내용이 없어서 아무것도 덧붙이지 않았습니다. 현재 초안은 마지막 줄 "아무도 안 쳤잖아."에서 회차가 이미 끝나 있습니다.'

describe('isContinuationCommentary', () => {
  it('flags a note that says there is nothing to add', () => {
    expect(isContinuationCommentary(NOTE_NOTHING_TO_ADD)).toBe(true)
  })

  it.each([NOTE_KEEP_ENDING, NOTE_TAG, NOTE_OPTIONS])('flags a note to the author: %#', (text) => {
    expect(isContinuationCommentary(text)).toBe(true)
  })

  it('flags an English note to the author', () => {
    expect(
      isContinuationCommentary(
        'The draft already ends on its final line, so I did not continue it. Let me know if you would like a longer version.',
      ),
    ).toBe(true)
  })

  it('flags an English refusal to continue', () => {
    expect(
      isContinuationCommentary(
        "I can't write this continuation as requested: the chapter already closes on its final line.",
      ),
    ).toBe(true)
  })

  it('keeps prose, including dialogue that sounds like a request', () => {
    const prose =
      '세린은 계단을 하나 더 올랐다. 차가운 난간이 손바닥에 붙었다.\n\n"원하시면 알려 주세요. 어느 쪽으로 가실지 골라 주세요."\n\n도윤서의 목소리가 안개 속에서 낮게 울렸다.'
    expect(isContinuationCommentary(prose)).toBe(false)
  })

  it('keeps English prose with a quoted request', () => {
    const prose =
      'Serin climbed one more step. "Let me know if you would like to turn back," Yunseo said, and the fog swallowed the rest.'
    expect(isContinuationCommentary(prose)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  isValidTrim,
  paragraphTrimTask,
  TRIM_MIN_OVERLAP,
  trimOverlap,
} from '@/ai/tasks/paragraph-trim'
import type { ParagraphTrimItem } from '@/ai/tasks/paragraph-trim'

const FIVE_A =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'
const FIVE_B =
  '서윤은 편지를 펼쳤다. 글씨는 낯설었다. 종이는 눅눅했다. 끝에는 서명이 없었다. 그는 한참을 서 있었다.'
const FIVE_C =
  '탑의 종이 울렸다. 사람들이 광장에 모였다. 노인이 앞으로 나섰다. 아이들은 조용했다. 해가 기울기 시작했다.'
const A_SPLIT =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다.\n\n발소리가 멀어졌다. 그녀는 숨을 죽였다.'
const B_SPLIT =
  '서윤은 편지를 펼쳤다. 글씨는 낯설었다. 종이는 눅눅했다.\n\n끝에는 서명이 없었다. 그는 한참을 서 있었다.'
const C_SPLIT =
  '탑의 종이 울렸다. 사람들이 광장에 모였다. 노인이 앞으로 나섰다.\n\n아이들은 조용했다. 해가 기울기 시작했다.'
const FOUR_A = '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다.'
const FOUR_B = '서윤은 편지를 펼쳤다. 글씨는 낯설었다. 종이는 눅눅했다. 끝에는 서명이 없었다.'
// FIVE_A with one more sentence: its three-two split is a valid rewrite of FIVE_A by length.
const NEAR_A = `${FIVE_A} 그는 떠났다.`
const NEAR_A_SPLIT = `${A_SPLIT} 그는 떠났다.`

describe('trimOverlap', () => {
  it('is TRIM_MIN_OVERLAP 0.6', () => {
    expect(TRIM_MIN_OVERLAP).toBe(0.6)
  })

  it('gives 1 for a text and the same text re-split into two paragraphs', () => {
    expect(trimOverlap(FIVE_A, A_SPLIT)).toBe(1)
  })

  it('gives less than 0.3 for two different four-sentence paragraphs', () => {
    expect(trimOverlap(FOUR_A, FOUR_B)).toBeLessThan(0.3)
  })

  it('gives 0 when either text has no bigrams', () => {
    expect(trimOverlap('', FIVE_A)).toBe(0)
    expect(trimOverlap('가', '가')).toBe(0)
  })
})

describe('paragraphTrimTask postProcess overlap check', () => {
  it('drops answers that are shifted by one target', () => {
    const items: ParagraphTrimItem[] = [
      { index: 0, text: FIVE_A, before: null, after: FIVE_B },
      { index: 1, text: FIVE_B, before: FIVE_A, after: FIVE_C },
      { index: 2, text: FIVE_C, before: FIVE_B, after: null },
    ]
    // Answer for index 0 is target 1 re-split, index 1 is target 2, index 2 is target 0.
    const processed = paragraphTrimTask.postProcess?.(
      {
        paragraphs: [
          { index: 0, text: B_SPLIT },
          { index: 1, text: C_SPLIT },
          { index: 2, text: A_SPLIT },
        ],
      },
      { maxSentences: 3, items },
    )
    expect(processed?.paragraphs).toEqual([])
  })

  it('keeps a correct answer that only adds a paragraph break', () => {
    const processed = paragraphTrimTask.postProcess?.(
      { paragraphs: [{ index: 1, text: A_SPLIT }] },
      {
        maxSentences: 3,
        items: [{ index: 1, text: FIVE_A, before: FIVE_B, after: FIVE_C }],
      },
    )
    expect(processed?.paragraphs).toEqual([{ index: 1, text: A_SPLIT }])
  })

  it('drops an answer equal to its after neighbour re-split, even when its length passes', () => {
    const items: ParagraphTrimItem[] = [{ index: 1, text: FIVE_A, before: null, after: NEAR_A }]
    expect(isValidTrim(FIVE_A, NEAR_A_SPLIT, 3)).toBe(true)
    const processed = paragraphTrimTask.postProcess?.(
      { paragraphs: [{ index: 1, text: NEAR_A_SPLIT }] },
      { maxSentences: 3, items },
    )
    expect(processed?.paragraphs).toEqual([])
  })
})

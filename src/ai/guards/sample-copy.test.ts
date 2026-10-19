import { describe, expect, it } from 'vitest'
import { sampleCopies } from './sample-copy'

const examples = [
  '안개가 계단을 반쯤 삼키고 있었다. 세린은 왼손으로 난간을 짚었다. 쇠가 손바닥에 들러붙을 만큼 차가웠다.',
]

describe('sampleCopies', () => {
  it('flags a near copy of a style-card sentence with offsets and score', () => {
    const draft = '비가 그쳤다. 쇠가 손바닥에 달라붙을 만큼 차가웠다. 그녀는 계단을 올랐다.'
    expect(sampleCopies(draft, examples)).toEqual([
      {
        start: 8,
        end: 29,
        text: '쇠가 손바닥에 달라붙을 만큼 차가웠다.',
        example: '쇠가 손바닥에 들러붙을 만큼 차가웠다.',
        score: 0.8,
      },
    ])
  })

  it('flags the haiku copy that exact matching misses', () => {
    const hits = sampleCopies('쇠가 손바닥에 달라붙을 만큼 차가워서', examples)
    expect(hits).toHaveLength(1)
    expect(hits[0].score).toBe(0.667)
  })

  it('flags an embedded copy through containment when Dice misses it', () => {
    const draft = '쇠가 손바닥에 달라붙을 만큼 차가웠다는 것을 그녀는 그제야 알았다.'
    const hits = sampleCopies(draft, examples)
    expect(hits).toHaveLength(1)
    expect(hits[0].score).toBe(0.714)
  })

  it('does not flag a paraphrase', () => {
    expect(sampleCopies('안개가 계단 절반을 가리고 있었다.', examples)).toEqual([])
  })

  it('does not flag an unrelated sentence', () => {
    expect(sampleCopies('그는 문고리를 쥐고 오래 서 있었다.', examples)).toEqual([])
  })

  it('never flags a sentence below minChars', () => {
    const short = '"여기 누구 있어?"'
    expect(sampleCopies(short, [short])).toEqual([])
  })

  it('matches English exactly and ignores short sentences', () => {
    const en = ['The fog had swallowed half the stairs. Serin braced her left hand on the railing.']
    const hits = sampleCopies('Rain fell. The fog had swallowed half the stairs. She waited.', en, {
      lang: 'en',
    })
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toBe('The fog had swallowed half the stairs.')
    expect(hits[0].score).toBe(1)
    expect(sampleCopies('Mist covered most of the steps.', en, { lang: 'en' })).toEqual([])
  })

  it('returns nothing without examples', () => {
    expect(sampleCopies('쇠가 손바닥에 달라붙을 만큼 차가워서', [])).toEqual([])
  })

  it('takes thresholds from options', () => {
    expect(
      sampleCopies('쇠가 손바닥에 달라붙을 만큼 차가워서', examples, {
        threshold: 0.7,
        minContainment: 0.6,
      }),
    ).toEqual([])
  })
})

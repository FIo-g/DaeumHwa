import { describe, expect, it } from 'vitest'
import { chapterMetrics } from './metrics'

const SAMPLE = '안개가 계단을 반쯤 삼키고 있었다.'
const A = '오른손을 들었다.'
const ORDINARY = '세린은 문을 닫았다. 종이 울렸다. 그녀는 오래 서 있었다.'

describe('chapterMetrics sampleCopyHits and repeatedWords', () => {
  it('counts a copied style-card sentence when the examples are passed', () => {
    const metrics = chapterMetrics(`세린은 문을 닫았다. ${SAMPLE}`, 'ko', 500, [SAMPLE])
    expect(metrics.sampleCopyHits).toBe(1)
  })

  it('lists a word repeated 10 times', () => {
    const metrics = chapterMetrics(`${A} `.repeat(10), 'ko', 500)
    expect(metrics.repeatedWords).toEqual([{ word: '오른손', count: 10 }])
  })

  it('reports zero and nothing for ordinary text', () => {
    const metrics = chapterMetrics(ORDINARY, 'ko', 500, [SAMPLE])
    expect(metrics.sampleCopyHits).toBe(0)
    expect(metrics.repeatedWords).toEqual([])
  })

  it('reports zero copies when no examples are passed', () => {
    const metrics = chapterMetrics(`세린은 문을 닫았다. ${SAMPLE}`, 'ko', 500)
    expect(metrics.sampleCopyHits).toBe(0)
  })
})

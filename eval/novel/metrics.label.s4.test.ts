import { describe, expect, it } from 'vitest'
import { chapterMetrics } from './metrics'

describe('chapterMetrics trailing plan label', () => {
  it('lists a trailing 회차 끝 line in metaHits', () => {
    const text = '“…지금 누가 종 건드렸어?”\n\n회차 끝'
    const result = chapterMetrics(text, 'ko', 10)
    expect(result.metaHits).toContain('회차 끝')
  })
})

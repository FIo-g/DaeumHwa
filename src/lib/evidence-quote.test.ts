import { describe, expect, it } from 'vitest'
import { verifyEvidenceQuote } from '@/lib/evidence-quote'

describe('verifyEvidenceQuote', () => {
  it('returns the quote when it appears exactly in the source', () => {
    expect(verifyEvidenceQuote('서윤은 말이 없었다. 창가에 앉았다.', '서윤은 말이 없었다.')).toBe(
      '서윤은 말이 없었다.',
    )
  })

  it('returns the source slice for a whitespace variant', () => {
    expect(verifyEvidenceQuote('서윤은  검을\n쓴다.', '서윤은 검을 쓴다.')).toBe(
      '서윤은  검을\n쓴다.',
    )
  })

  it('rejects a quote with an altered character', () => {
    expect(
      verifyEvidenceQuote('4층 이상은 철문으로 막혀 있었다.', '4층 이상은 철문로 막혀 있었다.'),
    ).toBeNull()
  })

  it('rejects empty and blank evidence', () => {
    expect(verifyEvidenceQuote('서윤은 말이 없었다.', '')).toBeNull()
    expect(verifyEvidenceQuote('서윤은 말이 없었다.', '  ')).toBeNull()
  })

  it('matches a quote written against the neutralized source and returns the raw slice', () => {
    expect(verifyEvidenceQuote('그가 </x 라고 썼다.', '그가 ＜/x 라고 썼다.')).toBe(
      '그가 </x 라고 썼다.',
    )
  })

  it('is case-sensitive', () => {
    expect(verifyEvidenceQuote('Seoyun', 'seoyun')).toBeNull()
  })
})

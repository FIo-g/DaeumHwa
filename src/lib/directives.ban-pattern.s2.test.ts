import { describe, expect, it } from 'vitest'
import { banPatternFor, matchBan } from '@/lib/directives'

// Stage 2 review fixes, group C (C3): banPatternFor keeps the last word of a dictionary form.

describe('banPatternFor: one-syllable stems keep their verb', () => {
  it('keeps the verb of 고개를 젓다', () => {
    expect(banPatternFor("'고개를 젓다'는 쓰지 않는다.")).toBe('고개를 젓')
  })

  it('keeps the verb of 눈을 감다', () => {
    expect(banPatternFor("'눈을 감다'는 쓰지 않는다.")).toBe('눈을 감')
  })

  it('keeps the verb of 미소 짓다', () => {
    expect(banPatternFor("'미소 짓다'는 쓰지 않는다.")).toBe('미소 짓')
  })

  it('still drops 다 and the last syllable from a longer stem', () => {
    expect(banPatternFor("'고개를 끄덕이다'는 쓰지 않는다.")).toBe('고개를 끄덕')
  })

  it('does not match an unrelated use of the object after the fix', () => {
    const pattern = banPatternFor("'고개를 젓다'는 쓰지 않는다.")
    expect(matchBan('그는 고개를 들었다.', pattern)).toEqual([])
  })

  it('matches the stem of 눈을 감다 in an inflection', () => {
    expect(matchBan('눈을 감았다.', banPatternFor("'눈을 감다'는 쓰지 않는다."))).toHaveLength(1)
  })
})

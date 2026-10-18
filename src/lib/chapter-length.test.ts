import { describe, expect, it } from 'vitest'
import { lengthShortfall, shortfallMessage } from '@/lib/chapter-length'

describe('lengthShortfall', () => {
  it('returns the percent of the target when the chapter is short', () => {
    expect(lengthShortfall(4265, 5500)).toEqual({ percent: 78 })
  })

  it('returns null when the chapter reaches the target', () => {
    expect(lengthShortfall(5500, 5500)).toBeNull()
    expect(lengthShortfall(6000, 5500)).toBeNull()
  })

  it('returns null when there is no positive target', () => {
    expect(lengthShortfall(100, 0)).toBeNull()
  })
})

describe('shortfallMessage', () => {
  it('states the target, the count and the percent', () => {
    expect(shortfallMessage(4265, 5500)).toBe(
      '목표 5,500자 중 4,265자(78%)입니다. 그래도 완료할까요?',
    )
  })
})

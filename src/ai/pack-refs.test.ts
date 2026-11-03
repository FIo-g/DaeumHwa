import { describe, expect, it } from 'vitest'
import { stripPackRefs } from '@/ai/pack-refs'

describe('stripPackRefs', () => {
  it('drops a bracketed fact ref and the status tag after it', () => {
    expect(stripPackRefs('[F1][확정] 서윤은 왼손잡이다.')).toBe('서윤은 왼손잡이다.')
  })

  it('drops a bracketed entry or thread ref and the space after it', () => {
    expect(stripPackRefs('[E2] 잿빛 종루')).toBe('잿빛 종루')
    expect(stripPackRefs('[T1] 어머니의 편지')).toBe('어머니의 편지')
  })

  it('drops a ref that sits between a wiki word and a particle', () => {
    expect(stripPackRefs('위키 F1에 따르면 서윤은 왼손잡이로 확정되어 있는데')).toBe(
      '위키에 따르면 서윤은 왼손잡이로 확정되어 있는데',
    )
  })

  it('picks the particle form for the word before the ref', () => {
    expect(stripPackRefs('설정 F12와 다릅니다')).toBe('설정과 다릅니다')
  })

  it('leaves a bare ref with no wiki word before it alone', () => {
    expect(stripPackRefs('F1 레이스를 봤다')).toBe('F1 레이스를 봤다')
  })

  it('returns text without refs unchanged', () => {
    expect(stripPackRefs('서윤은 왼손잡이다.')).toBe('서윤은 왼손잡이다.')
  })
})

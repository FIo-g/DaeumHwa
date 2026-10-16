import { describe, expect, it } from 'vitest'
import { JOSA, hasJongseong, jongseongIndex, stripJosa } from '@/lib/korean/josa'

describe('stripJosa', () => {
  it('strips trailing particles', () => {
    expect(stripJosa('서윤이가')).toBe('서윤')
    expect(stripJosa('민준의')).toBe('민준')
    expect(stripJosa('세계관은')).toBe('세계관')
    expect(stripJosa('왕국에서는')).toBe('왕국')
  })

  it('keeps words whose ending only looks like a particle', () => {
    expect(stripJosa('수이')).toBe('수이')
    expect(stripJosa('나리')).toBe('나리')
  })
})

describe('jongseong helpers', () => {
  it('detects a final consonant', () => {
    expect(hasJongseong('준')).toBe(true)
    expect(hasJongseong('서')).toBe(false)
    expect(hasJongseong('a')).toBe(false)
  })

  it('returns the jongseong index, or -1 for non-syllables', () => {
    expect(jongseongIndex('서')).toBe(0)
    expect(jongseongIndex('준')).toBe(4)
    expect(jongseongIndex('a')).toBe(-1)
  })
})

describe('JOSA', () => {
  it('contains the particles listed in the spec, longest first', () => {
    for (const p of ['은', '이', '에게서', '이라도', '입니다', '이에요']) {
      expect(JOSA).toContain(p)
    }
    for (let i = 1; i < JOSA.length; i++) {
      expect(JOSA[i - 1].length).toBeGreaterThanOrEqual(JOSA[i].length)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  JOSA,
  findNameMatch,
  hasJongseong,
  jongseongIndex,
  josaStrippedForms,
  matchesName,
  stripJosa,
} from '@/lib/korean/josa'

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

describe('josaStrippedForms', () => {
  it('returns the word, then each shorter form after removing particles', () => {
    expect(josaStrippedForms('김서아가')).toEqual(['김서아가', '김서아', '김서'])
    expect(josaStrippedForms('김서은')).toEqual(['김서은', '김서'])
    expect(josaStrippedForms('서윤이')).toEqual(['서윤이', '서윤'])
  })

  it('keeps a word whose ending only looks like a particle', () => {
    expect(josaStrippedForms('수이')).toEqual(['수이'])
  })
})

describe('matchesName and findNameMatch', () => {
  it('matches the name itself and the name with particles', () => {
    expect(matchesName('서윤', '서윤')).toBe(true)
    expect(matchesName('서윤이', '서윤')).toBe(true)
    expect(matchesName('김서아가', '김서아')).toBe(true)
  })

  it('does not treat a different name that shares a stripped form as the same person', () => {
    expect(matchesName('김서은', '김서아')).toBe(false)
    expect(matchesName('김서은', '김서')).toBe(true)
  })

  it('does not match an empty name', () => {
    expect(matchesName('', '')).toBe(false)
    expect(findNameMatch('  ', [{ name: '' }], (i) => [i.name])).toBeUndefined()
  })

  it('prefers an exact name over one reached by stripping particles', () => {
    const items = [{ name: '서윤' }, { name: '서윤이' }]
    expect(findNameMatch('서윤이', items, (i) => [i.name])).toBe(items[1])
  })

  it('finds a sister by her own name, not a sibling sharing the stripped form', () => {
    const items = [{ name: '김서아', aliases: [] as string[] }]
    expect(findNameMatch('김서은', items, (i) => [i.name, ...i.aliases])).toBeUndefined()
    expect(findNameMatch('김서아가', items, (i) => [i.name, ...i.aliases])).toBe(items[0])
  })
})

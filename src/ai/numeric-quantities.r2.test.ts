import { describe, expect, it } from 'vitest'
import {
  eventWords,
  parseEnglishNumber,
  QUANTITY_LABEL,
  readQuantities,
} from '@/ai/numeric-quantities'

// Readers for the numeric fact check (P13): ages, years, floor counts and headcounts.

describe('parseEnglishNumber', () => {
  it.each([
    ['sixteen', 16],
    ['Twenty-seven', 27],
    ['twenty seven', 27],
    ['ninety', 90],
    ['7', 7],
    ['zero', 0],
    ['nineteen', 19],
  ])('reads %s as %i', (input, expected) => {
    expect(parseEnglishNumber(input)).toBe(expected)
  })

  it.each(['twenty-ten', 'hundred', 'twenty-', 'constructor', '1206', ''])(
    'returns null for %j',
    (input) => {
      expect(parseEnglishNumber(input)).toBeNull()
    },
  )
})

describe('readQuantities: age', () => {
  it('reads the Korean digit form', () => {
    expect(readQuantities('27살', 'age')).toEqual([
      {
        kind: 'age',
        value: 27,
        token: '27',
        tokenStart: 0,
        tokenEnd: 2,
        start: 0,
        end: 3,
        needsSubject: false,
      },
    ])
  })

  it('reads English words, digits and aged', () => {
    const [words] = readQuantities('Mara Voss was twenty-two years old.', 'age')
    expect(words).toMatchObject({
      value: 22,
      token: 'twenty-two',
      start: 14,
      end: 34,
      tokenStart: 14,
      tokenEnd: 24,
      needsSubject: true,
    })
    expect(readQuantities('Mara Voss was 22 years old.', 'age')[0]).toMatchObject({
      value: 22,
      token: '22',
    })
    expect(readQuantities('Mara Voss was aged 22.', 'age')[0]).toMatchObject({
      value: 22,
      tokenStart: 19,
      tokenEnd: 21,
    })
    expect(readQuantities('Mara Voss was Twenty Two Years Old.', 'age')[0]).toMatchObject({
      value: 22,
      token: 'Twenty Two',
    })
  })

  it('does not read a hyphenated adjective or a comparison', () => {
    expect(readQuantities('Mara Voss helped a five-year-old girl.', 'age')).toEqual([])
    expect(readQuantities('Mara was five years older than Jon.', 'age')).toEqual([])
  })

  it('returns every quantity in text order', () => {
    const found = readQuantities('25살과 30살 사이', 'age')
    expect(found.map((q) => q.value)).toEqual([25, 30])
  })
})

describe('readQuantities: year', () => {
  it('reads a three or four digit year', () => {
    expect(readQuantities('잿빛 왕국은 312년에 건국되었다.', 'year')[0]).toMatchObject({
      value: 312,
      token: '312',
    })
    expect(readQuantities('Harrow Keep was built in 1204.', 'year')[0]).toMatchObject({
      value: 1204,
      tokenStart: 25,
    })
    expect(readQuantities('built in the year 1204', 'year')[0]).toMatchObject({ value: 1204 })
    expect(readQuantities('The year 1204 was cold.', 'year')[0]).toMatchObject({ value: 1204 })
  })

  it('skips durations, decades and two-digit numbers', () => {
    for (const text of [
      '12년에',
      '413년 동안',
      '413년 만에',
      '1990년대에',
      '413년 전에',
      'in 1204 men',
    ]) {
      expect(readQuantities(text, 'year')).toEqual([])
    }
  })
})

describe('readQuantities: floor', () => {
  it('reads the closed total forms', () => {
    expect(readQuantities('12층 높이의 건물', 'floor')[0].value).toBe(12)
    expect(readQuantities('12층짜리 건물', 'floor')[0].value).toBe(12)
    expect(readQuantities('14층으로 솟아', 'floor')[0].value).toBe(14)
    expect(readQuantities('모두 12층이었다', 'floor')[0]).toMatchObject({
      value: 12,
      tokenStart: 3,
    })
    expect(readQuantities('a nine-story fortress', 'floor')[0]).toMatchObject({
      value: 9,
      token: 'nine',
    })
    expect(readQuantities('a 7-story fortress', 'floor')[0].value).toBe(7)
    expect(readQuantities('seven stories tall', 'floor')[0].value).toBe(7)
    expect(readQuantities('rose seven stories above', 'floor')[0]).toMatchObject({
      value: 7,
      tokenStart: 5,
    })
  })

  it('does not read positions or ordinals', () => {
    for (const text of [
      '등대 5층에서',
      'the fourth story',
      'a nine story tower',
      'the first two floors',
    ]) {
      expect(readQuantities(text, 'floor')).toEqual([])
    }
  })

  it('gives one quantity when two patterns read the same number', () => {
    const found = readQuantities('모두 12층짜리였다', 'floor')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ value: 12, tokenStart: 3 })
  })
})

describe('readQuantities: person', () => {
  it('reads the closed total forms', () => {
    expect(readQuantities('모두 7명이다', 'person')[0].value).toBe(7)
    expect(readQuantities('9명뿐이었다', 'person')[0].value).toBe(9)
    expect(readQuantities('only twelve guards', 'person')[0].value).toBe(12)
    expect(readQuantities('all nine soldiers', 'person')[0].value).toBe(9)
    expect(readQuantities('a total of 12 people', 'person')[0].value).toBe(12)
  })

  it('does not read a part of a group', () => {
    expect(readQuantities('3명을 보냈다', 'person')).toEqual([])
    expect(readQuantities('twelve guards', 'person')).toEqual([])
  })
})

describe('eventWords', () => {
  it('finds Korean and English event words', () => {
    expect([...eventWords('잿빛 왕국은 412년에 건국되었다.')].sort()).toEqual(['건국'])
    expect([...eventWords('Harrow Keep was built in 1204.')].sort()).toEqual(['built'])
    expect([...eventWords('')].sort()).toEqual([])
    expect([...eventWords('Harrow Keep fell. 멸망')].sort()).toEqual(['fell', '멸망'])
  })
})

describe('QUANTITY_LABEL', () => {
  it('has a Korean label and a counter for every kind', () => {
    expect(QUANTITY_LABEL.age).toEqual({ label: '나이', unit: '살' })
    expect(QUANTITY_LABEL.year).toEqual({ label: '연도', unit: '년' })
    expect(QUANTITY_LABEL.floor).toEqual({ label: '층수', unit: '층' })
    expect(QUANTITY_LABEL.person).toEqual({ label: '인원', unit: '명' })
  })
})

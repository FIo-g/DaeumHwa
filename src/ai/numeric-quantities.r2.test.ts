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

describe('readQuantities: whole numbers only', () => {
  it('does not read a token that starts inside a longer number', () => {
    expect(readQuantities('새벽 호위대는 3000명뿐이었다.', 'person')).toEqual([])
    expect(readQuantities('새벽 호위대는 1,000명밖에 없었다.', 'person')).toEqual([])
    expect(readQuantities('잿빛 왕국은 1,412년에 건국되었다.', 'year')).toEqual([])
    expect(readQuantities('잿빛 왕국은 12345년에 건국되었다.', 'year')).toEqual([])
    expect(readQuantities('Mara Voss was 1,020 years old.', 'age')).toEqual([])
    expect(readQuantities('마라는 1020살이다.', 'age')).toEqual([])
  })

  it('still reads the whole number', () => {
    expect(readQuantities('잿빛 왕국은 1412년에 건국되었다.', 'year')[0]).toMatchObject({
      value: 1412,
      token: '1412',
    })
    expect(readQuantities('새벽 호위대는 900명뿐이었다.', 'person')[0].value).toBe(900)
  })

  it('gives no single value for a range', () => {
    expect(readQuantities('은빛 등대는 12~13층 높이로 솟아 있었다.', 'floor')).toEqual([])
    expect(readQuantities('은빛 등대는 12에서 13층 높이였다.', 'floor')).toEqual([])
    expect(readQuantities('잿빛 왕국은 412~413년 사이에 건국되었다.', 'year')).toEqual([])
    expect(readQuantities('새벽 호위대는 7~8명뿐이었다.', 'person')).toEqual([])
    expect(readQuantities('Harrow Keep was nine or ten stories tall.', 'floor')).toEqual([])
    expect(readQuantities('Harrow Keep was nine to ten stories tall.', 'floor')).toEqual([])
  })

  it('does not read a number of a hundred or more written in words', () => {
    expect(readQuantities('Mara Voss was a hundred and twenty years old.', 'age')).toEqual([])
    expect(readQuantities('Mara Voss was one hundred and twenty years old.', 'age')).toEqual([])
    expect(readQuantities('Harrow Keep was a hundred and two stories tall.', 'floor')).toEqual([])
    expect(readQuantities('three hundred twenty years old', 'age')).toEqual([])
    expect(readQuantities('aged one hundred and five', 'age')).toEqual([])
  })
})

describe('readQuantities: durations, bounds and aging (FX4)', () => {
  it('a duration after an event word is not a year (F3)', () => {
    expect(readQuantities('잿빛 왕국은 건국된 지 500년이 지났다', 'year')).toEqual([])
    expect(readQuantities('잿빛 왕국은 건국 500년을 맞았다', 'year')).toEqual([])
    expect(readQuantities('잿빛 왕국은 건국 이래 300년을 버텼다', 'year')).toEqual([])
    expect(readQuantities('잿빛 왕국은 건국되고 300년이 흘렀다', 'year')).toEqual([])
  })

  it('an absolute year still reads (F3 control)', () => {
    expect(readQuantities('잿빛 왕국은 412년에 건국되었다.', 'year')[0]).toMatchObject({
      value: 412,
    })
    expect(readQuantities('잿빛 왕국은 412년이었다.', 'year')[0]).toMatchObject({ value: 412 })
  })

  it('an English year followed by a noun is not a year (F3)', () => {
    expect(readQuantities('Harrow Keep was built in 300 nights.', 'year')).toEqual([])
    expect(readQuantities('Harrow Keep was built in 1204 by the king.', 'year')[0]).toMatchObject({
      value: 1204,
    })
  })

  it('"had aged N years" is not an age (F9)', () => {
    expect(readQuantities('Mara Voss had aged twenty two years.', 'age')).toEqual([])
    expect(readQuantities('Mara Voss has aged ten years in a single night.', 'age')).toEqual([])
    expect(readQuantities('Mara Voss was aged twenty-two.', 'age')[0]).toMatchObject({ value: 22 })
  })
})

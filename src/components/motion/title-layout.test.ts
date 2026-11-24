import { describe, expect, it } from 'vitest'
import { titleCells, titleRows } from './title-layout'

function lines(text: string, columns: number) {
  return titleRows(titleCells(text), columns).map((row) =>
    row.map(({ glyph }) => glyph || ' ').join(''),
  )
}

describe('title row layout', () => {
  it.each([
    ['샘플 원고로 먼저 돌려 보세요', 14, ['샘플 원고로 먼저', '돌려 보세요']],
    ['샘플 원고로 먼저 돌려 보세요', 16, ['샘플 원고로 먼저 돌려 보세요']],
    ['떡밥은 심은 화부터 거둘 화까지', 9, ['떡밥은 심은', '화부터', '거둘 화까지']],
    ['떡밥은 심은 화부터 거둘 화까지', 10, ['떡밥은 심은 화부터', '거둘 화까지']],
    ['3화 종루의 손짓', 7, ['3화', '종루의 손짓']],
    ['3화 종루의 손짓', 5, ['3화', '종루의', '손짓']],
    ['3화 종루의 손짓', 9, ['3화 종루의 손짓']],
  ])('lays out %s in %i columns', (title, width, expected) => {
    expect(lines(title, width)).toEqual(expected)
  })

  it('splits an overlong word by grapheme and keeps the other words together', () => {
    expect(lines('가나다라마바사 안녕', 4)).toEqual(['가나다라', '마바사', '안녕'])
    expect(lines('한👩‍🎨 글', 2)).toEqual(['한👩‍🎨', '글'])
  })

  it('preserves internal spaces and drops separators at the row edge', () => {
    expect(lines('내  작품 새 원고', 5)).toEqual(['내  작품', '새 원고'])
    expect(lines('    ', 3)).toEqual([])
  })
})

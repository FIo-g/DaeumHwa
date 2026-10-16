import { describe, expect, it } from 'vitest'
import { countChars } from '@/lib/korean/chars'

describe('countChars', () => {
  it('counts code points, excluding line breaks from the with-spaces count', () => {
    expect(countChars('가 나\n다')).toEqual({ withSpaces: 4, withoutSpaces: 3 })
  })

  it('returns zeros for empty text', () => {
    expect(countChars('')).toEqual({ withSpaces: 0, withoutSpaces: 0 })
  })

  it('counts an emoji as one character', () => {
    expect(countChars('😀 a')).toEqual({ withSpaces: 3, withoutSpaces: 2 })
  })

  it('excludes carriage returns from the with-spaces count', () => {
    expect(countChars('가\r\n나')).toEqual({ withSpaces: 2, withoutSpaces: 2 })
  })
})

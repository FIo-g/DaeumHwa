// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSampleChapter, markSampleChapter } from './sample-session'

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sample session flag', () => {
  it('remembers a marked chapter', () => {
    markSampleChapter('c3')

    expect(isSampleChapter('c3')).toBe(true)
  })

  it('does not report an unmarked chapter', () => {
    expect(isSampleChapter('c2')).toBe(false)
  })

  it('returns false without throwing when session storage is unavailable', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(() => markSampleChapter('c3')).not.toThrow()
    expect(isSampleChapter('c3')).toBe(false)
  })
})

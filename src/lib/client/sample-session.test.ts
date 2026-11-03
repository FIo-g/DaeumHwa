// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isSampleChapter,
  markAutoChecked,
  markSampleChapter,
  wasAutoChecked,
} from './sample-session'

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

describe('auto check flag', () => {
  it('remembers that a chapter already had its automatic check', () => {
    markAutoChecked('c3')

    expect(wasAutoChecked('c3')).toBe(true)
    expect(window.sessionStorage.getItem('daeumhwa:sample-checked:c3')).toBe('1')
  })

  it('does not report a chapter that was not checked automatically', () => {
    expect(wasAutoChecked('c2')).toBe(false)
  })

  it('returns false without throwing when session storage is unavailable', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(() => markAutoChecked('c3')).not.toThrow()
    expect(wasAutoChecked('c3')).toBe(false)
  })
})

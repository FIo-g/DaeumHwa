import { describe, expect, it } from 'vitest'
import { EN_SYSTEMS } from './en-systems'
import { draftExpandSample } from './samples/draft-expand'
import { findHangul, translateScaffold } from './scaffold'

// Stage 1b (length by scene expansion): the English draft-expand system and prompt have no Hangul.

describe('draft-expand English localization (stage 1b)', () => {
  it('has an English system with no Hangul', () => {
    expect(EN_SYSTEMS['draft-expand'].length).toBeGreaterThan(0)
    expect(findHangul(EN_SYSTEMS['draft-expand'])).toEqual([])
  })

  it('translates the expansion prompt without Hangul', () => {
    expect(findHangul(translateScaffold(draftExpandSample))).toEqual([])
    expect(translateScaffold(draftExpandSample)).toContain('about 2000 characters including spaces')
  })
})

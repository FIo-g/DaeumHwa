import { describe, expect, it } from 'vitest'
import { EN_TAG_DATA_RULE } from './en/shared'
import { EN_SYSTEMS } from './en-systems'
import { draftCheckSample } from './samples/draft-check'
import { findHangul, translateScaffold } from './scaffold'

// Stage 3 (cheap checks and flagged-scene fixes): the English draft-check system and prompt have no Hangul.

describe('draft-check English localization (stage 3)', () => {
  it('has an English system with no Hangul', () => {
    expect(EN_SYSTEMS['draft-check'].length).toBeGreaterThan(0)
    expect(findHangul(EN_SYSTEMS['draft-check'])).toEqual([])
  })

  it('translates the check prompt without Hangul', () => {
    expect(findHangul(translateScaffold(draftCheckSample))).toEqual([])
  })

  it('carries the check codes and ends with the shared rules', () => {
    for (const code of [
      'missing-event',
      'skipped-moment',
      'unmotivated-feeling',
      'repeated-beat',
      'flat-ending',
      'request',
      'leak',
    ]) {
      expect(EN_SYSTEMS['draft-check']).toContain(code)
    }
    const lines = EN_SYSTEMS['draft-check'].split('\n')
    expect(lines[lines.length - 1]).toBe('- Write all output in English.')
    expect(lines[lines.length - 2]).toBe(EN_TAG_DATA_RULE)
  })
})

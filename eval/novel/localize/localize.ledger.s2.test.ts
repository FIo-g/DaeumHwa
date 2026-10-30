import { describe, expect, it } from 'vitest'
import { draftPrefixSample, draftSample } from './samples/draft-chapter'
import { findHangul, translateScaffold } from './scaffold'

// Stage 2 (task 4): the English draft prefix, with the request block and the core entries, has no Hangul.

describe('draft prefix English localization (stage 2)', () => {
  it('translates the cached prefix without Hangul', () => {
    const prefix = translateScaffold(draftPrefixSample.join('\n\n'))
    expect(findHangul(prefix)).toEqual([])
  })

  it('translates each request line and the header', () => {
    const prefix = translateScaffold(draftPrefixSample.join('\n\n'))
    expect(prefix).toContain('<author_requests>')
    expect(prefix).toContain(
      "These are requests the author asked to keep. If one conflicts with this chapter's instructions, follow the instructions; otherwise keep them in every scene.",
    )
    expect(prefix).toContain('- [Whole work] Keep sentences short.')
    expect(prefix).toContain('- [Character Mina Park] Mina speaks casually. (speech: casual)')
    expect(prefix).toContain('- [Whole work] Do not write "nod". (do not write: nod)')
    expect(prefix).toContain(
      '- [Chapter 4 only] This chapter is long. (length: 3000 characters with spaces)',
    )
  })

  it('keeps the core entries and the previous text in English', () => {
    const prefix = translateScaffold(draftPrefixSample.join('\n\n'))
    expect(prefix).toContain(
      '<core_wiki>\n[E1] Mina Park (character)\n- Summary: A bell keeper.\n</core_wiki>',
    )
    expect(prefix).toContain('<previous_tail>\nThe door closed.\n</previous_tail>')
  })

  it('leaves the English rest of the prompt without Hangul too', () => {
    expect(findHangul(translateScaffold(draftSample))).toEqual([])
  })
})

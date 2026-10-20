import { describe, expect, it } from 'vitest'
import { splitScenes } from './scene'

// The scenes of a chapter text, split at its break lines (stage 1 scene lengths).

describe('splitScenes', () => {
  it('splits at a break line and trims each scene', () => {
    expect(splitScenes('a\n\n***\n\nb')).toEqual(['a', 'b'])
  })

  it('gives one segment when the text has no break line', () => {
    expect(splitScenes('  a\n\nb  ')).toEqual(['a\n\nb'])
  })
})

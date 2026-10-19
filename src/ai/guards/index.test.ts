import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ForeignSpan, Lang } from './index'

describe('guards barrel', () => {
  it('exports exactly the five public functions', async () => {
    const mod = await import('./index')
    expect(Object.keys(mod).sort()).toEqual([
      'foreignScriptRuns',
      'foreignScriptSpans',
      'isNearDuplicateFact',
      'repeatedWords',
      'sampleCopies',
    ])
  })

  it('exposes the foreign-script and language types', () => {
    expectTypeOf<ForeignSpan['script']>().toEqualTypeOf<
      'han' | 'kana' | 'cyrillic' | 'replacement' | 'latin' | 'hangul'
    >()
    expectTypeOf<Lang>().toEqualTypeOf<'ko' | 'en'>()
  })
})

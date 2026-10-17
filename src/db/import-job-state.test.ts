import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ImportJobRow } from '@/db/types'

// Compile-time check: imports.ts stores these fields in import_jobs.state, so the column type must list them.
describe('import job state type', () => {
  it('lists the skipped chapters and the in-flight cursor', () => {
    type State = ImportJobRow['state']
    expectTypeOf<State['skipped']>().toEqualTypeOf<
      { chapterId: string; position: number; title: string; reason: string }[] | undefined
    >()
    expectTypeOf<State['inFlight']>().toEqualTypeOf<{ cursor: number; at: string } | undefined>()

    const state: State = {
      knownEntities: [],
      threadTitles: [],
      skipped: [{ chapterId: 'c1', position: 2, title: '2화', reason: '분석 실패' }],
      inFlight: { cursor: 3, at: '2026-10-17T00:00:00.000Z' },
    }
    expect(state.skipped).toHaveLength(1)
  })
})

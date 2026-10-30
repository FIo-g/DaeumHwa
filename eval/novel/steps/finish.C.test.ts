import { describe, expect, it } from 'vitest'
import { RunSummarySchema } from './finish'

// Track C: the draft attempt's foreign-script figures must survive the run summary's schema.

const draftsSchema = RunSummarySchema.shape.drafts

describe('RunSummarySchema drafts', () => {
  it('keeps the foreign-script figures of an attempt', () => {
    const parsed = draftsSchema.parse({
      '1': [
        {
          runId: 'run-1',
          usable: true,
          quality: 4,
          reason: '',
          foreign: { found: 1, replaced: 1, unresolved: 0 },
        },
      ],
    })
    expect(parsed['1'][0].foreign).toEqual({ found: 1, replaced: 1, unresolved: 0 })
  })

  it('still parses an attempt without foreign-script figures', () => {
    const parsed = draftsSchema.parse({
      '1': [{ runId: 'run-1', usable: null, quality: null, reason: '' }],
    })
    expect(parsed['1'][0]).not.toHaveProperty('foreign')
  })
})

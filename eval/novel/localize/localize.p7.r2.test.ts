import { describe, expect, it } from 'vitest'
import { EN_TAG_DATA_RULE } from './en/shared'
import { READER_SIM_SYSTEM as EN_READER_SIM_SYSTEM } from './en/reader-sim'
import { EN_SYSTEMS } from './en-systems'
import { findHangul } from './scaffold'
import { READER_SIM_SYSTEM as KO_READER_SIM_SYSTEM } from '@/ai/tasks/reader-sim'

const EN_RULE =
  '- About earlier chapters, say only what <previous_summaries> states. Do not claim to have read an earlier chapter that is not listed there, or to have seen similar wording in one. If it says (none), rely on this manuscript alone.'

describe('English reader-sim system (round 2 P7)', () => {
  it('the English reader-sim system carries the earlier-chapters rule before the tag rule', () => {
    const system = EN_SYSTEMS['reader-sim']
    expect(system).toContain(EN_RULE)
    expect(system.indexOf(EN_RULE)).toBeLessThan(system.indexOf(EN_TAG_DATA_RULE))
    expect(system.split('\n')[system.split('\n').indexOf(EN_RULE) + 1]).toBe(EN_TAG_DATA_RULE)
  })

  it('the English reader-sim system has no Hangul', () => {
    expect(findHangul(EN_SYSTEMS['reader-sim'])).toEqual([])
    expect(findHangul(EN_READER_SIM_SYSTEM)).toEqual([])
  })

  it('both systems name previous_summaries', () => {
    expect(KO_READER_SIM_SYSTEM).toContain('<previous_summaries>')
    expect(EN_READER_SIM_SYSTEM).toContain('<previous_summaries>')
  })
})

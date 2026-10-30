import { describe, expect, it } from 'vitest'
import { EN_TAG_DATA_RULE } from './en/shared'
import { DRAFT_PLAN_SYSTEM } from './en/draft-plan'

// Stage 2 review fix B2: the English plan prompt keeps the author requests, before the tag-data rule.

const REQUEST_RULE =
  '- <author_requests> are requests the author asked to keep. Scene summaries and the ending (ending.line) must not break them.'

describe('English draft plan keeps the author requests (stage 2, B2)', () => {
  it('has the request rule line exactly once', () => {
    expect(DRAFT_PLAN_SYSTEM.split(REQUEST_RULE)).toHaveLength(2)
  })

  it('puts the request rule before the tag-data rule', () => {
    expect(DRAFT_PLAN_SYSTEM.indexOf(REQUEST_RULE)).toBeLessThan(
      DRAFT_PLAN_SYSTEM.indexOf(EN_TAG_DATA_RULE),
    )
  })
})

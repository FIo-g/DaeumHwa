import { describe, expect, it } from 'vitest'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import { DRAFT_PLAN_SYSTEM } from '@/ai/tasks/draft-plan'

// Stage 2 review fix B2: the plan prompt tells the model to keep the author requests, and the line
// sits before the tag-data rule that would otherwise read them as data.

const REQUEST_RULE =
  '- <author_requests>는 작가가 계속 지켜 달라고 한 요청이다. 장면 요약과 회차 끝(ending.line)도 그 요청을 어기지 않게 쓴다.'

describe('draft plan keeps the author requests (stage 2, B2)', () => {
  it('has the request rule line exactly once', () => {
    expect(DRAFT_PLAN_SYSTEM.split(REQUEST_RULE)).toHaveLength(2)
  })

  it('puts the request rule before the tag-data rule', () => {
    expect(DRAFT_PLAN_SYSTEM.indexOf(REQUEST_RULE)).toBeLessThan(
      DRAFT_PLAN_SYSTEM.indexOf(TAG_DATA_RULE),
    )
  })
})

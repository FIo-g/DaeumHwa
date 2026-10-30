// Stage 2 (task 6): the plan may suggest requests that must be kept beyond this chapter.
import { describe, expect, it } from 'vitest'
import { DRAFT_PLAN_SYSTEM, DraftPlanCardSchema, DraftPlanSchema } from '@/ai/tasks/draft-plan'

const scene = {
  summary: '성문 앞에 선다.',
  goal: '안으로 들어간다',
  decision: '',
  stake: '',
  trigger: '',
  role: 'opening',
  place: '성문',
  characters: [],
}
const plan = {
  scenes: [scene],
  ending: { device: 'question', line: '누가 문을 열었나?' },
  threads: [],
}

describe('DraftPlanSchema requests (stage 2)', () => {
  it('defaults requests to an empty list when the model leaves them out', () => {
    expect(DraftPlanSchema.parse(plan).requests).toEqual([])
  })

  it('accepts up to three requests', () => {
    const parsed = DraftPlanSchema.parse({
      ...plan,
      requests: ['윤서는 존댓말을 쓴다', '비 오는 장면은 피한다'],
    })
    expect(parsed.requests).toHaveLength(2)
  })

  it('rejects four requests', () => {
    expect(() => DraftPlanSchema.parse({ ...plan, requests: ['a', 'b', 'c', 'd'] })).toThrow()
  })

  it('rejects a request longer than 120 characters', () => {
    expect(() => DraftPlanSchema.parse({ ...plan, requests: ['가'.repeat(121)] })).toThrow()
  })

  it('has the requests rule line in the system prompt', () => {
    expect(DRAFT_PLAN_SYSTEM).toContain(
      'requests: 작가 지시나 메모 가운데 이번 화를 넘어 계속 지켜야 할 요청만 한 문장씩 적는다(최대 3개).',
    )
  })
})

describe('DraftPlanCardSchema requests (stage 2)', () => {
  const card = { ...plan, scenes: [{ ...scene, targetChars: 1250 }] }

  it('accepts a card without requests and defaults them to an empty list', () => {
    expect(DraftPlanCardSchema.parse(card).requests).toEqual([])
  })

  it('keeps requests sent back with the card', () => {
    const parsed = DraftPlanCardSchema.parse({ ...card, requests: ['윤서는 존댓말을 쓴다'] })
    expect(parsed.requests).toEqual(['윤서는 존댓말을 쓴다'])
  })
})

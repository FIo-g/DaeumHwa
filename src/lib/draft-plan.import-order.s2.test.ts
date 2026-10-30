// Stage 2 (task 6): the lib module and the task module import each other's constants, so the
// card schema must build correctly whichever module loads first.
import { describe, expect, it } from 'vitest'
// Loaded first on purpose: the lib module is the one that used to load the task module mid-cycle.
import {
  PLAN_LIST_MAX,
  PLAN_REQUEST_MAX,
  PLAN_REQUEST_TEXT_MAX,
  PLAN_TEXT_MAX,
} from '@/lib/draft-plan'
import { DraftPlanCardSchema, PLAN_REQUEST_MAX as TASK_REQUEST_MAX } from '@/ai/tasks/draft-plan'

describe('draft plan module load order (stage 2)', () => {
  it('builds the card schema with the limits defined', () => {
    expect(PLAN_TEXT_MAX).toBe(400)
    expect(PLAN_LIST_MAX).toBe(12)
    expect(PLAN_REQUEST_MAX).toBe(3)
    expect(PLAN_REQUEST_TEXT_MAX).toBe(120)
    expect(TASK_REQUEST_MAX).toBe(PLAN_REQUEST_MAX)
  })

  it('accepts a valid revision card with a suggested request', () => {
    const card = {
      scenes: [
        {
          summary: '성문 앞에 선다.',
          goal: '안으로 들어간다',
          decision: '',
          stake: '',
          trigger: '',
          role: 'opening',
          place: '성문',
          characters: ['윤서'],
          targetChars: 800,
        },
      ],
      ending: { device: 'question', line: '누가 문을 열었나?' },
      threads: [],
      requests: ['윤서는 존댓말을 쓴다'],
    }
    expect(DraftPlanCardSchema.safeParse(card).success).toBe(true)
  })
})

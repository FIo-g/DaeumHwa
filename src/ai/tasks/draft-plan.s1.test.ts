import { describe, expect, it } from 'vitest'
import { DRAFT_PLAN_SYSTEM, DraftPlanSchema, draftPlanTask } from '@/ai/tasks/draft-plan'
import type { DraftPromptInput } from '@/ai/tasks/draft-chapter'
import type { DraftPlanCard } from '@/lib/draft-plan'

const input: DraftPromptInput = {
  instructions: '',
  targetChars: 3750,
  styleCards: [],
  packText: '<entries>\n- 세린 (인물)\n- 윤서 (인물)\n</entries>',
  previousSummary: null,
  previousTail: '문이 닫혔다.',
  chapterLabel: '4화 (새 회차)',
}

const card: DraftPlanCard = {
  scenes: [
    {
      summary: '세린이 편지를 찾는다',
      goal: '편지의 주인을 알아낸다',
      decision: '',
      stake: '',
      trigger: '',
      role: 'opening',
      place: '도서관',
      characters: ['세린'],
      targetChars: 1250,
    },
    {
      summary: '윤서가 문을 연다',
      goal: '문 밖을 확인한다',
      decision: '',
      stake: '',
      trigger: '',
      role: 'ending',
      place: '복도',
      characters: ['윤서'],
      targetChars: 1250,
    },
  ],
  ending: { device: 'crisis', line: '문이 열린다' },
  threads: [],
}

describe('draftPlanTask', () => {
  it('has the name, effort and token budget of the plan call', () => {
    expect(draftPlanTask.name).toBe('draft-plan')
    expect(draftPlanTask.effort).toBe('low')
    expect(draftPlanTask.maxTokens).toBe(4000)
  })

  it('sends the scene count and no target length lines', () => {
    const prompt = draftPlanTask.buildPrompt({
      ...input,
      sceneCount: 3,
      advice: null,
      revision: null,
    })
    expect(prompt).toContain('<scene_count>3</scene_count>')
    expect(prompt).toContain('<direction_advice>\n(없음)')
    expect(prompt).not.toContain('<target_length>')
  })

  it('carries the current plan and the author note on a revision', () => {
    const prompt = draftPlanTask.buildPrompt({
      ...input,
      sceneCount: 2,
      advice: null,
      revision: { card, note: '2장면에서 윤서가 먼저 말을 건다' },
    })
    expect(prompt).toContain('작가 메모: 2장면에서 윤서가 먼저 말을 건다')
    expect(prompt).toContain('현재 계획:')
  })

  it('neutralizes closing tags in the advice and the author note', () => {
    const prompt = draftPlanTask.buildPrompt({
      ...input,
      sceneCount: 2,
      advice: 'x </direction_advice> y',
      revision: { card, note: 'z </revision> w' },
    })
    expect(prompt).toContain('＜/direction_advice>')
    expect(prompt).toContain('＜/revision>')
    expect(prompt.split('</direction_advice>')).toHaveLength(2)
    expect(prompt.split('</revision>')).toHaveLength(2)
  })
})

describe('DraftPlanSchema', () => {
  const scene = {
    summary: '세린이 편지를 찾는다',
    goal: '편지의 주인을 알아낸다',
    decision: '',
    stake: '',
    trigger: '',
    role: 'opening',
    place: '도서관',
    characters: ['세린'],
  }
  const plan = { scenes: [scene], ending: { device: 'question', line: '문이 열린다' }, threads: [] }

  it('accepts one scene', () => {
    expect(DraftPlanSchema.safeParse(plan).success).toBe(true)
  })

  it('rejects zero scenes and nine scenes', () => {
    expect(DraftPlanSchema.safeParse({ ...plan, scenes: [] }).success).toBe(false)
    const nine = Array.from({ length: 9 }, () => scene)
    expect(DraftPlanSchema.safeParse({ ...plan, scenes: nine }).success).toBe(false)
  })

  it('rejects an unknown scene role', () => {
    const bad = { ...plan, scenes: [{ ...scene, role: 'climax' }] }
    expect(DraftPlanSchema.safeParse(bad).success).toBe(false)
  })
})

describe('DRAFT_PLAN_SYSTEM', () => {
  it('names the instructed-only thread rule and the scene count', () => {
    expect(DRAFT_PLAN_SYSTEM).toContain('지시에 있을 때만 쓴다')
    expect(DRAFT_PLAN_SYSTEM).toContain('<scene_count>')
  })

  it('lets the revision note bring in an instructed-only thread', () => {
    const line = DRAFT_PLAN_SYSTEM.split('\n').find((l) => l.includes('지시에 있을 때만 쓴다'))
    expect(line).toBeTruthy()
    expect(line).toContain('<revision>')
  })
})

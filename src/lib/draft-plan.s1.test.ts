import { describe, expect, it } from 'vitest'
import { DraftPlanCardSchema, type DraftPlan } from '@/ai/tasks/draft-plan'
import {
  clampPlan,
  type DraftPlanCard,
  PLAN_LIST_MAX,
  PLAN_TEXT_MAX,
  planWarnings,
  renderPlanInstructions,
  withSceneTargets,
} from '@/lib/draft-plan'

const plan: DraftPlan = {
  scenes: [
    {
      summary: '세린이 편지를 찾는다',
      goal: '편지의 주인을 알아낸다',
      decision: '편지를 숨기기로 한다',
      stake: '들키면 잃는 것이 많다',
      trigger: '윤서의 발소리',
      role: 'opening',
      place: '도서관',
      characters: ['세린', '윤서'],
    },
    {
      summary: '윤서가 문을 연다',
      goal: '문 밖을 확인한다',
      decision: '',
      stake: '',
      trigger: '',
      role: 'ending',
      place: '복도',
      characters: [],
    },
  ],
  ending: { device: 'crisis', line: '문이 열린다' },
  threads: ['편지 봉인'],
}

const role = (r: DraftPlan['scenes'][number]['role']) => ({
  summary: '장면',
  goal: '목표',
  decision: '',
  stake: '',
  trigger: '',
  role: r,
  place: '복도',
  characters: [],
})

/** A model output that goes over every card cap: 401-character texts, 13 names and 13 threads. */
function oversizedPlan(): DraftPlan {
  const long = '가'.repeat(401)
  return {
    scenes: [
      {
        ...plan.scenes[0],
        goal: long,
        characters: Array.from({ length: 13 }, (_, i) => `인물${i}`),
      },
    ],
    ending: { device: 'crisis', line: long },
    threads: Array.from({ length: 13 }, (_, i) => `떡밥${i}`),
  }
}

describe('clampPlan', () => {
  it('cuts texts to the card limit, and names and threads to the list limit', () => {
    const clamped = clampPlan(oversizedPlan())
    expect(clamped.scenes[0].goal).toHaveLength(PLAN_TEXT_MAX)
    expect(clamped.ending.line).toHaveLength(PLAN_TEXT_MAX)
    expect(clamped.scenes[0].characters).toHaveLength(PLAN_LIST_MAX)
    expect(clamped.threads).toHaveLength(PLAN_LIST_MAX)
    expect(clamped.threads[0]).toBe('떡밥0')
  })

  it('trims text before it cuts it and never splits a surrogate pair', () => {
    const clamped = clampPlan({
      ...plan,
      scenes: [{ ...plan.scenes[0], summary: `  ${'가'.repeat(399)}😀😀  ` }],
    })
    const summary = clamped.scenes[0].summary
    expect(summary.length).toBeLessThanOrEqual(PLAN_TEXT_MAX)
    expect(summary.endsWith('가')).toBe(true)
  })
})

describe('withSceneTargets', () => {
  it('returns a card that the card schema accepts, even for an oversized plan', () => {
    const card = withSceneTargets(oversizedPlan(), 5000)
    expect(DraftPlanCardSchema.safeParse(card).success).toBe(true)
    expect(card.threads).toHaveLength(12)
    expect(card.scenes[0].goal).toHaveLength(400)
  })

  it('gives every scene an equal share of the target', () => {
    const four: DraftPlan = {
      ...plan,
      scenes: [plan.scenes[0], plan.scenes[1], plan.scenes[0], plan.scenes[1]],
    }
    const card = withSceneTargets(four, 5000)
    expect(card.scenes.map((s) => s.targetChars)).toEqual([1250, 1250, 1250, 1250])
  })
})

describe('renderPlanInstructions', () => {
  it('renders the plan card as the draft instructions', () => {
    const card: DraftPlanCard = withSceneTargets(plan, 2500)
    expect(renderPlanInstructions('세린이 먼저 묻는다', card)).toBe(
      [
        '작가 메모: 세린이 먼저 묻는다',
        '아래 회차 계획을 따라 쓴다. 장면이 바뀔 때는 빈 줄, *** 한 줄, 빈 줄을 둔다. 장면마다 적힌 분량을 채운다. 마지막 장면은 요약이나 교훈으로 닫지 말고 "회차 끝"에 적힌 장면으로 끝낸다.',
        '장면 1 (도입, 공백 포함 약 1,250자)',
        '- 일어나는 일: 세린이 편지를 찾는다',
        '- 목표: 편지의 주인을 알아낸다',
        '- 결정 상태: 편지를 숨기기로 한다',
        '- 기대한 것과 잃은 것: 들키면 잃는 것이 많다',
        '- 감정의 계기: 윤서의 발소리',
        '- 장소: 도서관 / 인물: 세린, 윤서',
        '장면 2 (회차 끝, 공백 포함 약 1,250자)',
        '- 일어나는 일: 윤서가 문을 연다',
        '- 목표: 문 밖을 확인한다',
        '- 장소: 복도 / 인물: (없음)',
        '회차 끝 (위기): 문이 열린다',
        '움직일 떡밥: 편지 봉인',
      ].join('\n'),
    )
  })
})

describe('planWarnings', () => {
  it('warns about two scenes of the same beat and a last scene that is not the ending', () => {
    const card = withSceneTargets(
      { ...plan, scenes: [role('opening'), role('rise'), role('rise')] },
      3000,
    )
    expect(planWarnings(card)).toEqual([
      "2번째와 3번째 장면이 둘 다 '고조'입니다. 같은 박자가 이어질 수 있어요.",
      "마지막 장면이 '회차 끝'이 아닙니다.",
    ])
  })

  it('gives no warning for a clean beat order', () => {
    const card = withSceneTargets(
      { ...plan, scenes: [role('opening'), role('turn'), role('ending')] },
      3000,
    )
    expect(planWarnings(card)).toEqual([])
  })
})

describe('plan card limits', () => {
  it('rejects a card summary one character over the text limit', () => {
    const card = withSceneTargets(plan, 2500)
    const over = {
      ...card,
      scenes: [
        { ...card.scenes[0], summary: '가'.repeat(PLAN_TEXT_MAX + 1) },
        ...card.scenes.slice(1),
      ],
    }
    expect(DraftPlanCardSchema.safeParse(over).success).toBe(false)
  })
})

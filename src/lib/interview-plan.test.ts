import { describe, expect, it } from 'vitest'
import { CORE_TOPICS } from '@/ai/tasks/interview-question'
import {
  canonicalTopic,
  isMultiAsk,
  isUndecidedAnswer,
  normalizeQuestion,
  type PlanTurn,
  planInterviewTopics,
  violatesPlan,
} from './interview-plan'

const CORE_NAMES = CORE_TOPICS.map((topic) => topic.name)

function turn(
  topic: string,
  answer: string | null,
  options: { skipped?: boolean; focus?: 'setting' | 'story' } = {},
): PlanTurn {
  return { topic, answer, skipped: options.skipped ?? false, focus: options.focus ?? 'setting' }
}

describe('isUndecidedAnswer', () => {
  it('reads the undecided phrasings as undecided', () => {
    for (const answer of [
      '미정',
      ' 미정. ',
      '그건 아직 정하지 않았어요.',
      '아직 정하지 않았어요. 그건 미정이에요.',
      'That is not decided yet.',
      "That isn't decided yet.",
      "I don't know yet.",
    ]) {
      expect(isUndecidedAnswer(answer), answer).toBe(true)
    }
  })

  it('reads answers with content, and blank or missing answers, as not undecided', () => {
    for (const answer of [
      '서윤은 시계탑 수리공이다.',
      '미정이 아니라 서윤이다',
      '미정인 떡밥이 있다',
      '결말은 아직 정하지 않았어요. 세린이 종루 지하에서 어머니의 흔적을 찾는다는 방향만 정했어요.',
      '',
      null,
    ]) {
      expect(isUndecidedAnswer(answer), String(answer)).toBe(false)
    }
  })

  it('documents a phrasing it does not match (partial answer with content)', () => {
    expect(isUndecidedAnswer('아직 드러나지 않아요')).toBe(false)
  })

  it('returns false for an answer over 120 characters before any pattern runs', () => {
    // The pattern would match this filler run, so only the length check can reject it.
    expect(isUndecidedAnswer(`${'음'.repeat(118)}미정`)).toBe(true)
    expect(isUndecidedAnswer(`${'음'.repeat(119)}미정`)).toBe(false)
  })

  it('finishes quickly on a long filler run that ends without a match', () => {
    const started = performance.now()
    expect(isUndecidedAnswer(`${'음'.repeat(60)}가`)).toBe(false)
    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe('canonicalTopic', () => {
  it('maps a topic that contains a core name to that core name', () => {
    expect(canonicalTopic('주인공의 목표', CORE_TOPICS)).toBe('주인공')
    expect(canonicalTopic('세계관', CORE_TOPICS)).toBe('세계관 규칙')
  })

  it('maps English aliases to the core name', () => {
    expect(canonicalTopic('protagonist', CORE_TOPICS)).toBe('주인공')
    expect(canonicalTopic('main characters', CORE_TOPICS)).toBe('주요 인물')
    expect(canonicalTopic('World Rules', CORE_TOPICS)).toBe('세계관 규칙')
  })

  it('keeps an exact core name with a space', () => {
    expect(canonicalTopic('주요 인물', CORE_TOPICS)).toBe('주요 인물')
  })

  it('returns the compacted topic when no core topic matches', () => {
    expect(canonicalTopic('다음 전개', CORE_TOPICS)).toBe('다음전개')
  })

  it('only lists the protagonist alias for 주인공', () => {
    const protagonist = CORE_TOPICS.find((topic) => topic.name === '주인공')
    expect(protagonist?.aliases).toEqual(['protagonist'])
  })
})

describe('planInterviewTopics', () => {
  it('closes a topic answered with 미정 and leaves the rest of the core open', () => {
    const plan = planInterviewTopics([turn('주인공', '미정')], CORE_TOPICS)
    expect(plan.closedTopics).toEqual(['주인공'])
    expect(plan.remainingCore).toHaveLength(7)
    expect(plan.remainingCore).not.toContain('주인공')
    expect(plan.undecidedStreak).toBe(1)
    expect(plan.storyDue).toBe(false)
  })

  it('closes a skipped topic but does not count it toward the streak', () => {
    const plan = planInterviewTopics([turn('주인공', null, { skipped: true })], CORE_TOPICS)
    expect(plan.closedTopics).toEqual(['주인공'])
    expect(plan.undecidedStreak).toBe(0)
  })

  it('counts two 미정 answers in a row as a streak of 2', () => {
    const plan = planInterviewTopics(
      [turn('주인공', '미정'), turn('주요 인물', '미정')],
      CORE_TOPICS,
    )
    expect(plan.undecidedStreak).toBe(2)
    expect(plan.closedTopics).toEqual(['주인공', '주요 인물'])
  })

  it('breaks the streak at an answer with content', () => {
    expect(
      planInterviewTopics(
        [turn('주인공', '미정'), turn('주요 인물', '민준은 스승이다'), turn('세계관 규칙', '미정')],
        CORE_TOPICS,
      ).undecidedStreak,
    ).toBe(1)
    expect(
      planInterviewTopics(
        [turn('주인공', '미정'), turn('주요 인물', '미정'), turn('세계관 규칙', '규칙이 있다')],
        CORE_TOPICS,
      ).undecidedStreak,
    ).toBe(0)
  })

  it('does not let skipped turns break the streak', () => {
    const plan = planInterviewTopics(
      [
        turn('주인공', '미정'),
        turn('주요 인물', null, { skipped: true }),
        turn('세계관 규칙', '미정'),
      ],
      CORE_TOPICS,
    )
    expect(plan.undecidedStreak).toBe(2)
  })

  it('uses the latest non-open turn of a topic', () => {
    const plan = planInterviewTopics(
      [turn('주인공', '미정'), turn('주인공', '주인공은 서윤이다')],
      CORE_TOPICS,
    )
    expect(plan.closedTopics).not.toContain('주인공')
  })

  it('treats an open turn as touched but not as a status', () => {
    const plan = planInterviewTopics([turn('주인공', '미정'), turn('주인공', null)], CORE_TOPICS)
    expect(plan.closedTopics).toEqual(['주인공'])
    expect(plan.remainingCore).not.toContain('주인공')
  })

  it('lists a non-core topic by its raw text when it is closed', () => {
    const plan = planInterviewTopics([turn('다음 전개', '미정', { focus: 'story' })], CORE_TOPICS)
    expect(plan.closedTopics).toEqual(['다음 전개'])
  })

  it('reports storyDue once every core topic has a turn', () => {
    const turns = CORE_NAMES.map((name, index) =>
      turn(name, index === 0 ? '미정' : '내용이 있는 답'),
    )
    const plan = planInterviewTopics(turns, CORE_TOPICS)
    expect(plan.remainingCore).toEqual([])
    expect(plan.storyDue).toBe(true)
    expect(plan.closedTopics).toEqual(['주인공'])
  })
})

describe('violatesPlan', () => {
  const plan = {
    closedTopics: ['주인공'],
    remainingCore: ['주요 인물'],
    undecidedStreak: 1,
    storyDue: false,
  }

  it('flags a question on a closed topic, even under another label for it', () => {
    expect(violatesPlan({ focus: 'setting', topic: '주인공 성격' }, plan, CORE_TOPICS)).toBe(true)
  })

  it('accepts a question on a remaining topic', () => {
    expect(violatesPlan({ focus: 'setting', topic: '주요 인물' }, plan, CORE_TOPICS)).toBe(false)
  })

  it('flags a setting question once storyDue is set', () => {
    expect(
      violatesPlan(
        { focus: 'setting', topic: '문체' },
        { ...plan, closedTopics: [], storyDue: true },
        CORE_TOPICS,
      ),
    ).toBe(true)
  })

  it('accepts a story question once storyDue is set', () => {
    expect(
      violatesPlan(
        { focus: 'story', topic: '다음 전개' },
        { ...plan, closedTopics: [], storyDue: true },
        CORE_TOPICS,
      ),
    ).toBe(false)
  })
})

describe('isMultiAsk', () => {
  it('accepts a single question', () => {
    expect(isMultiAsk('주인공은 누구인가요?')).toBe(false)
    expect(isMultiAsk('주인공은 어떤 사람인가요?')).toBe(false)
  })

  it('flags two sentences', () => {
    expect(isMultiAsk('주인공은 누구인가요? 관계도 알려 주세요.')).toBe(true)
  })

  it('flags two question marks', () => {
    expect(isMultiAsk('누구인가요? 어디 사나요?')).toBe(true)
  })

  it('flags a comma-joined compound with one question mark', () => {
    expect(isMultiAsk('주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?')).toBe(true)
  })

  it('flags a conjunction word', () => {
    expect(isMultiAsk('주인공의 목표와 그리고 약점은 무엇인가요?')).toBe(true)
  })
})

describe('normalizeQuestion', () => {
  it('removes whitespace and punctuation', () => {
    expect(normalizeQuestion('주인공은 누구인가요?')).toBe(normalizeQuestion('주인공은 누구인가요'))
    expect(normalizeQuestion(' 주인공 은, 누구 인가요 ')).toBe('주인공은누구인가요')
  })
})

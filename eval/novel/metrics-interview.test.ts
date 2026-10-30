import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CORE_TOPICS } from '@/ai/tasks/interview-question'
import * as metrics from './metrics'
import { type InterviewTurnStat, interviewMetrics } from './metrics-interview'

// Brief I: the interview metrics, computed from the turn stats the eval records.

const UNDECIDED = '그건 아직 정하지 않았어요.'
const CONTENT = '서윤은 시계탑 수리공이다.'
const CORE_NAMES = CORE_TOPICS.map((topic) => topic.name)

function stat(
  topic: string,
  question: string,
  answer: string | null,
  options: { skipped?: boolean; focus?: 'setting' | 'story' } = {},
): InterviewTurnStat {
  return {
    turnId: `${topic}-${question}-${answer}-${Math.random()}`,
    focus: options.focus ?? 'setting',
    topic,
    question,
    answer,
    skipped: options.skipped ?? false,
  }
}

describe('interviewMetrics', () => {
  it('returns zeros, not NaN, for no turns', () => {
    expect(interviewMetrics([])).toEqual({
      asked: 0,
      answered: 0,
      undecided: 0,
      undecidedShare: 0,
      setting: 0,
      story: 0,
      storyShare: 0,
      duplicateQuestions: 0,
      sameTopicAfterUndecided: 0,
      multiAsk: 0,
      storyAfterCoreDone: 0,
      undecidedShareInBank: 0,
    })
  })

  it('reproduces the luna ko shape: 9 of 12 answers undecided, no story question', () => {
    const turns = Array.from({ length: 12 }, (_, i) =>
      stat(`주제${i}`, `질문 ${i}번째`, i < 9 ? UNDECIDED : CONTENT),
    )
    const result = interviewMetrics(turns)
    expect(result.asked).toBe(12)
    expect(result.answered).toBe(12)
    expect(result.undecided).toBe(9)
    expect(result.undecidedShare).toBe(0.75)
    expect(result.story).toBe(0)
    expect(result.storyShare).toBe(0)
  })

  it('counts a repeated question once, ignoring punctuation and spacing', () => {
    const result = interviewMetrics([
      stat('주인공', '주인공은 누구인가요?', CONTENT),
      stat('주인공', '주인공은 누구인가요', CONTENT),
    ])
    expect(result.duplicateQuestions).toBe(1)
  })

  it('counts a topic asked again after 미정 under a closed label', () => {
    const result = interviewMetrics([
      stat('주인공', '첫 질문', UNDECIDED),
      stat('주인공 성격', '둘째 질문', CONTENT),
    ])
    expect(result.sameTopicAfterUndecided).toBe(1)
  })

  it('does not count a question after a content answer on the topic (the reopening counts once)', () => {
    // Turn 2 is asked while the topic is still closed, so it counts. Turn 3 follows a content
    // answer, so the topic is open again and it does not count.
    const result = interviewMetrics([
      stat('주인공', '첫 질문', UNDECIDED),
      stat('주인공', '다시 묻기', CONTENT),
      stat('주인공 성격', '셋째 질문', CONTENT),
    ])
    expect(result.sameTopicAfterUndecided).toBe(1)
  })

  it('looks past an open turn to the closed one before it', () => {
    // The open turn is asked while the topic is closed, so it counts; the third turn still sees
    // the closure before the open turn, because open turns never change the status.
    const result = interviewMetrics([
      stat('주인공', '첫 질문', UNDECIDED),
      stat('주인공', '열린 질문', null),
      stat('주인공 성격', '셋째 질문', CONTENT),
    ])
    expect(result.sameTopicAfterUndecided).toBe(2)
  })

  it('counts a skipped topic as closed', () => {
    const result = interviewMetrics([
      stat('주인공', '첫 질문', null, { skipped: true }),
      stat('주인공 성격', '둘째 질문', CONTENT),
    ])
    expect(result.sameTopicAfterUndecided).toBe(1)
  })

  it('counts answered as answers that are not null, so skipped and open turns are not answered', () => {
    const result = interviewMetrics([
      stat('주인공', '건너뜀', null, { skipped: true }),
      stat('주요 인물', '열림', null),
      stat('세계관 규칙', '답함', CONTENT),
    ])
    expect(result.asked).toBe(3)
    expect(result.answered).toBe(1)
    expect(result.undecidedShare).toBe(0)
  })

  it('counts storyAfterCoreDone from the turn that first touches the eighth core topic', () => {
    const coreTurns = CORE_NAMES.map((name) => stat(name, `${name} 질문`, CONTENT))
    const storyTurns = Array.from({ length: 3 }, (_, i) =>
      stat('다음 전개', `이야기 질문 ${i}`, CONTENT, { focus: 'story' }),
    )
    expect(interviewMetrics([...coreTurns, ...storyTurns]).storyAfterCoreDone).toBe(3)
  })

  it('is zero when fewer than eight core topics appear', () => {
    const coreTurns = CORE_NAMES.slice(0, 7).map((name) => stat(name, `${name} 질문`, CONTENT))
    const storyTurns = Array.from({ length: 3 }, (_, i) =>
      stat('다음 전개', `이야기 질문 ${i}`, CONTENT, { focus: 'story' }),
    )
    expect(interviewMetrics([...coreTurns, ...storyTurns]).storyAfterCoreDone).toBe(0)
  })

  it('leaves non-core undecided answers out of undecidedShareInBank', () => {
    const bankOnly = interviewMetrics([
      stat('주인공', '핵심 질문', CONTENT),
      stat('다음 전개', '비핵심 질문', UNDECIDED, { focus: 'story' }),
    ])
    expect(bankOnly.undecidedShare).toBe(0.5)
    expect(bankOnly.undecidedShareInBank).toBe(0)

    const mixed = interviewMetrics([
      stat('주인공', '핵심 질문', UNDECIDED),
      stat('주요 인물', '핵심 질문 2', CONTENT),
      stat('다음 전개', '비핵심 질문', UNDECIDED, { focus: 'story' }),
    ])
    expect(mixed.undecidedShareInBank).toBe(0.5)
  })

  it('counts multi-ask questions with the heuristic from lib', () => {
    const result = interviewMetrics([
      stat('주인공', '주인공은 누구인가요? 관계도 알려 주세요.', CONTENT),
      stat('주요 인물', '주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?', CONTENT),
      stat('세계관 규칙', '주인공은 어떤 사람인가요?', CONTENT),
    ])
    expect(result.multiAsk).toBe(2)
  })

  it('counts setting and story turns separately', () => {
    const result = interviewMetrics([
      stat('주인공', '설정 질문', CONTENT),
      stat('다음 전개', '이야기 질문', CONTENT, { focus: 'story' }),
    ])
    expect(result.setting).toBe(1)
    expect(result.story).toBe(1)
    expect(result.storyShare).toBe(0.5)
  })
})

describe('metrics-interview module', () => {
  it('does not import anything from src/server', () => {
    const source = readFileSync(new URL('./metrics-interview.ts', import.meta.url), 'utf8')
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line))
    expect(importLines.length).toBeGreaterThan(0)
    for (const line of importLines) expect(line).not.toMatch(/server/)
  })

  it('is re-exported from metrics.ts', () => {
    expect(typeof metrics.interviewMetrics).toBe('function')
  })
})

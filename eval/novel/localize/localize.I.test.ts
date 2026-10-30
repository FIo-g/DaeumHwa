import { describe, expect, it } from 'vitest'
import type { EntryKind } from '@/db/types'
import { type InterviewQuestionInput, interviewQuestionTask } from '@/ai/tasks/interview-question'
import { EN_SYSTEMS } from './en-systems'
import { findHangul, translateScaffold } from './scaffold'
import { KINDS } from './samples/shared'

// Brief I: the English interview prompt carries the plan, the closure and one-ask rules, and the
// plan block is translated without Korean left behind.

const baseInput: InterviewQuestionInput = {
  work: {
    title: 'The Clock Tower Courier',
    genre: 'mystery',
    logline: 'A courier finds a stopped clock.',
    synopsis: 'Mina delivers letters that should never arrive.',
  },
  wiki: {
    counts: Object.fromEntries(KINDS.map((kind, i) => [kind, i])) as Record<EntryKind, number>,
    entries: [{ name: 'Mina Park', kind: 'character', factCount: 3, summary: 'A courier' }],
    openThreads: [],
  },
  story: {
    latestPosition: null,
    recentSummaries: [],
    readerReactions: [],
    openIssueCount: 0,
  },
  covered: [],
  coveredDropped: 0,
  recent: [],
  rejected: null,
}

const CORE_LEFT_KO = [
  '주요 인물',
  '세계관 규칙',
  '주요 장소',
  '중심 갈등',
  '떡밥',
  '결말 방향',
  '문체',
]

describe('English interview prompt with a plan (brief I)', () => {
  it('translates every Korean line of the plan block, including the core names', () => {
    const prompt = interviewQuestionTask.buildPrompt({
      ...baseInput,
      plan: {
        closedTopics: ['protagonist'],
        remainingCore: CORE_LEFT_KO,
        undecidedStreak: 2,
        storyDue: false,
      },
    })
    expect(prompt).toContain('<plan>')
    const translated = translateScaffold(prompt)
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('Consecutive undecided answers: 2')
    expect(translated).toContain('Remaining core settings: main characters, world rules')
  })

  it('keeps a non-core Korean closed topic as written (documented, not asserted Hangul-free)', () => {
    const prompt = interviewQuestionTask.buildPrompt({
      ...baseInput,
      plan: {
        closedTopics: ['다음 전개'],
        remainingCore: [],
        undecidedStreak: 0,
        storyDue: true,
      },
    })
    const translated = translateScaffold(prompt)
    expect(translated).toContain('다음 전개')
    expect(translated).toContain('Next question direction: switch to a story question')
  })

  it('states the closure, one-ask and plan rules in the English system prompt', () => {
    const system = EN_SYSTEMS['interview-question']
    expect(system).toContain('closed')
    expect(system).toContain('one question')
    expect(system).toContain('Lines inside the <plan> tag')
    expect(findHangul(system)).toEqual([])
  })

  it('keeps the English system free of Hangul with the plan rules added', () => {
    expect(findHangul(EN_SYSTEMS['interview-question'])).toEqual([])
  })
})

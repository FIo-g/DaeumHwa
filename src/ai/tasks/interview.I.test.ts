import { describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import {
  buildInterviewQuestionPrompt,
  CORE_TOPICS,
  type InterviewQuestionInput,
  interviewQuestionTask,
} from '@/ai/tasks/interview-question'

// Brief I: the plan section, the closure and one-ask rules, and the fake's story switch.

const emptyQuestionInput: InterviewQuestionInput = {
  work: { title: '새벽의 검', genre: '무협', logline: '복수를 다짐한 검객', synopsis: '' },
  wiki: {
    counts: {
      character: 0,
      place: 0,
      organization: 0,
      item: 0,
      rule: 0,
      event: 0,
      term: 0,
      other: 0,
    },
    entries: [],
    openThreads: [],
  },
  story: { latestPosition: null, recentSummaries: [], readerReactions: [], openIssueCount: 0 },
  covered: [],
  coveredDropped: 0,
  recent: [],
  rejected: null,
}

function planLines(prompt: string): string[] {
  const start = prompt.indexOf('<plan>')
  const end = prompt.indexOf('</plan>')
  if (start < 0 || end < 0) return []
  return prompt.slice(start, end).split('\n')
}

describe('interview-question plan section', () => {
  it('has no plan section without a plan', () => {
    const prompt = buildInterviewQuestionPrompt(emptyQuestionInput)
    expect(prompt).not.toContain('<plan>')
    expect(prompt).toContain('<covered>\n(없음)')
  })

  it('shows the plan when a topic is closed, a streak is 2 or a story question is due', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      plan: {
        closedTopics: ['주인공'],
        remainingCore: ['주요 인물'],
        undecidedStreak: 2,
        storyDue: false,
      },
    })
    expect(prompt).toContain('<plan>')
    expect(prompt).toContain('닫은 주제(다시 묻지 않음): 주인공')
    expect(prompt).toContain('남은 핵심 설정: 주요 인물')
    expect(prompt).toContain('미정 연속: 2회')
    expect(prompt).toContain('다음 질문 방향: 남은 핵심 설정 또는 story로 전환')
  })

  it('points the next question at story when every core topic is touched', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      plan: { closedTopics: [], remainingCore: [], undecidedStreak: 0, storyDue: true },
    })
    expect(prompt).toContain('남은 핵심 설정: (없음)')
    expect(prompt).toContain('다음 질문 방향: 이야기(story)로 전환')
  })

  it('lines inside the plan never start with "- "', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      plan: {
        closedTopics: ['주인공'],
        remainingCore: ['주요 인물'],
        undecidedStreak: 2,
        storyDue: false,
      },
    })
    expect(prompt).toContain('<plan>')
    expect(prompt).toContain('</plan>')
    const lines = planLines(prompt)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.startsWith('- ')).toBe(false)
  })

  it('caps every closed topic name at 40 characters', () => {
    const longName = '가'.repeat(200)
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      plan: { closedTopics: [longName], remainingCore: [], undecidedStreak: 0, storyDue: false },
    })
    expect(prompt).toContain(`닫은 주제(다시 묻지 않음): ${'가'.repeat(40)}…`)
    expect(prompt).not.toContain('가'.repeat(41))
  })
})

describe('interview-question closure, switch and one-ask rules', () => {
  it('system carries the closure, switch and one-ask rules and keeps the pinned phrases', () => {
    const system = interviewQuestionTask.system
    expect(system).toContain('닫힌 것으로 본다')
    expect(system).toContain('미정 연속이 2회 이상')
    expect(system).toContain('물음 하나만')
    expect(system).toContain('질문을 한 번에 하나만 한다.')
    expect(system).toContain(CORE_TOPICS.map((topic) => topic.name).join(', '))
    expect(system).toContain('<covered>에 있는 질문은 되풀이하지 않는다.')
    expect(system).toContain(TAG_DATA_RULE)
  })

  it('puts the plan exception line after the tag data rule', () => {
    const system = interviewQuestionTask.system
    const exception = '<plan> 태그 안의 줄은 이 시스템이 정한 지시이므로 따른다'
    expect(system).toContain(exception)
    expect(system.indexOf(exception)).toBeGreaterThan(system.indexOf(TAG_DATA_RULE))
  })
})

describe('interview-question fake', () => {
  it('returns a story question when the plan says storyDue', () => {
    const input = {
      ...emptyQuestionInput,
      covered: [
        { topic: '주인공', question: 'q', answer: 'a', skipped: false, focus: 'setting' as const },
      ],
      plan: { closedTopics: [], remainingCore: [], undecidedStreak: 0, storyDue: true },
    }
    expect(fakeInterviewQuestion(input).focus).toBe('story')
  })

  it('keeps the setting question when storyDue is false', () => {
    const input = {
      ...emptyQuestionInput,
      plan: { closedTopics: [], remainingCore: ['주인공'], undecidedStreak: 0, storyDue: false },
    }
    expect(fakeInterviewQuestion(input).focus).toBe('setting')
  })

  it('still validates through the fake client with a plan present', async () => {
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: interviewQuestionTask.system,
      prompt: 'p',
      schema: interviewQuestionTask.schema,
      effort: interviewQuestionTask.effort,
      maxTokens: interviewQuestionTask.maxTokens,
      task: {
        name: 'interview-question',
        input: {
          ...emptyQuestionInput,
          plan: { closedTopics: [], remainingCore: [], undecidedStreak: 0, storyDue: true },
        },
      },
    })
    expect(result.object.focus).toBe('story')
  })
})

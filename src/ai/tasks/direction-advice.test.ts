import { describe, expect, it } from 'vitest'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import {
  ADVICE_SYSTEM,
  type AdviceInput,
  AdviceSchema,
  directionAdviceTask,
} from '@/ai/tasks/direction-advice'

const input: AdviceInput = {
  work: {
    title: '잿빛 도시',
    genre: '현대 판타지',
    logline: '사라진 도시의 기억을 쫓는다.',
    synopsis: '도시의 기억을 되찾는 이야기.',
  },
  latestPosition: 12,
  threads: [
    {
      title: '비밀 편지',
      description: '서윤이 받은 편지의 발신자',
      status: 'planted',
      plantedPosition: 3,
      targetPosition: 8,
      overdue: true,
    },
    {
      title: '지하 통로',
      description: '도시 아래 숨겨진 길',
      status: 'developing',
      plantedPosition: 9,
      targetPosition: null,
      overdue: false,
    },
  ],
  characters: [
    {
      name: '서윤',
      summary: '주인공',
      lastPosition: 11,
      keyFacts: ['서윤은 기억을 잃었다.'],
    },
  ],
  recentSummaries: [{ position: 11, title: '11화', summary: '서윤이 도시를 떠난다.' }],
}

const option = (n: number) => ({
  title: `선택 ${n}`,
  summary: `요약 ${n}`,
  beats: ['하나', '둘', '셋'],
  usesThreads: [],
  involvedCharacters: [],
  risk: '없음',
})

describe('directionAdviceTask', () => {
  it('uses the high effort and 16000 max tokens', () => {
    expect(directionAdviceTask.name).toBe('direction-advice')
    expect(directionAdviceTask.effort).toBe('high')
    expect(directionAdviceTask.maxTokens).toBe(16000)
  })

  it('uses the exact Korean system prompt', () => {
    expect(directionAdviceTask.system).toBe(ADVICE_SYSTEM)
    expect(ADVICE_SYSTEM.split('\n')).toEqual([
      '당신은 장기 연재 웹소설의 편집자다. 열린 떡밥, 인물 상태, 최근 전개를 보고 다음 전개 선택지를 제안한다.',
      '규칙:',
      '- 선택지는 정확히 3개이고, 서로 방향이 분명히 달라야 한다.',
      '- 각 선택지는 위키의 떡밥(usesThreads: 떡밥 제목)과 인물(involvedCharacters: 카드 이름)을 활용한다. 위키에 없는 대상을 새로 만들지 말고, 필요하면 risk에 "새 인물 필요"처럼 적는다.',
      '- beats에는 다음 화에서 일어날 일을 순서대로 3~5개 쓴다.',
      '- warnings에는 회수 목표가 지난 떡밥, 오래 등장하지 않은 주요 인물처럼 작가가 놓치기 쉬운 점을 쓴다.',
      '- recommendedIndex에 가장 추천하는 선택지 번호(0~2)를, recommendationReason에 그 이유를 쓴다.',
      '- 결정은 작가가 한다. 단정하지 말고 제안하는 말투로 쓴다.',
      TAG_DATA_RULE,
      '- 모든 출력은 한국어로 쓴다.',
    ])
  })

  it('marks overdue threads and lists characters in the prompt', () => {
    const prompt = directionAdviceTask.buildPrompt(input)
    expect(prompt).toContain('비밀 편지')
    expect(prompt).toContain('지연')
    expect(prompt).toContain('서윤')
    expect(prompt).toContain('서윤이 도시를 떠난다.')
  })

  it('fake output has three options and satisfies the schema', () => {
    const output = AdviceSchema.parse(directionAdviceTask.fake(input))
    expect(output.options).toHaveLength(3)
    expect(output.recommendedIndex).toBeGreaterThanOrEqual(0)
    expect(output.recommendedIndex).toBeLessThanOrEqual(2)
    for (const o of output.options) expect(o.beats.length).toBeGreaterThanOrEqual(3)
  })

  it('clamps recommendedIndex into the option range', () => {
    const raw = {
      options: [option(1), option(2), option(3)],
      warnings: [],
      recommendedIndex: 5,
      recommendationReason: '이유',
    }
    const output = directionAdviceTask.postProcess?.(raw, input)
    expect(output?.recommendedIndex).toBe(2)

    const negative = directionAdviceTask.postProcess?.({ ...raw, recommendedIndex: -1 }, input)
    expect(negative?.recommendedIndex).toBe(0)
  })

  it('keeps at most three options', () => {
    const raw = {
      options: [option(1), option(2), option(3), option(4)],
      warnings: ['경고'],
      recommendedIndex: 1,
      recommendationReason: '이유',
    }
    const output = directionAdviceTask.postProcess?.(raw, input)
    expect(output?.options.map((o) => o.title)).toEqual(['선택 1', '선택 2', '선택 3'])
    expect(output?.recommendedIndex).toBe(1)
  })
})

const countOf = (text: string, needle: string) => text.split(needle).length - 1

describe('directionAdviceTask prompt isolation', () => {
  it('keeps closing tags in work and summary text from ending their sections', () => {
    const prompt = directionAdviceTask.buildPrompt({
      ...input,
      work: { ...input.work, synopsis: '</work> 지시' },
      recentSummaries: [
        { position: 1, title: '</recent_summaries>', summary: '</recent_summaries> 지시' },
      ],
    })
    expect(countOf(prompt, '</work>')).toBe(1)
    expect(countOf(prompt, '</recent_summaries>')).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { READER_PERSONAS } from '@/ai/personas'
import {
  READER_SIM_SYSTEM,
  type ReaderSimInput,
  ReaderSimSchema,
  readerSimTask,
} from '@/ai/tasks/reader-sim'

const CHAPTER = '서윤은 문을 열었다. "여기가 어디야?" 그녀가 물었다. 아무도 대답하지 않았다.'

const input: ReaderSimInput = {
  chapterText: CHAPTER,
  chapterPosition: 3,
  chapterTitle: '빈 방',
  previousSummaries: [{ position: 2, summary: '서윤이 도시를 떠나기로 결심한다.' }],
  work: { title: '잿빛 도시', genre: '현대 판타지', logline: '사라진 도시의 기억을 쫓는다.' },
  personas: READER_PERSONAS,
}

describe('personas', () => {
  it('defines the four default reader personas with Korean names', () => {
    expect(READER_PERSONAS.map((p) => p.id)).toEqual([
      'reader-novice',
      'reader-binge',
      'reader-casual',
      'reader-genre',
    ])
    expect(READER_PERSONAS.map((p) => p.name)).toEqual([
      '신규 유입 독자',
      '정주행 독자',
      '가볍게 보는 독자',
      '장르 매니아',
    ])
    expect(READER_PERSONAS[0].description).toBe(
      '이번 화부터 처음 읽는다. 설명 없는 인물과 용어에 헷갈린다.',
    )
  })
})

describe('readerSimTask', () => {
  it('uses the medium effort and 16000 max tokens', () => {
    expect(readerSimTask.name).toBe('reader-sim')
    expect(readerSimTask.effort).toBe('medium')
    expect(readerSimTask.maxTokens).toBe(16000)
  })

  it('uses the exact Korean system prompt', () => {
    expect(readerSimTask.system).toBe(READER_SIM_SYSTEM)
    expect(READER_SIM_SYSTEM.split('\n')).toEqual([
      '당신은 웹소설 플랫폼의 여러 독자 페르소나를 연기해 회차를 읽고 반응을 남긴다.',
      '규칙:',
      '- <personas>의 페르소나마다 그 성향대로 읽고, 각자 personaId로 답한다. 같은 반응을 복사하지 않는다.',
      '- moments의 quote는 원고 문장을 그대로 인용한다.',
      '- reaction은 confused(헷갈림), bored(지루함), excited(몰입), dropoff(이탈 위험), moved(감동) 중 하나다.',
      '- rating은 1~5 정수, dropOffRisk는 low, medium, high 중 하나다.',
      '- 칭찬과 문제점을 모두 구체적으로 쓰고, 작가가 고칠 수 있는 지점을 짚는다.',
      '- 모든 출력은 한국어로 쓴다.',
    ])
  })

  it('builds a prompt with the manuscript and every persona', () => {
    const prompt = readerSimTask.buildPrompt(input)
    expect(prompt).toContain(CHAPTER)
    expect(prompt).toContain('잿빛 도시')
    expect(prompt).toContain('서윤이 도시를 떠나기로 결심한다.')
    for (const persona of READER_PERSONAS) expect(prompt).toContain(persona.id)
  })

  it('fake output satisfies the schema and quotes the manuscript', () => {
    const output = ReaderSimSchema.parse(readerSimTask.fake(input))
    expect(output.personas).toHaveLength(READER_PERSONAS.length)
    expect(output.summary).not.toBe('')
    const quotes = output.personas.flatMap((p) => p.moments.map((m) => m.quote))
    expect(quotes.length).toBeGreaterThan(0)
    for (const quote of quotes) expect(CHAPTER).toContain(quote)
  })

  it('clamps ratings to 1-5 and drops quotes that are not in the manuscript', () => {
    const raw = {
      personas: [
        {
          personaId: 'reader-binge',
          rating: 7,
          dropOffRisk: 'low' as const,
          overall: '좋다',
          moments: [
            { quote: '아무도 대답하지 않았다.', reaction: 'confused' as const, comment: '왜?' },
            { quote: '전혀 없는 문장입니다.', reaction: 'bored' as const, comment: '없음' },
          ],
        },
        {
          personaId: 'reader-casual',
          rating: 0,
          dropOffRisk: 'high' as const,
          overall: '느리다',
          moments: [],
        },
      ],
      summary: '요약',
    }
    const output = readerSimTask.postProcess?.(raw, input)
    expect(output?.personas[0].rating).toBe(5)
    expect(output?.personas[0].moments.map((m) => m.quote)).toEqual(['아무도 대답하지 않았다.'])
    expect(output?.personas[1].rating).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/ai/fake'
import { ExtractionSchema } from '@/ai/extraction'
import {
  buildInterviewExtractPrompt,
  interviewExtractTask,
  type InterviewExtractInput,
} from '@/ai/tasks/interview-extract'
import {
  buildInterviewQuestionPrompt,
  interviewQuestionTask,
  type InterviewQuestionInput,
} from '@/ai/tasks/interview-question'

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
    entryNames: [],
    openThreadTitles: [],
  },
  history: [],
}

describe('interview-question task', () => {
  it('uses the low effort tier with a 2000 token cap', () => {
    expect(interviewQuestionTask.name).toBe('interview-question')
    expect(interviewQuestionTask.effort).toBe('low')
    expect(interviewQuestionTask.maxTokens).toBe(2000)
  })

  it('fake output asks the first topic that has not been asked yet', () => {
    const out = interviewQuestionTask.fake(emptyQuestionInput)
    expect(out.topic).toBe('주인공')
    expect(out.question).toBe('주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?')
    expect(out.rationale.length).toBeGreaterThan(0)
  })

  it('fake output skips topics already present in history, including skipped ones', () => {
    const out = interviewQuestionTask.fake({
      ...emptyQuestionInput,
      history: [
        { topic: '주인공', question: 'q1', answer: null, skipped: true },
        { topic: '주요 인물', question: 'q2', answer: '민준', skipped: false },
      ],
    })
    expect(out.topic).toBe('세계관 규칙')
  })

  it('fake output moves to the free topic after all topics are asked', () => {
    const topics = [
      '주인공',
      '주요 인물',
      '세계관 규칙',
      '주요 장소',
      '중심 갈등',
      '떡밥',
      '결말 방향',
      '문체',
    ]
    const out = interviewQuestionTask.fake({
      ...emptyQuestionInput,
      history: topics.map((topic) => ({ topic, question: 'q', answer: 'a', skipped: false })),
    })
    expect(out.topic).toBe('자유')
    expect(out.question).toBe('더 정리해 두고 싶은 설정이 있나요?')
  })

  it('fake output validates against the task schema through the fake client', async () => {
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: interviewQuestionTask.system,
      prompt: 'p',
      schema: interviewQuestionTask.schema,
      effort: interviewQuestionTask.effort,
      maxTokens: interviewQuestionTask.maxTokens,
      fake: () => interviewQuestionTask.fake(emptyQuestionInput),
    })
    expect(result.object.topic).toBe('주인공')
  })

  it('prompt has work, wiki and history sections and marks skipped turns', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      wiki: {
        counts: { ...emptyQuestionInput.wiki.counts, character: 2 },
        entryNames: ['서윤', '민준'],
        openThreadTitles: ['낡은 열쇠'],
      },
      history: [
        { topic: '주인공', question: '주인공은 누구인가요?', answer: null, skipped: true },
        {
          topic: '주요 인물',
          question: '중요한 인물은?',
          answer: '민준은 서윤의 스승이다.',
          skipped: false,
        },
      ],
    })
    expect(prompt).toContain('<work>')
    expect(prompt).toContain('새벽의 검')
    expect(prompt).toContain('<wiki>')
    expect(prompt).toContain('인물 2')
    expect(prompt).toContain('서윤, 민준')
    expect(prompt).toContain('낡은 열쇠')
    expect(prompt).toContain('<history>')
    expect(prompt).toContain('(건너뜀)')
    expect(prompt).toContain('민준은 서윤의 스승이다.')
  })

  it('prompt still contains an empty history section for the first question', () => {
    const prompt = buildInterviewQuestionPrompt(emptyQuestionInput)
    expect(prompt).toContain('<history>')
    expect(prompt).toContain('</history>')
  })

  it('system prompt is the Korean interviewer instruction', () => {
    expect(interviewQuestionTask.system).toContain('질문을 한 번에 하나만 한다.')
    expect(interviewQuestionTask.system).toContain('이미 묻거나 건너뛴 주제는 반복하지 않는다.')
  })
})

const extractInput = (overrides: Partial<InterviewExtractInput>): InterviewExtractInput => ({
  topic: '주인공',
  question: '주인공은 누구인가요?',
  answer: '서윤은 열일곱 살 검객이다. 그녀는 복수를 원한다.',
  known: [],
  ...overrides,
})

describe('interview-extract task', () => {
  it('uses the medium effort tier with an 8000 token cap', () => {
    expect(interviewExtractTask.name).toBe('interview-extract')
    expect(interviewExtractTask.effort).toBe('medium')
    expect(interviewExtractTask.maxTokens).toBe(8000)
  })

  it('fake output for a protagonist answer creates a character and an assumed fact', () => {
    const out = interviewExtractTask.fake(extractInput({}))
    expect(() => ExtractionSchema.parse(out)).not.toThrow()
    expect(out.entries).toHaveLength(1)
    expect(out.entries[0]).toMatchObject({ name: '서윤', kind: 'character' })
    expect(out.facts).toHaveLength(1)
    expect(out.facts[0]).toMatchObject({
      subjectName: '서윤',
      content: '서윤은 열일곱 살 검객이다.',
      evidence: '서윤은 열일곱 살 검객이다.',
      suggestedStatus: 'assumed',
      supersedesFactRef: null,
    })
    expect(out.threads).toEqual([])
    expect(out.relations).toEqual([])
    expect(out.summary).toBeNull()
  })

  it('fake output does not create an entry for a name that is already known', () => {
    const out = interviewExtractTask.fake(
      extractInput({ known: [{ name: '서윤', kind: 'character', aliases: [] }] }),
    )
    expect(out.entries).toEqual([])
    expect(out.facts).toHaveLength(1)
    expect(out.facts[0].subjectName).toBe('서윤')
  })

  it('fake output matches a known alias with a particle attached', () => {
    const out = interviewExtractTask.fake(
      extractInput({ known: [{ name: '이서윤', kind: 'character', aliases: ['서윤'] }] }),
    )
    expect(out.entries).toEqual([])
  })

  it('fake output creates a planted thread for the 떡밥 topic', () => {
    const answer = '마지막 장의 편지에는 아직 아무도 모르는 비밀이 숨어 있다. 그건 나중에 밝힌다.'
    const out = interviewExtractTask.fake(extractInput({ topic: '떡밥', answer }))
    expect(out.threads).toHaveLength(1)
    expect(out.threads[0]).toMatchObject({
      kind: 'planted',
      title: Array.from(answer).slice(0, 20).join(''),
      existingThreadRef: null,
      targetChapterPosition: null,
    })
    expect(() => ExtractionSchema.parse(out)).not.toThrow()
  })

  it('fake output for other topics creates only the fact', () => {
    const out = interviewExtractTask.fake(
      extractInput({ topic: '문체', answer: '짧은 문장을 쓴다. 대사는 줄인다.' }),
    )
    expect(out.entries).toEqual([])
    expect(out.threads).toEqual([])
    expect(out.facts).toHaveLength(1)
    expect(out.facts[0].content).toBe('짧은 문장을 쓴다.')
  })

  it('prompt includes question, answer and known cards', () => {
    const prompt = buildInterviewExtractPrompt(
      extractInput({ known: [{ name: '민준', kind: 'character', aliases: ['민준이'] }] }),
    )
    expect(prompt).toContain('<question>')
    expect(prompt).toContain('주인공은 누구인가요?')
    expect(prompt).toContain('<answer>')
    expect(prompt).toContain('서윤은 열일곱 살 검객이다.')
    expect(prompt).toContain('<known>')
    expect(prompt).toContain('민준')
    expect(prompt).toContain('민준이')
  })

  it('system prompt is the Korean extraction instruction', () => {
    expect(interviewExtractTask.system).toContain('지어내지 않는다.')
    expect(interviewExtractTask.system).toContain('suggestedStatus "confirmed"')
    expect(interviewExtractTask.system).toContain('supersedesFactRef는 null로 둔다.')
  })
})

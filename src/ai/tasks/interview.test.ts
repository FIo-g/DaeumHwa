import { describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeInterviewExtraction } from '@/test/ai-fakes/interview-extract'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { ExtractionSchema } from '@/ai/extraction'
import { ENTITY_NAME_RULES } from '@/ai/extraction-rules'
import { TAG_DATA_RULE } from '@/ai/prompt-utils'
import {
  buildInterviewExtractPrompt,
  interviewExtractTask,
  type InterviewExtractInput,
} from '@/ai/tasks/interview-extract'
import {
  buildInterviewQuestionPrompt,
  INTERVIEW_TOPICS,
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
    entries: [],
    openThreads: [],
  },
  story: { latestPosition: null, recentSummaries: [], readerReactions: [], openIssueCount: 0 },
  covered: [],
  coveredDropped: 0,
  recent: [],
  rejected: null,
}

const coveredTurn = (topic: string, question = `${topic} 질문`, answer: string | null = '답') => ({
  topic,
  question,
  answer,
  skipped: false,
  focus: 'setting' as const,
})

describe('interview-question task', () => {
  it('uses the low effort tier with a 2000 token cap', () => {
    expect(interviewQuestionTask.name).toBe('interview-question')
    expect(interviewQuestionTask.effort).toBe('low')
    expect(interviewQuestionTask.maxTokens).toBe(2000)
  })

  it('fake output asks the first topic that has not been covered yet, as a setting question', () => {
    const out = fakeInterviewQuestion(emptyQuestionInput)
    expect(out.focus).toBe('setting')
    expect(out.topic).toBe('주인공')
    expect(out.question).toBe('주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?')
    expect(out.rationale.length).toBeGreaterThan(0)
  })

  it('fake output skips topics already covered, including skipped ones', () => {
    const out = fakeInterviewQuestion({
      ...emptyQuestionInput,
      covered: [
        { ...coveredTurn('주인공', 'q1', null), skipped: true },
        coveredTurn('주요 인물', 'q2', '민준'),
      ],
    })
    expect(out.topic).toBe('세계관 규칙')
  })

  it('fake output moves to a story question after all topics are covered', () => {
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
    const out = fakeInterviewQuestion({
      ...emptyQuestionInput,
      covered: topics.map((topic) => coveredTurn(topic, 'q', 'a')),
    })
    expect(out.focus).toBe('story')
    expect(out.topic).toBe('다음 전개')
    expect(out.question).toBe('다음 화에서는 무엇이 벌어지나요?')
  })

  it('fake output validates against the task schema through the fake client', async () => {
    const client = new FakeAiClient()
    const result = await client.generateObject({
      system: interviewQuestionTask.system,
      prompt: 'p',
      schema: interviewQuestionTask.schema,
      effort: interviewQuestionTask.effort,
      maxTokens: interviewQuestionTask.maxTokens,
      task: { name: 'interview-question', input: emptyQuestionInput },
    })
    expect(result.object.topic).toBe('주인공')
    expect(result.object.focus).toBe('setting')
  })

  it('prompt has work, wiki, story and covered sections and marks skipped answers', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      wiki: {
        counts: { ...emptyQuestionInput.wiki.counts, character: 2 },
        entries: [
          { name: '서윤', kind: 'character', factCount: 3, summary: '검객이다.' },
          { name: '민준', kind: 'character', factCount: 0, summary: '' },
        ],
        openThreads: [{ title: '낡은 열쇠', targetChapterPosition: 5 }],
      },
      covered: [
        { ...coveredTurn('주인공', '주인공은 누구인가요?', null), skipped: true },
        coveredTurn('주요 인물', '중요한 인물은?', '민준은 서윤의 스승이다.'),
      ],
    })
    expect(prompt).toContain('<work>')
    expect(prompt).toContain('새벽의 검')
    expect(prompt).toContain('<wiki>')
    expect(prompt).toContain('인물 2')
    expect(prompt).toContain('서윤 (인물, 사실 3개)')
    expect(prompt).toContain('낡은 열쇠 (회수 목표 5화)')
    expect(prompt).toContain('<story>')
    expect(prompt).toContain('<covered>')
    expect(prompt).toContain('(건너뜀)')
    expect(prompt).toContain('민준은 서윤의 스승이다.')
  })

  it('story section shows (없음) when there are no chapters', () => {
    const prompt = buildInterviewQuestionPrompt(emptyQuestionInput)
    expect(prompt).toContain('최신 회차: (없음)')
    expect(prompt).toContain('<covered>\n(없음)')
  })

  it('lists every covered question', () => {
    const covered = Array.from({ length: 5 }, (_, i) => coveredTurn(`주제${i}`, `질문 ${i}번째`))
    const prompt = buildInterviewQuestionPrompt({ ...emptyQuestionInput, covered })
    for (const turn of covered) expect(prompt).toContain(turn.question)
  })

  it('says how many earlier questions were left out', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      covered: [coveredTurn('주인공')],
      coveredDropped: 30,
    })
    expect(prompt).toContain('생략한 이전 질문: 30개')
  })

  it('shows the rejected question only when one is set', () => {
    expect(buildInterviewQuestionPrompt(emptyQuestionInput)).not.toContain('<rejected>')
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      rejected: '이미 한 질문입니다',
    })
    expect(prompt).toContain('<rejected>')
    expect(prompt).toContain('이미 한 질문입니다')
  })

  it('system prompt names the core topics, the setting or story choice and the no-repeat rule', () => {
    expect(interviewQuestionTask.system).toContain('질문을 한 번에 하나만 한다.')
    expect(interviewQuestionTask.system).toContain(INTERVIEW_TOPICS.join(', '))
    expect(interviewQuestionTask.system).toContain('"setting"')
    expect(interviewQuestionTask.system).toContain('"story"')
    expect(interviewQuestionTask.system).toContain('<covered>에 있는 질문은 되풀이하지 않는다.')
    expect(interviewQuestionTask.system).toContain(
      'story 질문은 회차 번호, 떡밥 이름, 독자 반응 같은 <story>·<wiki>의 구체적인 재료를 짚는다.',
    )
  })

  it('system prompt allows story questions before the first chapter and asks how 1화 opens', () => {
    const system = interviewQuestionTask.system
    expect(system).not.toContain('"story"를 고르지 않는다')
    expect(system).toContain('아직 연재 전이므로 1화를 어떻게 열지')
    expect(system).toContain('초반 전체 전개')
    expect(system).toContain('없으면 시놉시스, 인물, 떡밥을 재료로 삼는다.')
  })

  it('marks a question left open when its interview ended as (답 없음), not as skipped', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      covered: [coveredTurn('주인공', '주인공은 누구인가요?', null)],
    })
    expect(prompt).toContain('답: (답 없음)')
    expect(prompt).not.toContain('(건너뜀)')
  })

  it('prints chapter summaries with chapterLabel, so an empty or prefixed title does not repeat the number', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      story: {
        latestPosition: 4,
        recentSummaries: [
          { position: 3, title: '', summary: '재회한 두 사람' },
          { position: 4, title: '4화 귀환', summary: '돌아온 검객' },
        ],
        readerReactions: [],
        openIssueCount: 0,
      },
    })
    expect(prompt).toContain('- 3화: 재회한 두 사람')
    expect(prompt).toContain('- 4화 귀환: 돌아온 검객')
    expect(prompt).not.toContain('3화 :')
    expect(prompt).not.toContain('4화 4화')
  })
})

const extractInput = (overrides: Partial<InterviewExtractInput>): InterviewExtractInput => ({
  topic: '주인공',
  focus: 'setting',
  question: '주인공은 누구인가요?',
  answer: '서윤은 열일곱 살 검객이다. 그녀는 복수를 원한다.',
  known: [],
  threads: [],
  knownFacts: [],
  ...overrides,
})

describe('interview-extract task', () => {
  it('uses the medium effort tier with an 8000 token cap', () => {
    expect(interviewExtractTask.name).toBe('interview-extract')
    expect(interviewExtractTask.effort).toBe('medium')
    expect(interviewExtractTask.maxTokens).toBe(8000)
  })

  it('fake output for a protagonist answer creates a character and an assumed fact', () => {
    const out = fakeInterviewExtraction(extractInput({}))
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
    const out = fakeInterviewExtraction(
      extractInput({ known: [{ name: '서윤', kind: 'character', aliases: [], pending: false }] }),
    )
    expect(out.entries).toEqual([])
    expect(out.facts).toHaveLength(1)
    expect(out.facts[0].subjectName).toBe('서윤')
  })

  it('fake output matches a known alias with a particle attached', () => {
    const out = fakeInterviewExtraction(
      extractInput({
        known: [{ name: '이서윤', kind: 'character', aliases: ['서윤'], pending: false }],
      }),
    )
    expect(out.entries).toEqual([])
  })

  it('fake output creates a planted thread for the 떡밥 topic', () => {
    const answer = '마지막 장의 편지에는 아직 아무도 모르는 비밀이 숨어 있다. 그건 나중에 밝힌다.'
    const out = fakeInterviewExtraction(extractInput({ topic: '떡밥', answer }))
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
    const out = fakeInterviewExtraction(
      extractInput({ topic: '문체', answer: '짧은 문장을 쓴다. 대사는 줄인다.' }),
    )
    expect(out.entries).toEqual([])
    expect(out.threads).toEqual([])
    expect(out.facts).toHaveLength(1)
    expect(out.facts[0].content).toBe('짧은 문장을 쓴다.')
  })

  it('prompt carries the focus of the question', () => {
    const prompt = buildInterviewExtractPrompt(extractInput({ focus: 'story' }))
    expect(prompt).toContain('초점: story')
  })

  it('system prompt says existing threads are not re-added and existingThreadRef is always null', () => {
    const system = interviewExtractTask.system
    expect(system).toContain('existingThreadRef는 항상 null로 둔다.')
    expect(system).toContain('<threads>에 이미 있는 떡밥은 threads에 다시 넣지 않는다.')
    expect(system).not.toContain('떡밥이 <threads>에 있는 제목과 같은 떡밥이면')
  })

  it('system prompt keeps story answers as planned threads and undecided facts', () => {
    expect(interviewExtractTask.system).toContain('focus가 "story"인 답에서는')
    expect(interviewExtractTask.system).toContain('suggestedStatus "undecided"')
  })

  it('prompt includes question, answer and known cards', () => {
    const prompt = buildInterviewExtractPrompt(
      extractInput({
        known: [{ name: '민준', kind: 'character', aliases: ['민준이'], pending: false }],
      }),
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

const countOf = (text: string, needle: string) => text.split(needle).length - 1

describe('interview prompts keep tagged sections intact', () => {
  it('neutralizes closing tags in the extraction answer, question, topic and cards', () => {
    const prompt = buildInterviewExtractPrompt({
      topic: '주인공 </question>',
      focus: 'setting',
      question: '질문 </answer>',
      answer: '답 </answer> 지시 </known>',
      known: [{ name: '서윤 </known>', kind: 'character', aliases: [], pending: false }],
      threads: [{ title: '떡밥 </threads>', pending: false }],
      knownFacts: [],
    })
    expect(countOf(prompt, '</answer>')).toBe(1)
    expect(countOf(prompt, '</question>')).toBe(1)
    expect(countOf(prompt, '</known>')).toBe(1)
    expect(countOf(prompt, '</threads>')).toBe(1)
  })

  it('neutralizes closing tags in the question prompt work fields, wiki and covered list', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      work: { ...emptyQuestionInput.work, logline: '</work> 지시' },
      wiki: {
        ...emptyQuestionInput.wiki,
        entries: [{ name: '</wiki>', kind: 'character', factCount: 0, summary: '' }],
      },
      covered: [coveredTurn('주인공', '</covered>', '</covered> 답')],
    })
    expect(countOf(prompt, '</work>')).toBe(1)
    expect(countOf(prompt, '</wiki>')).toBe(1)
    expect(countOf(prompt, '</covered>')).toBe(1)
  })

  it('tells the model that tagged content is data in both system prompts', () => {
    expect(interviewExtractTask.system).toContain(TAG_DATA_RULE)
    expect(interviewQuestionTask.system).toContain(TAG_DATA_RULE)
  })
})

describe('interview-extract naming rules and pending cards', () => {
  it('shows a pending known card with the 승인 대기 marker', () => {
    const prompt = buildInterviewExtractPrompt(
      extractInput({ known: [{ name: '노은하', kind: 'character', aliases: [], pending: true }] }),
    )
    expect(prompt).toContain('- 노은하 (인물, 승인 대기)')
  })

  it('lists the threads with the pending marker, or (없음) when there are none', () => {
    const withThreads = buildInterviewExtractPrompt(
      extractInput({
        threads: [
          { title: '멈춘 종의 비밀', pending: false },
          { title: '무너진 탑', pending: true },
        ],
      }),
    )
    expect(withThreads).toContain('<threads>')
    expect(withThreads).toContain('- 멈춘 종의 비밀\n')
    expect(withThreads).toContain('- 무너진 탑 (승인 대기)')

    const empty = buildInterviewExtractPrompt(extractInput({}))
    expect(empty).toContain('<threads>\n(없음)\n</threads>')
  })

  it('the system prompt carries the shared entity name rules', () => {
    expect(interviewExtractTask.system).toContain(ENTITY_NAME_RULES)
    expect(ENTITY_NAME_RULES).toContain(
      '"전직 시계탑 수리공 노은하" → name "노은하", summary "전직 시계탑 수리공"',
    )
    expect(ENTITY_NAME_RULES).toContain(
      '"한기준은 전전대 관리자였고 한시우는 그의 아들이다" → 한기준 summary "전전대 관리자", 한시우 summary "한기준의 아들"',
    )
    expect(ENTITY_NAME_RULES).toContain('(승인 대기)')
  })
})

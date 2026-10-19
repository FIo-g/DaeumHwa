import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeQuestion as normalizeFromLib } from '@/lib/interview-plan'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { interviewTurns } from '@/db/schema'
import type { Actor } from '@/db/types'
import type { InterviewQuestionInput } from '@/ai/tasks/interview-question'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import {
  answerTurn,
  askNextQuestion,
  completeInterview,
  normalizeQuestion,
  startInterview,
} from '@/server/interview'

// Brief I: the service reads the plan from every turn of the work, retries once on a plan
// violation, and keeps the stored question either way.

let db: Db
let owner: Actor
let editor: Actor
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const ownerUser = await createTestUser(db, { name: '작가' })
  const editorUser = await createTestUser(db, { name: '편집자' })
  const work = await createTestWork(db, ownerUser.id, { title: '새벽의 검' })
  await addTestMember(db, work.id, editorUser.id, 'editor')
  workId = work.id
  owner = { userId: ownerUser.id }
  editor = { userId: editorUser.id }
})

/** Records every input the question task receives, then answers with the given or fake output. */
function recordQuestions(outputs?: (input: InterviewQuestionInput, call: number) => unknown) {
  const inputs: InterviewQuestionInput[] = []
  const client = new FakeAiClient({
    overrides: {
      'interview-question': (input) => {
        const typed = input as InterviewQuestionInput
        inputs.push(typed)
        return outputs ? outputs(typed, inputs.length) : fakeInterviewQuestion(typed)
      },
    },
  })
  return { client, inputs }
}

const UNDECIDED = '그건 아직 정하지 않았어요.'

describe('plan from the interview turns', () => {
  it('a 미정 answer closes its topic in the next input', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    const first = await askNextQuestion(db, owner, session.id, client)
    expect(first.topic).toBe('주인공')
    await answerTurn(db, editor, { turnId: first.id, answer: UNDECIDED }, client)

    await askNextQuestion(db, owner, session.id, client)
    expect(inputs[1].plan?.closedTopics).toEqual(['주인공'])
  })

  it('two 미정 in a row set the streak and switch signal', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    for (let i = 0; i < 2; i++) {
      const turn = await askNextQuestion(db, owner, session.id, client)
      await answerTurn(db, editor, { turnId: turn.id, answer: UNDECIDED }, client)
    }
    await askNextQuestion(db, owner, session.id, client)
    expect(inputs.at(-1)?.plan?.undecidedStreak).toBe(2)
  })

  it('a closed topic asked again retries once and stores the second question', async () => {
    const session = await startInterview(db, owner, workId)
    const seed = recordQuestions()
    const first = await askNextQuestion(db, owner, session.id, seed.client)
    await answerTurn(db, editor, { turnId: first.id, answer: UNDECIDED }, seed.client)

    const outputs = [
      {
        focus: 'setting',
        topic: '주인공',
        question: '주인공의 성격은 어떤가요?',
        rationale: '주인공 성격을 채웁니다.',
      },
      {
        focus: 'setting',
        topic: '세계관 규칙',
        question: '이 세계의 규칙은 무엇인가요?',
        rationale: '세계관 규칙을 채웁니다.',
      },
    ]
    const { client, inputs } = recordQuestions((_input, call) => outputs[call - 1])
    const turn = await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(inputs[0].rejected).toBeNull()
    expect(inputs[1].rejected).toBe('주인공의 성격은 어떤가요?')
    expect(turn.topic).toBe('세계관 규칙')
  })

  it('a second plan violation is stored anyway', async () => {
    const session = await startInterview(db, owner, workId)
    const seed = recordQuestions()
    const first = await askNextQuestion(db, owner, session.id, seed.client)
    await answerTurn(db, editor, { turnId: first.id, answer: UNDECIDED }, seed.client)

    const outputs = [
      {
        focus: 'setting',
        topic: '주인공',
        question: '주인공의 성격은 어떤가요?',
        rationale: '주인공 성격을 채웁니다.',
      },
      {
        focus: 'setting',
        topic: '주인공',
        question: '주인공의 목표는 무엇인가요?',
        rationale: '주인공 목표를 채웁니다.',
      },
    ]
    const { client, inputs } = recordQuestions((_input, call) => outputs[call - 1])
    const turn = await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(turn.question).toBe('주인공의 목표는 무엇인가요?')
  })

  it('makes no retry when the plan is satisfied', async () => {
    const session = await startInterview(db, owner, workId)
    const seed = recordQuestions()
    const first = await askNextQuestion(db, owner, session.id, seed.client)
    await answerTurn(db, editor, { turnId: first.id, answer: UNDECIDED }, seed.client)

    const { client, inputs } = recordQuestions()
    const turn = await askNextQuestion(db, owner, session.id, client)
    expect(inputs).toHaveLength(1)
    expect(turn.topic).toBe('주요 인물')
  })

  it('the plan covers every session of the work', async () => {
    const first = await startInterview(db, owner, workId)
    const seed = recordQuestions()
    const turn = await askNextQuestion(db, owner, first.id, seed.client)
    await answerTurn(db, editor, { turnId: turn.id, answer: UNDECIDED }, seed.client)
    await completeInterview(db, owner, first.id)

    const second = await startInterview(db, owner, workId)
    expect(second.id).not.toBe(first.id)
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, second.id, client)
    expect(inputs[0].plan?.closedTopics).toEqual(['주인공'])
  })

  it('the plan is not capped by the covered limit of 120 turns', async () => {
    const session = await startInterview(db, owner, workId)
    await db.insert(interviewTurns).values({
      sessionId: session.id,
      topic: '주인공',
      question: '주인공은 누구인가요?',
      answer: UNDECIDED,
      createdAt: new Date('2020-01-01T00:00:00Z'),
    })
    await db.insert(interviewTurns).values(
      Array.from({ length: 150 }, (_, i) => ({
        sessionId: session.id,
        topic: '주요 장소',
        question: `장소 질문 ${i}`,
        answer: `장소 답 ${i}`,
      })),
    )

    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, session.id, client)
    const plan = inputs.at(-1)?.plan
    expect(inputs.at(-1)?.covered).toHaveLength(120)
    expect(plan?.closedTopics).toContain('주인공')
    expect(plan?.remainingCore).not.toContain('주인공')
  })
})

describe('normalizeQuestion', () => {
  it('is the lib function, re-exported from the service', () => {
    expect(normalizeQuestion).toBe(normalizeFromLib)
    expect(normalizeQuestion('주인공은 누구인가요?')).toBe('주인공은누구인가요')
  })
})

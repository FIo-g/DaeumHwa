import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { interviewTurns, works } from '@/db/schema'
import type { Actor } from '@/db/types'
import { isAppError } from '@/lib/errors'
import type { InterviewQuestionInput } from '@/ai/tasks/interview-question'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { answerTurn, askNextQuestion, startInterview } from '@/server/interview'

// P12: one re-ask when the question uses a name or quoted term the work never gave.

let db: Db
let owner: Actor
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const ownerUser = await createTestUser(db, { name: '작가' })
  const editorUser = await createTestUser(db, { name: '편집자' })
  const work = await createTestWork(db, ownerUser.id, { title: '새벽의 검' })
  await addTestMember(db, work.id, editorUser.id, 'editor')
  workId = work.id
  owner = { userId: ownerUser.id }
  await setSynopsis('Serin climbs the Bell Tower.')
})

async function setSynopsis(text: string): Promise<void> {
  await db.update(works).set({ synopsis: text }).where(eq(works.id, workId))
}

/** Records every input the question task receives; `outputs` picks the answer per call. */
function recordQuestions(
  outputs?: (input: InterviewQuestionInput, call: number) => unknown,
  extra: { onCall?: (call: number) => void } = {},
) {
  const inputs: InterviewQuestionInput[] = []
  const client = new FakeAiClient({
    overrides: {
      'interview-question': (input) => {
        const typed = input as InterviewQuestionInput
        inputs.push(typed)
        extra.onCall?.(inputs.length)
        return outputs ? outputs(typed, inputs.length) : fakeInterviewQuestion(typed)
      },
    },
  })
  return { client, inputs }
}

const q = (question: string, topic = '주요 인물') => ({
  focus: 'setting' as const,
  topic,
  question,
  rationale: '근거',
})

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise
  } catch (e) {
    expect(isAppError(e)).toBe(true)
    expect((e as { code: string }).code).toBe(code)
    return
  }
  throw new Error(`expected AppError ${code}`)
}

async function turnRows(sessionId: string) {
  return db.select().from(interviewTurns).where(eq(interviewTurns.sessionId, sessionId))
}

describe('askNextQuestion name check (P12)', () => {
  it('re-asks once with the unknown names', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions((_input, call) =>
      call === 1 ? q('Who is Gwak Duseok to Serin?') : q('Who is the warden to Serin?'),
    )
    const stored = await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(inputs[0].rejected).toBeNull()
    expect('unknownNames' in inputs[0]).toBe(false)
    expect(inputs[1].rejected).toBe('Who is Gwak Duseok to Serin?')
    expect(inputs[1].unknownNames).toEqual(['Gwak Duseok'])
    expect(stored.question).toBe('Who is the warden to Serin?')
  })

  it('makes no second call when every name has a source', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions(() => q('Why does Serin climb the Bell Tower?'))
    await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(1)
    expect('unknownNames' in inputs[0]).toBe(false)
  })

  it('takes a name from an old answer that the prompt had cut', async () => {
    const session = await startInterview(db, owner, workId)
    const first = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(
      db,
      owner,
      { turnId: first.id, answer: `${'가'.repeat(100)} Gwak Duseok runs a soup house.` },
      new FakeAiClient(),
    )

    const { client, inputs } = recordQuestions(() => q('Who is Gwak Duseok to Serin?'))
    await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(1)
    const shown = inputs[0].covered[0].answer ?? ''
    expect(shown.length).toBeLessThanOrEqual(80)
    expect(shown).not.toContain('Gwak')
  })

  it('stores the second question even when it still has an unknown name', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions((_input, call) =>
      call === 1 ? q('Who is Gwak Duseok to Serin?') : q('Who is Gwak Duseok, really, to Serin?'),
    )
    const stored = await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(stored.question).toBe('Who is Gwak Duseok, really, to Serin?')
  })

  it('reads a quoted Korean term', async () => {
    await setSynopsis('세린이 종루에 오른다.')
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions((_input, call) =>
      call === 1
        ? q("백지원이 말한 '은화 빚'은 누구에게 진 빚인가요?")
        : q('백지원은 어떤 인물인가요?'),
    )
    await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(inputs[1].unknownNames).toEqual(['은화 빚'])
  })

  it('does not need a source for a core topic name in quotes', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions(() => q("'떡밥'은 어떤 것이 있나요?"))
    await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(1)
  })

  describe('a repeat and an unknown name share one re-ask', () => {
    async function setupRepeat(onSecondCall?: (call: number) => void) {
      const session = await startInterview(db, owner, workId)
      await db.insert(interviewTurns).values({
        sessionId: session.id,
        focus: 'setting',
        topic: '주요 인물',
        question: 'Who is Gwak Duseok to Serin?',
        answer: '사장은 항구에서 국밥집을 한다.',
        answeredAt: new Date(),
      })
      const { client, inputs } = recordQuestions(
        (_input, call) =>
          call === 1 ? q('Who is Gwak Duseok to Serin?') : q('Who is the warden to Serin?'),
        { onCall: onSecondCall },
      )
      return { session, client, inputs }
    }

    it('makes exactly two calls and names the unknown name', async () => {
      const { session, client, inputs } = await setupRepeat()
      const stored = await askNextQuestion(db, owner, session.id, client)

      expect(inputs).toHaveLength(2)
      // An earlier question is not a source, so the name is still unknown.
      expect(inputs[1].unknownNames).toEqual(['Gwak Duseok'])
      expect(inputs[1].rejected).toBe('Who is Gwak Duseok to Serin?')
      expect(stored.question).toBe('Who is the warden to Serin?')
    })

    it('still throws when the re-ask was for a repeat and fails', async () => {
      const { session, client } = await setupRepeat((call) => {
        if (call === 2) throw new Error('boom')
      })
      await expectAppError(askNextQuestion(db, owner, session.id, client), 'AI_ERROR')
    })
  })

  it('keeps the first question when a names-only re-ask fails', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions(
      (_input, call) =>
        call === 1 ? q('Who is Gwak Duseok to Serin?') : q('Who is the warden to Serin?'),
      {
        onCall: (call) => {
          if (call === 2) throw new Error('boom')
        },
      },
    )
    const stored = await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(stored.question).toBe('Who is Gwak Duseok to Serin?')
  })

  it('a cancel during a names-only re-ask is not swallowed', async () => {
    const session = await startInterview(db, owner, workId)
    const controller = new AbortController()
    const { client } = recordQuestions((_input, call) => {
      if (call === 2) {
        controller.abort()
        return q('Who is the warden to Serin?')
      }
      return q('Who is Gwak Duseok to Serin?')
    })
    await expectAppError(
      askNextQuestion(db, owner, session.id, client, controller.signal),
      'CANCELLED',
    )
    expect(await turnRows(session.id)).toHaveLength(0)
  })
})

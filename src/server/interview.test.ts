import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import {
  aiRuns,
  chapters,
  interviewSessions,
  interviewTurns,
  proposals,
  threads,
  wikiEntries,
} from '@/db/schema'
import type { Actor } from '@/db/types'
import { isAppError } from '@/lib/errors'
import type { InterviewExtractInput } from '@/ai/tasks/interview-extract'
import type { InterviewQuestionInput } from '@/ai/tasks/interview-question'
import { fakeInterviewExtraction } from '@/test/ai-fakes/interview-extract'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import {
  answerTurn,
  askNextQuestion,
  completeInterview,
  getInterviewState,
  normalizeQuestion,
  skipTurn,
  startInterview,
} from '@/server/interview'

/** Records every prompt that reaches the AI, then answers with the deterministic fake output. */
class RecordingAiClient extends FakeAiClient {
  prompts: string[] = []

  override async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.prompts.push(args.prompt)
    return super.generateObject(args)
  }
}

const ENV_KEYS = ['AI_DAILY_TOKEN_LIMIT'] as const
const saved: Record<string, string | undefined> = {}

let db: Db
let owner: Actor
let editor: Actor
let viewer: Actor
let stranger: Actor
let workId: string

beforeEach(async () => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  delete process.env.AI_DAILY_TOKEN_LIMIT

  db = await createTestDb()
  const ownerUser = await createTestUser(db, { name: '작가' })
  const editorUser = await createTestUser(db, { name: '편집자' })
  const viewerUser = await createTestUser(db, { name: '독자' })
  const strangerUser = await createTestUser(db, { name: '외부인' })
  const work = await createTestWork(db, ownerUser.id, { title: '새벽의 검' })
  await addTestMember(db, work.id, editorUser.id, 'editor')
  await addTestMember(db, work.id, viewerUser.id, 'viewer')
  workId = work.id
  owner = { userId: ownerUser.id }
  editor = { userId: editorUser.id }
  viewer = { userId: viewerUser.id }
  stranger = { userId: strangerUser.id }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

async function expectAppError(promise: Promise<unknown>, code: string): Promise<string> {
  try {
    await promise
  } catch (e) {
    expect(isAppError(e)).toBe(true)
    expect((e as { code: string }).code).toBe(code)
    return (e as Error).message
  }
  throw new Error(`expected AppError ${code}`)
}

describe('startInterview and getInterviewState', () => {
  it('creates an active session and reuses it on the next start', async () => {
    const first = await startInterview(db, owner, workId)
    const second = await startInterview(db, editor, workId)
    expect(first.status).toBe('active')
    expect(second.id).toBe(first.id)
    const rows = await db.select().from(interviewSessions)
    expect(rows).toHaveLength(1)
  })

  it('shows no session before the first start', async () => {
    const state = await getInterviewState(db, viewer, workId)
    expect(state).toEqual({ session: null, turns: [], current: null })
  })

  it('lets a viewer read the state but not start an interview', async () => {
    await startInterview(db, owner, workId)
    const state = await getInterviewState(db, viewer, workId)
    expect(state.session?.status).toBe('active')
    await expectAppError(startInterview(db, viewer, workId), 'FORBIDDEN')
  })

  it('hides the work from non-members', async () => {
    await expectAppError(getInterviewState(db, stranger, workId), 'NOT_FOUND')
    await expectAppError(startInterview(db, stranger, workId), 'NOT_FOUND')
  })
})

describe('askNextQuestion', () => {
  it('creates a question turn with the fake topic and no answer', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    expect(turn.topic).toBe('주인공')
    expect(turn.question).toBe('주인공은 누구이고, 이야기가 시작될 때 무엇을 가장 원하나요?')
    expect(turn.answer).toBeNull()
    expect(turn.skipped).toBe(false)
    expect(turn.sessionId).toBe(session.id)

    const state = await getInterviewState(db, viewer, workId)
    expect(state.current?.id).toBe(turn.id)
    expect(state.turns.map((t) => t.id)).toEqual([turn.id])
  })

  it('returns the unanswered turn instead of asking again', async () => {
    const session = await startInterview(db, owner, workId)
    const client = new RecordingAiClient()
    const first = await askNextQuestion(db, owner, session.id, client)
    const again = await askNextQuestion(db, editor, session.id, client)
    expect(again.id).toBe(first.id)
    expect(client.prompts).toHaveLength(1)
    const turns = await db.select().from(interviewTurns)
    expect(turns).toHaveLength(1)
  })

  it('a viewer cannot ask a question', async () => {
    const session = await startInterview(db, owner, workId)
    await expectAppError(askNextQuestion(db, viewer, session.id, new FakeAiClient()), 'FORBIDDEN')
  })

  it('a non-member gets NOT_FOUND for another work session', async () => {
    const session = await startInterview(db, owner, workId)
    await expectAppError(askNextQuestion(db, stranger, session.id, new FakeAiClient()), 'NOT_FOUND')
  })

  it('an unknown session id is NOT_FOUND', async () => {
    await expectAppError(askNextQuestion(db, owner, randomUUID(), new FakeAiClient()), 'NOT_FOUND')
  })

  it('asks the AI with the work, wiki and recent history', async () => {
    await createTestEntry(db, workId, { name: '서윤', kind: 'character' })
    const session = await startInterview(db, owner, workId)
    const client = new RecordingAiClient()
    await askNextQuestion(db, owner, session.id, client)
    const prompt = client.prompts[0]
    expect(prompt).toContain('새벽의 검')
    expect(prompt).toContain('서윤')
    expect(prompt).toContain('<covered>')
    expect(prompt).toContain('<story>')
  })

  it('refuses to ask in a completed interview', async () => {
    const session = await startInterview(db, owner, workId)
    await completeInterview(db, owner, session.id)
    await expectAppError(askNextQuestion(db, owner, session.id, new FakeAiClient()), 'BAD_STATE')
  })

  it('stops with AI_LIMIT when today usage is over the limit', async () => {
    process.env.AI_DAILY_TOKEN_LIMIT = '10'
    await db.insert(aiRuns).values({
      workId,
      userId: owner.userId,
      task: 'proofread',
      status: 'done',
      inputTokens: 50,
      outputTokens: 0,
    })
    const session = await startInterview(db, owner, workId)
    await expectAppError(askNextQuestion(db, owner, session.id, new FakeAiClient()), 'AI_LIMIT')
    const turns = await db.select().from(interviewTurns)
    expect(turns).toHaveLength(0)
  })
})

describe('answerTurn', () => {
  it('stores the answer and creates pending interview proposals with the turn as sourceRef', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    const result = await answerTurn(
      db,
      editor,
      { turnId: turn.id, answer: '서윤은 열일곱 살 검객이다. 그녀는 복수를 원한다.' },
      new FakeAiClient(),
    )

    expect(result.turn.answer).toBe('서윤은 열일곱 살 검객이다. 그녀는 복수를 원한다.')
    expect(result.turn.answeredAt).not.toBeNull()
    expect(result.turn.proposalCount).toBe(result.proposals.length)
    expect(result.proposals.length).toBeGreaterThan(0)

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.length).toBe(result.proposals.length)
    for (const row of rows) {
      expect(row.status).toBe('pending')
      expect(row.source).toBe('interview')
      expect(row.sourceRef).toBe(turn.id)
    }
  })

  it('creates a new entry card proposal and a fact proposal with no entry link', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(
      db,
      editor,
      { turnId: turn.id, answer: '서윤은 열일곱 살 검객이다.' },
      new FakeAiClient(),
    )

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    const entry = rows.find((r) => r.type === 'entry_create')
    expect(entry?.payload).toMatchObject({ name: '서윤', kind: 'character' })
    const fact = rows.find((r) => r.type === 'fact_create')
    expect(fact?.payload).toMatchObject({
      subjectName: '서윤',
      entryId: null,
      suggestedStatus: 'assumed',
      content: '서윤은 열일곱 살 검객이다.',
    })
  })

  it('never writes wiki rows directly', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(
      db,
      editor,
      { turnId: turn.id, answer: '서윤은 열일곱 살 검객이다.' },
      new FakeAiClient(),
    )
    const entries = await db.select().from(wikiEntries).where(eq(wikiEntries.workId, workId))
    expect(entries).toHaveLength(0)
  })

  it('links the fact to an existing card and skips a second entry card', async () => {
    const existing = await createTestEntry(db, workId, { name: '서윤', kind: 'character' })
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(
      db,
      editor,
      { turnId: turn.id, answer: '서윤은 열일곱 살 검객이다.' },
      new FakeAiClient(),
    )

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.some((r) => r.type === 'entry_create')).toBe(false)
    const fact = rows.find((r) => r.type === 'fact_create')
    expect(fact?.payload).toMatchObject({ subjectName: '서윤', entryId: existing.id })
  })

  it('creates a planned thread for the 떡밥 topic when the answer is interview-sourced', async () => {
    const session = await startInterview(db, owner, workId)
    const client = new FakeAiClient()
    let current = await askNextQuestion(db, owner, session.id, client)
    // Skip topics until the 떡밥 question comes up.
    while (current.topic !== '떡밥') {
      await skipTurn(db, owner, current.id)
      current = await askNextQuestion(db, owner, session.id, client)
    }
    await answerTurn(
      db,
      editor,
      { turnId: current.id, answer: '마지막 장의 편지에는 아직 아무도 모르는 비밀이 있다.' },
      client,
    )
    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    const create = rows.find((r) => r.type === 'thread_create')
    expect(create?.payload).toMatchObject({ status: 'planned', plantedChapterId: null })
    expect(await db.select().from(threads)).toHaveLength(0)
  })

  it('rejects an empty answer with a Korean VALIDATION message', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    const message = await expectAppError(
      answerTurn(db, editor, { turnId: turn.id, answer: '   ' }, new FakeAiClient()),
      'VALIDATION',
    )
    expect(message).toBe('답을 입력하거나 건너뛰기를 누르세요.')
  })

  it('a second answer to the same turn is a conflict', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(
      db,
      editor,
      { turnId: turn.id, answer: '서윤은 검객이다.' },
      new FakeAiClient(),
    )
    await expectAppError(
      answerTurn(db, editor, { turnId: turn.id, answer: '다시 쓴다.' }, new FakeAiClient()),
      'CONFLICT',
    )
  })

  it('a skipped turn cannot be answered', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await skipTurn(db, owner, turn.id)
    await expectAppError(
      answerTurn(db, editor, { turnId: turn.id, answer: '답' }, new FakeAiClient()),
      'CONFLICT',
    )
  })

  it('a viewer cannot answer', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await expectAppError(
      answerTurn(db, viewer, { turnId: turn.id, answer: '답' }, new FakeAiClient()),
      'FORBIDDEN',
    )
  })

  it('an unknown turn id is NOT_FOUND', async () => {
    await expectAppError(
      answerTurn(db, editor, { turnId: randomUUID(), answer: '답' }, new FakeAiClient()),
      'NOT_FOUND',
    )
  })
})

describe('skipTurn and completeInterview', () => {
  it('skipping moves the next question to a different topic and the AI sees the skip', async () => {
    const session = await startInterview(db, owner, workId)
    const first = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    const skipped = await skipTurn(db, owner, first.id)
    expect(skipped.skipped).toBe(true)
    expect(skipped.answer).toBeNull()

    const client = new RecordingAiClient()
    const next = await askNextQuestion(db, owner, session.id, client)
    expect(next.topic).not.toBe(first.topic)
    expect(client.prompts[0]).toContain('(건너뜀)')
  })

  it('a viewer cannot skip', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await expectAppError(skipTurn(db, viewer, turn.id), 'FORBIDDEN')
  })

  it('completing ends the session; a new start creates a fresh one', async () => {
    const session = await startInterview(db, owner, workId)
    await askNextQuestion(db, owner, session.id, new FakeAiClient())
    const done = await completeInterview(db, owner, session.id)
    expect(done.status).toBe('completed')

    const state = await getInterviewState(db, owner, workId)
    expect(state).toEqual({ session: null, turns: [], current: null })

    const fresh = await startInterview(db, owner, workId)
    expect(fresh.id).not.toBe(session.id)
    expect(fresh.status).toBe('active')
  })

  it('completing twice is rejected', async () => {
    const session = await startInterview(db, owner, workId)
    await completeInterview(db, owner, session.id)
    await expectAppError(completeInterview(db, owner, session.id), 'BAD_STATE')
  })

  it('a viewer cannot complete an interview', async () => {
    const session = await startInterview(db, owner, workId)
    await expectAppError(completeInterview(db, viewer, session.id), 'FORBIDDEN')
  })
})

describe('answerTurn naming and thread dedup across answers', () => {
  const repeatingExtraction = () => ({
    summary: null,
    entries: [
      { name: '노은하', kind: 'character', aliases: [], summary: '', fields: [] },
      {
        name: '전직 시계탑 수리공 노은하',
        kind: 'character',
        aliases: [],
        summary: '전직 시계탑 수리공',
        fields: [],
      },
    ],
    facts: [],
    threads: [
      {
        title: '멈춘 종의 비밀',
        description: '',
        kind: 'planted',
        // Quoted from both answers, so the verbatim evidence check keeps the thread.
        evidence: '노은하',
        existingThreadRef: null,
        targetChapterPosition: null,
      },
    ],
    relations: [],
  })

  it('two answers that both name 노은하 leave exactly one pending entry card and one planted thread', async () => {
    const session = await startInterview(db, owner, workId)
    const client = new FakeAiClient({
      overrides: { 'interview-extract': repeatingExtraction },
    })

    const first = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(
      db,
      editor,
      { turnId: first.id, answer: '노은하는 시계탑 수리공이다.' },
      client,
    )
    const second = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(db, editor, { turnId: second.id, answer: '노은하가 다시 나온다.' }, client)

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    const creates = rows.filter((r) => r.type === 'entry_create')
    expect(creates).toHaveLength(1)
    expect(creates[0].payload).toMatchObject({ name: '노은하' })
    expect(rows.filter((r) => r.type === 'thread_create')).toHaveLength(1)
  })

  it('the second answer sees the first pending card in its known list', async () => {
    const session = await startInterview(db, owner, workId)
    const client = new RecordingAiClient({
      overrides: { 'interview-extract': repeatingExtraction },
    })

    const first = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(
      db,
      editor,
      { turnId: first.id, answer: '노은하는 시계탑 수리공이다.' },
      client,
    )
    const second = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(db, editor, { turnId: second.id, answer: '노은하가 다시 나온다.' }, client)

    const extractPrompts = client.prompts.filter((p) => p.includes('<known>'))
    const last = extractPrompts[extractPrompts.length - 1]
    expect(last).toContain('- 노은하 (인물, 승인 대기)')
  })
})

/** Fake questions with the input of each call recorded. */
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

async function answerQuestions(sessionId: string, count: number, client: FakeAiClient) {
  for (let i = 0; i < count; i++) {
    const turn = await askNextQuestion(db, owner, sessionId, client)
    await answerTurn(db, editor, { turnId: turn.id, answer: `답 ${i}` }, client)
  }
}

describe('continuous questions', () => {
  it('covers every earlier session, oldest first, and keeps this session recent history', async () => {
    const first = await startInterview(db, owner, workId)
    await answerQuestions(first.id, 8, new FakeAiClient())
    await completeInterview(db, owner, first.id)

    const second = await startInterview(db, owner, workId)
    await answerQuestions(second.id, 4, new FakeAiClient())
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, second.id, client)

    const input = inputs[0]
    expect(input.covered).toHaveLength(12)
    expect(input.covered[0].topic).toBe('주인공')
    expect(input.coveredDropped).toBe(0)
    expect(input.recent).toHaveLength(4)
  })

  it('caps the covered list at 120 newest turns and states how many were dropped', async () => {
    const session = await startInterview(db, owner, workId)
    await db.insert(interviewTurns).values(
      Array.from({ length: 150 }, (_, i) => ({
        sessionId: session.id,
        topic: '주인공',
        question: `질문 ${i}`,
        answer: `답 ${i}`,
      })),
    )
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, session.id, client)
    expect(inputs[0].covered).toHaveLength(120)
    expect(inputs[0].coveredDropped).toBe(30)
    expect(inputs[0].recent).toHaveLength(6)
  })

  it('a work without chapters has no latest position and no summaries', async () => {
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, session.id, client)
    expect(inputs[0].story.latestPosition).toBeNull()
    expect(inputs[0].story.recentSummaries).toEqual([])
    expect(inputs[0].story.readerReactions).toEqual([])
  })

  it('takes the newest five chapter summaries, oldest first', async () => {
    for (let position = 1; position <= 6; position++) {
      const chapter = await createTestChapter(db, workId, { position, title: `${position}화` })
      await db
        .update(chapters)
        .set({ summary: `요약 ${position}` })
        .where(eq(chapters.id, chapter.id))
    }
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, session.id, client)
    expect(inputs[0].story.latestPosition).toBe(6)
    expect(inputs[0].story.recentSummaries.map((s) => s.position)).toEqual([2, 3, 4, 5, 6])
  })

  it('passes the newest reader simulation of a chapter as a reaction digest', async () => {
    const chapter = await createTestChapter(db, workId, { position: 3, title: '3화' })
    await db.insert(aiRuns).values({
      workId,
      userId: owner.userId,
      task: 'reader-sim',
      chapterId: chapter.id,
      status: 'done',
      output: {
        personas: [
          {
            personaId: 'p1',
            rating: 2,
            dropOffRisk: 'high',
            overall: '초반이 느리다',
            moments: [],
          },
        ],
        summary: '요약',
      },
    })
    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, session.id, client)
    const reaction = inputs[0].story.readerReactions[0]
    expect(reaction.position).toBe(3)
    expect(reaction.digest).toContain('초반이 느리다')
    expect(reaction.digest).toContain('이탈 위험 높음 1명')
  })

  it('normalizes questions by dropping whitespace and punctuation', () => {
    expect(normalizeQuestion('주인공은,  누구인가요?')).toBe(
      normalizeQuestion('주인공은 누구인가요'),
    )
    expect(normalizeQuestion('주인공은 누구인가요')).not.toBe(
      normalizeQuestion('주요 인물은 누구인가요'),
    )
  })

  it('retries once with the repeated question in rejected when the answer repeats an earlier one', async () => {
    const session = await startInterview(db, owner, workId)
    const first = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(db, editor, { turnId: first.id, answer: '답' }, new FakeAiClient())

    const repeated = '주인공은,  누구이고 이야기가 시작될 때 무엇을 가장 원하나요?'
    const fresh = '주인공이 가장 두려워하는 것은 무엇인가요?'
    const { client, inputs } = recordQuestions((_input, call) => ({
      focus: 'setting',
      topic: '중심 갈등',
      question: call === 1 ? repeated : fresh,
      rationale: '근거',
    }))
    const turn = await askNextQuestion(db, owner, session.id, client)

    expect(inputs).toHaveLength(2)
    expect(inputs[0].rejected).toBeNull()
    expect(inputs[1].rejected).toBe(repeated)
    expect(turn.question).toBe(fresh)
  })

  it('stores the second question even when it still repeats', async () => {
    const session = await startInterview(db, owner, workId)
    const first = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    await answerTurn(db, editor, { turnId: first.id, answer: '답' }, new FakeAiClient())

    const repeated = '주인공은,  누구이고 이야기가 시작될 때 무엇을 가장 원하나요?'
    const again = '주인공은 누구이고 이야기가 시작될 때 무엇을 가장 원하나요!'
    const { client, inputs } = recordQuestions((_input, call) => ({
      focus: 'setting',
      topic: '중심 갈등',
      question: call === 1 ? repeated : again,
      rationale: '근거',
    }))
    const turn = await askNextQuestion(db, owner, session.id, client)
    expect(inputs).toHaveLength(2)
    expect(turn.question).toBe(again)
  })

  it('stores the focus the AI chose and sends it to the answer extraction', async () => {
    const session = await startInterview(db, owner, workId)
    const questionClient = new FakeAiClient({
      overrides: {
        'interview-question': () => ({
          focus: 'story',
          topic: '다음 전개',
          question: '3화에서 드러난 낡은 열쇠는 다음에 어떻게 쓰이나요?',
          rationale: '떡밥을 잇습니다.',
        }),
      },
    })
    const turn = await askNextQuestion(db, owner, session.id, questionClient)
    expect(turn.focus).toBe('story')

    const extractInputs: InterviewExtractInput[] = []
    const client = new FakeAiClient({
      overrides: {
        'interview-extract': (input) => {
          extractInputs.push(input as InterviewExtractInput)
          return fakeInterviewExtraction(input as InterviewExtractInput)
        },
      },
    })
    await answerTurn(
      db,
      editor,
      { turnId: turn.id, answer: '다음 화에서 열쇠가 문을 연다.' },
      client,
    )
    expect(extractInputs[0].focus).toBe('story')
  })

  it('a cancelled signal stops the question call before the AI runs', async () => {
    const session = await startInterview(db, owner, workId)
    const controller = new AbortController()
    controller.abort()
    const { client, inputs } = recordQuestions()
    await expectAppError(
      askNextQuestion(db, owner, session.id, client, controller.signal),
      'CANCELLED',
    )
    expect(inputs).toHaveLength(0)
    expect(await db.select().from(interviewTurns)).toHaveLength(0)
  })
})

describe('interview reliability', () => {
  async function insertReaderRun(chapterId: string, overall: string, createdAt: Date) {
    await db.insert(aiRuns).values({
      workId,
      userId: owner.userId,
      task: 'reader-sim',
      chapterId,
      status: 'done',
      createdAt,
      output: {
        personas: [{ personaId: 'p1', rating: 2, dropOffRisk: 'high', overall, moments: [] }],
        summary: '요약',
      },
    })
  }

  it('a question left open when its interview ended is covered, with no answer', async () => {
    const first = await startInterview(db, owner, workId)
    const open = await askNextQuestion(db, owner, first.id, new FakeAiClient())
    await completeInterview(db, owner, first.id)

    const second = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, second.id, client)
    expect(inputs[0].covered).toContainEqual(
      expect.objectContaining({ question: open.question, answer: null, skipped: false }),
    )
  })

  it('two asks at the same time leave one open question in the session', async () => {
    const session = await startInterview(db, owner, workId)
    const client = new FakeAiClient()
    const [a, b] = await Promise.all([
      askNextQuestion(db, owner, session.id, client),
      askNextQuestion(db, owner, session.id, client),
    ])
    expect(a.id).toBe(b.id)
    expect(await db.select().from(interviewTurns)).toHaveLength(1)
  })

  it('a cancel that lands while the question is in flight stores no question', async () => {
    const session = await startInterview(db, owner, workId)
    const controller = new AbortController()
    const client = new FakeAiClient({
      overrides: {
        'interview-question': (input) => {
          controller.abort()
          return fakeInterviewQuestion(input as InterviewQuestionInput)
        },
      },
    })
    await expectAppError(
      askNextQuestion(db, owner, session.id, client, controller.signal),
      'CANCELLED',
    )
    expect(await db.select().from(interviewTurns)).toHaveLength(0)
  })

  it('a cancel that lands while the answer is extracted leaves the question open', async () => {
    const session = await startInterview(db, owner, workId)
    const turn = await askNextQuestion(db, owner, session.id, new FakeAiClient())
    const controller = new AbortController()
    const client = new FakeAiClient({
      overrides: {
        'interview-extract': (input) => {
          controller.abort()
          return fakeInterviewExtraction(input as InterviewExtractInput)
        },
      },
    })
    await expectAppError(
      answerTurn(db, editor, { turnId: turn.id, answer: '답' }, client, controller.signal),
      'CANCELLED',
    )
    const [stored] = await db.select().from(interviewTurns).where(eq(interviewTurns.id, turn.id))
    expect(stored.answer).toBeNull()
    expect(await db.select().from(proposals)).toHaveLength(0)
  })

  it('takes the newest reader simulation of each chapter and the three latest chapters, oldest first', async () => {
    const positions = [1, 2, 3, 4]
    const chaptersById = new Map<number, string>()
    for (const position of positions) {
      const chapter = await createTestChapter(db, workId, { position, title: `${position}화` })
      chaptersById.set(position, chapter.id)
    }
    await insertReaderRun(chaptersById.get(1)!, 'OLD1', new Date('2026-10-01T00:00:00Z'))
    await insertReaderRun(chaptersById.get(2)!, 'CH2', new Date('2026-10-02T00:00:00Z'))
    await insertReaderRun(chaptersById.get(3)!, 'CH3', new Date('2026-10-03T00:00:00Z'))
    await insertReaderRun(chaptersById.get(4)!, 'OLD4', new Date('2026-10-04T00:00:00Z'))
    await insertReaderRun(chaptersById.get(4)!, 'NEW4', new Date('2026-10-05T00:00:00Z'))

    const session = await startInterview(db, owner, workId)
    const { client, inputs } = recordQuestions()
    await askNextQuestion(db, owner, session.id, client)
    const reactions = inputs[0].story.readerReactions
    expect(reactions.map((r) => r.position)).toEqual([2, 3, 4])
    expect(reactions[0].digest).toContain('CH2')
    expect(reactions[1].digest).toContain('CH3')
    expect(reactions[2].digest).toContain('NEW4')
    expect(reactions[2].digest).not.toContain('OLD4')
  })
})

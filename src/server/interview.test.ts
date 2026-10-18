import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import {
  aiRuns,
  interviewSessions,
  interviewTurns,
  proposals,
  threads,
  wikiEntries,
} from '@/db/schema'
import type { Actor } from '@/db/types'
import { isAppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import {
  answerTurn,
  askNextQuestion,
  completeInterview,
  getInterviewState,
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
    expect(prompt).toContain('<history>')
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
        evidence: '',
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

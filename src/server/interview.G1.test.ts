import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { GenerateObjectArgs } from '@/ai/types'
import type { Db } from '@/db/client'
import { proposals } from '@/db/schema'
import type { Actor } from '@/db/types'
import { fakeInterviewExtraction } from '@/test/ai-fakes/interview-extract'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestEntry,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { answerTurn, askNextQuestion, startInterview } from '@/server/interview'

/** Records every prompt that reaches the AI, then answers with the deterministic fake output. */
class RecordingAiClient extends FakeAiClient {
  prompts: string[] = []

  override async generateObject<T>(args: GenerateObjectArgs<T>) {
    this.prompts.push(args.prompt)
    return super.generateObject(args)
  }
}

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

/** Asks one question and answers it. The prompt log is cleared after the question call. */
async function ask(client: RecordingAiClient, answer: string) {
  const session = await startInterview(db, owner, workId)
  const turn = await askNextQuestion(db, owner, session.id, client)
  client.prompts = []
  return answerTurn(db, editor, { turnId: turn.id, answer }, client)
}

describe('answerTurn: undecided-only answers (G1)', () => {
  it('skips the AI call and creates no proposals for an undecided answer', async () => {
    const client = new RecordingAiClient()
    const { turn, proposals: created } = await ask(client, '아직 정하지 않았어요.')
    expect(client.prompts).toHaveLength(0)
    expect(turn.answer).toBe('아직 정하지 않았어요.')
    expect(turn.proposalCount).toBe(0)
    expect(created).toHaveLength(0)
  })

  it('still calls the AI when the undecided sentence is mixed with content', async () => {
    const client = new RecordingAiClient()
    await ask(client, '아직 정하지 않았어요. 결말은 열린 채로 둘까 해요.')
    expect(client.prompts).toHaveLength(1)
  })

  it('skips the AI call for a topic-prefixed undecided answer', async () => {
    const client = new RecordingAiClient()
    await ask(client, '결말은 아직 정하지 않았어요.')
    expect(client.prompts).toHaveLength(0)
  })
})

describe('answerTurn: known facts (G1)', () => {
  it('does not propose a fact that repeats a wiki fact', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, {
      content: '서윤은 열일곱 살 검객이다.',
      entryId: seoyun.id,
    })
    const client = new RecordingAiClient()
    await ask(client, '서윤은 열일곱 살 검객이다.')

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.filter((r) => r.type === 'fact_create')).toHaveLength(0)
  })

  it('sends the existing fact text in <known_facts>', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createTestFact(db, workId, {
      content: '서윤은 열일곱 살 검객이다.',
      entryId: seoyun.id,
    })
    const client = new RecordingAiClient()
    await ask(client, '서윤은 열일곱 살 검객이다. 그녀는 복수를 원한다.')

    expect(client.prompts[0]).toContain('<known_facts>')
    expect(client.prompts[0]).toContain('- 서윤: 서윤은 열일곱 살 검객이다.')
  })

  it('does not propose a fact again when a pending fact already says it', async () => {
    const client = new RecordingAiClient()
    const session = await startInterview(db, owner, workId)
    const first = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(db, editor, { turnId: first.id, answer: '서윤은 검을 쓴다.' }, client)
    const second = await askNextQuestion(db, owner, session.id, client)
    await answerTurn(db, editor, { turnId: second.id, answer: '서윤은 검을 쓴다.' }, client)

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.filter((r) => r.type === 'fact_create')).toHaveLength(1)
  })

  it('drops a fact whose evidence is not in the answer', async () => {
    const client = new RecordingAiClient({
      overrides: {
        'interview-extract': (input) => {
          const base = fakeInterviewExtraction(
            input as Parameters<typeof fakeInterviewExtraction>[0],
          )
          return {
            ...base,
            facts: [
              {
                subjectName: '서윤',
                content: '서윤은 검을 쓴다.',
                evidence: '서윤은 칼을 쓴다.',
                suggestedStatus: 'confirmed',
                supersedesFactRef: null,
              },
            ],
          }
        },
      },
    })
    await ask(client, '서윤은 검을 쓴다.')

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows.filter((r) => r.type === 'fact_create')).toHaveLength(0)
  })
})

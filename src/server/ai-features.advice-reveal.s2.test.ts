import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { runDirectionAdvice } from '@/server/ai-features'
import { createFact } from '@/server/facts'

// Stage 2 review fix D3: direction advice leaves out facts that are not yet revealed in the next
// chapter, so the advice text cannot carry a secret into the chapter plan prompt.

const SECRET = '서윤의 아버지는 살아 있다.'

let db: Db
let actor: { userId: string }
let workId: string
let entryId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  actor = { userId: owner.id }
  workId = work.id
  for (const position of [1, 2, 3]) {
    await createTestChapter(db, workId, { position, body: '본문' })
  }
  const entry = await createTestEntry(db, workId, { name: '서윤', summary: '주인공' })
  entryId = entry.id
})

async function addFact(content: string, revealAtPosition: number | null) {
  return createFact(db, actor, {
    workId,
    entryId,
    content,
    status: 'confirmed',
    sourceType: 'author',
    revealAtPosition,
  })
}

async function advicePrompt(): Promise<string> {
  const client = new FakeAiClient()
  await runDirectionAdvice(db, actor, { workId }, client)
  return client.recorded[0].prompt
}

describe('runDirectionAdvice reveal lock', () => {
  it('leaves out a fact revealed after the next chapter', async () => {
    await addFact(SECRET, 5)
    expect(await advicePrompt()).not.toContain(SECRET)
  })

  it('includes a fact revealed in the next chapter', async () => {
    await addFact(SECRET, 4)
    expect(await advicePrompt()).toContain(SECRET)
  })

  it('does not let a hidden fact take one of the five fact slots', async () => {
    await addFact(SECRET, 9)
    const shown = ['사실 하나', '사실 둘', '사실 셋', '사실 넷', '사실 다섯']
    for (const content of shown) await addFact(content, null)

    const prompt = await advicePrompt()
    for (const content of shown) expect(prompt).toContain(content)
    expect(prompt).not.toContain(SECRET)
  })
})

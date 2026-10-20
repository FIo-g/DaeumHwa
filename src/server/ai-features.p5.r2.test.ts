import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLANNED_THREAD_MARK } from '@/ai/context'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { startDraft } from '@/server/ai-features'

const INSTRUCTIONS = '서윤이 편지를 발견한다.'

function markedLines(prompt: string): string[] {
  return prompt.split('\n').filter((line) => line.startsWith('- [T'))
}

describe('startDraft planned-thread mark (P5)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  let plantedChapterId: string

  beforeEach(async () => {
    db = await createTestDb()
    const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    actor = { userId: owner.id }
    workId = work.id
    const chapter = await createTestChapter(db, workId, { position: 1, body: '첫 회차 본문이다.' })
    plantedChapterId = chapter.id
    await createTestThread(db, workId, {
      title: '계획 떡밥',
      status: 'planned',
      targetChapterPosition: 8,
    })
    await createTestThread(db, workId, { title: '심은 떡밥', status: 'planted', plantedChapterId })
    await createTestThread(db, workId, {
      title: '진행 떡밥',
      status: 'developing',
      plantedChapterId,
    })
  })

  it('marks only the planned thread in the first prompt', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '서윤은 편지를 펼쳤다.' },
    })
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5000, entryIds: [] },
      client,
    )
    await run.done

    const lines = markedLines(stream.mock.calls[0][0].prompt)
    expect(lines).toHaveLength(3)
    const planned = lines.filter((line) => line.includes('계획 떡밥'))
    expect(planned).toHaveLength(1)
    expect(planned[0]).toContain(PLANNED_THREAD_MARK)
    expect(lines.filter((line) => line.includes(PLANNED_THREAD_MARK))).toHaveLength(1)
  })

  it('keeps the mark in the continuation prompt', async () => {
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => '짧은 초안이다.' } })
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 5500, entryIds: [] },
      client,
    )
    await run.done

    const continuation = stream.mock.calls.find((call) => call[0].task.name === 'draft-continue')
    expect(continuation).toBeDefined()
    const planned = markedLines(continuation?.[0].prompt ?? '').filter((line) =>
      line.includes('계획 떡밥'),
    )
    expect(planned).toHaveLength(1)
    expect(planned[0]).toContain(PLANNED_THREAD_MARK)
  })

  it('keeps the mark in the beat-list prompt', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '서윤은 편지를 펼쳤다.' },
    })
    const generate = vi.spyOn(client, 'generateObject')

    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [], twoStep: true },
      client,
    )
    await run.done

    expect(generate.mock.calls[0][0].task.name).toBe('draft-beats')
    const planned = markedLines(generate.mock.calls[0][0].prompt).filter((line) =>
      line.includes('계획 떡밥'),
    )
    expect(planned).toHaveLength(1)
    expect(planned[0]).toContain(PLANNED_THREAD_MARK)
  })

  it('adds no mark when no thread is planned', async () => {
    const noPlanDb = await createTestDb()
    const owner = await createTestUser(noPlanDb, { name: '작가', email: 'author2@example.com' })
    const work = await createTestWork(noPlanDb, owner.id, { title: '잿빛 도시' })
    const chapter = await createTestChapter(noPlanDb, work.id, {
      position: 1,
      body: '첫 회차 본문이다.',
    })
    await createTestThread(noPlanDb, work.id, {
      title: '심은 떡밥',
      status: 'planted',
      plantedChapterId: chapter.id,
    })

    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '서윤은 편지를 펼쳤다.' },
    })
    const stream = vi.spyOn(client, 'streamText')

    const run = await startDraft(
      noPlanDb,
      { userId: owner.id },
      { workId: work.id, instructions: INSTRUCTIONS, targetChars: 5000, entryIds: [] },
      client,
    )
    await run.done

    expect(stream.mock.calls[0][0].prompt).not.toContain(PLANNED_THREAD_MARK)
  })
})

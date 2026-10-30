import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'
import { createDirective } from '@/server/directives'

// Stage 2 review fix B3: a length request sets the chapter target. The prompt's target lines, the
// expand rounds and the check then use one number, and an explicit target that differs is the
// author's choice for that chapter.

const WORK_DEFAULT = 5500
const REQUEST_TARGET = 3000
// Sentences of 12 characters including spaces: 510 of them are 6,120 characters. 270 are 3,240,
// above the 1.05 times target that a second expand round would still grow, and inside the band.
const LONG = '그는 골목을 걸었다. '.repeat(510)
const SHORT = '그는 골목을 걸었다. '.repeat(270)

let db: Db
let actor: { userId: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  actor = { userId: owner.id }
  workId = work.id
})

async function lengthRequest(scope: 'work' | 'chapter', chapterPosition: number | null = null) {
  return createDirective(db, actor, {
    workId,
    scope,
    kind: 'length',
    text: '이번 화는 짧게 쓴다.',
    chapterPosition,
    targetChars: REQUEST_TARGET,
    source: 'author',
  })
}

describe('a length request sets the chapter target (stage 2, B3)', () => {
  it('uses the request target for the prompt, the expand path and the check', async () => {
    await lengthRequest('work')
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => SHORT } })
    const { runId, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 골목을 걷는다.', entryIds: [] },
      client,
    )
    const text = await done
    expect(text).toBe(SHORT)
    const first = client.recorded[0]
    expect(first.prompt).toContain(
      `<target_length>공백 포함 ${REQUEST_TARGET}자 이상, ${Math.floor(REQUEST_TARGET * 1.2)}자 이하</target_length>`,
    )
    expect(first.prompt).not.toContain(`${WORK_DEFAULT}자 이상`)
    expect(client.recorded.filter((c) => c.name === 'draft-expand')).toHaveLength(0)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
    expect((row.output as { directiveFindings?: unknown }).directiveFindings).toBeUndefined()
  })

  it('keeps the length request out of the prompt when the author sets another target', async () => {
    await lengthRequest('work')
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => LONG } })
    const { runId, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 골목을 걷는다.', targetChars: 5500, entryIds: [] },
      client,
    )
    await done
    const first = client.recorded[0]
    expect(first.promptPrefix?.join('\n') ?? '').not.toContain('(분량:')
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId)).limit(1)
    expect((row.output as { directiveFindings?: unknown }).directiveFindings).toBeUndefined()
  })

  it('changes only the target of the chapter the chapter-scope request names', async () => {
    const first = await createTestChapter(db, workId, { position: 1 })
    const second = await createTestChapter(db, workId, { position: 2 })
    await lengthRequest('chapter', 2)
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => LONG } })
    await (
      await startDraft(
        db,
        actor,
        { workId, chapterId: second.id, instructions: '서윤이 골목을 걷는다.', entryIds: [] },
        client,
      )
    ).done
    await (
      await startDraft(
        db,
        actor,
        { workId, chapterId: first.id, instructions: '서윤이 골목을 걷는다.', entryIds: [] },
        client,
      )
    ).done
    expect(client.recorded[0].prompt).toContain(`공백 포함 ${REQUEST_TARGET}자 이상`)
    expect(client.recorded[0].prompt).not.toContain(`공백 포함 ${WORK_DEFAULT}자 이상`)
    expect(client.recorded[1].prompt).toContain(`공백 포함 ${WORK_DEFAULT}자 이상`)
    expect(client.recorded[1].prompt).not.toContain(`공백 포함 ${REQUEST_TARGET}자 이상`)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { chapterVersions } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { createChapterFromDraft, startDraft } from '@/server/ai-features'

const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
const DRAFT = '서윤은 편지를 펼쳤다. 종이는 눅눅했다.'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

describe('createChapterFromDraft with an explicit body (track E1)', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string
  let runId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
    // targetChars is tiny so no continuation runs and the stored text is exactly DRAFT.
    const client = new FakeAiClient({ overrides: { 'draft-chapter': () => DRAFT } })
    const run = await startDraft(
      db,
      actor,
      { workId, instructions: INSTRUCTIONS, targetChars: 10, entryIds: [] },
      client,
    )
    await run.done
    runId = run.runId
  })

  it('saves the given body instead of the run text and keeps the ai_draft source', async () => {
    const body = '서윤은 편지를 펼쳤다. 종이는 눅눅했고, 날짜는 지워져 있었다.'
    const chapter = await createChapterFromDraft(db, actor, { workId, runId, title: '초안', body })

    expect(chapter.body).toBe(body)
    const versions = await db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapter.id))
    expect(versions.map((v) => v.source)).toEqual(['ai_draft'])
  })

  it('rejects a blank body with VALIDATION', async () => {
    await expect(
      createChapterFromDraft(db, actor, { workId, runId, body: '   \n ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: '본문이 비어 있습니다.' })
    await expect(
      createChapterFromDraft(db, actor, { workId, runId, body: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

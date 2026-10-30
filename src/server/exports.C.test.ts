import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { buildExportPayload } from './exports'

// Track C: a repaired draft keeps its raw text in the backup, on purpose (spec 7, brief risks).

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

describe('buildExportPayload with a repaired draft', () => {
  it('exports the draft run with its rawText next to text', async () => {
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id, { title: '작품' })
    const [run] = await db
      .insert(aiRuns)
      .values({
        workId: work.id,
        userId: owner.id,
        task: 'draft-chapter',
        status: 'done',
        output: { text: 'a', rawText: 'b' },
      })
      .returning()

    const payload = await buildExportPayload(db, { userId: owner.id }, work.id)
    const exported = payload.aiRuns.find((row) => row.id === run.id)
    expect(exported?.output).toEqual({ text: 'a', rawText: 'b' })
  })
})

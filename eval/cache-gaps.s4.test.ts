import { describe, expect, it } from 'vitest'
import { aiRuns } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { collectWritingRuns, isWritingTask, summarizeGaps } from './cache-gaps'

function at(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000)
}

describe('cache-gaps', () => {
  it('ignores non-writing tasks', () => {
    expect(isWritingTask('draft-chapter')).toBe(true)
    expect(isWritingTask('draft-continue')).toBe(true)
    expect(isWritingTask('scene-fix')).toBe(true)
    expect(isWritingTask('proofread')).toBe(false)
    expect(isWritingTask('interview-question')).toBe(false)
  })

  it('counts one of three gaps in the 5-60 minute window', async () => {
    const db = await createTestDb()
    const user = await createTestUser(db)
    const work = await createTestWork(db, user.id)
    const base = new Date('2026-10-20T00:00:00.000Z')
    const times = [at(base, 0), at(base, 2), at(base, 12), at(base, 102)]
    for (const createdAt of times) {
      await db.insert(aiRuns).values({
        workId: work.id,
        userId: user.id,
        task: 'draft-chapter',
        status: 'done',
        model: 'stub-model',
        inputTokens: 10,
        outputTokens: 5,
        createdAt,
      })
    }
    // A non-writing call between them must not split the gaps.
    await db.insert(aiRuns).values({
      workId: work.id,
      userId: user.id,
      task: 'proofread',
      status: 'done',
      model: 'stub-model',
      inputTokens: 10,
      outputTokens: 5,
      createdAt: at(base, 6),
    })
    const rows = await collectWritingRuns(db)
    expect(rows).toHaveLength(4)
    const summary = summarizeGaps(rows)
    expect(summary).toHaveLength(1)
    expect(summary[0].workId).toBe(work.id)
    expect(summary[0].total).toBe(4)
    expect(summary[0].inWindow).toBe(1)
    expect(summary[0].share).toBeCloseTo(1 / 3, 9)
  })
})

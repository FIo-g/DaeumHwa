import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { planDraft, startDraft } from '@/server/ai-features'

async function readAll(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

describe('plan revision notes in the draft run (stage 3 task 7)', () => {
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

  it('refuses a sixth earlier note in the plan action schema', async () => {
    const mod = (await import('@/server/actions/ai-features')) as unknown as {
      PlanDraftSchema: { safeParse(v: unknown): { success: boolean } }
    }
    const card = {
      scenes: [
        {
          summary: '성문 앞에 선다.',
          goal: '안으로 들어간다',
          decision: '',
          stake: '',
          trigger: '',
          role: 'opening',
          place: '성문',
          characters: [],
          targetChars: 1250,
        },
      ],
      ending: { device: 'crisis', line: '문이 열린다.' },
      threads: [],
    }
    const base = {
      workId: crypto.randomUUID(),
      instructions: '문을 연다',
      entryIds: [],
      revision: {
        card,
        note: '지금 메모',
        earlierNotes: ['1', '2', '3', '4', '5', '6'],
      },
    }
    expect(mod.PlanDraftSchema.safeParse(base).success).toBe(false)
    expect(
      mod.PlanDraftSchema.safeParse({
        ...base,
        revision: { ...base.revision, earlierNotes: ['1', '2'] },
      }).success,
    ).toBe(true)
  })

  it('a finished draft run with a plan keeps instructions and planNotes', async () => {
    const client = new FakeAiClient()
    const planned = await planDraft(
      db,
      actor,
      { workId, instructions: '열쇠를 목에 건다', entryIds: [], targetChars: 5000 },
      client,
    )
    const notes = ['열쇠를 목에 건다', '밤에 비가 온다']
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      {
        workId,
        instructions: '열쇠를 목에 건다',
        entryIds: [],
        targetChars: 5000,
        plan: planned.card,
        planRunId: planned.runId,
        planNotes: notes,
      },
      client,
    )
    await readAll(textStream)
    await done
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    const output = (row?.output ?? {}) as Record<string, unknown>
    expect(output['instructions']).toBe('열쇠를 목에 건다')
    expect(output['planNotes']).toEqual(notes)
    expect(output['plan']).toEqual(planned.card)
  })

  it('a quick-path run keeps instructions and an empty planNotes', async () => {
    const client = new FakeAiClient()
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '문을 연다', entryIds: [], targetChars: 5000 },
      client,
    )
    await readAll(textStream)
    await done
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    const output = (row?.output ?? {}) as Record<string, unknown>
    expect(output['instructions']).toBe('문을 연다')
    expect(output['planNotes']).toEqual([])
  })
})

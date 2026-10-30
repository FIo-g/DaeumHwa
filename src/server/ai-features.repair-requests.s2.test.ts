import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { repairDraft, repairDraftForeignScript, startDraft } from '@/server/ai-features'
import { createDirective } from '@/server/directives'

// Stage 2 (review fix 3): the repair paths send the requests that apply to the run's chapter and
// text, as previewDraftRefinement does. A draft for a new chapter uses the next chapter position.

let db: Db
let actor: Actor
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  actor = { userId: owner.id }
  workId = work.id
})

/** A finished draft run for a new chapter (no chapterId), made with the fake client. */
async function finishedNewChapterDraft(): Promise<string> {
  const { runId, done } = await startDraft(
    db,
    actor,
    { workId, instructions: '서윤이 편지를 찾는다.', entryIds: [] },
    new FakeAiClient(),
  )
  await done
  return runId
}

function repairCall(client: FakeAiClient): string {
  const call = client.recorded.find((c) => c.name === 'draft-repair')
  expect(call).toBeDefined()
  return call?.prompt ?? ''
}

describe('repair paths send the author requests (stage 2 review)', () => {
  it('repairDraftForeignScript sends the chapter request of the next position for a new chapter', async () => {
    await createTestChapter(db, workId, { position: 1 })
    await createDirective(db, actor, {
      workId,
      scope: 'chapter',
      kind: 'content',
      text: '이번 화는 짧게 쓴다.',
      chapterPosition: 1,
      source: 'author',
    })
    await createDirective(db, actor, {
      workId,
      scope: 'chapter',
      kind: 'content',
      text: '새 회차에서는 편지를 태운다.',
      chapterPosition: 2,
      source: 'author',
    })
    const runId = await finishedNewChapterDraft()

    const client = new FakeAiClient()
    await repairDraftForeignScript(
      db,
      actor,
      { workId, runId, text: '서윤이 웃었다. 我 본다.' },
      client,
    )
    const prompt = repairCall(client)
    expect(prompt).toContain('<author_requests>')
    expect(prompt).toContain('[2화만] 새 회차에서는 편지를 태운다.')
    expect(prompt).not.toContain('이번 화는 짧게 쓴다.')
  })

  it('repairDraftForeignScript sends a character request named in the text', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await createDirective(db, actor, {
      workId,
      scope: 'character',
      kind: 'speech',
      text: '서윤은 존댓말을 쓴다.',
      entryId: seoyun.id,
      speechLevel: 'jondaet',
      source: 'author',
    })
    const runId = await finishedNewChapterDraft()

    const client = new FakeAiClient()
    await repairDraftForeignScript(
      db,
      actor,
      { workId, runId, text: '서윤이 웃었다. 我 본다.' },
      client,
    )
    expect(repairCall(client)).toContain('[인물 서윤] 서윤은 존댓말을 쓴다. (말투: 존댓말)')
  })

  it('repairDraft sends the requests block with its flagged sentences', async () => {
    const runId = await finishedNewChapterDraft()
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: '모든 장면에서 존댓말을 쓴다.',
      source: 'author',
    })

    const client = new FakeAiClient()
    // Eight repeats of one word give a repeated-word flag, so the repair call runs.
    const repeated = Array.from({ length: 8 }, (_, i) => `바람이 ${i + 1}번 분다.`).join(' ')
    await repairDraft(db, actor, { workId, runId, text: repeated }, client)
    const prompt = repairCall(client)
    expect(prompt.startsWith('<author_requests>\n')).toBe(true)
    expect(prompt).toContain('[작품 전체] 모든 장면에서 존댓말을 쓴다.')
  })
})

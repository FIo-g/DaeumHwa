import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { buildExpandPrompt } from '@/ai/tasks/draft-expand'
import { draftRepairTask } from '@/ai/tasks/draft-repair'
import { sceneRewriteTask } from '@/ai/tasks/scene-rewrite'
import type { DirectiveForPrompt } from '@/lib/directives'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { planDraft, startDraft } from '@/server/ai-features'
import { archiveDirective, createDirective, updateDirective } from '@/server/directives'

// Stage 2 (task 4): the writing services send the active author requests in the cached prefix.

const WORK_TEXT = '모든 장면에서 존댓말을 쓴다.'
const OFF_TEXT = '비 오는 장면을 쓰지 않는다.'
const CHARACTER_TEXT = '민준은 항상 혼잣말을 한다.'
const CHAPTER_TEXT = '이번 화는 짧게 쓴다.'

const request: DirectiveForPrompt = {
  id: 'r',
  scope: 'work',
  kind: 'style',
  text: WORK_TEXT,
  pattern: null,
  speechLevel: null,
  targetChars: null,
  chapterPosition: null,
  entryId: null,
  entryName: null,
}

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

describe('author requests in the writing prompt (stage 2)', () => {
  it('sends an active work request in the prefix of the draft call', async () => {
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: WORK_TEXT,
      source: 'author',
    })
    const client = new FakeAiClient()
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 편지를 찾는다.', entryIds: [] },
      client,
    )
    await done
    const first = client.recorded[0]
    expect(first.promptPrefix?.[0]).toContain('<author_requests>')
    expect(first.promptPrefix?.[0]).toContain(`[작품 전체] ${WORK_TEXT}`)
    expect(first.prompt).not.toContain(WORK_TEXT)
  })

  it('sends neither an off request nor an archived one', async () => {
    const off = await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'ban',
      text: OFF_TEXT,
      source: 'author',
    })
    await updateDirective(db, actor, off.id, { status: 'off' })
    const archived = await createDirective(db, actor, {
      workId,
      scope: 'chapter',
      kind: 'content',
      text: CHAPTER_TEXT,
      chapterPosition: 1,
      source: 'author',
    })
    await archiveDirective(db, actor, archived.id)

    const client = new FakeAiClient()
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 편지를 찾는다.', entryIds: [] },
      client,
    )
    await done
    const prefix = (client.recorded[0].promptPrefix ?? []).join('\n')
    expect(prefix).not.toContain(OFF_TEXT)
    expect(prefix).not.toContain(CHAPTER_TEXT)
  })

  it('sends a character request only when that character is in the chapter context', async () => {
    const minjun = await createTestEntry(db, workId, { name: '민준', kind: 'character' })
    await createDirective(db, actor, {
      workId,
      scope: 'character',
      kind: 'content',
      text: CHARACTER_TEXT,
      entryId: minjun.id,
      source: 'author',
    })

    const unselected = new FakeAiClient()
    const withoutCharacter = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 편지를 찾는다.', entryIds: [] },
      unselected,
    )
    await withoutCharacter.done
    expect(unselected.recorded[0].promptPrefix?.join('\n') ?? '').not.toContain(CHARACTER_TEXT)

    const selected = new FakeAiClient()
    const withCharacter = await startDraft(
      db,
      actor,
      { workId, instructions: '민준이 편지를 찾는다.', entryIds: [minjun.id] },
      selected,
    )
    await withCharacter.done
    expect(selected.recorded[0].promptPrefix?.join('\n')).toContain(`[인물 민준] ${CHARACTER_TEXT}`)
  })

  it('does not change a draft that has already started', async () => {
    const client = new FakeAiClient()
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 편지를 찾는다.', entryIds: [] },
      client,
    )
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: WORK_TEXT,
      source: 'author',
    })
    await done
    // The expansion calls of a short draft run after the request was added, and still send no block.
    expect(client.recorded.some((call) => call.name === 'draft-expand')).toBe(true)
    for (const call of client.recorded) {
      expect(call.promptPrefix?.join('\n') ?? '').not.toContain('<author_requests>')
      expect(call.prompt).not.toContain('<author_requests>')
    }
  })

  it('sends the same prefix to the plan call', async () => {
    await createDirective(db, actor, {
      workId,
      scope: 'work',
      kind: 'style',
      text: WORK_TEXT,
      source: 'author',
    })
    const client = new FakeAiClient()
    await planDraft(
      db,
      actor,
      { workId, instructions: '', entryIds: [], targetChars: 5000 },
      client,
    )
    const plan = client.recorded.find((call) => call.name === 'draft-plan')
    expect(plan?.promptPrefix?.[0]).toContain(`[작품 전체] ${WORK_TEXT}`)
    expect(plan?.prompt).not.toContain('<author_requests>')
  })

  it('puts the requests block first in the repair and scene rewrite prompts', () => {
    const repair = draftRepairTask.buildPrompt({
      text: '본문',
      flags: [{ kind: 'style', quote: '본문' }],
      requests: [request],
    } as never)
    const rewrite = sceneRewriteTask.buildPrompt({
      sceneText: '본문',
      findings: [],
      beats: null,
      requests: [request],
    } as never)
    expect(repair.startsWith('<author_requests>\n')).toBe(true)
    expect(rewrite.startsWith('<author_requests>\n')).toBe(true)
  })

  it('puts the requests block first in the expansion prompt, and only then', () => {
    const base = {
      before: '',
      scene: '본문',
      after: '',
      targetChars: 500,
      styleCards: [],
      instructions: '',
    }
    expect(buildExpandPrompt({ ...base, requests: [] })).toBe(buildExpandPrompt(base))
    const prompt = buildExpandPrompt({ ...base, requests: [request] })
    expect(prompt.startsWith(`<author_requests>\n`)).toBe(true)
    expect(prompt).toContain(`[작품 전체] ${WORK_TEXT}`)
    expect(prompt).toContain('\n</author_requests>\n\n<style_cards>')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { issues } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { createDirective } from '@/server/directives'
import { rewriteFlaggedScenes } from '@/server/scene-rewrite'

// Stage 2 (review fix 6): a scene rewrite sends the author requests that apply to its scene.

const SCENE = '서윤은 문 앞에 섰다. 문은 잠겨 있었다.'
const QUOTE = '문은 잠겨 있었다'
const WORK_TEXT = '모든 장면에서 존댓말을 쓴다.'

describe('rewriteFlaggedScenes sends the author requests', () => {
  it('puts the requests block first in the scene rewrite prompt', async () => {
    const db = await createTestDb()
    const owner = await createTestUser(db)
    const work = await createTestWork(db, owner.id)
    const actor = { userId: owner.id }
    const chapter = await createTestChapter(db, work.id, { position: 1, body: SCENE })
    await createDirective(db, actor, {
      workId: work.id,
      scope: 'work',
      kind: 'style',
      text: WORK_TEXT,
      source: 'author',
    })
    const [issue] = await db
      .insert(issues)
      .values({
        workId: work.id,
        chapterId: chapter.id,
        kind: 'contradiction',
        severity: 'high',
        quote: QUOTE,
        quoteStart: SCENE.indexOf(QUOTE),
        quoteEnd: SCENE.indexOf(QUOTE) + QUOTE.length,
        wikiExcerpt: '탑의 문은 밤에도 잠기지 않는다.',
        explanation: '설정과 어긋난다.',
        suggestion: '문은 열려 있었다',
        status: 'accepted',
      })
      .returning()

    const client = new FakeAiClient({
      overrides: { 'scene-rewrite': () => ({ text: '서윤은 문 앞에 섰다. 문은 열려 있었다.' }) },
    })
    const spy = vi.spyOn(client, 'generateObject')
    await rewriteFlaggedScenes(db, actor, { chapterId: chapter.id, issueIds: [issue.id] }, client)

    expect(spy).toHaveBeenCalledTimes(1)
    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt.startsWith('<author_requests>\n')).toBe(true)
    expect(prompt).toContain(`[작품 전체] ${WORK_TEXT}`)
    expect(prompt).toContain(`<scene>`)
  })
})

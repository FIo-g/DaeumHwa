import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { SceneRewriteInput } from '@/ai/tasks/scene-rewrite'
import { FakeAiClient } from '@/test/fake-ai'
import { aiRuns, chapters, chapterVersions, issues } from '@/db/schema'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { rewriteFlaggedScenes } from '@/server/scene-rewrite'

/** The scene text of a rewrite request (the task input arrives as unknown to the fake). */
const sceneOf = (raw: unknown): string => (raw as SceneRewriteInput).sceneText

const SCENE_1 = '서윤은 문 앞에 섰다. 바람이 차가웠다.'
const SCENE_2 = '문은 잠겨 있었다. 그녀는 열쇠를 꺼냈다.'
const SCENE_3 = '문이 열리고 빛이 새어 나왔다.'
const SEPARATOR = '\n\n* * *\n\n'
const BODY = `${SCENE_1}${SEPARATOR}${SCENE_2}${SEPARATOR}${SCENE_3}`
const QUOTE_2 = '문은 잠겨 있었다'
const WIKI_2 = '탑의 문은 밤에도 잠기지 않는다.'

type Setup = Awaited<ReturnType<typeof setup>>

async function setup(body: string = BODY) {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  const chapter = await createTestChapter(db, work.id, { position: 1, title: '1화', body })
  return { db, actor: { userId: owner.id }, workId: work.id, chapterId: chapter.id }
}

/** Inserts an issue for `quote` (first occurrence in `body` unless offsets are given). */
async function addIssue(
  s: Setup,
  quote: string,
  o: {
    start?: number | null
    end?: number | null
    status?: 'open' | 'accepted' | 'dismissed'
    suggestion?: string
    chapterId?: string
  } = {},
): Promise<string> {
  const body = await currentBody(s)
  const start = o.start !== undefined ? o.start : body.indexOf(quote)
  const end =
    o.end !== undefined ? o.end : start === null || start < 0 ? null : start + quote.length
  const [row] = await s.db
    .insert(issues)
    .values({
      workId: s.workId,
      chapterId: o.chapterId ?? s.chapterId,
      kind: 'contradiction',
      severity: 'high',
      quote,
      quoteStart: start,
      quoteEnd: end,
      wikiExcerpt: WIKI_2,
      explanation: '설정과 어긋난다.',
      suggestion: o.suggestion ?? '문은 열려 있었다',
      status: o.status ?? 'accepted',
    })
    .returning()
  return row.id
}

async function currentBody(s: Setup): Promise<string> {
  const [row] = await s.db.select().from(chapters).where(eq(chapters.id, s.chapterId))
  return row.body
}

async function currentVersion(s: Setup): Promise<number> {
  const [row] = await s.db.select().from(chapters).where(eq(chapters.id, s.chapterId))
  return row.version
}

/** Scene rewrite that replaces the first occurrence of the flagged quote in SCENE_2. */
const fixScene2 = (raw: unknown) => ({
  text: sceneOf(raw).replace(QUOTE_2, '문은 열려 있었다'),
})

describe('rewriteFlaggedScenes', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('rewrites only the flagged scene and keeps every other byte', async () => {
    const id = await addIssue(s, QUOTE_2)
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [id] },
      client,
    )

    const body = await currentBody(s)
    expect(body).toBe(
      `${SCENE_1}${SEPARATOR}문은 열려 있었다. 그녀는 열쇠를 꺼냈다.${SEPARATOR}${SCENE_3}`,
    )
    expect(body.startsWith(`${SCENE_1}${SEPARATOR}`)).toBe(true)
    expect(body.endsWith(`${SEPARATOR}${SCENE_3}`)).toBe(true)
    expect(result.rewritten).toHaveLength(1)
    expect(result.rewritten[0].issueIds).toEqual([id])
    expect(result.skipped).toEqual([])
    expect(result.chapter.version).toBe(2)
    expect(await currentVersion(s)).toBe(2)

    const versions = await s.db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, s.chapterId))
    expect(versions.length).toBeGreaterThan(0)

    const runs = await s.db.select().from(aiRuns).where(eq(aiRuns.task, 'scene-rewrite'))
    expect(runs).toHaveLength(1)
    expect(result.rewritten[0].runId).toBe(runs[0].id)
  })

  it('sends only the flagged scene, its finding and the wiki sentence to the model', async () => {
    const id = await addIssue(s, QUOTE_2)
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')

    await rewriteFlaggedScenes(s.db, s.actor, { chapterId: s.chapterId, issueIds: [id] }, client)

    expect(spy).toHaveBeenCalledTimes(1)
    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain(SCENE_2)
    expect(prompt).toContain(WIKI_2)
    expect(prompt).not.toContain(SCENE_1)
    expect(prompt).not.toContain(SCENE_3)
  })

  it('makes one call for two issues in the same scene and passes both findings', async () => {
    const first = await addIssue(s, QUOTE_2)
    const second = await addIssue(s, '그녀는 열쇠를 꺼냈다', { suggestion: '그녀는 빈손을 폈다' })
    const client = new FakeAiClient({
      overrides: {
        'scene-rewrite': (raw: unknown) => ({
          text: sceneOf(raw)
            .replace(QUOTE_2, '문은 열려 있었다')
            .replace('그녀는 열쇠를 꺼냈다', '그녀는 빈손을 폈다'),
        }),
      },
    })
    const spy = vi.spyOn(client, 'generateObject')

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [first, second] },
      client,
    )

    expect(spy).toHaveBeenCalledTimes(1)
    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain(QUOTE_2)
    expect(prompt).toContain('그녀는 열쇠를 꺼냈다')
    expect(result.rewritten[0].issueIds.sort()).toEqual([first, second].sort())
  })

  it('rewrites at most two scenes by default and skips the rest as over-limit', async () => {
    const one = await addIssue(s, '바람이 차가웠다', { suggestion: '바람이 따뜻했다' })
    const two = await addIssue(s, QUOTE_2)
    const three = await addIssue(s, '문이 열리고', { suggestion: '문이 닫히고' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [one, two, three] },
      client,
    )

    const sceneCalls = spy.mock.calls.filter((call) => call[0].task.name === 'scene-rewrite')
    expect(sceneCalls).toHaveLength(2)
    expect(result.skipped).toEqual([{ issueId: three, reason: 'over-limit' }])
    expect(result.rewritten.map((r) => r.issueIds)).toEqual([[one], [two]])
  })

  it('skips an issue whose span does not match the saved text, with no AI call', async () => {
    const id = await addIssue(s, QUOTE_2, { start: 0, end: QUOTE_2.length })
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')
    const before = await currentBody(s)

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [id] },
      client,
    )

    expect(result.skipped).toEqual([{ issueId: id, reason: 'span-mismatch' }])
    expect(spy).not.toHaveBeenCalled()
    expect(await currentBody(s)).toBe(before)
    expect(await currentVersion(s)).toBe(1)
  })

  it('skips an issue without offsets as no-span', async () => {
    const id = await addIssue(s, QUOTE_2, { start: null, end: null })
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [id] },
      client,
    )

    expect(result.skipped).toEqual([{ issueId: id, reason: 'no-span' }])
    expect(spy).not.toHaveBeenCalled()
  })

  it('reports an unknown issue id and an issue of another chapter as not-found', async () => {
    const other = await createTestChapter(s.db, s.workId, { position: 2, body: SCENE_3 })
    const foreign = await addIssue(s, '문이 열리고', { chapterId: other.id })
    const unknown = '00000000-0000-4000-8000-000000000000'
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [unknown, foreign] },
      client,
    )

    expect(result.skipped).toEqual([
      { issueId: unknown, reason: 'not-found' },
      { issueId: foreign, reason: 'not-found' },
    ])
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns an empty result without any AI call when no issue ids are given', async () => {
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [] },
      client,
    )

    expect(result.rewritten).toEqual([])
    expect(result.skipped).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('skips open and dismissed issues as not-accepted, with no AI call', async () => {
    const open = await addIssue(s, QUOTE_2, { status: 'open' })
    const dismissed = await addIssue(s, QUOTE_2, { status: 'dismissed' })
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')
    const before = await currentBody(s)

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [open, dismissed] },
      client,
    )

    expect(result.skipped).toEqual([
      { issueId: open, reason: 'not-accepted' },
      { issueId: dismissed, reason: 'not-accepted' },
    ])
    expect(spy).not.toHaveBeenCalled()
    expect(await currentBody(s)).toBe(before)
  })

  it('skips an accepted issue with an empty suggestion as no-suggestion', async () => {
    const id = await addIssue(s, QUOTE_2, { suggestion: '   ' })
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })
    const spy = vi.spyOn(client, 'generateObject')

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [id] },
      client,
    )

    expect(result.skipped).toEqual([{ issueId: id, reason: 'no-suggestion' }])
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a rewrite that still contains the quote as often as before', async () => {
    const id = await addIssue(s, QUOTE_2)
    const client = new FakeAiClient({
      overrides: { 'scene-rewrite': (raw: unknown) => ({ text: sceneOf(raw) }) },
    })
    const before = await currentBody(s)

    const result = await rewriteFlaggedScenes(
      s.db,
      s.actor,
      { chapterId: s.chapterId, issueIds: [id] },
      client,
    )

    expect(result.skipped).toEqual([{ issueId: id, reason: 'rejected' }])
    expect(result.rewritten).toEqual([])
    expect(await currentBody(s)).toBe(before)
    expect(await currentVersion(s)).toBe(1)
  })

  it('accepts a rewrite that removes one of two occurrences of the quote in the scene', async () => {
    const body = `${SCENE_1}${SEPARATOR}문은 잠겨 있었다. 문은 잠겨 있었다.${SEPARATOR}${SCENE_3}`
    const twice = await setup(body)
    const id = await addIssue(twice, QUOTE_2)
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })

    const result = await rewriteFlaggedScenes(
      twice.db,
      twice.actor,
      { chapterId: twice.chapterId, issueIds: [id] },
      client,
    )

    expect(result.rewritten).toHaveLength(1)
    expect(await currentBody(twice)).toBe(
      `${SCENE_1}${SEPARATOR}문은 열려 있었다. 문은 잠겨 있었다.${SEPARATOR}${SCENE_3}`,
    )
  })

  it('lets the AI error propagate and leaves the body unchanged', async () => {
    const id = await addIssue(s, QUOTE_2)
    const client = new FakeAiClient({
      overrides: {
        'scene-rewrite': () => {
          throw new Error('provider down')
        },
      },
    })
    const before = await currentBody(s)

    await expect(
      rewriteFlaggedScenes(s.db, s.actor, { chapterId: s.chapterId, issueIds: [id] }, client),
    ).rejects.toMatchObject({ code: 'AI_ERROR' })
    expect(await currentBody(s)).toBe(before)
    expect(await currentVersion(s)).toBe(1)
  })

  it('forbids a viewer and hides the chapter from a non-member', async () => {
    const id = await addIssue(s, QUOTE_2)
    const viewer = await createTestUser(s.db, { name: '독자', email: 'viewer@example.com' })
    await addTestMember(s.db, s.workId, viewer.id, 'viewer')
    const stranger = await createTestUser(s.db, { name: '외부인', email: 'out@example.com' })
    const client = new FakeAiClient({ overrides: { 'scene-rewrite': fixScene2 } })

    await expect(
      rewriteFlaggedScenes(
        s.db,
        { userId: viewer.id },
        { chapterId: s.chapterId, issueIds: [id] },
        client,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      rewriteFlaggedScenes(
        s.db,
        { userId: stranger.id },
        { chapterId: s.chapterId, issueIds: [id] },
        client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

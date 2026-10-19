import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeDraftContinue } from '@/test/ai-fakes/draft-chapter'
import type { Db } from '@/db/client'
import { aiRuns, chapterVersions, chapters, proposals } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestEntry,
  createTestThread,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import {
  createChapterFromDraft,
  listAdviceRuns,
  listReaderSimRuns,
  runDirectionAdvice,
  runReaderSimulation,
  startDraft,
  suggestStyleCard,
} from '@/server/ai-features'
import { createStyleCard } from '@/server/styles'
import * as run from '@/ai/run'

const CHAPTER_BODY = '서윤은 문을 열었다. "여기가 어디야?" 그녀가 물었다. 아무도 대답하지 않았다.'

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id, owner }
}

async function readAll(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

describe('reader simulation', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('stores an ai_runs row for the chapter and lists it', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: CHAPTER_BODY })
    const { runId, result } = await runReaderSimulation(
      db,
      actor,
      { chapterId: chapter.id },
      new FakeAiClient(),
    )

    expect(result.personas).toHaveLength(4)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.task).toBe('reader-sim')
    expect(row.chapterId).toBe(chapter.id)
    expect(row.status).toBe('done')

    const runs = await listReaderSimRuns(db, actor, workId, { chapterId: chapter.id })
    expect(runs.map((r) => r.id)).toEqual([runId])
  })

  it('runs only the personas that were asked for', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: CHAPTER_BODY })
    const { result } = await runReaderSimulation(
      db,
      actor,
      { chapterId: chapter.id, personaIds: ['reader-binge'] },
      new FakeAiClient(),
    )
    expect(result.personas.map((p) => p.personaId)).toEqual(['reader-binge'])
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: CHAPTER_BODY })
    const stranger = await createTestUser(db, { email: 'stranger@example.com' })
    await expect(
      runReaderSimulation(
        db,
        { userId: stranger.id },
        { chapterId: chapter.id },
        new FakeAiClient(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('direction advice', () => {
  it('returns three options and records the run', async () => {
    const { db, actor, workId } = await setup()
    await createTestChapter(db, workId, { position: 1, body: CHAPTER_BODY })
    await createTestEntry(db, workId, { name: '서윤', kind: 'character', summary: '주인공' })
    await createTestThread(db, workId, {
      title: '비밀 편지',
      status: 'planted',
      targetChapterPosition: 1,
    })

    const { runId, result } = await runDirectionAdvice(db, actor, { workId }, new FakeAiClient())
    expect(result.options).toHaveLength(3)
    expect(result.recommendedIndex).toBeGreaterThanOrEqual(0)
    expect(result.recommendedIndex).toBeLessThanOrEqual(2)

    const runs = await listAdviceRuns(db, actor, workId)
    expect(runs.map((r) => r.id)).toEqual([runId])
  })
})

describe('style card suggestion', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('creates a pending style_card proposal from three dialogue lines', async () => {
    await createTestChapter(db, workId, {
      position: 1,
      body: [
        '서윤이 고개를 저었다. "그건 아니야."',
        '서윤은 웃었다. "다시 말해 봐."',
        '서윤이 말했다. “알겠어요.”',
        '철수가 말했다. "나는 모른다."',
      ].join('\n'),
    })
    const entry = await createTestEntry(db, workId, { name: '서윤', kind: 'character' })

    const row = await suggestStyleCard(db, actor, { workId, entryId: entry.id }, new FakeAiClient())
    expect(row.type).toBe('style_card')
    expect(row.status).toBe('pending')
    expect(row.source).toBe('style')
    expect(row.payload).toMatchObject({ entryName: '서윤', name: '서윤 말투' })

    const stored = await db.select().from(proposals).where(eq(proposals.id, row.id))
    expect(stored).toHaveLength(1)
  })

  it('fails with BAD_STATE when fewer than three dialogue lines exist', async () => {
    await createTestChapter(db, workId, {
      position: 1,
      body: '서윤이 고개를 저었다. "그건 아니야."\n서윤은 웃었다. "다시 말해 봐."',
    })
    const entry = await createTestEntry(db, workId, { name: '서윤', kind: 'character' })

    const error = await suggestStyleCard(
      db,
      actor,
      { workId, entryId: entry.id },
      new FakeAiClient(),
    )
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'BAD_STATE',
      message: '이 인물의 대사를 원고에서 3줄 이상 찾지 못했습니다.',
    })

    const rows = await db.select().from(proposals).where(eq(proposals.workId, workId))
    expect(rows).toHaveLength(0)
  })
})

describe('draft', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('rejects empty instructions', async () => {
    await expect(
      startDraft(db, actor, { workId, instructions: '   ', entryIds: [] }, new FakeAiClient()),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '무슨 일이 일어나야 하는지 적어 주세요.',
    })
  })

  it('streams the fake text and stores it as the run output', async () => {
    const { runId, textStream, done } = await startDraft(
      db,
      actor,
      {
        workId,
        instructions: '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.',
        targetChars: 500,
        entryIds: [],
      },
      new FakeAiClient(),
    )
    const streamed = await readAll(textStream)
    const text = await done

    expect(streamed).toBe(text)
    expect(text.startsWith('(데모 초안) ')).toBe(true)

    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    expect(row.task).toBe('draft-chapter')
    expect(row.status).toBe('done')
    expect(row.output).toEqual({ text })
  })

  it('puts work cards, selected entry cards and the previous chapter tail into the prompt', async () => {
    const previous = await createTestChapter(db, workId, {
      position: 1,
      body: '앞부분 본문. 마지막 문장표식 문이 닫혔다.',
    })
    await db.update(chapters).set({ summary: '1화 요약' }).where(eq(chapters.id, previous.id))
    const current = await createTestChapter(db, workId, { position: 2, body: '' })
    const seoyun = await createTestEntry(db, workId, { name: '서윤', kind: 'character' })
    const chulsoo = await createTestEntry(db, workId, { name: '철수', kind: 'character' })
    await createStyleCard(db, actor, { workId, name: '작품 문체', tone: '담백하다.' })
    await createStyleCard(db, actor, {
      workId,
      entryId: seoyun.id,
      name: '서윤 말투',
      tone: '단호하다.',
    })
    await createStyleCard(db, actor, {
      workId,
      entryId: chulsoo.id,
      name: '철수 말투',
      tone: '느긋하다.',
    })

    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const { done } = await startDraft(
      db,
      actor,
      {
        workId,
        chapterId: current.id,
        instructions: '서윤이 문을 연다.',
        entryIds: [seoyun.id],
        targetChars: 3000,
      },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain('작품 문체')
    expect(prompt).toContain('서윤 말투')
    expect(prompt).not.toContain('철수 말투')
    expect(prompt).toContain('마지막 문장표식 문이 닫혔다.')
    expect(prompt).toContain('1화 요약')
    expect(prompt).toContain('3000')
    expect(prompt).toContain('서윤이 문을 연다.')
  })

  it('names the current chapter once when its title already starts with the number', async () => {
    const current = await createTestChapter(db, workId, { position: 2, title: '2화', body: '' })
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const { done } = await startDraft(
      db,
      actor,
      {
        workId,
        chapterId: current.id,
        instructions: '서윤이 문을 연다.',
        targetChars: 500,
        entryIds: [],
      },
      client,
    )
    await done

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt).toContain('<chapter>2화</chapter>')
    expect(prompt).not.toContain('2화 2화')
  })

  it('creates a chapter from a finished draft run with source ai_draft', async () => {
    const { runId, done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 편지를 발견한다.', targetChars: 500, entryIds: [] },
      new FakeAiClient(),
    )
    const text = await done

    const chapter = await createChapterFromDraft(db, actor, {
      workId,
      runId,
      title: '1화 초안',
    })
    expect(chapter.body).toBe(text)
    expect(chapter.title).toBe('초안')

    const versions = await db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapter.id))
    expect(versions.map((v) => v.source)).toEqual(['ai_draft'])
  })

  it('does not create a chapter from an unknown run id', async () => {
    await expect(
      createChapterFromDraft(db, actor, {
        workId,
        runId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a draft from a viewer', async () => {
    const viewer = await createTestUser(db, { email: 'viewer@example.com' })
    await addTestMember(db, workId, viewer.id, 'viewer')
    await expect(
      startDraft(
        db,
        { userId: viewer.id },
        { workId, instructions: '서윤이 편지를 발견한다.', entryIds: [] },
        new FakeAiClient(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('draft continuation', () => {
  const INSTRUCTIONS = '서윤이 편지를 발견한다. 편지에는 날짜가 적혀 있다.'
  const FIRST_DRAFT = `(데모 초안) ${'서윤은 문을 열었다. 바람이 차가웠다. '.repeat(40)}`
  const SHORT_CONTINUATION = '짧은 이어쓰기.'
  let db: Db
  let actor: { userId: string }
  let workId: string
  let savedLimit: string | undefined

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
    savedLimit = process.env.AI_DAILY_TOKEN_LIMIT
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (savedLimit === undefined) delete process.env.AI_DAILY_TOKEN_LIMIT
    else process.env.AI_DAILY_TOKEN_LIMIT = savedLimit
  })

  function draftInput(extra: { targetChars?: number } = {}) {
    return {
      workId,
      instructions: INSTRUCTIONS,
      targetChars: 5000,
      entryIds: [],
      ...extra,
    }
  }

  async function outputOf(runId: string) {
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    return row
  }

  async function continuationRows() {
    return db
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.workId, workId), eq(aiRuns.task, 'draft-continue')))
  }

  /** The first run keeps its text and carries exactly one continue-failed warning. */
  async function expectFirstTextKept(
    result: { runId: string; streamed: string; text: string },
    reason: string,
  ) {
    const row = await outputOf(result.runId)
    expect(row.status).toBe('done')
    const output = row.output as { text: string; warnings: unknown[] }
    expect(output.text.startsWith('(데모 초안) ')).toBe(true)
    expect(output.warnings).toEqual([
      {
        kind: 'continue-failed',
        reason,
        detail: expect.any(String),
        message: '이어쓰기 실패',
      },
    ])
    expect(result.text).toBe(output.text)
    expect(result.streamed).toBe(output.text)
    return output.warnings[0] as { detail: string }
  }

  async function runDraft(client: FakeAiClient, extra: { targetChars?: number } = {}) {
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(extra), client)
    const streamed = await readAll(textStream)
    const text = await done
    return { runId, streamed, text }
  }

  it('continues once when the first draft is short', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const { runId, textStream, done } = await startDraft(db, actor, draftInput(), client)
    const streamed = await readAll(textStream)
    const text = await done

    expect(spy).toHaveBeenCalledTimes(2)
    const second = spy.mock.calls[1][0]
    expect(second.task.name).toBe('draft-continue')
    expect(second.prompt).toContain('<draft_so_far>')
    expect(second.prompt).toContain('(데모 초안) ')
    expect(streamed).toBe(text)
    expect(text.startsWith('(데모 초안) ')).toBe(true)
    // The joined text is exactly first text + separator + continuation.
    const addition = '\n\n' + fakeDraftContinue()
    expect(text.endsWith(addition)).toBe(true)
    const firstText = text.slice(0, text.length - addition.length)
    expect(firstText).toBe(
      second.prompt.split('<draft_so_far>')[1].split('</draft_so_far>')[0].trim(),
    )

    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
    const [cont] = await continuationRows()
    expect(cont.status).toBe('done')
  })

  it('stores the joined text in the first run row with no warning on success', async () => {
    const client = new FakeAiClient()
    const { runId, done } = await startDraft(db, actor, draftInput(), client)
    const text = await done
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
  })

  it('does not continue when the first draft reaches the target', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-chapter': () => '가'.repeat(600) },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { done } = await startDraft(db, actor, draftInput({ targetChars: 500 }), client)
    expect(await done).toBe('가'.repeat(600))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(await continuationRows()).toHaveLength(0)
  })

  it('continues at most once', async () => {
    const client = new FakeAiClient({
      overrides: { 'draft-continue': () => SHORT_CONTINUATION },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, done } = await startDraft(db, actor, draftInput(), client)
    const text = await done

    expect(spy).toHaveBeenCalledTimes(2)
    expect(text.endsWith(SHORT_CONTINUATION)).toBe(true)
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text })
  })

  it('createChapterFromDraft keeps the continuation', async () => {
    const { runId, done } = await startDraft(db, actor, draftInput(), new FakeAiClient())
    const text = await done
    const chapter = await createChapterFromDraft(db, actor, { workId, runId })
    expect(chapter.body).toBe(text)
  })

  it('done resolves without anyone reading the text stream', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'streamText')
    const { done } = await startDraft(db, actor, draftInput(), client)
    const text = await done
    expect(spy).toHaveBeenCalledTimes(2)
    expect(text).toContain('(데모 이어쓰기) ')
  })

  describe('failure policy', () => {
    it('start guard error keeps the first text', async () => {
      const client = new FakeAiClient()
      const original = client.streamText.bind(client)
      vi.spyOn(client, 'streamText')
        .mockImplementationOnce(original)
        .mockImplementationOnce(() => {
          throw new AppError('CONFLICT', 'busy')
        })
      const result = await runDraft(client)
      const warning = await expectFirstTextKept({ ...result }, 'CONFLICT')
      expect(warning.detail).toContain('busy')
      const [cont] = await continuationRows()
      expect(cont.status).toBe('error')
    })

    it('provider error keeps the first text', async () => {
      const client = new FakeAiClient()
      const original = client.streamText.bind(client)
      vi.spyOn(client, 'streamText')
        .mockImplementationOnce(original)
        .mockImplementationOnce(() => {
          throw new Error('boom')
        })
      const result = await runDraft(client)
      const warning = await expectFirstTextKept(result, 'AI_ERROR')
      expect(warning.detail).toContain('boom')
    })

    it('failure after partial text keeps the first text and never shows the partial text', async () => {
      const client = new FakeAiClient()
      const original = client.streamText.bind(client)
      const final = Promise.reject(new Error('boom'))
      final.catch(() => {})
      vi.spyOn(client, 'streamText')
        .mockImplementationOnce(original)
        .mockImplementationOnce(() => ({
          textStream: (async function* () {
            yield 'partial'
            throw new Error('boom')
          })(),
          final,
        }))
      const result = await runDraft(client)
      await expectFirstTextKept(result, 'AI_ERROR')
      expect(result.text).not.toContain('partial')
      expect(result.streamed).not.toContain('partial')
    })

    it('empty continuation keeps the first text', async () => {
      const client = new FakeAiClient({ overrides: { 'draft-continue': () => '' } })
      const result = await runDraft(client)
      await expectFirstTextKept(result, 'EMPTY')
      const [cont] = await continuationRows()
      expect(cont.status).toBe('done')
    })

    it('whitespace-only continuation keeps the first text', async () => {
      const client = new FakeAiClient({ overrides: { 'draft-continue': () => '   \n' } })
      const result = await runDraft(client)
      await expectFirstTextKept(result, 'EMPTY')
    })

    it('daily limit reached before the continuation keeps the first text', async () => {
      process.env.AI_DAILY_TOKEN_LIMIT = '1000'
      const client = new FakeAiClient()
      const original = client.streamText.bind(client)
      vi.spyOn(client, 'streamText').mockImplementationOnce((args) => {
        const stream = original(args)
        return {
          ...stream,
          final: stream.final.then(async (result) => {
            await db.insert(aiRuns).values({
              userId: actor.userId,
              workId,
              task: 'draft-chapter',
              status: 'done',
              model: 'fake',
              inputTokens: 1_000_000,
              outputTokens: 0,
            })
            return result
          }),
        }
      })
      const result = await runDraft(client)
      await expectFirstTextKept(result, 'AI_LIMIT')
      expect(await continuationRows()).toHaveLength(0)
    })

    it('a failed warning write does not reject', async () => {
      const client = new FakeAiClient({
        overrides: { 'draft-continue': () => '' },
      })
      const spy = vi.spyOn(run, 'replaceRunOutput').mockRejectedValueOnce(new Error('write failed'))
      const { done, textStream } = await startDraft(db, actor, draftInput(), client)
      const streamed = await readAll(textStream)
      const text = await done
      expect(text.startsWith('(데모 초안) ')).toBe(true)
      expect(streamed).toBe(text)
      expect(spy).toHaveBeenCalled()
    })

    it('user abort during the continuation rejects', async () => {
      const controller = new AbortController()
      const client = new FakeAiClient()
      const original = client.streamText.bind(client)
      vi.spyOn(client, 'streamText')
        .mockImplementationOnce(original)
        .mockImplementationOnce(() => {
          controller.abort()
          throw new Error('aborted by user')
        })
      const { runId, textStream, done } = await startDraft(
        db,
        actor,
        draftInput(),
        client,
        controller.signal,
      )
      const chunks: string[] = []
      await expect(
        (async () => {
          for await (const chunk of textStream) chunks.push(chunk)
        })(),
      ).rejects.toMatchObject({ code: 'CANCELLED' })
      await expect(done).rejects.toMatchObject({ code: 'CANCELLED' })

      const first = chunks.join('')
      expect(first.startsWith('(데모 초안) ')).toBe(true)
      const row = await outputOf(runId)
      expect(row.output).toEqual({ text: first })
    })
  })

  it('skips the continuation when the signal is already aborted, with no warning', async () => {
    const controller = new AbortController()
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => {
          controller.abort()
          return FIRST_DRAFT
        },
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, done } = await startDraft(db, actor, draftInput(), client, controller.signal)
    expect(await done).toBe(FIRST_DRAFT)
    expect(spy).toHaveBeenCalledTimes(1)
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text: FIRST_DRAFT })
  })

  it('skips the continuation when under 30 seconds of the 290 second budget remain, with no warning', async () => {
    let offset = 0
    const base = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => base + offset)
    const client = new FakeAiClient({
      overrides: {
        'draft-chapter': () => {
          offset = 270_000
          return FIRST_DRAFT
        },
      },
    })
    const spy = vi.spyOn(client, 'streamText')
    const { runId, done } = await startDraft(db, actor, draftInput(), client)
    expect(await done).toBe(FIRST_DRAFT)
    expect(spy).toHaveBeenCalledTimes(1)
    const row = await outputOf(runId)
    expect(row.output).toEqual({ text: FIRST_DRAFT })
  })
})

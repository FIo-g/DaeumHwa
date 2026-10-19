import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeParagraphTrim } from '@/test/ai-fakes/paragraph-trim'
import type { ParagraphTrimInput } from '@/ai/tasks/paragraph-trim'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { MAX_TRIM_ROUNDS, trimOverlongParagraphs } from '@/server/draft-paragraphs'

const FIVE =
  '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.'
const A = FIVE
const B =
  '서윤은 편지를 펼쳤다. 글씨는 낯설었다. 종이는 눅눅했다. 끝에는 서명이 없었다. 그는 한참을 서 있었다.'
const C =
  '탑의 종이 울렸다. 사람들이 광장에 모였다. 노인이 앞으로 나섰다. 아이들은 조용했다. 해가 기울기 시작했다.'
const SHORT_BEFORE = '비가 내렸다. 그녀는 창가에 섰다.'
const SHORT_AFTER = '아무도 답하지 않았다.'
const FOUR = '민아는 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다.'

type Answer = (input: unknown) => unknown

/** Valid answer (the fake split) for the listed item texts, the item's own text (rejected) otherwise. */
function answerFor(validTexts: string[]): Answer {
  return (value) => {
    const input = value as ParagraphTrimInput
    return {
      paragraphs: input.items.map((item) =>
        validTexts.includes(item.text)
          ? fakeParagraphTrim({ maxSentences: input.maxSentences, items: [item] }).paragraphs[0]
          : { index: item.index, text: item.text },
      ),
    }
  }
}

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

describe('trimOverlongParagraphs', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('makes no AI call and returns the text unchanged when no paragraph is overlong', async () => {
    const text = `${SHORT_BEFORE}\n\n${SHORT_AFTER}`
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)
    expect(spy).not.toHaveBeenCalled()
    expect(result).toEqual({ text, changed: false, before: 0, after: 0, rounds: 0, runIds: [] })
  })

  it('changes only the overlong paragraph and records one paragraph-trim run', async () => {
    const text = `${SHORT_BEFORE}\n\n${FIVE}\n\n${SHORT_AFTER}`
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, new FakeAiClient())

    expect(result.changed).toBe(true)
    expect(result.before).toBe(1)
    expect(result.after).toBe(0)
    expect(result.text.startsWith(`${SHORT_BEFORE}\n\n`)).toBe(true)
    expect(result.text.endsWith(`\n\n${SHORT_AFTER}`)).toBe(true)
    expect(result.text).not.toBe(text)

    const rows = await db
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.workId, workId), eq(aiRuns.task, 'paragraph-trim')))
    expect(rows).toHaveLength(1)
    expect(result.runIds).toEqual([rows[0].id])
  })

  it('sends only the offending paragraph as target and its neighbours as context', async () => {
    const text = `${SHORT_BEFORE}\n\n${FIVE}\n\n${SHORT_AFTER}`
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')
    await trimOverlongParagraphs(db, actor, { workId, text }, client)

    const prompt = spy.mock.calls[0][0].prompt
    expect(prompt.split('<target>').length - 1).toBe(1)
    expect(prompt).toContain(`<target>${FIVE}</target>`)
    expect(prompt).toContain(`<before>${SHORT_BEFORE}</before>`)
    expect(prompt).toContain(`<after>${SHORT_AFTER}</after>`)
  })

  it('stops after one round when every rewrite is rejected and keeps the text', async () => {
    const text = `${SHORT_BEFORE}\n\n${FIVE}\n\n${SHORT_AFTER}`
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': (value) => {
          const input = value as ParagraphTrimInput
          return { paragraphs: input.items.map((item) => ({ index: item.index, text: FOUR })) }
        },
      },
    })
    const spy = vi.spyOn(client, 'generateObject')
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(result.text).toBe(text)
    expect(result.changed).toBe(false)
    expect(result.rounds).toBe(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.runIds).toHaveLength(1)
  })

  it('takes a second round for an offender left after the first, and stops there', async () => {
    const text = `${A}\n\n${B}`
    const client = new FakeAiClient({ overrides: { 'paragraph-trim': roundAnswers([[A], [B]]) } })
    const spy = vi.spyOn(client, 'generateObject')
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(result.rounds).toBe(2)
    expect(result.before).toBe(2)
    expect(result.after).toBe(0)
    expect(result.changed).toBe(true)
  })

  it('never makes a third round, even when an offender is still left', async () => {
    const text = `${A}\n\n${B}\n\n${C}`
    const client = new FakeAiClient({
      overrides: { 'paragraph-trim': roundAnswers([[A], [B], [C]]) },
    })
    const spy = vi.spyOn(client, 'generateObject')
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(MAX_TRIM_ROUNDS).toBe(2)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(result.rounds).toBe(2)
    expect(result.before).toBe(3)
    expect(result.after).toBe(1)
    expect(result.changed).toBe(true)
    expect(result.text.endsWith(C)).toBe(true)
  })

  it('keeps the round-1 fixes when the second round fails with an AI error', async () => {
    const text = `${A}\n\n${B}`
    let calls = 0
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': (input) => {
          calls += 1
          if (calls === 2) throw new AppError('AI_ERROR', '모델 응답을 읽지 못했습니다.')
          return answerFor([A])(input)
        },
      },
    })
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(result.rounds).toBe(2)
    expect(result.before).toBe(2)
    expect(result.after).toBe(1)
    expect(result.changed).toBe(true)
    expect(result.runIds).toHaveLength(1)
    expect(result.text.endsWith(`\n\n${B}`)).toBe(true)
  })

  it('rethrows an AI error from the first round', async () => {
    const text = `${A}\n\n${B}`
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': () => {
          throw new AppError('AI_ERROR', '모델 응답을 읽지 못했습니다.')
        },
      },
    })
    await expect(trimOverlongParagraphs(db, actor, { workId, text }, client)).rejects.toMatchObject(
      { code: 'AI_ERROR' },
    )
  })

  it('refuses a viewer with FORBIDDEN', async () => {
    const viewer = await createTestUser(db, { email: 'viewer@example.com' })
    await addTestMember(db, workId, viewer.id, 'viewer')
    await expect(
      trimOverlongParagraphs(db, { userId: viewer.id }, { workId, text: FIVE }, new FakeAiClient()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('answers a non-member with NOT_FOUND', async () => {
    const stranger = await createTestUser(db, { email: 'stranger@example.com' })
    await expect(
      trimOverlongParagraphs(
        db,
        { userId: stranger.id },
        { workId, text: FIVE },
        new FakeAiClient(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

/**
 * Answers round by round: round N answers with the items whose text is in `rounds[N]` valid, the
 * rest rejected. Once the list runs out, every item is rejected.
 */
function roundAnswers(rounds: string[][]): Answer {
  let round = 0
  return (input) => {
    const valid = rounds[round] ?? []
    round += 1
    return answerFor(valid)(input)
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import { fakeParagraphTrim } from '@/test/ai-fakes/paragraph-trim'
import type { ParagraphTrimInput } from '@/ai/tasks/paragraph-trim'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { createTestUser, createTestWork } from '@/test/factories'
import { TRIM_BATCH, trimOverlongParagraphs } from '@/server/draft-paragraphs'

// Thirty distinct five-sentence paragraphs, so every one of them is an offender.
const paragraphs = Array.from(
  { length: 30 },
  (_, n) =>
    `민아는 ${n}번째 문을 열었다. 복도는 어두웠다. 바람이 불었다. 발소리가 멀어졌다. 그녀는 숨을 죽였다.`,
)
const text = paragraphs.join('\n\n')
/** The fixed three-two split of paragraph `n`, as the fake answers it. */
const splitOf = (n: number) =>
  `민아는 ${n}번째 문을 열었다. 복도는 어두웠다. 바람이 불었다.\n\n발소리가 멀어졌다. 그녀는 숨을 죽였다.`

type Answer = (input: unknown) => unknown

/** Valid split for every item whose text is in `validTexts`, the item's own text (rejected) otherwise. */
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

/** The paragraph-trim indexes sent in one prompt, in order. */
function sentIndexes(prompt: string): number[] {
  return [...prompt.matchAll(/<paragraph index="(\d+)"/g)].map((match) => Number(match[1]))
}

async function setup() {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

describe('trimOverlongParagraphs batches', () => {
  let db: Db
  let actor: { userId: string }
  let workId: string

  beforeEach(async () => {
    ;({ db, actor, workId } = await setup())
  })

  it('sends TRIM_BATCH as the batch size', () => {
    expect(TRIM_BATCH).toBe(12)
  })

  it('sends 30 offenders as three calls of 12, 12 and 6, in text order', async () => {
    const client = new FakeAiClient()
    const spy = vi.spyOn(client, 'generateObject')
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(spy).toHaveBeenCalledTimes(3)
    const sent = spy.mock.calls.map((call) => sentIndexes(call[0].prompt))
    expect(sent[0]).toEqual(Array.from({ length: 12 }, (_, i) => i))
    expect(sent[1]).toEqual(Array.from({ length: 12 }, (_, i) => i + 12))
    expect(sent[2]).toEqual(Array.from({ length: 6 }, (_, i) => i + 24))
    expect(result.runIds).toHaveLength(3)
    expect(result.before).toBe(30)
    expect(result.after).toBe(0)
    expect(result.rounds).toBe(1)
  })

  it('keeps the fixes of batches 1 and 3 when batch 2 fails with AI_ERROR in both rounds', async () => {
    const failing = new Set(paragraphs.slice(12, 24))
    const answer = answerFor(paragraphs)
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': (value) => {
          const input = value as ParagraphTrimInput
          if (input.items.some((item) => failing.has(item.text))) {
            throw new AppError('AI_ERROR', '모델 응답을 읽지 못했습니다.')
          }
          return answer(value)
        },
      },
    })
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(result.rounds).toBe(2)
    expect(result.before).toBe(30)
    expect(result.after).toBe(12)
    expect(result.changed).toBe(true)
    expect(result.runIds).toHaveLength(2)
    expect(result.text).toContain(splitOf(0))
    expect(result.text).toContain(splitOf(29))
    expect(result.text).toContain(paragraphs[12])
  })

  it('fixes batch 2 in round 2 when it fails only in round 1', async () => {
    const failing = new Set(paragraphs.slice(12, 24))
    const answer = answerFor(paragraphs)
    let failedOnce = false
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': (value) => {
          const input = value as ParagraphTrimInput
          if (!failedOnce && input.items.some((item) => failing.has(item.text))) {
            failedOnce = true
            throw new AppError('AI_ERROR', '모델 응답을 읽지 못했습니다.')
          }
          return answer(value)
        },
      },
    })
    const result = await trimOverlongParagraphs(db, actor, { workId, text }, client)

    expect(result.rounds).toBe(2)
    expect(result.after).toBe(0)
    expect(result.runIds).toHaveLength(3)
  })

  it('throws the first error when every batch of round 1 fails', async () => {
    let calls = 0
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': () => {
          calls += 1
          throw new AppError('AI_ERROR', calls === 1 ? '첫 번째 실패' : '두 번째 실패')
        },
      },
    })
    await expect(trimOverlongParagraphs(db, actor, { workId, text }, client)).rejects.toMatchObject(
      { code: 'AI_ERROR', message: '첫 번째 실패' },
    )
    expect(calls).toBe(3)
  })

  it('rethrows a cancel from batch 2 of round 1 at once', async () => {
    let calls = 0
    const client = new FakeAiClient({
      overrides: {
        'paragraph-trim': (value) => {
          calls += 1
          if (calls === 2) throw new AppError('CANCELLED', '요청이 취소되었습니다.')
          return answerFor(paragraphs)(value)
        },
      },
    })
    await expect(trimOverlongParagraphs(db, actor, { workId, text }, client)).rejects.toMatchObject(
      { code: 'CANCELLED' },
    )
    expect(calls).toBe(2)
  })
})

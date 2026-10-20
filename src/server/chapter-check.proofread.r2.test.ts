import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { runProofread } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'

// Round 2 (P14): awkward filter and whole-word quote hits in the proofread service.

let db: Db
let owner: { id: string; name: string; email: string }
let workId: string

beforeEach(async () => {
  db = await createTestDb()
  owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  workId = work.id
}, 120_000)

function actor(userId: string): Actor {
  return { userId }
}

/** Scripted client, as in chapter-check.J.test.ts: `pick` returns the task output or undefined. */
function scriptedClient(pick: (system: string) => unknown): AiClient {
  return {
    provider: 'fake',
    defaultModel: 'fake',
    async generateObject(args) {
      const scripted = pick(args.system)
      const raw =
        scripted === undefined ? FAKE_OUTPUTS[args.task.name]?.(args.task.input) : scripted
      return {
        object: args.schema.parse(raw),
        usage: { inputTokens: 0, outputTokens: 0 },
        model: 'scripted',
      }
    },
    streamText() {
      throw new Error('not used')
    },
  }
}

/** A client whose proofread call returns the given suggestions, in this order. */
function proofreadClient(suggestions: unknown[]): AiClient {
  return scriptedClient((system) =>
    system.startsWith('당신은 한국어 웹소설 교정자다.') ? { suggestions } : undefined,
  )
}

describe('runProofread awkward filter (P14)', () => {
  it('drops an awkward AI suggestion', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '그건 어색해요.', useAi: true },
      proofreadClient([
        { quote: '어색해요', replacement: '어색합니다', kind: 'awkward', reason: '이유' },
      ]),
    )
    expect(result.suggestions).toEqual([])
    expect(result.runId).not.toBeNull()
    expect(result.runIds).toHaveLength(1)
  })

  it('keeps the other kinds from the same answer', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '그건 어색해요. 그눈에 눈물이 고였다.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([
        { quote: '어색해요', replacement: '어색합니다', kind: 'awkward', reason: '이유' },
        { quote: '그눈에', replacement: '그 눈에', kind: 'spacing', reason: '띄어쓰기' },
      ]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => [s.kind, s.quote, s.start])).toEqual([
      ['spacing', '그눈에', text.indexOf('그눈에')],
    ])
  })
})

describe('runProofread whole-word quote hits (P14)', () => {
  it('a whole-word hit wins over a hit inside a longer word', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '할수록 좋다. 그도 할수 있다.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([
        { quote: '할수', replacement: '할 수', kind: 'spacing', reason: '띄어쓰기' },
      ]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.start)).toEqual([text.lastIndexOf('할수')])
    expect(text.slice(ai[0].end, ai[0].end + 2)).toBe(' 있')
  })

  it('English: a whole word wins over a hit inside a longer word', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = 'The greyhound ran. The grey light came.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([{ quote: 'grey', replacement: 'gray', kind: 'spelling', reason: 'reason' }]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.start)).toEqual([text.lastIndexOf('grey')])
  })

  it('when every hit is inside a longer word, nothing is dropped', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '할수록 좋다. 정말 할수록 좋다.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([
        { quote: '할수', replacement: '할 수', kind: 'spacing', reason: '띄어쓰기' },
      ]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.start)).toEqual([0, text.lastIndexOf('할수')])
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_OUTPUTS } from '@/test/ai-fakes'
import type { AiClient } from '@/ai/types'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { runProofread } from '@/server/chapter-check'
import { createTestDb } from '@/test/db'
import { createTestChapter, createTestUser, createTestWork } from '@/test/factories'

// Proofread quote expansion (track J). Kept apart from chapter-check.test.ts (spec 5).

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

/** Scripted client, as in chapter-check.test.ts: `pick` returns the task output or undefined. */
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

describe('runProofread AI quote expansion', () => {
  it('applies one AI quote to every occurrence', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '그건 어색해요. 저것도 어색해요.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([
        { quote: '어색해요', replacement: '어색합니다', kind: 'awkward', reason: '이유' },
      ]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.start)).toEqual([text.indexOf('어색해요'), text.lastIndexOf('어색해요')])
    expect(ai.every((s) => s.end === s.start + 4)).toBe(true)
    expect(ai.map((s) => s.quote)).toEqual(['어색해요', '어색해요'])
  })

  // Pins the silent cap: occurrences 21 and later stay unfixed and nothing is reported.
  it('expansion stops at 20 occurrences per quote', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '어색해요. '.repeat(21)
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([
        { quote: '어색해요', replacement: '어색합니다', kind: 'awkward', reason: '이유' },
      ]),
    )
    expect(result.suggestions.filter((s) => s.source === 'ai')).toHaveLength(20)
  })

  it('does not expand a quote into a longer word', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const text = '할수 있다. 할수록 좋다. 그도 할수 있다.'
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text, useAi: true },
      proofreadClient([
        { quote: '할수', replacement: '할 수', kind: 'spacing', reason: '띄어쓰기' },
      ]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => s.start)).toEqual([text.indexOf('할수'), text.lastIndexOf('할수')])
    expect(ai.map((s) => text.slice(s.end, s.end + 2))).toEqual([' 있', ' 있'])
  })

  it('a one-character quote stays on the first occurrence', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '나는 나를 본다.', useAi: true },
      proofreadClient([{ quote: '나', replacement: '내', kind: 'spelling', reason: '이유' }]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai).toHaveLength(1)
    expect(ai[0].start).toBe(0)
  })

  // Model order decides, not text position: the first item in the model output wins.
  it('overlapping AI ranges keep the earlier suggestion in model order', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '그는 서있다.', useAi: true },
      proofreadClient([
        { quote: '서있다', replacement: '서 있다', kind: 'spacing', reason: '띄어쓰기' },
        { quote: '있다', replacement: '있어', kind: 'awkward', reason: '이유' },
      ]),
    )
    const ai = result.suggestions.filter((s) => s.source === 'ai')
    expect(ai.map((s) => [s.quote, s.start])).toEqual([['서있다', 3]])
  })

  it('an empty AI list returns only rule suggestions', async () => {
    const chapter = await createTestChapter(db, workId, { position: 1, body: '' })
    const result = await runProofread(
      db,
      actor(owner.id),
      { chapterId: chapter.id, text: '안 되요.', useAi: true },
      proofreadClient([]),
    )
    expect(result.runId).not.toBeNull()
    expect(result.suggestions.map((s) => [s.source, s.quote, s.start])).toEqual([
      ['rule', '되요', 2],
    ])
  })
})

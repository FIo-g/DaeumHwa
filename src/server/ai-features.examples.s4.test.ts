import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { buildDraftPrefix, buildDraftPrompt } from '@/ai/tasks/draft-chapter'
import { createTestDb } from '@/test/db'
import {
  createTestChapter,
  createTestEntry,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { buildDraftContext } from '@/server/ai-features'
import { createStyleCard } from '@/server/styles'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('example selection in buildDraftContext', () => {
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

  function modelText(input: Parameters<typeof buildDraftPrefix>[0]): string {
    return [...buildDraftPrefix(input), buildDraftPrompt(input)].join('\n\n')
  }

  it('with selection off the prompt keeps card examples and has no voice block', async () => {
    vi.stubEnv('AI_EXAMPLE_SELECTION', '')
    await createTestEntry(db, workId, { name: '세린', kind: 'character' })
    await createStyleCard(db, actor, {
      workId,
      name: '작품 문체',
      tone: '담백하다.',
      rules: '짧게 쓴다.',
      examples: '예문 하나이다. 짧은 문장이다.',
    })
    const context = await buildDraftContext(db, actor, {
      workId,
      instructions: '세린이 문을 연다.',
      entryIds: [],
    })
    expect(context.promptInput.styleCards[0].examples).toContain('예문 하나이다.')
    const prompt = modelText(context.promptInput)
    expect(prompt).toContain('예문 하나이다.')
    expect(prompt).not.toContain('<voice_examples>')
  })

  it('with selection on and a 3000-character store the cards carry no examples and at most 3 passages are sent', async () => {
    vi.stubEnv('AI_EXAMPLE_SELECTION', 'on')
    const examples = Array.from({ length: 30 }, () => '가'.repeat(100)).join('\n\n')
    expect(examples.length).toBeGreaterThan(3000)
    await createStyleCard(db, actor, {
      workId,
      name: '작품 문체',
      tone: '담백하다.',
      rules: '짧게 쓴다.',
      examples,
    })
    const context = await buildDraftContext(db, actor, {
      workId,
      instructions: '세린이 문을 연다.',
      entryIds: [],
    })
    expect(context.promptInput.styleCards.every((card) => card.examples === '')).toBe(true)
    const prefix = buildDraftPrefix(context.promptInput).join('\n\n')
    expect(prefix).toContain('<voice_examples>')
    expect(prefix).toContain('작가 예문. 문체와 말투만 참고하고 문장을 그대로 옮기지 않는다.')
    const block = prefix.slice(
      prefix.indexOf('<voice_examples>'),
      prefix.indexOf('</voice_examples>'),
    )
    const passages = block.split('---')
    expect(passages.length).toBeLessThanOrEqual(3)
    expect(prefix).not.toContain('---\n\n---')
  })

  it('with a store under the budget nothing changes', async () => {
    vi.stubEnv('AI_EXAMPLE_SELECTION', 'on')
    await createStyleCard(db, actor, {
      workId,
      name: '작품 문체',
      tone: '담백하다.',
      rules: '짧게 쓴다.',
      examples: '짧은 예문이다.',
    })
    await createTestChapter(db, workId, { position: 1, body: '조용한 밤이었다.' })
    const context = await buildDraftContext(db, actor, {
      workId,
      instructions: '세린이 문을 연다.',
      entryIds: [],
    })
    expect(context.promptInput.styleCards[0].examples).toContain('짧은 예문이다.')
    const prefix = buildDraftPrefix(context.promptInput).join('\n\n')
    expect(prefix).not.toContain('<voice_examples>')
  })
})

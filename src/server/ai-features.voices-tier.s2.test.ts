import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { createTestDb } from '@/test/db'
import { FakeAiClient } from '@/test/fake-ai'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { planDraft, startDraft } from '@/server/ai-features'
import { createStyleCard } from '@/server/styles'
import { updateEntry } from '@/server/wiki'

// Stage 2 review fix B4: with speech on, a `never`-tier character is not in <voices> or its style
// card, unless the author selected it.

const HIDDEN_NAME = '흑막'
const HIDDEN_SPEECH = '나직한 하오체'
const HIDDEN_RULE = '흑막카드규칙'

let db: Db
let actor: { userId: string }
let workId: string
let hiddenId: string
let previousFlag: string | undefined

beforeEach(async () => {
  previousFlag = process.env.AI_SPEECH_STYLE
  process.env.AI_SPEECH_STYLE = 'on'
  db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  actor = { userId: owner.id }
  workId = work.id
  const hidden = await createTestEntry(db, workId, {
    name: HIDDEN_NAME,
    fields: { speech: HIDDEN_SPEECH },
  })
  hiddenId = hidden.id
  await updateEntry(db, actor, hiddenId, { contextTier: 'never' })
  await createStyleCard(db, actor, {
    workId,
    entryId: hiddenId,
    name: '흑막 문체',
    rules: HIDDEN_RULE,
  })
})

afterEach(() => {
  if (previousFlag === undefined) delete process.env.AI_SPEECH_STYLE
  else process.env.AI_SPEECH_STYLE = previousFlag
})

function sent(client: FakeAiClient): string {
  return client.recorded.flatMap((c) => [...(c.promptPrefix ?? []), c.prompt]).join('\n')
}

describe('never-tier characters stay out of the voices (stage 2, B4)', () => {
  it('leaves a never character out of the draft prefix unless selected', async () => {
    const client = new FakeAiClient()
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 골목을 걷는다.', entryIds: [] },
      client,
    )
    await done
    const text = sent(client)
    expect(text).not.toContain(HIDDEN_NAME)
    expect(text).not.toContain(HIDDEN_SPEECH)
    expect(text).not.toContain(HIDDEN_RULE)
  })

  it('leaves a never character out of the plan prefix unless selected', async () => {
    const client = new FakeAiClient()
    await planDraft(
      db,
      actor,
      { workId, instructions: '서윤이 골목을 걷는다.', entryIds: [] },
      client,
    )
    const text = sent(client)
    expect(text).not.toContain(HIDDEN_SPEECH)
    expect(text).not.toContain(HIDDEN_RULE)
  })

  it('puts a selected never character into the voices and keeps its style card', async () => {
    const client = new FakeAiClient()
    const { done } = await startDraft(
      db,
      actor,
      { workId, instructions: '서윤이 골목을 걷는다.', entryIds: [hiddenId] },
      client,
    )
    await done
    const text = sent(client)
    expect(text).toContain(`- ${HIDDEN_NAME}: ${HIDDEN_SPEECH}`)
    expect(text).toContain(HIDDEN_RULE)
  })
})

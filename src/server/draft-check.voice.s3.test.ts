import { beforeEach, describe, expect, it } from 'vitest'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'
import { startDraft } from '@/server/ai-features'
import { checkAndFixDraft } from '@/server/draft-check'

const S1 = '민준은 문을 열고 들어섰다. 방 안은 조용했고 창문이 열려 있었다. 바람이 커튼을 흔들었다.'
const S2 =
  '세린이 말했다. "빨래 가져왔어요."\n세린이 다시 물었다. "누구세요. 문 앞에 있어요." 마음이 흔들렸다.'
const S3 =
  '문이 닫혔다. 복도가 조용해졌다. 민준은 계단을 내려가며 발걸음을 늦추었다. 밤이 깊어졌다.'
const THREE = [S1, S2, S3].join('\n\n***\n\n')

type Setup = { db: Db; actor: { userId: string }; workId: string }

async function setup(): Promise<Setup> {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id }
}

async function draftOf(s: Setup, text: string) {
  const client = new FakeAiClient({ overrides: { 'draft-chapter': () => text } })
  const run = await startDraft(
    s.db,
    s.actor,
    { workId: s.workId, instructions: '세린이 빨래를 가져온다.', targetChars: 10, entryIds: [] },
    client,
  )
  await run.done
  return run.runId
}

function baseClient(voiceLines: { id: number; speaker: string; text: string }[] | Error) {
  return new FakeAiClient({
    overrides: {
      'voice-fix': () => {
        if (voiceLines instanceof Error) throw voiceLines
        return { lines: voiceLines }
      },
      'draft-check': () => ({ scenes: [] }),
      'scene-fix': (input: unknown) => ({ text: (input as { scene: string }).scene }),
    },
  })
}

describe('checkAndFixDraft voice-fix (stage 3 task 8)', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
    await createTestEntry(s.db, s.workId, {
      name: '세린',
      fields: { speech: '반말을 쓰며 짧고 직설적이다.' },
    })
  })

  it('fixes only the two lines and holds them in the candidate', async () => {
    const runId = await draftOf(s, THREE)
    const client = baseClient([
      { id: 1, speaker: '세린', text: '"빨래 가져왔어."' },
      { id: 2, speaker: '세린', text: '"누구야. 문 앞에 있어."' },
    ])

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.fix).not.toBeNull()
    expect(result.fix?.voiceLines).toBe(2)
    const [row] = await s.db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    const sceneFix = (row.output as { sceneFix: { text: string } }).sceneFix
    expect(sceneFix.text).toContain('"빨래 가져왔어."')
    expect(sceneFix.text).toContain('"누구야. 문 앞에 있어."')
    expect(sceneFix.text).not.toContain('"빨래 가져왔어요."')
    expect(sceneFix.text).not.toContain('"누구세요. 문 앞에 있어요."')
    expect(sceneFix.text).toContain(S1)
    expect(sceneFix.text).toContain(S3)
  })

  it('leaves a line already in the speaker level unchanged', async () => {
    const custom = [
      S1,
      '세린이 말했다. "빨래 가져왔어요."\n세린이 말했다. "빨리 왔어." 마음이 흔들렸다.',
      S3,
    ].join('\n\n***\n\n')
    const runId = await draftOf(s, custom)
    const client = baseClient([
      { id: 1, speaker: '세린', text: '"빨래 가져왔어."' },
      { id: 2, speaker: '세린', text: '"빨리 왔지."' },
    ])

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.fix?.voiceLines).toBe(1)
    const [row] = await s.db.select().from(aiRuns).where(eq(aiRuns.id, runId))
    const sceneFix = (row.output as { sceneFix: { text: string } }).sceneFix
    expect(sceneFix.text).toContain('"빨래 가져왔어."')
    expect(sceneFix.text).toContain('"빨리 왔어."')
    expect(sceneFix.text).not.toContain('"빨리 왔지."')
  })

  it('rejects a rewrite still in 해요체', async () => {
    const runId = await draftOf(s, THREE)
    const client = baseClient([{ id: 1, speaker: '세린', text: '"빨래 가져왔어요."' }])

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.fix).toBeNull()
  })

  it('rejects a rewrite with Dice below 0.5', async () => {
    const runId = await draftOf(s, THREE)
    const client = baseClient([{ id: 1, speaker: '세린', text: '"빨리 가라. 어서 가라."' }])

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.fix).toBeNull()
  })

  it('ignores a line attributed to someone outside the voices', async () => {
    const runId = await draftOf(s, THREE)
    const client = baseClient([{ id: 1, speaker: '곽두석', text: '"빨래 가져왔어."' }])

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.fix).toBeNull()
  })

  it('makes no call for an English draft', async () => {
    const english = [
      'Mina opened the gate and looked around the quiet yard.',
      'Mina said hello to Jun in the yard with a loud voice.',
      'Jun closed the gate and walked back into the house.',
    ].join('\n\n***\n\n')
    const runId = await draftOf(s, english)
    const client = baseClient([{ id: 1, speaker: '세린', text: '"빨래 가져왔어."' }])

    await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(client.recorded.filter((call) => call.name === 'voice-fix')).toHaveLength(0)
  })

  it('makes no call when no voice has a level', async () => {
    const db2 = await createTestDb()
    const owner = await createTestUser(db2, { email: 'leveless@example.com' })
    const work = await createTestWork(db2, owner.id, { title: '말투 없는 작품' })
    const actor = { userId: owner.id }
    await createTestEntry(db2, work.id, {
      name: '민준',
      fields: { speech: '짧고 단정한 문장을 쓴다.' },
    })
    const starter = new FakeAiClient({ overrides: { 'draft-chapter': () => THREE } })
    const run = await startDraft(
      db2,
      actor,
      { workId: work.id, instructions: '민준이 문을 연다.', targetChars: 10, entryIds: [] },
      starter,
    )
    await run.done
    const client = baseClient([{ id: 1, speaker: '민준', text: '"빨래 가져왔어."' }])

    await checkAndFixDraft(db2, actor, { workId: work.id, runId: run.runId }, client)

    expect(client.recorded.filter((call) => call.name === 'voice-fix')).toHaveLength(0)
  })

  it('still gives the scene check when the voice call fails', async () => {
    const runId = await draftOf(s, THREE)
    const client = baseClient(new Error('boom'))

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(Array.isArray(result.findings)).toBe(true)
    expect(result.fix).toBeNull()
  })

  it('makes no new call on a second request', async () => {
    const runId = await draftOf(s, THREE)
    const client = baseClient([
      { id: 1, speaker: '세린', text: '"빨래 가져왔어."' },
      { id: 2, speaker: '세린', text: '"누구야. 문 앞에 있어."' },
    ])

    await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)
    const calls = client.recorded.length
    await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(client.recorded.length).toBe(calls)
  })

  it('applies plain-speech rewrites of 한세린 lines (F6)', async () => {
    const db = await createTestDb()
    const owner = await createTestUser(db, { email: 'hanserin@example.com' })
    const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
    const actor = { userId: owner.id }
    await createTestEntry(db, work.id, {
      name: '한세린',
      fields: { speech: '반말을 쓰며 짧고 직설적이다.' },
    })
    const plain = [
      S1,
      '한세린이 말했다. "누구예요."\n한세린이 다시 물었다. "뜯어도 돼요?" 마음이 흔들렸다.',
      S3,
    ].join('\n\n***\n\n')
    const starter = new FakeAiClient({ overrides: { 'draft-chapter': () => plain } })
    const run = await startDraft(
      db,
      actor,
      { workId: work.id, instructions: '한세린이 묻는다.', targetChars: 10, entryIds: [] },
      starter,
    )
    await run.done
    const client = baseClient([
      { id: 1, speaker: '한세린', text: '"누구야."' },
      { id: 2, speaker: '한세린', text: '"뜯어도 돼?"' },
    ])

    const result = await checkAndFixDraft(db, actor, { workId: work.id, runId: run.runId }, client)

    expect(result.fix?.voiceLines).toBe(2)
    const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, run.runId))
    const sceneFix = (row.output as { sceneFix: { text: string } }).sceneFix
    expect(sceneFix.text).toContain('"누구야."')
    expect(sceneFix.text).toContain('"뜯어도 돼?"')
  })
})

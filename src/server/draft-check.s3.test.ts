import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { FakeAiClient } from '@/test/fake-ai'
import type { Db } from '@/db/client'
import { aiRuns } from '@/db/schema'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import {
  addTestMember,
  createTestChapter,
  createTestFact,
  createTestUser,
  createTestWork,
} from '@/test/factories'
import { startDraft } from '@/server/ai-features'
import { applySceneFix, checkAndFixDraft, discardSceneFix } from '@/server/draft-check'

const S1 = '민준은 문을 열고 들어섰다. 방 안은 조용했고 창문이 열려 있었다. 바람이 커튼을 흔들었다.'
const S2 =
  '지수는 창밖을 보았다. 거리에는 사람들이 오가고 있었다. 그녀는 편지를 꺼내어 읽었다. 마음이 흔들렸다.'
const S3 =
  '문이 닫혔다. 복도가 조용해졌다. 민준은 계단을 내려가며 발걸음을 늦추었다. 밤이 깊어졌다.'
const S2_FIXED =
  '지수는 창밖을 보았다. 거리에는 사람들이 오가고 있었다. 그녀는 편지를 펼쳐 들고 소리 내어 읽었다. 눈빛이 흔들렸다.'
const THREE = [S1, S2, S3].join('\n\n***\n\n')

type Setup = { db: Db; actor: { userId: string }; workId: string; ownerId: string }

async function setup(): Promise<Setup> {
  const db = await createTestDb()
  const owner = await createTestUser(db, { name: '작가', email: 'author@example.com' })
  const work = await createTestWork(db, owner.id, { title: '잿빛 도시' })
  return { db, actor: { userId: owner.id }, workId: work.id, ownerId: owner.id }
}

async function draftOf(
  s: Setup,
  text: string,
  overrides: Record<string, (input: unknown) => unknown> = {},
) {
  const client = new FakeAiClient({ overrides: { 'draft-chapter': () => text, ...overrides } })
  const run = await startDraft(
    s.db,
    s.actor,
    { workId: s.workId, instructions: '서윤이 편지를 발견한다.', targetChars: 10, entryIds: [] },
    client,
  )
  await run.done
  return { runId: run.runId, client }
}

async function outputOf(db: Db, runId: string): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId))
  return row.output as Record<string, unknown>
}

function captureError(promise: Promise<unknown>): Promise<AppError> {
  return promise.then(
    () => {
      throw new Error('expected the call to reject')
    },
    (error: unknown) => {
      if (error instanceof AppError) return error
      throw error
    },
  )
}

function checkClient(
  checkScenes: { scene: number; reasons: { code: string; note: string }[] }[],
  fixedByScene: Record<number, string> = {},
) {
  return new FakeAiClient({
    overrides: {
      'draft-check': () => ({ scenes: checkScenes }),
      'scene-fix': (input: unknown) => {
        const scene = (input as { scene: string }).scene
        for (const [key, fixed] of Object.entries(fixedByScene)) {
          void key
          if (scene.includes('지수는 창밖을 보았다')) return { text: fixed }
        }
        return { text: scene }
      },
    },
  })
}

describe('checkAndFixDraft', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('fixes only the flagged scene into a candidate', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = checkClient(
      [{ scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] }],
      { 2: S2_FIXED },
    )

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.findings.some((f) => f.scene === 2)).toBe(true)
    expect(result.fix).not.toBeNull()
    expect(result.fix?.scenes).toEqual([{ scene: 2, reasons: ['skipped-moment'] }])
    const stored = (await outputOf(s.db, runId)).sceneFix as { text: string; token: string }
    expect(stored.text).toContain(S1)
    expect(stored.text).toContain(S3)
    expect(stored.text).toContain(S2_FIXED)
    expect(stored.text).not.toContain(S2)
    expect(stored.token).toBe(result.fix?.token)
    // The stored draft text is unchanged; the candidate waits for apply.
    expect((await outputOf(s.db, runId)).text).toBe(THREE)
    expect(result.fix?.parts.length).toBeGreaterThan(0)
  })

  it('returns the stored result without new AI calls on a second call', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = checkClient(
      [{ scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] }],
      { 2: S2_FIXED },
    )

    const first = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)
    const calls = client.recorded.length
    const second = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(client.recorded.length).toBe(calls)
    expect(second.fix?.token).toBe(first.fix?.token)
    const stored = (await outputOf(s.db, runId)).sceneFix as { text: string }
    expect(stored.text).toContain(S2_FIXED)
  })

  it('keeps code findings with a notice when the check call fails', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = new FakeAiClient({
      overrides: {
        'draft-check': () => {
          throw new Error('boom')
        },
        'scene-fix': () => ({ text: S2_FIXED }),
      },
    })

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.notice).toBe('AI 점검을 하지 못했습니다. 코드 점검 결과만 보여 드립니다.')
    expect(Array.isArray(result.findings)).toBe(true)
  })

  it('leaves fix null when the rewrite is rejected', async () => {
    const { runId } = await draftOf(s, THREE)
    const short = S2.slice(0, Math.floor(S2.length * 0.6))
    const client = checkClient(
      [{ scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] }],
      { 2: short },
    )

    const result = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(result.fix).toBeNull()
    expect(await outputOf(s.db, runId)).not.toHaveProperty('sceneFix')
  })

  it('sends only facts hidden above the draft position', async () => {
    await createTestChapter(s.db, s.workId, { position: 1, body: '첫 화 본문' })
    const { facts } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    const hidden = await createTestFact(s.db, s.workId, {
      content: '아직 공개되지 않은 비밀이다.',
    })
    await s.db.update(facts).set({ revealAtPosition: 5 }).where(eq(facts.id, hidden.id))
    const revealed = await createTestFact(s.db, s.workId, {
      content: '이미 공개된 사실이다.',
    })
    await s.db.update(facts).set({ revealAtPosition: 1 }).where(eq(facts.id, revealed.id))
    const { runId } = await draftOf(s, THREE)
    let seenFacts: string[] = []
    const client = new FakeAiClient({
      overrides: {
        'draft-check': (input: unknown) => {
          seenFacts = (input as { hiddenFacts: string[] }).hiddenFacts
          return { scenes: [] }
        },
        'scene-fix': (input: unknown) => ({ text: (input as { scene: string }).scene }),
      },
    })

    await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    expect(seenFacts).toContain('아직 공개되지 않은 비밀이다.')
    expect(seenFacts).not.toContain('이미 공개된 사실이다.')
  })

  it('refuses a viewer and hides the run from a non-member', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = checkClient([], {})
    const viewer = await createTestUser(s.db, { email: 'viewer@example.com' })
    await addTestMember(s.db, s.workId, viewer.id, 'viewer')
    const stranger = await createTestUser(s.db, { email: 'stranger@example.com' })

    const asViewer = await captureError(
      checkAndFixDraft(s.db, { userId: viewer.id }, { workId: s.workId, runId }, client),
    )
    const asStranger = await captureError(
      checkAndFixDraft(s.db, { userId: stranger.id }, { workId: s.workId, runId }, client),
    )

    expect(asViewer.code).toBe('FORBIDDEN')
    expect(asStranger.code).toBe('NOT_FOUND')
  })
})

describe('applySceneFix and discardSceneFix', () => {
  let s: Setup

  beforeEach(async () => {
    s = await setup()
  })

  it('apply sets the text and removes the candidate', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = checkClient(
      [{ scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] }],
      { 2: S2_FIXED },
    )
    const checked = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)
    const token = checked.fix?.token ?? ''

    const applied = await applySceneFix(s.db, s.actor, { workId: s.workId, runId, token })

    expect(applied.text).toContain(S2_FIXED)
    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(applied.text)
    expect(output).not.toHaveProperty('sceneFix')
  })

  it('apply after the draft changed throws and leaves the run as it was', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = checkClient(
      [{ scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] }],
      { 2: S2_FIXED },
    )
    const checked = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)
    const before = await outputOf(s.db, runId)
    const { replaceRunOutput } = await import('@/ai/run')
    await replaceRunOutput(s.db, runId, {
      ...before,
      text: '다듬기로 바뀐 초안이다. 충분히 길게 적는다.',
    })

    const error = await captureError(
      applySceneFix(s.db, s.actor, { workId: s.workId, runId, token: checked.fix?.token ?? '' }),
    )

    expect(error).toMatchObject({ code: 'BAD_STATE', message: '초안이 바뀌어 적용할 수 없습니다.' })
    expect(await outputOf(s.db, runId)).toEqual({
      ...before,
      text: '다듬기로 바뀐 초안이다. 충분히 길게 적는다.',
    })
  })

  it('discard keeps the draft text and removes the candidate', async () => {
    const { runId } = await draftOf(s, THREE)
    const client = checkClient(
      [{ scene: 2, reasons: [{ code: 'skipped-moment', note: '편지를 읽는 순간을 넘겼다.' }] }],
      { 2: S2_FIXED },
    )
    const checked = await checkAndFixDraft(s.db, s.actor, { workId: s.workId, runId }, client)

    await discardSceneFix(s.db, s.actor, {
      workId: s.workId,
      runId,
      token: checked.fix?.token ?? '',
    })

    const output = await outputOf(s.db, runId)
    expect(output.text).toBe(THREE)
    expect(output).not.toHaveProperty('sceneFix')
  })
})

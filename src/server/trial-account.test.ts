import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns, changeLog, chapterVersions, session, user } from '@/db/schema'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'
import { createTestDb } from '@/test/db'
import { createTestUser } from '@/test/factories'
import { FakeAiClient } from '@/test/fake-ai'
import { runChapterCheck, runProofread } from './chapter-check'
import { createSampleWork } from './sample-work'
import { linkTrialWork } from './trial-account'
import { createWork, getWork } from './works'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function startTrial() {
  const { id } = await createTestUser(db)
  await db.update(user).set({ isAnonymous: true }).where(eq(user.id, id))
  await db.insert(session).values({
    id,
    token: id,
    userId: id,
    expiresAt: new Date(Date.now() + 60_000),
    updatedAt: new Date(),
  })
  return { userId: id }
}

describe('trial sample', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('creates one read-only work and transfers its ownership, logs and AI runs', async () => {
    vi.stubEnv('AI_EXTRACT_SPLIT', 'off')
    const trial = await startTrial()
    const [sample, repeated] = await Promise.all([
      createSampleWork(db, trial),
      createSampleWork(db, trial),
    ])
    expect(repeated).toEqual(sample)
    await expect(getWork(db, trial, sample.workId)).resolves.toMatchObject({ role: 'viewer' })
    await expect(createWork(db, trial, { title: '새 작품' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: TRIAL_SIGNUP_MESSAGE,
    })
    await runChapterCheck(db, trial, sample, new FakeAiClient())

    const registered = { userId: (await createTestUser(db)).id }
    await linkTrialWork(db, trial.userId, registered.userId)
    await expect(getWork(db, registered, sample.workId)).resolves.toMatchObject({ role: 'owner' })
    await expect(getWork(db, trial, sample.workId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(createSampleWork(db, trial)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    const runs = await db.select().from(aiRuns).where(eq(aiRuns.workId, sample.workId))
    const changes = await db.select().from(changeLog).where(eq(changeLog.workId, sample.workId))
    const versions = await db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, sample.chapterId))
    expect(runs).toHaveLength(2)
    expect(changes.length).toBeGreaterThan(0)
    expect(versions.length).toBeGreaterThan(0)
    expect(runs.every((run) => run.userId === registered.userId)).toBe(true)
    expect(changes.every((change) => change.actorId === registered.userId)).toBe(true)
    expect(versions.every((version) => version.createdBy === registered.userId)).toBe(true)
  })

  it('limits check calls and applies the global budget to trial users', async () => {
    vi.stubEnv('AI_EXTRACT_SPLIT', 'off')
    const trial = await startTrial()
    const sample = await createSampleWork(db, trial)
    const client = new FakeAiClient()
    await expect(runProofread(db, trial, { ...sample, useAi: true }, client)).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
        message: TRIAL_SIGNUP_MESSAGE,
      },
    )
    vi.stubEnv('AI_GLOBAL_DAILY_TOKEN_LIMIT', '1')
    await db.insert(aiRuns).values({
      userId: (await createTestUser(db)).id,
      task: 'proofread',
      status: 'done',
      outputTokens: 1,
    })
    await expect(runChapterCheck(db, trial, sample, client)).rejects.toMatchObject({
      code: 'AI_LIMIT',
    })
    expect(client.recorded).toHaveLength(0)

    vi.stubEnv('AI_GLOBAL_DAILY_TOKEN_LIMIT', '0')
    for (let check = 0; check < 4; check += 1) {
      await runChapterCheck(db, trial, sample, client)
    }
    await expect(runChapterCheck(db, trial, sample, client)).rejects.toMatchObject({
      code: 'AI_LIMIT',
      message: TRIAL_SIGNUP_MESSAGE,
    })
    expect(client.recorded).toHaveLength(8)
  })
})

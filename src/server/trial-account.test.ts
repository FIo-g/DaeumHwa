import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { aiRuns, changeLog, chapterVersions, session, user, workMembers } from '@/db/schema'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'
import { createTestDb } from '@/test/db'
import { createTestUser } from '@/test/factories'
import { FakeAiClient } from '@/test/fake-ai'
import { planDraft, runDirectionAdvice, runReaderSimulation, startDraft } from './ai-features'
import { runChapterCheck, runProofread } from './chapter-check'
import {
  archiveChapter,
  createChapter,
  getChapter,
  listChapters,
  moveChapter,
  saveChapter,
} from './chapters'
import { buildExportPayload } from './exports'
import { updateFact } from './facts'
import { createImportJob } from './imports'
import { startInterview } from './interview'
import { listIssues, resolveIssue } from './issues'
import { createInvite, removeMember } from './members'
import { createNamingRule } from './naming'
import { approveProposal, listProposals, rejectProposal } from './proposals'
import { createSampleWork } from './sample-work'
import { linkTrialWork } from './trial-account'
import { createWork, getWork, listMyWorks, setWorkArchived } from './works'

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

  it('edits and approves in one sample and transfers the manuscript, decisions and history', async () => {
    vi.stubEnv('AI_EXTRACT_SPLIT', 'off')
    const trial = await startTrial()
    const [sample, repeated] = await Promise.all([
      createSampleWork(db, trial),
      createSampleWork(db, trial),
    ])
    expect(repeated).toEqual(sample)
    await expect(listMyWorks(db, trial)).resolves.toMatchObject([
      { id: sample.workId, role: 'editor' },
    ])
    await createNamingRule(db, trial, { ...sample, canonical: '종루', variants: ['탑'] })
    const check = await runChapterCheck(db, trial, sample, new FakeAiClient())
    const handIssue = check.issues.find((issue) => issue.kind === 'contradiction')!
    const namingIssue = check.issues.find((issue) => issue.kind === 'naming')!
    const summaryProposal = check.proposals.find((proposal) => proposal.type === 'chapter_summary')!
    const chapter = await getChapter(db, trial, sample.chapterId)
    const text = chapter.body.replace(handIssue.quote, handIssue.suggestion)
    expect(text).not.toBe(chapter.body)
    await saveChapter(db, trial, {
      chapterId: chapter.id,
      body: text,
      expectedVersion: chapter.version,
    })
    await resolveIssue(db, trial, { issueId: handIssue.id, status: 'accepted' })
    await resolveIssue(db, trial, { issueId: namingIssue.id, status: 'dismissed' })
    const summary = '세린과 윤서가 종루 입구에서 만난다.'
    await approveProposal(db, trial, {
      proposalId: summaryProposal.id,
      payloadOverride: { summary },
    })

    const registered = { userId: (await createTestUser(db)).id }
    await linkTrialWork(db, trial.userId, registered.userId)
    await expect(getWork(db, registered, sample.workId)).resolves.toMatchObject({ role: 'owner' })
    await expect(getWork(db, trial, sample.workId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(createSampleWork(db, trial)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    await expect(getChapter(db, registered, chapter.id)).resolves.toMatchObject({
      body: text,
      summary,
    })
    await expect(listIssues(db, registered, chapter.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: handIssue.id,
          status: 'accepted',
          resolvedBy: registered.userId,
        }),
        expect.objectContaining({
          id: namingIssue.id,
          status: 'dismissed',
          resolvedBy: registered.userId,
        }),
      ]),
    )
    await expect(
      listProposals(db, registered, sample.workId, { status: 'approved' }),
    ).resolves.toMatchObject([{ id: summaryProposal.id, decidedBy: registered.userId }])
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

  it('lets a legacy trial edit a wiki fact, handle its finding and reject a proposal', async () => {
    vi.stubEnv('AI_EXTRACT_SPLIT', 'off')
    const trial = await startTrial()
    const sample = await createSampleWork(db, trial)
    await db
      .update(workMembers)
      .set({ role: 'viewer' })
      .where(eq(workMembers.workId, sample.workId))
    await expect(getWork(db, trial, sample.workId)).resolves.toMatchObject({ role: 'editor' })
    const check = await runChapterCheck(db, trial, sample, new FakeAiClient())
    const handIssue = check.issues.find((issue) => issue.kind === 'contradiction')!
    const content = '도윤서는 단검을 왼손에 쥔다.'
    await expect(updateFact(db, trial, handIssue.factId!, { content })).resolves.toMatchObject({
      content,
    })
    await expect(
      resolveIssue(db, trial, { issueId: handIssue.id, status: 'wiki_updated' }),
    ).resolves.toMatchObject({
      status: 'wiki_updated',
      resolvedBy: trial.userId,
    })
    await expect(
      rejectProposal(db, trial, { proposalId: check.proposals[0].id }),
    ).resolves.toMatchObject({
      status: 'rejected',
      decidedBy: trial.userId,
    })
    const changes = await db
      .select()
      .from(changeLog)
      .where(eq(changeLog.targetId, handIssue.factId!))
    expect(changes).toContainEqual(
      expect.objectContaining({ action: 'update', actorId: trial.userId }),
    )
  })

  it('blocks paid features, work administration and access to another work', async () => {
    vi.stubEnv('AI_EXTRACT_SPLIT', 'off')
    const trial = await startTrial()
    const sample = await createSampleWork(db, trial)
    const client = new FakeAiClient()
    const forbidden = { code: 'FORBIDDEN', message: TRIAL_SIGNUP_MESSAGE }
    const [first, second] = await listChapters(db, trial, sample.workId)
    await expect(runChapterCheck(db, trial, { chapterId: first.id }, client)).rejects.toMatchObject(
      forbidden,
    )
    await expect(runProofread(db, trial, { ...sample, useAi: true }, client)).rejects.toMatchObject(
      forbidden,
    )
    await expect(runReaderSimulation(db, trial, sample, client)).rejects.toMatchObject(forbidden)
    await expect(runDirectionAdvice(db, trial, sample, client)).rejects.toMatchObject(forbidden)
    const draft = { ...sample, instructions: '윤서가 종루에 들어간다.', entryIds: [] }
    await expect(planDraft(db, trial, draft, client)).rejects.toMatchObject(forbidden)
    await expect(startDraft(db, trial, draft, client)).rejects.toMatchObject(forbidden)
    await expect(startInterview(db, trial, sample.workId)).rejects.toMatchObject(forbidden)
    await expect(
      createImportJob(db, trial, { ...sample, fileName: '원고', totalChapters: 1 }),
    ).rejects.toMatchObject(forbidden)
    await expect(createWork(db, trial, { title: '새 작품' })).rejects.toMatchObject(forbidden)
    await expect(setWorkArchived(db, trial, sample.workId, true)).rejects.toMatchObject(forbidden)
    await expect(buildExportPayload(db, trial, sample.workId)).rejects.toMatchObject(forbidden)
    await expect(createInvite(db, trial, { ...sample, role: 'editor' })).rejects.toMatchObject(
      forbidden,
    )
    await expect(
      removeMember(db, trial, { ...sample, userId: trial.userId }),
    ).rejects.toMatchObject(forbidden)
    await expect(moveChapter(db, trial, second.id, 'up')).rejects.toMatchObject(forbidden)
    await expect(archiveChapter(db, trial, second.id)).rejects.toMatchObject(forbidden)
    await expect(createChapter(db, trial, { ...sample, position: 2 })).rejects.toMatchObject(
      forbidden,
    )
    expect(client.recorded).toHaveLength(0)
    await runChapterCheck(db, trial, { chapterId: second.id }, client)
    expect(client.recorded).toHaveLength(2)

    const otherTrial = await startTrial()
    const otherSample = await createSampleWork(db, otherTrial)
    await db
      .insert(workMembers)
      .values({ workId: otherSample.workId, userId: trial.userId, role: 'editor' })
    await expect(getWork(db, trial, otherSample.workId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(runChapterCheck(db, trial, otherSample, client)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(listMyWorks(db, trial)).resolves.toMatchObject([{ id: sample.workId }])
  })

  it('limits check calls and applies the global budget to trial users', async () => {
    vi.stubEnv('AI_EXTRACT_SPLIT', 'off')
    const trial = await startTrial()
    const sample = await createSampleWork(db, trial)
    const client = new FakeAiClient()
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

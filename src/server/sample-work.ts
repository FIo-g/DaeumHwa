import { and, eq } from 'drizzle-orm'
import { chapters as chapterTable, works } from '@/db/schema'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import type { Db } from '@/db/client'
import { SAMPLE_WORK, type SampleWorkData } from '@/lib/sample-work'
import { createChaptersBulk } from './chapters'
import { createFact } from './facts'
import { createRelation } from './relations'
import { createThread } from './threads'
import { createEntry } from './wiki'
import { createWork } from './works'
import { isTrialUser, lockActiveTrial } from './trial-access'

/**
 * Builds the one-click demo work through the domain services, so change_log is written. The whole
 * build is one transaction: a failure at any step leaves no half-built work behind.
 */
export async function createSampleWork(
  db: Db,
  actor: Actor,
  data: SampleWorkData = SAMPLE_WORK,
): Promise<{ workId: string; chapterId: string }> {
  return db.transaction(async (tx) => {
    // Service calls start their own transactions; on the outer tx they become savepoints.
    const run = tx as unknown as Db

    const trial = await isTrialUser(run, actor.userId)
    if (trial) {
      if (!(await lockActiveTrial(tx, actor.userId))) {
        throw new AppError('UNAUTHENTICATED', '체험을 다시 시작해 주세요.')
      }

      const [existing] = await tx
        .select({ workId: works.id, chapterId: chapterTable.id })
        .from(works)
        .leftJoin(
          chapterTable,
          and(eq(chapterTable.workId, works.id), eq(chapterTable.position, data.landingChapter)),
        )
        .where(eq(works.ownerId, actor.userId))
        .limit(1)
      if (existing) {
        if (!existing.chapterId) throw new AppError('BAD_STATE', '샘플 회차를 찾을 수 없습니다.')
        return { workId: existing.workId, chapterId: existing.chapterId }
      }
    }

    const work = await createWork(
      run,
      actor,
      { title: data.title, genre: data.genre, logline: data.logline },
      trial ? { trialSample: true } : undefined,
    )

    const entryIds = new Map<string, string>()
    for (const entry of data.entries) {
      const created = await createEntry(run, actor, {
        workId: work.id,
        kind: entry.kind,
        name: entry.name,
        aliases: entry.aliases,
        summary: entry.summary,
      })
      entryIds.set(entry.key, created.id)
    }

    for (const fact of data.facts) {
      await createFact(run, actor, {
        workId: work.id,
        entryId: entryIds.get(fact.entryKey) ?? null,
        content: fact.content,
        status: 'confirmed',
        sourceType: 'author',
      })
    }

    for (const relation of data.relations) {
      const sourceEntryId = entryIds.get(relation.sourceKey)
      const targetEntryId = entryIds.get(relation.targetKey)
      if (!sourceEntryId || !targetEntryId) throw new Error('sample relation card missing')
      await createRelation(run, actor, {
        workId: work.id,
        sourceEntryId,
        targetEntryId,
        kind: relation.kind,
        description: relation.description,
        directed: relation.directed,
        startPosition: relation.startPosition,
        endPosition: relation.endPosition,
      })
    }

    const chapters = await createChaptersBulk(run, actor, {
      workId: work.id,
      chapters: data.chapters.map((c) => ({ title: c.title, body: c.body })),
      status: 'done',
      versionSource: 'import',
    })
    const chapterByPosition = new Map(chapters.map((c) => [c.position, c.id]))

    for (const thread of data.threads) {
      await createThread(run, actor, {
        workId: work.id,
        title: thread.title,
        description: thread.description,
        status: thread.status,
        plantedChapterId:
          thread.plantedChapter !== null
            ? (chapterByPosition.get(thread.plantedChapter) ?? null)
            : null,
        targetChapterPosition: thread.targetChapterPosition,
        importance: thread.importance,
      })
    }

    const landingId = chapterByPosition.get(data.landingChapter)
    if (!landingId) throw new AppError('BAD_STATE', '샘플 회차를 찾을 수 없습니다.')
    return { workId: work.id, chapterId: landingId }
  })
}

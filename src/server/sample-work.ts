import type { Actor } from '@/db/types'
import type { Db } from '@/db/client'
import { SAMPLE_WORK, type SampleWorkData } from '@/lib/sample-work'
import { createChaptersBulk } from './chapters'
import { createFact } from './facts'
import { createThread } from './threads'
import { createEntry } from './wiki'
import { createWork } from './works'

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

    const work = await createWork(run, actor, {
      title: data.title,
      genre: data.genre,
      logline: data.logline,
    })

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
    if (!landingId) throw new Error('sample landing chapter missing')
    return { workId: work.id, chapterId: landingId }
  })
}

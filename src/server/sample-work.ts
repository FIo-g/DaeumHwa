import type { Actor } from '@/db/types'
import type { Db } from '@/db/client'
import { SAMPLE_WORK } from '@/lib/sample-work'
import { createChaptersBulk } from './chapters'
import { createFact } from './facts'
import { createThread } from './threads'
import { createEntry } from './wiki'
import { createWork } from './works'

/** Builds the one-click demo work through the domain services, so change_log is written. */
export async function createSampleWork(
  db: Db,
  actor: Actor,
): Promise<{ workId: string; chapterId: string }> {
  const work = await createWork(db, actor, {
    title: SAMPLE_WORK.title,
    genre: SAMPLE_WORK.genre,
    logline: SAMPLE_WORK.logline,
  })

  const entryIds = new Map<string, string>()
  for (const entry of SAMPLE_WORK.entries) {
    const created = await createEntry(db, actor, {
      workId: work.id,
      kind: entry.kind,
      name: entry.name,
      aliases: entry.aliases,
      summary: entry.summary,
    })
    entryIds.set(entry.key, created.id)
  }

  for (const fact of SAMPLE_WORK.facts) {
    await createFact(db, actor, {
      workId: work.id,
      entryId: entryIds.get(fact.entryKey) ?? null,
      content: fact.content,
      status: 'confirmed',
      sourceType: 'author',
    })
  }

  const chapters = await createChaptersBulk(db, actor, {
    workId: work.id,
    chapters: SAMPLE_WORK.chapters.map((c) => ({ title: c.title, body: c.body })),
    status: 'done',
    versionSource: 'import',
  })
  const chapterByPosition = new Map(chapters.map((c) => [c.position, c.id]))

  for (const thread of SAMPLE_WORK.threads) {
    await createThread(db, actor, {
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

  const landingId = chapterByPosition.get(SAMPLE_WORK.landingChapter)
  if (!landingId) throw new Error('sample landing chapter missing')
  return { workId: work.id, chapterId: landingId }
}

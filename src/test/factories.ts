import { randomUUID } from 'node:crypto'
import { chapters, facts, threads, user, wikiEntries, workMembers, works } from '@/db/schema'
import type {
  ChapterRow,
  ChapterStatus,
  EntryKind,
  EntryRow,
  FactRow,
  FactStatus,
  Role,
  ThreadRow,
  ThreadStatus,
  WorkRow,
  WorkSettings,
} from '@/db/types'
import type { Db } from '@/db/client'

let userCounter = 0

export async function createTestUser(
  db: Db,
  o?: { name?: string; email?: string },
): Promise<{ id: string; name: string; email: string }> {
  userCounter += 1
  const id = randomUUID()
  const name = o?.name ?? `테스트 사용자 ${userCounter}`
  const email = o?.email ?? `user-${userCounter}-${id.slice(0, 8)}@test.local`
  await db.insert(user).values({ id, name, email })
  return { id, name, email }
}

/** Creates a work and inserts the owner membership row. */
export async function createTestWork(
  db: Db,
  ownerId: string,
  o?: { title?: string; settings?: WorkSettings },
): Promise<WorkRow> {
  const [work] = await db
    .insert(works)
    .values({
      ownerId,
      title: o?.title ?? '테스트 작품',
      settings: o?.settings ?? {},
    })
    .returning()
  await db.insert(workMembers).values({ workId: work.id, userId: ownerId, role: 'owner' })
  return work
}

export async function addTestMember(
  db: Db,
  workId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await db.insert(workMembers).values({ workId, userId, role })
}

export async function createTestChapter(
  db: Db,
  workId: string,
  o?: {
    position?: number
    title?: string
    body?: string
    status?: ChapterStatus
    publishedOn?: string | null
  },
): Promise<ChapterRow> {
  const body = o?.body ?? ''
  const [chapter] = await db
    .insert(chapters)
    .values({
      workId,
      position: o?.position ?? 1,
      title: o?.title ?? '',
      body,
      status: o?.status ?? 'draft',
      publishedOn: o?.publishedOn ?? null,
      charCount: body.length,
      charCountNoSpaces: body.replace(/\s/g, '').length,
    })
    .returning()
  return chapter
}

export async function createTestEntry(
  db: Db,
  workId: string,
  o: {
    name: string
    kind?: EntryKind
    aliases?: string[]
    summary?: string
    fields?: Record<string, string>
  },
): Promise<EntryRow> {
  const [entry] = await db
    .insert(wikiEntries)
    .values({
      workId,
      name: o.name,
      kind: o.kind ?? 'character',
      aliases: o.aliases ?? [],
      summary: o.summary ?? '',
      fields: o.fields ?? {},
    })
    .returning()
  return entry
}

export async function createTestFact(
  db: Db,
  workId: string,
  o: {
    content: string
    entryId?: string | null
    status?: FactStatus
    sourceChapterId?: string | null
    validFromPosition?: number | null
    validToPosition?: number | null
  },
): Promise<FactRow> {
  const [fact] = await db
    .insert(facts)
    .values({
      workId,
      content: o.content,
      entryId: o.entryId ?? null,
      status: o.status ?? 'confirmed',
      sourceChapterId: o.sourceChapterId ?? null,
      validFromPosition: o.validFromPosition ?? null,
      validToPosition: o.validToPosition ?? null,
    })
    .returning()
  return fact
}

export async function createTestThread(
  db: Db,
  workId: string,
  o: {
    title: string
    status?: ThreadStatus
    plantedChapterId?: string | null
    targetChapterPosition?: number | null
  },
): Promise<ThreadRow> {
  const [thread] = await db
    .insert(threads)
    .values({
      workId,
      title: o.title,
      status: o.status ?? 'planted',
      plantedChapterId: o.plantedChapterId ?? null,
      targetChapterPosition: o.targetChapterPosition ?? null,
    })
    .returning()
  return thread
}

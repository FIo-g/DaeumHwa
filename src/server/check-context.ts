import { eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, wikiEntries } from '@/db/schema'
import type { Actor, EntryKind, FactStatus, ThreadStatus } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { buildCheckPack } from '@/server/chapter-check'

// Read-only view of the context pack the chapter check sends. The view is built from the same
// function the check uses, so the two cannot drift. It reads the DB only and never calls the AI.

export type CheckContextFact = {
  id: string
  content: string
  status: FactStatus
  validFromPosition: number | null
  validToPosition: number | null
}

export type CheckContextEntry = {
  id: string
  name: string
  kind: EntryKind
  facts: CheckContextFact[]
}

export type CheckContextThread = {
  id: string
  title: string
  status: ThreadStatus
  targetPosition: number | null
  overdue: boolean
}

export type CheckContextView = {
  position: number
  entries: CheckContextEntry[]
  /** Names of chosen cards that the budget cut, in pack order. */
  trimmedEntryNames: string[]
  threads: CheckContextThread[]
  previousSummaries: { position: number; title: string }[]
  relationCount: number
  namingRuleCount: number
  /** Active cards in the work. */
  totalEntries: number
}

/** What the chapter check would send for the saved chapter text. Any member may read it. Never calls the AI. */
export async function describeCheckContext(
  db: Db,
  actor: Actor,
  input: { chapterId: string },
): Promise<CheckContextView> {
  const workId = await requireRowWork(db, 'chapters', input.chapterId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
    }
    throw error
  })
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, input.chapterId))
    .limit(1)
  if (!chapter || chapter.archivedAt !== null) {
    throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
  }

  const pack = await buildCheckPack(db, workId, chapter)
  const packedIds = new Set(pack.entries.map((entry) => entry.id))
  const trimmedIds = (pack.chosenEntryIds ?? []).filter((id) => !packedIds.has(id))
  const trimmedRows = trimmedIds.length
    ? await db
        .select({ id: wikiEntries.id, name: wikiEntries.name })
        .from(wikiEntries)
        .where(inArray(wikiEntries.id, trimmedIds))
    : []
  const nameById = new Map(trimmedRows.map((row) => [row.id, row.name]))

  return {
    position: pack.position,
    entries: pack.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      facts: entry.facts.map((fact) => ({
        id: fact.id,
        content: fact.content,
        status: fact.status,
        validFromPosition: fact.validFromPosition,
        validToPosition: fact.validToPosition,
      })),
    })),
    trimmedEntryNames: trimmedIds.flatMap((id) => {
      const name = nameById.get(id)
      return name === undefined ? [] : [name]
    }),
    threads: pack.threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      status: thread.status,
      targetPosition: thread.targetPosition,
      overdue: thread.overdue,
    })),
    previousSummaries: pack.previousSummaries.map((summary) => ({
      position: summary.position,
      title: summary.title,
    })),
    relationCount: pack.relations.length,
    namingRuleCount: pack.namingRules.length,
    totalEntries: pack.stats.totalEntries,
  }
}

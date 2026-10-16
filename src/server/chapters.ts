import { and, asc, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { chapters, chapterVersions } from '@/db/schema'
import type {
  Actor,
  ChapterRow,
  ChapterStatus,
  ChapterVersionRow,
  ProposerType,
  Role,
  VersionSource,
} from '@/db/types'
import { countChars } from '@/lib/korean/chars'
import { AppError } from '@/lib/errors'
import { chapterLabel } from '@/lib/labels'
import { requireRowWork, requireWorkRole } from '@/server/access'
import { recomputeAppearances } from '@/server/appearances'
import { recordChange } from '@/server/changes'

// Chapters, their saved versions (history), and the summary field. Every write that changes
// chapter text goes through saveChapter, which handles optimistic concurrency and history.

/** Saves by the same user within this window merge into the last save row (spec §4.2). */
const COALESCE_WINDOW_MS = 10 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type ChapterListItem = Omit<ChapterRow, 'body'>
export type ChapterVersionListItem = Omit<ChapterVersionRow, 'body'>

// Every column of a chapter except the body, so lists stay light.
const LIST_COLUMNS = {
  id: chapters.id,
  workId: chapters.workId,
  position: chapters.position,
  title: chapters.title,
  status: chapters.status,
  publishedOn: chapters.publishedOn,
  summary: chapters.summary,
  charCount: chapters.charCount,
  charCountNoSpaces: chapters.charCountNoSpaces,
  version: chapters.version,
  archivedAt: chapters.archivedAt,
  createdAt: chapters.createdAt,
  updatedAt: chapters.updatedAt,
}

export type CreateChapterInput = {
  workId: string
  title?: string
  body?: string
  status?: ChapterStatus
  position?: number
  versionSource?: VersionSource
}

export type SaveChapterInput = {
  chapterId: string
  title?: string
  body?: string
  expectedVersion: number
  source?: 'save' | 'ai_draft' | 'restore'
}

export type BulkChapterInput = {
  workId: string
  chapters: { title: string; body: string }[]
  status: ChapterStatus
  versionSource: 'import'
}

/** Largest position among non-archived chapters, 0 when there are none. */
async function maxPosition(db: Db, workId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${chapters.position})` })
    .from(chapters)
    .where(and(eq(chapters.workId, workId), isNull(chapters.archivedAt)))
  return Number(row?.max ?? 0)
}

/** Loads a chapter after checking the caller's role on its work. Non-members get NOT_FOUND. */
async function loadChapter(
  db: Db,
  actor: Actor,
  chapterId: string,
  min: Role,
): Promise<{ chapter: ChapterRow; role: Role }> {
  const workId = await requireRowWork(db, 'chapters', chapterId)
  const { role } = await requireWorkRole(db, workId, actor.userId, min)
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1)
  if (!chapter) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
  return { chapter, role }
}

function assertNotArchived(chapter: ChapterRow): void {
  if (chapter.archivedAt) throw new AppError('BAD_STATE', '보관된 회차는 수정할 수 없습니다.')
}

/**
 * Appends a history row for a save. A save by the same user as the last save row, within the
 * window, merges into that row. The creation snapshot (version 1) is never merged into, so the
 * first saved text always keeps its own history row.
 */
async function writeVersionRow(
  db: Db,
  input: {
    chapterId: string
    actorId: string
    source: VersionSource
    title: string
    body: string
    charCount: number
    version: number
    now: Date
  },
): Promise<void> {
  const [latest] = await db
    .select()
    .from(chapterVersions)
    .where(eq(chapterVersions.chapterId, input.chapterId))
    .orderBy(desc(chapterVersions.version))
    .limit(1)

  const canMerge =
    input.source === 'save' &&
    latest !== undefined &&
    latest.source === 'save' &&
    latest.createdBy === input.actorId &&
    latest.version > 1 &&
    input.now.getTime() - latest.updatedAt.getTime() <= COALESCE_WINDOW_MS

  if (canMerge) {
    await db
      .update(chapterVersions)
      .set({
        title: input.title,
        body: input.body,
        charCount: input.charCount,
        version: input.version,
        updatedAt: input.now,
      })
      .where(eq(chapterVersions.id, latest.id))
    return
  }

  await db.insert(chapterVersions).values({
    chapterId: input.chapterId,
    version: input.version,
    title: input.title,
    body: input.body,
    charCount: input.charCount,
    source: input.source,
    createdBy: input.actorId,
    createdAt: input.now,
    updatedAt: input.now,
  })
}

/** Chapters of a work in manuscript order. Archived chapters only with includeArchived. Viewer role or higher. */
export async function listChapters(
  db: Db,
  actor: Actor,
  workId: string,
  o?: { includeArchived?: boolean },
): Promise<ChapterListItem[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const conditions = [eq(chapters.workId, workId)]
  if (!o?.includeArchived) conditions.push(isNull(chapters.archivedAt))
  return db
    .select(LIST_COLUMNS)
    .from(chapters)
    .where(and(...conditions))
    .orderBy(asc(chapters.position))
}

/** One chapter with the caller's role. Viewer role or higher; others get NOT_FOUND. */
export async function getChapter(
  db: Db,
  actor: Actor,
  chapterId: string,
): Promise<ChapterRow & { role: Role }> {
  const { chapter, role } = await loadChapter(db, actor, chapterId, 'viewer')
  return { ...chapter, role }
}

/** Largest position among non-archived chapters of a work, 0 when there are none. */
export async function getLatestPosition(db: Db, workId: string): Promise<number> {
  return maxPosition(db, workId)
}

/**
 * Creates a chapter at the end (or at an explicit position, shifting the chapters from there on).
 * Writes version 1 with the given source. Editor role.
 */
export async function createChapter(
  db: Db,
  actor: Actor,
  input: CreateChapterInput,
): Promise<ChapterRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  if (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 1)) {
    throw new AppError('VALIDATION', '회차 위치가 올바르지 않습니다.')
  }
  const body = input.body ?? ''

  return db.transaction(async (tx) => {
    const latest = await maxPosition(tx, input.workId)
    const position = input.position ?? latest + 1
    if (position <= latest) {
      await tx
        .update(chapters)
        .set({ position: sql`${chapters.position} + 1` })
        .where(
          and(
            eq(chapters.workId, input.workId),
            isNull(chapters.archivedAt),
            gte(chapters.position, position),
          ),
        )
    }

    const title = input.title?.trim() || `${position}화`
    const { withSpaces, withoutSpaces } = countChars(body)
    const now = new Date()
    const [chapter] = await tx
      .insert(chapters)
      .values({
        workId: input.workId,
        position,
        title,
        body,
        status: input.status ?? 'draft',
        charCount: withSpaces,
        charCountNoSpaces: withoutSpaces,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    await tx.insert(chapterVersions).values({
      chapterId: chapter.id,
      version: 1,
      title,
      body,
      charCount: withSpaces,
      source: input.versionSource ?? 'save',
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
    await recomputeAppearances(tx, chapter.id)
    return chapter
  })
}

/**
 * Appends imported chapters after the last position, in order, in one transaction.
 * Each chapter gets version 1 with source 'import'. Editor role.
 */
export async function createChaptersBulk(
  db: Db,
  actor: Actor,
  input: BulkChapterInput,
): Promise<ChapterRow[]> {
  await requireWorkRole(db, input.workId, actor.userId, 'editor')
  if (input.chapters.length === 0) return []

  return db.transaction(async (tx) => {
    const start = (await maxPosition(tx, input.workId)) + 1
    const created: ChapterRow[] = []
    for (const [index, item] of input.chapters.entries()) {
      const position = start + index
      const title = item.title.trim() || `${position}화`
      const { withSpaces, withoutSpaces } = countChars(item.body)
      const now = new Date()
      const [chapter] = await tx
        .insert(chapters)
        .values({
          workId: input.workId,
          position,
          title,
          body: item.body,
          status: input.status,
          charCount: withSpaces,
          charCountNoSpaces: withoutSpaces,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      await tx.insert(chapterVersions).values({
        chapterId: chapter.id,
        version: 1,
        title,
        body: item.body,
        charCount: withSpaces,
        source: input.versionSource,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      await recomputeAppearances(tx, chapter.id)
      created.push(chapter)
    }
    return created
  })
}

/**
 * Saves title and/or body. `expectedVersion` must match the stored version, otherwise CONFLICT
 * (with `currentVersion` in details). Bumps the version, recounts characters, rewrites the
 * history (see writeVersionRow) and recomputes appearances. Editor role.
 */
export async function saveChapter(
  db: Db,
  actor: Actor,
  input: SaveChapterInput,
): Promise<ChapterRow> {
  return db.transaction(async (tx) => {
    const { chapter } = await loadChapter(tx, actor, input.chapterId, 'editor')
    await requireWorkRole(tx, chapter.workId, actor.userId, 'editor')
    assertNotArchived(chapter)

    const source = input.source ?? 'save'
    const title = input.title !== undefined ? input.title.trim() : chapter.title
    const body = input.body ?? chapter.body
    const { withSpaces, withoutSpaces } = countChars(body)
    const now = new Date()

    // The version check and the bump happen in one statement, so a concurrent save cannot slip in.
    const [updated] = await tx
      .update(chapters)
      .set({
        title,
        body,
        charCount: withSpaces,
        charCountNoSpaces: withoutSpaces,
        version: sql`${chapters.version} + 1`,
        updatedAt: now,
      })
      .where(and(eq(chapters.id, chapter.id), eq(chapters.version, input.expectedVersion)))
      .returning()
    if (!updated) {
      const [current] = await tx
        .select({ version: chapters.version })
        .from(chapters)
        .where(eq(chapters.id, chapter.id))
        .limit(1)
      throw new AppError('CONFLICT', '다른 곳에서 먼저 수정된 원고가 있습니다.', {
        currentVersion: current?.version,
      })
    }

    await writeVersionRow(tx, {
      chapterId: chapter.id,
      actorId: actor.userId,
      source,
      title,
      body,
      charCount: withSpaces,
      version: updated.version,
      now,
    })
    await recomputeAppearances(tx, chapter.id)
    return updated
  })
}

/** Sets the publishing status. Editor role. Does not bump the text version. */
export async function setChapterStatus(
  db: Db,
  actor: Actor,
  chapterId: string,
  status: ChapterStatus,
): Promise<ChapterRow> {
  const { chapter } = await loadChapter(db, actor, chapterId, 'editor')
  assertNotArchived(chapter)
  const [updated] = await db
    .update(chapters)
    .set({ status, updatedAt: new Date() })
    .where(eq(chapters.id, chapterId))
    .returning()
  return updated
}

/** Sets the publish date (`YYYY-MM-DD`, Asia/Seoul calendar day) or clears it with null. Editor role. */
export async function setChapterPublishedOn(
  db: Db,
  actor: Actor,
  chapterId: string,
  publishedOn: string | null,
): Promise<ChapterRow> {
  if (publishedOn !== null && !ISO_DATE_RE.test(publishedOn)) {
    throw new AppError('VALIDATION', '연재일 형식이 올바르지 않습니다.')
  }
  const { chapter } = await loadChapter(db, actor, chapterId, 'editor')
  assertNotArchived(chapter)
  const [updated] = await db
    .update(chapters)
    .set({ publishedOn, updatedAt: new Date() })
    .where(eq(chapters.id, chapterId))
    .returning()
  return updated
}

/** Swaps the position with the neighbouring non-archived chapter. No-op at either end. Editor role. */
export async function moveChapter(
  db: Db,
  actor: Actor,
  chapterId: string,
  direction: 'up' | 'down',
): Promise<void> {
  await db.transaction(async (tx) => {
    const { chapter } = await loadChapter(tx, actor, chapterId, 'editor')
    if (chapter.archivedAt) throw new AppError('BAD_STATE', '보관된 회차는 이동할 수 없습니다.')

    const [neighbour] = await tx
      .select({ id: chapters.id, position: chapters.position })
      .from(chapters)
      .where(
        and(
          eq(chapters.workId, chapter.workId),
          isNull(chapters.archivedAt),
          direction === 'up'
            ? lt(chapters.position, chapter.position)
            : gt(chapters.position, chapter.position),
        ),
      )
      .orderBy(direction === 'up' ? desc(chapters.position) : asc(chapters.position))
      .limit(1)
    if (!neighbour) return

    const now = new Date()
    await tx
      .update(chapters)
      .set({ position: chapter.position, updatedAt: now })
      .where(eq(chapters.id, neighbour.id))
    await tx
      .update(chapters)
      .set({ position: neighbour.position, updatedAt: now })
      .where(eq(chapters.id, chapter.id))
  })
}

/** Archives a chapter (kept with its history; hidden from lists). Editor role. */
export async function archiveChapter(db: Db, actor: Actor, chapterId: string): Promise<ChapterRow> {
  const { chapter } = await loadChapter(db, actor, chapterId, 'editor')
  if (chapter.archivedAt) return chapter
  const now = new Date()
  const [updated] = await db
    .update(chapters)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(chapters.id, chapterId))
    .returning()
  return updated
}

/**
 * Brings an archived chapter back. When its position is now taken by a visible chapter,
 * it goes to the end instead. Editor role.
 */
export async function restoreChapter(db: Db, actor: Actor, chapterId: string): Promise<ChapterRow> {
  return db.transaction(async (tx) => {
    const { chapter } = await loadChapter(tx, actor, chapterId, 'editor')
    if (!chapter.archivedAt) return chapter

    const [clash] = await tx
      .select({ id: chapters.id })
      .from(chapters)
      .where(
        and(
          eq(chapters.workId, chapter.workId),
          isNull(chapters.archivedAt),
          eq(chapters.position, chapter.position),
        ),
      )
      .limit(1)
    const position = clash ? (await maxPosition(tx, chapter.workId)) + 1 : chapter.position

    const now = new Date()
    const [updated] = await tx
      .update(chapters)
      .set({ archivedAt: null, position, updatedAt: now })
      .where(eq(chapters.id, chapterId))
      .returning()
    return updated
  })
}

/** History of a chapter, newest first, without the bodies. Viewer role or higher. */
export async function listVersions(
  db: Db,
  actor: Actor,
  chapterId: string,
): Promise<ChapterVersionListItem[]> {
  const { chapter } = await loadChapter(db, actor, chapterId, 'viewer')
  return db
    .select({
      id: chapterVersions.id,
      chapterId: chapterVersions.chapterId,
      version: chapterVersions.version,
      title: chapterVersions.title,
      charCount: chapterVersions.charCount,
      source: chapterVersions.source,
      createdBy: chapterVersions.createdBy,
      createdAt: chapterVersions.createdAt,
      updatedAt: chapterVersions.updatedAt,
    })
    .from(chapterVersions)
    .where(eq(chapterVersions.chapterId, chapter.id))
    .orderBy(desc(chapterVersions.version))
}

/** One history row with its body. Viewer role or higher; unknown ids and non-members get NOT_FOUND. */
export async function getVersion(
  db: Db,
  actor: Actor,
  versionId: string,
): Promise<ChapterVersionRow> {
  if (!UUID_RE.test(versionId)) throw new AppError('NOT_FOUND', '버전을 찾을 수 없습니다.')
  const [row] = await db
    .select({ version: chapterVersions, workId: chapters.workId })
    .from(chapterVersions)
    .innerJoin(chapters, eq(chapters.id, chapterVersions.chapterId))
    .where(eq(chapterVersions.id, versionId))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', '버전을 찾을 수 없습니다.')
  await requireWorkRole(db, row.workId, actor.userId, 'viewer')
  return row.version
}

/**
 * Restores an old version by saving its title and body as a new version (source 'restore').
 * Editor role; the same version check as saveChapter applies.
 */
export async function restoreVersion(
  db: Db,
  actor: Actor,
  input: { versionId: string; expectedVersion: number },
): Promise<ChapterRow> {
  const old = await getVersion(db, actor, input.versionId)
  return saveChapter(db, actor, {
    chapterId: old.chapterId,
    title: old.title,
    body: old.body,
    expectedVersion: input.expectedVersion,
    source: 'restore',
  })
}

/**
 * Sets the approved summary of a chapter and records the change in the change log.
 * `proposerType` is 'ai' when it comes from an approved proposal (pass its id as proposalId).
 */
export async function setChapterSummary(
  db: Db,
  actor: Actor,
  input: {
    chapterId: string
    summary: string
    proposerType: ProposerType
    proposalId?: string | null
  },
): Promise<ChapterRow> {
  return db.transaction(async (tx) => {
    const { chapter } = await loadChapter(tx, actor, input.chapterId, 'editor')
    assertNotArchived(chapter)
    const [updated] = await tx
      .update(chapters)
      .set({ summary: input.summary, updatedAt: new Date() })
      .where(eq(chapters.id, chapter.id))
      .returning()
    await recordChange(tx, {
      workId: chapter.workId,
      targetTable: 'chapters',
      targetId: chapter.id,
      action: 'update',
      before: { summary: chapter.summary },
      after: { summary: input.summary },
      proposerType: input.proposerType,
      actorId: actor.userId,
      proposalId: input.proposalId ?? null,
      summary: `회차 요약 수정: ${chapterLabel(chapter.position, chapter.title)}`,
    })
    return updated
  })
}

/**
 * Returns the newest draft chapter when there is one, otherwise creates the next chapter.
 * Editor role.
 */
export async function openNextChapter(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<{ chapterId: string; created: boolean }> {
  await requireWorkRole(db, workId, actor.userId, 'editor')
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select({ id: chapters.id })
      .from(chapters)
      .where(
        and(eq(chapters.workId, workId), isNull(chapters.archivedAt), eq(chapters.status, 'draft')),
      )
      .orderBy(desc(chapters.position))
      .limit(1)
    if (draft) return { chapterId: draft.id, created: false }
    const chapter = await createChapter(tx, actor, { workId })
    return { chapterId: chapter.id, created: true }
  })
}

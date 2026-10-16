import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { comments, user } from '@/db/schema'
import type { Actor, CommentRow } from '@/db/types'
import { AppError } from '@/lib/errors'
import { hasRole, requireRowWork, requireWorkRole } from '@/server/access'

// Editor comments on a chapter (spec F19). Comments are not wiki rows and are hard-deleted.
// Only top-level comments carry the quote; replies hang under one top-level comment.

export type CommentView = CommentRow & {
  authorName: string
  replies: (CommentRow & { authorName: string })[]
}

export type AddCommentInput = {
  chapterId: string
  body: string
  quote?: string
  quoteStart?: number | null
  quoteEnd?: number | null
  parentId?: string | null
}

/** Top-level comments by position in the text, then replies by time. Viewer role or higher. */
export async function listComments(
  db: Db,
  actor: Actor,
  chapterId: string,
): Promise<CommentView[]> {
  const workId = await requireRowWork(db, 'chapters', chapterId)
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const rows = await db
    .select({ comment: comments, authorName: user.name })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .where(eq(comments.chapterId, chapterId))
    .orderBy(asc(comments.createdAt))

  const replyMap = new Map<string, (CommentRow & { authorName: string })[]>()
  const tops: (CommentRow & { authorName: string })[] = []
  for (const { comment, authorName } of rows) {
    const item = { ...comment, authorName }
    if (comment.parentId) {
      const list = replyMap.get(comment.parentId) ?? []
      list.push(item)
      replyMap.set(comment.parentId, list)
    } else {
      tops.push(item)
    }
  }
  tops.sort((a, b) => {
    const aStart = a.quoteStart ?? Number.MAX_SAFE_INTEGER
    const bStart = b.quoteStart ?? Number.MAX_SAFE_INTEGER
    if (aStart !== bStart) return aStart - bStart
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  return tops.map((top) => ({ ...top, replies: replyMap.get(top.id) ?? [] }))
}

/** Adds a comment or a reply. Commenter role or higher. Replies to replies attach to the top-level comment. */
export async function addComment(
  db: Db,
  actor: Actor,
  input: AddCommentInput,
): Promise<CommentRow> {
  const workId = await requireRowWork(db, 'chapters', input.chapterId)
  await requireWorkRole(db, workId, actor.userId, 'commenter')

  const body = input.body.trim()
  if (!body) throw new AppError('VALIDATION', '코멘트 내용을 입력하세요.')
  if (input.quoteStart != null && input.quoteEnd != null && input.quoteEnd < input.quoteStart) {
    throw new AppError('VALIDATION', '코멘트 위치가 올바르지 않습니다.')
  }

  let parentId: string | null = null
  if (input.parentId) {
    const [parent] = await db
      .select({
        id: comments.id,
        chapterId: comments.chapterId,
        parentId: comments.parentId,
      })
      .from(comments)
      .where(eq(comments.id, input.parentId))
      .limit(1)
    if (!parent || parent.chapterId !== input.chapterId) {
      throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
    }
    parentId = parent.parentId ?? parent.id
  }

  const [row] = await db
    .insert(comments)
    .values({
      workId,
      chapterId: input.chapterId,
      authorId: actor.userId,
      parentId,
      body,
      quote: input.quote ?? '',
      quoteStart: input.quoteStart ?? null,
      quoteEnd: input.quoteEnd ?? null,
    })
    .returning()
  return row
}

/**
 * Resolves or reopens a comment. The author (commenter role or higher) may resolve their own
 * comment; editors and up may resolve any comment.
 */
export async function setCommentResolved(
  db: Db,
  actor: Actor,
  input: { commentId: string; resolved: boolean },
): Promise<CommentRow> {
  const workId = await requireRowWork(db, 'comments', input.commentId)
  const { role } = await requireWorkRole(db, workId, actor.userId, 'commenter')
  const [current] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
  if (current.authorId !== actor.userId && !hasRole(role, 'editor')) {
    throw new AppError('FORBIDDEN', '이 작업을 할 권한이 없습니다.')
  }
  const now = new Date()
  const [updated] = await db
    .update(comments)
    .set({
      status: input.resolved ? 'resolved' : 'open',
      resolvedBy: input.resolved ? actor.userId : null,
      resolvedAt: input.resolved ? now : null,
      updatedAt: now,
    })
    .where(eq(comments.id, input.commentId))
    .returning()
  return updated
}

/**
 * Deletes a comment and its replies. The author (commenter role or higher) or the owner.
 */
export async function deleteComment(db: Db, actor: Actor, commentId: string): Promise<void> {
  const workId = await requireRowWork(db, 'comments', commentId)
  const { role } = await requireWorkRole(db, workId, actor.userId, 'viewer')
  const [current] = await db
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')

  const isAuthor = current.authorId === actor.userId
  if (isAuthor ? !hasRole(role, 'commenter') : role !== 'owner') {
    throw new AppError('FORBIDDEN', '이 작업을 할 권한이 없습니다.')
  }

  await db.transaction(async (tx) => {
    await tx.delete(comments).where(eq(comments.parentId, commentId))
    await tx.delete(comments).where(eq(comments.id, commentId))
  })
}

'use server'

import { z } from 'zod'
import type { CommentRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { addComment, deleteComment, setCommentResolved } from '@/server/comments'

const AddCommentSchema = z.object({
  chapterId: z.uuid(),
  body: z.string().max(2000),
  quote: z.string().max(500).optional(),
  quoteStart: z.number().int().min(0).nullable().optional(),
  quoteEnd: z.number().int().min(0).nullable().optional(),
  parentId: z.uuid().nullable().optional(),
})

const SetResolvedSchema = z.object({
  commentId: z.uuid(),
  resolved: z.boolean(),
})

const DeleteCommentSchema = z.object({
  commentId: z.uuid(),
})

export async function addCommentAction(input: unknown): Promise<ActionResult<CommentRow>> {
  return withAction(async (db, actor) => {
    const data = AddCommentSchema.parse(input)
    const comment = await addComment(db, actor, data)
    revalidateWork(comment.workId)
    return comment
  })
}

export async function setCommentResolvedAction(input: unknown): Promise<ActionResult<CommentRow>> {
  return withAction(async (db, actor) => {
    const data = SetResolvedSchema.parse(input)
    const comment = await setCommentResolved(db, actor, data)
    revalidateWork(comment.workId)
    return comment
  })
}

export async function deleteCommentAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const { commentId } = DeleteCommentSchema.parse(input)
    const workId = await requireRowWork(db, 'comments', commentId)
    await deleteComment(db, actor, commentId)
    revalidateWork(workId)
  })
}

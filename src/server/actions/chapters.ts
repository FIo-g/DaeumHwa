'use server'

import { z } from 'zod'
import { CHAPTER_STATUSES, type ChapterRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  archiveChapter,
  createChapter,
  getChapter,
  moveChapter,
  openNextChapter,
  restoreChapter,
  setChapterPublishedOn,
  setChapterStatus,
  setChapterSummary,
} from '@/server/chapters'

const CreateChapterSchema = z.object({
  workId: z.uuid(),
  title: z.string().max(100).optional(),
})

const ChapterIdSchema = z.object({ chapterId: z.uuid() })

const SetStatusSchema = z.object({
  chapterId: z.uuid(),
  status: z.enum(CHAPTER_STATUSES),
})

const SetPublishedOnSchema = z.object({
  chapterId: z.uuid(),
  publishedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
})

const MoveSchema = z.object({
  chapterId: z.uuid(),
  direction: z.enum(['up', 'down']),
})

const OpenNextSchema = z.object({ workId: z.uuid() })

const SetSummarySchema = z.object({
  chapterId: z.uuid(),
  summary: z.string().max(2000),
})

export async function createChapterAction(input: unknown): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const data = CreateChapterSchema.parse(input)
    const chapter = await createChapter(db, actor, { workId: data.workId, title: data.title })
    revalidateWork(chapter.workId)
    return chapter
  })
}

export async function setChapterStatusAction(input: unknown): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const { chapterId, status } = SetStatusSchema.parse(input)
    const chapter = await setChapterStatus(db, actor, chapterId, status)
    revalidateWork(chapter.workId)
    return chapter
  })
}

export async function setChapterPublishedOnAction(
  input: unknown,
): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const { chapterId, publishedOn } = SetPublishedOnSchema.parse(input)
    const chapter = await setChapterPublishedOn(db, actor, chapterId, publishedOn)
    revalidateWork(chapter.workId)
    return chapter
  })
}

export async function moveChapterAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const { chapterId, direction } = MoveSchema.parse(input)
    const { workId } = await getChapter(db, actor, chapterId)
    await moveChapter(db, actor, chapterId, direction)
    revalidateWork(workId)
  })
}

export async function archiveChapterAction(input: unknown): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const { chapterId } = ChapterIdSchema.parse(input)
    const chapter = await archiveChapter(db, actor, chapterId)
    revalidateWork(chapter.workId)
    return chapter
  })
}

export async function restoreChapterAction(input: unknown): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const { chapterId } = ChapterIdSchema.parse(input)
    const chapter = await restoreChapter(db, actor, chapterId)
    revalidateWork(chapter.workId)
    return chapter
  })
}

export async function openNextChapterAction(
  input: unknown,
): Promise<ActionResult<{ chapterId: string; created: boolean }>> {
  return withAction(async (db, actor) => {
    const { workId } = OpenNextSchema.parse(input)
    const result = await openNextChapter(db, actor, workId)
    if (result.created) revalidateWork(workId)
    return result
  })
}

/** Author edit of the chapter summary. AI-proposed summaries go through proposal approval instead. */
export async function setChapterSummaryAction(input: unknown): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const { chapterId, summary } = SetSummarySchema.parse(input)
    const chapter = await setChapterSummary(db, actor, {
      chapterId,
      summary,
      proposerType: 'author',
    })
    revalidateWork(chapter.workId)
    return chapter
  })
}

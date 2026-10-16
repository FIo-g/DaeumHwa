'use server'

import { z } from 'zod'
import type { ChapterRow, ChapterVersionRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { getVersion, restoreVersion, saveChapter } from '@/server/chapters'
import { saveResumePoint } from '@/server/user-state'

const SaveChapterSchema = z.object({
  chapterId: z.uuid(),
  title: z.string().max(200).optional(),
  body: z.string().max(200_000).optional(),
  expectedVersion: z.number().int().min(1),
  // Restores go through restoreVersionAction so that the source cannot be chosen by a plain save.
  source: z.enum(['save', 'ai_draft']).optional(),
})

const RestoreVersionSchema = z.object({
  versionId: z.uuid(),
  expectedVersion: z.number().int().min(1),
})

const ResumePointSchema = z.object({
  workId: z.uuid(),
  chapterId: z.uuid().nullable().optional(),
  cursor: z.number().int().min(0).nullable().optional(),
  path: z.string().min(1).max(500).startsWith('/'),
})

const VersionIdSchema = z.object({ versionId: z.uuid() })

export type SaveChapterResult = {
  version: number
  updatedAt: string
  charCount: number
  charCountNoSpaces: number
}

/**
 * Autosave entry point. On a stale expectedVersion the result is an error with code CONFLICT
 * (the message says another edit came first).
 */
export async function saveChapterAction(input: unknown): Promise<ActionResult<SaveChapterResult>> {
  return withAction(async (db, actor) => {
    const data = SaveChapterSchema.parse(input)
    const chapter = await saveChapter(db, actor, data)
    revalidateWork(chapter.workId)
    return {
      version: chapter.version,
      updatedAt: chapter.updatedAt.toISOString(),
      charCount: chapter.charCount,
      charCountNoSpaces: chapter.charCountNoSpaces,
    }
  })
}

export async function restoreVersionAction(input: unknown): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const data = RestoreVersionSchema.parse(input)
    const chapter = await restoreVersion(db, actor, data)
    revalidateWork(chapter.workId)
    return chapter
  })
}

export async function saveResumePointAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const data = ResumePointSchema.parse(input)
    await saveResumePoint(db, actor, data)
    revalidateWork(data.workId)
  })
}

export async function getVersionAction(input: unknown): Promise<ActionResult<ChapterVersionRow>> {
  return withAction(async (db, actor) => {
    const { versionId } = VersionIdSchema.parse(input)
    return getVersion(db, actor, versionId)
  })
}

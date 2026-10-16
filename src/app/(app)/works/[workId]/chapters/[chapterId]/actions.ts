'use server'

import { z } from 'zod'
import type { ServerCopy } from '@/components/writing/writing-workspace'
import type { ActionResult } from '@/lib/result'
import { withAction } from '@/server/action-helpers'
import { getChapter } from '@/server/chapters'

const LoadChapterSchema = z.object({ chapterId: z.uuid() })

/**
 * The latest saved copy of a chapter, for the conflict dialog's "서버 원고 불러오기".
 * Viewer role or higher; the same NOT_FOUND rules as getChapter.
 */
export async function loadChapterAction(input: unknown): Promise<ActionResult<ServerCopy>> {
  return withAction(async (db, actor) => {
    const { chapterId } = LoadChapterSchema.parse(input)
    const chapter = await getChapter(db, actor, chapterId)
    return {
      title: chapter.title,
      body: chapter.body,
      version: chapter.version,
      updatedAt: chapter.updatedAt.toISOString(),
    }
  })
}

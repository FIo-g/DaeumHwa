'use server'

import { z } from 'zod'
import type { ChapterRow } from '@/db/types'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import { createChapterFromDraft, runReaderSimulation } from '@/server/ai-features'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import type { ActionResult } from '@/lib/result'

const ReaderSimulationSchema = z.object({
  chapterId: z.uuid(),
  personaIds: z.array(z.string().min(1).max(50)).max(4).optional(),
})

const CreateChapterFromDraftSchema = z.object({
  workId: z.uuid(),
  runId: z.uuid(),
  title: z.string().max(200).optional(),
})

export async function runReaderSimulationAction(
  input: unknown,
): Promise<ActionResult<{ runId: string; result: ReaderSimResult }>> {
  return withAction(async (db, actor) => {
    const data = ReaderSimulationSchema.parse(input)
    const workId = await requireRowWork(db, 'chapters', data.chapterId)
    const out = await runReaderSimulation(db, actor, data)
    revalidateWork(workId)
    return out
  })
}

export async function createChapterFromDraftAction(
  input: unknown,
): Promise<ActionResult<ChapterRow>> {
  return withAction(async (db, actor) => {
    const data = CreateChapterFromDraftSchema.parse(input)
    const chapter = await createChapterFromDraft(db, actor, data)
    revalidateWork(data.workId)
    return chapter
  })
}

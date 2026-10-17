'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/result'
import { ProofreadBodySchema } from '@/app/api/works/[workId]/chapters/shared'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  type ChapterCheckResult,
  type ProofreadSuggestion,
  runChapterCheck,
  runProofread,
} from '@/server/chapter-check'

const RunChapterCheckSchema = z.object({
  chapterId: z.uuid(),
})

// Same body rules as the proofread route (text length cap included).
const RunProofreadSchema = ProofreadBodySchema.extend({
  chapterId: z.uuid(),
})

export async function runChapterCheckAction(
  input: unknown,
): Promise<ActionResult<ChapterCheckResult>> {
  return withAction(async (db, actor) => {
    const { chapterId } = RunChapterCheckSchema.parse(input)
    const workId = await requireRowWork(db, 'chapters', chapterId)
    const result = await runChapterCheck(db, actor, { chapterId })
    revalidateWork(workId)
    return result
  })
}

export async function runProofreadAction(
  input: unknown,
): Promise<ActionResult<{ suggestions: ProofreadSuggestion[]; runId: string | null }>> {
  return withAction(async (db, actor) => {
    const data = RunProofreadSchema.parse(input)
    return runProofread(db, actor, data)
  })
}

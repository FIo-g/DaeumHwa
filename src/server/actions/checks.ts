'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/result'
import { ProofreadBodySchema } from '@/app/api/works/[workId]/chapters/shared'
import { withAction } from '@/server/action-helpers'
import { type ProofreadSuggestion, runProofread } from '@/server/chapter-check'
import { type CheckContextView, describeCheckContext } from '@/server/check-context'

const GetCheckContextSchema = z.object({
  chapterId: z.uuid(),
})

// Same body rules as the proofread route (text length cap included).
const RunProofreadSchema = ProofreadBodySchema.extend({
  chapterId: z.uuid(),
})

export async function getCheckContextAction(
  input: unknown,
): Promise<ActionResult<CheckContextView>> {
  return withAction(async (db, actor) => {
    const { chapterId } = GetCheckContextSchema.parse(input)
    return describeCheckContext(db, actor, { chapterId })
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

import { z } from 'zod'
import { previewDraftRefinement } from '@/server/draft-refine'
import { runWorkRoute } from '../../work-route'

// "다듬기" preview for a finished draft run (editor role). Runs the trim and the sentence repair,
// which can take longer than a Server Action should. Nothing is applied here: the candidate waits
// for the author's apply action.

export const runtime = 'nodejs'
export const maxDuration = 300

const RefineBodySchema = z.object({ runId: z.uuid() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, RefineBodySchema, (db, actor, input, signal) =>
    previewDraftRefinement(db, actor, { workId, runId: input.runId }, undefined, signal),
  )
}

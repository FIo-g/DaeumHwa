import { z } from 'zod'
import { inferDirectives } from '@/server/directive-infer'
import { runWorkRoute } from '../../work-route'

// Inference for one done chapter: lasting requests found in the author's edits to its AI draft.
// Runs a cheap task on the edit hunks only, so it can take longer than a Server Action should.
export const runtime = 'nodejs'
export const maxDuration = 300

const InferBodySchema = z.object({ chapterId: z.uuid() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, InferBodySchema, (db, actor, input, signal) =>
    inferDirectives(db, actor, { workId, chapterId: input.chapterId }, undefined, signal),
  )
}

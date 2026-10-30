import { z } from 'zod'
import { checkAndFixDraft } from '@/server/draft-check'
import { runWorkRoute } from '../../work-route'

// Check-and-fix for a finished draft run (editor role). Runs the code checks, one cheap AI check
// and up to two scene fixes, which can take longer than a Server Action should. Nothing is
// applied here: the candidate waits for the author's apply action.

export const runtime = 'nodejs'
export const maxDuration = 300

const CheckBodySchema = z.object({ runId: z.uuid() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, CheckBodySchema, (db, actor, input, signal) =>
    checkAndFixDraft(db, actor, { workId, runId: input.runId }, undefined, signal),
  )
}

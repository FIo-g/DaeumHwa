import { askNextQuestion } from '@/server/interview'
import { runWorkRoute } from '../../work-route'
import { assertRowInWork, NextBodySchema } from '../shared'

// Next interview question (F1) for the interview screen. Editor role. Runs longer than a Server
// Action should, so the screen calls it with fetch.

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, NextBodySchema, async (db, actor, input, signal) => {
    await assertRowInWork(db, 'interview_sessions', input.sessionId, workId)
    return askNextQuestion(db, actor, input.sessionId, undefined, signal)
  })
}

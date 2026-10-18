import { answerTurn } from '@/server/interview'
import { runWorkRoute } from '../../work-route'
import { AnswerBodySchema, assertRowInWork } from '../shared'

// Interview answer (F1): stores the answer and turns it into pending proposals. Editor role. The
// extraction call runs longer than a Server Action should, so the screen calls this with fetch.

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, AnswerBodySchema, async (db, actor, input, signal) => {
    await assertRowInWork(db, 'interview_turns', input.turnId, workId)
    return answerTurn(db, actor, input, undefined, signal)
  })
}

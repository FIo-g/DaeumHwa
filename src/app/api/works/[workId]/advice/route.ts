import { z } from 'zod'
import { runDirectionAdvice } from '@/server/ai-features'
import { runWorkRoute } from '../work-route'

// Direction advice (F12) for the advice screen. Editor role. Runs longer than a Server Action should.

export const runtime = 'nodejs'
export const maxDuration = 300

const AdviceBodySchema = z.object({})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, AdviceBodySchema, (db, actor, _input, signal) =>
    runDirectionAdvice(db, actor, { workId }, undefined, signal),
  )
}

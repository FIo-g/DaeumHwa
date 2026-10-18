import { z } from 'zod'
import { suggestStyleCard } from '@/server/ai-features'
import { runWorkRoute } from '../work-route'

// Style card suggestion (F13) for the wiki screen. Editor role. Runs longer than a Server Action should.

export const runtime = 'nodejs'
export const maxDuration = 300

const StyleSuggestBodySchema = z.object({ entryId: z.uuid() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const { workId } = await params
  return runWorkRoute(request, workId, StyleSuggestBodySchema, (db, actor, input, signal) =>
    suggestStyleCard(db, actor, { workId, entryId: input.entryId }, undefined, signal),
  )
}

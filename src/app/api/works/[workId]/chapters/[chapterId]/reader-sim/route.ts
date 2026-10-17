import { z } from 'zod'
import { runReaderSimulation } from '@/server/ai-features'
import { runChapterRoute } from '../../shared'

// Reader reactions (F11) for the writing screen. Editor role. Runs several personas, so it is slow.

export const runtime = 'nodejs'
export const maxDuration = 300

const ReaderSimBodySchema = z.object({
  personaIds: z.array(z.string().min(1).max(50)).max(4).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string; chapterId: string }> },
): Promise<Response> {
  const { workId, chapterId } = await params
  return runChapterRoute(request, { workId, chapterId }, ReaderSimBodySchema, (db, actor, input) =>
    runReaderSimulation(db, actor, { chapterId, personaIds: input.personaIds }),
  )
}

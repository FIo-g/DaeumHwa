import { z } from 'zod'
import { runChapterCheck } from '@/server/chapter-check'
import { runChapterRoute } from '../../shared'

// Chapter check (F7) for the writing screen. Editor role. Runs longer than a Server Action should.

export const runtime = 'nodejs'
export const maxDuration = 300

const CheckBodySchema = z.object({})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string; chapterId: string }> },
): Promise<Response> {
  const { workId, chapterId } = await params
  return runChapterRoute(request, { workId, chapterId }, CheckBodySchema, (db, actor) =>
    runChapterCheck(db, actor, { chapterId }),
  )
}

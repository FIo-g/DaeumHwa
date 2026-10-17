import { runProofread } from '@/server/chapter-check'
import { ProofreadBodySchema, runChapterRoute } from '../../shared'

// Proofreading (F14) for the writing screen. Editor role. The AI pass can take a while.

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string; chapterId: string }> },
): Promise<Response> {
  const { workId, chapterId } = await params
  return runChapterRoute(request, { workId, chapterId }, ProofreadBodySchema, (db, actor, input) =>
    runProofread(db, actor, { chapterId, ...input }),
  )
}

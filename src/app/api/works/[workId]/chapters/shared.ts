import { z } from 'zod'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { AppError } from '@/lib/errors'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'

// Shared body for the chapter AI route handlers. These calls run longer than a Server Action
// should block the client queue (Next dispatches Server Actions one at a time), so the writing
// panels call these routes with fetch instead. The response is the same ActionResult the
// matching server action returned, with HTTP 200 for both outcomes.

/**
 * Longest manuscript text one proofread request may carry. Longer bodies are rejected at the
 * schema, before the service runs. The AI pass has a lower cap of its own (MAX_PROOFREAD_AI_CHARS).
 */
export const PROOFREAD_TEXT_MAX_CHARS = 200_000

/** Body of the proofread route and of the matching server action. */
export const ProofreadBodySchema = z.object({
  text: z.string().max(PROOFREAD_TEXT_MAX_CHARS).optional(),
  useAi: z.boolean(),
})

/**
 * Checks the session, parses the JSON body with `schema`, verifies that the chapter belongs to
 * the work in the path, runs `fn` and refreshes the work's cached pages.
 */
export async function runChapterRoute<I, T>(
  request: Request,
  params: { workId: string; chapterId: string },
  schema: z.ZodType<I>,
  fn: (db: Db, actor: Actor, input: I) => Promise<T>,
): Promise<Response> {
  const { workId, chapterId } = params
  const result = await withAction(async (db, actor) => {
    const input = schema.parse(await request.json().catch(() => null))
    const rowWork = await requireRowWork(db, 'chapters', chapterId)
    if (rowWork !== workId) throw new AppError('NOT_FOUND', '항목을 찾을 수 없습니다.')
    const out = await fn(db, actor, input)
    revalidateWork(workId)
    return out
  })
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

import { z } from 'zod'
import type { Db } from '@/db/client'
import type { Actor } from '@/db/types'
import { revalidateWork, withAction } from '@/server/action-helpers'

// Shared body for the work-level AI route handlers. These calls run longer than a Server Action
// should block the client queue (Next dispatches Server Actions one at a time), so the panels call
// these routes with fetch instead. The response is the same ActionResult the matching server
// action returned, with HTTP 200 for both outcomes.

/**
 * Checks the session, parses the JSON body with `schema`, runs `fn` and refreshes the work's
 * cached pages. `fn` gets the request's signal, which aborts when the browser cancels or drops the
 * call.
 */
export async function runWorkRoute<I, T>(
  request: Request,
  workId: string,
  schema: z.ZodType<I>,
  fn: (db: Db, actor: Actor, input: I, signal: AbortSignal) => Promise<T>,
): Promise<Response> {
  const result = await withAction(async (db, actor) => {
    const input = schema.parse(await request.json().catch(() => null))
    const out = await fn(db, actor, input, request.signal)
    revalidateWork(workId)
    return out
  })
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

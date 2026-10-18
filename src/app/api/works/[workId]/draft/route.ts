import { z } from 'zod'
import { getDb } from '@/db/client'
import { draftErrorRecord, DRAFT_FAILED_MESSAGE } from '@/lib/draft-stream'
import { type ErrorCode, isAppError } from '@/lib/errors'
import { startDraft } from '@/server/ai-features'
import { getSessionUser } from '@/server/session'

// Streams a chapter draft as plain text. The run id comes back in the X-Run-Id header so the
// editor can turn the finished draft into a chapter later (createChapterFromDraftAction).
// The status is already 200 when the text starts, so a failure midway cannot change it. Instead the
// stream ends with an error record (see src/lib/draft-stream.ts). A client abort just closes it.

export const runtime = 'nodejs'
export const maxDuration = 300

const DraftBodySchema = z.object({
  chapterId: z.uuid().nullable().optional(),
  instructions: z.string().max(5000),
  targetChars: z.number().int().min(500).max(20000).optional(),
  entryIds: z.array(z.uuid()).max(50),
})

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_STATE: 409,
  AI_LIMIT: 429,
}

/** Closes the body. A reader that already left has nothing to receive, so a closed stream is fine. */
function finish(controller: ReadableStreamDefaultController<Uint8Array>, record?: string): void {
  try {
    if (record !== undefined) controller.enqueue(new TextEncoder().encode(record))
    controller.close()
  } catch {
    // The stream was cancelled by the client; nothing more to send.
  }
}

/** Only AppError messages are written for the author. Anything else gets the generic message. */
function failureMessage(error: unknown): string {
  return isAppError(error) ? error.message : DRAFT_FAILED_MESSAGE
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> },
): Promise<Response> {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { workId } = await params
  const parsed = DraftBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  // Aborted by the browser (request.signal) or by the body stream being cancelled.
  const abort = new AbortController()
  const stopOnRequestAbort = () => abort.abort()
  request.signal.addEventListener('abort', stopOnRequestAbort, { once: true })
  if (request.signal.aborted) abort.abort()

  try {
    const { runId, textStream, done } = await startDraft(
      getDb(),
      { userId: user.id },
      { workId, ...parsed.data },
      undefined,
      abort.signal,
    )
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of textStream) controller.enqueue(encoder.encode(chunk))
          // The ai_runs row is marked done only when `done` settles. Waiting here means that
          // once the client has read the whole body, createChapterFromDraft sees a finished run.
          await done
          finish(controller)
        } catch (error) {
          const record = abort.signal.aborted ? undefined : draftErrorRecord(failureMessage(error))
          finish(controller, record)
        }
      },
      cancel() {
        abort.abort()
      },
    })
    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Run-Id': runId,
      },
    })
  } catch (error) {
    if (isAppError(error)) {
      const status = STATUS_BY_CODE[error.code] ?? 500
      return Response.json({ error: error.message }, { status })
    }
    console.error(error)
    return Response.json({ error: '알 수 없는 오류가 발생했습니다.' }, { status: 500 })
  }
}

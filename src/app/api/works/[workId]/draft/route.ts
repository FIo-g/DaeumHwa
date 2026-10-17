import { z } from 'zod'
import { getDb } from '@/db/client'
import { type ErrorCode, isAppError } from '@/lib/errors'
import { startDraft } from '@/server/ai-features'
import { getSessionUser } from '@/server/session'

// Streams a chapter draft as plain text. The run id comes back in the X-Run-Id header so the
// editor can turn the finished draft into a chapter later (createChapterFromDraftAction).

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

  try {
    const { runId, textStream, done } = await startDraft(
      getDb(),
      { userId: user.id },
      { workId, ...parsed.data },
    )
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of textStream) controller.enqueue(encoder.encode(chunk))
          // The ai_runs row is marked done only when `done` settles. Waiting here means that
          // once the client has read the whole body, createChapterFromDraft sees a finished run.
          await done
          controller.close()
        } catch (error) {
          controller.error(error)
        }
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

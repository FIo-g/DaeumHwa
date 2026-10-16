import { getDb } from '@/db/client'
import { type ErrorCode, isAppError } from '@/lib/errors'
import { buildExportPayload } from '@/server/exports'
import { getSessionUser } from '@/server/session'

export const dynamic = 'force-dynamic'

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
}

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Owner-only whole-work backup as JSON. The browser turns it into the zip. */
export async function GET(_request: Request, ctx: { params: Promise<{ workId: string }> }) {
  const { workId } = await ctx.params
  const user = await getSessionUser()
  if (!user) return errorResponse(401, '로그인이 필요합니다.')

  try {
    const payload = await buildExportPayload(getDb(), { userId: user.id }, workId)
    return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (isAppError(e)) return errorResponse(STATUS_BY_CODE[e.code] ?? 400, e.message)
    console.error('export failed', e)
    return errorResponse(500, '백업 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
}

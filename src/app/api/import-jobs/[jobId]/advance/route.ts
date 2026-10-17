import { getDb } from '@/db/client'
import { requireWorkRole, requireRowWork } from '@/server/access'
import { advanceImportJob, BUSY_MESSAGE } from '@/server/imports'
import { getSessionUser } from '@/server/session'
import { jsonError, serviceError } from '@/app/api/import-jobs/shared'

// Processes one chapter of an import job (editor role). The import page calls this repeatedly
// while it is open when Inngest is not configured. AI calls can take a while, hence maxDuration.

export const runtime = 'nodejs'
export const maxDuration = 300
/** Pause before answering a busy chapter, so the page's retry loop does not spin on the cap. */
const BUSY_RETRY_MS = 2000

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const user = await getSessionUser()
  if (!user) return jsonError(401, '로그인이 필요합니다.')

  const { jobId } = await params
  try {
    const db = getDb()
    const workId = await requireRowWork(db, 'import_jobs', jobId)
    await requireWorkRole(db, workId, user.id, 'editor')
    const result = await advanceImportJob(db, jobId, { userId: user.id })
    if (result.status === 'running' && result.message === BUSY_MESSAGE) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS))
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serviceError(error)
  }
}

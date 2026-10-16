import { getDb } from '@/db/client'
import { getImportJob } from '@/server/imports'
import { getSessionUser } from '@/server/session'
import { jsonError, serviceError } from '@/app/api/import-jobs/shared'

// Job status for the import page (viewer role). The import page polls it after a reload.

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const user = await getSessionUser()
  if (!user) return jsonError(401, '로그인이 필요합니다.')

  const { jobId } = await params
  try {
    const job = await getImportJob(getDb(), { userId: user.id }, jobId)
    return Response.json(job, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serviceError(error)
  }
}

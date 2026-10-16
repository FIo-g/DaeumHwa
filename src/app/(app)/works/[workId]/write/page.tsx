import { redirect } from 'next/navigation'
import { hasRole } from '@/server/access'
import { guardPage, pageContext } from '@/server/page-helpers'
import { openNextChapter } from '@/server/chapters'
import { getWork } from '@/server/works'
import { getResumePoint } from '@/server/user-state'

/**
 * Entry point of 집필: goes to the chapter the user left off in, otherwise to the newest draft
 * (or a new chapter). Viewers without edit rights go to the chapter list instead.
 */
export default async function WritePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/write`)
  const work = await guardPage(() => getWork(db, actor, workId))

  const resume = await guardPage(() => getResumePoint(db, actor, workId))
  if (resume?.chapterId) redirect(`/works/${workId}/chapters/${resume.chapterId}`)

  if (!hasRole(work.role, 'editor')) redirect(`/works/${workId}/chapters`)

  const opened = await guardPage(() => openNextChapter(db, actor, workId))
  redirect(`/works/${workId}/chapters/${opened.chapterId}`)
}

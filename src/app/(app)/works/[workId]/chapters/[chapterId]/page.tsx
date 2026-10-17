import { PageHeader } from '@/components/app/page-header'
import { WritingWorkspace } from '@/components/writing/writing-workspace'
import { chapterLabel } from '@/lib/labels'
import { guardPage, pageContext } from '@/server/page-helpers'
import { loadChapterAction } from './actions'
import { loadWritingData } from './writing-data'

// The writing screen can call the AI features from its panels, which may run for a while.
export const maxDuration = 300

export default async function ChapterWritingPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>
}) {
  const { workId, chapterId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/chapters/${chapterId}`)
  const data = await guardPage(() => loadWritingData(db, actor, workId, chapterId))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={chapterLabel(data.chapter.position, data.chapter.title)}
        description={data.workTitle}
      />
      <WritingWorkspace
        key={data.chapter.id}
        data={data}
        loadServerCopy={loadChapterAction}
        userId={actor.userId}
      />
    </div>
  )
}

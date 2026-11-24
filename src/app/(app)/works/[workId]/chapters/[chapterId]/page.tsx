import { ChapterHeading } from '@/components/writing/chapter-heading'
import { SampleBanner } from '@/components/writing/sample-banner'
import { WritingWorkspace } from '@/components/writing/writing-workspace'
import { chapterLabel } from '@/lib/labels'
import { guardPage, pageContext } from '@/server/page-helpers'
import { loadChapterAction } from './actions'
import { loadWritingData } from './writing-data'

// The writing screen can call the AI features from its panels, which may run for a while.
export const maxDuration = 300

export default async function ChapterWritingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string; chapterId: string }>
  searchParams: Promise<{ demo?: string }>
}) {
  const { workId, chapterId } = await params
  const demo = (await searchParams).demo === '1'
  const { db, actor, user } = await pageContext(`/works/${workId}/chapters/${chapterId}`)
  const data = await guardPage(() => loadWritingData(db, actor, workId, chapterId))
  return (
    <div className="wg-writing-chapter">
      <ChapterHeading
        title={chapterLabel(data.chapter.position, data.chapter.title)}
        workTitle={data.workTitle}
      />
      <SampleBanner
        demo={demo}
        workId={workId}
        chapterId={data.chapter.id}
        chapterPosition={data.chapter.position}
        chapters={data.chapters}
      />
      <WritingWorkspace
        key={data.chapter.id}
        data={{ ...data, trial: user.isAnonymous }}
        loadServerCopy={loadChapterAction}
        userId={actor.userId}
        autoCheck={demo}
      />
    </div>
  )
}

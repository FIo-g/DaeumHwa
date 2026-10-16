import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'
import { VersionHistory } from '@/components/writing/version-history'
import { buttonVariants } from '@/components/ui/button'
import { AppError } from '@/lib/errors'
import { chapterLabel } from '@/lib/labels'
import { getChapter, listVersions } from '@/server/chapters'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

export default async function ChapterHistoryPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>
}) {
  const { workId, chapterId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/chapters/${chapterId}/history`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const chapter = await guardPage(async () => {
    const found = await getChapter(db, actor, chapterId)
    if (found.workId !== workId) throw new AppError('NOT_FOUND', '회차를 찾을 수 없습니다.')
    return found
  })
  const versions = await guardPage(() => listVersions(db, actor, chapterId))
  const canRestore =
    (work.role === 'owner' || work.role === 'editor') && chapter.archivedAt === null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="원고 이력"
        description={chapterLabel(chapter.position, chapter.title)}
        actions={
          <Link
            href={`/works/${workId}/chapters/${chapterId}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            집필로 돌아가기
          </Link>
        }
      />
      <VersionHistory
        workId={workId}
        chapterId={chapterId}
        currentVersion={chapter.version}
        currentBody={chapter.body}
        versions={versions}
        canRestore={canRestore}
      />
    </div>
  )
}

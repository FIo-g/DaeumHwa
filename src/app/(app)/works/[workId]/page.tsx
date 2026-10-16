import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { PageHeader } from '@/components/app/page-header'
import { NextChapterButton } from '@/components/chapters/next-chapter-button'
import { buttonVariants } from '@/components/ui/button'
import { HomePanels } from '@/components/works/home-panels'
import { hasRole } from '@/server/access'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWorkHome } from '@/server/dashboard'
import { chapterLabel } from '@/lib/labels'

export default async function WorkHomePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}`)
  const home = await guardPage(() => getWorkHome(db, actor, workId))
  const canEdit = hasRole(home.work.role, 'editor')
  const base = `/works/${workId}`
  const subtitle = [home.work.genre, home.work.logline].filter(Boolean).join(' · ')
  const isEmpty = home.chapterCount === 0 && home.entryCount === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={home.work.title}
        description={subtitle || undefined}
        actions={
          canEdit ? (
            <>
              <NextChapterButton workId={workId} />
              {home.latestDraft && (
                <Link
                  href={`${base}/chapters/${home.latestDraft.chapterId}`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  이어 쓰기: {chapterLabel(home.latestDraft.position, home.latestDraft.title)}
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      {isEmpty ? (
        <EmptyState
          title="아직 원고와 설정이 없습니다"
          description={
            canEdit
              ? '인터뷰로 설정을 정리하거나, 기존 원고를 가져오거나, 바로 쓸 수 있습니다.'
              : '작품 설정과 원고가 아직 없습니다.'
          }
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Link href={`${base}/interview`} className={buttonVariants({ variant: 'outline' })}>
                  인터뷰
                </Link>
                <Link href={`${base}/import`} className={buttonVariants({ variant: 'outline' })}>
                  가져오기
                </Link>
                <Link href={`${base}/write`} className={buttonVariants({ variant: 'outline' })}>
                  바로 쓰기
                </Link>
              </div>
            ) : undefined
          }
        />
      ) : (
        <HomePanels
          workId={workId}
          pendingCount={home.pendingCount}
          openThreads={home.openThreads}
          alerts={home.alerts}
          schedule={home.schedule}
          recentChanges={home.recentChanges}
        />
      )}
    </div>
  )
}

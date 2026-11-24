import '@/app/styles/b-works.css'
import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'
import { NextChapterButton } from '@/components/chapters/next-chapter-button'
import { buttonVariants } from '@/components/ui/button'
import { HomePanels } from '@/components/works/home-panels'
import { StartChoices } from '@/components/works/start-choices'
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
    <div className="b-works-home">
      <PageHeader
        title={home.work.title}
        description={subtitle || undefined}
        band="cream"
        actions={
          canEdit ? (
            <>
              <div className="b-works-next-chapter">
                <NextChapterButton workId={workId} />
              </div>
              {home.latestDraft && (
                <Link
                  href={`${base}/chapters/${home.latestDraft.chapterId}`}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'h-auto min-h-11 whitespace-normal wrap-anywhere',
                  })}
                >
                  이어 쓰기: {chapterLabel(home.latestDraft.position, home.latestDraft.title)}
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      {isEmpty ? (
        <section className="b-works-created" aria-labelledby="works-start">
          <h2 id="works-start" className="b-heading">
            아직 원고와 설정이 없어요
          </h2>
          <p className="b-lede">
            {canEdit ? '어디서 시작할지 골라 보세요.' : '작품 설정과 원고가 아직 없어요.'}
          </p>
          {canEdit && <StartChoices workId={workId} />}
        </section>
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

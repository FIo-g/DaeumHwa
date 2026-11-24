import Link from 'next/link'
import type { CSSProperties } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { NextChapterButton } from '@/components/chapters/next-chapter-button'
import { Sheet } from '@/components/motion'
import { HomeBlankLine, HomePanels } from '@/components/works/home-panels'
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
    <div
      className="wg-home-page"
      style={{ '--wg-home-title-length': Array.from(home.work.title).length } as CSSProperties}
    >
      <PageHeader
        title={home.work.title}
        description={subtitle || undefined}
        actions={
          canEdit ? (
            <>
              <div className="wg-home-next-chapter">
                <NextChapterButton workId={workId} />
              </div>
              {home.latestDraft && (
                <Link
                  href={`${base}/chapters/${home.latestDraft.chapterId}`}
                  className="b-link wg-home-link wrap-anywhere"
                >
                  이어 쓰기: {chapterLabel(home.latestDraft.position, home.latestDraft.title)}
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      {isEmpty ? (
        <Sheet className="wg-home-start" aria-labelledby="works-start">
          <HomeBlankLine />
          <h2 id="works-start" className="wg-home-section-title">
            아직 원고와 설정이 없어요
          </h2>
          <p className="b-lede b-muted">
            {canEdit ? '어디서 시작할지 골라 보세요.' : '작품 설정과 원고가 아직 없어요.'}
          </p>
          {canEdit && <StartChoices workId={workId} />}
        </Sheet>
      ) : (
        <HomePanels
          workId={workId}
          lastChapterPosition={home.nextPosition - 1}
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

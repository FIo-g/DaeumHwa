import type { CSSProperties } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { TrialButton } from '@/components/auth/trial-button'
import { Disclosure, PopLink } from '@/components/motion'
import { PaperStack } from '@/components/works/paper-stack'
import { ResumeBanner } from '@/components/works/resume-banner'
import { SampleWorkButton } from '@/components/works/sample-work-button'
import { WorkCard } from '@/components/works/work-card'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getResumePoint } from '@/server/user-state'
import { listWorksWithStats } from '@/server/dashboard'

type WorkStats = Awaited<ReturnType<typeof listWorksWithStats>>[number]

export default async function WorksPage() {
  const { db, actor, user } = await pageContext('/works')
  const [cards, resume] = await Promise.all([
    guardPage(() => listWorksWithStats(db, actor, { includeArchived: true })),
    getResumePoint(db, actor),
  ])
  const active = cards.filter((card) => card.work.status === 'active')
  const archived = cards.filter((card) => card.work.status === 'archived')

  return (
    <div className="b-wrap b-works-shelf">
      <PageHeader
        title="내 작품"
        band="kraft"
        actions={
          !user.isAnonymous && active.length > 0 && <PopLink href="/works/new">새 작품</PopLink>
        }
      />

      <div className="b-works-shelf-body">
        {resume && <ResumeBanner resume={resume} trial={user.isAnonymous} />}

        {active.length === 0 ? (
          <section className="b-works-empty-shelf" aria-labelledby="works-empty">
            <div className="grid content-center gap-4">
              <h2 id="works-empty" className="b-heading">
                아직 작품이 없어요
              </h2>
              {user.isAnonymous ? (
                <div>
                  <TrialButton />
                </div>
              ) : (
                <>
                  <p className="b-lede">새 작품을 만들거나 샘플 작품부터 둘러보세요.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <SampleWorkButton />
                    <PopLink href="/works/new" variant="flat">
                      새 작품 만들기
                    </PopLink>
                  </div>
                </>
              )}
            </div>
            <PaperStack variant="write" />
          </section>
        ) : (
          <WorkShelf cards={active} />
        )}

        {archived.length > 0 && (
          <Disclosure title="보관한 작품" className="b-works-archive">
            <WorkShelf cards={archived} />
          </Disclosure>
        )}
      </div>
    </div>
  )
}

function WorkShelf({ cards }: { cards: WorkStats[] }) {
  return (
    <ul className="b-works-shelf-cards">
      {cards.map(({ work, role, ...stats }, index) => (
        <li
          key={work.id}
          className="b-works-shelf-item"
          style={{ '--b-i': Math.min(index, 5) } as CSSProperties}
        >
          <WorkCard
            id={work.id}
            title={work.title}
            genre={work.genre}
            role={role}
            chapterCount={stats.chapterCount}
            pendingCount={stats.pendingCount}
            openThreadCount={stats.openThreadCount}
            alertCount={stats.alertCount}
            lastEditedAt={stats.lastEditedAt ?? work.updatedAt}
          />
        </li>
      ))}
    </ul>
  )
}

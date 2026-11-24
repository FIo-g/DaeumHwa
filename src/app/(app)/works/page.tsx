import type { CSSProperties } from 'react'
import { TrialButton } from '@/components/auth/trial-button'
import { Disclosure, GridTitle, PopLink } from '@/components/motion'
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
    <div className="b-wrap wg-works-page">
      <header className="wg-works-header">
        <div className="b-edge mb-2" aria-hidden="true">
          <span>20×10</span>
          <span>{active.length}개</span>
        </div>
        <div className="wg-works-heading">
          <GridTitle as="h1" size="page" columns={4}>
            내 작품
          </GridTitle>
          {!user.isAnonymous && active.length > 0 && <PopLink href="/works/new">새 작품</PopLink>}
        </div>
      </header>

      <div className="wg-works-index">
        {resume && <ResumeBanner resume={resume} trial={user.isAnonymous} />}

        {active.length === 0 ? (
          <section className="wg-works-empty" aria-labelledby="works-empty">
            <div className="wg-works-first-line" aria-hidden="true">
              {Array.from({ length: 20 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className="wg-works-empty-copy">
              <h2 id="works-empty" className="b-heading">
                아직 작품이 없어요
              </h2>
              {!user.isAnonymous && (
                <p className="b-lede">새 작품을 만들거나 샘플 작품부터 둘러보세요.</p>
              )}
            </div>
            {user.isAnonymous ? (
              <div className="wg-works-option">
                <TrialButton />
              </div>
            ) : (
              <ul>
                <li className="wg-works-option">
                  <SampleWorkButton />
                </li>
                <li className="wg-works-option">
                  <PopLink href="/works/new" variant="flat">
                    새 작품 만들기
                  </PopLink>
                </li>
              </ul>
            )}
          </section>
        ) : (
          <div>
            <WorkList cards={active} />
            {active.length === 1 && (
              <>
                <div className="wg-works-blank-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                {!user.isAnonymous && (
                  <div className="wg-works-blank-action">
                    <PopLink href="/works/new" variant="flat">
                      새 작품
                    </PopLink>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {archived.length > 0 && (
          <Disclosure title="보관한 작품" className="wg-works-archive">
            <WorkList cards={archived} />
          </Disclosure>
        )}
      </div>
    </div>
  )
}

function WorkList({ cards }: { cards: WorkStats[] }) {
  return (
    <ul className="wg-works-list">
      {cards.map(({ work, role, ...stats }, index) => (
        <li
          key={work.id}
          className="wg-works-entry"
          style={{ '--wg-works-order': Math.min(index, 2) } as CSSProperties}
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

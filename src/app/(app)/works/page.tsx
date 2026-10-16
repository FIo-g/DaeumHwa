import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { PageHeader } from '@/components/app/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ResumeBanner } from '@/components/works/resume-banner'
import { WorkCard } from '@/components/works/work-card'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getResumePoint } from '@/server/user-state'
import { listWorksWithStats } from '@/server/dashboard'

export default async function WorksPage() {
  const { db, actor } = await pageContext('/works')
  const [cards, resume] = await Promise.all([
    guardPage(() => listWorksWithStats(db, actor, { includeArchived: true })),
    getResumePoint(db, actor),
  ])
  const active = cards.filter((card) => card.work.status === 'active')
  const archived = cards.filter((card) => card.work.status === 'archived')

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <PageHeader
        title="내 작품"
        actions={
          <Link href="/works/new" className={buttonVariants({ variant: 'default' })}>
            새 작품
          </Link>
        }
      />

      {resume && <ResumeBanner resume={resume} />}

      {active.length === 0 ? (
        <EmptyState
          title="아직 작품이 없습니다"
          description="새 작품을 만들어 설정과 원고를 정리해 보세요."
          action={
            <Link href="/works/new" className={buttonVariants({ variant: 'outline' })}>
              새 작품 만들기
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {active.map(({ work, role, ...stats }) => (
            <li key={work.id}>
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
      )}

      {archived.length > 0 && (
        <Collapsible className="mt-8 flex flex-col gap-3">
          <CollapsibleTrigger render={<Button variant="ghost" />}>보관한 작품</CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="grid gap-4 sm:grid-cols-2">
              {archived.map(({ work, role, ...stats }) => (
                <li key={work.id}>
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
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

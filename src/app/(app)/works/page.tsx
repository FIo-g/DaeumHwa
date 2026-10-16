import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { PageHeader } from '@/components/app/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKoreanDateTime } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/labels'
import { pageContext } from '@/server/page-helpers'
import { listMyWorks } from '@/server/works'

export default async function WorksPage() {
  const { db, actor } = await pageContext('/works')
  const works = await listMyWorks(db, actor)

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
      {works.length === 0 ? (
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
          {works.map((work) => (
            <li key={work.id}>
              <Link href={`/works/${work.id}`} className="block">
                <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{work.title}</CardTitle>
                    <CardDescription>
                      {work.genre ? `${work.genre} · ` : ''}
                      {ROLE_LABEL[work.role]} · 최근 수정 {formatKoreanDateTime(work.updatedAt)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

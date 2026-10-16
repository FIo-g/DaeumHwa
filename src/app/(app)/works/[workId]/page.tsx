import { EmptyState } from '@/components/app/empty-state'
import { PageHeader } from '@/components/app/page-header'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

// Placeholder work home. T17 replaces it with the real dashboard.
export default async function WorkHomePage({
  params,
}: {
  params: Promise<{ workId: string }>
}) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}`)
  const work = await guardPage(() => getWork(db, actor, workId))
  return (
    <div className="flex flex-col">
      <PageHeader title={work.title} />
      <EmptyState title="준비 중" description="작품 홈은 곧 채워집니다." />
    </div>
  )
}

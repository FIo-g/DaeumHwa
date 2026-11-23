import Link from 'next/link'
import { PageHeader } from '@/components/app/page-header'
import { RelationGraphView } from '@/components/graph/relation-graph-view'
import { buttonVariants } from '@/components/ui/button'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getGraphViewData } from '@/server/relations'

export default async function GraphViewPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const graphPath = `/works/${workId}/wiki/graph`
  const { db, actor } = await pageContext(`${graphPath}/view`)
  const graph = await guardPage(() => getGraphViewData(db, actor, workId))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="인물 관계 그래프"
        actions={
          <Link href={graphPath} className={buttonVariants({ variant: 'outline' })}>
            기존 관계 그래프로 돌아가기
          </Link>
        }
      />
      <RelationGraphView workId={workId} {...graph} />
    </div>
  )
}

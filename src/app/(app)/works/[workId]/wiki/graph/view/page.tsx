import Link from 'next/link'
import { RelationGraphView } from '@/components/graph/relation-graph-view'
import { buttonVariants } from '@/components/ui/button'
import { SettingsBoardHeader } from '@/components/wiki/wiki-tabs'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getGraphViewData } from '@/server/relations'

export default async function GraphViewPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const graphPath = `/works/${workId}/wiki/graph`
  const { db, actor } = await pageContext(`${graphPath}/view`)
  const graph = await guardPage(() => getGraphViewData(db, actor, workId))

  return (
    <div className="flex flex-col gap-6">
      {/* The 3D view is part of the 관계 그래프 tab, so that tab stays marked. */}
      <SettingsBoardHeader workId={workId} active="graph" />
      <section aria-labelledby="graph-3d-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="graph-3d-heading" className="text-base font-semibold">
            3D 관계 그래프
          </h2>
          <Link href={graphPath} className={buttonVariants({ variant: 'outline' })}>
            3D 닫기
          </Link>
        </div>
        <RelationGraphView workId={workId} {...graph} />
      </section>
    </div>
  )
}

import { PopLink } from '@/components/motion'
import { RelationGraphView } from '@/components/graph/relation-graph-view'
import { SettingsBoardHeader } from '@/components/wiki/wiki-tabs'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getGraphViewData } from '@/server/relations'

export default async function GraphViewPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const graphPath = `/works/${workId}/wiki/graph`
  const { db, actor } = await pageContext(`${graphPath}/view`)
  const graph = await guardPage(() => getGraphViewData(db, actor, workId))

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* The 3D view is part of the 관계 그래프 tab, so that tab stays marked. */}
      <SettingsBoardHeader workId={workId} active="graph" />
      <section aria-labelledby="graph-3d-heading" className="flex flex-col gap-4">
        <div className="wg-graph-toolbar">
          <h2 id="graph-3d-heading" className="b-subhead">
            3D 관계 그래프
          </h2>
          <PopLink href={graphPath} variant="paper">
            3D 닫기
          </PopLink>
        </div>
        <RelationGraphView workId={workId} {...graph} />
      </section>
    </div>
  )
}

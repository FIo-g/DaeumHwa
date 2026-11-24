import { PopLink } from '@/components/motion'
import { RelationGraph } from '@/components/graph/relation-graph'
import { SettingsBoardHeader } from '@/components/wiki/wiki-tabs'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getGraphData } from '@/server/relations'
import { getWork } from '@/server/works'

// 관계 그래프 (F10): cards and relations, filtered by chapter in the browser.
export default async function GraphPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}/wiki/graph`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const graph = await guardPage(() => getGraphData(db, actor, workId))

  return (
    <div className="b-wiki-workspace flex min-w-0 flex-col gap-4">
      <SettingsBoardHeader workId={workId} active="graph" />
      <section aria-labelledby="graph-heading">
        <RelationGraph
          workId={workId}
          role={work.role}
          nodes={graph.nodes}
          edges={graph.edges}
          latestPosition={graph.latestPosition}
          intro={
            <div className="flex flex-col gap-1">
              <h2 id="graph-heading" className="b-wiki-section-title">
                관계 그래프
              </h2>
              <p className="b-label b-muted">회차를 넘기며 관계가 어떻게 달라지는지 봐요.</p>
            </div>
          }
          actions={
            graph.nodes.length > 0 && (
              <PopLink href={`/works/${workId}/wiki/graph/view`} variant="paper">
                3D로 보기
              </PopLink>
            )
          }
        />
      </section>
    </div>
  )
}

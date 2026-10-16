import { PageHeader } from '@/components/app/page-header'
import { RelationGraph } from '@/components/graph/relation-graph'
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
    <div className="flex flex-col">
      <PageHeader
        title="관계 그래프"
        description="회차를 옮기며 카드 사이의 관계가 어떻게 바뀌는지 봅니다."
      />
      <RelationGraph
        workId={workId}
        role={work.role}
        nodes={graph.nodes}
        edges={graph.edges}
        latestPosition={graph.latestPosition}
      />
    </div>
  )
}

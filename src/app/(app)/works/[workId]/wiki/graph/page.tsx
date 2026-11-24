import Link from 'next/link'
import { RelationGraph } from '@/components/graph/relation-graph'
import { buttonVariants } from '@/components/ui/button'
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
    <div className="flex flex-col gap-6">
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
              <h2 id="graph-heading" className="text-base font-semibold">
                관계 그래프
              </h2>
              <p className="text-sm text-muted-foreground">
                회차를 옮기며 카드 사이의 관계가 어떻게 바뀌는지 봅니다.
              </p>
            </div>
          }
          actions={
            graph.nodes.length > 0 && (
              <Link
                href={`/works/${workId}/wiki/graph/view`}
                className={buttonVariants({ variant: 'outline' })}
              >
                3D로 보기
              </Link>
            )
          }
        />
      </section>
    </div>
  )
}

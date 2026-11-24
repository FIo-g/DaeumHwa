import type { ReactNode } from 'react'
import { WorkSidebar } from '@/components/app/work-sidebar'
import { countPendingProposals } from '@/server/proposal-store'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

export default async function WorkLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workId: string }>
}) {
  const { workId } = await params
  const { db, actor } = await pageContext(`/works/${workId}`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const pendingCount = await guardPage(() => countPendingProposals(db, workId))

  return (
    <div className="flex min-w-0 flex-1 flex-col md:flex-row">
      <WorkSidebar workId={workId} workTitle={work.title} pendingCount={pendingCount} />
      <div className="min-w-0 flex-1 bg-paper px-edge py-app md:px-app">{children}</div>
    </div>
  )
}

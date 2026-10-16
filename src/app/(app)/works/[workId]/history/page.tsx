import { ChangeList } from '@/components/history/change-list'
import {
  CHANGE_TARGET_LABEL,
  HISTORY_PAGE_SIZE,
  parseChangeTarget,
  parseProposerType,
  PROPOSER_LABEL,
} from '@/components/history/history-config'
import { ExportButton } from '@/components/history/export-button'
import { FilterLinks, type FilterOption } from '@/components/history/filter-links'
import { PageHeader } from '@/components/app/page-header'
import {
  CHANGE_TARGETS,
  PROPOSER_TYPES,
  type ChangeTargetTable,
  type ProposerType,
} from '@/db/types'
import { hasRole } from '@/server/access'
import { listChanges } from '@/server/changes'
import { guardPage, pageContext } from '@/server/page-helpers'
import { getWork } from '@/server/works'

function historyHref(
  workId: string,
  target: ChangeTargetTable | undefined,
  proposer: ProposerType | undefined,
): string {
  const params = new URLSearchParams()
  if (target) params.set('target', target)
  if (proposer) params.set('proposer', proposer)
  const query = params.toString()
  return query ? `/works/${workId}/history?${query}` : `/works/${workId}/history`
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>
  searchParams: Promise<{ target?: string; proposer?: string }>
}) {
  const { workId } = await params
  const query = await searchParams
  const { db, actor } = await pageContext(`/works/${workId}/history`)
  const work = await guardPage(() => getWork(db, actor, workId))
  const canEdit = hasRole(work.role, 'editor')
  const isOwner = hasRole(work.role, 'owner')

  const targetTable = parseChangeTarget(query.target)
  const proposerType = parseProposerType(query.proposer)
  const rows = await guardPage(() =>
    listChanges(db, actor, workId, {
      targetTable,
      proposerType,
      limit: HISTORY_PAGE_SIZE,
    }),
  )

  const targetOptions: FilterOption[] = [
    { label: '전체', href: historyHref(workId, undefined, proposerType), active: !targetTable },
    ...CHANGE_TARGETS.map((value) => ({
      label: CHANGE_TARGET_LABEL[value],
      href: historyHref(workId, value, proposerType),
      active: targetTable === value,
    })),
  ]
  const proposerOptions: FilterOption[] = [
    { label: '전체', href: historyHref(workId, targetTable, undefined), active: !proposerType },
    ...PROPOSER_TYPES.map((value) => ({
      label: PROPOSER_LABEL[value],
      href: historyHref(workId, targetTable, value),
      active: proposerType === value,
    })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="변경 이력"
        actions={isOwner ? <ExportButton workId={workId} title={work.title} /> : undefined}
      />

      <div className="flex flex-col gap-3">
        <FilterLinks label="대상" options={targetOptions} />
        <FilterLinks label="제안자" options={proposerOptions} />
      </div>

      <ChangeList
        key={`${targetTable ?? 'all'}-${proposerType ?? 'all'}`}
        workId={workId}
        initialRows={rows}
        targetTable={targetTable}
        proposerType={proposerType}
        canEdit={canEdit}
      />
    </div>
  )
}
